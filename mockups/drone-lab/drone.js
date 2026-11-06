// One parameterised drone (an AI coding-agent session): a raymarched signed-distance body in
// the astronaut's pipeline (../explorations/astronaut-lab/astronaut.js): the same banded
// lighting, unified self-shadowing, contact occlusion and V2 screen eyes. Every shape, part
// and size is a uniform from params.js and every colour a uniform from palette.js, so a
// direction (or, in phase 2, a brand) is only a parameter set plus a palette; no shader is
// recompiled.
// Local units are world units (a K astronaut is 0.95 tall); the origin is the head centre,
// the drone faces +z.
import * as THREE from 'three';
import { EYES_GLSL } from '../asset-viewer/faces.js';
import { DEFAULTS } from './params.js';
import { PALETTES } from './palette.js';

export const LIGHT_DIR = new THREE.Vector3(-0.3, 0.55, 0.78).normalize(); // the viewer's top-left key
export const LOOP = 6; // s: the turntable loop; divides the scene's 24 s loop
// Loop-locked motion, as whole cycles per LOOP: bob 2, sway 1, rotor 12 turns, plume flicker 12, halo drift 4.
export const MOTION = { bob: 2, sway: 1, rotor: 12, flicker: 12, halo: 4, antenna: 2 };

const BMIN = [-0.64, -0.56, -0.64];
const BMAX = [0.64, 0.6, 0.64];

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
  uniform vec3 uShell[4], uTrim[4], uAcc[4], uGlow[4], uScr[3];
  uniform vec3 uHeadB; uniform vec4 uHeadK; // corner, round, taper, flat
  uniform int uBody; uniform vec3 uBodyC, uBodyB; uniform vec4 uBodyK; uniform float uNeck;
  uniform vec4 uScreen; // half-width share, half-height share, centre height, superellipse exponent
  uniform float uBezel, uEyeScale; uniform vec2 uEyePhys; uniform int uDroneEyes;
  uniform int uEars; uniform vec3 uEarC[2]; uniform float uEarR, uEarT;
  uniform int uTopper; uniform vec3 uGogC[2], uGogX[2], uGogY[2], uGogZ[2], uGogB; uniform float uGogR;
  uniform vec3 uCrestC, uCrestB;
  uniform int uAntN; uniform vec3 uAntA[2], uAntB[2]; uniform float uAntR, uAntTip;
  uniform int uArms; uniform vec3 uArmS[2], uArmE[2], uArmW[2], uClaw[4]; uniform float uArmR;
  uniform int uProp, uRotN; uniform vec3 uRotA[4], uRotE[4]; uniform float uRotR, uRotArmR, uSpin;
  uniform vec3 uRingC; uniform float uRingR, uRingT;
  uniform vec3 uLensC, uLensB; uniform int uHaloN; uniform vec3 uHaloC[2]; uniform float uHaloR[2];
  uniform vec3 uNozA, uNozB; uniform vec2 uNozR; uniform vec3 uPlA, uPlB; uniform vec2 uPlR;
  uniform int uAccent, uAccentOn; uniform float uAccentY, uAccentW;
  ${EYES_GLSL}
  in vec3 vPosW;

  const vec3 BMIN = vec3(${BMIN.join(', ')});
  const vec3 BMAX = vec3(${BMAX.join(', ')});
  const float HUB_H = 0.026; // rotor hub height above the arm end
  const float DISC_T = 0.006; // rotor disc half-thickness

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float smax(float a, float b, float k) { return -smin(-a, -b, k); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r; }
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
  // A cylinder around axis 'ax' (unit), radius r, half-length h, edges rounded by e.
  float sdCyl(vec3 p, vec3 c, vec3 ax, float r, float h, float e) {
    vec3 q = p - c; float a = dot(q, ax); vec2 d = vec2(length(q - ax * a) - r + e, abs(a) - h + e);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e;
  }
  float sdTorusY(vec3 p, vec3 c, float R, float r) { vec3 q = p - c; return length(vec2(length(q.xz) - R, q.y)) - r; }

  // The shell family: a rounded box blended toward an ellipsoid, tapered toward the bottom,
  // its bottom optionally cut flat (k = corner radius, round, taper, flat). Mirrored in JS.
  float sdShape(vec3 q, vec3 b, vec4 k) {
    float t = clamp((q.y + b.y) / (2.0 * b.y), 0.0, 1.0);
    float s = 1.0 / mix(k.z, 1.0, t);
    vec3 r = vec3(q.x * s, q.y, q.z * s);
    float d = mix(sdRoundBox(r, b, k.x), sdEllipsoid(r, b), k.y) * min(1.0, 1.0 / s);
    if (k.w > 0.001) d = smax(d, -b.y * (1.0 - k.w) - q.y, 0.02);
    return d;
  }

  float dHead(vec3 p) { return sdShape(p, uHeadB, uHeadK); }
  float dBody(vec3 p) { return sdShape(p - uBodyC, uBodyB, uBodyK); }
  float dEar(vec3 p, int s) {
    if (uEars == 1) return sdCyl(p, uEarC[s], vec3(1.0, 0.0, 0.0), uEarR, uEarT, min(uEarT, uEarR) * 0.6);
    vec3 q = p - uEarC[s]; // swept fin: tilted back
    q.yz = mat2(0.8776, -0.4794, 0.4794, 0.8776) * q.yz;
    return sdRoundBox(q, vec3(uEarT, uEarR, uEarR * 0.62), min(uEarT, uEarR) * 0.9);
  }
  vec3 gogLocal(vec3 p, int i) { vec3 q = p - uGogC[i]; return vec3(dot(q, uGogX[i]), dot(q, uGogY[i]), dot(q, uGogZ[i])); }
  float dGog(vec3 p, int i) { return sdRoundBox(gogLocal(p, i), uGogB, uGogR); }
  float dCrest(vec3 p) { return sdEllipsoid(p - uCrestC, uCrestB); }
  float dStalk(vec3 p, int i) { return sdCapsule(p, uAntA[i], uAntB[i], uAntR); }
  float dTip(vec3 p, int i) { return length(p - uAntB[i]) - uAntTip; }
  float dArm(vec3 p, int s) {
    if (uArms == 1) return smin(sdCapsule(p, uArmS[s], uArmE[s], uArmR), length(p - uArmE[s]) - uArmR * 1.4, 0.01);
    float d = smin(sdCapsule(p, uArmS[s], uArmE[s], uArmR), sdCapsule(p, uArmE[s], uArmW[s], uArmR * 0.85), 0.012);
    d = min(d, length(p - uArmW[s]) - uArmR * 1.05);
    d = min(d, sdCapsule(p, uArmW[s], uClaw[s * 2], uArmR * 0.55));
    return min(d, sdCapsule(p, uArmW[s], uClaw[s * 2 + 1], uArmR * 0.55));
  }
  float dRotArm(vec3 p, int i) { return sdCapsule(p, uRotA[i], uRotE[i], uRotArmR); }
  float dHub(vec3 p, int i) { return sdCyl(p, uRotE[i] + vec3(0.0, HUB_H * 0.5, 0.0), vec3(0.0, 1.0, 0.0), uRotArmR * 1.35, HUB_H * 0.5, 0.006); }
  float dDisc(vec3 p, int i) { return sdCyl(p, uRotE[i] + vec3(0.0, HUB_H, 0.0), vec3(0.0, 1.0, 0.0), uRotR, DISC_T, DISC_T); }
  float dRing(vec3 p) { return sdTorusY(p, uRingC, uRingR, uRingT); }
  float dRingCore(vec3 p) { return sdCyl(p, uRingC, vec3(0.0, 1.0, 0.0), uRingR - uRingT * 0.4, uRingT * 0.55, 0.004); }
  float dLens(vec3 p) { return sdEllipsoid(p - uLensC, uLensB); }
  float dHalo(vec3 p, int i) { return sdTorusY(p, uHaloC[i], uHaloR[i], 0.0105); }
  float dNoz(vec3 p) { return sdRoundCone(p, uNozA, uNozB, uNozR.x, uNozR.y); }
  float dPlume(vec3 p) { return sdRoundCone(p, uPlA, uPlB, uPlR.x, uPlR.y); }

  // Shell parts blend softly (neck); every add-on part joins crisply (k = 0.006), so it reads
  // as a separate part through shading alone (no outlines). Halos float free (listed parts).
  float map(vec3 p) {
    float d = dHead(p);
    if (uBody == 1) d = smin(d, dBody(p), uNeck);
    const float K = 0.006;
    for (int s = 0; s < 2; s++) {
      if (uEars > 0) d = smin(d, dEar(p, s), K);
      if (uTopper == 1) d = smin(d, dGog(p, s), K);
      if (s < uAntN) d = smin(smin(d, dStalk(p, s), K), dTip(p, s), K);
      if (uArms > 0) d = smin(d, dArm(p, s), K);
    }
    if (uTopper == 2) d = smin(d, dCrest(p), 0.012);
    if (uProp == 0) {
      for (int i = 0; i < 4; i++) {
        if (i >= uRotN) break;
        d = smin(d, dRotArm(p, i), K);
        d = smin(d, dHub(p, i), K);
        d = min(d, dDisc(p, i));
      }
    } else if (uProp == 1) {
      d = smin(d, dRingCore(p), K);
      d = smin(d, dRing(p), K);
    } else if (uProp == 2) {
      d = smin(d, dLens(p), K);
      for (int i = 0; i < 2; i++) if (i < uHaloN) d = min(d, dHalo(p, i));
    } else {
      d = smin(d, dNoz(p), K);
      d = smin(d, dPlume(p), K);
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
      float h = 0.02 * float(i);
      o += (h - map(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }

  // Face screen, in yaw/pitch about the head centre (normalised head space), so it wraps any
  // head shape. xy = screen coords (-1..1, y up), z = superellipse value (< 1 inside).
  vec3 screenQ(vec3 p) {
    vec3 n = p / uHeadB;
    vec2 q = vec2(atan(n.x, n.z) / atan(uScreen.x), (atan(n.y, n.z) - atan(uScreen.z)) / atan(uScreen.y));
    return vec3(q, n.z > 0.0 ? pow(abs(q.x), uScreen.w) + pow(abs(q.y), uScreen.w) : 9.0);
  }
  // Drone-only glyphs, in the V2 32 x 24 eye box (blink squashes them like the V2 set).
  bool droneEyeLit(vec2 P) {
    P.y = 12.0 + (P.y - 12.0) / max(uBlink, 0.05);
    float d = 1e9;
    if (uDroneEyes == 10) { // pills: two upright capsules
      for (int k = -1; k <= 1; k += 2) d = min(d, sdSeg(P, vec2(16.0 + float(k) * 6.5, 9.6), vec2(16.0 + float(k) * 6.5, 14.4)) - 2.5);
    } else if (uDroneEyes == 11) { // blocks: two rounded squares
      for (int k = -1; k <= 1; k += 2) d = min(d, sdRRect(P, vec2(16.0 + float(k) * 7.0, 12.0), vec2(3.6), 1.2));
    } else { // prompt >_
      d = min(sdSeg(P, vec2(7.0, 7.5), vec2(12.5, 12.0)), sdSeg(P, vec2(12.5, 12.0), vec2(7.0, 16.5))) - 1.35;
      d = min(d, sdSeg(P, vec2(16.5, 16.5), vec2(24.5, 16.5)) - 1.35);
    }
    return d < 0.0;
  }
  // q -> eye-box pixels: the 32 x 24 box fitted inside the screen at its real aspect, so wide
  // or tall screens never stretch the glyphs.
  float eyeUnit() { return min(2.0 * uEyePhys.x / 32.0, 2.0 * uEyePhys.y / 24.0); }
  bool eyesLit(vec2 q) {
    vec2 P = vec2(16.0, 12.0) + vec2(q.x * uEyePhys.x, -q.y * uEyePhys.y) / (eyeUnit() * uEyeScale);
    if (uDroneEyes >= 10) return droneEyeLit(P);
    return eyeLit(P / vec2(32.0, 24.0));
  }
  // A small fixed L glint near the screen's top-left corner (moved in for round screens).
  bool glint(vec2 q) {
    float u = eyeUnit();
    float o = mix(6.0, 3.0, clamp((uScreen.w - 2.0) / 4.0, 0.0, 1.0));
    vec2 G = vec2((q.x + 1.0) * uEyePhys.x, (1.0 - q.y) * uEyePhys.y) / u - o;
    return (G.y >= 0.0 && G.y < 1.0 && G.x >= 0.0 && G.x < 2.0) || (G.y >= 1.0 && G.y < 2.0 && G.x >= 0.0 && G.x < 1.0);
  }

  // Accent on a shell part, in that part's normalised space.
  bool accentAt(vec3 n, vec3 p, vec3 b) {
    if (uAccent == 1) return abs(n.y - uAccentY) < uAccentW;
    if (uAccent == 2) return n.z > 0.55 && abs(n.x) < uAccentW * 1.6 && abs(n.y - uAccentY) < uAccentW;
    if (uAccent == 3) return abs(p.x) < uAccentW * b.x * 0.5 && n.y > -0.25;
    return false;
  }

  // Colour region: 0 shell, 1 trim, 2 accent, 3 screen, 4 glow (emissive), 5 rotor disc, 6 goggle lens.
  int region(vec3 p, out vec2 sq) {
    sq = vec2(0.0);
    float best = dHead(p), d;
    int part = 0; // 0 head 1 body 2 trim 3 accent 4 glow 5 disc 6 goggle 7 ring
    int gi = 0;
    if (uBody == 1) { d = dBody(p); if (d < best) { best = d; part = 1; } }
    for (int s = 0; s < 2; s++) {
      if (uEars > 0) { d = dEar(p, s); if (d < best) { best = d; part = 2; } }
      if (uTopper == 1) { d = dGog(p, s); if (d < best) { best = d; part = 6; gi = s; } }
      if (s < uAntN) {
        d = dStalk(p, s); if (d < best) { best = d; part = 2; }
        d = dTip(p, s); if (d < best) { best = d; part = 4; }
      }
      if (uArms > 0) { d = dArm(p, s); if (d < best) { best = d; part = 2; } }
    }
    if (uTopper == 2) { d = dCrest(p); if (d < best) { best = d; part = 3; } }
    if (uProp == 0) {
      for (int i = 0; i < 4; i++) {
        if (i >= uRotN) break;
        d = min(dRotArm(p, i), dHub(p, i)); if (d < best) { best = d; part = 2; }
        d = dDisc(p, i); if (d < best) { best = d; part = 5; gi = i; }
      }
    } else if (uProp == 1) {
      d = dRing(p); if (d < best) { best = d; part = 7; }
      d = dRingCore(p); if (d < best) { best = d; part = 4; }
    } else if (uProp == 2) {
      d = dLens(p); if (d < best) { best = d; part = 4; }
      for (int i = 0; i < 2; i++) if (i < uHaloN) { d = dHalo(p, i); if (d < best) { best = d; part = 4; } }
    } else {
      d = dNoz(p); if (d < best) { best = d; part = 2; }
      d = dPlume(p); if (d < best) { best = d; part = 4; }
    }
    if (part == 0) {
      vec3 s = screenQ(p);
      sq = s.xy;
      if (s.z < 1.0) return 3;
      if (uBezel > 0.0 && s.z < pow(1.0 + uBezel, uScreen.w)) return 1;
      return (uAccentOn == 0 && accentAt(p / uHeadB, p, uHeadB)) ? 2 : 0;
    }
    if (part == 1) return (uAccentOn == 1 && accentAt((p - uBodyC) / uBodyB, p - uBodyC, uBodyB)) ? 2 : 0;
    if (part == 6) {
      vec3 g = gogLocal(p, gi);
      if (g.z > 0.0 && sdRoundBox(vec3(g.xy, 0.0), vec3(uGogB.xy - 0.017, 1.0), max(uGogR - 0.017, 0.004)) < 0.0) { sq = g.xy / uGogB.xy; return 6; }
      return 1;
    }
    if (part == 5) { // spinning blades: two dark blade bands across the disc
      vec3 q = p - uRotE[gi];
      float a = atan(q.z, q.x) + uSpin * (gi == 1 || gi == 2 ? -1.0 : 1.0);
      sq = vec2(abs(sin(a)), length(q.xz) / uRotR);
      return 5;
    }
    if (part == 7) return p.y < uRingC.y - uRingT * 0.35 ? 4 : 1; // the ring's underside glows
    if (part == 2) return 1;
    if (part == 3) return 2;
    return 4;
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
      if (h < 0.0010 * (1.0 + t)) { hit = true; break; }
      t += h * 0.85;
      if (t > tf) break;
    }
    if (!hit) discard;
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec2 sq;
    int r = region(p, sq);
    vec3 c;
    if (r == 4) { // emissive: unlit, a bright face toward the camera and a mid rim
      c = dot(n, -rd) > 0.6 ? uGlow[3] : uGlow[2];
    } else {
      vec3 L = normalize(uLightLocal);
      float lit = dot(n, L);
      if (shadow(p + n * 0.006, L) < 0.5) lit = min(lit, 0.1) - 0.3;
      lit -= (1.0 - occlusion(p, n)) * 0.6;
      int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
      if (r == 3 || r == 6) {
        vec3 refl = reflect(rd, n);
        c = (refl.y > 0.18 && b >= 2) ? uScr[1] : uScr[0];
        if (r == 3) {
          if (eyesLit(sq)) c = uGlow[3];
          if (glint(sq)) c = uScr[2];
        } else if (sq.x < -0.35 && sq.y > 0.2 && sq.y < 0.62 && sq.x > -0.7) c = uScr[2]; // goggle glint
      } else if (r == 5) {
        c = (sq.x < 0.3 && sq.y > 0.25) ? uTrim[max(b - 1, 0)] : uTrim[min(b + 1, 3)];
      } else if (r == 2) c = uAcc[b];
      else if (r == 1) c = uTrim[b];
      else c = uShell[b];
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const PROXY_GEO = new THREE.BoxGeometry(BMAX[0] - BMIN[0], BMAX[1] - BMIN[1], BMAX[2] - BMIN[2])
  .translate((BMAX[0] + BMIN[0]) / 2, (BMAX[1] + BMIN[1]) / 2, (BMAX[2] + BMIN[2]) / 2);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const colors = (hexes) => hexes.map((h) => new THREE.Color(h));

// ---------------------------------------------------------------- JS ports of the shell field
// Used to attach every add-on to the shell's real surface whatever its shape, so the drone
// stays one connected piece.
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smin = (a, b, k) => { const h = clamp01(0.5 + (0.5 * (b - a)) / k); return mix(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
const roundBox = (x, y, z, b, r) => {
  const qx = Math.abs(x) - b.x + r, qy = Math.abs(y) - b.y + r, qz = Math.abs(z) - b.z + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const ellipsoid = (x, y, z, r) => {
  const k0 = Math.hypot(x / r.x, y / r.y, z / r.z), k1 = Math.hypot(x / (r.x * r.x), y / (r.y * r.y), z / (r.z * r.z));
  return (k0 * (k0 - 1)) / k1;
};
/** The shell family's distance field (sdShape in the shader), centred at c. k = [corner, round, taper, flat]. */
export function shapeField(c, b, k) {
  return (p) => {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    const t = clamp01((y + b.y) / (2 * b.y));
    const s = 1 / mix(k[2], 1, t);
    let d = mix(roundBox(x * s, y, z * s, b, k[0]), ellipsoid(x * s, y, z * s, b), k[1]) * Math.min(1, 1 / s);
    if (k[3] > 0.001) d = smax(d, -b.y * (1 - k[3]) - y, 0.02);
    return d;
  };
}
/** Where a ray from inside a field leaves it (bisection). */
export function exitAlong(field, from, dir, maxT = 0.8) {
  let lo = 0, hi = maxT;
  if (field(from) > 0) return 0;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (field(from.clone().addScaledVector(dir, m)) < 0) lo = m; else hi = m;
  }
  return lo;
}
const gradient = (field, p) => {
  const e = 1e-4;
  return V(
    field(V(p.x + e, p.y, p.z)) - field(V(p.x - e, p.y, p.z)),
    field(V(p.x, p.y + e, p.z)) - field(V(p.x, p.y - e, p.z)),
    field(V(p.x, p.y, p.z + e)) - field(V(p.x, p.y, p.z - e)),
  ).normalize();
};
const shapeK = (P, pre) => [P[`${pre}Corner`] * Math.min(P[`${pre}W`], P[`${pre}H`], P[`${pre}D`]), P[`${pre}Round`], P[`${pre}Taper`], P.headFlat * (pre === 'head' ? 1 : 0)];

/** The rest layout of a parameter set: every part's size and place, in drone units. */
export function layout(P) {
  const head = { c: V(), b: V(P.headW, P.headH, P.headD), k: shapeK(P, 'head') };
  const headF = shapeField(head.c, head.b, head.k);
  const headBottom = -exitAlong(headF, V(), V(0, -1, 0));
  const body = { on: P.body === 1, b: V(P.bodyW, P.bodyH, P.bodyD), k: shapeK(P, 'body') };
  body.c = V(0, headBottom - P.bodyH + P.bodySink, 0);
  const bodyF = shapeField(body.c, body.b, body.k);
  const core = body.on ? (p) => smin(headF(p), bodyF(p), P.neckBlend) : headF;
  const S = body.on ? body : head; // the part arms and side rotors hang from
  const bottom = -exitAlong(core, V(0, S.c.y, 0), V(0, -1, 0), 1) + S.c.y;
  const top = exitAlong(headF, V(), V(0, 1, 0));

  // Ears: on the head's real sides.
  const earY = P.earY * P.headH;
  const earX = exitAlong(headF, V(0, earY, 0), V(1, 0, 0)) + (P.ears === 1 ? 0.15 : 0.35) * P.earT;
  const ears = [V(-earX, earY, 0), V(earX, earY, 0)];

  // Goggles: two lenses on the head's upper front, tangent to the surface.
  const gog = [-1, 1].map((s) => {
    const dir = V(s * P.gogX * P.headW, P.gogY * P.headH, 0.62 * P.headD).normalize();
    const at = dir.clone().multiplyScalar(exitAlong(headF, V(), dir));
    const z = gradient(headF, at);
    const x = V(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x).normalize();
    return { c: at.addScaledVector(z, 0.004), x, y, z };
  });
  const crest = { c: V(0, top - 0.012, -0.12 * P.headD), b: V(0.016, 0.05, 0.6 * P.headD) };

  // Antenna base(s) on the head top; a top rotor pushes a single antenna back.
  const topRotor = P.prop === 0 && P.rotorN === 0;
  const antN = P.antenna;
  const ant = [];
  for (let i = 0; i < antN; i++) {
    const s = antN === 2 ? (i === 0 ? -1 : 1) : 0;
    const back = topRotor ? 0.55 : 0.12;
    const dir = V(s * 0.45 * P.headW, P.headH, -back * P.headD).normalize();
    const base = dir.clone().multiplyScalar(exitAlong(headF, V(), dir) - 0.01);
    const lean = antN === 2 ? V(s * Math.sin(P.antTilt), Math.cos(P.antTilt), -0.15) : V(0, Math.cos(P.antTilt), -Math.sin(P.antTilt));
    ant.push({ base, dir: lean.normalize() });
  }

  // Arms: from the shell's real sides.
  const armY = S.c.y + P.armY * S.b.y;
  const shoulderX = exitAlong(core, V(0, armY, 0), V(1, 0, 0)) - 0.35 * P.armR;

  // Rotors.
  const rotors = [];
  if (P.rotorN === 0) {
    const a = V(0, top - 0.01, 0);
    rotors.push({ a, e: V(0, top + 0.03 + 0.25 * P.rotorArm, 0) });
  } else {
    const ry = S.c.y + P.rotorY * S.b.y;
    const dirs = P.rotorN === 1 ? [V(-1, 0, 0), V(1, 0, 0)] : [V(-1, 0, 1), V(1, 0, 1), V(1, 0, -1), V(-1, 0, -1)].map((d) => d.normalize());
    for (const d of dirs) {
      const from = V(0, ry, 0);
      const a = from.clone().addScaledVector(d, exitAlong(core, from, d) - 0.02);
      const lift = 0.35 * P.rotorArm; // arms angle up a little, so discs clear the shell
      const e = a.clone().addScaledVector(d, P.rotorArm + Math.max(0, P.rotorR - 0.5 * P.rotorArm) * 0.6).add(V(0, lift, 0));
      rotors.push({ a, e });
    }
  }

  // Under-shell hover parts.
  const ring = { c: V(0, bottom - 0.25 * P.ringT, 0) };
  const lens = { c: V(0, bottom + 0.2 * P.glowR * 0.45, 0), b: V(P.glowR, P.glowR * 0.45, P.glowR) };
  const noz = { a: V(0, bottom + 0.015, 0), b: V(0, bottom - 0.035, 0), r: [P.glowR, P.glowR * 0.78] };

  return { P, head, body, headF, core, top, bottom, ears, gog, crest, ant, armY, shoulderX, rotors, ring, lens, noz, S };
}

const TAU = Math.PI * 2;
const W = TAU / LOOP;

/** Everything that moves, at time t (s), loop-locked to LOOP. Returns the pose-dependent parts. */
export function pose(Lay, t) {
  const { P } = Lay;
  const bobPhase = t * W * MOTION.bob;
  // Antenna: a lagging sway against the bob (secondary motion).
  const sway = 0.14 * Math.sin(t * W * MOTION.antenna - 1.0);
  const ant = Lay.ant.map(({ base, dir }) => {
    const d = dir.clone().applyAxisAngle(V(1, 0, 0), -sway).normalize();
    return { a: base, b: base.clone().addScaledVector(d, P.antL) };
  });
  // Arms: hang out-down, a little forward, breathing with the bob.
  const arms = [-1, 1].map((s) => {
    const lift = 0.1 * Math.sin(bobPhase + 0.7 + s * 0.4);
    const splay = P.armSplay + lift;
    const dir = V(s * Math.sin(splay), -Math.cos(splay), 0.35).normalize();
    const S = V(s * Lay.shoulderX, Lay.armY, 0);
    if (P.arms === 1) return { s: S, e: S.clone().addScaledVector(dir, P.armLen) };
    const E = S.clone().addScaledVector(dir, P.armLen * 0.5);
    const fore = V(s * Math.sin(splay * 0.4), -Math.cos(splay * 0.4) * 0.6, 0.8 + 0.15 * lift).normalize();
    const Wr = E.clone().addScaledVector(fore, P.armLen * 0.5);
    const side = V(s, 0, 0).cross(fore).normalize(); // claws open up and down
    const open = 0.45 + 0.15 * Math.sin(bobPhase);
    const claw = [1, -1].map((k) => Wr.clone().addScaledVector(fore.clone().applyAxisAngle(side.clone().multiplyScalar(k), open).normalize(), P.armR * 2.2));
    return { s: S, e: E, w: Wr, claw };
  });
  const flick = 1 + 0.12 * Math.sin(t * W * MOTION.flicker);
  const plume = { a: Lay.noz.b.clone().add(V(0, -0.004, 0)), b: Lay.noz.b.clone().add(V(0, -P.plumeL * flick, 0)), r: [P.glowR * 0.62, 0.014] };
  const lensBottom = Lay.lens.c.y - Lay.lens.b.y;
  // Halos breathe together (radius) and sink a touch, keeping >= 2 px of space between parts.
  const breathe = 0.5 + 0.5 * Math.sin(t * W * MOTION.halo);
  const halos = [0, 1].map((i) => ({ c: V(0, lensBottom - 0.065 - i * 0.1 - 0.008 * breathe, 0), r: P.glowR * (1.25 - 0.3 * i) * (1 + 0.08 * breathe) }));
  return { bob: Math.sin(bobPhase) * P.bobAmp, tilt: Math.sin(t * W * MOTION.sway), spin: t * W * MOTION.rotor, ant, arms, plume, halos };
}

/** Pieces the silhouette is meant to have: 1, plus each free-floating anti-grav halo. */
export const intendedPieces = (P) => 1 + (P.prop === 2 ? P.halos : 0);

/** Top and bottom of the drone at rest (drone units), for framing. */
export function extents(Lay) {
  const { P } = Lay;
  let top = Lay.top, bottom = Lay.bottom;
  const ps = pose(Lay, 0);
  for (const a of ps.ant) top = Math.max(top, a.b.y + P.antTip);
  if (P.topper === 2) top = Math.max(top, Lay.crest.c.y + Lay.crest.b.y);
  if (P.prop === 0) for (const r of Lay.rotors) top = Math.max(top, r.e.y + 0.035);
  if (P.prop === 1) bottom = Math.min(bottom, Lay.ring.c.y - P.ringT);
  if (P.prop === 2) bottom = Math.min(bottom, P.halos ? ps.halos[P.halos - 1].c.y - 0.02 : Lay.lens.c.y - Lay.lens.b.y);
  if (P.prop === 3) bottom = Math.min(bottom, ps.plume.b.y - 0.02);
  return { top, bottom };
}

/** A parameterised drone. setParams() takes any subset of params.js keys; setPalette() a palette.js entry. */
export function makeDrone({ palette = PALETTES.base } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const vecs = (n) => Array.from({ length: n }, () => V());
  const U = {
    uInvModel: { value: new THREE.Matrix4() }, uLightLocal: { value: V() },
    uShell: { value: colors(palette.shell) }, uTrim: { value: colors(palette.trim) }, uAcc: { value: colors(palette.accent) },
    uGlow: { value: colors(palette.glow) }, uScr: { value: colors(palette.screen) },
    uHeadB: { value: V() }, uHeadK: { value: new THREE.Vector4() },
    uBody: { value: 1 }, uBodyC: { value: V() }, uBodyB: { value: V() }, uBodyK: { value: new THREE.Vector4() }, uNeck: { value: 0.03 },
    uScreen: { value: new THREE.Vector4() }, uBezel: { value: 0 }, uEyeScale: { value: 1 }, uEyePhys: { value: new THREE.Vector2() }, uDroneEyes: { value: 0 },
    uEars: { value: 0 }, uEarC: { value: vecs(2) }, uEarR: { value: 0 }, uEarT: { value: 0 },
    uTopper: { value: 0 }, uGogC: { value: vecs(2) }, uGogX: { value: vecs(2) }, uGogY: { value: vecs(2) }, uGogZ: { value: vecs(2) }, uGogB: { value: V() }, uGogR: { value: 0 },
    uCrestC: { value: V() }, uCrestB: { value: V() },
    uAntN: { value: 0 }, uAntA: { value: vecs(2) }, uAntB: { value: vecs(2) }, uAntR: { value: 0.0115 }, uAntTip: { value: 0 },
    uArms: { value: 0 }, uArmS: { value: vecs(2) }, uArmE: { value: vecs(2) }, uArmW: { value: vecs(2) }, uClaw: { value: vecs(4) }, uArmR: { value: 0 },
    uProp: { value: 0 }, uRotN: { value: 0 }, uRotA: { value: vecs(4) }, uRotE: { value: vecs(4) }, uRotR: { value: 0 }, uRotArmR: { value: 0.016 }, uSpin: { value: 0 },
    uRingC: { value: V() }, uRingR: { value: 0 }, uRingT: { value: 0 },
    uLensC: { value: V() }, uLensB: { value: V(1, 1, 1) }, uHaloN: { value: 0 }, uHaloC: { value: vecs(2) }, uHaloR: { value: [0.05, 0.05] },
    uNozA: { value: V() }, uNozB: { value: V(0, -1, 0) }, uNozR: { value: new THREE.Vector2() }, uPlA: { value: V() }, uPlB: { value: V(0, -1, 0) }, uPlR: { value: new THREE.Vector2() },
    uAccent: { value: 0 }, uAccentOn: { value: 0 }, uAccentY: { value: 0 }, uAccentW: { value: 0 },
    uEyes: { value: 0 }, uBlink: { value: 1 },
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
    U.uHeadB.value.copy(Lay.head.b); U.uHeadK.value.set(...Lay.head.k);
    U.uBody.value = P.body; U.uBodyC.value.copy(Lay.body.c); U.uBodyB.value.copy(Lay.body.b); U.uBodyK.value.set(...Lay.body.k); U.uNeck.value = P.neckBlend;
    U.uScreen.value.set(P.screenW, P.screenH, P.screenY, P.screenRound); U.uBezel.value = P.bezel; U.uEyeScale.value = P.eyeScale;
    U.uEyePhys.value.set(P.headW * mix(P.screenW, Math.sin(Math.atan(P.screenW)), P.headRound), P.headH * mix(P.screenH, Math.sin(Math.atan(P.screenH)), P.headRound));
    U.uDroneEyes.value = P.eyes; U.uEyes.value = Math.min(P.eyes, 9);
    U.uEars.value = P.ears; Lay.ears.forEach((e, i) => U.uEarC.value[i].copy(e)); U.uEarR.value = P.earR; U.uEarT.value = P.earT;
    U.uTopper.value = P.topper;
    Lay.gog.forEach((g, i) => { U.uGogC.value[i].copy(g.c); U.uGogX.value[i].copy(g.x); U.uGogY.value[i].copy(g.y); U.uGogZ.value[i].copy(g.z); });
    U.uGogB.value.set(P.gogW, P.gogH, 0.014); U.uGogR.value = 0.6 * Math.min(P.gogW, P.gogH);
    U.uCrestC.value.copy(Lay.crest.c); U.uCrestB.value.copy(Lay.crest.b);
    U.uAntN.value = P.antenna; U.uAntTip.value = P.antTip;
    U.uArms.value = P.arms; U.uArmR.value = P.armR;
    U.uProp.value = P.prop; U.uRotN.value = P.prop === 0 ? Lay.rotors.length : 0; U.uRotR.value = P.rotorR;
    Lay.rotors.forEach((r, i) => { U.uRotA.value[i].copy(r.a); U.uRotE.value[i].copy(r.e); });
    U.uRingC.value.copy(Lay.ring.c); U.uRingR.value = P.ringR; U.uRingT.value = P.ringT;
    U.uLensC.value.copy(Lay.lens.c); U.uLensB.value.copy(Lay.lens.b); U.uHaloN.value = P.prop === 2 ? P.halos : 0;
    U.uNozA.value.copy(Lay.noz.a); U.uNozB.value.copy(Lay.noz.b); U.uNozR.value.set(...Lay.noz.r);
    U.uAccent.value = P.accent; U.uAccentOn.value = P.body === 1 ? P.accentOn : 0; U.uAccentY.value = P.accentY; U.uAccentW.value = P.accentW;
  }
  setParams({});

  function setPalette(pal) {
    for (const [u, k] of [['uShell', 'shell'], ['uTrim', 'trim'], ['uAcc', 'accent'], ['uGlow', 'glow'], ['uScr', 'screen']]) U[u].value.forEach((c, i) => c.set(pal[k][i]));
  }

  const q = new THREE.Quaternion();
  /** Pose at time t; yaw turns the drone; sway 0 drops the idle tilt (lineup, turntable). */
  function update(t, { yaw = 0, sway = 1, blink = 1 } = {}) {
    const ps = pose(Lay, t);
    ps.ant.forEach((a, i) => { U.uAntA.value[i].copy(a.a); U.uAntB.value[i].copy(a.b); });
    ps.arms.forEach((a, i) => {
      U.uArmS.value[i].copy(a.s); U.uArmE.value[i].copy(a.e);
      if (a.w) { U.uArmW.value[i].copy(a.w); U.uClaw.value[i * 2].copy(a.claw[0]); U.uClaw.value[i * 2 + 1].copy(a.claw[1]); }
    });
    U.uPlA.value.copy(ps.plume.a); U.uPlB.value.copy(ps.plume.b); U.uPlR.value.set(...ps.plume.r);
    ps.halos.forEach((h, i) => { U.uHaloC.value[i].copy(h.c); U.uHaloR.value[i] = h.r; });
    U.uSpin.value = ps.spin;
    body.position.y = ps.bob;
    body.rotation.set(0.05 * sway * ps.tilt, 0, 0.06 * sway * Math.sin(t * W * MOTION.sway + 1.3));
    root.rotation.y = yaw;
    U.uBlink.value = blink;
    root.updateMatrixWorld(true);
    U.uInvModel.value.copy(proxy.matrixWorld).invert();
    proxy.matrixWorld.decompose(V(), q, V());
    U.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
  }
  return { group: root, setParams, setPalette, update, get params() { return params; }, get layout() { return Lay; } };
}
