// The fog lab page. Scenes are built from the asset viewer's own factories (makePlanet with the fog
// hook, makeSky, makeStars, makeAstronaut, the planet's debris), posed and depth-tinted by its own
// helpers; the drone is the drone lab's own (makeDrone, mapped as the asset library maps it).
// Tiles render off-screen at the internal resolution; lab.mjs and the tests drive window.lab, and
// the live page (index.html) uses the same functions.
import * as THREE from 'three';
import {
  makePlanet, makeSky, makeStars, makeAstronaut, setDepthLevel, depthLevelAt, poseWorld, applyDepth,
  setViewSize, setPixelSize, retint, resolve, renderer, camera, controls, VIEWS, CREW_SPOT, CONTRIBUTOR_KEYS, frameWidth,
  LOOP, PALETTES, usePalette, demoItems,
} from '../asset-viewer/viewer.js';
import { eyesFor } from '../asset-viewer/faces.js';
import { makeDrone } from '../drone-lab/drone.js';
import { droneLook, pixK } from '../asset-library/drones.js';
import { fogSpec } from './fog.js';
import { driveFog } from '../asset-viewer/fog.js';
import { mockPlanet, footprint, stateAt, cellData, COVERAGES, FOOTPRINTS, EVENT } from './mock.js';
import { DIRECTIONS, LOOKS } from './variants.js';
import { fibonacciCell, SURFACE_CELLS } from './surface.js';

// The emissive sentinel (health-looks' SENTINEL): the glow ramp swapped for colours no planet uses,
// so the pixels that change are the ones the glow painted (fogged glow included: fstep walks the
// sentinel ramp the same way).
PALETTES['fog-sentinel'] = { ...PALETTES.final, glow: ['#00ff00', '#00ff80', '#00ffff'], name: 'glow sentinel' };

// One fogged planet, the viewer's crew line-up and a drone, reconfigured per tile.
const scene = new THREE.Scene();
const sky = makeSky();
const stars = makeStars();
const spec = fogSpec();
const planet = makePlanet({ fog: spec });
scene.add(sky, stars, planet.group);
const crew = CONTRIBUTOR_KEYS.map((key, i) => {
  const a = makeAstronaut(key);
  a.group.position.set(CREW_SPOT.x + (i - 1) * 0.72, CREW_SPOT.y, CREW_SPOT.z);
  a.group.rotation.y = [0.4, 0.05, -0.4][i];
  a.group.userData.phase = i * 1.7;
  a.setFace(eyesFor({ coral: '@caden', mint: '@mira', lilac: '@juno' }[key]));
  scene.add(a.group);
  return a;
});
const drone = makeDrone();
{
  const { params, palette } = droneLook({ provider: 'claude', session: 1 });
  drone.setParams(params);
  drone.setPalette(palette);
}
scene.add(drone.group);

// Framings, all on the viewer's hero view line (VIEWS.planet), so the light falls the same way.
const HERO = VIEWS.planet;
const HERO_D = Math.hypot(...HERO.pos);
const along = (d, target = [0, 0, 0]) => ({ pos: HERO.pos.map((x, i) => (x * d) / HERO_D + target[i]), target });
const FRAMINGS = {
  hero: { pos: HERO.pos, target: HERO.target },
  close: along(HERO_D / 2.4, [0, 0.25, 0]),
  scene: along(HERO_D * 1.25, [0.25, 0.05, 0]),
  crew: { pos: VIEWS.depth.pos, target: VIEWS.depth.target },
};
const cameraOf = (cam) => (typeof cam === 'string' ? FRAMINGS[cam] : cam.d ? along(cam.d, cam.target) : cam);

const DEFAULTS = {
  dir: 'A', biome: 'lush', seed: 7, size: 1, planet: 'src', layoutSeed: 1, coverage: 0.5, fogged: null, footprint: 'territory', reasons: false,
  events: [], moonEvents: [], t: 3, cam: 'hero', w: 320, h: 180, moons: true, artefacts: false, debris: 0, crew: false, drone: false,
  clouds: true, depth: true, fog: true, spin: true, freezeAt: null,
};
const mocks = new Map();
/** A cell (one tile) in full: every default filled in, plus its mock planet and footprint. */
function full(raw) {
  const c = { ...DEFAULTS, ...raw };
  const key = `${c.planet}|${c.layoutSeed}|${c.footprint}`;
  if (!mocks.has(key)) {
    const mock = mockPlanet(c.planet, c.layoutSeed);
    mocks.set(key, { mock, foot: footprint(mock, c.footprint) });
  }
  return { ...c, ...mocks.get(key) };
}

/**
 * Render modes. 'final' is the cell as asked. The rest are for measuring: 'nofog' (the fog hook's
 * own off switch), 'mask' (fog stages as flat colours, depth off, no clouds or moons), 'ids' (grid
 * cell ids), 'empty' (no planet), 'sentinel' / 'nofog-sentinel' (the glow sentinel palette), 'flat'
 * and 'nofog-flat' (depth off), 'puffs-off' (no cloud puffs, depth off: the clouds' own pixels),
 * 'art-off' (artefacts off, depth off).
 */
const MODES = {
  final: {}, nofog: { fog: false }, mask: { debug: 1, depth: false, clouds: false, moons: false }, ids: { debug: 2, depth: false, clouds: false, moons: false },
  'mask-clouds': { debug: 1, depth: false }, empty: { planet: false, drone: false, crew: false },
  sentinel: { palette: 'fog-sentinel' }, 'nofog-sentinel': { fog: false, palette: 'fog-sentinel' },
  flat: { depth: false }, 'nofog-flat': { fog: false, depth: false }, 'puffs-off': { fog: false, depth: false, puffs: false },
  'art-off': { fog: false, depth: false, artefacts: false }, 'art-off-fog': { depth: false, artefacts: false },
};

let configured = '';
function configure(c) {
  const key = JSON.stringify([c.biome, c.seed, c.size, c.debris]);
  if (key !== configured) {
    configured = key;
    planet.rebuild(c.seed, c.biome, 'off', null, undefined, c.size);
    planet.setDebris(c.debris ? { items: demoItems(c.debris, { mix: 'mixed' }), seed: c.seed } : null);
  }
}

function layers(c, m) {
  planet.group.visible = m.planet !== false;
  planet.parts.sky.visible = c.clouds && m.clouds !== false;
  planet.parts.sky.children[0].visible = m.puffs !== false; // the puffs; [1] is their shadow on the ground
  planet.setExtras({ moons: c.moons && m.moons !== false, artefacts: c.artefacts && m.artefacts !== false ? 'auto' : 0, lavaMode: 'layered' });
  for (const a of crew) a.group.visible = c.crew && m.crew !== false;
  drone.group.visible = !!c.drone && m.drone !== false;
}

function placeCamera(cam) {
  const v = cameraOf(cam);
  camera.position.set(...v.pos);
  camera.lookAt(new THREE.Vector3(...v.target));
  camera.updateMatrixWorld(true);
}

const wrap = (x) => ((x % 1) + 1) % 1;
/** The cell a file's footprint is drawn and fronted from (mock.js footprint's anchor). */
const anchorOf = (c, id) => c.foot.anchor[c.mock.files.findIndex((f) => f.id === id)];
/** The fog's uniforms and cell texture for a cell at time t (the viewer's driveFog, plus A's per-reason switch). */
function applyFog(c, t, m) {
  spec.uniforms.uFogReasons.value = c.reasons ? 1 : 0;
  return driveFog(spec, {
    layout: { planet: c.mock, foot: c.foot }, coverage: c.coverage, fogged: c.fogged, events: c.events, moonEvents: c.moonEvents,
    t, period: LOOP.period, look: c.dir, on: c.fog && m.fog !== false, debug: m.debug ?? 0,
  });
}

const TMP = new THREE.Vector3();
function pose(c, t, render) {
  stars.position.copy(camera.position);
  poseWorld(t, { planets: [planet], astronauts: c.crew ? crew : [], spin: c.spin, lavaTime: c.freezeAt });
  if (c.freezeAt !== null) {
    // hold the surface, clouds and lava where they were at freezeAt; the ambient fog and the artefact ticks keep time
    const ph = wrap(c.freezeAt / LOOP.period) * Math.PI * 2;
    planet.parts.surface.parent.rotation.y = -ph * LOOP.surfaceTurns;
    planet.parts.sky.rotation.y = -ph * LOOP.cloudTurns;
    planet.group.updateMatrixWorld(true);
    planet.parts.sky.children[1].material.uniforms.uToSurface.value.copy(planet.parts.surface.matrixWorld).invert(); // the cloud shadow's frame
  }
  setDepthLevel(stars, 0);
  setDepthLevel(sky, 0);
  setDepthLevel(planet.group, depthLevelAt(camera.position.distanceTo(planet.group.getWorldPosition(TMP)), render));
  for (const a of crew) if (a.group.visible) setDepthLevel(a.group, depthLevelAt(camera.position.distanceTo(a.group.getWorldPosition(TMP)), render));
  if (c.drone) {
    drone.group.position.set(...(c.drone.pos ?? [1.25, 0.62, 1.6]));
    drone.update(t, { yaw: c.drone.yaw ?? -0.5, motion: true, smoke: true, pixK: pixK(c.h) });
  }
}

let rt = null, px = null, palette = 'final', lastPixel = null;
function capture(w, h) {
  if (!rt || rt.width !== w || rt.height !== h) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    px = new Uint8Array(w * h * 4);
  }
  setViewSize(w, h, [sky]);
  spec.view.value.set(w, h);
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

function usePal(name) {
  if (name === palette) return;
  palette = name;
  usePalette(name);
  retint(scene);
}

/** One render of a cell in a mode (MODES) at time t: RGBA rows top-down. */
function shot(c, mode = 'final', t = c.t) {
  const m = MODES[mode];
  configure(c);
  layers(c, m);
  usePal(m.palette ?? 'final');
  const render = { depth: c.depth && m.depth !== false, depthMode: 'pixel-smooth', depthBands: '3-band' };
  if (applyDepth(render) || lastPixel === null) retint(scene);
  lastPixel = render.depthMode;
  placeCamera(c.cam);
  pose(c, t, render);
  applyFog(c, t, m);
  return capture(c.w, c.h);
}

const b64 = (img) => {
  let s = '';
  for (let i = 0; i < img.length; i += 0x8000) s += String.fromCharCode(...img.subarray(i, i + 0x8000));
  return btoa(s);
};
/** Raw RGBA frames (base64) of one cell: for each time, each requested mode. */
function frames(raw, times, modes = ['final']) {
  const c = full(raw);
  return times.map((t) => Object.fromEntries(modes.map((mode) => [mode, { w: c.w, h: c.h, b64: b64(shot(c, mode, t)) }])));
}

/** The mock planet's state at time t, for reports: files, fogged, shares, footprint sizes. */
function info(raw) {
  const c = full(raw);
  const st = stateAt(c.mock, { coverage: c.coverage, fogged: c.fogged, events: c.events, t: c.t });
  const sizes = new Map();
  for (const k of c.foot.owner) if (k >= 0) sizes.set(k, (sizes.get(k) ?? 0) + 1);
  return { files: c.mock.files.map((f) => ({ ...f, fogged: st.fogged.has(f.id), cells: sizes.get(c.mock.files.indexOf(f)) ?? 0 })), overflow: c.mock.overflow };
}

/**
 * The start time (s) at which a set of files faces the camera best through an event window: the
 * candidate (every 0.25 s of the loop) with the largest mean facing of their cells over the window.
 */
function facingStart(raw, ids, span = 3) {
  const c = full(raw);
  configure(c);
  placeCamera(c.cam);
  const cells = ids.map((id) => new THREE.Vector3(...fibonacciCell(anchorOf(c, id), SURFACE_CELLS)));
  let best = 0, bestScore = -Infinity;
  for (let t0 = 0; t0 < LOOP.period; t0 += 0.25) {
    let s = 0, n = 0;
    for (let dt = 0; dt <= span; dt += 0.5) {
      poseWorld(t0 + dt, { planets: [planet], spin: true });
      const m = planet.parts.surface.matrixWorld;
      for (const q of cells) {
        const w = q.clone().applyMatrix4(m), nrm = q.clone().transformDirection(m);
        s += nrm.dot(camera.position.clone().sub(w).normalize()); n++;
      }
    }
    if (s / n > bestScore) [best, bestScore] = [t0, s / n];
  }
  return { t0: best, facing: bestScore };
}

// ------------------------------------------------------------------ sheets
function toCanvas(img, w, h, crop) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  cv.getContext('2d').putImageData(new ImageData(img, w, h), 0, 0);
  if (!crop) return cv;
  const [x, y, cw, ch] = crop;
  const d = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  d.getContext('2d').drawImage(cv, x, y, cw, ch, 0, 0, cw, ch);
  return d;
}
const UI = { bg: '#0d0b16', text: '#e6e0ee', dim: '#a99cbf', head: '#fff6e4', pick: '#00bc9c', font: '11px ui-monospace, Menlo, monospace' };
/**
 * Composes a sheet: { title, note?, colLabels, rows: [{ label, cells }], scale }. Each cell is a lab
 * cell plus optional crop [x, y, w, h], caption and mode. Labels are drawn at output resolution,
 * outside the pixel pass.
 */
function sheet(spec) {
  const scale = spec.scale ?? 2, gap = 6, labelW = spec.labelW ?? 132, notes = spec.note ? spec.note.split('\n') : [];
  const headH = 32 + notes.length * 14;
  const rendered = spec.rows.map((r) => r.cells.map((cell) => {
    const c = full(cell);
    return { img: shot(c, cell.mode ?? 'final'), w: c.w, h: c.h, crop: cell.crop, scale: cell.scale ?? scale };
  }));
  const tw = (r) => (r.crop ? r.crop[2] : r.w) * r.scale, th = (r) => (r.crop ? r.crop[3] : r.h) * r.scale;
  const cols = Math.max(...rendered.map((r) => r.length));
  const colW = Array.from({ length: cols }, (_, j) => Math.max(...rendered.map((r) => (r[j] ? tw(r[j]) : 0))));
  const capLines = (i, j) => String(spec.rows[i].cells[j]?.caption ?? '').split('\n').filter(Boolean).length;
  const rowH = rendered.map((r, i) => Math.max(...r.map(th)) + 4 + 13 * Math.max(0, ...r.map((_, j) => capLines(i, j))));
  const W = labelW + colW.reduce((s, x) => s + x + gap, 0) + gap, H = headH + rowH.reduce((s, x) => s + x + gap, 0) + gap;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = cv.getContext('2d');
  ctx.fillStyle = UI.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.font = UI.font;
  ctx.textBaseline = 'top';
  ctx.fillStyle = UI.head;
  ctx.fillText(spec.title, gap, 6);
  notes.forEach((n, k) => { ctx.fillStyle = UI.dim; ctx.fillText(n, gap, 20 + k * 14); });
  let x = labelW;
  (spec.colLabels ?? []).forEach((l, j) => { ctx.fillStyle = UI.dim; ctx.fillText(l, x, headH - 14); x += colW[j] + gap; });
  let y = headH;
  rendered.forEach((row, i) => {
    ctx.fillStyle = spec.rows[i].pick ? UI.pick : UI.text;
    String(spec.rows[i].label).split('\n').forEach((line, k) => ctx.fillText(line, gap, y + 4 + k * 14));
    let xx = labelW;
    row.forEach((r, j) => {
      ctx.drawImage(toCanvas(r.img, r.w, r.h, r.crop), xx, y, tw(r), th(r));
      String(spec.rows[i].cells[j].caption ?? '').split('\n').filter(Boolean).forEach((line, k) => { ctx.fillStyle = UI.dim; ctx.fillText(line, xx, y + th(r) + 3 + k * 13); });
      xx += colW[j] + gap;
    });
    y += rowH[i] + gap;
  });
  return { png: cv.toDataURL('image/png') };
}

// ------------------------------------------------------------------ live page
function bindLive() {
  const $ = (id) => document.getElementById(id);
  const fill = (sel, opts) => opts.forEach(([v, l]) => sel.add(new Option(l, v)));
  fill($('dir'), DIRECTIONS.map((d) => [d.id, `${d.id} · ${d.name}`]));
  fill($('look'), LOOKS.map((l) => [l.look, `${l.look} (${l.band})`]));
  fill($('coverage'), COVERAGES.map((v) => [String(v), `${v * 100}% charted`]));
  fill($('footprint'), FOOTPRINTS.map((f) => [f, f]));
  $('coverage').value = '0.5';
  const st = { dir: 'A', look: 'lush', coverage: 0.5, footprint: 'territory', reasons: false, play: true, t: 3, events: [] };
  const cellOf = () => {
    const l = LOOKS.find((x) => x.look === st.look);
    return { dir: st.dir, biome: l.biome, seed: l.seed, coverage: st.coverage, footprint: st.footprint, reasons: st.reasons, events: st.events, t: st.t };
  };
  for (const id of ['dir', 'look', 'footprint']) $(id).addEventListener('change', (e) => { st[id] = e.target.value; st.events = []; });
  $('coverage').addEventListener('change', (e) => { st.coverage = +e.target.value; st.events = []; });
  $('reasons').addEventListener('change', (e) => { st.reasons = e.target.checked; });
  $('play').addEventListener('change', (e) => { st.play = e.target.checked; });
  // chart the fogged file nearest the camera; refog the charted one nearest it
  const nearestFile = (fogged) => {
    const c = full(cellOf());
    const s = stateAt(c.mock, { coverage: c.coverage, events: st.events, t: st.t });
    const m = planet.parts.surface.matrixWorld;
    const score = (f) => new THREE.Vector3(...fibonacciCell(anchorOf(c, f.id), SURFACE_CELLS)).transformDirection(m).dot(camera.position.clone().normalize());
    return c.mock.files.filter((f) => s.fogged.has(f.id) === fogged && !s.active.has(f.id)).sort((a, b) => score(b) - score(a))[0];
  };
  $('chart').addEventListener('click', () => { const f = nearestFile(true); if (f) st.events = [...st.events, { file: f.id, kind: 'clear', at: st.t }]; });
  $('refog').addEventListener('click', () => { const f = nearestFile(false); if (f) st.events = [...st.events, { file: f.id, kind: 'refog', at: st.t }]; });
  const canvas = renderer.domElement;
  placeCamera('hero');
  controls.target.set(0, 0, 0);
  controls.update();
  let last = null;
  const live = () => {
    const now = performance.now() / 1000; // playback only: a paused page renders a pinned time
    if (st.play && last !== null) st.t += now - last;
    last = now;
    const c = full(cellOf());
    configure(c);
    layers(c, MODES.final);
    const w = frameWidth(180), h = 180;
    setPixelSize(w, h, [sky]);
    spec.view.value.set(w, h);
    const scale = Math.max(1, Math.floor(Math.min((innerWidth - 300) / w, innerHeight / h)));
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
    controls.update();
    const render = { depth: true, depthMode: 'pixel-smooth', depthBands: '3-band' };
    if (applyDepth(render) || lastPixel === null) retint(scene);
    lastPixel = render.depthMode;
    pose(c, st.t, render);
    const s = applyFog(c, st.t, MODES.final);
    renderer.setClearColor(resolve('space'));
    renderer.render(scene, camera);
    $('status').textContent = `t ${st.t.toFixed(1)} s · ${s.fogged.size + s.active.size} of ${c.mock.files.length} files fogged`;
    requestAnimationFrame(live);
  };
  requestAnimationFrame(live);
}

/** Screen position (px, top-down) and facing of each file's anchor cell at time t. */
function project(raw, ids, t = raw.t ?? DEFAULTS.t) {
  const c = full(raw);
  configure(c);
  placeCamera(c.cam);
  camera.aspect = c.w / c.h;
  camera.updateProjectionMatrix();
  poseWorld(t, { planets: [planet], spin: c.spin });
  const m = planet.parts.surface.matrixWorld;
  return ids.map((id) => {
    const q = new THREE.Vector3(...fibonacciCell(anchorOf(c, id), SURFACE_CELLS));
    const w = q.clone().applyMatrix4(m), n = q.clone().transformDirection(m);
    const s = w.clone().project(camera);
    return { id, x: ((s.x + 1) / 2) * c.w, y: ((1 - s.y) / 2) * c.h, facing: n.dot(camera.position.clone().sub(w).normalize()) };
  });
}

/**
 * F1's check: the shader's grid cell for every planet pixel ('ids' render) against #18's grid
 * computed here: each pixel's camera ray is hit against the sphere, taken into the surface's own
 * frame and given its nearest fibonacciCell. The mesh is a faceted sphere (72 x 48), so its points
 * sit a little off the true sphere's: a pixel whose shader cell is within 0.01 rad of as near as the
 * nearest (on an edge, or a corner where three cells meet) is a boundary pixel, counted apart.
 */
function cellCheck(raw) {
  const c = full(raw);
  const img = shot(c, 'ids');
  const inv = planet.parts.surface.matrixWorld.clone().invert();
  const centre = planet.group.getWorldPosition(new THREE.Vector3());
  const R = c.size;
  const cells = Array.from({ length: SURFACE_CELLS }, (_, i) => fibonacciCell(i, SURFACE_CELLS));
  let n = 0, same = 0, ties = 0, wrong = 0, limb = 0, ownerWrong = 0, foggedWrong = 0;
  const samples = [];
  const st = stateAt(c.mock, { coverage: c.coverage, events: c.events, t: c.t });
  const ray = new THREE.Ray();
  const space = new THREE.Color(resolve('space'));
  [space.r, space.g, space.b] = [space.r, space.g, space.b].map((v) => Math.round(v * 255));
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const ndc = new THREE.Vector3(((x + 0.5) / c.w) * 2 - 1, 1 - ((y + 0.5) / c.h) * 2, 0.5).unproject(camera);
    ray.origin.copy(camera.position);
    ray.direction.copy(ndc.sub(camera.position).normalize());
    const hit = ray.intersectSphere(new THREE.Sphere(centre, R), new THREE.Vector3());
    if (!hit) continue;
    const i = (y * c.w + x) * 4;
    if (img[i] === space.r && img[i + 1] === space.g && img[i + 2] === space.b) continue; // the ray grazes the true sphere outside the mesh
    const p = hit.applyMatrix4(inv).normalize();
    const d = cells.map(([a, b, e], k) => [p.x * a + p.y * b + p.z * e, k]).sort((u, v) => v[0] - u[0] || u[1] - v[1]);
    const gl = img[i];
    n++;
    if (gl === d[0][1]) same++;
    else if (d.some(([v, k]) => k === gl && Math.acos(Math.min(1, v)) - Math.acos(Math.min(1, d[0][0])) < 0.01)) ties++; // an edge or a corner where three cells meet
    else if (ray.direction.dot(hit.clone().applyMatrix4(planet.parts.surface.matrixWorld).sub(centre).normalize()) > -0.3) limb++; // grazing rays: the facets sit off the sphere most
    else { wrong++; if (samples.length < 6) samples.push({ x, y, shader: gl, nearest: d.slice(0, 3).map(([v, k]) => [k, Math.acos(Math.min(1, v))]), facing: -ray.direction.dot(hit.clone().applyMatrix4(planet.parts.surface.matrixWorld).sub(centre).normalize()) }); }
    const k = c.foot.owner[gl];
    const f = k >= 0 ? c.mock.files[k] : null;
    if (img[i + 1] !== (f ? c.foot.anchor[k] : gl)) ownerWrong++;
    if ((img[i + 2] === 255) !== !!(f && st.fogged.has(f.id))) foggedWrong++;
  }
  return { n, same, ties, limb, wrong, ownerWrong, foggedWrong, samples };
}

window.lab = { ready: true, frames, sheet, info, facingStart, project, cellCheck, framings: FRAMINGS };
if (!new URLSearchParams(location.search).has('capture')) bindLive();
