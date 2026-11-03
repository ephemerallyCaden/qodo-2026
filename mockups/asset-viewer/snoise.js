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
