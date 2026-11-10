// Drone lab page: renders the parameterised drone in labelled sheets through the pixel
// pipeline (each tile is a crop of the standard 320x180 frame, nearest-upscaled), a crew shot
// (the drone hovering beside two K astronauts at the viewer's crew close-up), and a live page
// with a direction picker and per-parameter sliders. window.lab drives headless capture.
import * as THREE from 'three';
import { makeAstronaut } from '../explorations/astronaut-lab/astronaut.js';
import { DEFAULTS as ASTRO_DEFAULTS } from '../explorations/astronaut-lab/params.js';
import { VARIANTS as ASTRO_VARIANTS } from '../explorations/astronaut-lab/variants.js';
import { CREW, SPACE } from '../explorations/astronaut-lab/crew.js';
import { makeDrone, extents, intendedPieces } from './drone.js';
import { PALETTES, BRAND_PALETTES, paletteHexes } from './palette.js';
import { PARAMS, DEFAULTS } from './params.js';
import { VARIANTS, FINAL } from './variants.js';
import { BRANDS, BRAND_BY_ID, sessionLook } from './brands.js';

THREE.ColorManagement.enabled = false; // palette hexes go to the screen untouched

const FRAME_H = 180; // the standard internal height; tiles keep its pixel density
const FOV = 35; // the viewer's camera
const CAM = new THREE.Vector3(0, 0.43, 2.7); // the viewer's crew close-up offset, straight on
// The viewer's crew close-up (viewer.js VIEWS.crew), relative to the crew spot.
const CREW_CAM = { pos: new THREE.Vector3(0.35, 0.95, 2.7), target: new THREE.Vector3(0, 0.52, 0) };
const ASTRO_K = { ...ASTRO_DEFAULTS, ...ASTRO_VARIANTS.find((v) => v.id === 'K').params };
const CREW_COLORS = ['coral', 'lilac']; // the two astronauts beside the drone
export const DRONE_HOVER = 0.52; // crew shot: the drone's head centre above the crew's floor
const PIXK = (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / FRAME_H; // one pixel's size per unit depth (every tile keeps 180p density)

const gl = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(new THREE.Color(SPACE), 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
const drone = makeDrone();
scene.add(drone.group);
const crew = CREW_COLORS.map((color, i) => {
  const a = makeAstronaut({ color, eyes: [0, 5][i] });
  a.setParams(ASTRO_K);
  a.group.visible = false;
  scene.add(a.group);
  return a;
});

// A palette by key (base, ember or a brand id), or a palette object (a session's seeded trim).
const paletteOf = (key) => (key && typeof key === 'object' ? key : PALETTES[key] ?? BRAND_PALETTES[key] ?? PALETTES.base);

// More drones for squad scenes (several drones with the crew), made on first use.
const pool = [drone];
const droneN = (i) => { while (pool.length <= i) { const d = makeDrone(); d.group.visible = false; scene.add(d.group); pool.push(d); } return pool[i]; };
// The viewer's system view (viewer.js VIEWS.system) puts the camera 5.98 from the crew spot,
// against 2.78 for the crew close-up; a squad tile keeps that distance, centred on the squad.
export const SYSTEM_DIST = Math.hypot(0.1 + 1.35, 1.3 + 0.2, 10.2 - 4.6);
const CLOSE_DIST = CREW_CAM.pos.distanceTo(CREW_CAM.target);

// A squad: K astronauts and several drones (cell.squad: [{ params, palette, x, y, z, yaw, t }]),
// seen from the crew close-up or from the system view's distance (cell.view: 'crew' | 'system').
function renderSquad(cell, w, h) {
  const { t = 0, smoke = true, motion = false, view = 'crew', astros = [[-0.95, 0.03, -0.2, 0.4], [0.95, 0.03, -0.25, -0.4]] } = cell;
  if (gl.width !== w || gl.height !== h) renderer.setSize(w, h, false);
  camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (h / FRAME_H)) * 180) / Math.PI;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  crew.forEach((a, i) => {
    const at = astros[i];
    a.group.visible = !!at;
    if (!at) return;
    a.group.position.set(at[0], at[1], at[2]);
    a.update(t + i * 3.4, { yaw: at[3], sway: 1, blink: 1 });
  });
  pool.forEach((d) => (d.group.visible = false));
  cell.squad.forEach((m, i) => {
    const d = droneN(i);
    d.setParams(m.params);
    d.setPalette(paletteOf(m.palette));
    d.group.visible = true;
    d.group.position.set(m.x, m.y, m.z);
    d.update(t + (m.t ?? 0), { yaw: m.yaw ?? 0, motion, smoke, pixK: PIXK });
  });
  const dir = CREW_CAM.pos.clone().sub(CREW_CAM.target).normalize();
  const target = CREW_CAM.target.clone().add(new THREE.Vector3(0, cell.lift ?? 0, 0));
  camera.position.copy(target).addScaledVector(dir, view === 'system' ? SYSTEM_DIST : CLOSE_DIST);
  camera.lookAt(target);
  renderer.render(scene, camera);
  pool.forEach((d, i) => (d.group.visible = i === 0));
  return gl;
}

// One w x h tile: a crop of a 180-tall frame centred on the drone, at the standard pixel
// density (zoom 2 brings the camera twice as close). cell.crew renders the crew shot instead:
// astronaut, drone, astronaut, as the viewer lines up its crew (0.72 apart, turned 0.4 / 0.05 / -0.4).
function renderTile(cell, w, h) {
  if (cell.squad) return renderSquad(cell, w, h);
  const { params = {}, yaw = 0, t = 0, zoom = 1, palette = 'base', motion = false, blink = null, smoke = true, faceDebug = false } = cell;
  const pixK = PIXK / zoom;
  if (gl.width !== w || gl.height !== h) renderer.setSize(w, h, false);
  drone.setParams(params);
  drone.setPalette(paletteOf(palette));
  drone.group.visible = !cell.empty; // the empty-output control (lab.mjs)
  camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (h / FRAME_H)) * 180) / Math.PI;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (cell.crew) {
    crew.forEach((a, i) => {
      a.group.visible = true;
      a.group.position.set(i === 0 ? -0.72 : 0.72, 0.03, 0);
      a.update(t + i * 3.4, { yaw: i === 0 ? 0.4 : -0.4, sway: 1, blink: 1 });
    });
    drone.group.position.set(0, DRONE_HOVER, 0);
    drone.update(t, { yaw: 0.05 + yaw, motion, blink, smoke, pixK: PIXK, faceDebug });
    camera.position.copy(CREW_CAM.pos);
    camera.lookAt(CREW_CAM.target);
  } else {
    crew.forEach((a) => (a.group.visible = false));
    const { top, bottom } = extents(drone.layout);
    drone.group.position.set(0, 0, 0);
    drone.update(t, { yaw, motion, blink, smoke, pixK, faceDebug });
    const cy = (top + bottom) / 2 - 0.07 - (cell.frameLow ?? 0); // a little low, to leave room for the smoke
    camera.position.copy(CAM).multiplyScalar(1 / zoom).add(new THREE.Vector3(0, cy, 0));
    camera.lookAt(0, cy, 0);
  }
  renderer.render(scene, camera);
  return gl;
}

// Allowed colours: the drone's palette plus space (plus the crew's BLK 36 roles in the crew shot).
const hexInt = (h) => parseInt(h.slice(1), 16);
function allowedSet(cell) {
  const hexes = [...paletteHexes(paletteOf(cell.palette)), SPACE];
  if (cell.squad) for (const m of cell.squad) hexes.push(...paletteHexes(paletteOf(m.palette)));
  if (cell.crew || cell.squad) hexes.push(...CREW.suit, ...CREW.gear, ...CREW.visor, CREW.glint, ...CREW_COLORS.flatMap((c) => CREW.contributors[c]));
  return new Set(hexes.map(hexInt));
}
// Per tile: stray colours (must be 0), silhouette pieces (8-connected), figure pixels, height.
function tileStats(data, w, h, cell) {
  const ok = allowedSet(cell);
  const bg = hexInt(SPACE);
  const mask = new Uint8Array(w * h);
  let stray = 0, top = h, bottom = -1, figure = 0;
  for (let i = 0; i < w * h; i++) {
    const c = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    if (!ok.has(c)) stray++;
    if (c !== bg) { mask[i] = 1; figure++; const y = Math.floor(i / w); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  let pieces = 0;
  const seen = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    pieces++;
    seen[i] = 1; stack.push(i);
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
  }
  const edge = [0, w - 1].some((x) => { for (let y = 0; y < h; y++) if (mask[y * w + x]) return true; return false; })
    || [0, h - 1].some((y) => { for (let x = 0; x < w; x++) if (mask[y * w + x]) return true; return false; });
  return { stray, pieces, figure, heightPx: bottom - top + 1, clipped: edge };
}

// Wraps text to a width; returns lines.
function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A labelled sheet. rows: [{ label, cells: [cell, ...] }]; heads: per column [title, sub].
 * Tiles are w x h internal pixels, upscaled by `scale` (nearest). Labels are drawn at
 * output resolution, outside the pixel pass. Returns the canvas and per-tile stats.
 */
function sheet(spec) {
  const { rows, heads = [], w, h, scale, rowLabelW = 0, headH = 0, gap = 6, title = '', footer = '', crispLabels = false, check = true } = spec;
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const titleH = title ? 26 : 0;
  const footH = footer ? 22 : 0;
  const capH = rows.some((r) => r.cells.some((c) => c.caption)) ? 18 : 0; // per-tile captions under each row
  const out = document.createElement('canvas');
  out.width = rowLabelW + gap + cols * (w * scale + gap);
  out.height = titleH + headH + gap + rows.length * (h * scale + capH + gap) + footH;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textBaseline = 'top';
  if (title) { ctx.fillStyle = '#e6e0ee'; ctx.font = '600 15px ui-monospace, Menlo, monospace'; ctx.fillText(title, gap + 2, 7); }
  const tw = w * scale;
  heads.forEach(([t, sub, mark], c) => {
    const x = rowLabelW + gap + c * (tw + gap);
    ctx.fillStyle = mark ? '#00ffd5' : '#fff6e4';
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.fillText(t, x + 2, titleH + 6);
    if (sub) {
      ctx.fillStyle = '#a99cbf';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      wrap(ctx, sub, tw - 4).slice(0, 5).forEach((l, i) => ctx.fillText(l, x + 2, titleH + 26 + i * 13));
    }
  });
  const native = document.createElement('canvas');
  native.width = w; native.height = h;
  const nctx = native.getContext('2d', { willReadFrequently: true });
  const stats = [];
  rows.forEach((row, r) => {
    const y = titleH + headH + gap + r * (h * scale + capH + gap);
    if (row.label) {
      ctx.fillStyle = '#e6e0ee';
      ctx.font = '12px ui-monospace, Menlo, monospace';
      wrap(ctx, row.label, rowLabelW - 8).forEach((l, i) => ctx.fillText(l, gap + 2, y + (h * scale) / 2 - 8 + i * 14));
    }
    row.cells.forEach((cell, c) => {
      const x = rowLabelW + gap + c * (tw + gap);
      let st = null;
      if (check) {
        // Connectivity is judged with smoke and sparkles off: they float free by design.
        renderTile({ ...cell, smoke: false }, w, h);
        nctx.drawImage(gl, 0, 0);
        const bare = nctx.getImageData(0, 0, w, h).data;
        st = tileStats(bare, w, h, cell);
        renderTile(cell, w, h);
        nctx.drawImage(gl, 0, 0);
        const full = nctx.getImageData(0, 0, w, h).data;
        const fs = tileStats(full, w, h, cell);
        let smokePx = 0;
        for (let i = 0; i < full.length; i += 4) if (full[i] !== bare[i] || full[i + 1] !== bare[i + 1] || full[i + 2] !== bare[i + 2]) smokePx++;
        // Squads overlap by design, so their piece count is not checked (want = pieces).
        stats.push({ row: r, col: c, stray: fs.stray, figure: fs.figure, clipped: fs.clipped, pieces: st.pieces, heightPx: st.heightPx, smokePx, want: cell.squad ? st.pieces : intendedPieces() + (cell.crew ? crew.length : 0) });
      } else {
        renderTile(cell, w, h);
        if (spec.paletteCheck) {
          nctx.drawImage(gl, 0, 0);
          const fs = tileStats(nctx.getImageData(0, 0, w, h).data, w, h, cell);
          stats.push({ row: r, col: c, stray: fs.stray, figure: fs.figure, clipped: fs.clipped, pieces: 1, want: 1, smokePx: 0 });
        }
      }
      ctx.drawImage(gl, x, y, tw, h * scale);
      if (cell.mark) { ctx.strokeStyle = '#00ffd5'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, tw + 4, h * scale + 4); }
      if (cell.badge) { // a label outside the pixel pass, e.g. "new glyph, needs approval"
        ctx.font = '600 11px ui-monospace, Menlo, monospace';
        const bw = ctx.measureText(cell.badge).width + 8;
        ctx.fillStyle = '#ffe091'; ctx.fillRect(x + 2, y + 2, bw, 16);
        ctx.fillStyle = '#111'; ctx.fillText(cell.badge, x + 6, y + 4);
      }
      if (cell.caption) {
        ctx.fillStyle = '#fff6e4';
        ctx.font = '12px ui-monospace, Menlo, monospace';
        ctx.fillText(cell.caption, x + 2, y + h * scale + 3);
      }
    });
  });
  if (footer) { ctx.fillStyle = '#a99cbf'; ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillText(footer, gap + 2, out.height - footH + 5); }
  if (crispLabels) snapLabels(ctx, out.width, out.height, rows, { w: tw, h: h * scale, rowLabelW, gap, top: titleH + headH + gap, capH });
  return { canvas: out, stats };
}

// For GIFs: label pixels (outside the tiles) snap to the background or the caption colour, so
// text antialiasing can't push the frame past 256 colours and make ffmpeg merge palette colours.
function snapLabels(ctx, W, H, rows, { w, h, rowLabelW, gap, top, capH }) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const inTile = (x, y) => rows.some((row, r) => {
    const y0 = top + r * (h + capH + gap);
    return y >= y0 && y < y0 + h && x >= rowLabelW + gap && (x - rowLabelW - gap) % (w + gap) < w && Math.floor((x - rowLabelW - gap) / (w + gap)) < row.cells.length;
  });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inTile(x, y)) continue;
    const i = (y * W + x) * 4;
    const on = d[i] + d[i + 1] + d[i + 2] > 3 * (0x11 + 0xf0) / 2;
    d[i] = on ? 0xff : 0x11; d[i + 1] = on ? 0xf6 : 0x11; d[i + 2] = on ? 0xe4 : 0x11;
  }
  ctx.putImageData(img, 0, 0);
}

/** Direction params by id (variants, D-final and the brand drones). */
const ALL = [...VARIANTS, FINAL, ...BRANDS];
const paramsOf = (id) => ({ ...DEFAULTS, ...ALL.find((v) => v.id === id).params });
// A cell may name a brand (and a session seed): its params, palette and phase come from the brand.
function resolveCell(c) {
  if (c.squad) return { ...c, squad: c.squad.map(resolveCell) };
  if (c.brand) {
    const look = sessionLook(c.brand, c.seed);
    return { ...c, params: { ...DEFAULTS, ...look.params, ...(c.params ?? {}) }, palette: c.palette ?? look.palette, t: (c.t ?? 0) + (c.phased ? look.phase : 0) };
  }
  return { ...c, params: c.variant ? { ...paramsOf(c.variant), ...(c.params ?? {}) } : c.params };
}

window.lab = {
  ready: true,
  variants: ALL.map((v) => ({ id: v.id, name: v.name, leaning: v.leaning, params: paramsOf(v.id) })),
  /** Face probe: renders one tile with eyes painted pure red and glyphs pure green; returns their pixel counts. */
  faceProbe(cell, w, h) {
    renderTile({ ...resolveCell(cell), faceDebug: true }, w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(gl, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    let eyes = 0, glyphs = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0) eyes++;
      if (d[i] === 0 && d[i + 1] === 255 && d[i + 2] === 0) glyphs++;
    }
    return { eyes, glyphs };
  },
  /** Renders a sheet spec (cells name directions by `variant`) and returns a PNG data URL and stats. */
  /** One bare tile (smoke off): its RGB pixels, for the A4 distinctness metrics in lab.mjs. */
  pixels(cell, w, h) {
    renderTile({ ...resolveCell(cell), smoke: false }, w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(gl, 0, 0);
    const d = x.getImageData(0, 0, w, h).data, rgb = new Array(w * h);
    for (let i = 0; i < w * h; i++) rgb[i] = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
    return rgb;
  },
  sheet(spec) {
    const rows = spec.rows.map((r) => ({ ...r, cells: r.cells.map(resolveCell) }));
    const { canvas, stats } = sheet({ ...spec, rows });
    return { png: canvas.toDataURL('image/png'), stats };
  },
};

// ---------------------------------------------------------------- live page
const ui = document.getElementById('ui');
if (ui) {
  const view = document.getElementById('view');
  const stage = document.getElementById('stage');
  const vctx = view.getContext('2d');
  const state = { params: paramsOf(FINAL.id), variant: FINAL.id, mode: 'views', animate: true, motion: true, smoke: true, spin: false, palette: 'base' };
  const picker = document.getElementById('variants');
  const sliders = document.getElementById('sliders');
  const json = document.getElementById('json');
  const controls = {};

  for (const v of ALL) {
    const b = document.createElement('button');
    b.textContent = v.id;
    b.title = `${v.name}: ${v.leaning}`;
    b.onclick = () => {
      state.params = paramsOf(v.id); state.variant = v.id;
      if (BRAND_BY_ID[v.id] || state.palette in BRAND_PALETTES) palSel.value = state.palette = BRAND_BY_ID[v.id] ? v.id : 'base';
      sync();
    };
    picker.append(b);
  }
  let group = '';
  for (const p of PARAMS) {
    if (p.group !== group) {
      group = p.group;
      const h = document.createElement('h2');
      h.textContent = group;
      sliders.append(h);
    }
    const label = document.createElement('label');
    label.title = p.words;
    const name = document.createElement('span');
    name.textContent = p.key;
    const readout = document.createElement('span');
    readout.className = 'readout';
    let input;
    if (p.type === 'select') {
      input = document.createElement('select');
      p.options.forEach((o, i) => input.append(new Option(o, i)));
      input.onchange = () => { state.params[p.key] = Number(input.value); state.variant = 'mix'; sync(); };
    } else {
      input = document.createElement('input');
      Object.assign(input, { type: 'range', min: p.min, max: p.max, step: p.step });
      input.oninput = () => { state.params[p.key] = Number(input.value); state.variant = 'mix'; sync(); };
    }
    label.append(name, readout, input);
    sliders.append(label);
    controls[p.key] = { input, readout };
  }
  const palSel = document.getElementById('palette');
  Object.entries({ ...PALETTES, ...BRAND_PALETTES }).forEach(([k, p]) => palSel.append(new Option(p.name, k)));
  palSel.onchange = () => (state.palette = palSel.value);
  document.getElementById('mode').onchange = (e) => (state.mode = e.target.value);
  document.getElementById('animate').onchange = (e) => (state.animate = e.target.checked);
  document.getElementById('spin').onchange = (e) => (state.spin = e.target.checked);
  document.getElementById('motion').onchange = (e) => (state.motion = e.target.checked);
  document.getElementById('smoke').onchange = (e) => (state.smoke = e.target.checked);
  document.getElementById('copy').onclick = () => navigator.clipboard?.writeText(json.value);

  function sync() {
    for (const p of PARAMS) {
      const { input, readout } = controls[p.key];
      input.value = state.params[p.key];
      readout.textContent = p.type === 'select' ? '' : String(state.params[p.key]);
    }
    const diff = Object.fromEntries(Object.entries(state.params).filter(([k, v]) => v !== DEFAULTS[k]));
    json.value = JSON.stringify(diff, null, 1);
    document.getElementById('current').textContent = state.variant === 'mix' ? 'mix (edited)' : `${state.variant} · ${ALL.find((v) => v.id === state.variant).name}`;
  }
  sync();

  const t0 = performance.now();
  function frame() {
    const t = state.animate ? (performance.now() - t0) / 1000 : 0;
    const spin = state.spin ? t * ((Math.PI * 2) / 6) : 0;
    const base = { t, palette: state.palette, motion: state.motion, smoke: state.smoke };
    const mine = (yaw, extra = {}) => ({ ...base, params: state.params, yaw: yaw + spin, ...extra });
    let spec;
    if (state.mode === 'views') {
      spec = { w: 100, h: 100, rows: [{ cells: [[0, 'front'], [-0.75, '3/4'], [-Math.PI / 2, 'side'], [Math.PI, 'back']].map(([y, caption]) => mine(y, { caption })) }] };
    } else if (state.mode === 'zoom') {
      spec = { w: 180, h: 180, rows: [{ cells: [[-0.75, '3/4'], [-Math.PI / 2, 'side']].map(([y, caption]) => mine(y, { zoom: 2, caption })) }] };
    } else if (state.mode === 'crew') {
      spec = { w: 320, h: 180, rows: [{ cells: [mine(0, { crew: true, caption: 'crew close-up, 320x180' })] }] };
    } else if (state.mode === 'motion') {
      spec = { w: 220, h: 170, rows: [{ cells: [mine(-0.5, { zoom: 2, motion: true, caption: 'motion loop, 2x close-up (camera fixed)' })] }] };
    } else {
      const cells = [...VARIANTS.map((v) => ({ ...base, params: paramsOf(v.id), yaw: -0.75 + spin, caption: `${v.id} · ${v.name}` })), mine(-0.75, { caption: 'mix' })];
      spec = { w: 100, h: 100, rows: [cells.slice(0, 3), cells.slice(3)].map((c) => ({ cells: c })) };
    }
    // The largest integer upscale that fits the stage (nearest, never fractional).
    const cols = Math.max(...spec.rows.map((r) => r.cells.length));
    const fitW = (stage.clientWidth - 24) / (cols * (spec.w + 6)), fitH = (stage.clientHeight - 24) / (spec.rows.length * (spec.h + 24));
    spec.scale = Math.max(1, Math.min(4, Math.floor(Math.min(fitW, fitH))));
    const { canvas } = sheet({ ...spec, check: false });
    if (view.width !== canvas.width || view.height !== canvas.height) { view.width = canvas.width; view.height = canvas.height; }
    vctx.drawImage(canvas, 0, 0);
    requestAnimationFrame(frame);
  }
  frame();
}

