// The crew's astronaut: variant K from the astronaut lab (mockups/explorations/astronaut-lab),
// the human's pick on 2026-11-04. It's C (hard-suit engineer) with A's backpack and a smooth
// white suit: grey ring collars at the shoulders (carrying the contributor colour) and hips,
// glove and boot cuffs and a neck seal, on smooth white tubes and torso.
// This module is the figure's geometry only: K's parameters, the rest layout, the loop-locked
// pose, and the GLSL distance field + colour regions. viewer.js wraps it with the palette,
// lighting, eyes and depth fade. Units are the lab's: the figure is exactly 1 tall (boot sole
// y = 0 to helmet top y = 1), facing +z; the viewer scales it by SCALE and lifts it by LIFT.
import * as THREE from 'three';

export const SCALE = 0.95; // world height of a figure
export const LIFT = 0.03; // world height of the boot sole above the figure's origin

// K's parameters, as in the lab's out/params.md (only the ones the figure uses).
export const K = {
  headFrac: 0.57, helmetSink: 0.05, legShare: 0.535,
  torsoW: 0.16, torsoD: 0.121, torsoCorner: 0.65,
  armLen: 0.19, armR: 0.058, armTaper: 0.93, armSplay: 0.785, elbowBend: 0.6,
  legR: 0.07, legTaper: 0.92, hipX: 0.09, kneeBend: 1.15,
  mittR: 0.063, bootW: 0.065, bootH: 0.045, bootL: 0.09,
  bodyBlend: 0.042, bendBlend: 0.037, neckBlend: 0.042, partBlend: 0.006,
  ringT: 0.018, cuffScale: 1.2,
  packW: 0.184, packH: 0.137, packD: 0.079, packRound: 0.53,
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// JS port of the torso field (a rounded box), used to attach the shoulders, hips and backpack
// to its real surface so they always overlap it (no gaps).
const roundBox = (q, b, r) => {
  const x = Math.abs(q.x) - b.x + r, y = Math.abs(q.y) - b.y + r, z = Math.abs(q.z) - b.z + r;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0)) + Math.min(Math.max(x, y, z), 0) - r;
};
// Where a ray from inside the torso leaves it (bisection on the field).
function exitAlong(field, from, dir, maxT = 0.6) {
  let lo = 0, hi = maxT;
  if (field(from) > 0) return 0;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (field(from.clone().addScaledVector(dir, m)) < 0) lo = m; else hi = m;
  }
  return lo;
}
// A limb direction: `splay` out from straight down (in the frontal plane), then pitched
// forward (toward +z) by `pitch`. s = -1 left, +1 right.
const dirOf = (s, splay, pitch) => V(s * Math.sin(splay) * Math.cos(pitch), -Math.cos(splay) * Math.cos(pitch), Math.sin(pitch));

/** The rest layout: every part's size and place, in figure units. */
export function layout(P = K) {
  const ry = P.headFrac / 2;
  const head = { c: V(0, 1 - ry, 0), r: ry };
  const bodyTop = 1 - 2 * ry + P.helmetSink;
  const legTop = P.legShare * bodyTop;
  const hh = (bodyTop - legTop) / 2;
  const torso = { c: V(0, (bodyTop + legTop) / 2, 0), b: V(P.torsoW, hh, P.torsoD) };
  torso.corner = P.torsoCorner * Math.min(P.torsoW, hh, P.torsoD);
  const field = (p) => roundBox(p.clone().sub(torso.c), torso.b, torso.corner);
  // Shoulders sit just outside the torso's real side surface, a little below its top.
  const sy = bodyTop - 0.7 * P.armR;
  const sx = exitAlong(field, V(0, sy, 0), V(1, 0, 0)) + 0.4 * P.armR;
  // Hips sit a touch below the torso's bottom, inside its width.
  const hipX = Math.min(P.hipX, Math.max(0.02, P.torsoW - 0.35 * P.legR));
  const hip = V(hipX, legTop - 0.1 * P.legR, 0);
  const ankleY = 1.75 * P.bootH; // so the boot sole lands on y = 0
  // Backpack (A's): its front face sinks a quarter of its depth into the torso's real back.
  const py = torso.c.y + 0.1 * hh;
  const back = exitAlong(field, V(0, py, 0), V(0, 0, -1));
  const pack = { c: V(0, py, -(back + 0.75 * P.packD)), b: V(P.packW, P.packH, P.packD), r: P.packRound * Math.min(P.packW, P.packH, P.packD) };
  // Chest panel on the front of the torso.
  const front = exitAlong(field, V(0, torso.c.y, 0), V(0, 0, 1));
  const panel = [front - 0.3 * Math.min(P.torsoD, 0.1), Math.min(0.39 * P.torsoW, 0.06), torso.c.y, Math.min(0.32 * hh, 0.034)];
  // Neck seal: hugs the helmet a little above the point where it meets the torso.
  const cy = bodyTop - 0.4 * P.helmetSink + P.ringT;
  const dy = (cy - head.c.y) / head.r;
  const collar = { c: V(0, cy, 0), r: head.r * Math.sqrt(Math.max(0.02, 1 - dy * dy)) + 0.2 * P.ringT };
  return { P, head, torso, shoulder: V(sx, sy, 0), hip, ankleY, pack, panel, collar, field };
}

/**
 * Joints (lS lE lW rS rE rW lH lK lA rH rK rA) and ring frames (shoulder L/R, hip L/R,
 * glove L/R, boot L/R: centre c, axis a, major radius r) at time t, with `cycle` the
 * loop-locked period in seconds: the bob runs twice per cycle and the bends breathe with it.
 */
export function pose(Lay, t, cycle, joints, rings) {
  const { P } = Lay;
  const W = (Math.PI * 2) / cycle;
  const bob = Math.sin(t * 2 * W);
  const r = [P.armR, P.armR * P.armTaper, P.legR, P.legR * P.legTaper];
  for (const [k, s] of [[0, -1], [3, 1]]) {
    const lift = Math.sin(t * 2 * W + 0.6 + s * 0.4);
    const S = Lay.shoulder.clone().setX(s * Lay.shoulder.x);
    const u = dirOf(s, P.armSplay + 0.03 * bob, 0.3);
    const f = dirOf(s, P.armSplay * 0.27 + 0.04 * bob, P.elbowBend * (1 + 0.14 * lift));
    const E = S.clone().addScaledVector(u, P.armLen * 0.51);
    joints[k].copy(S);
    joints[k + 1].copy(E);
    joints[k + 2].copy(E).addScaledVector(f, P.armLen * 0.49);
    const i = k / 3;
    rings[i] = { c: S.clone().addScaledVector(u, 0.3 * P.armR), a: u, r: P.armR + 0.25 * P.ringT };
    rings[4 + i] = { c: joints[k + 2].clone().addScaledVector(f, -0.15 * P.ringT), a: f, r: r[1] * P.cuffScale };
  }
  for (const [k, s, bend] of [[6, -1, 1], [9, 1, 0.82]]) {
    // the left knee bends more than the right: a relaxed float
    const kb = P.kneeBend * bend * (1 + 0.12 * Math.sin(t * 2 * W + s));
    const H = Lay.hip.clone().setX(s * Lay.hip.x);
    const a = 0.45 * kb, b = 0.55 * kb;
    const seg = (H.y - Lay.ankleY) / (Math.cos(a) + Math.cos(b));
    const thigh = dirOf(s, 0.06, a), shin = dirOf(s, 0.02, -b);
    joints[k].copy(H);
    joints[k + 1].copy(H).addScaledVector(thigh, seg);
    joints[k + 2].copy(joints[k + 1]).addScaledVector(shin, seg);
    const i = (k - 6) / 3;
    const out = exitAlong(Lay.field, H, thigh, 0.3);
    rings[2 + i] = { c: H.clone().addScaledVector(thigh, out + 0.2 * P.ringT), a: thigh, r: P.legR + 0.25 * P.ringT };
    rings[6 + i] = { c: joints[k + 2].clone().addScaledVector(shin, -1.1 * P.ringT - 0.2 * P.bootH), a: shin, r: r[3] * P.cuffScale };
  }
}

// Proxy box the figure is raymarched inside, in figure units.
export const BMIN = [-0.64, -0.06, -0.52];
export const BMAX = [0.64, 1.06, 0.52];

const L = layout();
const f = (x) => { const s = String(x); return /[.e]/.test(s) ? s : `${s}.0`; }; // GLSL float literal
const v3 = (v) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`;

/**
 * GLSL: uniforms uJ / uRingC / uRingA / uRingR, then map(p) (the distance field), visorUV(p),
 * and region(p) (0 suit, 1 gear, 2 contributor accent, 3 visor). The static layout is baked in.
 */
export const ASTRO_SDF_GLSL = /* glsl */ `
  uniform vec3 uJ[12];
  uniform vec3 uRingC[8];
  uniform vec3 uRingA[8];
  uniform float uRingR[8];

  const vec3 BMIN = vec3(${BMIN.map(f).join(', ')});
  const vec3 BMAX = vec3(${BMAX.map(f).join(', ')});
  const vec3 HEAD = ${v3(L.head.c)};
  const float HEAD_R = ${f(L.head.r)};
  const vec3 TORSO_C = ${v3(L.torso.c)};
  const vec3 TORSO_B = ${v3(L.torso.b)};
  const float TORSO_R = ${f(L.torso.corner)};
  const vec3 PACK_C = ${v3(L.pack.c)};
  const vec3 PACK_B = ${v3(L.pack.b)};
  const float PACK_R = ${f(L.pack.r)};
  const vec3 COLLAR_C = ${v3(L.collar.c)};
  const float COLLAR_R = ${f(L.collar.r)};
  const vec4 PANEL = vec4(${L.panel.map(f).join(', ')}); // chest panel: front z, half-width, centre y, half-height
  const vec4 LIMB_R = vec4(${[K.armR, K.armR * K.armTaper, K.legR, K.legR * K.legTaper].map(f).join(', ')}); // arm at shoulder, wrist; leg at hip, ankle
  const float MITT_R = ${f(K.mittR)};
  const vec3 BOOT_B = vec3(${[K.bootW, K.bootH, K.bootL].map(f).join(', ')});
  const float BOOT_R = ${f(0.8 * Math.min(K.bootW, K.bootH, K.bootL))};
  const vec3 BOOT_OFF = vec3(0.0, ${f(-0.75 * K.bootH)}, ${f(0.31 * K.bootL)});
  const float RING_T = ${f(K.ringT)};
  const float K_NECK = ${f(K.neckBlend)}, K_BODY = ${f(K.bodyBlend)}, K_BEND = ${f(K.bendBlend)}, K_PART = ${f(K.partBlend)};

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  // Tapered capsule from a (radius r1) to b (radius r2), Inigo Quilez's exact round cone.
  float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
    vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
    vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
    float k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }
  float sdTorus(vec3 p, vec3 c, vec3 ax, float R, float r) { vec3 q = p - c; float a = dot(q, ax); return length(vec2(length(q - ax * a) - R, a)) - r; }

  float dHelmet(vec3 p) { return length(p - HEAD) - HEAD_R; }
  float dTorso(vec3 p) { return sdRoundBox(p - TORSO_C, TORSO_B, TORSO_R); }
  float dPack(vec3 p) { return sdRoundBox(p - PACK_C, PACK_B, PACK_R); }
  float dCollar(vec3 p) { return sdTorus(p, COLLAR_C, vec3(0.0, 1.0, 0.0), COLLAR_R, RING_T * 1.25); }
  // Limb i (0 left arm, 3 right arm, 6 left leg, 9 right leg): the upper and lower segments.
  float dUpper(vec3 p, int i, float r0, float r1) { return sdRoundCone(p, uJ[i], uJ[i + 1], r0, mix(r0, r1, 0.5)); }
  float dLower(vec3 p, int i, float r0, float r1) { return sdRoundCone(p, uJ[i + 1], uJ[i + 2], mix(r0, r1, 0.5), r1); }
  float dRing(vec3 p, int k, float t) { return sdTorus(p, uRingC[k], uRingA[k], uRingR[k], t); }
  float dMitt(vec3 p, int i) { return length(p - (uJ[i + 2] + normalize(uJ[i + 2] - uJ[i + 1]) * MITT_R * 0.5)) - MITT_R; }
  float dBoot(vec3 p, int i) { return sdRoundBox(p - (uJ[i + 2] + BOOT_OFF), BOOT_B, BOOT_R); }
  // One smooth bent tube: the two segments smooth-unioned at the elbow or knee.
  float limb(vec3 p, int i, float r0, float r1) { return smin(dUpper(p, i, r0, r1), dLower(p, i, r0, r1), K_BEND); }

  // The core (helmet, torso, neck seal, pack), then each limb blended into the core alone, so
  // limbs never melt into each other (a mitt resting on a thigh stays a mitt). The grey parts
  // (rings, cuffs, collar) join with a small crisp blend so they read as separate pieces.
  float map(vec3 p) {
    float core = smin(dHelmet(p), dTorso(p), K_NECK);
    core = smin(core, dCollar(p), K_PART);
    core = smin(core, dPack(p), 0.015);
    float d = core;
    for (int s = 0; s < 2; s++) {
      int a = s * 3, l = 6 + s * 3;
      float arm = smin(core, limb(p, a, LIMB_R.x, LIMB_R.y), K_BODY);
      arm = smin(arm, dRing(p, s, RING_T * 1.1), K_PART);
      arm = smin(arm, dMitt(p, a), 0.02);
      arm = smin(arm, dRing(p, 4 + s, RING_T), K_PART);
      float leg = smin(core, limb(p, l, LIMB_R.z, LIMB_R.w), K_BODY);
      leg = smin(leg, dRing(p, 2 + s, RING_T * 1.1), K_PART);
      leg = smin(leg, dBoot(p, l), 0.02);
      leg = smin(leg, dRing(p, 6 + s, RING_T), K_PART);
      d = min(d, min(arm, leg));
    }
    return d;
  }

  // Visor screen: a rounded rectangle in yaw/pitch about the helmet centre, ~4:3 once
  // projected onto the sphere. xy = screen uv (0..1, y down), z = superellipse value.
  vec3 visorUV(vec3 p) {
    vec3 d = normalize(p - HEAD);
    float yaw = atan(d.x, d.z);
    float pitch = asin(clamp(d.y, -1.0, 1.0)) + 0.02;
    vec2 q = vec2(yaw / 0.74, pitch / 0.54);
    return vec3(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5, pow(abs(q.x), 5.0) + pow(abs(q.y), 5.0));
  }

  // Colour region of the nearest part: 0 suit, 1 gear, 2 contributor accent, 3 visor.
  // The contributor colour sits on the shoulder rings (no sleeve band) and the pack stripe.
  int region(vec3 p) {
    float best = dHelmet(p);
    int part = 0; // 0 helmet 1 torso 2 pack 3 white limb 4 gear 5 shoulder ring
    float d;
    d = dTorso(p); if (d < best) { best = d; part = 1; }
    d = dPack(p); if (d < best) { best = d; part = 2; }
    d = dCollar(p); if (d < best) { best = d; part = 4; }
    for (int s = 0; s < 2; s++) {
      int a = s * 3, l = 6 + s * 3;
      d = dUpper(p, a, LIMB_R.x, LIMB_R.y); if (d < best) { best = d; part = 3; }
      d = dLower(p, a, LIMB_R.x, LIMB_R.y); if (d < best) { best = d; part = 3; }
      d = dRing(p, s, RING_T * 1.1); if (d < best) { best = d; part = 5; }
      d = dMitt(p, a); if (d < best) { best = d; part = 4; }
      d = dRing(p, 4 + s, RING_T); if (d < best) { best = d; part = 4; }
      d = dUpper(p, l, LIMB_R.z, LIMB_R.w); if (d < best) { best = d; part = 3; }
      d = dLower(p, l, LIMB_R.z, LIMB_R.w); if (d < best) { best = d; part = 3; }
      d = dRing(p, 2 + s, RING_T * 1.1); if (d < best) { best = d; part = 4; }
      d = dBoot(p, l); if (d < best) { best = d; part = 4; }
      d = dRing(p, 6 + s, RING_T); if (d < best) { best = d; part = 4; }
    }
    if (part == 0) {
      float e = visorUV(p).z;
      return e < 1.0 ? 3 : e < 1.75 ? 1 : 0; // screen, then a gear-tone bezel
    }
    if (part == 1) return (p.z > PANEL.x && abs(p.x) < PANEL.y && abs(p.y - PANEL.z) < PANEL.w) ? 1 : 0; // chest panel
    if (part == 2) return abs(p.y - (PACK_C.y + PACK_B.y * 0.38)) < PACK_B.y * 0.25 ? 2 : 1; // pack + contributor stripe
    if (part == 5) return 2;
    return part == 4 ? 1 : 0;
  }
`;
