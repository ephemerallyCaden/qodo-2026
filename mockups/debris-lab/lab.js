// The debris lab page. Scenes are built from the asset viewer's own factories (makePlanet,
// makeSky, makeStars, makeAstronaut), posed and depth-tinted by its own helpers, plus the debris
// factory (debris.js). Tiles render off-screen at the internal resolution and are checked here;
// lab.mjs and the tests drive window.lab, and the live page (index.html) uses the same functions.
import * as THREE from 'three';
import {
  makePlanet, makeSky, makeStars, makeAstronaut, setDepthLevel, depthLevelAt, poseWorld, setLoop, applyDepth,
  setViewSize, setPixelSize, retint, resolve, renderer, camera, controls, VIEWS, RING_PRESETS, CREW_SPOT, CONTRIBUTOR_KEYS, frameWidth,
  LOOP as VIEWER_LOOP,
} from '../asset-viewer/viewer.js';
import { eyesFor } from '../asset-viewer/faces.js';
import { makeDebris } from './debris.js';
import { variant as variantOf, sampleItems, VARIANTS, BANDS, CLUTTER } from './variants.js';
import { LOOP, centreAt, phaseAt, ranked } from './layout.js';
import { restColours, TEAL, HULL_KEYS, PAINT, DULL, TAGS } from './palette.js';
import { hexToInt } from './colour.js';

setLoop({ ...VIEWER_LOOP, period: LOOP }); // the viewer's loop (2 surface : 3 cloud turns)

// One planet, its debris and the viewer's crew line-up, reconfigured per tile.
const scene = new THREE.Scene();
const sky = makeSky();
const stars = makeStars();
const planet = makePlanet();
const debris = makeDebris();
scene.add(sky, stars, planet.group, debris.group);
const crew = CONTRIBUTOR_KEYS.map((key, i) => {
  const a = makeAstronaut(key);
  a.group.position.set(CREW_SPOT.x + (i - 1) * 0.72, CREW_SPOT.y, CREW_SPOT.z); // the viewer's crew line-up
  a.group.rotation.y = [0.4, 0.05, -0.4][i];
  a.group.userData.phase = i * 1.7;
  a.setFace(eyesFor({ coral: '@caden', mint: '@mira', lilac: '@juno' }[key]));
  scene.add(a.group);
  return a;
});

// Framings: the viewer's hero close-up, the same direction pulled back so a planet's debris fits
// the frame (lineups, clutter strips), and close-ups on a piece at hero range and 3x closer.
const HERO = { pos: VIEWS.planet.pos, target: VIEWS.planet.target };
const HERO_D = Math.hypot(...HERO.pos);
const FRAMINGS = {
  hero: HERO,
  lineup: { pos: HERO.pos.map((x) => (x * 8.4) / HERO_D), target: [0, 0, 0] },
  piece: { pos: [0, 0, HERO_D], target: [0, 0, 0] },
  'piece-zoom': { pos: [0, 0, HERO_D / 3], target: [0, 0, 0] },
  depth: { pos: VIEWS.depth.pos, target: VIEWS.depth.target },
};
const DEPTH_ON = { depth: true, depthMode: 'pixel-smooth', depthBands: '3-band' }; // the viewer's default
const DEPTH_OFF = { ...DEPTH_ON, depth: false };
const BACKGROUND = new Set([resolve('space'), ...resolve('stars')].map(hexToInt));

/** A cell (one tile) in full: every default filled in. */
function full(cell) {
  return {
    biome: 'lush', seed: 7, size: 1, pos: [0, 0, 0], ring: 'off', moons: true, planet: true, crew: false, w: 320, h: 180, t: 3,
    ...cell,
    debris: cell.v ? {
      v: cell.v, hull: cell.hull ?? variantOf(cell.v).hull ?? 'gear', seed: cell.debrisSeed ?? cell.seed ?? 7, sweeps: cell.sweeps ?? {}, selected: cell.selected ?? null,
      items: cell.items ?? sampleItems(cell.n ?? 8, { prefix: cell.prefix ?? 'item' }),
      arrangement: cell.arrangement,
    } : null,
  };
}

/** Builds the scene for a cell; returns the full cell. */
function configure(raw) {
  const c = full(raw);
  planet.rebuild(c.seed, c.biome, c.ring, null, RING_PRESETS[c.ring], c.size);
  planet.group.position.set(...c.pos);
  if (c.debris) {
    const v = variantOf(c.debris.v);
    debris.rebuild(c.debris.items, c.debris.arrangement ? { ...v, arrangement: c.debris.arrangement } : v, { seed: c.debris.seed, radius: c.size, hull: c.debris.hull });
  }
  layers(c, 'final');
  return c;
}

/**
 * What each render mode shows. 'final' is the cell as asked (its depth setting); every other mode
 * has the depth fade off: 'check' (as asked), 'off' (no debris), 'ids' (debris as id colours),
 * 'alone' (ids with the planet and crew hidden), 'ring-off' / 'moons-off' (no debris, without them).
 */
const MODES = {
  final: {}, check: {}, off: { debris: false }, ids: { ids: true }, alone: { ids: true, planet: false, crew: false },
  'ring-off': { debris: false, ring: false }, 'moons-off': { debris: false, moons: false },
};
function layers(c, mode) {
  const m = MODES[mode];
  debris.group.visible = !!c.debris && m.debris !== false;
  debris.setDebug(m.ids ? 1 : 0);
  planet.group.visible = c.planet && m.planet !== false;
  planet.parts.ringTilt.visible = m.ring !== false;
  planet.setExtras({ moons: c.moons && m.moons !== false });
  for (const a of crew) a.group.visible = c.crew && m.crew !== false;
  return mode === 'final' && c.depth !== false ? DEPTH_ON : DEPTH_OFF;
}

function placeCamera(cam) {
  const c = typeof cam === 'string' ? FRAMINGS[cam] : cam ?? FRAMINGS.lineup;
  camera.position.set(...c.pos);
  camera.lookAt(new THREE.Vector3(...c.target));
  camera.updateMatrixWorld(true);
}

let lastPixel = null;
function useDepth(render) {
  if (applyDepth(render) || lastPixel === null) retint(scene);
  lastPixel = render.depthMode;
}

const TMP = new THREE.Vector3();
const levelOf = (g, render) => depthLevelAt(camera.position.distanceTo(g.getWorldPosition(TMP)), render);
/** Poses the configured scene at time t (s) and sets every object's depth level. */
function pose(c, t, render) {
  stars.position.copy(camera.position);
  poseWorld(t, { planets: [planet], astronauts: c.crew ? crew : [], spin: true });
  if (c.debris) {
    // a sweep's clock runs from its own start time, outside the loop (D6)
    const sweeps = Object.fromEntries(Object.entries(c.debris.sweeps).map(([id, start]) => [id, t - start]));
    debris.update(phaseAt(t), { centre: c.pos, radius: c.planet ? c.size : 0, sweeps, selected: c.debris.selected }); // no planet, no planet shadow
  }
  setDepthLevel(stars, 0);
  setDepthLevel(sky, 0);
  for (const g of [planet.group, debris.group]) setDepthLevel(g, levelOf(g, render));
  for (const a of crew) if (a.group.visible) setDepthLevel(a.group, levelOf(a.group, render));
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

/** One render of a configured cell in a mode (MODES), at time t. */
function shot(c, mode, t = c.t) {
  const render = layers(c, mode);
  useDepth(render);
  placeCamera(c.cam);
  pose(c, t, render);
  const img = capture(c.w, c.h);
  layers(c, 'final');
  return img;
}

const rgbAt = (img, i) => (img[i * 4] << 16) | (img[i * 4 + 1] << 8) | img[i * 4 + 2];
const addTo = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

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

// Screen space for the current camera: internal px from a world point, and px per world unit at a distance.
const toScreen = (v, c) => { const q = v.clone().project(camera); return { x: (q.x + 1) * 0.5 * c.w, y: (1 - q.y) * 0.5 * c.h }; };
const pxPerWorld = (d, c) => c.h / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
const pieceWorld = (c, p, t) => new THREE.Vector3(...centreAt(p, phaseAt(t))).add(new THREE.Vector3(...c.pos));

/** The planet's disc on screen: { x, y, r } in internal px (null without a planet). */
function disc(c) {
  if (!c.planet) return null;
  const centre = new THREE.Vector3(...c.pos);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const p = toScreen(centre, c), e = toScreen(centre.clone().addScaledVector(right, c.size), c);
  return { ...p, r: Math.hypot(e.x - p.x, e.y - p.y) };
}

/** Each planned piece on screen: index, px position, camera distance, px radius. */
function onScreen(c) {
  return debris.layout.pieces.map((p, i) => {
    const w = pieceWorld(c, p, c.t), d = camera.position.distanceTo(w);
    return { i, ...toScreen(w, c), d, r: (p.size / 2) * pxPerWorld(d, c), swept: p.id in (c.debris?.sweeps ?? {}) };
  });
}

/** Pieces the debris-alone id pass must show: centre in the tile and not hidden behind a nearer piece. */
function expectedPieces(c, ps) {
  return ps.filter((p) => !p.swept && p.x >= 0 && p.y >= 0 && p.x < c.w && p.y < c.h && !ps.some((o) => o !== p && o.d < p.d && Math.hypot(o.x - p.x, o.y - p.y) < o.r)).map((p) => p.i);
}

/** Pieces that must be fully hidden behind the planet: centre well inside its disc and behind its centre. */
function hiddenPieces(c, ps, dk) {
  if (!dk) return [];
  const dp = camera.position.distanceTo(new THREE.Vector3(...c.pos));
  return ps.filter((p) => p.d > dp && Math.hypot(p.x - dk.x, p.y - dk.y) < dk.r - 2 * p.r - 1).map((p) => p.i);
}

/** Screen-space crop of `size` px centred on piece `id` at the focus time. */
function focusCrop(c) {
  const p = debris.layout.pieces.find((x) => x.id === c.focus.id);
  if (!p) return null;
  placeCamera(c.cam);
  const { x, y } = toScreen(pieceWorld(c, p, c.focus.t ?? c.t), c);
  const [cw, ch] = c.focus.size;
  return [Math.min(Math.max(0, Math.round(x - cw / 2)), c.w - cw), Math.min(Math.max(0, Math.round(y - ch / 2)), c.h - ch), cw, ch];
}

/** Checks and measures for one tile (README "Checks"): four renders with the depth fade off. */
function tileStats(c) {
  const check = shot(c, 'check'), off = shot(c, 'off'), ids = shot(c, 'ids'), alone = shot(c, 'alone');
  const n = c.w * c.h, layout = debris.layout;
  const allowed = new Set(restColours(c.debris?.hull ?? 'gear', layout.kit ?? 'hardware').map(hexToInt));
  const teal = new Set(TEAL.map(hexToInt));
  const dk = disc(c);
  const ps = onScreen(c);
  let debrisPx = 0, stray = 0, tealPx = 0, discPx = 0, covered = 0, clipped = 0, leakPx = 0;
  const debrisHist = new Map(), planetHist = new Map(), discOff = new Map(), discWith = new Map(), strays = new Map();
  const byPiece = new Map(); // piece index -> its pixels in the debris-alone pass
  const seenOver = new Set();
  const hidden = new Set(hiddenPieces(c, ps, dk));
  for (let i = 0; i < n; i++) {
    const a = rgbAt(check, i), b = rgbAt(off, i), x = i % c.w, y = Math.floor(i / c.w);
    if (!BACKGROUND.has(b)) addTo(planetHist, b);
    const inDisc = dk && Math.hypot(x + 0.5 - dk.x, y + 0.5 - dk.y) < dk.r;
    if (inDisc) { discPx++; addTo(discOff, b); addTo(discWith, a); }
    if (a !== b) {
      debrisPx++;
      addTo(debrisHist, a);
      if (inDisc) covered++;
      if (teal.has(a)) tealPx++;
      else if (!allowed.has(a)) { stray++; addTo(strays, a); }
      if (ids[i * 4 + 2] === 254) seenOver.add(ids[i * 4] - 1);
    }
    if (ids[i * 4 + 2] === 254 && hidden.has(ids[i * 4] - 1)) leakPx++; // drawn through the planet
    if (alone[i * 4 + 2] === 254) {
      const k = alone[i * 4] - 1;
      if (!byPiece.has(k)) byPiece.set(k, new Set());
      byPiece.get(k).add(i);
      if (x === 0 || y === 0 || x === c.w - 1 || y === c.h - 1) clipped++;
    }
  }
  const expected = expectedPieces(c, ps);
  const pieces = [...byPiece.entries()].map(([k, set]) => {
    const p = layout.pieces[k];
    return { index: k, id: p?.id, cls: p?.cls, step: p?.step, area: set.size, components: components(set, c.w).length };
  });
  const list = (m) => [...m.entries()];
  return {
    debrisPx, stray, strays: list(strays).slice(0, 8), tealPx, clipped, leakPx,
    seen: [...byPiece.keys()].sort((a, b) => a - b), seenOver: [...seenOver].sort((a, b) => a - b), hidden: [...hidden],
    missing: expected.filter((i) => !byPiece.has(i)), extra: [...byPiece.keys()].filter((k) => k >= layout.pieces.length),
    shown: layout.pieces.length, overflow: layout.overflow,
    disc: { px: discPx, covered }, pieces,
    hist: { debris: list(debrisHist), planet: list(planetHist), discOff: list(discOff), discWith: list(discWith) },
  };
}

/** Renders a cell: { img (the final look), crop, stats (unless check === false) }; final: false skips the image. */
function renderCell(raw, { final = true } = {}) {
  let c = configure(raw);
  if (c.focus) c = { ...c, crop: focusCrop(c) };
  return { img: final ? shot(c, 'final') : null, w: c.w, h: c.h, crop: c.crop, stats: c.check !== false ? tileStats(c) : undefined };
}

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
 * Composes a sheet: { title, note?, colLabels, rows: [{ label, cells }], scale }. Labels are drawn at
 * output resolution, outside the pixel pass. A cell with overflow > 0 gets its "+N" counted label.
 */
function sheet(spec) {
  const scale = spec.scale ?? 2, gap = 6, labelW = spec.labelW ?? 132, headH = spec.note ? 46 : 32;
  const rendered = spec.rows.map((r) => r.cells.map((cell) => ({ ...renderCell(cell), scale: cell.scale ?? scale })));
  const tw = (r) => (r.crop ? r.crop[2] : r.w) * r.scale, th = (r) => (r.crop ? r.crop[3] : r.h) * r.scale;
  const cols = Math.max(...rendered.map((r) => r.length));
  const colW = Array.from({ length: cols }, (_, j) => Math.max(...rendered.map((r) => (r[j] ? tw(r[j]) : 0))));
  const rowH = rendered.map((r) => Math.max(...r.map(th)) + 16);
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
  if (spec.note) { ctx.fillStyle = UI.dim; ctx.fillText(spec.note, gap, 20); }
  let x = labelW;
  (spec.colLabels ?? []).forEach((l, j) => { ctx.fillStyle = UI.dim; ctx.fillText(l, x, headH - 14); x += colW[j] + gap; });
  const stats = [];
  let y = headH;
  rendered.forEach((row, i) => {
    ctx.fillStyle = spec.rows[i].pick ? UI.pick : UI.text;
    String(spec.rows[i].label).split('\n').forEach((line, k) => ctx.fillText(line, gap, y + 4 + k * 14));
    let xx = labelW;
    row.forEach((r, j) => {
      ctx.drawImage(toCanvas(r.img, r.w, r.h, r.crop), xx, y, tw(r), th(r));
      const cap = spec.rows[i].cells[j].caption;
      if (cap) { ctx.fillStyle = UI.dim; ctx.fillText(cap, xx, y + th(r) + 2); }
      if (r.stats?.overflow > 0) {
        const t = `+${r.stats.overflow}`;
        ctx.fillStyle = UI.head;
        ctx.fillText(t, xx + tw(r) - ctx.measureText(t).width - 4, y + 4);
      }
      if (r.stats) stats.push({ row: i, col: j, ...r.stats });
      xx += colW[j] + gap;
    });
    y += rowH[i] + gap;
  });
  return { png: cv.toDataURL('image/png'), stats };
}

/** Raw RGBA frames (base64) of one cell at the given times, for GIFs and loop checks. */
function frames(raw, times) {
  const c = configure(raw);
  return times.map((t) => {
    const img = shot(c, c.depth === false ? 'check' : 'final', t);
    let s = '';
    for (let i = 0; i < img.length; i += 0x8000) s += String.fromCharCode(...img.subarray(i, i + 0x8000));
    return { w: c.w, h: c.h, b64: btoa(s) };
  });
}

/**
 * What the ring alone, the moons alone and the debris alone add to the frame (depth off) at time t,
 * as 8-connected groups with their area, tones and roundness; plus the ring plane's world normal.
 */
function compare(raw, t) {
  const c = configure(raw);
  t ??= c.t;
  const base = shot(c, 'off', t);
  const added = (img, tonesOf = img) => {
    const set = new Set();
    for (let i = 0; i < c.w * c.h; i++) if (rgbAt(img, i) !== rgbAt(base, i)) set.add(i);
    return components(set, c.w).map((g) => {
      const xs = g.map((i) => i % c.w), ys = g.map((i) => Math.floor(i / c.w));
      const cx = xs.reduce((a, b) => a + b, 0) / g.length, cy = ys.reduce((a, b) => a + b, 0) / g.length;
      const rmax = Math.max(...xs.map((x, j) => Math.hypot(x - cx, ys[j] - cy))) + 0.5;
      return { area: g.length, tones: new Set(g.map((i) => rgbAt(tonesOf, i))).size, round: g.length / (Math.PI * rmax * rmax) };
    });
  };
  planet.parts.ringTilt.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(planet.parts.ringTilt.matrixWorld);
  return { ring: added(shot(c, 'ring-off', t), base), moons: added(shot(c, 'moons-off', t), base), debris: added(shot(c, 'check', t)), ringNormal: normal.toArray() };
}

// Colour groups a piece's pixels are counted in for the class measure (shares per piece).
const GROUPS = { red: [...PAINT, ...DULL], dark: ['#12173d'], ...Object.fromEntries(Object.entries(TAGS).map(([k, v]) => [`tag-${k}`, [v]])) };
const GROUP_OF = new Map(Object.entries(GROUPS).flatMap(([g, hexes]) => hexes.map((h) => [hexToInt(h), g])));

/** Per-piece screen area, silhouette and colour shares over time (the debris-alone id pass): tumble and class measures. */
function areas(raw, times) {
  const c = configure(raw);
  return times.map((t) => {
    const img = shot(c, 'alone', t);
    const look = shot(c, 'check', t);
    const px = {}, groups = {};
    for (let i = 0; i < c.w * c.h; i++) {
      if (img[i * 4 + 2] !== 254) continue;
      const k = img[i * 4] - 1;
      (px[k] ??= []).push([i % c.w, Math.floor(i / c.w)]);
      const g = GROUP_OF.get(rgbAt(look, i));
      groups[k] ??= Object.fromEntries(Object.keys(GROUPS).map((x) => [x, 0]));
      if (g) groups[k][g]++;
    }
    // principal-axis aspect (rotation-free) and fill against the moment ellipse (~1 for an ellipse)
    return Object.fromEntries(Object.entries(px).map(([k, pts]) => {
      const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
      const tr = (sxx + syy) / n, det = (sxx * syy - sxy * sxy) / (n * n), root = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      const l1 = tr / 2 + root + 1 / 12, l2 = Math.max(1e-6, tr / 2 - root) + 1 / 12; // + a pixel's own variance, so a 1 px line isn't infinite
      const shares = Object.fromEntries(Object.entries(groups[k]).map(([g, m]) => [g, m / n]));
      return [k, { area: n, aspect: Math.sqrt(l1 / l2), fill: n / (4 * Math.PI * Math.sqrt(l1 * l2)), shares }];
    }));
  });
}

// ------------------------------------------------------------------ live page
function bindLive() {
  const $ = (id) => document.getElementById(id);
  const fill = (sel, opts) => opts.forEach(([v, l]) => sel.add(new Option(l, v)));
  fill($('v'), VARIANTS.map((v) => [v.id, `${v.id} · ${v.name}`]));
  fill($('biome'), BANDS.map((b) => [b.biome, b.label]));
  fill($('hull'), HULL_KEYS.map((k) => [k, k]));
  fill($('n'), CLUTTER.map((n) => [String(n), String(n)]));
  const st = { v: 'A', biome: 'lush', size: 1, n: 8, hull: 'gear', seed: 7, play: true, t: 3, sweep: null };
  $('n').value = '8';
  const cellOf = () => ({ biome: st.biome, seed: BANDS.find((b) => b.biome === st.biome).seed, size: st.size, v: st.v, n: st.n, hull: st.hull, debrisSeed: st.seed, sweeps: st.sweep ? { [st.sweep.id]: st.sweep.at } : {}, t: st.t });
  for (const id of ['v', 'biome', 'hull', 'n']) $(id).addEventListener('change', (e) => { st[id] = id === 'n' ? +e.target.value : e.target.value; st.sweep = null; });
  $('size').addEventListener('input', (e) => { st.size = +e.target.value / 100; $('size-out').textContent = st.size.toFixed(2); });
  $('seed').addEventListener('input', (e) => { st.seed = +e.target.value; $('seed-out').textContent = st.seed; });
  $('play').addEventListener('change', (e) => { st.play = e.target.checked; });
  $('sweep').addEventListener('click', () => {
    const [biggest] = ranked(sampleItems(st.n));
    if (biggest) st.sweep = { id: biggest.id, at: st.t };
  });
  const canvas = renderer.domElement;
  placeCamera(FRAMINGS.lineup);
  controls.target.set(0, 0, 0);
  controls.update();
  let last = null;
  const live = () => {
    const now = performance.now() / 1000; // playback only: a paused page renders a pinned time
    if (st.play && last !== null) st.t += now - last; // the loop wraps inside the factories
    last = now;
    const c = configure(cellOf());
    const w = frameWidth(180), h = 180;
    setPixelSize(w, h, [sky]);
    const scale = Math.max(1, Math.floor(Math.min((innerWidth - 300) / w, innerHeight / h)));
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
    controls.update();
    useDepth(DEPTH_ON);
    pose(c, st.t, DEPTH_ON);
    renderer.setClearColor(resolve('space'));
    renderer.render(scene, camera);
    const lay = debris.layout;
    $('status').textContent = `t ${st.t.toFixed(1)} s · ${lay.pieces.length} drawn${lay.overflow ? `, +${lay.overflow} counted` : ''} · mass ${lay.mass} lines`;
    requestAnimationFrame(live);
  };
  requestAnimationFrame(live);
}

window.lab = {
  ready: true, sheet, frames, compare, areas,
  renderCell: (cell) => renderCell(cell, { final: false }).stats, // stats only (no final image)
};
if (!new URLSearchParams(location.search).has('capture')) bindLive();
