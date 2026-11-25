// Compiles a ship spec (ship-spec.ts) into GLSL, ported from the ship lab (feature/ship-lab,
// mockups/ship-lab/ship-glsl.js at 35eff13) and cut to the parts R2-4 and the captain's cap use: the hull's
// distance field with its parts baked in as constants, the flame field, and the paint regions (a slot, a
// see-through window, a window rim, the beacon). ship.ts wraps it in the raymarching shader. Pure: strings
// only, no three.js, no colours (they are uniforms from the palette, AGENTS.md Rule 5).
import type { Part, ShipSpec, Slot, Vec } from './ship-spec.js';

/** The hull's paint slots, as the shader numbers them. */
export const SLOTS: readonly Slot[] = ['shell', 'trim', 'metal', 'gold'];
/** paint() codes past the slots. */
export const PAINT_WINDOW = 8, PAINT_LIGHT = 9;
export const MAX_FLAMES = 2;
export const MAX_LIGHTS = 4;

/** A GLSL float literal. */
export const glf = (x: number): string => {
  const s = Number(x).toFixed(5).replace(/0+$/, '').replace(/\.$/, '.0');
  return s === '-0.0' ? '0.0' : s;
};
const v2 = (a: readonly number[]) => `vec2(${glf(a[0]!)}, ${glf(a[1]!)})`;
const v3 = (a: readonly number[]) => `vec3(${glf(a[0]!)}, ${glf(a[1]!)}, ${glf(a[2]!)})`;
const v4 = (a: readonly number[]) => `vec4(${a.map(glf).join(', ')})`;
const arr = (type: string, items: readonly string[]) => `${type}[${items.length}](${items.join(', ')})`;

/** GLSL for one part's distance at p. */
function partExpr(q: Part): string {
  switch (q.kind) {
    case 'cone': return `sdRoundCone(p, ${v3(q.a)}, ${v3(q.b)}, ${glf(q.r1)}, ${glf(q.r2)})`;
    case 'capcone': return `(sdCappedCone(p - ${v3(q.c)}, ${glf(q.h)}, ${glf(q.r1 - q.round)}, ${glf(q.r2 - q.round)}) - ${glf(q.round)})`;
    case 'sphere': return `(length(p - ${v3(q.c)}) - ${glf(q.r)})`;
    case 'ellipsoid': return `sdEllipsoid(p - ${v3(q.c)}, ${v3(q.r)})`;
    case 'ring': return `sdRing(p - ${v3(q.c)}, ${v3(q.n)}, ${glf(q.R)}, ${glf(q.r)})`;
    case 'fin': {
      const fins = Array.from({ length: q.n }, (_, i) => `sdFin(p, ${glf(q.yaw0 + (i * 2 * Math.PI) / q.n)}, ${q.pts.map(v2).join(', ')}, ${glf(q.t)})`);
      return `(${fins.reduce((a, b) => `min(${a}, ${b})`)} - ${glf(q.round)})`;
    }
  }
}

type Box = [Vec, Vec];
/** A conservative bounding box of a part, in design units. */
export function partBounds(q: Part): Box {
  const pad = (c: Vec, r: Vec): Box => [[c[0] - r[0], c[1] - r[1], c[2] - r[2]], [c[0] + r[0], c[1] + r[1], c[2] + r[2]]];
  switch (q.kind) {
    case 'cone': { // a round cone lies within its two end spheres' box
      const lo = [0, 1, 2].map((i) => Math.min(q.a[i]! - q.r1, q.b[i]! - q.r2)), hi = [0, 1, 2].map((i) => Math.max(q.a[i]! + q.r1, q.b[i]! + q.r2));
      return [lo as unknown as Vec, hi as unknown as Vec];
    }
    case 'capcone': { const r = Math.max(q.r1, q.r2); return pad(q.c, [r, q.h, r]); }
    case 'sphere': return pad(q.c, [q.r, q.r, q.r]);
    case 'ellipsoid': return pad(q.c, q.r);
    case 'ring': return pad(q.c, [q.R + q.r, q.R + q.r, q.R + q.r]);
    case 'fin': {
      const rho = Math.max(...q.pts.map((v) => v[0])) + q.t + q.round, ys = q.pts.map((v) => v[1]);
      return [[-rho, Math.min(...ys) - q.round, -rho], [rho, Math.max(...ys) + q.round, rho]];
    }
  }
}

/** The spec's bounding box (hull, the flames at their longest, lights), with a margin. */
export function shipBounds(spec: Pick<ShipSpec, 'parts' | 'flames'>, margin = 0.06): { lo: Vec; hi: Vec } {
  const boxes: Box[] = spec.parts.map(partBounds);
  for (const fl of spec.flames) {
    boxes.push([[fl.a[0] - fl.r - 0.1, fl.a[1] - fl.len * 1.3 - 0.05, fl.a[2] - fl.r - 0.1], [fl.a[0] + fl.r + 0.1, fl.a[1] + fl.r, fl.a[2] + fl.r + 0.1]]);
  }
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!)) - margin) as unknown as Vec;
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!)) + margin) as unknown as Vec;
  return { lo, hi };
}

const HELPERS = /* glsl */ `
  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
    vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
    vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
    float k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }
  // Inigo Quilez's capped cone about +y: radius r1 at y = -h, r2 at y = +h.
  float sdCappedCone(vec3 p, float h, float r1, float r2) {
    vec2 q = vec2(length(p.xz), p.y);
    vec2 k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0 * h);
    vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
    vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
  }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
  // A torus about any unit axis n: a raised window rim.
  float sdRing(vec3 p, vec3 n, float R, float r) { float a = dot(p, n); return length(vec2(length(p - n * a) - R, a)) - r; }
  float sdPoly4(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3) {
    vec2 v[4] = vec2[4](v0, v1, v2, v3);
    float d = dot(p - v[0], p - v[0]); float s = 1.0;
    for (int i = 0, j = 3; i < 4; j = i, i++) {
      vec2 e = v[j] - v[i]; vec2 w = p - v[i];
      vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
      d = min(d, dot(b, b));
      bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s *= -1.0;
    }
    return s * sqrt(d);
  }
  // A fin at yaw ang: the quad v0..v3 in its (radial, y) plane, extruded to half-thickness t.
  float sdFin(vec3 p, float ang, vec2 v0, vec2 v1, vec2 v2, vec2 v3, float t) {
    vec2 dir = vec2(sin(ang), cos(ang));
    float u = dot(p.xz, dir), w = dot(p.xz, vec2(dir.y, -dir.x));
    vec2 q = vec2(sdPoly4(vec2(u, p.y), v0, v1, v2, v3), abs(w) - t);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
  }
`;

/**
 * GLSL for a spec: constants BMIN/BMAX, uniforms uFlameL/uFlameW/uLightOn, and
 *   float hull(vec3 p), float flameField(vec3 p, out int j), int partOf(vec3 p),
 *   int paint(vec3 p, int part, out int light)
 * paint: a slot (SLOTS index), PAINT_WINDOW a see-through window, PAINT_LIGHT the beacon. A spec with no
 * flame (the cap) gets stand-ins for the flame's constants, so the shader's flame branch still compiles.
 */
export function shipGlsl(spec: Pick<ShipSpec, 'parts' | 'bands' | 'windows' | 'lights' | 'flames'>): string {
  const { lo, hi } = shipBounds(spec);
  const P = spec.parts, W = spec.windows, B = spec.bands, L = spec.lights, F = spec.flames;
  if (P.length === 0) throw new Error('a ship spec needs a part');
  if (P.length > 31) throw new Error('too many parts for a window host mask');
  if (F.length > MAX_FLAMES) throw new Error('too many flames');
  if (L.length > MAX_LIGHTS) throw new Error('too many lights');
  const ids = P.map((q) => q.id);
  const idx = (id: string) => { const i = ids.indexOf(id); if (i < 0) throw new Error(`no part ${id}`); return i; };
  let hullBody = `float d = ${partExpr(P[0]!)};\n`;
  for (const q of P.slice(1)) hullBody += q.k > 0 ? `    d = smin(d, ${partExpr(q)}, ${glf(q.k)});\n` : `    d = min(d, ${partExpr(q)});\n`;
  let partBody = `float best = ${partExpr(P[0]!)}; int part = 0; float e;\n`;
  P.slice(1).forEach((q, i) => { partBody += `    e = ${partExpr(q)}; if (e < best) { best = e; part = ${i + 1}; }\n`; });
  const slot = (s: Slot) => String(SLOTS.indexOf(s));
  const maskOf = (hosts: readonly string[]) => hosts.reduce((m, id) => m | (1 << idx(id)), 0);
  return /* glsl */ `
  const vec3 BMIN = ${v3(lo)};
  const vec3 BMAX = ${v3(hi)};
  uniform float uFlameL[${MAX_FLAMES}]; // each flame's current length (design units)
  uniform vec2 uFlameW[${MAX_FLAMES}]; // and its tip's wobble (x, z)
  uniform float uLightOn[${MAX_LIGHTS}];
  ${HELPERS}
  float hull(vec3 p) {
    ${hullBody}    return d;
  }
  int partOf(vec3 p) {
    ${partBody}    return part;
  }
  ${F.length ? `
  const vec3 FLAME_A[${F.length}] = ${arr('vec3', F.map((x) => v3(x.a)))};
  const float FLAME_R[${F.length}] = ${arr('float', F.map((x) => glf(x.r)))};
  vec3 flameTip(int j) { return FLAME_A[j] + vec3(uFlameW[j].x, -uFlameL[j], uFlameW[j].y); }
  float flameField(vec3 p, out int jj) {
    float best = 1e9; jj = -1;
    for (int j = 0; j < ${F.length}; j++) { float e = sdRoundCone(p, FLAME_A[j], flameTip(j), FLAME_R[j], 0.035); if (e < best) { best = e; jj = j; } }
    return best;
  }` : `
  const vec3 FLAME_A[1] = vec3[1](vec3(0.0)); // no flame (the cap): stand-ins for the shader's flame branch
  const float FLAME_R[1] = float[1](0.0);
  vec3 flameTip(int j) { return vec3(0.0); }
  float flameField(vec3 p, out int jj) { jj = 0; return 1e9; }`}
  const int SLOT_OF[${P.length}] = ${arr('int', P.map((q) => slot(q.slot)))};
  ${W.length ? `
  const vec4 CW_C[${W.length}] = ${arr('vec4', W.map((w) => v4([...w.c, Math.cos(w.angle)])))}; // a round window on a sphere: centre, cos of its angular radius
  const vec4 CW_N[${W.length}] = ${arr('vec4', W.map((w) => v4([...w.n, Math.cos(w.angle + w.frame)])))}; // its axis, cos of the rim's outer edge
  const int CW_MASK[${W.length}] = ${arr('int', W.map((w) => String(maskOf(w.hosts))))}; // the parts it may cut (never its rim)
  const int CW_SLOT[${W.length}] = ${arr('int', W.map((w) => slot(w.frameSlot)))};` : ''}
  ${B.length ? `
  const vec3 BAND[${B.length}] = ${arr('vec3', B.map((b) => v3([b.part === '*' ? -1 : idx(b.part), b.y0, b.y1])))};
  const int BAND_SLOT[${B.length}] = ${arr('int', B.map((b) => slot(b.slot)))};` : ''}
  ${L.length ? `const vec4 LIGHT[${L.length}] = ${arr('vec4', L.map((l) => v4([...l.c, l.r])))};` : ''}
  int paint(vec3 p, int part, out int light) {
    light = -1;
    ${L.length ? `for (int i = 0; i < ${L.length}; i++) if (distance(p, LIGHT[i].xyz) < LIGHT[i].w + 0.02) { light = i; return ${PAINT_LIGHT}; }` : ''}
    ${W.length ? `for (int i = 0; i < ${W.length}; i++) {
      if (((CW_MASK[i] >> part) & 1) == 0) continue;
      float ca = dot(normalize(p - CW_C[i].xyz), CW_N[i].xyz);
      if (ca > CW_C[i].w) return ${PAINT_WINDOW};
      if (ca > CW_N[i].w) return CW_SLOT[i];
    }` : ''}
    ${B.length ? `for (int i = 0; i < ${B.length}; i++) if ((int(BAND[i].x) == part || BAND[i].x < 0.0) && p.y > BAND[i].y && p.y < BAND[i].z) return BAND_SLOT[i];` : ''}
    return SLOT_OF[part];
  }
`;
}
