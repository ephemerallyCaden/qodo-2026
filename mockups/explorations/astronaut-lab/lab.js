// Astronaut lab page: renders the parameterised astronaut in labelled sheets through the
// pixel pipeline (each tile is a crop of the standard 320x180 frame, nearest-upscaled), plus
// a live mixer with a variant picker and per-parameter sliders. window.lab drives headless capture.
import * as THREE from 'three';
import { EYE_DESIGNS } from '../../asset-viewer/faces.js';
import { makeAstronaut } from './astronaut.js';
import { CREW, SPACE } from './crew.js';
import { PARAMS, DEFAULTS } from './params.js';
import { VARIANTS } from './variants.js';

THREE.ColorManagement.enabled = false; // palette hexes go to the screen untouched

const FRAME_H = 180; // the standard internal height; tiles keep its pixel density
const FOV = 35; // the viewer's camera
const CAM = new THREE.Vector3(0, 0.43, 2.7); // the viewer's crew close-up offset, straight on
const TARGET_Y = 0.49;

const gl = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(new THREE.Color(SPACE), 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
const astro = makeAstronaut({ color: 'mint', eyes: 0 });
scene.add(astro.group);

// One w x h tile: a crop of a 180-tall frame centred on the figure, at the standard pixel
// density. zoom 2 brings the camera twice as close (the figure is twice as many pixels tall).
function renderTile(cell, w, h) {
  const { params = {}, yaw = 0, t = 0, zoom = 1, color = 'mint', eyes = 0, sway = 0, blink = 1 } = cell;
  if (gl.width !== w || gl.height !== h) renderer.setSize(w, h, false);
  astro.setParams(params);
  astro.setColor(color);
  astro.setEyes(eyes);
  astro.update(t, { yaw, sway, blink });
  camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (h / FRAME_H)) * 180) / Math.PI;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.position.copy(CAM).multiplyScalar(1 / zoom).add(new THREE.Vector3(0, TARGET_Y, 0));
  camera.lookAt(0, TARGET_Y, 0);
  renderer.render(scene, camera);
  return gl;
}

// Allowed colours: BLK 36 crew roles (with the accent ramps in use) plus the space colour.
const hexInt = (h) => parseInt(h.slice(1), 16);
function allowedSet(color) {
  return new Set([...CREW.suit, ...CREW.gear, ...CREW.visor, CREW.glint, ...CREW.contributors[color], SPACE].map(hexInt));
}
// Per tile: stray colours (must be 0), silhouette pieces (8-connected, must be 1), height in px.
function tileStats(data, w, h, color) {
  const ok = allowedSet(color);
  const bg = hexInt(SPACE);
  const mask = new Uint8Array(w * h);
  let stray = 0, top = h, bottom = -1;
  const used = new Set();
  for (let i = 0; i < w * h; i++) {
    const c = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    used.add(c);
    if (!ok.has(c)) stray++;
    if (c !== bg) { mask[i] = 1; const y = Math.floor(i / w); top = Math.min(top, y); bottom = Math.max(bottom, y); }
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
  return { stray, pieces, heightPx: bottom - top + 1, colours: used.size, clipped: edge };
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
function sheet({ rows, heads = [], w, h, scale, rowLabelW = 0, headH = 0, gap = 6, title = '', crispLabels = false }) {
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const titleH = title ? 26 : 0;
  const capH = rows.some((r) => r.cells.some((c) => c.caption)) ? 18 : 0; // per-tile captions under each row
  const out = document.createElement('canvas');
  out.width = rowLabelW + gap + cols * (w * scale + gap);
  out.height = titleH + headH + gap + rows.length * (h * scale + capH + gap);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textBaseline = 'top';
  if (title) { ctx.fillStyle = '#e6e0ee'; ctx.font = '600 15px ui-monospace, Menlo, monospace'; ctx.fillText(title, gap + 2, 7); }
  const tw = w * scale;
  heads.forEach(([t, sub], c) => {
    const x = rowLabelW + gap + c * (tw + gap);
    ctx.fillStyle = '#fff6e4';
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.fillText(t, x + 2, titleH + 6);
    if (sub) {
      ctx.fillStyle = '#a99cbf';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      wrap(ctx, sub, tw - 4).slice(0, 4).forEach((l, i) => ctx.fillText(l, x + 2, titleH + 26 + i * 13));
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
      renderTile(cell, w, h);
      nctx.drawImage(gl, 0, 0);
      stats.push({ row: r, col: c, ...tileStats(nctx.getImageData(0, 0, w, h).data, w, h, cell.color ?? 'mint') });
      ctx.drawImage(gl, rowLabelW + gap + c * (tw + gap), y, tw, h * scale);
      if (cell.caption) {
        ctx.fillStyle = '#fff6e4';
        ctx.font = '12px ui-monospace, Menlo, monospace';
        ctx.fillText(cell.caption, rowLabelW + gap + c * (tw + gap) + 2, y + h * scale + 3);
      }
    });
  });
  if (crispLabels) snapLabels(ctx, out.width, out.height, rows, { w: tw, h: h * scale, rowLabelW, gap, top: titleH + headH + gap, capH });
  return { canvas: out, stats };
}

// For GIFs: label pixels (outside the tiles) snap to the background or the caption colour, so
// text antialiasing can't push the frame past 256 colours and make ffmpeg merge crew colours.
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

/** Variant params by id, or a variant's params mixed with overrides. */
const paramsOf = (id) => ({ ...DEFAULTS, ...VARIANTS.find((v) => v.id === id).params });

window.lab = {
  ready: true,
  variants: VARIANTS.map((v) => ({ id: v.id, name: v.name, leaning: v.leaning, params: paramsOf(v.id) })),
  eyeDesigns: EYE_DESIGNS,
  /** Renders a sheet spec (cells name variants by `variant`) and returns a PNG data URL and stats. */
  sheet(spec) {
    const rows = spec.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, params: c.variant ? { ...paramsOf(c.variant), ...(c.params ?? {}) } : c.params })) }));
    const { canvas, stats } = sheet({ ...spec, rows });
    return { png: canvas.toDataURL('image/png'), stats };
  },
};

// ---------------------------------------------------------------- live mixer
const ui = document.getElementById('ui');
if (ui) {
  const view = document.getElementById('view');
  const stage = document.getElementById('stage');
  const vctx = view.getContext('2d');
  const state = { params: paramsOf('A'), variant: 'A', mode: 'mix', animate: true, spin: false, yaw: 0, color: 'mint', eyes: 0 };
  const picker = document.getElementById('variants');
  const sliders = document.getElementById('sliders');
  const json = document.getElementById('json');
  const controls = {};

  for (const v of VARIANTS) {
    const b = document.createElement('button');
    b.textContent = v.id;
    b.title = `${v.name}: ${v.leaning}`;
    b.onclick = () => { state.params = paramsOf(v.id); state.variant = v.id; sync(); };
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
  const eyesSel = document.getElementById('eyes');
  EYE_DESIGNS.forEach((d, i) => eyesSel.append(new Option(d.name, i)));
  eyesSel.onchange = () => (state.eyes = Number(eyesSel.value));
  document.getElementById('color').onchange = (e) => (state.color = e.target.value);
  document.getElementById('mode').onchange = (e) => (state.mode = e.target.value);
  document.getElementById('animate').onchange = (e) => (state.animate = e.target.checked);
  document.getElementById('spin').onchange = (e) => (state.spin = e.target.checked);
  document.getElementById('copy').onclick = () => navigator.clipboard?.writeText(json.value);

  function sync() {
    for (const p of PARAMS) {
      const { input, readout } = controls[p.key];
      input.value = state.params[p.key];
      readout.textContent = p.type === 'select' ? '' : String(state.params[p.key]);
    }
    const diff = Object.fromEntries(Object.entries(state.params).filter(([k, v]) => v !== DEFAULTS[k]));
    json.value = JSON.stringify(diff, null, 1);
    document.getElementById('current').textContent = state.variant === 'mix' ? 'mix (edited)' : `${state.variant} · ${VARIANTS.find((v) => v.id === state.variant).name}`;
  }
  sync();

  const t0 = performance.now();
  function frame() {
    const t = state.animate ? (performance.now() - t0) / 1000 : 0;
    const spin = state.spin ? t * ((Math.PI * 2) / 6) : 0;
    const base = { t, color: state.color, eyes: state.eyes, sway: state.animate ? 1 : 0 };
    const mine = (yaw, extra = {}) => ({ ...base, params: state.params, yaw: yaw + spin, ...extra });
    let spec;
    if (state.mode === 'mix') {
      spec = { w: 100, h: 128, rows: [{ cells: [[0, 'front'], [-0.75, '3/4'], [-Math.PI / 2, 'side'], [Math.PI, 'back']].map(([y, caption]) => mine(y, { caption })) }] };
    } else if (state.mode === 'zoom') {
      spec = { w: 190, h: 236, rows: [{ cells: [[-0.75, '3/4'], [-Math.PI / 2, 'side']].map(([y, caption]) => mine(y, { zoom: 2, caption })) }] };
    } else {
      // Every variant at 3/4, with the current mix as the last tile.
      const cells = [...VARIANTS.map((v) => ({ ...base, params: paramsOf(v.id), yaw: -0.75 + spin, caption: `${v.id} · ${v.name}` })), mine(-0.75, { caption: 'mix' })];
      spec = { w: 100, h: 128, rows: [cells.slice(0, 6), cells.slice(6)].map((c) => ({ cells: c })) };
    }
    // The largest integer upscale that fits the stage (nearest, never fractional).
    const cols = Math.max(...spec.rows.map((r) => r.cells.length));
    const fitW = (stage.clientWidth - 24) / (cols * (spec.w + 6)), fitH = (stage.clientHeight - 24) / (spec.rows.length * (spec.h + 24));
    spec.scale = Math.max(1, Math.min(4, Math.floor(Math.min(fitW, fitH))));
    const { canvas } = sheet(spec);
    if (view.width !== canvas.width || view.height !== canvas.height) { view.width = canvas.width; view.height = canvas.height; }
    vctx.drawImage(canvas, 0, 0);
    requestAnimationFrame(frame);
  }
  frame();
}
