// The ship lab page. Scenes are built from the asset viewer's own factories (its sky, starfield, star
// and astronauts, in library mode) and the drone lab's drones, plus the lab's ship (ship.js). Tiles
// render off-screen at the internal resolution (320x180 by default) and are checked here; lab.mjs and
// the tests drive window.lab, and the live page (index.html) uses the same functions.
import * as THREE from 'three';
import { makeSky, makeStars, makeStar, setDepthLevel, applyDepth, setViewSize, setPixelSize, retint, resolve, renderer, camera, poseWorld, LOOP as VIEWER_LOOP, frameWidth } from '../asset-viewer/viewer.js';
import { makeDrone } from '../drone-lab/drone.js';
import { sessionLook } from '../drone-lab/brands.js';
import { DEFAULTS as DRONE_DEFAULTS } from '../drone-lab/params.js';
import { makeShip } from './ship.js';
import { VARIANTS, VARIANT_BY_ID } from './variants.js';
import { BUILDERS, SHIP_SCALE, CYCLE, crewPlan } from './ship-spec.js';
import { shipBounds } from './ship-glsl.js';
import { paletteHexes, tealThrust, CREW_HEXES, TEAL } from './palette.js';

const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
// Distances (camera to the ship's middle), shared with the drone lab so the numbers compare. 'near' is
// its system distance (lab.js SYSTEM_DIST, the viewer's system view: a drone is 19 px there); 'system'
// is its far scale (18.8, the viewer's mid depth step: a drone is 6 px), framed as the system view:
// the ship beside the star with your drones, looking down 28° like the product's start pose. The crew
// close-up is the viewer's (2.7 units from the crew). The close-up frames the whole ship at 72% height.
export const DIST = { near: Math.hypot(0.1 + 1.35, 1.3 + 0.2, 10.2 - 4.6), system: 18.8, crew: 2.7 };
export const FRAMINGS = ['close', 'crew', 'near', 'system'];
const CLOSE_FILL = 0.72;
const NEAR_FILL = 0.86; // at the drone lab's system distance a tall ship would leave the frame: pull back until it fills at most this
/** The near camera distance: the drone lab's system distance, or farther if the ship wouldn't fit. */
export const nearDist = (e) => Math.max(DIST.near, e.h / (NEAR_FILL * 2 * TAN));
const PITCH = { close: 0.17, crew: 0.17, near: 0.26, system: (28 * Math.PI) / 180 }; // the product's start pose looks down 28°
export const VIEW_YAW = { front: 0, hero: -0.3, '3/4': -0.6, side: -Math.PI / 2 }; // the ship turned 34°: the product can face it to the camera, as drones face out from home
const DEPTH_OFF = { depth: false, depthMode: 'pixel-smooth', depthBands: '3-band' }; // full BLK 36, as the drone lab's tiles

const scene = new THREE.Scene();
const sky = makeSky();
const stars = makeStars();
const star = makeStar();
star.set({ size: 1.6 });
scene.add(sky, stars, star.group);
// Three of your own drones (the human's agent sessions), as the drone lab draws them.
const DRONES = [['claude', 's1'], ['codex', 's2'], ['generic', 's3']].map(([brand, session]) => {
  const d = makeDrone();
  const look = sessionLook(brand, session);
  d.setParams({ ...DRONE_DEFAULTS, ...look.params });
  d.setPalette(look.palette);
  scene.add(d.group);
  return d;
});
const ships = Object.fromEntries(VARIANTS.map((v) => {
  const s = makeShip(BUILDERS[v.id], v.palette);
  s.n = null;
  scene.add(s.group);
  return [v.id, s];
}));

/** A cell in full, every default filled in. */
function full(cell) {
  return { v: 'A', n: 3, view: '3/4', framing: 'close', t: 1.5, teal: false, w: 320, h: 180, ...cell };
}

let current = null;
/** Builds the scene for a cell; returns { c, ship, box } with the ship's world box. */
function configure(raw) {
  const c = full(raw);
  for (const [id, s] of Object.entries(ships)) s.group.visible = id === c.v;
  const ship = ships[c.v];
  if (ship.n !== c.n) { ship.setCrew(c.n); ship.n = c.n; }
  ship.setPalette(c.teal ? tealThrust(VARIANT_BY_ID[c.v].palette) : VARIANT_BY_ID[c.v].palette);
  ship.group.rotation.y = VIEW_YAW[c.view];
  const { lo, hi } = shipBounds(ship.spec, 0);
  const box = { lo: lo.map((x) => x * SHIP_SCALE), hi: hi.map((x) => x * SHIP_SCALE) };
  current = { c, ship, box };
  placeAll(c, ship, box);
  return current;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function look(target, dist, pitch, yaw = 0) {
  camera.position.copy(target).add(V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

/** The ship's world height and width (as framed), and its middle. */
const extent = (box) => ({ h: box.hi[1] - box.lo[1], w: Math.max(box.hi[0] - box.lo[0], box.hi[2] - box.lo[2]), mid: V(0, (box.lo[1] + box.hi[1]) / 2, 0) });

function placeAll(c, ship, box) {
  const e = extent(box);
  const inSystem = c.framing === 'near' || c.framing === 'system';
  DRONES.forEach((d) => (d.group.visible = inSystem));
  star.group.visible = inSystem;
  if (c.framing === 'close') {
    const dist = Math.max(e.h / (CLOSE_FILL * 2 * TAN), e.w / (CLOSE_FILL * 2 * TAN * (c.w / c.h)));
    look(e.mid, dist, PITCH.close);
  } else if (c.framing === 'crew') {
    // the viewer's crew close-up density, centred on the drawn crew's helmets
    ship.update(c.t, camera);
    const seats = ship.crew.filter((a) => a.group.visible);
    const mid = seats.reduce((m, a) => m.add(a.group.localToWorld(V(0, 0.709, 0))), V()).multiplyScalar(1 / Math.max(1, seats.length));
    look(seats.length ? mid : e.mid, DIST.crew, PITCH.crew);
  } else {
    // beside the star, with three drones round the ship
    const far = c.framing === 'system';
    const half = e.w / 2;
    const at = [V(-half - 0.55, e.mid.y + 0.35, 0.5), V(half + 0.5, e.mid.y - 0.25, 0.7), V(half + 0.35, e.mid.y + 0.95, -0.2)];
    DRONES.forEach((d, i) => d.group.position.copy(at[i]));
    star.group.position.copy(far ? V(-4.6, e.mid.y + 0.4, -4.5) : V(-7.6, e.mid.y + 0.9, -14));
    const target = far ? V(-1.9, e.mid.y, -1.5) : e.mid.clone().add(V(-0.35, 0, 0));
    look(target, far ? DIST.system : nearDist(e), far ? PITCH.system : PITCH.near);
  }
}

/** What each render mode hides: 'final' shows the cell; 'check' only the ship and its crew; 'bare'
 *  the ship alone; 'noflame' the bare ship without its flame; 'hide' the check with one astronaut gone. */
function layers(mode, hideIndex = -1) {
  const { c, ship } = current;
  const only = mode !== 'final';
  stars.visible = !only;
  const inSystem = c.framing === 'near' || c.framing === 'system';
  star.group.visible = inSystem && !only;
  DRONES.forEach((d) => (d.group.visible = inSystem && !only));
  const seats = ship.spec.crew.length;
  ship.crew.forEach((a, i) => (a.group.visible = i < seats && mode !== 'bare' && mode !== 'noflame' && i !== hideIndex));
  ship.setFlame(mode !== 'noflame');
}

const TMP = V();
/** Poses the configured scene at time t (s). */
function pose(t) {
  const { c, ship } = current;
  stars.position.copy(camera.position);
  poseWorld(t, { suns: star.group.visible ? [star] : [], spin: true });
  ship.update(t, camera);
  DRONES.forEach((d) => d.group.visible && d.update(t, { yaw: 0.25, motion: true, smoke: true, pixK: (2 * TAN) / c.h }));
  setDepthLevel(stars, 0);
  setDepthLevel(sky, 0);
  setDepthLevel(star.group, 0);
  for (const a of ship.crew) setDepthLevel(a.group, 0);
  void TMP;
}

let rt = null, px = null;
/** Renders the posed scene off-screen at w x h; returns RGBA rows top-down. */
function capture(w, h) {
  if (!rt || rt.width !== w || rt.height !== h) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    px = new Uint8Array(w * h * 4);
  }
  setViewSize(w, h, [sky]);
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

let depthSet = false;
/** One render of a cell in a mode at time t. */
function shot(raw, mode = 'final', t = null, hideIndex = -1) {
  const { c } = configure(raw);
  if (!depthSet) { applyDepth(DEPTH_OFF); retint(scene); depthSet = true; }
  layers(mode, hideIndex);
  pose(t ?? c.t);
  const img = capture(c.w, c.h);
  layers('final');
  return img;
}

const rgbAt = (img, i) => (img[i * 4] << 16) | (img[i * 4 + 1] << 8) | img[i * 4 + 2];
const hexToInt = (h) => parseInt(h.slice(1), 16);
const intToHex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** 8-connected components of a pixel set (Set of indices) -> arrays of indices. */
function components(set, w) {
  const seen = new Set(), out = [];
  for (const start of set) {
    if (seen.has(start)) continue;
    const comp = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if ((dx < 0 && x === 0) || (dx > 0 && x === w - 1)) continue;
        const j = i + dy * w + dx;
        if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    out.push(comp);
  }
  return out;
}
const bboxOf = (idx, w) => {
  if (!idx.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of idx) { const x = i % w, y = (i - x) / w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
/** The largest k x k block of a pixel set (a "readable" patch: 2 means a 2 x 2 block exists). */
function biggestBlock(set, w) {
  let best = 0;
  const dp = new Map();
  for (const i of [...set].sort((a, b) => a - b)) {
    const x = i % w;
    const up = dp.get(i - w) ?? 0, left = x > 0 ? dp.get(i - 1) ?? 0 : 0, diag = x > 0 ? dp.get(i - w - 1) ?? 0 : 0;
    const v = 1 + Math.min(up, left, diag);
    dp.set(i, v);
    best = Math.max(best, v);
  }
  return best;
}

/**
 * Checks and measures for one tile, with the depth fade off: the ship and crew alone ('check'), the
 * bare ship, the bare ship without its flame, and one render per astronaut with that astronaut hidden
 * (what it adds is what's visible of it).
 */
function tileStats(raw, { perCrew = true } = {}) {
  const { c, ship } = configure(raw);
  const check = shot(c, 'check'), bare = shot(c, 'bare'), noflame = shot(c, 'noflame');
  const n = c.w * c.h;
  const space = hexToInt(resolve('space'));
  const pal = c.teal ? tealThrust(VARIANT_BY_ID[c.v].palette) : VARIANT_BY_ID[c.v].palette;
  const shipOk = new Set(paletteHexes(pal).map(hexToInt));
  const crewOk = new Set(CREW_HEXES.map(hexToInt));
  const teal = new Set(TEAL.map(hexToInt));
  const all = new Set(), shipSet = new Set(), hullSet = new Set();
  const hist = new Map(), strays = new Map();
  let crewPx = 0, flamePx = 0, tealPx = 0, clipped = 0, shipStray = 0;
  for (let i = 0; i < n; i++) {
    const a = rgbAt(check, i), b = rgbAt(bare, i), q = rgbAt(noflame, i);
    const x = i % c.w, y = (i - x) / c.w;
    if (a !== space) {
      all.add(i);
      hist.set(a, (hist.get(a) ?? 0) + 1);
      if (x === 0 || y === 0 || x === c.w - 1 || y === c.h - 1) clipped++;
      if (teal.has(a)) tealPx++;
      if (!shipOk.has(a) && !crewOk.has(a)) strays.set(a, (strays.get(a) ?? 0) + 1);
    }
    if (b !== space) {
      shipSet.add(i);
      if (!shipOk.has(b)) shipStray++;
    }
    if (q !== space) hullSet.add(i);
    if (a !== b) crewPx++;
    if (b !== q) flamePx++;
  }
  const crew = [];
  const drawn = ship.spec.crew.length;
  if (perCrew) {
    for (let k = 0; k < drawn; k++) {
      const without = shot(c, 'hide', null, k);
      const mine = new Set();
      for (let i = 0; i < n; i++) if (rgbAt(without, i) !== rgbAt(check, i)) mine.add(i);
      crew.push({ px: mine.size, block: biggestBlock(mine, c.w), box: bboxOf([...mine], c.w) });
    }
  }
  return {
    cell: c, plan: crewPlan(c.n), drawn,
    px: all.size, shipPx: shipSet.size, crewPx, flamePx, tealPx, clipped,
    pieces: components(all, c.w).length, shipPieces: components(shipSet, c.w).length, hullPieces: components(hullSet, c.w).length,
    shipBox: bboxOf([...hullSet], c.w), box: bboxOf([...all], c.w),
    colours: [...hist.entries()].sort((p, q) => q[1] - p[1]).map(([k, v]) => [intToHex(k), v]),
    strays: [...strays.entries()].map(([k, v]) => [intToHex(k), v]), shipStray,
    crew,
  };
}

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

/** An RGBA tile -> a canvas, upscaled by a whole factor with nearest-neighbour only. */
function upscale(img, w, h, k) {
  const src = Object.assign(document.createElement('canvas'), { width: w, height: h });
  src.getContext('2d').putImageData(new ImageData(img, w, h), 0, 0);
  const out = Object.assign(document.createElement('canvas'), { width: w * k, height: h * k });
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, w * k, h * k);
  return out;
}

const FONT = '13px ui-monospace, Menlo, monospace';
const INK = '#e6e0ee', DIM = '#8d83a6', PANEL = '#15121f';
/** A "+N" badge for the crew who don't ride (the overflow past 16): drawn on the sheet, outside the pixel pass. */
function badge(g, x, y, text) {
  g.font = 'bold 15px ui-monospace, Menlo, monospace';
  const w = g.measureText(text).width + 12;
  g.fillStyle = '#2a2440';
  g.fillRect(x, y, w, 22);
  g.fillStyle = INK;
  g.fillText(text, x + 6, y + 16);
}

/**
 * A labelled sheet: rows x cols of tiles, each upscaled by `scale`, with labels drawn at output
 * resolution (outside the pixel pass). Returns { png, stats } (stats per tile, row-major).
 */
function sheet({ title, rows, cols, scale = 2, note = '', stats: wantStats = true, padL = 170, statsFor = null }) {
  const c0 = full(rows[0].cells[0]);
  const tw = c0.w * scale, th = c0.h * scale, gap = 8, top = 56, colH = 20, foot = note ? 34 : 12;
  const out = Object.assign(document.createElement('canvas'), { width: padL + cols.length * (tw + gap), height: top + colH + rows.length * (th + gap) + foot });
  const g = out.getContext('2d');
  g.fillStyle = PANEL;
  g.fillRect(0, 0, out.width, out.height);
  g.font = 'bold 15px ui-monospace, Menlo, monospace';
  g.fillStyle = INK;
  g.fillText(title, 12, 24);
  g.font = FONT;
  cols.forEach((label, j) => { g.fillStyle = DIM; g.fillText(label, padL + j * (tw + gap), top + 12); });
  const stats = [];
  rows.forEach((row, i) => {
    const y = top + colH + i * (th + gap);
    g.fillStyle = INK;
    g.font = 'bold 22px ui-monospace, Menlo, monospace';
    g.fillText(row.label, 12, y + 30);
    g.font = FONT;
    g.fillStyle = DIM;
    (row.sub ?? []).forEach((line, k) => g.fillText(line, 12, y + 54 + k * 17));
    row.cells.forEach((cell, j) => {
      const c = full(cell);
      const img = shot(c, 'final');
      g.drawImage(upscale(img, c.w, c.h, scale), padL + j * (tw + gap), y);
      const s = wantStats ? tileStats(c, { perCrew: cell.perCrew !== false }) : null;
      // extra framings measured for the same tile (e.g. the crew-count tiles also at the near distance)
      const more = (statsFor ?? []).map((f) => tileStats({ ...c, ...f }));
      stats.push(more.length ? { ...s, more } : s);
      const extra = crewPlan(c.n).extra;
      if (extra > 0 && s?.shipBox) badge(g, padL + j * (tw + gap) + (s.shipBox.x + s.shipBox.w) * scale + 6, y + s.shipBox.y * scale + 6, `+${extra}`);
      if (cell.caption) { g.fillStyle = INK; g.fillText(cell.caption, padL + j * (tw + gap) + 6, y + th - 8); }
    });
  });
  if (note) { g.fillStyle = DIM; g.fillText(note, 12, out.height - 14); }
  return { png: out.toDataURL('image/png'), stats };
}

/**
 * One loop of a cell for a GIF: frames at t0 + k / fps for k in [0, CYCLE * fps), each upscaled by
 * `scale`, plus the seam numbers: the frame one cycle later must equal frame 0, and the wrap step
 * (last -> first) may be no bigger than the biggest step inside the loop.
 */
function loop(raw, { fps = 15, scale = 3, t0 = 0 } = {}) {
  const c = full(raw);
  const N = Math.round(CYCLE * fps);
  const frames = [], pngs = [];
  for (let k = 0; k < N; k++) {
    const img = shot(c, 'final', t0 + k / fps);
    frames.push(img);
    pngs.push(upscale(img, c.w, c.h, scale).toDataURL('image/png'));
  }
  const again = shot(c, 'final', t0 + CYCLE);
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) d++; return d; };
  let maxStep = 0;
  for (let k = 1; k < N; k++) maxStep = Math.max(maxStep, diff(frames[k - 1], frames[k]));
  return { pngs, same: diff(frames[0], again), wrap: diff(frames[N - 1], frames[0]), maxStep, frames: N };
}

/** One tile as raw RGBA (base64) and its stats, for the tests. */
function tile(cell, { stats = true, mode = 'final', t = null } = {}) {
  const c = full(cell);
  const img = shot(c, mode, t);
  return { w: c.w, h: c.h, rgba: b64(new Uint8Array(img.buffer)), stats: stats ? tileStats(c) : null };
}

const viewerCycle = () => VIEWER_LOOP.period / VIEWER_LOOP.surfaceTurns;

window.lab = { ready: true, cycle: CYCLE, viewerCycle: viewerCycle(), variants: VARIANTS.map(({ id, name, pitch, crewSeen }) => ({ id, name, pitch, crewSeen })), tile, sheet, loop, tileStats: (c) => tileStats(c) };

// ---------------------------------------------------------------- live page
if (!document.documentElement.classList.contains('capture')) {
  const $ = (id) => document.getElementById(id);
  const live = { v: 'A', n: 3, view: '3/4', framing: 'close', teal: false, play: true };
  $('v').innerHTML = VARIANTS.map((v) => `<option value="${v.id}">${v.id} · ${v.name}</option>`).join('');
  $('framing').innerHTML = FRAMINGS.map((f) => `<option>${f}</option>`).join('');
  $('yaw').innerHTML = Object.keys(VIEW_YAW).map((f) => `<option${f === '3/4' ? ' selected' : ''}>${f}</option>`).join('');
  const read = () => {
    Object.assign(live, { v: $('v').value, n: Number($('n').value), view: $('yaw').value, framing: $('framing').value, teal: $('teal').checked, play: $('play').checked });
    $('n-out').textContent = live.n;
    const p = crewPlan(live.n);
    $('status').textContent = `${VARIANT_BY_ID[live.v].pitch} · ${p.drawn} aboard on ${p.decks} deck${p.decks > 1 ? 's' : ''}${p.extra ? `, +${p.extra}` : ''}`;
  };
  for (const id of ['v', 'n', 'yaw', 'framing', 'teal', 'play']) $(id).addEventListener('input', read);
  read();
  const W = 320, H = 180;
  applyDepth(DEPTH_OFF);
  retint(scene);
  const canvas = renderer.domElement;
  let t = 0, last = null;
  const tick = (now) => {
    if (last !== null && live.play) t += (now - last) / 1000;
    last = now;
    setPixelSize(W, H, [sky]);
    const k = Math.max(1, Math.floor(Math.min((innerWidth - 300) / W, innerHeight / H)));
    canvas.style.width = `${W * k}px`;
    canvas.style.height = `${H * k}px`;
    configure({ ...live, w: W, h: H, t });
    layers('final');
    pose(t);
    renderer.setRenderTarget(null);
    renderer.setClearColor(resolve('space'));
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  void frameWidth;
}
