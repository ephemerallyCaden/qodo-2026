// Colour maths and render statistics for the health-looks lab. Pure: no DOM, no three.js, no
// clock, no randomness, so the tests run it in Node and the same pixels always give the same numbers.
//
// Every statistic is in OKLab (Ottosson 2020), a perceptual space where a Euclidean step of about
// 0.02 is a just-noticeable difference, so lightness, colour and texture share one unit.
// Colour-vision deficiency is simulated with Machado, Oliveira & Fernandes (2009), severity 1.0.

// ---------------------------------------------------------------- colour
const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
/** sRGB byte -> linear-light channel. */
export const toLinear = (u8) => LIN[u8];

/** Linear sRGB -> OKLab [L, a, b] (Ottosson 2020). */
export function oklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** OKLab [L, a, b] -> linear sRGB (unclamped). */
export function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const encode = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
/** OKLab -> '#rrggbb' (clamped to sRGB). */
export const oklabToHex = (L, a, b) => `#${oklabToLinear(L, a, b).map((c) => encode(c).toString(16).padStart(2, '0')).join('')}`;
export const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const hexToOklab = (hex) => oklab(...hexToRgb(hex).map(toLinear));
/** OKLab hue angle in degrees, 0..360. */
export const hueDeg = (a, b) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

// Machado, Oliveira & Fernandes, "A Physiologically-based Model for Simulation of Color Vision
// Deficiency", IEEE TVCG 15(6), 2009: the severity-1.0 (dichromat) matrices, applied to linear RGB.
// Each row sums to 1, so greys (and the space background) are unchanged.
export const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export const VISIONS = ['normal', ...Object.keys(CVD)];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Linear RGB as seen with `vision` ('normal' or a CVD key), clamped to the displayable range. */
export function simulate(vision, r, g, b) {
  const M = CVD[vision];
  if (!M) return [r, g, b];
  return M.map(([x, y, z]) => clamp01(x * r + y * g + z * b));
}

/** RGBA bytes as seen with `vision`, re-encoded to sRGB bytes (for the CVD sheets). */
export function simulateImage(vision, data) {
  if (!CVD[vision]) return Uint8ClampedArray.from(data);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const s = simulate(vision, LIN[data[i]], LIN[data[i + 1]], LIN[data[i + 2]]);
    out[i] = encode(s[0]); out[i + 1] = encode(s[1]); out[i + 2] = encode(s[2]); out[i + 3] = data[i + 3];
  }
  return out;
}

// ---------------------------------------------------------------- geometry
/**
 * Where a planet centred at the camera target lands on screen: { cx, cy, r } in pixels, r the
 * silhouette's projected radius. camPos: the camera position (target at the origin); radius: the
 * planet's world radius; w, h: the frame in pixels; fov: the vertical field of view in degrees.
 */
export function discGeometry({ camPos, radius, w, h, fov }) {
  const d = Math.hypot(...camPos);
  const r = (Math.tan(Math.asin(radius / d)) / Math.tan((fov * Math.PI) / 360)) * (h / 2);
  return { cx: w / 2, cy: h / 2, r };
}

// ---------------------------------------------------------------- render statistics
export const DISC_REACH = 1.12; // the measured disc: clouds bulge to ~1.1 R, the haze shell is 1.06 R
export const GLOW_LIFT = 0.1; // an emissive pixel counts as glow when it is this much lighter (OKLab L, ~5 JND) than the ground

const median = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
/** Whether pixel i (a byte offset) has the same RGB in two RGBA buffers. */
export const same = (p, q, i) => p[i] === q[i] && p[i + 1] === q[i + 1] && p[i + 2] === q[i + 2];

/**
 * The statistics of one planet render.
 * grab, empty: { w, h, data } RGBA, the same camera with and without the planet. A pixel belongs to
 *   the planet when it differs from the empty frame (so stars and space never count) and lies within
 *   DISC_REACH radii of the disc centre (so moons out in their orbits don't count; moons, clouds and
 *   artefacts drawn over the disc do).
 * emissive: the same render with the emissive (lava glow) ramp swapped for sentinel colours, or null
 *   when the look has none; the pixels that differ were painted by it.
 * geom: discGeometry(); vision: 'normal' or a CVD key; warmHue: the warm pole in degrees.
 */
export function measure(grab, empty, geom, { vision = 'normal', warmHue, emissive = null }) {
  const { w, h, data } = grab;
  const { cx, cy, r } = geom;
  const reach = DISC_REACH * r, reach2 = reach ** 2;
  // only the disc's bounding box can hold planet pixels (visited in the same row-major order)
  const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(w, Math.ceil(cx + reach) + 1);
  const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(h, Math.ceil(cy + reach) + 1);
  const bw = x1 - x0;
  const wc = Math.cos((warmHue * Math.PI) / 180), ws = Math.sin((warmHue * Math.PI) / 180);
  const Ls = new Float64Array(bw * (y1 - y0)).fill(NaN);
  const ground = [], lit = [];
  let n = 0, sL = 0, sA = 0, sB = 0, sC = 0, sLL = 0, sWarm = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const i = (y * w + x) * 4;
      if (dx * dx + dy * dy > reach2 || same(data, empty.data, i)) continue;
      const [L, A, B] = oklab(...simulate(vision, LIN[data[i]], LIN[data[i + 1]], LIN[data[i + 2]]));
      Ls[(y - y0) * bw + (x - x0)] = L;
      n++; sL += L; sA += A; sB += B; sLL += L * L; sC += Math.hypot(A, B);
      sWarm += A * wc + B * ws;
      if (emissive && !same(data, emissive.data, i)) lit.push(L);
      else ground.push(L);
    }
  }
  if (!n) return { n: 0 };
  // texture: mean |delta L| between 4-adjacent planet pixels (fine structure: cracks, rims, cloud edges)
  let sE = 0, nE = 0;
  for (let j = 0; j < Ls.length; j++) {
    const L = Ls[j];
    if (Number.isNaN(L)) continue;
    if ((j + 1) % bw && !Number.isNaN(Ls[j + 1])) { sE += Math.abs(L - Ls[j + 1]); nE++; }
    if (j + bw < Ls.length && !Number.isNaN(Ls[j + bw])) { sE += Math.abs(L - Ls[j + bw]); nE++; }
  }
  const L = sL / n, a = sA / n, b = sB / n;
  const groundL = median(ground);
  const glowCut = ground.length ? groundL + GLOW_LIFT : -Infinity; // all emissive: every pixel glows
  return {
    n,
    L, a, b, C: sC / n, hue: hueDeg(a, b),
    warm: sWarm / n, // the mean colour's projection on the warm axis: how much fire-coloured colour the disc shows
    glow: lit.filter((x) => x >= glowCut).length / n, // visible glow: emissive pixels clearly lighter than the ground
    emissive: lit.length / n,
    groundL, // the median lightness of everything that isn't emissive
    Lsd: Math.sqrt(Math.max(0, sLL / n - L * L)),
    edge: nE ? sE / nE : 0,
  };
}

/** The look vector: mean colour, colourfulness and texture in OKLab units, and the glow share (a
 *  0.05 share, 5% of the disc glowing, weighs as much as a 0.05 colour step). For distances. */
export const LOOK_KEYS = ['L', 'a', 'b', 'C', 'Lsd', 'edge', 'glow'];
export const lookVector = (m) => LOOK_KEYS.map((k) => m[k]);
export const dist = (p, q) => Math.sqrt(p.reduce((s, x, i) => s + (x - q[i]) ** 2, 0));
export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const centroid = (vs) => vs[0].map((_, i) => mean(vs.map((v) => v[i])));
