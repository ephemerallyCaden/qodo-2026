// One parameterised astronaut: a raymarched signed-distance body, like the asset viewer's
// (mockups/asset-viewer/viewer.js), with every proportion, joint type and accessory driven by
// uniforms from params.js. So a variant is only a parameter set, and mixing variants is
// mixing parameters; no shader is recompiled.
// Every part joins one surface, so a single lighting pass shades the whole figure, with cast
// shadows and contact occlusion marched through the same field (unified self-shadowing).
// Local units: the figure is exactly 1 tall (boot sole y = 0 to helmet top y = 1), facing +z.
import * as THREE from 'three';
import { EYES_GLSL } from '../asset-viewer/faces.js';
import { DEFAULTS } from './params.js';
import { CREW } from './crew.js';

export const LIGHT_DIR = new THREE.Vector3(-0.3, 0.55, 0.78).normalize(); // the viewer's top-left key
export const SCALE = 0.95; // world height of a figure, as in the viewer (so 180p reads the same)
export const CYCLE = 12; // s: the viewer's per-surface-turn cycle (24 s loop / 2 turns); bob = CYCLE / 2

const BMIN = [-0.64, -0.06, -0.52];
const BMAX = [0.64, 1.06, 0.52];

const VERT = /* glsl */ `
  out vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform mat4 uInvModel;
  uniform vec3 uLightLocal;
  uniform vec3 uSuit[4];
  uniform vec3 uGear[4];
  uniform vec3 uAccent[4];
  uniform vec3 uVisor[2];
  uniform vec3 uGlint;
  // skeleton: lS lE lW rS rE rW lH lK lA rH rK rA
  uniform vec3 uJ[12];
  // rings: shoulder L/R, hip L/R, glove L/R, boot L/R (centre, axis, major radius)
  uniform vec3 uRingC[8];
  uniform vec3 uRingA[8];
  uniform float uRingR[8];
  uniform vec3 uHeadC, uHeadR;
  uniform vec3 uTorsoC, uTorsoB; // centre; chest half-width, half-height, half-depth
  uniform float uTorsoHipW, uTorsoCorner, uTorsoEgg;
  uniform vec3 uPackC, uPackB;
  uniform float uPackR;
  uniform vec4 uLimbR; // arm at shoulder, arm at wrist, leg at hip, leg at ankle
  uniform float uMittR;
  uniform vec3 uBootB;
  uniform float uBootR;
  uniform vec3 uBootOff;
  uniform vec4 uK; // neck, body, bend, crisp-part blends
  uniform int uShoulder, uHip, uElbow, uKnee; // 0 blend/bend, 1 ring/ball, 2 ball/accordion
  uniform float uBall, uRingT, uRibs, uRibDepth;
  uniform int uCollar, uGloveCuff, uBootCuff, uBandOnRing;
  uniform vec3 uCollarC;
  uniform float uCollarR;
  uniform vec4 uPanel; // chest panel: front z, half-width, centre y, half-height
  ${EYES_GLSL}
  in vec3 vPosW;

  const vec3 BMIN = vec3(${BMIN.join(', ')});
  const vec3 BMAX = vec3(${BMAX.join(', ')});

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
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

  float dHelmet(vec3 p) { return sdEllipsoid(p - uHeadC, uHeadR); }
  float dTorso(vec3 p) {
    vec3 q = p - uTorsoC;
    float t = clamp((q.y + uTorsoB.y) / (2.0 * uTorsoB.y), 0.0, 1.0);
    float w = mix(uTorsoHipW, uTorsoB.x, t);
    float s = uTorsoB.x / w;
    q.x *= s;
    float d = mix(sdRoundBox(q, uTorsoB, uTorsoCorner), sdEllipsoid(q, uTorsoB), uTorsoEgg);
    return d * min(1.0, 1.0 / s);
  }
  float dPack(vec3 p) { return sdRoundBox(p - uPackC, uPackB, uPackR); }
  float dCollar(vec3 p) { return sdTorus(p, uCollarC, vec3(0.0, 1.0, 0.0), uCollarR, uRingT * 1.25); }

  // One limb segment; accordion ribs (raised rings) near the joint end when 'ribbed'.
  float seg(vec3 p, vec3 a, vec3 b, float ra, float rb, bool ribbed, bool jointAtB) {
    float d = sdRoundCone(p, a, b, ra, rb);
    if (!ribbed) return d;
    vec3 ba = b - a;
    float L = length(ba);
    float h = clamp(dot(p - a, ba) / (L * L), 0.0, 1.0);
    float s = (jointAtB ? 1.0 - h : h) * L; // distance from the joint
    float period = L * 0.62 / uRibs;
    if (s < (uRibs - 0.5) * period) d -= uRibDepth * mix(ra, rb, h) * (0.5 + 0.5 * cos(6.2831853 * s / period));
    return d;
  }
  // Limb i (0 left arm, 3 right arm, 6 left leg, 9 right leg): the upper and lower segments.
  float dUpper(vec3 p, int i, float r0, float r1, int mid) { return seg(p, uJ[i], uJ[i + 1], r0, mix(r0, r1, 0.5) * (mid == 1 ? 0.92 : 1.0), mid == 2, true); }
  float dLower(vec3 p, int i, float r0, float r1, int mid) { return seg(p, uJ[i + 1], uJ[i + 2], mix(r0, r1, 0.5) * (mid == 1 ? 0.92 : 1.0), r1, mid == 2, false); }
  float dMidBall(vec3 p, int i, float r0, float r1) { return length(p - uJ[i + 1]) - mix(r0, r1, 0.5) * uBall; }
  float dRootBall(vec3 p, int i, float r0) { return length(p - uJ[i]) - r0 * uBall; }
  float dRing(vec3 p, int k, float t) { return sdTorus(p, uRingC[k], uRingA[k], uRingR[k], t); }
  float dMitt(vec3 p, int i) { return length(p - (uJ[i + 2] + normalize(uJ[i + 2] - uJ[i + 1]) * uMittR * 0.5)) - uMittR; }
  float dBoot(vec3 p, int i) { return sdRoundBox(p - (uJ[i + 2] + uBootOff), uBootB, uBootR); }

  float limb(vec3 p, int i, float r0, float r1, int mid) {
    float u = dUpper(p, i, r0, r1, mid), l = dLower(p, i, r0, r1, mid);
    if (mid == 0) return smin(u, l, uK.z);
    float d = smin(u, l, uK.w);
    if (mid == 1) d = smin(d, dMidBall(p, i, r0, r1), uK.w);
    return d;
  }

  // The core (helmet, torso, neck seal, pack), then each limb blended into the core alone, so
  // limbs never melt into each other (a mitt resting on a thigh stays a mitt).
  float map(vec3 p) {
    float core = smin(dHelmet(p), dTorso(p), uK.x);
    if (uCollar == 1) core = smin(core, dCollar(p), uK.w);
    core = smin(core, dPack(p), 0.015);
    float d = core;
    for (int s = 0; s < 2; s++) {
      int a = s * 3, l = 6 + s * 3;
      float arm = smin(core, limb(p, a, uLimbR.x, uLimbR.y, uElbow), uK.y);
      if (uShoulder == 1) arm = smin(arm, dRing(p, s, uRingT * 1.1), uK.w);
      if (uShoulder == 2) arm = smin(arm, dRootBall(p, a, uLimbR.x), uK.w);
      arm = smin(arm, dMitt(p, a), 0.02);
      if (uGloveCuff == 1) arm = smin(arm, dRing(p, 4 + s, uRingT), uK.w);
      float leg = smin(core, limb(p, l, uLimbR.z, uLimbR.w, uKnee), uK.y);
      if (uHip == 1) leg = smin(leg, dRing(p, 2 + s, uRingT * 1.1), uK.w);
      if (uHip == 2) leg = smin(leg, dRootBall(p, l, uLimbR.z), uK.w);
      leg = smin(leg, dBoot(p, l), 0.02);
      if (uBootCuff == 1) leg = smin(leg, dRing(p, 6 + s, uRingT), uK.w);
      d = min(d, min(arm, leg));
    }
    return d;
  }

  vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
  }
  float shadow(vec3 ro, vec3 rd) {
    float t = 0.02;
    for (int i = 0; i < 48; i++) {
      float h = map(ro + rd * t);
      if (h < 0.002) return 0.0;
      t += max(h * 0.85, 0.008);
      if (t > 1.4) break;
    }
    return 1.0;
  }
  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.025 * float(i);
      o += (h - map(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }

  // Visor screen: a rounded rectangle in yaw/pitch about the helmet centre (sphere space),
  // ~4:3 once projected. xy = screen uv (0..1, y down), z = superellipse value.
  vec3 visorUV(vec3 p) {
    vec3 d = normalize((p - uHeadC) / uHeadR);
    float yaw = atan(d.x, d.z);
    float pitch = asin(clamp(d.y, -1.0, 1.0)) + 0.02;
    vec2 q = vec2(yaw / 0.74, pitch / 0.54);
    return vec3(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5, pow(abs(q.x), 5.0) + pow(abs(q.y), 5.0));
  }

  // Colour region of the nearest part: 0 suit, 1 gear, 2 accent, 3 visor.
  int region(vec3 p) {
    float best = dHelmet(p);
    int part = 0; // 0 helmet 1 torso 2 pack 3 upper arm 4 suit 5 gear 6 shoulder ring
    int armI = 0;
    float d;
    d = dTorso(p); if (d < best) { best = d; part = 1; }
    d = dPack(p); if (d < best) { best = d; part = 2; }
    if (uCollar == 1) { d = dCollar(p); if (d < best) { best = d; part = 5; } }
    for (int s = 0; s < 2; s++) {
      int a = s * 3, l = 6 + s * 3;
      d = dUpper(p, a, uLimbR.x, uLimbR.y, uElbow); if (d < best) { best = d; part = 3; armI = a; }
      d = dLower(p, a, uLimbR.x, uLimbR.y, uElbow); if (d < best) { best = d; part = 4; }
      if (uElbow == 1) { d = dMidBall(p, a, uLimbR.x, uLimbR.y); if (d < best) { best = d; part = 5; } }
      if (uShoulder == 1) { d = dRing(p, s, uRingT * 1.1); if (d < best) { best = d; part = 6; } }
      if (uShoulder == 2) { d = dRootBall(p, a, uLimbR.x); if (d < best) { best = d; part = 5; } }
      d = dMitt(p, a); if (d < best) { best = d; part = 5; }
      if (uGloveCuff == 1) { d = dRing(p, 4 + s, uRingT); if (d < best) { best = d; part = 5; } }
      d = dUpper(p, l, uLimbR.z, uLimbR.w, uKnee); if (d < best) { best = d; part = 4; }
      d = dLower(p, l, uLimbR.z, uLimbR.w, uKnee); if (d < best) { best = d; part = 4; }
      if (uKnee == 1) { d = dMidBall(p, l, uLimbR.z, uLimbR.w); if (d < best) { best = d; part = 5; } }
      if (uHip == 1) { d = dRing(p, 2 + s, uRingT * 1.1); if (d < best) { best = d; part = 5; } }
      if (uHip == 2) { d = dRootBall(p, l, uLimbR.z); if (d < best) { best = d; part = 5; } }
      d = dBoot(p, l); if (d < best) { best = d; part = 5; }
      if (uBootCuff == 1) { d = dRing(p, 6 + s, uRingT); if (d < best) { best = d; part = 5; } }
    }
    if (part == 0) {
      float e = visorUV(p).z;
      return e < 1.0 ? 3 : e < 1.75 ? 1 : 0; // screen, then a gear-tone bezel
    }
    if (part == 1) return (p.z > uPanel.x && abs(p.x) < uPanel.y && abs(p.y - uPanel.z) < uPanel.w) ? 1 : 0; // chest panel
    if (part == 2) return abs(p.y - (uPackC.y + uPackB.y * 0.38)) < uPackB.y * 0.25 ? 2 : 1; // pack + contributor stripe
    if (part == 3) {
      if (uShoulder == 1 && uBandOnRing == 1) return 0;
      vec3 a = uJ[armI], b = uJ[armI + 1];
      float h = dot(p - a, b - a) / dot(b - a, b - a);
      float lo = uShoulder == 1 ? 0.34 : 0.22; // below a shoulder ring, the band slides down the sleeve
      return (h > lo && h < lo + 0.2) ? 2 : 0;
    }
    if (part == 6) return uBandOnRing == 1 ? 2 : 1;
    return part == 5 ? 1 : 0;
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    bool hit = false;
    for (int i = 0; i < 160; i++) {
      float h = map(ro + rd * t);
      if (h < 0.0012 * (1.0 + t)) { hit = true; break; }
      t += h * 0.8; // ribs bend the field a little; under-step to stay on the surface
      if (t > tf) break;
    }
    if (!hit) discard;
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 L = normalize(uLightLocal);
    float lit = dot(n, L);
    if (shadow(p + n * 0.006, L) < 0.5) lit = min(lit, 0.1) - 0.3;
    lit -= (1.0 - occlusion(p, n)) * 0.6;
    int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
    int r = region(p);
    vec3 c;
    if (r == 3) {
      vec3 refl = reflect(rd, n);
      c = (refl.y > 0.18 && b >= 2) ? uVisor[1] : uVisor[0];
      vec2 uv = visorUV(p).xy;
      if (eyeLit(uv)) c = uAccent[2]; // eyes glow unlit in the contributor colour
      if (glintLit(uv)) c = uGlint;
    } else if (r == 2) c = uAccent[b];
    else if (r == 1) c = uGear[b];
    else c = uSuit[b];
    gl_FragColor = vec4(c, 1.0);
  }
`;

const PROXY_GEO = new THREE.BoxGeometry(BMAX[0] - BMIN[0], BMAX[1] - BMIN[1], BMAX[2] - BMIN[2])
  .translate((BMAX[0] + BMIN[0]) / 2, (BMAX[1] + BMIN[1]) / 2, (BMAX[2] + BMIN[2]) / 2);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const colors = (hexes) => hexes.map((h) => new THREE.Color(h));

// JS ports of the torso field, used to attach the shoulders and backpack to the real surface
// whatever the torso shape, so limbs and pack always overlap it (no gaps).
const roundBox = (q, b, r) => {
  const x = Math.abs(q.x) - b.x + r, y = Math.abs(q.y) - b.y + r, z = Math.abs(q.z) - b.z + r;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0)) + Math.min(Math.max(x, y, z), 0) - r;
};
const ellipsoid = (q, r) => {
  const k0 = Math.hypot(q.x / r.x, q.y / r.y, q.z / r.z), k1 = Math.hypot(q.x / (r.x * r.x), q.y / (r.y * r.y), q.z / (r.z * r.z));
  return (k0 * (k0 - 1)) / k1;
};
function torsoField(T) {
  return (p) => {
    const q = p.clone().sub(T.c);
    const t = Math.min(1, Math.max(0, (q.y + T.b.y) / (2 * T.b.y)));
    const w = T.hipW + (T.b.x - T.hipW) * t;
    const s = T.b.x / w;
    q.x *= s;
    const d = roundBox(q, T.b, T.corner) * (1 - T.egg) + ellipsoid(q, T.b) * T.egg;
    return d * Math.min(1, 1 / s);
  };
}
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

/** The rest layout of a parameter set: every part's size and place, in figure units. */
export function layout(P) {
  const ry = P.headFrac / 2;
  const head = { c: V(0, 1 - ry, 0), r: V(ry / P.headSquash, ry, ry / P.headSquash) };
  const bodyTop = 1 - 2 * ry + P.helmetSink;
  const legTop = P.legShare * bodyTop;
  const hh = (bodyTop - legTop) / 2;
  const torso = { c: V(0, (bodyTop + legTop) / 2, 0), b: V(P.torsoW, hh, P.torsoD), hipW: P.torsoW * P.torsoTaper, egg: P.torsoEgg };
  torso.corner = P.torsoCorner * Math.min(P.torsoW, hh, P.torsoD, torso.hipW);
  const field = torsoField(torso);
  // Shoulders sit just outside the torso's real side surface, a little below its top.
  const sy = bodyTop - 0.7 * P.armR;
  const sx = exitAlong(field, V(0, sy, 0), V(1, 0, 0)) + 0.4 * P.armR;
  // Hips sit a touch below the torso's bottom, inside its width.
  const hipX = Math.min(P.hipX, Math.max(0.02, torso.hipW - 0.35 * P.legR));
  const hip = V(hipX, legTop - 0.1 * P.legR, 0);
  const ankleY = 1.75 * P.bootH; // so the boot sole lands on y = 0
  // Backpack: its front face sinks a quarter of its depth into the torso's real back.
  const py = torso.c.y + 0.1 * hh;
  const back = exitAlong(field, V(0, py, 0), V(0, 0, -1));
  const pack = { c: V(0, py, -(back + 0.75 * P.packD)), b: V(P.packW, P.packH, P.packD) };
  pack.r = P.packRound * Math.min(P.packW, P.packH, P.packD);
  // Chest panel on the front of the torso.
  const front = exitAlong(field, V(0, torso.c.y, 0), V(0, 0, 1));
  const panel = [front - 0.3 * Math.min(P.torsoD, 0.1), Math.min(0.39 * P.torsoW, 0.06), torso.c.y, Math.min(0.32 * hh, 0.034)];
  // Neck seal: hugs the helmet a little above the point where it meets the torso.
  const cy = bodyTop - 0.4 * P.helmetSink + P.ringT;
  const dy = (cy - head.c.y) / head.r.y;
  const collar = { c: V(0, cy, 0), r: head.r.x * Math.sqrt(Math.max(0.02, 1 - dy * dy)) + 0.2 * P.ringT };
  return { P, head, torso, shoulder: V(sx, sy, 0), hip, ankleY, pack, panel, collar, field };
}

/** Joint positions and ring frames at time t (seconds), loop-locked to CYCLE. */
export function pose(Lay, t, joints, rings) {
  const { P } = Lay;
  const W = (Math.PI * 2) / CYCLE;
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
    // the left knee bends more than the right, as in the viewer's relaxed float
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
  return bob;
}

/** A parameterised astronaut. setParams() takes any subset of params.js keys. */
export function makeAstronaut({ color = 'mint', eyes = 0 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(SCALE);
  root.add(body);
  const joints = Array.from({ length: 12 }, () => V());
  const rings = [];
  const U = {
    uInvModel: { value: new THREE.Matrix4() }, uLightLocal: { value: V() },
    uSuit: { value: colors(CREW.suit) }, uGear: { value: colors(CREW.gear) }, uAccent: { value: colors(CREW.contributors[color]) },
    uVisor: { value: colors(CREW.visor) }, uGlint: { value: new THREE.Color(CREW.glint) },
    uJ: { value: joints }, uRingC: { value: Array.from({ length: 8 }, () => V()) }, uRingA: { value: Array.from({ length: 8 }, () => V(0, 1, 0)) }, uRingR: { value: new Array(8).fill(0.05) },
    uHeadC: { value: V() }, uHeadR: { value: V() }, uTorsoC: { value: V() }, uTorsoB: { value: V() },
    uTorsoHipW: { value: 0 }, uTorsoCorner: { value: 0 }, uTorsoEgg: { value: 0 },
    uPackC: { value: V() }, uPackB: { value: V() }, uPackR: { value: 0 },
    uLimbR: { value: new THREE.Vector4() }, uMittR: { value: 0 }, uBootB: { value: V() }, uBootR: { value: 0 }, uBootOff: { value: V() },
    uK: { value: new THREE.Vector4() }, uShoulder: { value: 0 }, uHip: { value: 0 }, uElbow: { value: 0 }, uKnee: { value: 0 },
    uBall: { value: 1 }, uRingT: { value: 0.02 }, uRibs: { value: 2 }, uRibDepth: { value: 0.2 },
    uCollar: { value: 0 }, uGloveCuff: { value: 0 }, uBootCuff: { value: 0 }, uBandOnRing: { value: 0 },
    uCollarC: { value: V() }, uCollarR: { value: 0 }, uPanel: { value: new THREE.Vector4() },
    uEyes: { value: eyes }, uBlink: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, side: THREE.BackSide });
  const proxy = new THREE.Mesh(PROXY_GEO, mat);
  body.add(proxy);

  let Lay = null;
  let params = { ...DEFAULTS };
  function setParams(p) {
    params = { ...DEFAULTS, ...p };
    const P = params;
    Lay = layout(P);
    U.uHeadC.value.copy(Lay.head.c); U.uHeadR.value.copy(Lay.head.r);
    U.uTorsoC.value.copy(Lay.torso.c); U.uTorsoB.value.copy(Lay.torso.b);
    U.uTorsoHipW.value = Lay.torso.hipW; U.uTorsoCorner.value = Lay.torso.corner; U.uTorsoEgg.value = Lay.torso.egg;
    U.uPackC.value.copy(Lay.pack.c); U.uPackB.value.copy(Lay.pack.b); U.uPackR.value = Lay.pack.r;
    U.uLimbR.value.set(P.armR, P.armR * P.armTaper, P.legR, P.legR * P.legTaper);
    U.uMittR.value = P.mittR;
    U.uBootB.value.set(P.bootW, P.bootH, P.bootL); U.uBootR.value = 0.8 * Math.min(P.bootW, P.bootH, P.bootL);
    U.uBootOff.value.set(0, -0.75 * P.bootH, 0.31 * P.bootL);
    U.uK.value.set(P.neckBlend, P.bodyBlend, P.bendBlend, 0.006);
    U.uShoulder.value = P.shoulder; U.uHip.value = P.hip; U.uElbow.value = P.elbow; U.uKnee.value = P.knee;
    U.uBall.value = P.ballScale; U.uRingT.value = P.ringT; U.uRibs.value = P.ribs; U.uRibDepth.value = P.ribDepth;
    U.uCollar.value = P.collar; U.uGloveCuff.value = P.gloveCuff; U.uBootCuff.value = P.bootCuff; U.uBandOnRing.value = P.band;
    U.uCollarC.value.copy(Lay.collar.c); U.uCollarR.value = Lay.collar.r;
    U.uPanel.value.set(...Lay.panel);
  }
  setParams({});

  const q = new THREE.Quaternion();
  /** Pose at time t; yaw turns the figure; sway 0 drops the idle tilt (lineup, turntable). */
  function update(t, { yaw = 0, sway = 1, blink = 1 } = {}) {
    const W = (Math.PI * 2) / CYCLE;
    pose(Lay, t, joints, rings);
    rings.forEach((r, i) => { U.uRingC.value[i].copy(r.c); U.uRingA.value[i].copy(r.a).normalize(); U.uRingR.value[i] = r.r; });
    body.position.y = Math.sin(t * 2 * W) * 0.05;
    body.rotation.set(Math.sin(t * W + 1.3) * 0.05 * sway, 0, Math.sin(t * W) * 0.07 * sway);
    root.rotation.y = yaw;
    U.uBlink.value = blink;
    root.updateMatrixWorld(true);
    U.uInvModel.value.copy(proxy.matrixWorld).invert();
    proxy.matrixWorld.decompose(V(), q, V());
    U.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
  }
  const setColor = (key) => U.uAccent.value.forEach((c, i) => c.set(CREW.contributors[key][i]));
  const setEyes = (i) => (U.uEyes.value = i);
  return { group: root, setParams, update, setColor, setEyes, get params() { return params; } };
}
