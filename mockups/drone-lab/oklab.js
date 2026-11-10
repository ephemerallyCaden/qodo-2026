// OKLab (Björn Ottosson, 2020) for palette work: brand colour -> nearest BLK 36 entry, and
// the A4 colour distances. Pure functions, no DOM, so lab.js, lab.mjs and the tests share them.

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** '#rrggbb' -> [L, a, b]. */
export function oklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbOklab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** 0..255 sRGB -> [L, a, b]. */
export function rgbOklab(R, G, B) {
  const r = lin(R / 255), g = lin(G / 255), b = lin(B / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Euclidean OKLab distance between two [L, a, b] (or two hexes). */
export function dist(p, q) {
  const A = typeof p === 'string' ? oklab(p) : p, B = typeof q === 'string' ? oklab(q) : q;
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** The nearest entries of `palette` to `hex`, closest first: [{ hex, d }]. */
export function nearest(hex, palette, n = 3) {
  return palette.map((h) => ({ hex: h, d: dist(hex, h) })).sort((a, b) => a.d - b.d).slice(0, n);
}
