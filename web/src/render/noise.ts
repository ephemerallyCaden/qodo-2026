// CPU ports of the planet shader's noise (the GLSL in shaders.ts), so cloud and ash placement read
// the same fields the surface draws. Ported line for line from the asset viewer's snoise.js and
// makeFbm3 (viewer.js). The hash steps round to float32 (Math.fround) like the GPU. Pure: no three.js.
import { cross, lerp, normalize, type Vec3 } from '../model/vec.js';

const f = Math.fround;
const INV289 = f(1 / 289);
const mod289 = (x: number) => f(x - f(Math.floor(f(x * INV289)) * 289));
const permute = (x: number) => mod289(f(f(f(x * 34) + 1) * x));
const NS = [f(2 / 7), f(f(0.5 / 7) - 1), f(1 / 7)] as const; // n_ * D.wyz - D.xzx

/** 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT), as the shader's `snoise`. */
export function snoise(vx: number, vy: number, vz: number): number {
  const s = (vx + vy + vz) / 3;
  let ix = Math.floor(vx + s), iy = Math.floor(vy + s), iz = Math.floor(vz + s);
  const t = (ix + iy + iz) / 6;
  const x0: Vec3 = [vx - ix + t, vy - iy + t, vz - iz + t];
  // step(x0.yzx, x0.xyz): g.x = x0.x >= x0.y, g.y = x0.y >= x0.z, g.z = x0.z >= x0.x
  const g: Vec3 = [x0[0] >= x0[1] ? 1 : 0, x0[1] >= x0[2] ? 1 : 0, x0[2] >= x0[0] ? 1 : 0];
  const l: Vec3 = [1 - g[0], 1 - g[1], 1 - g[2]];
  const lz: Vec3 = [l[2], l[0], l[1]];
  const i1: Vec3 = [Math.min(g[0], lz[0]), Math.min(g[1], lz[1]), Math.min(g[2], lz[2])];
  const i2: Vec3 = [Math.max(g[0], lz[0]), Math.max(g[1], lz[1]), Math.max(g[2], lz[2])];
  const corners: Vec3[] = [[0, 0, 0], i1, i2, [1, 1, 1]];
  const off = [0, 1 / 6, 1 / 3, 0.5];
  ix = mod289(ix); iy = mod289(iy); iz = mod289(iz);
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const o = corners[k]!, ok = off[k]!;
    const x: Vec3 = [x0[0] - o[0] + ok, x0[1] - o[1] + ok, x0[2] - o[2] + ok];
    const p = permute(permute(permute(iz + o[2]) + iy + o[1]) + ix + o[0]);
    const j = f(p - f(49 * Math.floor(f(f(p * NS[2]) * NS[2]))));
    const xi = Math.floor(f(j * NS[2]));
    const yi = Math.floor(f(j - f(7 * xi)));
    let gx = xi * NS[0] + NS[1], gy = yi * NS[0] + NS[1];
    const h = 1 - Math.abs(gx) - Math.abs(gy);
    if (h <= 0) { gx -= Math.floor(gx) * 2 + 1; gy -= Math.floor(gy) * 2 + 1; } // a0/a1 with sh = -1
    const d2 = gx * gx + gy * gy + h * h;
    const norm = 1.79284291400159 - 0.85373472095314 * d2;
    let m = Math.max(0.6 - (x[0] * x[0] + x[1] * x[1] + x[2] * x[2]), 0);
    m *= m;
    sum += m * m * norm * (gx * x[0] + gy * x[1] + h * x[2]);
  }
  return 42 * sum;
}

// The shader's integer cell hash (pcg3d): integer maths, so bit-exact on the CPU.
const U = (x: number) => x >>> 0;
function pcg3d(x: number, y: number, z: number): Vec3 {
  x = U(Math.imul(x, 1664525) + 1013904223); y = U(Math.imul(y, 1664525) + 1013904223); z = U(Math.imul(z, 1664525) + 1013904223);
  x = U(x + Math.imul(y, z)); y = U(y + Math.imul(z, x)); z = U(z + Math.imul(x, y));
  x = U(x ^ (x >>> 16)); y = U(y ^ (y >>> 16)); z = U(z ^ (z >>> 16));
  x = U(x + Math.imul(y, z)); y = U(y + Math.imul(z, x)); z = U(z + Math.imul(x, y));
  return [x, y, z];
}
const INV32 = f(1 / 4294967296);
export const cellHash = (x: number, y: number, z: number): Vec3 => {
  const h = pcg3d(x + 4096, y + 4096, z + 4096);
  return [f(f(h[0]) * INV32), f(f(h[1]) * INV32), f(f(h[2]) * INV32)];
};

/** voronoiCells' first pass: the nearest feature point's offset (r1) and its cell relative to p's (c1). */
function nearest(px: number, py: number, pz: number): { r1: Vec3; c1: Vec3 } {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  let d1 = 9, r1: Vec3 = [0, 0, 0], c1: Vec3 = [0, 0, 0];
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const h = cellHash(ix + x, iy + y, iz + z);
    const r: Vec3 = [x + h[0] - fx, y + h[1] - fy, z + h[2] - fz];
    const dd = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    if (dd < d1) { d1 = dd; r1 = r; c1 = [x, y, z]; }
  }
  return { r1, c1 };
}

/** The Voronoi cell holding p (voronoiCells' `own`), without the edge pass. */
export function nearestCell(px: number, py: number, pz: number): Vec3 {
  const { c1 } = nearest(px, py, pz);
  return [Math.floor(px) + c1[0], Math.floor(py) + c1[1], Math.floor(pz) + c1[2]];
}

/** The shader's voronoiCells: distance to the nearest cell edge, the nearest cell and the one across that edge. */
export function voronoiCells(px: number, py: number, pz: number): { edge: number; own: Vec3; across: Vec3 } {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  const { r1, c1 } = nearest(px, py, pz);
  let e = 9, ga = c1;
  for (let z = -2; z <= 2; z++) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    const g: Vec3 = [c1[0] + x, c1[1] + y, c1[2] + z];
    const h = cellHash(ix + g[0], iy + g[1], iz + g[2]);
    const dr: Vec3 = [g[0] + h[0] - fx - r1[0], g[1] + h[1] - fy - r1[1], g[2] + h[2] - fz - r1[2]];
    const len = Math.hypot(dr[0], dr[1], dr[2]);
    if (len * len > 1e-5) {
      const d = ((r1[0] + dr[0] / 2) * dr[0] + (r1[1] + dr[1] / 2) * dr[1] + (r1[2] + dr[2] / 2) * dr[2]) / len;
      if (d < e) { e = d; ga = g; }
    }
  }
  return { edge: e, own: [ix + c1[0], iy + c1[1], iz + c1[2]], across: [ix + ga[0], iy + ga[1], iz + ga[2]] };
}

/** The shader's poolField: a plate (integer cell coords) is open (a lava pool) when this exceeds the pool cut. */
export function poolField(c: Vec3, o: Vec3, scale: number): number {
  const h = cellHash(c[0], c[1], c[2]); // the cell's feature point
  return snoise(f(c[0] + h[0]) * scale + o[2], f(c[1] + h[1]) * scale + o[0], f(c[2] + h[2]) * scale + o[1])
    + (cellHash(c[0] + 31, c[1] + 31, c[2] + 31)[0] - 0.5) * 0.5;
}

/** The shader's crackMask: which crack edges show, and how wide (0..1). */
export const crackMask = (d: Vec3, freq: number, o: Vec3): number =>
  snoise(d[0] * freq * 0.35 + o[1], d[1] * freq * 0.35 + o[2], d[2] * freq * 0.35 + o[0]) * 0.5 + 0.5;

/** The shader's crackHero ramp: the share (0..1) of the widest crack at a point with crack mask `mask`. */
export function crackShare(mask: number, cut: number, lift: number): number {
  const t = Math.min(1, Math.max(0, (mask - cut - lift) / 0.25));
  return t * t * (3 - 2 * t);
}

/** Seeded 3D value-noise fbm for cloud placement, roughly 0..1 (asset viewer makeFbm3). */
export function makeFbm3(seed: number): (x: number, y: number, z: number) => number {
  const h = (x: number, y: number, z: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w);
  };
  return (x, y, z) => {
    let sum = 0, amp = 0.5, fr = 1;
    for (let i = 0; i < 4; i++) { sum += amp * noise(x * fr + 31.7 * i, y * fr, z * fr); fr *= 2.03; amp *= 0.5; }
    return sum / 0.9375;
  };
}

/**
 * Right-handed tangent frame (east, d, north) for a puff on the unit sphere at direction d: a
 * left-handed instance matrix gets its outer shell back-face culled (the asset viewer's b67f935 bug).
 */
export function tangentFrame(d: Vec3): { east: Vec3; north: Vec3 } {
  const flat: Vec3 = [-d[2], 0, d[0]]; // = up × d for up = +y
  const east = normalize(flat[0] * flat[0] + flat[2] * flat[2] < 1e-10 ? [1, 0, 0] : flat); // pole: any horizontal axis
  return { east, north: normalize(cross(east, d)) };
}
