// Colour maths shared by the page and the Node checks: hex <-> rgb and OKLab distance.
// OKLab (Björn Ottosson, 2020): a perceptual space where a Euclidean distance of about 0.02 is
// a just-noticeable difference, so "near" thresholds below are in OKLab units.

const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const hexToInt = (hex) => parseInt(hex.replace('#', ''), 16);
export const intToHex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** [L, a, b] for a 24-bit colour (0xrrggbb). */
export function oklabInt(n) {
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export const oklab = (hex) => oklabInt(hexToInt(hex));

export const okDist = (A, B) => Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);

/** Distance from colour n (int) to the nearest colour of a list of OKLab triples. */
export function nearest(n, labs) {
  const A = oklabInt(n);
  let best = Infinity;
  for (const B of labs) best = Math.min(best, okDist(A, B));
  return best;
}

/** CIELAB (D65) [L*, a*, b*] for a 24-bit colour. */
export function cielabInt(n) {
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * Helmholtz-Kohlrausch lightness L** (Fairchild and Pirrotta, 1991): saturated colours look brighter
 * than their L*, most of all purples and blues. A proxy for "reads brighter and nearer than it is".
 */
export function hkLightness(n) {
  const [L, a, b] = cielabInt(n);
  const C = Math.hypot(a, b), h = (Math.atan2(b, a) * 180) / Math.PI;
  return L + (2.5 - 0.025 * L) * (0.116 * Math.abs(Math.sin((((h - 90) / 2) * Math.PI) / 180)) + 0.085) * C;
}

/** OKLCh chroma. */
export const okChroma = (n) => { const [, a, b] = oklabInt(n); return Math.hypot(a, b); };
