// Compiles a ship spec (ship-spec.js) into GLSL: the hull's distance field with its parts baked in as
// constants (as astronaut.js bakes the figure), the flame and glass fields, and the colour regions
// (paint slot, see-through window, window frame, nav light). ship.js wraps it in the raymarching
// shader. Pure: strings only, no three.js.

export const SLOTS = ['shell', 'trim', 'metal', 'ring', 'gold']; // the hull paint slots; 'ring' falls back to trim
export const PAINT_WINDOW = 8, PAINT_LIGHT = 9; // paint() codes past the slots
export const MAX_FLAMES = 2;
export const MAX_LIGHTS = 32;
export const MAX_PUFFS = 6, MAX_LICKS = 6, PUFF_J = 100; // the lively flame's puffs and heat segments per flame; a puff's flame index starts at PUFF_J

const f = (x) => { const s = Number(x).toFixed(5).replace(/0+$/, '').replace(/\.$/, '.0'); return s === '-0.0' ? '0.0' : s; }; // a GLSL float literal
const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;
const v3 = (a) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;
const v4 = (a) => `vec4(${a.map(f).join(', ')})`;
const arr = (type, items) => `${type}[${items.length}](${items.join(', ')})`;

/** GLSL for one part's distance at p: its primitive, cut flat above cutY when it has one. */
function partExpr(q) {
  const e = primExpr(q);
  return q.cutY === undefined ? e : `max(${e}, p.y - ${f(q.cutY)})`;
}
function primExpr(q) {
  switch (q.kind) {
    case 'cone': return `sdRoundCone(p, ${v3(q.a)}, ${v3(q.b)}, ${f(q.r1)}, ${f(q.r2)})`;
    case 'capcone': return `(sdCappedCone(p - ${v3(q.c)}, ${f(q.h)}, ${f(q.r1 - q.round)}, ${f(q.r2 - q.round)}) - ${f(q.round)})`;
    case 'sphere': return `(length(p - ${v3(q.c)}) - ${f(q.r)})`;
    case 'ellipsoid': return `sdEllipsoid(p - ${v3(q.c)}, ${v3(q.r)})`;
    case 'torus': return `sdTorusY(p - ${v3(q.c)}, ${f(q.R)}, ${f(q.r)})`;
    case 'ring': return `sdRing(p - ${v3(q.c)}, ${v3(q.n)}, ${f(q.R)}, ${f(q.r)})`;
    case 'disc': return `sdDisc(p - ${v3(q.c)}, ${f(q.r0)}, ${f(q.r1)}, ${f(q.h)}, ${f(q.round)})`;
    case 'box': return `sdRoundBox(p - ${v3(q.c)}, ${v3(q.b)}, ${f(q.round)})`;
    case 'fin': {
      const fins = Array.from({ length: q.n }, (_, i) => `sdFin(p, ${f(q.yaw0 + (i * 2 * Math.PI) / q.n)}, ${q.pts.map(v2).join(', ')}, ${f(q.t)})`);
      return `(${fins.reduce((a, b) => `min(${a}, ${b})`)} - ${f(q.round)})`;
    }
    default: throw new Error(`unknown part kind ${q.kind}`);
  }
}

/** A conservative bounding box of a part, in design units. */
export function partBounds(q) {
  const pad = (c, r) => [c.map((x, i) => x - r[i]), c.map((x, i) => x + r[i])];
  switch (q.kind) {
    case 'cone': return [q.a.map((x, i) => Math.min(x - q.r1, q.b[i] - q.r2)), q.a.map((x, i) => Math.max(x + q.r1, q.b[i] + q.r2))]; // a round cone lies within its two end spheres' box
    case 'capcone': { const r = Math.max(q.r1, q.r2); return pad(q.c, [r, q.h, r]); }
    case 'sphere': return pad(q.c, [q.r, q.r, q.r]);
    case 'ellipsoid': return pad(q.c, q.r);
    case 'torus': return pad(q.c, [q.R + q.r, q.r, q.R + q.r]);
    case 'ring': return pad(q.c, [q.R + q.r, q.R + q.r, q.R + q.r]);
    case 'disc': return pad(q.c, [q.r1, q.h, q.r1]);
    case 'box': return pad(q.c, q.b);
    case 'fin': { const rho = Math.max(...q.pts.map((v) => v[0])) + q.t + q.round, ys = q.pts.map((v) => v[1]); return [[-rho, Math.min(...ys) - q.round, -rho], [rho, Math.max(...ys) + q.round, rho]]; }
    default: throw new Error(`unknown part kind ${q.kind}`);
  }
}

/** The ship's bounding box (hull, glass, flames at their longest, lights), with a margin. A flame's
 *  `reach` (the lively flame's, with its puffs) replaces the idle flame's longest, len * 1.3. */
export function shipBounds(spec, margin = 0.06) {
  const boxes = [...spec.parts.map(partBounds), ...spec.glass.map((g) => [g.c.map((x) => x - g.r), g.c.map((x) => x + g.r)])];
  for (const fl of spec.flames) boxes.push([[fl.a[0] - fl.r - 0.1, fl.a[1] - (fl.reach ?? fl.len * 1.3) - 0.05, fl.a[2] - fl.r - 0.1], [fl.a[0] + fl.r + 0.1, fl.a[1] + fl.r, fl.a[2] + fl.r + 0.1]]);
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i])) - margin);
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i])) + margin);
  return { lo, hi };
}

const HELPERS = /* glsl */ `
  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
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
  float sdTorusY(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
  // A torus about any unit axis n: a raised window rim.
  float sdRing(vec3 p, vec3 n, float R, float r) { float a = dot(p, n); return length(vec2(length(p - n * a) - R, a)) - r; }
  // A flat disc about +y (r0 = 0) or a flat ring from r0 to r1, half-thickness h, rounded edges.
  float sdDisc(vec3 p, float r0, float r1, float h, float round) {
    vec2 q = vec2(length(p.xz), p.y);
    vec2 d = r0 <= 0.0 ? vec2(q.x - r1 + round, abs(q.y) - h + round)
                       : vec2(abs(q.x - 0.5 * (r0 + r1)) - 0.5 * (r1 - r0) + round, abs(q.y) - h + round);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - round;
  }
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
 *   float hull(vec3 p), float flameField(vec3 p, out int j), float glassField(vec3 p, out int g),
 *   int partOf(vec3 p), int paint(vec3 p, int part, out int win, out int light)
 * paint: a hull slot (SLOTS index), PAINT_WINDOW a see-through window (win = its index), PAINT_LIGHT a nav light.
 * live (the fly-by's lively flame): flameField also holds each flame's exhaust puffs (uniforms uPuff,
 * uPuffBand; a puff's j is PUFF_J + its index), and uFlameHeat / uFlameLick shift its heat bands.
 * Without it the source is the idle flame's, unchanged.
 */
export function shipGlsl(spec, { live = false } = {}) {
  const { lo, hi } = shipBounds(spec);
  const P = spec.parts;
  const ids = P.map((q) => q.id);
  const idx = (id) => { const i = ids.indexOf(id); if (i < 0) throw new Error(`no part ${id}`); return i; };
  let hullBody = `float d = ${partExpr(P[0])};\n`;
  for (const q of P.slice(1)) hullBody += q.k > 0 ? `    d = smin(d, ${partExpr(q)}, ${f(q.k)});\n` : `    d = min(d, ${partExpr(q)});\n`;
  let partBody = `float best = ${partExpr(P[0])}; int part = 0; float e;\n`;
  P.slice(1).forEach((q, i) => { partBody += `    e = ${partExpr(q)}; if (e < best) { best = e; part = ${i + 1}; }\n`; });
  const slotOf = P.map((q) => SLOTS.indexOf(q.slot));
  if (slotOf.some((s) => s < 0)) throw new Error('a part has an unknown slot');
  if (spec.windows.some((w) => w.frameSlot && !SLOTS.includes(w.frameSlot))) throw new Error('a window frame has an unknown slot');
  const W = spec.windows.filter((w) => w.kind !== 'cap'), CW = spec.windows.filter((w) => w.kind === 'cap'), B = spec.bands, L = spec.lights, G = spec.glass, F = spec.flames;
  const maskOf = (hosts) => hosts.reduce((m, id) => m | (1 << idx(id)), 0);
  if (P.length > 31) throw new Error('too many parts for a window host mask');
  if (F.length > MAX_FLAMES) throw new Error('too many flames');
  if (L.length > MAX_LIGHTS) throw new Error('too many lights');
  const lightBall = L.map((l) => (l.ball ? 1 : 0));
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
  const float FLAME_R[${F.length}] = ${arr('float', F.map((x) => f(x.r)))};
  vec3 flameTip(int j) { return FLAME_A[j] + vec3(uFlameW[j].x, -uFlameL[j], uFlameW[j].y); }
  ${live ? `uniform vec4 uPuff[${MAX_PUFFS * MAX_FLAMES}]; // each flame's puffs: centre (from its anchor), radius (0: gone)
  uniform float uPuffBand[${MAX_PUFFS * MAX_FLAMES}]; // and its flame-ramp step
  uniform float uFlameHeat[${MAX_FLAMES}]; // the heat bands' shift this step
  uniform float uFlameLick[${MAX_LICKS * MAX_FLAMES}]; // and each segment's jump
  ` : ''}float flameField(vec3 p, out int jj) {
    float best = 1e9; jj = -1;
    for (int j = 0; j < ${F.length}; j++) { float e = sdRoundCone(p, FLAME_A[j], flameTip(j), FLAME_R[j], 0.035); if (e < best) { best = e; jj = j; } }${live ? `
    for (int i = 0; i < ${MAX_PUFFS * F.length}; i++) {
      if (uPuff[i].w <= 0.0) continue;
      float e = length(p - FLAME_A[i / ${MAX_PUFFS}] - uPuff[i].xyz) - uPuff[i].w;
      if (e < best) { best = e; jj = ${PUFF_J} + i; }
    }` : ''}
    return best;
  }` : `
  const vec3 FLAME_A[1] = vec3[1](vec3(0.0)); // no flame (the captain's cap): stand-ins for the shader's flame branch
  const float FLAME_R[1] = float[1](0.0);
  vec3 flameTip(int j) { return vec3(0.0); }
  float flameField(vec3 p, out int jj) { jj = -1; return 1e9; }`}
  ${G.length ? `
  const vec4 GLASS[${G.length}] = ${arr('vec4', G.map((g) => v4([...g.c, g.r])))};
  float glassField(vec3 p, out int gg) {
    float best = 1e9; gg = -1;
    for (int g = 0; g < ${G.length}; g++) { float e = length(p - GLASS[g].xyz) - GLASS[g].w; if (e < best) { best = e; gg = g; } }
    return best;
  }` : `
  const vec4 GLASS[1] = vec4[1](vec4(0.0, -1e4, 0.0, 0.0));
  float glassField(vec3 p, out int gg) { gg = -1; return 1e9; }`}
  const int SLOT_OF[${P.length}] = ${arr('int', slotOf.map(String))};
  ${W.length ? `
  const vec4 WIN_A[${W.length}] = ${arr('vec4', W.map((w) => v4([w.yaw, w.y, w.w, w.h])))}; // yaw, centre y, half-width (arc), half-height
  const vec3 WIN_B[${W.length}] = ${arr('vec3', W.map((w) => v3([w.n, w.frame, SLOTS.indexOf(w.frameSlot ?? 'metal')])))}; // superellipse power, frame width, frame slot
  const int WIN_HOST[${W.length}] = ${arr('int', W.map((w) => String(idx(w.host))))};` : ''}
  ${CW.length ? `
  const vec4 CW_C[${CW.length}] = ${arr('vec4', CW.map((w) => v4([...w.c, Math.cos(w.angle)])))}; // a round window on a sphere: centre, cos of its angular radius
  const vec4 CW_N[${CW.length}] = ${arr('vec4', CW.map((w) => v4([...w.n, Math.cos(w.angle + (w.frame ?? 0))])))}; // its axis, cos of the frame's outer edge
  const int CW_MASK[${CW.length}] = ${arr('int', CW.map((w) => String(maskOf(w.hosts))))}; // the parts it may cut (never its rim)
  const int CW_SLOT[${CW.length}] = ${arr('int', CW.map((w) => String(SLOTS.indexOf(w.frameSlot ?? 'metal'))))};` : ''}
  ${B.length ? `
  const vec3 BAND[${B.length}] = ${arr('vec3', B.map((b) => v3([b.part === '*' ? -1 : idx(b.part), b.y0, b.y1])))};
  const int BAND_SLOT[${B.length}] = ${arr('int', B.map((b) => String(SLOTS.indexOf(b.slot))))};` : ''}
  ${L.length ? `
  const vec4 LIGHT[${L.length}] = ${arr('vec4', L.map((l) => v4([...l.c, l.r])))};
  const int LIGHT_BALL[${L.length}] = ${arr('int', lightBall.map(String))};` : ''}
  // The superellipse value of p in window i's frame: < 1 inside, scaled by grow (the frame).
  float winE(vec3 p, int i, float grow) {
    ${W.length ? `float phi = atan(p.x, p.z) - WIN_A[i].x;
    phi = mod(phi + 3.14159265, 6.2831853) - 3.14159265;
    vec2 q = vec2(phi * length(p.xz) / (WIN_A[i].z + grow), (p.y - WIN_A[i].y) / (WIN_A[i].w + grow));
    return pow(abs(q.x), WIN_B[i].x) + pow(abs(q.y), WIN_B[i].x);` : 'return 2.0;'}
  }
  int paint(vec3 p, int part, out int win, out int light) {
    win = -1; light = -1;
    ${L.length ? `for (int i = 0; i < ${L.length}; i++) {
      if (LIGHT_BALL[i] == 1 ? distance(p, LIGHT[i].xyz) < LIGHT[i].w + 0.02 : distance(p, LIGHT[i].xyz) < LIGHT[i].w) { light = i; return ${PAINT_LIGHT}; }
    }` : ''}
    ${W.length ? `for (int i = 0; i < ${W.length}; i++) {
      if (WIN_HOST[i] != part) continue;
      if (winE(p, i, 0.0) < 1.0) { win = i; return ${PAINT_WINDOW}; }
      if (winE(p, i, WIN_B[i].y) < 1.0) return int(WIN_B[i].z); // the frame
    }` : ''}
    ${CW.length ? `for (int i = 0; i < ${CW.length}; i++) {
      if (((CW_MASK[i] >> part) & 1) == 0) continue;
      float ca = dot(normalize(p - CW_C[i].xyz), CW_N[i].xyz);
      if (ca > CW_C[i].w) { win = ${W.length} + i; return ${PAINT_WINDOW}; }
      if (ca > CW_N[i].w) return CW_SLOT[i];
    }` : ''}
    ${B.length ? `for (int i = 0; i < ${B.length}; i++) if ((int(BAND[i].x) == part || BAND[i].x < 0.0) && p.y > BAND[i].y && p.y < BAND[i].z) return BAND_SLOT[i];` : ''}
    return SLOT_OF[part];
  }
`;
}
