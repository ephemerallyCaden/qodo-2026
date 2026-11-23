// The co-change lab page (#211). The system is built from the asset viewer's own factories (makePlanet,
// makeStar, makeSky, makeStars, cloud fog, debris) and the drone lab's drone, posed and depth-faded by
// the viewer's helpers, and rendered off-screen at the internal resolution. The constellation lines,
// the missing-pair flag and the stub beacon are drawn on that frame at the same resolution, before the
// nearest-neighbour upscale (raster.js); labels go on after, at output resolution, in the product's
// bitmap font. lab.mjs and the tests drive window.lab; the live page uses the same functions.
import * as THREE from 'three';
import {
  makePlanet, makeSky, makeStars, makeStar, setDepthLevel, depthLevelAt, poseWorld, applyDepth, setViewSize, setPixelSize,
  retint, resolve, renderer, camera, controls, LOOP, demoItems, fogClouds, FINAL_CLOUD_FOG, weatherShown, BIOMES, WEATHER, RING_PRESETS, frameWidth,
} from '../asset-viewer/viewer.js';
import { demoLayout, stateAt as fogStateAt, fibonacciCell, SURFACE_CELLS } from '../asset-viewer/fog-layout.js';
import { makeDrone } from '../drone-lab/drone.js';
import { droneLook, pixK } from '../asset-library/drones.js';
import { MICRO, rasterText } from '../day1-hype/font.js';
import { PLANETS, STAR, system, planetPartners, filePartnerPlanets, planetOf } from './data.js';
import { resample, span, revealAt, drawLine, drawBeads, busyMask, dilate, blockBox, drawShape } from './raster.js';
import {
  OPTIONS, option, COLOURS, C, SPACE, STARS, UI, FLAG_ROWS, FLAG_GAP, BEACON_SHAPE, BEACON_GAP, TIMELINE, GIF, focusAt,
} from './variants.js';

const DATA = system();
const W0 = 320, H0 = 180;

// ------------------------------------------------------------------ the scene
const scene = new THREE.Scene();
const sky = makeSky();
const stars = makeStars();
scene.add(sky, stars);
const star = makeStar();
star.group.position.set(...STAR.pos);
star.set({ size: STAR.size });
scene.add(star.group);

const bodies = PLANETS.map((P) => {
  const p = makePlanet();
  p.rebuild(P.seed, P.biome, P.ring ?? 'off', null, RING_PRESETS[P.ring ?? 'thin'], P.size);
  p.group.position.set(...P.pos);
  p.setExtras({ moons: P.id === 'src', artefacts: 0, lavaMode: 'layered' });
  if (P.debris) p.setDebris({ items: demoItems(P.debris, { mix: 'mixed' }), seed: P.seed });
  scene.add(p.group);
  return { P, p };
});
const byId = new Map(bodies.map((b) => [b.P.id, b]));

const drone = makeDrone();
{
  const { params, palette } = droneLook({ provider: 'claude', session: 1 });
  drone.setParams(params);
  drone.setPalette(palette);
}
const DRONE_AT = [-1.35, -0.8, 1.3]; // beside src, where an agent session is working
scene.add(drone.group);

/** The fixed camera: the whole system in frame, the star upper left, as in the viewer's system view. */
const CAMERA = { pos: [0.1, 1.9, 11.2], target: [-0.1, 0.55, -3.2] };
function placeCamera(w, h) {
  camera.position.set(...CAMERA.pos);
  camera.lookAt(new THREE.Vector3(...CAMERA.target));
  setViewSize(w, h, [sky]);
  camera.updateMatrixWorld(true);
  stars.position.copy(camera.position);
}

const RENDER = { depth: true, depthMode: 'pixel-smooth', depthBands: '3-band' };
let tinted = false;
const TMP = new THREE.Vector3();
/** Poses everything at loop time t (s): the viewer's poseWorld, the cloud fog, the drone. */
function pose(t) {
  if (applyDepth(RENDER) || !tinted) { retint(scene); tinted = true; }
  poseWorld(t, { planets: bodies.map((b) => b.p), suns: [star], spin: true });
  for (const { P, p } of bodies) {
    if (!P.fog) continue;
    const { planet, foot } = demoLayout('src', P.seed);
    p.setFogClouds(fogClouds(planet, foot, fogStateAt(planet, { coverage: P.fog, t }), FINAL_CLOUD_FOG));
    p.parts.sky.visible = weatherShown(FINAL_CLOUD_FOG, WEATHER[BIOMES[P.biome].weather]?.ramp ?? null);
  }
  drone.group.position.set(...DRONE_AT);
  drone.update(t, { yaw: -0.6, motion: true, smoke: true, pixK: pixK(H0) });
  setDepthLevel(stars, 0);
  setDepthLevel(sky, 0);
  for (const o of [...bodies.map((b) => b.p.group), star.group]) setDepthLevel(o, depthLevelAt(camera.position.distanceTo(o.getWorldPosition(TMP)), RENDER));
}

let rt = null, px = null;
/** The scene at loop time t: RGBA rows top-down, w×h. */
function renderScene(t, w = W0, h = H0) {
  if (!rt || rt.width !== w || rt.height !== h) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    px = new Uint8Array(w * h * 4);
  }
  placeCamera(w, h);
  pose(t);
  renderer.setRenderTarget(rt);
  renderer.setClearColor(resolve('space'));
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  renderer.setRenderTarget(null);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}

// ------------------------------------------------------------------ geometry on screen
/** A world point -> { x, y } in px (top-down) of a w×h frame, and its camera distance. */
function toScreen(v, w, h) {
  const s = v.clone().project(camera);
  return { x: ((s.x + 1) / 2) * w, y: ((1 - s.y) / 2) * h, z: s.z, d: camera.position.distanceTo(v) };
}
/** Each body's disc on screen: { x, y, r, d } (r from its radius at its distance). */
function discOf(centre, radius, w, h) {
  const s = toScreen(centre, w, h);
  const f = h / 2 / Math.tan(((camera.fov / 2) * Math.PI) / 180);
  return { ...s, r: (radius * f) / s.d };
}
const centreOf = (id) => byId.get(id).p.group.getWorldPosition(new THREE.Vector3());
/** A file's settlement on its planet's surface (the spinning surface's frame), in world space. */
function settlementOf(file) {
  const { p } = byId.get(planetOf(file));
  return new THREE.Vector3(...fibonacciCell(DATA.cells.get(file), SURFACE_CELLS)).applyMatrix4(p.parts.surface.matrixWorld);
}

/** The 3D path of a line (world points): straight, or for 'arc' a quadratic bow outward, away from the star, by `bow` x the chord at its apex. */
function path3(a, b, opt) {
  if (opt.path !== 'arc') return [a, b];
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const ab = b.clone().sub(a);
  const chord = ab.length();
  ab.normalize();
  const n = mid.clone().sub(new THREE.Vector3(...STAR.pos));
  n.sub(ab.clone().multiplyScalar(n.dot(ab)));
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
  const apex = mid.clone().add(n.normalize().multiplyScalar(opt.bow * chord));
  const ctrl = apex.clone().multiplyScalar(2).sub(mid); // a quadratic's midpoint is (a + 2 ctrl + b) / 4
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const u = i / 64, k0 = (1 - u) ** 2, k1 = 2 * u * (1 - u), k2 = u * u;
    pts.push(a.clone().multiplyScalar(k0).add(ctrl.clone().multiplyScalar(k1)).add(b.clone().multiplyScalar(k2)));
  }
  return pts;
}

// ------------------------------------------------------------------ what's drawn for a focus
/**
 * The lines for a focus ({ planet } or { planet, file }), strongest first: { from, to, step, strength,
 * a, b (world points), same (one planet), files (partner files, for labels) }.
 */
function linesFor(focus) {
  if (!focus) return [];
  if (!focus.file) {
    return planetPartners(DATA.pairs, focus.planet).map((q) => ({ from: focus.planet, to: q.planet, step: q.step, strength: q.strength, a: centreOf(focus.planet), b: centreOf(q.planet), files: [] }));
  }
  return filePartnerPlanets(DATA.pairs, focus.file).map((g) => ({
    from: focus.planet, to: g.planet, step: g.step, strength: g.strength, same: g.planet === focus.planet,
    a: settlementOf(focus.file), b: settlementOf(g.files[0].file), files: g.files,
  }));
}

/** Whether a flag's pair is in the focus (its text shows then): its own planet, or its X's planet or file. */
const flagInFocus = (f, focus) => !!focus && (focus.planet === planetOf(f.file) || focus.file === f.with || (!focus.file && focus.planet === planetOf(f.with)));

const shortName = (file) => file.split('/').slice(-2).join('/');
const fontPx = (scale) => Math.max(1, Math.floor(scale / 2)); // web/src/labels/overlay.ts fontScale
/** A label's width in internal px at an output scale. */
const textW = (text, scale) => (rasterText(text, MICRO).w * fontPx(scale)) / scale;
/** A flag's two lines of text: the left-out file, and the file it usually changes with. */
const flagText = (f) => [f.file, `usually changes with ${f.with}`];

/**
 * Labels in internal px: { text, x, y (top of the text), align, colour, box } where box is the label's
 * backing (one font px of padding), as web/src/labels/overlay.ts draws it. Font px = fontPx(scale)
 * device px = fontPx(scale) / scale internal px.
 */
function labelsFor(cell, discs, flags) {
  const u = fontPx(cell.scale) / cell.scale; // one font px in internal px
  const lh = (MICRO.height + 2) * u;
  const out = [];
  const widthOf = (text) => rasterText(text, MICRO).w * u;
  const add = (text, x, y, align, colour) => {
    const tw = widthOf(text);
    // centred under its disc, or from its left edge ('right': ending at x); kept inside the frame (as overlay.ts's clear())
    const x0 = Math.min(Math.max(align === 'centre' ? x - tw / 2 : align === 'right' ? x - tw : x, 2 * u), cell.w - tw - 2 * u);
    out.push({ text, x: x0, y, colour, box: { x: x0 - u, y: y - u, w: tw + 2 * u, h: (MICRO.height + 1) * u } });
  };
  const focus = cell.focus;
  const lines = cell.lines;
  for (const { P } of bodies) {
    const d = discs.get(P.id);
    if (d.x < -d.r || d.x > cell.w + d.r || d.y < -d.r || d.y > cell.h + d.r) continue;
    let y = d.y + d.r + 2 * u;
    const focused = focus?.planet === P.id;
    add(P.id, d.x, y, 'centre', focused && !focus.file ? UI.accent : UI.ink);
    y += lh;
    if (focused && focus.file) {
      add(shortName(focus.file), d.x, y, 'centre', UI.accent);
      y += lh;
    }
    if (!cell.fileLabels || !focus?.file) continue;
    for (const l of lines.filter((x) => x.to === P.id)) {
      for (const f of l.files) { add(`${l.same ? 'with ' : ''}${shortName(f.file)}`, d.x, y, 'centre', UI.dim); y += lh; }
    }
  }
  for (const f of flags) {
    if (!flagInFocus(f, focus)) continue;
    const x = f.right ? f.box.x + f.box.w + 2 : f.box.x - 2, y = f.box.y + f.box.h / 2 - lh + u;
    flagText(f).forEach((line, k) => add(line, x, y + k * lh, f.right ? 'left' : 'right', k ? UI.dim : UI.ink));
  }
  return out;
}

const DEFAULTS = { option: 'A', focus: null, t: 4, since: 3, reduced: false, freeze: null, w: W0, h: H0, scale: 4, labels: true, flags: true, beacons: true, fileLabels: true };
const FREE = [SPACE, ...STARS]; // empty space and the starfield: the only pixels a line may take

/**
 * One frame of a cell: the scene, then the overlay. Returns { scene, final, ov, labels, discs, lines,
 * flags, stats } with RGBA frames at the internal resolution. cell: DEFAULTS plus option, focus, t
 * (loop time), since (s since the focus), reduced (draw-in at once, beads held at `freeze` or t).
 */
function frameOf(raw, sceneImg = null) {
  const cell = { ...DEFAULTS, ...raw };
  const { w, h } = cell;
  const opt = option(cell.option);
  const t = cell.reduced && cell.freeze !== null ? cell.freeze : cell.t;
  const img = sceneImg ?? renderScene(t, w, h); // a given scene was rendered (and posed) at t
  const discs = new Map(bodies.map(({ P }) => [P.id, discOf(centreOf(P.id), P.size, w, h)]));
  const starDisc = discOf(new THREE.Vector3(...STAR.pos), STAR.size * 1.35, w, h);
  const ov = new Uint8Array(w * h);
  // markers: the beacon above its planet's disc, the flags right of theirs
  const markers = [];
  if (cell.beacons) for (const { P } of bodies.filter((b) => b.P.beacon)) {
    const d = discs.get(P.id);
    markers.push({ rows: BEACON_SHAPE, x: Math.round(d.x - BEACON_SHAPE[0].length / 2), y: Math.round(d.y - d.r - BEACON_GAP - BEACON_SHAPE.length), colours: { R: C.beaconRim, C: C.beaconCore, M: C.beaconMast } });
  }
  // a flag stands beside its planet's disc at mid height, on the side with room for its text (fixed per
  // layout, so it doesn't jump when the text comes and goes); the text goes beyond the glyph
  const fw = FLAG_ROWS[0].length, fh = FLAG_ROWS.length;
  const flags = (cell.flags ? DATA.flags : []).map((f) => {
    const d = discs.get(planetOf(f.file));
    const right = d.x + d.r + FLAG_GAP + fw + 2 + Math.max(...flagText(f).map((l) => textW(l, cell.scale))) + 1 <= w;
    const box = { x: Math.round(right ? d.x + d.r + FLAG_GAP : d.x - d.r - FLAG_GAP - fw), y: Math.round(d.y - fh / 2), w: fw, h: fh };
    markers.push({ rows: FLAG_ROWS, x: box.x, y: box.y, colours: { '#': C.teal, R: C.tealHi } });
    return { ...f, box, right };
  });
  const lines = linesFor(cell.focus);
  const labels = cell.labels ? labelsFor({ ...cell, lines }, discs, flags) : [];
  // the mask: anything that isn't empty space, grown 1 px, and every label and marker box with a 1 px gap
  const blocked = dilate(busyMask(img, w, h, FREE), w, h, 1);
  for (const l of labels) blockBox(blocked, w, h, l.box, 1);
  for (const m of markers) blockBox(blocked, w, h, { x: m.x, y: m.y, w: m.rows[0].length, h: m.rows.length }, 1);
  // lines: drawn weakest first so a stronger one wins where two meet; drawn in strongest first
  const since = cell.since;
  const ranked = lines.map((l, rank) => ({ ...l, rank }));
  let stamps = 0;
  const drawn = [];
  for (const l of [...ranked].sort((x, y) => x.strength - y.strength || y.rank - x.rank)) {
    if (l.same) continue; // a partner on the focused file's own planet is named in its label stack, not drawn
    const pts = path3(l.a, l.b, opt).map((v) => toScreen(v, w, h));
    const samples = resample(pts, 1);
    const sp = span(samples, discs.get(l.from), discs.get(l.to));
    const reveal = revealAt(since, l.rank, { reduced: cell.reduced });
    const st = opt.steps[l.step];
    const n = drawLine(ov, blocked, w, h, samples, sp, st, reveal);
    stamps += n;
    drawn.push({ from: l.from, to: l.to, rank: l.rank, step: l.step, strength: l.strength, same: !!l.same, reveal, stamps: n, samples, sp });
  }
  if (opt.steps.some((s) => s.beads)) {
    for (const l of drawn) {
      const b = opt.steps[l.step].beads;
      const u = ((t / opt.beadPeriod) % 1 + 1) % 1;
      stamps += drawBeads(ov, blocked, w, h, l.samples, l.sp, { w: opt.steps[l.step].w, ...b, u: u + l.rank * 0.17 }, l.reveal);
    }
  }
  for (const m of markers) drawShape(ov, w, h, m.rows, m.x, m.y, m.colours);
  const final = new Uint8ClampedArray(img);
  for (let i = 0; i < w * h; i++) {
    if (!ov[i]) continue;
    const c = COLOURS[ov[i]];
    final[4 * i] = parseInt(c.slice(1, 3), 16); final[4 * i + 1] = parseInt(c.slice(3, 5), 16); final[4 * i + 2] = parseInt(c.slice(5, 7), 16); final[4 * i + 3] = 255;
  }
  return {
    cell, scene: img, final, ov, labels, discs: Object.fromEntries(discs), starDisc, flags,
    lines: drawn.map(({ samples, ...l }) => l), stamps, blocked,
  };
}

// ------------------------------------------------------------------ output: upscale + labels
/** The frame upscaled by `scale` (nearest) with the labels drawn on at output resolution: a canvas. */
function compose(fr) {
  const { w, h, scale } = fr.cell;
  const src = Object.assign(document.createElement('canvas'), { width: w, height: h });
  src.getContext('2d').putImageData(new ImageData(fr.final, w, h), 0, 0);
  const cv = Object.assign(document.createElement('canvas'), { width: w * scale, height: h * scale });
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, w * scale, h * scale);
  const fp = fontPx(scale);
  for (const l of fr.labels) {
    const m = rasterText(l.text, MICRO);
    const x0 = Math.round(l.x * scale), y0 = Math.round(l.y * scale);
    ctx.fillStyle = UI.space;
    ctx.fillRect(x0 - fp, y0 - fp, (m.w + 2) * fp, (m.h + 1) * fp);
    ctx.fillStyle = l.colour;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.on(x, y)) ctx.fillRect(x0 + x * fp, y0 + y * fp, fp, fp);
  }
  return cv;
}

const b64 = (img) => {
  let s = '';
  for (let i = 0; i < img.length; i += 0x8000) s += String.fromCharCode(...img.subarray(i, i + 0x8000));
  return btoa(s);
};
const raw = (data, w, h) => ({ w, h, b64: b64(data) });
const rgbaOf = (cv) => new Uint8Array(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.buffer);

/**
 * Frames of a cell for the tests and the runner: modes 'final' and 'scene' (internal RGBA), 'ov' (the
 * overlay's colour index in R), 'composed' (upscaled with labels). Also { lines, flags, labels, discs, stamps }.
 */
function frames(cell, modes = ['final']) {
  const fr = frameOf(cell);
  const { w, h } = fr.cell;
  const out = { lines: fr.lines, flags: fr.flags.map(({ box, ...f }) => ({ ...f, box })), labels: fr.labels.map(({ text, box, colour }) => ({ text, box, colour })), discs: fr.discs, starDisc: fr.starDisc, stamps: fr.stamps };
  for (const m of modes) {
    if (m === 'final') out.final = raw(fr.final, w, h);
    if (m === 'scene') out.scene = raw(fr.scene, w, h);
    if (m === 'blocked') out.blocked = raw(Uint8Array.from(fr.blocked, (v) => v * 255), w, h);
    if (m === 'ov') { const o = new Uint8Array(w * h * 4); fr.ov.forEach((v, i) => { o[4 * i] = v; o[4 * i + 3] = 255; }); out.ov = raw(o, w, h); }
    if (m === 'composed') { const cv = compose(fr); out.composed = raw(rgbaOf(cv), cv.width, cv.height); }
  }
  return out;
}

/** A 1280×720 still (PNG data URL) of a cell. */
const still = (cell) => compose(frameOf({ scale: 4, ...cell })).toDataURL('image/png');

/** GIF frame k (of GIF.fps per s) for each option: the scene rendered once, each option drawn on it. */
function gifFrame(k, options = OPTIONS.map((o) => o.id), extra = {}) {
  const tau = k / GIF.fps;
  const key = focusAt(tau);
  const t = GIF.t0 + tau;
  const img = renderScene(t);
  return options.map((id) => {
    const fr = frameOf({ option: id, focus: key.focus, t, since: tau - key.at, scale: 2, ...extra }, img);
    return raw(rgbaOf(compose(fr)), W0 * 2, H0 * 2);
  });
}

// ------------------------------------------------------------------ the comparison sheet
const SHEET = { bg: '#0d0b16', text: '#e6e0ee', dim: '#a99cbf', head: '#fff6e4', font: '13px ui-monospace, Menlo, monospace' };
/** Where a crop centres: a planet's disc, the drone, or a flag (between its glyph and its disc). */
function centreFor(fr, target) {
  if (target === 'drone') return toScreen(new THREE.Vector3(...DRONE_AT), fr.cell.w, fr.cell.h);
  if (target === 'flag') {
    const f = fr.flags[0], d = fr.discs[planetOf(f.file)];
    return { x: (f.box.x + f.box.w / 2 + d.x) / 2, y: d.y };
  }
  return fr.discs[target];
}

/**
 * A sheet: { title, notes: [lines], rows: [{ label, cells: [{ cell, caption, crop?: { around, w, h } (internal px), scale }] }] }.
 * Each cell is composed with its labels; a crop is a w×h window round a body (centreFor), inside the frame.
 */
function sheet(spec) {
  const gap = 10, labelW = spec.labelW ?? 150, notes = spec.notes ?? [];
  const headH = 34 + notes.length * 16;
  const rows = spec.rows.map((r) => r.cells.map((c) => {
    const scale = c.scale ?? 2;
    const fr = frameOf({ ...c.cell, scale });
    const cv = compose(fr);
    if (!c.crop) return { cv, caption: c.caption };
    const at = centreFor(fr, c.crop.around);
    const cx = Math.min(Math.max(Math.round(at.x - c.crop.w / 2), 0), fr.cell.w - c.crop.w);
    const cy = Math.min(Math.max(Math.round(at.y - c.crop.h / 2), 0), fr.cell.h - c.crop.h);
    const [x, y, cw, ch] = [cx, cy, c.crop.w, c.crop.h].map((v) => v * scale);
    const d = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    d.getContext('2d').drawImage(cv, x, y, cw, ch, 0, 0, cw, ch);
    return { cv: d, caption: c.caption };
  }));
  const cols = Math.max(...rows.map((r) => r.length));
  const colW = Array.from({ length: cols }, (_, j) => Math.max(...rows.map((r) => r[j]?.cv.width ?? 0)));
  const capH = (r) => 6 + 15 * Math.max(0, ...r.map((c) => String(c.caption ?? '').split('\n').filter(Boolean).length));
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.cv.height)) + capH(r));
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = SHEET.font;
  const textW = Math.max(...[spec.title, ...notes].map((t) => measure.measureText(t).width)) + 2 * gap;
  const W = Math.ceil(Math.max(textW, labelW + colW.reduce((s, x) => s + x + gap, 0))), H = headH + rowH.reduce((s, x) => s + x + gap, 0);
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = SHEET.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.font = SHEET.font;
  ctx.textBaseline = 'top';
  ctx.fillStyle = SHEET.head;
  ctx.fillText(spec.title, gap, 8);
  notes.forEach((n, k) => { ctx.fillStyle = SHEET.dim; ctx.fillText(n, gap, 28 + k * 16); });
  let y = headH;
  rows.forEach((r, i) => {
    ctx.fillStyle = SHEET.text;
    String(spec.rows[i].label).split('\n').forEach((line, k) => ctx.fillText(line, gap, y + 4 + k * 16));
    let x = labelW;
    r.forEach((c, j) => {
      ctx.drawImage(c.cv, x, y);
      String(c.caption ?? '').split('\n').filter(Boolean).forEach((line, k) => { ctx.fillStyle = SHEET.dim; ctx.fillText(line, x, y + c.cv.height + 4 + k * 15); });
      x += colW[j] + gap;
    });
    y += rowH[i] + gap;
  });
  return cv.toDataURL('image/png');
}

/** The data, for reports and tests. */
const info = () => ({
  planets: PLANETS.map((P) => ({ id: P.id, partners: planetPartners(DATA.pairs, P.id) })),
  pairs: DATA.pairs, flags: DATA.flags, timeline: TIMELINE, options: OPTIONS,
});

// ------------------------------------------------------------------ live page
function bindLive() {
  const $ = (id) => document.getElementById(id);
  const fill = (sel, opts) => opts.forEach(([v, l]) => sel.add(new Option(l, v)));
  fill($('opt'), OPTIONS.map((o) => [o.id, `${o.id} · ${o.name}`]));
  fill($('focus'), [['', 'nothing'], ...PLANETS.map((P) => [P.id, `planet ${P.id}`]), ...DATA.flags.map((f) => [`file:${f.with}`, `file ${f.with}`])]);
  const reducedPref = matchMedia('(prefers-reduced-motion: reduce)');
  const st = { option: 'A', focus: null, focusAt: 0, t: 4, play: true, reduced: reducedPref.matches, freeze: null };
  $('reduced').checked = st.reduced;
  const setFocus = (v) => {
    st.focus = !v ? null : v.startsWith('file:') ? { planet: planetOf(v.slice(5)), file: v.slice(5) } : { planet: v };
    st.focusAt = st.t;
    $('focus').value = v ?? '';
  };
  $('opt').addEventListener('change', (e) => { st.option = e.target.value; st.focusAt = st.t; });
  $('focus').addEventListener('change', (e) => setFocus(e.target.value));
  $('play').addEventListener('change', (e) => { st.play = e.target.checked; });
  $('reduced').addEventListener('change', (e) => { st.reduced = e.target.checked; st.freeze = st.reduced ? st.t : null; });
  const out = $('out');
  const ctx = out.getContext('2d');
  // click a planet to focus it; click empty space to clear
  out.addEventListener('click', (e) => {
    const r = out.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W0, y = ((e.clientY - r.top) / r.height) * H0;
    placeCamera(W0, H0);
    const hit = bodies.map(({ P }) => ({ id: P.id, d: discOf(centreOf(P.id), P.size, W0, H0) }))
      .filter((b) => Math.hypot(b.d.x - x, b.d.y - y) <= b.d.r + 2).sort((a, b) => a.d.d - b.d.d)[0];
    setFocus(hit ? hit.id : '');
  });
  let last = null;
  const live = () => {
    const now = performance.now() / 1000; // playback only: every frame is rendered at a pinned time
    if (st.play && !st.reduced && last !== null) st.t += now - last;
    last = now;
    const scale = Math.max(1, Math.floor(Math.min((innerWidth - 300) / W0, innerHeight / H0)));
    const fr = frameOf({ option: st.option, focus: st.focus, t: st.t, since: st.t - st.focusAt, reduced: st.reduced, freeze: st.freeze, scale });
    const cv = compose(fr);
    out.width = cv.width;
    out.height = cv.height;
    ctx.drawImage(cv, 0, 0);
    $('status').textContent = `t ${st.t.toFixed(1)} s · ${fr.lines.length} lines · ${fr.flags.length} flag`;
    requestAnimationFrame(live);
  };
  requestAnimationFrame(live);
}

setPixelSize(W0, H0, [sky]);
controls.enabled = false;
window.lab = { ready: true, frames, still, gifFrame, sheet, info, OPTIONS, GIF };
if (!new URLSearchParams(location.search).has('capture')) bindLive();
