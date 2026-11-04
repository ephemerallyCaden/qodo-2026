// CPU port of the planet shader's 3D simplex noise (Ashima Arts / Stefan Gustavson,
// MIT; the GLSL `snoise` in viewer.js), so cloud placement can read the same fields
// the surface draws, e.g. putting lava ash on the fissures. Same maths line for line.
// The hash steps round to float32 (Math.fround) like the GPU, because mod289's
// x * (1/289) can land on the other side of an integer in float32 and pick another gradient.
const f = Math.fround;
const INV289 = f(1 / 289);
const mod289 = (x) => f(x - f(Math.floor(f(x * INV289)) * 289));
const permute = (x) => mod289(f(f(f(x * 34) + 1) * x));
const NS = [f(2 / 7), f(f(0.5 / 7) - 1), f(1 / 7)]; // n_ * D.wyz - D.xzx

export function snoise(vx, vy, vz) {
  const s = (vx + vy + vz) / 3;
  let ix = Math.floor(vx + s), iy = Math.floor(vy + s), iz = Math.floor(vz + s);
  const t = (ix + iy + iz) / 6;
  const x0 = [vx - ix + t, vy - iy + t, vz - iz + t];
  // step(x0.yzx, x0.xyz): g.x = x0.x >= x0.y, g.y = x0.y >= x0.z, g.z = x0.z >= x0.x
  const g = [x0[0] >= x0[1] ? 1 : 0, x0[1] >= x0[2] ? 1 : 0, x0[2] >= x0[0] ? 1 : 0];
  const l = g.map((v) => 1 - v);
  const lz = [l[2], l[0], l[1]];
  const i1 = g.map((v, k) => Math.min(v, lz[k]));
  const i2 = g.map((v, k) => Math.max(v, lz[k]));
  const corners = [[0, 0, 0], i1, i2, [1, 1, 1]];
  const off = [0, 1 / 6, 1 / 3, 0.5];
  ix = mod289(ix); iy = mod289(iy); iz = mod289(iz);
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const o = corners[k];
    const x = [x0[0] - o[0] + off[k], x0[1] - o[1] + off[k], x0[2] - o[2] + off[k]];
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

/** 1.0 along a network of thin lines, as the shader's `ridge`. */
export const ridge = (x, y, z) => 1 - Math.abs(snoise(x, y, z));

// CPU port of the shader's integer cell hash, Voronoi edge distance and crack mask
// (WORLEY_GLSL in viewer.js), so lava ash can sit on the jagged fissures. pcg3d is integer
// maths, so it is bit-exact; the float steps round to float32 like the GPU.
const U = (x) => x >>> 0;
function pcg3d(x, y, z) {
  x = U(Math.imul(x, 1664525) + 1013904223); y = U(Math.imul(y, 1664525) + 1013904223); z = U(Math.imul(z, 1664525) + 1013904223);
  x = U(x + Math.imul(y, z)); y = U(y + Math.imul(z, x)); z = U(z + Math.imul(x, y));
  x = U(x ^ (x >>> 16)); y = U(y ^ (y >>> 16)); z = U(z ^ (z >>> 16));
  x = U(x + Math.imul(y, z)); y = U(y + Math.imul(z, x)); z = U(z + Math.imul(x, y));
  return [x, y, z];
}
const INV32 = f(1 / 4294967296);
export const cellHash = (x, y, z) => pcg3d(x + 4096, y + 4096, z + 4096).map((v) => f(f(v) * INV32));

/** Distance to the nearest Voronoi cell edge (the shader's voronoiEdge, two-pass). */
export function voronoiEdge(px, py, pz) {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  let d1 = 9, r1 = [0, 0, 0], c1 = [0, 0, 0];
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const h = cellHash(ix + x, iy + y, iz + z);
    const r = [x + h[0] - fx, y + h[1] - fy, z + h[2] - fz];
    const dd = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    if (dd < d1) { d1 = dd; r1 = r; c1 = [x, y, z]; }
  }
  let e = 9;
  for (let z = -2; z <= 2; z++) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    const g = [c1[0] + x, c1[1] + y, c1[2] + z];
    const h = cellHash(ix + g[0], iy + g[1], iz + g[2]);
    const dr = [g[0] + h[0] - fx - r1[0], g[1] + h[1] - fy - r1[1], g[2] + h[2] - fz - r1[2]];
    const len = Math.hypot(...dr);
    if (len * len > 1e-5) e = Math.min(e, ((r1[0] + dr[0] / 2) * dr[0] + (r1[1] + dr[1] / 2) * dr[1] + (r1[2] + dr[2] / 2) * dr[2]) / len);
  }
  return e;
}

/** The shader's crackMask: which crack edges show, and how wide (0..1). */
export const crackMask = (x, y, z, freq, ox, oy, oz) => snoise(x * freq * 0.35 + oy, y * freq * 0.35 + oz, z * freq * 0.35 + ox) * 0.5 + 0.5;
