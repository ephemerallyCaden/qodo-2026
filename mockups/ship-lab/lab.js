// The ship lab page. Scenes are built from the asset viewer's own factories (its sky, starfield, star
// and astronauts, in library mode) and the drone lab's drones, plus the lab's ship (ship.js). Tiles
// render off-screen at the internal resolution (320x180 by default) and are checked here; lab.mjs and
// the tests drive window.lab, and the live page (index.html) uses the same functions.
import * as THREE from 'three';
import { makeSky, makeStars, makeStar, setDepthLevel, applyDepth, setViewSize, setPixelSize, retint, resolve, renderer, camera, poseWorld, LOOP as VIEWER_LOOP, STAR_DEFAULTS, PALETTES } from '../asset-viewer/viewer.js';
import { makeDrone } from '../drone-lab/drone.js';
import { sessionLook } from '../drone-lab/brands.js';
import { DEFAULTS as DRONE_DEFAULTS } from '../drone-lab/params.js';
import { makeShip } from './ship.js';
import { ALL_VARIANTS, VARIANT_BY_ID, ALL_BUILDERS } from './variants.js';
import { SHIP_SCALE, CYCLE, HELMET_Y, crewPlan, liveReach } from './ship-spec.js';
import { shipBounds } from './ship-glsl.js';
import { paletteHexes, tealThrust, CREW_HEXES, TEAL, CAP_PALETTE, BLK36 } from './palette.js';
import { FLYBY, shipAt, droneAt, timeAt, cameraFrame } from './flyby.js';

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
star.set({ size: STAR_DEFAULTS.size }); // the viewer's default star
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
const ships = Object.fromEntries(ALL_VARIANTS.map((v) => {
  const s = makeShip(ALL_BUILDERS[v.id], v.palette);
  s.n = null;
  scene.add(s.group);
  return [v.id, s];
}));
// The fly-by's own ship (flyby.js): the pick with the lively flame (its box reaching back for the puffs),
// its riders turned upright on screen as it flies on its side. Hidden in every other shot.
const liveBuild = (n) => { const sp = ALL_BUILDERS[FLYBY.v](n); return { ...sp, flames: sp.flames.map((fl) => ({ ...fl, reach: liveReach(fl.len) })) }; };
ships.flyby = makeShip(liveBuild, VARIANT_BY_ID[FLYBY.v].palette, { live: true });
ships.flyby.n = null;
scene.add(ships.flyby.group);

/** A cell in full, every default filled in. */
function full(cell) {
  return { v: 'A', n: 3, view: '3/4', framing: 'close', t: 1.5, teal: false, w: 320, h: 180, ...cell };
}

let current = null;
/** Builds the scene for a cell; returns { c, ship, box } with the ship's world box. */
function configure(raw) {
  const c = full(raw);
  const key = c.ship ?? c.v; // c.ship: the fly-by's own ship
  for (const [id, s] of Object.entries(ships)) s.group.visible = id === key;
  const ship = ships[key];
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
    // the viewer's crew close-up density, centred on the drawn crew's helmets (focus 'captain': on seat 0's)
    ship.update(c.t, camera);
    const seats = c.focus === 'captain' ? ship.crew.slice(0, 1) : ship.crew.filter((a) => a.group.visible);
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
 *  the ship alone; 'noflame' the bare ship without its flame; 'hide' the check with one astronaut gone;
 *  'nocap' the check with the captain's cap off. */
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
  ship.setCap(mode !== 'nocap');
}

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
function tileStats(raw, { perCrew = true, shoot = null, windows = false } = {}) {
  const { c, ship } = configure(raw);
  const take = shoot ?? ((mode, hideIndex = -1) => shot(c, mode, null, hideIndex)); // the fly-by passes its own (its frame's placement)
  const check = take('check'), bare = take('bare'), noflame = take('noflame'), nocap = take('nocap');
  const n = c.w * c.h;
  const space = hexToInt(resolve('space'));
  const pal = c.teal ? tealThrust(VARIANT_BY_ID[c.v].palette) : VARIANT_BY_ID[c.v].palette;
  const shipOk = new Set(paletteHexes(pal).map(hexToInt));
  const crewOk = new Set([...CREW_HEXES, ...paletteHexes(CAP_PALETTE)].map(hexToInt)); // the crew's roles and the captain's cap
  const teal = new Set(TEAL.map(hexToInt));
  const all = new Set(), shipSet = new Set(), hullSet = new Set(), capSet = new Set(), fire = new Set();
  const inner = hexToInt((pal.interior ?? pal.glass)[0]), open = new Set(); // windows: the openings (the bare ship's window insides)
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
      if (windows && b === inner) open.add(i);
    }
    if (q !== space) hullSet.add(i);
    if (a !== b) crewPx++;
    if (a !== rgbAt(nocap, i)) capSet.add(i);
    if (b !== q) { flamePx++; if (windows) fire.add(i); }
  }
  const crew = [];
  const drawn = ship.spec.crew.length;
  if (perCrew) {
    for (let k = 0; k < drawn; k++) {
      const without = take('hide', k);
      const mine = new Set();
      for (let i = 0; i < n; i++) if (rgbAt(without, i) !== rgbAt(check, i)) mine.add(i);
      // windows: how many of its px lie outside every window opening (it pokes through the hull)
      crew.push({ px: mine.size, block: biggestBlock(mine, c.w), box: bboxOf([...mine], c.w), ...(windows ? { outside: [...mine].filter((i) => !open.has(i)).length } : {}) });
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
    cap: { px: capSet.size, block: biggestBlock(capSet, c.w), box: bboxOf([...capSet], c.w), ...(windows ? { outside: [...capSet].filter((i) => !open.has(i)).length } : {}) }, // what the captain's cap adds
    // windows (the fly-by): the openings' px, and the pieces with the flame and its puffs left out (the
    // puffs drift free of the ship on purpose; the ship and its crew must still be one piece)
    ...(windows ? { openPx: open.size, aboard: components(new Set([...all].filter((i) => !fire.has(i))), c.w).length } : {}),
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

// ---------------------------------------------------------------- fly-by (flyby.js)
// The crew's ship flying past a still camera near the star, two drones drifting in the middle distance.
// The near framing's scene (star, drones, the ship and its crew), placed by flyby.js per frame instead:
// the fly-by's own ship (the lively flame), on its side, nose first, its riders turned upright.
// o: { w, h } another resolution; cam: { at, look } another camera (the orbit checks; the riders stay
// upright for the shot's own camera); pose: the ship placed as at that frame (the flame strip); idle:
// the pick with the idle flame instead (for comparison only).
const SCREEN_UP = cameraFrame().up; // the shot's screen up (world): the riders' heads point here
const flyCell = (o = {}) => full({ v: FLYBY.v, n: FLYBY.n, framing: 'near', view: 'front', ship: o.idle ? FLYBY.v : 'flyby', ...(o.w ? { w: o.w, h: o.h } : {}) });
/** Places the scene as fly-by frame k (o as above) in a mode; returns { c, ship, m }. */
function flyPose(k, mode = 'final', hideIndex = -1, o = {}) {
  const { c, ship } = configure(flyCell(o));
  if (!depthSet) { applyDepth(DEPTH_OFF); retint(scene); depthSet = true; }
  const cam = o.cam ?? FLYBY.camera;
  camera.position.set(...cam.at);
  camera.lookAt(V(...cam.look));
  camera.updateMatrixWorld(true);
  star.group.position.set(...FLYBY.star);
  const m = shipAt(o.pose ?? k);
  ship.group.position.set(...m.p);
  ship.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(...m.axes.x), V(...m.axes.y), V(...m.axes.z))); // on its side: nose along its travel, front to the camera
  ship.setUpright(SCREEN_UP, { sink: FLYBY.sink });
  layers(mode === 'nodrones' ? 'final' : mode, hideIndex); // 'nodrones': the final frame without the drones
  ship.group.visible = m.visible;
  DRONES.forEach((d, i) => {
    const fd = FLYBY.drones.find((x) => x.i === i);
    d.group.visible &&= !!fd && mode !== 'nodrones';
    if (fd) d.group.position.set(...droneAt(fd, k));
  });
  setViewSize(c.w, c.h, [sky]); // the camera's aspect, before the riders and the flame read it
  pose(timeAt(k));
  return { c, ship, m };
}
/** Puts the ship back as every other shot expects it. */
function flyReset(ship) {
  layers('final');
  ship.setUpright(null);
  ship.group.position.set(0, 0, 0);
  ship.group.rotation.set(0, 0, 0, 'XYZ');
}
/** One render of fly-by frame k in a mode (as shot()). */
function flyShot(k, mode = 'final', hideIndex = -1, o = {}) {
  const { c, ship } = flyPose(k, mode, hideIndex, o);
  const img = capture(c.w, c.h);
  flyReset(ship);
  return img;
}
/** A screen angle (rad, y up) from internal px a to b, and an angle wrapped to (-pi, pi]. */
const screenAngle = (a, b) => Math.atan2(a[1] - b[1], b[0] - a[0]);
const wrapPi = (x) => Math.atan2(Math.sin(x), Math.cos(x));
/**
 * Fly-by frame k's geometry, as drawn (the idle motion included): where the nose points on screen
 * against the travel (deg), and each rider's tilt from upright on screen (deg: its root's up, so the
 * figure's own sway isn't counted) and where the cap sits from the captain's helmet (deg from up).
 */
function flyGeom(k) {
  const { c, ship, m } = flyPose(k);
  const px = (v) => { const p = v.clone().project(camera); return [((p.x + 1) / 2) * c.w, ((1 - p.y) / 2) * c.h]; };
  const sp = ship.spec, { hi } = shipBounds(sp, 0);
  const tail = px(ship.mesh.localToWorld(V(0, sp.flames[0].a[1], 0))), nose = px(ship.mesh.localToWorld(V(0, hi[1], 0)));
  const riders = ship.crew.slice(0, sp.crew.length).map((a) => {
    const h = px(a.group.localToWorld(V(0, HELMET_Y, 0))), u = px(a.group.localToWorld(V(0, HELMET_Y + 0.3, 0)));
    return { at: h.map((x) => +x.toFixed(1)), tilt: +((wrapPi(screenAngle(h, u) - Math.PI / 2) * 180) / Math.PI).toFixed(2) };
  });
  ship.cap.updateMatrixWorld(true);
  const capAt = px(ship.cap.localToWorld(V(0, 0.98, 0))), captain = px(ship.crew[0].group.localToWorld(V(0, HELMET_Y, 0)));
  const out = {
    k, visible: m.visible, psi: +((ship.psi * 180) / Math.PI).toFixed(2),
    nose: +((screenAngle(tail, nose) * 180) / Math.PI).toFixed(2), travel: +((m.travel * 180) / Math.PI).toFixed(2),
    noseOff: +((wrapPi(screenAngle(tail, nose) - m.travel) * 180) / Math.PI).toFixed(2),
    tail, tip: nose, riders, cap: +((wrapPi(screenAngle(captain, capAt) - Math.PI / 2) * 180) / Math.PI).toFixed(2),
  };
  flyReset(ship);
  return out;
}
/**
 * The flame alone over frames [from, to), the ship held still as at frame `pose` (so only the flame
 * moves): per frame its px (bare ship minus the ship without its flame), its four ramp colours, and
 * the px that changed from the frame before (in or out of the flame, or another colour). idle: the
 * pick's idle flame (as v1) instead of the lively one.
 */
function flameStrip({ pose, from = 0, to = FLYBY.frames, idle = false } = {}) {
  const out = [];
  let prev = null;
  for (let k = from; k < to; k++) {
    const bare = flyShot(k, 'bare', -1, { pose, idle }), none = flyShot(k, 'noflame', -1, { pose, idle });
    const cur = new Map();
    for (let i = 0; i < bare.length / 4; i++) { const b = rgbAt(bare, i); if (b !== rgbAt(none, i)) cur.set(i, b); }
    const hist = {};
    for (const v of cur.values()) hist[intToHex(v)] = (hist[intToHex(v)] ?? 0) + 1;
    let changed = null;
    if (prev) { changed = 0; for (const [i, v] of cur) if (prev.get(i) !== v) changed++; for (const i of prev.keys()) if (!cur.has(i)) changed++; }
    out.push({ k, px: cur.size, colours: hist, changed });
    prev = cur;
  }
  return out;
}
/**
 * Containment from around: fly-by frame k's ship and riders (upright for the shot's camera) seen from
 * the shot's camera and from `views` others round the ship's middle (yaw about the world's up, pitch
 * about the camera's right, rad), at scale x the internal resolution, with the window openings: each
 * rider's px outside every opening (poking through the hull) must be 0 from everywhere.
 */
function flybyOrbit(k, { scale = 2, views = [[0, 0], [-0.6, 0], [0.6, 0], [0, -0.45], [0, 0.45]] } = {}) {
  const m = shipAt(k);
  const mid = V(...m.p).add(V(...m.axes.y).multiplyScalar(FLYBY.mid * SHIP_SCALE));
  const at0 = V(...FLYBY.camera.at).sub(mid), right = V(...cameraFrame().right);
  return views.map(([yaw, pitch]) => {
    const at = at0.clone().applyAxisAngle(V(0, 1, 0), yaw).applyAxisAngle(right, pitch).add(mid);
    const o = { w: 320 * scale, h: 180 * scale, cam: { at: at.toArray(), look: mid.toArray() } };
    const st = tileStats(flyCell(o), { shoot: (mode, hideIndex = -1) => flyShot(k, mode, hideIndex, o), windows: true });
    return { yaw, pitch, scale, openPx: st.openPx, crew: st.crew.map((r) => ({ px: r.px, outside: r.outside })), cap: { px: st.cap.px, outside: st.cap.outside } };
  });
}
/** Every colour the world palette (the viewer's 'final': BLK 36 crew + v2 world) can put on screen. */
const worldHexes = () => {
  const out = new Set();
  const walk = (v) => { if (typeof v === 'string') { if (/^#[0-9a-f]{6}$/i.test(v)) out.add(v.toLowerCase()); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(PALETTES.final);
  return [...out];
};
/**
 * Fly-by frames [from, to) at the internal resolution, as PNG data URLs, with each frame's colours
 * (hex -> px), its non-space px, and its teal: the drones' eyes glow [OIII] teal (the drone lab's
 * look), so each frame is also rendered without the drones, and any teal px that isn't a drone's
 * counts as stray. Also each frame's ship px (the ship, its flame and crew alone: 0 before it enters
 * and after it leaves). stats: frames to measure every astronaut and the cap in (tileStats, with the
 * window openings: each rider's px outside them).
 */
function flyby({ from = 0, to = FLYBY.frames, stats = [] } = {}) {
  const space = hexToInt(resolve('space'));
  const teal = new Set(TEAL.map(hexToInt));
  const frames = [];
  for (let k = from; k < to; k++) {
    const img = flyShot(k), bare = flyShot(k, 'nodrones'), alone = flyShot(k, 'check');
    const hist = new Map();
    let lit = 0, tealPx = 0, tealStray = 0, shipPx = 0;
    for (let i = 0; i < img.length / 4; i++) {
      const a = rgbAt(img, i);
      hist.set(a, (hist.get(a) ?? 0) + 1);
      if (a !== space) lit++;
      if (rgbAt(alone, i) !== space) shipPx++;
      if (teal.has(a)) { tealPx++; if (rgbAt(bare, i) === a) tealStray++; } // teal the drones didn't put there
      else if (teal.has(rgbAt(bare, i))) tealStray++;
    }
    frames.push({ k, t: timeAt(k), png: upscale(img, flyCell().w, flyCell().h, 1).toDataURL('image/png'), lit, shipPx, tealPx, tealStray, colours: [...hist.entries()].map(([h, n]) => [intToHex(h), n]) });
  }
  const measured = stats.map((k) => ({ k, ...tileStats(flyCell(), { shoot: (mode, hideIndex = -1) => flyShot(k, mode, hideIndex), windows: true }) }));
  return { frames, stats: measured };
}
/** Fly-by frame k as raw RGBA (base64), for the determinism check. */
const flybyRaw = (k) => b64(new Uint8Array(flyShot(k).buffer));

const viewerCycle = () => VIEWER_LOOP.period / VIEWER_LOOP.surfaceTurns;

window.lab = { ready: true, cycle: CYCLE, viewerCycle: viewerCycle(), starSize: STAR_DEFAULTS.size, variants: ALL_VARIANTS.map(({ id, name, pitch, crewSeen, captain }) => ({ id, name, pitch, crewSeen, captain })), tile, sheet, loop, tileStats: (c) => tileStats(c), flyby, flybyRaw, flybyPlan: FLYBY, flyGeom, flameStrip, flybyOrbit, worldHexes: worldHexes(), blk36: BLK36, teal: TEAL };

// ---------------------------------------------------------------- live page
if (!document.documentElement.classList.contains('capture')) {
  const $ = (id) => document.getElementById(id);
  const live = { v: 'A', n: 3, view: '3/4', framing: 'close', teal: false, play: true };
  $('v').innerHTML = ALL_VARIANTS.map((v) => `<option value="${v.id}">${v.id} · ${v.name}</option>`).join('');
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
}
