// Palette checker: turns a render into one line of text numbers, because Qodo can't see images.
//   node check.mjs <file.png> [...]     one line per file; exit 1 if any image is blank or empty
// For every pixel it asks, in this order:
//   on palette   exactly one of our colours: the v2 world ramps (V2_PLANET_RAMPS) plus v2 space
//                and stars, the BLK 36 crew roles (art-direction §4), or the [OIII] teal ramp
//   depth fade   mix(paletteColour, tint, a) within FADE_TOL per channel, where the tint runs
//                along v2's depth tints (#1b1f4a .. #17172f) and a is at most v2's top strength,
//                i.e. what the per-pixel depth fade can produce (art-direction §5)
//   off palette  everything else
// and separately counts pure black (#000000), near black (every channel <= NEAR_BLACK, e.g. the
// faint bloom haze over a black clear colour; v2 space #0d0b16 is not near black) and teal pixels.
// Deterministic: integer pixel maths, colours visited in first-seen order, fixed formatting.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png.mjs';
import { V2_PLANET_RAMPS, ACCENTS } from '../asset-viewer/planet-ramps.js';
import { mapPalette } from '../asset-viewer/palette-map.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Max per-channel distance (of 255) from the nearest depth-fade colour; covers 8-bit rounding of the GPU blend. */
export const FADE_TOL = 1.5;
/** An image is blank when fewer than this share of pixels differ from its most common colour. */
export const MIN_SCENE_SHARE = 0.01;
/** Max channel value (of 255) for a pixel to count as near black. */
export const NEAR_BLACK = 8;

const hexesIn = (o) => (typeof o === 'string' ? (o.startsWith('#') ? [o] : []) : o && typeof o === 'object' ? Object.values(o).flatMap(hexesIn) : []);
const toInt = (h) => parseInt(h.replace('#', ''), 16);
const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

/**
 * The reference palette. The v2 space, star and depth values live only in viewer.js (which
 * needs a browser), so render.mjs copies them from the live viewer into scene-palette.json.
 */
export async function loadPalette(file = path.join(HERE, 'scene-palette.json')) {
  const scene = JSON.parse(await readFile(file, 'utf8'));
  const crew = mapPalette('blk-36');
  const world = [...hexesIn(V2_PLANET_RAMPS), scene.space, ...scene.stars];
  const crewHexes = hexesIn({ suit: crew.suit, gear: crew.gear, visor: crew.visor, glint: crew.glint, contributors: crew.contributors });
  const teal = ACCENTS.reveal;
  return {
    colours: [...new Set([...world, ...crewHexes, ...teal].map(toInt))],
    teal: new Set(teal.map(toInt)),
    tints: [...new Set(scene.depth.map(([t]) => t))].map((h) => rgb(toInt(h))),
    maxFade: Math.max(...scene.depth.map(([, a]) => a)),
  };
}

// Smallest max-channel error of q against mix(p, T, a) with T on the tint segment T0..T1 and
// 0 <= a <= aMax. Written as q - p = a (T0 - p) + b (T1 - T0) with 0 <= b <= a: a 2-variable
// least-squares fit, plus the edges of that triangle when the fit falls outside it.
function fadeError(q, p, [t0, t1], aMax) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const u = [t0[0] - p[0], t0[1] - p[1], t0[2] - p[2]];
  const v = [t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const err = (a, b) => Math.max(Math.abs(d[0] - a * u[0] - b * v[0]), Math.abs(d[1] - a * u[1] - b * v[1]), Math.abs(d[2] - a * u[2] - b * v[2]));
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const uu = dot(u, u), vv = dot(v, v), uv = dot(u, v), du = dot(d, u), dv = dot(d, v);
  const cands = [];
  const det = uu * vv - uv * uv;
  if (det > 1e-9) {
    const a = (du * vv - dv * uv) / det, b = (dv * uu - du * uv) / det;
    if (a >= 0 && a <= aMax && b >= 0 && b <= a) cands.push([a, b]);
  }
  // edges: b = 0 (toward T0), b = a (toward T1), a = aMax
  if (uu > 0) cands.push([clamp(du / uu, 0, aMax), 0]);
  const w = [u[0] + v[0], u[1] + v[1], u[2] + v[2]], ww = dot(w, w);
  if (ww > 0) { const a = clamp(dot(d, w) / ww, 0, aMax); cands.push([a, a]); }
  if (vv > 0) cands.push([aMax, clamp((dv - aMax * uv) / vv, 0, aMax)]);
  return Math.min(...cands.map(([a, b]) => err(a, b)));
}

/** Facts about one decoded image. Throws on an empty or blank image. */
export function checkImage({ width, height, rgba }, pal) {
  const total = width * height;
  if (!total || rgba.length < total * 4) throw new Error('empty image');
  const counts = new Map();
  for (let i = 0; i < total * 4; i += 4) {
    const k = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let top = 0;
  for (const n of counts.values()) if (n > top) top = n; // a loop, not Math.max(...): a big image has too many colours to spread
  if (counts.size < 2 || (total - top) / total < MIN_SCENE_SHARE) throw new Error(`blank image (${counts.size} colour${counts.size === 1 ? '' : 's'}, ${(100 * (total - top) / total).toFixed(2)}% off the most common one)`);
  const exact = new Set(pal.colours);
  const palRgb = pal.colours.map(rgb);
  const seg = [pal.tints[0], pal.tints[pal.tints.length - 1]];
  let onPalette = 0, fade = 0, black = 0, nearBlack = 0, teal = 0;
  for (const [k, n] of counts) {
    if (k === 0) black += n;
    if (Math.max(...rgb(k)) <= NEAR_BLACK) nearBlack += n;
    if (pal.teal.has(k)) teal += n;
    if (exact.has(k)) { onPalette += n; continue; }
    const q = rgb(k);
    if (palRgb.some((p) => fadeError(q, p, seg, pal.maxFade) <= FADE_TOL)) fade += n;
  }
  const pct = (n) => +((100 * n) / total).toFixed(2);
  return { width, height, unique: counts.size, onPalette: pct(onPalette), fade: pct(fade), offPalette: pct(total - onPalette - fade), black: pct(black), nearBlack: pct(nearBlack), teal: pct(teal) };
}

export const formatLine = (name, r) =>
  `${name}: ${r.width}x${r.height}, unique colours ${r.unique}, on palette ${r.onPalette.toFixed(2)}%, depth fade ${r.fade.toFixed(2)}% (tol ±${FADE_TOL}/255 per channel), off palette ${r.offPalette.toFixed(2)}%, pure black ${r.black.toFixed(2)}%, near black (<= ${NEAR_BLACK}/255) ${r.nearBlack.toFixed(2)}%, teal ${r.teal.toFixed(2)}%`;

/** Check PNG files; returns their lines. Throws (naming the file) on unreadable, empty or blank input. */
export async function checkFiles(files, pal) {
  pal ??= await loadPalette();
  const lines = [];
  for (const f of files) {
    try {
      lines.push(formatLine(path.basename(f), checkImage(decodePng(await readFile(f)), pal)));
    } catch (e) {
      throw new Error(`${path.basename(f)}: ${e.message}`);
    }
  }
  return lines;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node check.mjs <file.png> [...]');
    process.exit(2);
  }
  try {
    for (const line of await checkFiles(files)) console.log(line);
  } catch (e) {
    console.error(`check failed: ${e.message}`);
    process.exit(1);
  }
}
