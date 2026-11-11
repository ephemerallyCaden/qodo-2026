// Pixel statistics for the fog lab's measures. Pure: frames in ({ w, h, data } RGBA), numbers out.
// Colour maths (OKLab), the disc geometry, the look vector and the glance floor are health-looks'
// own (../health-looks/metrics.mjs and analyse.mjs, imported read-only), so "reads as" means the same
// thing here as there.
import { oklab, toLinear, hexToOklab, hexToRgb, discGeometry, DISC_REACH, lookVector, dist, centroid, mean } from '../health-looks/metrics.mjs';
import { GLANCE } from '../health-looks/analyse.mjs';
import { V2_PLANET_RAMPS, ACCENTS } from '../asset-viewer/planet-ramps.js';

export { GLANCE, discGeometry, lookVector, dist, centroid, mean };

/** The viewer's biome -> ramp keys (viewer.js BIOMES, checked by test/pure.test.mjs) and weather ramp. */
export const BIOME_RAMPS = {
  lush: ['ocean', 'land', 'cap', 'glow'], ocean: ['water', 'land', 'cap', 'glow'], ice: ['ice', 'crevasse', 'water', 'glow'],
  desert: ['sand', 'rock', 'cap', 'glow'], lava: ['crust', 'crust', 'ash', 'glow'], toxic: ['sludge', 'toxic', 'fungus', 'glow'],
};
export const WEATHER_RAMP = { lush: 'cloud', ocean: 'cloud', lava: 'ash', toxic: 'spore' };

const key = (r, g, b) => (r << 16) | (g << 8) | b;
const hexKey = (hex) => key(...hexToRgb(hex));
/** Every colour a biome's surface can paint (its four ramps), as RGB keys. */
export const rampKeys = (biome) => new Set(BIOME_RAMPS[biome].flatMap((k) => V2_PLANET_RAMPS[k]).map(hexKey));
/** A ramp's colours in OKLab. */
export const rampLab = (name) => V2_PLANET_RAMPS[name].map(hexToOklab);
export const TEAL_LAB = ACCENTS.reveal.slice(2).map(hexToOklab); // the two bright steps: the dark ones sit near the land ramp's darks (#123d33 is 0.026 from #004538)
export const TEAL_CORE = hexKey(ACCENTS.reveal[3]);

export const labAt = (data, i) => oklab(toLinear(data[i]), toLinear(data[i + 1]), toLinear(data[i + 2]));
export const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
export const same = (a, b, i) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
export const keyAt = (data, i) => key(data[i], data[i + 1], data[i + 2]);
const nearSet = (lab, set) => Math.min(...set.map((q) => dE(lab, q)));

/**
 * The planet's pixels, as health-looks takes them: those that differ from the empty frame (same
 * camera, no planet) within DISC_REACH radii of the disc centre. Returns pixel indices (x + y w).
 */
export function discPixels(frame, empty, geom, reach = DISC_REACH) {
  const { w, h, data } = frame;
  const r2 = (reach * geom.r) ** 2;
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - geom.cx, dy = y + 0.5 - geom.cy;
    if (dx * dx + dy * dy > r2) continue;
    const i = (y * w + x) * 4;
    if (!same(data, empty.data, i)) out.push(y * w + x);
  }
  return out;
}

/** The fog stage of each pixel in a 'mask' render: 0 none, 1 thin, 2 rest, 3 rim or core. */
export function stages(mask) {
  const s = new Uint8Array(mask.w * mask.h);
  for (let p = 0; p < s.length; p++) {
    const i = p * 4, r = mask.data[i], g = mask.data[i + 1], b = mask.data[i + 2];
    s[p] = r === 255 && g === 0 && b === 0 ? 2 : r === 0 && g === 255 && b === 0 ? 1 : r === 0 && g === 0 && b === 255 ? 3 : 0;
  }
  return s;
}

/**
 * F2 for one render: the fog's area and how visible it is. fogged: the disc pixels the mask calls
 * fog (rest or thin); visible: the disc pixels where the fogged frame differs from the fog-off frame
 * by at least a just-noticeable difference (0.02); contrast: the median difference over the fogged
 * pixels that aren't under a cloud (`open`, a pixel set), in OKLab.
 */
export function fogVisibility(frame, off, disc, st, open = null) {
  let fog = 0, vis = 0;
  const ds = [];
  for (const p of disc) {
    const i = p * 4;
    const d = same(frame.data, off.data, i) ? 0 : dE(labAt(frame.data, i), labAt(off.data, i));
    if (d >= 0.02) vis++;
    if (st[p] === 1 || st[p] === 2) {
      fog++;
      if (!open || open.has(p)) ds.push(d);
    }
  }
  ds.sort((a, b) => a - b);
  return { n: disc.length, fogged: fog / disc.length, visible: vis / disc.length, contrast: ds.length ? ds[Math.floor(ds.length / 2)] : 0 };
}

/** Teal in a frame: pixels exactly the core teal (#00ffd5), and pixels within 0.05 of the bright teal steps (#00bc9c, #00ffd5). */
export function tealCount(frame) {
  let core = 0, near = 0;
  for (let p = 0; p < frame.w * frame.h; p++) {
    const i = p * 4;
    if (keyAt(frame.data, i) === TEAL_CORE) core++;
    if (frame.data[i + 1] > frame.data[i] + 40 && nearSet(labAt(frame.data, i), TEAL_LAB) < 0.05) near++;
  }
  return { core, near, share: near / (frame.w * frame.h) };
}

/** Pixels (a Set of indices) where two frames differ. */
export function diffSet(a, b) {
  const out = new Set();
  for (let p = 0; p < a.w * a.h; p++) if (!same(a.data, b.data, p * 4)) out.add(p);
  return out;
}
export const iou = (a, b) => {
  let inter = 0;
  for (const p of a) if (b.has(p)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 1;
};

/**
 * F8's layer statistics. layer: a Set of pixel indices; frame: the render the layer is drawn in
 * (depth off, so colours are exact); geom: the disc. bulge: the share of the layer beyond the disc's
 * silhouette (r + 0.5 px); ramps: the share whose colour is one of the biome's surface ramp
 * colours; weatherNear: the share within 0.05 of the cloud, ash or spore ramps.
 */
export function layerStats(layer, frame, geom, biome) {
  const keys = rampKeys(biome);
  const weather = ['cloud', 'ash', 'spore'].flatMap(rampLab);
  let out = 0, inRamp = 0, wNear = 0;
  for (const p of layer) {
    const x = (p % frame.w) + 0.5, y = Math.floor(p / frame.w) + 0.5;
    if (Math.hypot(x - geom.cx, y - geom.cy) > geom.r + 0.5) out++;
    const i = p * 4;
    if (keys.has(keyAt(frame.data, i))) inRamp++;
    if (nearSet(labAt(frame.data, i), weather) < 0.05) wNear++;
  }
  const n = Math.max(1, layer.size);
  return { px: layer.size, bulge: out / n, ramps: inRamp / n, weatherNear: wNear / n };
}

/** The share of a layer's pixels that change between consecutive frames (frames: an array). */
export function flicker(layer, frames) {
  if (!layer.size || frames.length < 2) return 0;
  let changed = 0;
  for (let k = 1; k < frames.length; k++) for (const p of layer) if (!same(frames[k].data, frames[k - 1].data, p * 4)) changed++;
  return changed / (layer.size * (frames.length - 1));
}

// ---------------------------------------------------------------- the band read (F3)
/**
 * The band a measured disc reads as: the band of the nearest clear look centroid (health-looks' H5
 * read, against clear centroids). margin: the distance to the nearest other band's look minus the
 * distance to the nearest look of its own band (negative = misread); confusable: another band's look
 * within GLANCE.
 */
export function readBand(vec, centroids, bandOf, band) {
  const d = Object.entries(centroids).map(([look, c]) => ({ look, d: dist(vec, c) })).sort((p, q) => p.d - q.d);
  const own = d.find((x) => bandOf(x.look) === band), other = d.find((x) => bandOf(x.look) !== band);
  return { nearest: d[0].look, read: bandOf(d[0].look), margin: other.d - own.d, dOwn: own.d, otherLook: other.look, dOther: other.d, confusable: other.d < GLANCE };
}

/**
 * The per-pixel vote (the debris lab's classifier): each disc pixel votes for the band whose clear
 * discs hold the nearest colour. palettes: band -> array of OKLab colours seen on that band's clear
 * discs. Votes are cached per RGB. Returns the vote share per band. With `cut`, only pixels within
 * that distance of some clear colour vote (what still shows as a planet colour: the dark veil's mixed
 * colours sit far from every palette and are left out); `voted` is the share of the disc that voted.
 */
export function pixelVote(frame, disc, palettes, cache = new Map(), cut = Infinity) {
  const votes = Object.fromEntries(Object.keys(palettes).map((b) => [b, 0]));
  let n = 0;
  for (const p of disc) {
    const i = p * 4, k = keyAt(frame.data, i);
    let hit = cache.get(k);
    if (hit === undefined) {
      const lab = labAt(frame.data, i);
      let best = Infinity, band;
      for (const [b, cols] of Object.entries(palettes)) for (const c of cols) { const d = dE(lab, c); if (d < best) [best, band] = [d, b]; }
      hit = [band, best];
      cache.set(k, hit);
    }
    if (hit[1] >= cut) continue;
    votes[hit[0]]++;
    n++;
  }
  for (const b of Object.keys(votes)) votes[b] /= Math.max(1, n);
  return Object.assign(votes, { voted: n / Math.max(1, disc.length) });
}

/** Unique colours (OKLab) of a set of pixels in a frame, added to `into` (a Map key -> lab). */
export function collectColours(frame, disc, into) {
  for (const p of disc) { const k = keyAt(frame.data, p * 4); if (!into.has(k)) into.set(k, labAt(frame.data, p * 4)); }
  return into;
}
