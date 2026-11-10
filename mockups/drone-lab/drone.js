// One parameterised drone (an AI coding-agent session): a raymarched signed-distance body in
// the astronaut's pipeline (../explorations/astronaut-lab/astronaut.js): the same banded
// lighting, unified self-shadowing, contact occlusion and V2 screen eyes (faces.js). It is
// head-is-body: one rounded head with a dark face screen, on a thruster pack that sputters
// chunky smoke puffs. Every shape, part, size and motion is a uniform from params.js and every
// colour a uniform from palette.js, so a variant (or, in phase 2, a brand) is only a parameter
// set plus a palette; no shader is recompiled.
// Local units are world units (a K astronaut is 0.95 tall); the origin is the head centre and
// the drone faces +z.
// Everything moves on a loop: 6 s for the turntable and stills (bob, sway, puffs, blink), 12 s
// for the motion loop (drift, banking, looking around, the working face). Both divide the
// scene's 24 s loop. All of it is a pure function of t (no Math.random, no wall clock).
import * as THREE from 'three';
import { EYES_GLSL } from '../asset-viewer/faces.js';
import { DEFAULTS, DRONE_EYE } from './params.js';
import { PALETTES } from './palette.js';

export const LIGHT_DIR = new THREE.Vector3(-0.3, 0.55, 0.78).normalize(); // the viewer's top-left key
export const LOOP = 6; // s: idle loop (turntable, stills)
export const MOTION_LOOP = 12; // s: the full behaviour loop (drift, look around, work)
export const PUFF_PERIOD = 1.5; // s: each smoke slot fires at most once per period
// Whole cycles per 12 s motion loop. Bob, sway and puffs also divide the 6 s idle loop.
export const CYCLES = { bob: 4, sway: 2, drift: 1, puffs: MOTION_LOOP / PUFF_PERIOD };
export const MAX_PUFFS = 32;
export const MAX_SPARKS = 6;
export const MAX_CROWN = 9;
export const MAX_SKIRT = 8;

const BMIN = [-0.6, -0.62, -0.6];
const BMAX = [0.6, 0.46, 0.6];

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
  uniform float uPixK;
  uniform vec3 uShell[4], uTrim[4], uAcc[4], uGlow[4], uScr[3], uSmoke[3];
  uniform vec3 uHeadB; uniform vec4 uHeadK; // corner, round, taper, flat
  uniform int uChin; uniform vec3 uChinC; uniform float uChinR;
  uniform int uRim; uniform vec3 uRimC; uniform vec2 uRimR; uniform float uRimT;
  uniform vec4 uScreen; // half-width tan, half-height tan, centre height, superellipse exponent
  uniform float uBezel; uniform vec2 uEyePhys;
  uniform vec4 uEyeXf; // eye offset x, y (eye-box px), scale, blink
  uniform vec4 uGlyph; // working face: glyph coverage 0..1, time into the work (s), flashes per second, glyph pixel size (eye-box px)
  uniform int uEyesOn, uFaceDebug;
  uniform int uEars; uniform vec3 uEarC[2]; uniform float uEarR, uEarT, uEarSweep;
  uniform int uTopper; uniform vec3 uGogC[2], uGogX[2], uGogY[2], uGogZ[2], uGogB; uniform float uGogR, uGogF;
  uniform int uGogBr, uGogSt; uniform vec3 uBrA, uBrM, uBrB, uStC, uStN; uniform vec2 uStR; uniform float uBrR, uStT; // goggle bridge and strap
  uniform vec3 uCrestC, uCrestB;
  uniform int uAntN; uniform vec3 uAntA[2], uAntB[2]; uniform float uAntR, uAntTip;
  uniform int uThrN; uniform vec3 uThrA[4], uThrB[4]; uniform vec2 uThrR;
  uniform int uAccent; uniform float uAccentY, uAccentW;
  uniform int uSmokeOn, uSmokeStyle, uPuffN; uniform vec3 uPuffC[${MAX_PUFFS}], uPuffV[${MAX_PUFFS}]; uniform float uPuffR[${MAX_PUFFS}], uPuffA[${MAX_PUFFS}];
  uniform int uSparkN; uniform vec3 uSparkC[${MAX_SPARKS}]; uniform float uSparkS[${MAX_SPARKS}];
  // Brand geometry (phase 2); all off by default.
  uniform float uHeadHex;
  uniform int uCrownN; uniform vec3 uCrownC[${MAX_CROWN}]; uniform float uCrownR, uCrownK;
  uniform int uSkirt, uSkirtN; uniform vec3 uSkA[${MAX_SKIRT}], uSkB[${MAX_SKIRT}], uSkC[${MAX_SKIRT}]; uniform float uSkR;
  uniform int uSnout; uniform vec3 uSnA, uSnB; uniform vec2 uSnR;
  uniform int uHookN; uniform vec3 uHook[4];
  uniform int uSplit; uniform float uSplitY;
  uniform int uGlyphSet, uScrFlat, uShades;
  ${EYES_GLSL}
  in vec3 vPosW;

  const vec3 BMIN = vec3(${BMIN.join(', ')});
  const vec3 BMAX = vec3(${BMAX.join(', ')});
  const float K = 0.006; // crisp blend: add-ons read as separate parts through shading alone

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float smax(float a, float b, float k) { return -smin(-a, -b, k); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0)) - r; }
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
  float sdCyl(vec3 p, vec3 c, vec3 ax, float r, float h, float e) {
    vec3 q = p - c; float a = dot(q, ax); vec2 d = vec2(length(q - ax * a) - r + e, abs(a) - h + e);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e;
  }

  // A pointy-top hexagon (flat sides vertical), apothem r across x (Inigo Quilez's hexagon, axes swapped).
  float sdHex2(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p.yx);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
  }
  // A hexagonal prism along z (the hexagon faces the viewer), its y stretched by 1 / sy. Mirrored in JS.
  float sdHexPrism(vec3 p, float a, float h, float sy) {
    float d2 = sdHex2(vec2(p.x, p.y * sy), a) * min(1.0, 1.0 / sy);
    vec2 w = vec2(d2, abs(p.z) - h);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
  }
  // The hexagonal head: apothem headW, point to point 2 headH, rounded by the head's corner radius.
  float dHexHead(vec3 p) { float r = uHeadK.x; return sdHexPrism(p, uHeadB.x - r, uHeadB.z - r, 1.1547 * uHeadB.x / uHeadB.y) - r; }

  // The head family: a rounded box blended toward an ellipsoid, tapered toward the bottom,
  // its bottom optionally cut flat (k = corner radius, round, taper, flat). Mirrored in JS.
  float sdShape(vec3 q, vec3 b, vec4 k) {
    float t = clamp((q.y + b.y) / (2.0 * b.y), 0.0, 1.0);
    float s = 1.0 / mix(k.z, 1.0, t);
    vec3 r = vec3(q.x * s, q.y, q.z * s);
    float d = mix(sdRoundBox(r, b, k.x), sdEllipsoid(r, b), k.y) * min(1.0, 1.0 / s);
    if (k.w > 0.001) d = smax(d, -b.y * (1.0 - k.w) - q.y, 0.02);
    return d;
  }

  float dHead(vec3 p) {
    float d = sdShape(p, uHeadB, uHeadK);
    if (uHeadHex > 0.001) d = mix(d, dHexHead(p), uHeadHex);
    if (uChin == 1) d = smin(d, length(p - uChinC) - uChinR, 0.03);
    for (int i = 0; i < ${MAX_CROWN}; i++) { if (i >= uCrownN) break; d = smin(d, length(p - uCrownC[i]) - uCrownR, uCrownK); }
    return d;
  }
  // An elliptical ring hugging the head (scaled torus; under-stepped by the march).
  float dRim(vec3 p) { vec3 q = p - uRimC; float m = min(uRimR.x, uRimR.y); return length(vec2((length(q.xz / uRimR) - 1.0) * m, q.y)) - uRimT; }
  float dEar(vec3 p, int s) {
    if (uEars == 1) return sdCyl(p, uEarC[s], vec3(1.0, 0.0, 0.0), uEarR, uEarT, min(uEarT, uEarR) * 0.6);
    if (uEars == 3) return sdHexPrism(p - uEarC[s], uEarR - 0.004, uEarT - 0.004, 1.0) - 0.004; // hex pod
    vec3 q = p - uEarC[s]; // swept fin
    float c = cos(uEarSweep), sn = sin(uEarSweep);
    q.yz = mat2(c, -sn, sn, c) * q.yz;
    return sdRoundBox(q, vec3(uEarT, uEarR, uEarR * 0.6), min(uEarT, uEarR) * 0.9);
  }
  vec3 gogLocal(vec3 p, int i) { vec3 q = p - uGogC[i]; return vec3(dot(q, uGogX[i]), dot(q, uGogY[i]), dot(q, uGogZ[i])); }
  float dGog(vec3 p, int i) { return sdRoundBox(gogLocal(p, i), uGogB, uGogR); }
  // The goggles' bridge (two capsules over the front of the head) and strap (a ring hugging the head).
  float dBridge(vec3 p) { return min(sdCapsule(p, uBrA, uBrM, uBrR), sdCapsule(p, uBrM, uBrB, uBrR)); }
  // The strap: dRim's elliptical ring, in a plane tilted about x (normal uStN), so it runs from the
  // goggles down the back of the head. (dRim stays separate: D-final's pixels depend on it.)
  float dStrap(vec3 p) {
    vec3 q = p - uStC; vec2 uv = vec2(q.x, dot(q, vec3(0.0, -uStN.z, uStN.y)));
    float m = min(uStR.x, uStR.y);
    return length(vec2((length(uv / uStR) - 1.0) * m, dot(q, uStN))) - uStT;
  }
  float dCrest(vec3 p) { return sdEllipsoid(p - uCrestC, uCrestB); }
  float dStalk(vec3 p, int i) { return sdCapsule(p, uAntA[i], uAntB[i], uAntR); }
  float dTip(vec3 p, int i) { return length(p - (uHookN > 0 ? uHook[uHookN - 1] : uAntB[i])) - uAntTip; }
  float dHook(vec3 p, int i) { return sdCapsule(p, i == 0 ? uAntB[0] : uHook[i - 1], uHook[i], uAntR); }
  // Under the head: a leg (one capsule), a tentacle (down, then curling out) or a hem scallop (a sphere).
  float dSkirt(vec3 p, int i) {
    if (uSkirt == 3) return length(p - uSkA[i]) - uSkR;
    float d = sdCapsule(p, uSkA[i], uSkB[i], uSkR);
    if (uSkirt == 2) d = smin(d, sdCapsule(p, uSkB[i], uSkC[i], uSkR * 0.8), 0.006);
    return d;
  }
  float dSnout(vec3 p) { return sdRoundCone(p, uSnA, uSnB, uSnR.x, uSnR.y); }
  float dThr(vec3 p, int i) { return sdRoundCone(p, uThrA[i], uThrB[i], uThrR.x, uThrR.y); }

  float mapBody(vec3 p) {
    float d = dHead(p);
    if (uRim == 1) d = smin(d, dRim(p), K);
    for (int s = 0; s < 2; s++) {
      if (uEars > 0) d = smin(d, dEar(p, s), K);
      if (uTopper == 1) d = smin(d, dGog(p, s), K);
      if (s < uAntN) d = smin(smin(d, dStalk(p, s), K), dTip(p, s), K);
    }
    if (uTopper == 2) d = smin(d, dCrest(p), 0.01);
    if (uGogBr == 1) d = smin(d, dBridge(p), K);
    if (uGogSt == 1) d = smin(d, dStrap(p), K);
    for (int i = 0; i < 4; i++) { if (i >= uThrN) break; d = smin(d, dThr(p, i), K); }
    for (int i = 0; i < ${MAX_SKIRT}; i++) { if (i >= uSkirtN) break; d = smin(d, dSkirt(p, i), uSkirt == 3 ? uSkR * 0.7 : K); }
    if (uSnout == 1) d = smin(d, dSnout(p), 0.008);
    for (int i = 0; i < 4; i++) { if (i >= uHookN) break; d = smin(d, dHook(p, i), K); }
    return d;
  }
  // Smoke: free-floating particles. Round puffs are three blended spheres (a chunky cloud),
  // wisps are short capsules along their path, sputter dots single small spheres.
  float dPuff(vec3 p, int i) {
    vec3 c = uPuffC[i]; float r = uPuffR[i];
    if (uSmokeStyle == 1) return sdCapsule(p, c, c + uPuffV[i], r);
    if (uSmokeStyle == 2) return length(p - c) - r;
    float d = length(p - c) - r;
    d = smin(d, length(p - c - vec3(0.62, 0.3, 0.15) * r) - r * 0.72, r * 0.45);
    return smin(d, length(p - c - vec3(-0.58, 0.2, -0.25) * r) - r * 0.78, r * 0.45);
  }
  float mapSmoke(vec3 p, out float age) {
    float d = 1e9; age = 0.0;
    if (uSmokeOn == 0) return d;
    for (int i = 0; i < ${MAX_PUFFS}; i++) {
      if (i >= uPuffN) break;
      if (uPuffR[i] <= 0.0) continue;
      if (length(p - uPuffC[i]) - uPuffR[i] * 2.2 - length(uPuffV[i]) > d) continue;
      float e = dPuff(p, i);
      if (e < d) { d = e; age = uPuffA[i]; }
    }
    return d;
  }
  float mapAll(vec3 p) { float a; return min(mapBody(p), mapSmoke(p, a)); }

  vec3 calcNormal(vec3 p, bool smoke) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    if (smoke) {
      float a;
      return normalize(k.xyy * mapSmoke(p + k.xyy * e, a) + k.yyx * mapSmoke(p + k.yyx * e, a) + k.yxy * mapSmoke(p + k.yxy * e, a) + k.xxx * mapSmoke(p + k.xxx * e, a));
    }
    return normalize(k.xyy * mapBody(p + k.xyy * e) + k.yyx * mapBody(p + k.yyx * e) + k.yxy * mapBody(p + k.yxy * e) + k.xxx * mapBody(p + k.xxx * e));
  }
  // Self-shadowing and contact occlusion come from the body only (smoke stays bright and soft).
  float shadow(vec3 ro, vec3 rd) {
    float t = 0.02;
    for (int i = 0; i < 48; i++) {
      float h = mapBody(ro + rd * t);
      if (h < 0.002) return 0.0;
      t += max(h * 0.85, 0.008);
      if (t > 1.2) break;
    }
    return 1.0;
  }
  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.018 * float(i);
      o += (h - mapBody(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }

  // Face screen, in yaw/pitch about the head centre (normalised head space), so it wraps any
  // head shape; past 45 degrees of yaw it wraps round the sides like a visor band.
  // xy = screen coords (-1..1, y up), z = superellipse value (< 1 inside).
  // A flat screen (screenFlat) is planar instead: straight edges on a flat front face.
  vec3 screenQ(vec3 p) {
    vec3 n = p / uHeadB;
    vec2 q = vec2(atan(n.x, n.z) / atan(uScreen.x), (atan(n.y, length(n.xz)) - atan(uScreen.z)) / atan(uScreen.y));
    if (uScrFlat == 1) q = n.z > 0.2 ? vec2(n.x / n.z / uScreen.x, (n.y / n.z - uScreen.z) / uScreen.y) : vec2(9.0);
    return vec3(q, pow(abs(q.x), uScreen.w) + pow(abs(q.y), uScreen.w));
  }
  // Screen coords -> the V2 32 x 24 eye box, fitted inside the screen at its real aspect.
  float eyeUnit() { return min(2.0 * uEyePhys.x / 32.0, 2.0 * uEyePhys.y / 24.0); }
  vec2 boxP(vec2 q) { return vec2(16.0, 12.0) + vec2(q.x * uEyePhys.x, -q.y * uEyePhys.y) / eyeUnit(); }
  // Drone-only eyes (approved for drones, 2026-11-10; not in faces.js, so the crew set stays V2):
  // upright pills, and a prompt (a > chevron and an _ cursor). Same 32 x 24 box and blink as V2.
  bool droneEyeLit(vec2 uv) {
    const float W = 32.0, CX = 16.0, CY = 12.0, e = 16.0 * 1.12;
    vec2 P = uv * vec2(32.0, 24.0);
    P.y = CY + (P.y - CY) / max(uBlink, 0.05);
    float d;
    if (uEyes == ${DRONE_EYE.pills}) {
      d = 1e9;
      for (int k = -1; k <= 1; k += 2) d = min(d, sdRRect(P, vec2(CX + float(k) * W * 0.17, CY), vec2(e * 0.11, e * 0.25), e * 0.11));
    } else {
      float a = e * 0.2, s = e * 0.065;
      vec2 c0 = vec2(CX - W * 0.27, CY - a), c1 = vec2(CX - W * 0.1, CY), c2 = vec2(CX - W * 0.27, CY + a);
      d = min(sdSeg(P, c0, c1), sdSeg(P, c1, c2)) - s;
      d = min(d, sdSeg(P, vec2(CX + W * 0.04, CY + a), vec2(CX + W * 0.27, CY + a)) - s);
    }
    return d < 0.0;
  }
  bool eyesLit(vec2 P) {
    vec2 E = vec2(16.0, 12.0) + (P - vec2(16.0, 12.0) - vec2(uEyeXf.x, -uEyeXf.y)) / uEyeXf.z;
    if (uEyes >= ${DRONE_EYE.pills}) return droneEyeLit(E / vec2(32.0, 24.0));
    return eyeLit(E / vec2(32.0, 24.0)); // uBlink (set to uEyeXf.w) squashes them
  }
  // Sunglasses (screenShades): in eye-box px, two rounded-trapezoid lenses (wider at the top) round
  // the eyes, under one straight brow bar that runs across both and a little past them.
  bool shadesAt(vec2 P) {
    if (abs(P.x - 16.0) < 15.5 && P.y > 4.0 && P.y < 7.5) return true; // the brow bar
    for (int k = -1; k <= 1; k += 2) {
      float hw = mix(7.0, 5.0, clamp((P.y - 5.0) / 14.0, 0.0, 1.0)); // half-width: 7 at the top, 5 at the bottom
      vec2 q = vec2((P.x - 16.0 - float(k) * 7.5) * 7.0 / hw, P.y - 12.0);
      if (sdRRect(q, vec2(0.0), vec2(7.0, 7.0), 3.5) < 0.0) return true;
    }
    return false;
  }
  bool shadesGlint(vec2 P) { vec2 G = P - vec2(4.0, 7.5); return G.x >= 0.0 && G.x < 2.0 && G.y >= 0.0 && G.y < 2.0; } // on the left lens
  float hash1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
  float hash2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
  // Working face: the eyes go and the whole screen flashes with typed ASCII glyphs, a 5 x 7
  // pixel font (the ASCII FX vocabulary: bullseye, x, box, plus, dot, slashes, braces, semicolon,
  // angle brackets, hash, equals, star, 0 and 1). Glyph pixels are
  // squares in eye-box units, so the shape is resolution-independent and only the pixel pass
  // pixelates it. Each cell flips to a new hashed glyph a few times a second on its own phase
  // (typing); coverage fills cells in and clears them out in a hashed order (the scramble).
  const int GLYPH_N = 17;
  // Brand glyph sets: an asterisk spinner (* + .), diff marks (+ . = x), prompt characters (> ; { } 0 1).
  const int SET_STAR[4] = int[4](14, 14, 3, 4);
  const int SET_REVIEW[6] = int[6](3, 3, 4, 4, 13, 1);
  const int SET_PROMPT[6] = int[6](11, 9, 7, 8, 15, 16);
  const int GLYPHS[119] = int[119](0, 14, 17, 21, 17, 14, 0, 0, 17, 10, 4, 10, 17, 0, 0, 31, 17, 17, 17, 31, 0, 0, 4, 4, 31, 4, 4, 0, 0, 0, 0, 4, 0, 0, 0, 1, 2, 2, 4, 8, 8, 16, 16, 8, 8, 4, 2, 2, 1, 6, 4, 4, 8, 4, 4, 6, 12, 4, 4, 2, 4, 4, 12, 0, 4, 0, 0, 4, 4, 8, 2, 4, 8, 16, 8, 4, 2, 8, 4, 2, 1, 2, 4, 8, 10, 10, 31, 10, 31, 10, 10, 0, 0, 31, 0, 31, 0, 0, 0, 4, 21, 14, 21, 4, 0, 14, 17, 19, 21, 25, 17, 14, 4, 12, 4, 4, 4, 4, 14);
  bool glyphLit(vec2 q, out int tone) {
    tone = 3;
    if (uGlyph.x <= 0.0) return false;
    float u = eyeUnit(), gp = uGlyph.w;
    vec2 S = uEyePhys / u; // screen half-size in eye-box px
    vec2 cell = vec2(6.0, 8.0) * gp; // 5 x 7 glyph plus a 1 px gap
    vec2 n = max(floor(2.0 * S / cell), vec2(1.0));
    vec2 P = vec2(q.x * S.x, -q.y * S.y) + n * cell * 0.5; // from the grid's top-left
    vec2 ci = floor(P / cell);
    if (ci.x < 0.0 || ci.y < 0.0 || ci.x >= n.x || ci.y >= n.y) return false;
    vec2 cq = ((ci + 0.5) * cell - n * cell * 0.5) / S * 1.2; // keep cells well inside the screen
    if (pow(abs(cq.x), uScreen.w) + pow(abs(cq.y), uScreen.w) > 1.0) return false;
    float id = ci.x + ci.y * 17.0;
    // Review marks: a reading line scans down the screen; read rows keep their marks.
    float scan = mod(floor(uGlyph.y * 2.5), n.y + 2.0);
    if (uGlyphSet == 2 && ci.y > scan) return false;
    if (hash1(id + 3.1) >= uGlyph.x) return false;
    float flip = uGlyphSet == 2 ? floor(uGlyph.y * 2.5 / (n.y + 2.0)) : floor(uGlyph.y * uGlyph.z + hash1(id + 7.7) * 4.0);
    float h = hash2(vec2(id, flip));
    if (h > 0.86) return false; // now and then a blank: the cursor moving on
    int g = int(hash2(vec2(id + 0.5, flip + 0.25)) * float(GLYPH_N)) % GLYPH_N;
    if (uGlyphSet > 0) {
      float hg = hash2(vec2(id + 0.5, flip + 0.25));
      if (uGlyphSet == 1) g = SET_STAR[int(hg * 4.0) % 4];
      else if (uGlyphSet == 2) g = SET_REVIEW[int(hg * 6.0) % 6];
      else g = SET_PROMPT[int(hg * 6.0) % 6];
    }
    ivec2 b = ivec2(floor((P - ci * cell) / gp - 0.5));
    if (b.x < 0 || b.x > 4 || b.y < 0 || b.y > 6) return false;
    tone = h < 0.22 ? 1 : h < 0.6 ? 2 : 3;
    if (uGlyphSet == 2) tone = ci.y == scan ? 3 : 1;
    return ((GLYPHS[g * 7 + b.y] >> (4 - b.x)) & 1) == 1;
  }
  bool glint(vec2 q) {
    float u = eyeUnit();
    float o = mix(6.0, 3.0, clamp((uScreen.w - 2.0) / 4.0, 0.0, 1.0));
    vec2 G = vec2((q.x + 1.0) * uEyePhys.x, (1.0 - q.y) * uEyePhys.y) / u - o;
    return (G.y >= 0.0 && G.y < 1.0 && G.x >= 0.0 && G.x < 2.0) || (G.y >= 1.0 && G.y < 2.0 && G.x >= 0.0 && G.x < 1.0);
  }
  bool accentAt(vec3 p) {
    vec3 n = p / uHeadB;
    if (uAccent == 1) return abs(n.y - uAccentY) < uAccentW;
    if (uAccent == 2) return n.z > 0.55 && abs(n.x) < uAccentW * 1.6 && abs(n.y - uAccentY) < uAccentW;
    if (uAccent == 3) return abs(p.x) < uAccentW * uHeadB.x * 0.5 && n.y > -0.25;
    if (uAccent == 4) return n.y > uAccentY;
    return false;
  }

  // Colour region of a body point: 0 shell, 1 trim, 2 accent (accessories), 3 screen, 4 glow, 6 goggle lens, 8 shell (hem).
  int region(vec3 p, out vec2 sq) {
    sq = vec2(0.0);
    float best = dHead(p), d;
    int part = 0; // 0 head 1 trim 2 accent 4 glow 6 goggle 7 nozzle
    int gi = 0;
    if (uRim == 1) { d = dRim(p); if (d < best) { best = d; part = 1; } }
    for (int s = 0; s < 2; s++) {
      if (uEars > 0) { d = dEar(p, s); if (d < best) { best = d; part = 1; } }
      if (uTopper == 1) { d = dGog(p, s); if (d < best) { best = d; part = 6; gi = s; } }
      if (s < uAntN) {
        d = dStalk(p, s); if (d < best) { best = d; part = 1; }
        d = dTip(p, s); if (d < best) { best = d; part = 4; }
      }
    }
    if (uTopper == 2) { d = dCrest(p); if (d < best) { best = d; part = 2; } }
    if (uGogBr == 1) { d = dBridge(p); if (d < best) { best = d; part = 2; } }
    if (uGogSt == 1) { d = dStrap(p); if (d < best) { best = d; part = 2; } }
    for (int i = 0; i < 4; i++) { if (i >= uThrN) break; d = dThr(p, i); if (d < best) { best = d; part = 7; gi = i; } }
    // Legs and tentacles take the accent slot; hem scallops are the head's own shell.
    for (int i = 0; i < ${MAX_SKIRT}; i++) { if (i >= uSkirtN) break; d = dSkirt(p, i); if (d < best) { best = d; part = uSkirt == 3 ? 8 : 2; } }
    if (uSnout == 1) { d = dSnout(p); if (d < best) { best = d; part = 1; } }
    for (int i = 0; i < 4; i++) { if (i >= uHookN) break; d = dHook(p, i); if (d < best) { best = d; part = 1; } }
    if (part == 0) {
      vec3 s = screenQ(p);
      sq = s.xy;
      if (uShades == 1) return shadesAt(boxP(sq)) ? 3 : accentAt(p) ? 2 : 0; // no bezel: sunglasses have no frame colour
      if (s.z < 1.0) return 3;
      if (uBezel > 0.0 && s.z < pow(1.0 + uBezel, uScreen.w)) return 1;
      return accentAt(p) ? 2 : 0;
    }
    if (part == 6) {
      vec3 g = gogLocal(p, gi);
      if (g.z > 0.0 && sdRoundBox(vec3(g.xy, 0.0), vec3(uGogB.xy - uGogF, 1.0), max(uGogR - uGogF, 0.004)) < 0.0) { sq = g.xy / uGogB.xy; return 6; }
      return 2; // the frame: goggles are an accessory, in the accent colour
    }
    if (part == 7) { // nozzle: the centre of the mouth glows
      vec3 ax = normalize(uThrB[gi] - uThrA[gi]);
      return dot(p - uThrB[gi], ax) > 0.45 * uThrR.y ? 4 : 1;
    }
    return part;
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    bool hit = false;
    for (int i = 0; i < 180; i++) {
      float h = mapAll(ro + rd * t);
      if (h < 0.0010 * (1.0 + t)) { hit = true; break; }
      t += h * 0.85;
      if (t > tf) break;
    }
    vec3 c;
    bool have = false;
    if (hit) {
      vec3 p = ro + rd * t;
      float age;
      bool smoke = mapSmoke(p, age) < mapBody(p);
      vec3 n = calcNormal(p, smoke);
      vec3 L = normalize(uLightLocal);
      if (smoke) {
        float lit = dot(n, L);
        int b = lit > 0.35 ? 2 : lit > -0.3 ? 1 : 0;
        if (age > 0.62) b = max(b - 1, 0); // fading puffs step darker as they shrink
        c = uSmoke[b];
      } else {
        vec2 sq;
        int r = region(p, sq);
        if (r == 4) c = dot(n, -rd) > 0.6 ? uGlow[3] : uGlow[2];
        else {
          float lit = dot(n, L);
          if (shadow(p + n * 0.006, L) < 0.5) lit = min(lit, 0.1) - 0.3;
          lit -= (1.0 - occlusion(p, n)) * 0.6;
          int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
          if (r == 3 || r == 6) {
            vec3 refl = reflect(rd, n);
            c = (refl.y > 0.18 && b >= 2) ? uScr[1] : uScr[0];
            if (r == 3) {
              if (uSplit == 1) c = sq.y < uSplitY ? uScr[1] : uScr[0];
              int tone;
              if (glyphLit(sq, tone)) c = uFaceDebug == 1 ? vec3(0.0, 1.0, 0.0) : uGlow[tone];
              else if (uEyesOn == 1 && eyesLit(boxP(sq))) c = uFaceDebug == 1 ? vec3(1.0, 0.0, 0.0) : uGlow[3];
              if (uShades == 1 ? shadesGlint(boxP(sq)) : glint(sq)) c = uScr[2];
            } else if (sq.x < -0.35 && sq.y > 0.2 && sq.y < 0.62 && sq.x > -0.7) c = uScr[2];
          } else if (r == 2) c = uAcc[b];
          else if (r == 1) c = uTrim[b];
          else c = uShell[b];
        }
      }
      have = true;
    }
    // Sparkles: crisp 1-pixel dots and + crosses, drawn at their projected pixel (so they never
    // blur), hidden behind anything nearer.
    if (uSparkN > 0) {
      mat3 toLocal = mat3(uInvModel);
      vec3 R = normalize(toLocal * vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
      vec3 Up = normalize(toLocal * vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
      vec3 F = cross(Up, R);
      for (int i = 0; i < ${MAX_SPARKS}; i++) {
        if (i >= uSparkN) break;
        if (uSparkS[i] < 0.5) continue;
        vec3 v = uSparkC[i] - ro;
        float along = dot(v, rd), depth = dot(v, F);
        if (along <= 0.0 || (hit && t < along)) continue;
        vec3 off = ro + rd * (depth / dot(rd, F)) - uSparkC[i]; // the ray's offset at the sparkle's depth
        float pix = depth * uPixK; // world size of one pixel at that depth
        float dx = abs(dot(off, R)) / pix, dy = abs(dot(off, Up)) / pix;
        bool on = uSparkS[i] < 1.5 ? (dx < 0.5 && dy < 0.5) : ((dx < 0.5 && dy < 1.5) || (dy < 0.5 && dx < 1.5));
        if (on) { c = uSmoke[2]; have = true; }
      }
    }
    if (!have) discard;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const PROXY_GEO = new THREE.BoxGeometry(BMAX[0] - BMIN[0], BMAX[1] - BMIN[1], BMAX[2] - BMIN[2])
  .translate((BMAX[0] + BMIN[0]) / 2, (BMAX[1] + BMIN[1]) / 2, (BMAX[2] + BMIN[2]) / 2);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const colors = (hexes) => hexes.map((h) => new THREE.Color(h));
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- JS port of the head field
// Used to attach every add-on to the head's real surface whatever its shape, so the drone
// stays one connected piece.
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
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
/** The head family's distance field (sdShape in the shader), centred at the origin. k = [corner, round, taper, flat]. */
export function shapeField(b, k) {
  return (p) => {
    const t = clamp01((p.y + b.y) / (2 * b.y));
    const s = 1 / mix(k[2], 1, t);
    let d = mix(roundBox(p.x * s, p.y, p.z * s, b, k[0]), ellipsoid(p.x * s, p.y, p.z * s, b), k[1]) * Math.min(1, 1 / s);
    if (k[3] > 0.001) d = smax(d, -b.y * (1 - k[3]) - p.y, 0.02);
    return d;
  };
}
/** The front-facing hexagonal prism head (dHexHead in the shader): apothem b.x, point to point 2 b.y, corner radius r. */
export function hexField(b, r) {
  const a = b.x - r, h = b.z - r, sy = (1.1547 * b.x) / b.y;
  const K = [-0.866025404, 0.5, 0.577350269];
  return (p) => {
    // sdHex2 on (x, y * sy) with the axes swapped (point up)
    let px = Math.abs(p.y * sy), py = Math.abs(p.x);
    const m = 2 * Math.min(K[0] * px + K[1] * py, 0);
    px -= m * K[0]; py -= m * K[1];
    px -= Math.min(Math.max(px, -K[2] * a), K[2] * a); py -= a;
    const d2 = Math.hypot(px, py) * Math.sign(py) * Math.min(1, 1 / sy);
    const wz = Math.abs(p.z) - h;
    return Math.min(Math.max(d2, wz), 0) + Math.hypot(Math.max(d2, 0), Math.max(wz, 0)) - r;
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
const surfacePoint = (field, dir) => dir.clone().normalize().multiplyScalar(exitAlong(field, V(), dir.clone().normalize()));
const gradient = (field, p) => {
  const e = 1e-4;
  return V(
    field(V(p.x + e, p.y, p.z)) - field(V(p.x - e, p.y, p.z)),
    field(V(p.x, p.y + e, p.z)) - field(V(p.x, p.y - e, p.z)),
    field(V(p.x, p.y, p.z + e)) - field(V(p.x, p.y, p.z - e)),
  ).normalize();
};

// Thruster layouts: [root direction from the head centre, exhaust axis] per nozzle; s = spread.
const LAYOUTS = [
  (s) => [-1, 1].map((k) => [V(k * s, -1, -0.12), V(k * 0.18, -1, -0.3)]), // twin under-pods
  () => [[V(0, -1, -0.08), V(0, -1, -0.25)]], // single under-jet
  (s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [V(x * s, -1, z * s), V(x * 0.4, -1, z * 0.4)]), // quad corner nozzles
  () => [[V(0, -0.35, -1), V(0, -0.35, -1)]], // single rear jet
  (s) => [-1, 1].map((k) => [V(k * s * 0.9, -0.3, -1), V(k * 0.12, -0.35, -1)]), // twin rear jets
];

/** The rest layout of a parameter set: every part's size and place, in drone units. */
export function layout(P) {
  const head = { b: V(P.headW, P.headH, P.headD), k: [P.headCorner * Math.min(P.headW, P.headH, P.headD), P.headRound, P.headTaper, P.headFlat] };
  const shapeF = shapeField(head.b, head.k);
  const hexF = P.headHex > 0.001 ? hexField(head.b, head.k[0]) : null;
  const headF = hexF ? (p) => mix(shapeF(p), hexF(p), P.headHex) : shapeF;
  const headBottom = -exitAlong(headF, V(), V(0, -1, 0));
  const chin = { on: P.chin === 1, c: V(0, headBottom - 0.15 * P.chinR, -0.1 * P.headD), r: P.chinR };
  const core = chin.on ? (p) => smin(headF(p), p.clone().sub(chin.c).length() - chin.r, 0.03) : headF;
  const top = exitAlong(headF, V(), V(0, 1, 0));
  const bottom = -exitAlong(core, V(), V(0, -1, 0), 1);

  const rimY = P.rimY * P.headH;
  const rim = { c: V(0, rimY, 0), r: [exitAlong(headF, V(0, rimY, 0), V(1, 0, 0)) + 0.35 * P.rimT, exitAlong(headF, V(0, rimY, 0), V(0, 0, 1)) + 0.35 * P.rimT] };

  const earY = P.earY * P.headH;
  const earX = exitAlong(headF, V(0, earY, 0), V(1, 0, 0)) + (P.ears === 3 ? 0.25 * P.earR : (P.ears === 1 ? 0.15 : 0.3) * P.earT);
  const ears = [V(-earX, earY, 0), V(earX, earY, 0)];

  const gog = [-1, 1].map((s) => {
    const at = surfacePoint(headF, V(s * P.gogX * P.headW, P.gogY * P.headH, 0.62 * P.headD));
    const z = gradient(headF, at);
    const x = V(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x).normalize();
    return { c: at.addScaledVector(z, 0.003), x, y, z };
  });
  // Connected goggles: a bridge from lens to lens over the front of the head, and a strap round
  // the head at the lenses' height, both as thick as the frames.
  let bridge = null, strap = null;
  if (P.topper === 1 && P.gogBridge === 1) {
    const r = 0.5 * P.gogFrame;
    const [a, b] = gog.map((g, i) => g.c.clone().addScaledVector(g.x, (i === 0 ? 1 : -1) * (P.gogW - 0.5 * P.gogFrame)));
    // Straight across, bowed forward only where the head bulges out in front of it.
    const m = a.clone().add(b).multiplyScalar(0.5);
    if (headF(V(0, m.y, 0)) < 0) m.z = Math.max(m.z, exitAlong(headF, V(0, m.y, 0), V(0, 0, 1)) + 0.003 + r);
    bridge = { a, m, b, r };
  }
  if (P.topper === 1 && P.gogStrap === 1) {
    // A ring hugging the head in a plane tilted about x: through the front at the lenses' height,
    // and through the back at gogStrapY. The section of the near-ellipsoid head is near-elliptical.
    const t = 0.5 * P.gogFrame, yf = (gog[0].c.y + gog[1].c.y) / 2, yb = P.gogStrapY * P.headH;
    const F = V(0, yf, exitAlong(headF, V(0, yf, 0), V(0, 0, 1))), B = V(0, yb, -exitAlong(headF, V(0, yb, 0), V(0, 0, -1)));
    const c = F.clone().add(B).multiplyScalar(0.5), along = F.clone().sub(B);
    const n = V(0, along.z, -along.y).normalize(); // in the yz plane, perpendicular to the strap's front-back line
    strap = { c, n, r: [exitAlong(headF, c, V(1, 0, 0)) + 0.35 * t, along.length() / 2 + 0.35 * t], t };
  }
  const crest = { c: V(0, top - 0.012, -0.12 * P.headD), b: V(0.014, P.crestH, 0.6 * P.headD) };

  const ant = [];
  const nAnt = P.antenna === 3 ? 1 : P.antenna;
  for (let i = 0; i < nAnt; i++) {
    const s = P.antenna === 2 ? (i === 0 ? -1 : 1) : 0;
    const base = surfacePoint(headF, V(s * 0.45 * P.headW, P.headH, -0.12 * P.headD)).multiplyScalar(0.97);
    const lean = P.antenna === 2 ? V(s * Math.sin(P.antTilt), Math.cos(P.antTilt), -0.15) : V(0, Math.cos(P.antTilt), -Math.sin(P.antTilt));
    ant.push({ base, dir: lean.normalize() });
  }
  // The question hook: the stalk, then a curl over to its right and back down (a "?", seen from the front).
  const hook = [];
  if (P.antenna === 3) {
    const a = ant[0], top = a.base.clone().addScaledVector(a.dir, P.antL), L = P.antL;
    for (const [x, y] of [[0.35, 0.25], [0.4, 0.62], [0.08, 0.86], [-0.2, 0.7]]) hook.push(top.clone().add(V(x * L, y * L, 0.1 * L)));
  }

  // Brand parts. Crown puffs sit on the head's outline in an arc over the top (a cloud head).
  const crown = [];
  if (P.crown === 1) {
    for (let i = 0; i < P.crownN; i++) {
      const th = P.crownN === 1 ? 0 : -P.crownArc + (2 * P.crownArc * i) / (P.crownN - 1);
      const from = V(0, 0, P.crownZ * P.headD), dir = V(Math.sin(th) * P.headW, Math.cos(th) * P.headH, 0).normalize();
      crown.push(from.addScaledVector(dir, exitAlong(headF, from, dir) + P.crownOut * P.crownR));
    }
  }

  const thr = LAYOUTS[P.thrusters](P.thrSpread).map(([root, axis]) => {
    const ax = axis.clone().normalize();
    const dir = V(root.x * P.headW, root.y * P.headH, root.z * P.headD).normalize();
    const at = dir.clone().multiplyScalar(exitAlong(core, V(), dir, 1));
    return { a: at.clone().addScaledVector(ax, -0.5 * P.thrL), b: at.clone().addScaledVector(ax, P.thrL), axis: ax };
  });
  const nozzleBottom = Math.min(...thr.map((n) => n.b.y - P.thrR * P.thrFlare));

  // Under the head: legs in two pairs (a centre gap for the jet), a ring of tentacles that
  // curl outward, or a ring of hem scallops round the bottom rim. a -> b (-> c) per part.
  const skirt = [];
  const down = V(0, -1, 0);
  if (P.skirt === 1) {
    const side = Math.max(1, Math.floor(P.skirtN / 2));
    const xs = [];
    for (let j = 0; j < side; j++) xs.push(side === 1 ? 1 : 0.4 + (0.6 * j) / (side - 1));
    const all = [...xs.map((x) => -x), ...xs].concat(P.skirtN % 2 ? [0] : []);
    for (const x of all) {
      const from = V(x * P.skirtSpread * P.headW, 0, P.skirtZ * P.headD);
      const a = from.clone().addScaledVector(down, exitAlong(core, from, down, 1) - 0.4 * P.skirtR);
      skirt.push({ a, b: a.clone().addScaledVector(down, P.skirtL), c: null });
    }
  } else if (P.skirt === 2) {
    for (let i = 0; i < P.skirtN; i++) {
      const ph = ((i + 0.5) / P.skirtN) * TAU;
      const out = V(Math.sin(ph), 0, Math.cos(ph));
      // On the rim just above the bottom, pulled in to skirtSpread of its radius.
      const y = bottom + 0.6 * P.skirtR, rimAt = V(0, y, 0);
      const a = out.clone().multiplyScalar(exitAlong(core, rimAt, out, 1) * P.skirtSpread).setY(y);
      const b = a.clone().addScaledVector(down, P.skirtL);
      const c = b.clone().addScaledVector(out, P.skirtCurl * P.skirtL * 0.75).add(V(0, P.skirtCurl * P.skirtL * 0.18, 0));
      skirt.push({ a, b, c, out });
    }
  } else if (P.skirt === 3) {
    const y = Math.max(bottom, -P.headH) + 0.25 * P.skirtR;
    const rx = exitAlong(headF, V(0, y, 0), V(1, 0, 0)), rz = exitAlong(headF, V(0, y, 0), V(0, 0, 1));
    for (let i = 0; i < P.skirtN; i++) {
      const ph = (i / P.skirtN) * TAU;
      const out = V(Math.sin(ph), 0, Math.cos(ph));
      skirt.push({ a: V(out.x * rx * P.skirtSpread, y - 0.2 * P.skirtR, out.z * rz * P.skirtSpread), b: null, c: null, out });
    }
  }
  const skirtBottom = Math.min(...skirt.map((k) => Math.min(k.a.y, k.b?.y ?? 1, k.c?.y ?? 1) - P.skirtR), 1);

  // The snout: a tapered cone out of the lower face, drooping forward.
  let snout = null;
  if (P.snout === 1) {
    const root = surfacePoint(headF, V(0, P.snoutY * P.headH, P.headD));
    const dir = V(0, -P.snoutDrop, 1).normalize();
    const a = root.clone().addScaledVector(dir, -0.3 * P.snoutR);
    snout = { a, b: a.clone().addScaledVector(dir, P.snoutL), r: [P.snoutR, 0.5 * P.snoutR] };
  }

  return { P, head, headF, core, chin, top, bottom: Math.min(bottom, nozzleBottom, skirtBottom, snout ? snout.b.y - snout.r[1] : 1), rim, ears, gog, bridge, strap, crest, ant, hook, crown, skirt, snout, thr };
}

// ---------------------------------------------------------------- motion
const hash = (...n) => { const x = Math.sin(n.reduce((a, v, i) => a + v * [12.9898, 78.233, 37.719, 4.581][i % 4], 0) + 4.1414) * 43758.5453; return x - Math.floor(x); };
const pmod = (a, m) => ((a % m) + m) % m;

/**
 * The look-around and work schedule over the 12 s motion loop. glance: -1 (its left) .. 1;
 * work: 0..1, the working face (eyes up and narrowed, code streaming); blink: 1 open .. 0.12.
 */
export function behaviour(t, motion) {
  const blinkAt = (k, at) => { const d = k - at; return d > 0 && d < 0.18 ? 1 - Math.sin((d / 0.18) * Math.PI) * 0.88 : 1; };
  if (!motion) {
    const k = pmod(t, LOOP);
    return { glance: 0, work: 0, workT: 0, blink: blinkAt(k, 1.2) };
  }
  const k = pmod(t, MOTION_LOOP);
  const ss = (a, b) => smoothstep(a, b, k);
  const glance = -ss(1.6, 2.0) + 2 * ss(3.0, 3.35) - ss(4.4, 4.8) + 0.6 * ss(10.9, 11.2) - 0.6 * ss(11.6, 11.95);
  const work = ss(5.6, 6.0) * (1 - ss(10.2, 10.6));
  return { glance, work, workT: Math.max(0, k - 5.8), blink: Math.min(blinkAt(k, 1.0), blinkAt(k, 5.2), blinkAt(k, 10.7)) };
}

/**
 * The face from the behaviour: eyes, or the working glyphs, never both. Going to work the eyes
 * blink shut and the glyphs fill in cell by cell; leaving, the glyphs clear in a scramble and
 * the eyes blink open again. glyphs: share of glyph cells shown; eyeOpen caps the blink.
 */
export function faceAt(beh) {
  const T = 0.35; // the share of the work ramp spent on the blink
  const glyphs = clamp01((beh.work - T) / (1 - T));
  return { glyphs, eyes: glyphs <= 0, eyeOpen: beh.work > 0 ? clamp01(1 - beh.work / T) : 1 };
}

const W12 = TAU / MOTION_LOOP;
/** The body's place and attitude at time t, in the root frame: drift, bob, banking and head turn. */
export function bodyAt(P, t, motion) {
  const D = motion ? P.drift : 0;
  const x = D * Math.sin(W12 * t * CYCLES.drift), z = 0.45 * D * Math.sin(2 * W12 * t * CYCLES.drift);
  const vx = Math.cos(W12 * t), vz = Math.cos(2 * W12 * t); // velocity, normalised to its peak
  const ax = Math.sin(W12 * t), az = Math.sin(2 * W12 * t); // acceleration, normalised
  const bob = P.bobAmp * Math.sin(W12 * t * CYCLES.bob);
  const sway = Math.sin(W12 * t * CYCLES.sway);
  const roll = (motion ? -P.bank * vx : 0) + 0.05 * sway;
  let pitch = (motion ? 0.6 * P.bank * vz : 0) + 0.04 * Math.sin(W12 * t * CYCLES.sway + 1.3);
  const beh = behaviour(t, motion);
  if (P.workNod) pitch += P.workNod * beh.work; // a reviewer dips its head to read
  const yaw = P.lookYaw * beh.glance;
  const m = new THREE.Matrix4().compose(V(x, bob, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), V(P.size, P.size, P.size));
  // Thrust effort: more when it accelerates or banks hard, and on each bob's upstroke.
  const effort = (motion && D > 0 ? 0.55 * Math.hypot(ax, 0.6 * az) + 0.3 * Math.abs(vx) * (P.bank / 0.3) : 0) + 0.5 * Math.max(0, Math.cos(W12 * t * CYCLES.bob));
  return { m, effort };
}

const PUFF_BASE = [0.028, 0.012, 0.013]; // particle radius by smoke style
const SLOTS = { 1: 16, 2: 12, 4: 8 };

/** Smoke particles and sparkles at time t, in the drone's body frame. Pure and loop-locked. */
export function smokeAt(Lay, t, motion) {
  const { P } = Lay;
  const loop = motion ? MOTION_LOOP : LOOP;
  const cyclesPerLoop = loop / PUFF_PERIOD;
  const nThr = Lay.thr.length;
  const S = Math.min(SLOTS[nThr], Math.floor(MAX_PUFFS / nThr));
  const now = bodyAt(P, t, motion).m.clone().invert();
  const puffs = [];
  Lay.thr.forEach((n, j) => {
    for (let k = 0; k < S; k++) {
      const phase = ((k + 0.7 * hash(j, k, 1)) / S) * PUFF_PERIOD;
      const cycle = Math.floor((t - phase) / PUFF_PERIOD);
      const born = phase + cycle * PUFF_PERIOD;
      const age = t - born;
      const cm = pmod(cycle, cyclesPerLoop);
      const life = PUFF_PERIOD * (0.5 + 0.42 * hash(j, k, cm, 2));
      const at = bodyAt(P, born, motion);
      const busy = clamp01(P.puffRate * (0.35 + 0.75 * at.effort));
      if (age >= life || hash(j, k, cm, 3) > busy) { puffs.push(null); continue; }
      const u = age / life;
      // Born at the nozzle mouth (where the nozzle was at birth), blown out along its axis,
      // slowing, then rising and drifting on a little hashed breeze; it stays put in the world
      // while the drone flies on, so trails follow the motion.
      const mouth = n.b.clone().applyMatrix4(at.m);
      const axis = n.axis.clone().transformDirection(at.m);
      const v0 = 0.3 * (0.7 + 0.6 * hash(j, k, cm, 4));
      const tau = 0.22;
      const out = v0 * tau * (1 - Math.exp(-age / tau));
      const pos = mouth.addScaledVector(axis, out + 0.6 * P.thrR)
        .add(V((hash(j, k, cm, 5) - 0.5) * 0.08 * age, 0.05 * age * age - 0.01 * age, (hash(j, k, cm, 6) - 0.5) * 0.08 * age));
      const grow = smoothstep(0, 0.12, u) * (1 - smoothstep(0.6, 1, u));
      const r = PUFF_BASE[P.smoke] * P.puffSize * (0.75 + 0.5 * hash(j, k, cm, 7)) * (0.7 + 0.7 * u) * grow;
      const trailLen = (0.022 + 0.025 * (1 - u)) * P.puffSize; // wisps: a short streak back toward the nozzle
      puffs.push({ c: pos.applyMatrix4(now), v: axis.clone().negate().transformDirection(now).multiplyScalar(trailLen), r, u, key: j * 100 + k });
    }
  });
  // Sparkles: their own little bursts out of the nozzles, each a dot, then a + cross, then a
  // dot, then gone (crisp pixels in the shader, never blurred).
  const live = puffs.filter(Boolean);
  const sparks = [];
  for (let i = 0; i < P.sparkles; i++) {
    const phase = ((i + 0.6 * hash(i, 11)) / Math.max(1, P.sparkles)) * PUFF_PERIOD;
    const cycle = Math.floor((t - phase) / PUFF_PERIOD);
    const born = phase + cycle * PUFF_PERIOD;
    const cm = pmod(cycle, cyclesPerLoop);
    const age = t - born, life = 0.75;
    if (age >= life || hash(i, cm, 12) > 0.85) { sparks.push({ c: V(), s: 0 }); continue; }
    const n = Lay.thr[Math.floor(hash(i, cm, 13) * nThr) % nThr];
    const at = bodyAt(P, born, motion).m;
    const axis = n.axis.clone().transformDirection(at);
    const side = V(hash(i, cm, 14) - 0.5, 0.3 + 0.4 * hash(i, cm, 15), hash(i, cm, 16) - 0.5).multiplyScalar(0.16);
    const pos = n.b.clone().applyMatrix4(at).addScaledVector(axis, 0.03 + 0.12 * Math.sqrt(age)).addScaledVector(side, age);
    const u = age / life;
    sparks.push({ c: pos.applyMatrix4(now), s: u < 0.2 || u > 0.7 ? 1 : 2 });
  }
  return { puffs: live, sparks };
}

/**
 * Skirt parts at time t: hem scallops bob and tentacle tips sway in a wave round the ring,
 * locked to the bob (whole cycles per loop). Pure; returns [{ a, b, c }] in the body frame.
 */
export function skirtAt(Lay, t) {
  const { P } = Lay, w = P.skirtWave;
  return Lay.skirt.map((k, i) => {
    const ph = W12 * t * CYCLES.bob + (i / Math.max(1, Lay.skirt.length)) * TAU;
    const s = w * Math.sin(ph);
    const a = k.a.clone();
    if (P.skirt === 3) a.y += s;
    return { a, b: k.b?.clone() ?? null, c: k.c ? k.c.clone().addScaledVector(k.out, s).add(V(0, w * Math.cos(ph), 0)) : null };
  });
}

/** Pieces the silhouette is meant to have with smoke and sparkles off: always 1. */
export const intendedPieces = () => 1;

/** Top and bottom of the drone at rest (world units from the head centre, excluding smoke), for framing and size. */
export function extents(Lay) {
  const { P } = Lay;
  let top = Lay.top;
  for (const a of Lay.ant) top = Math.max(top, a.base.y + a.dir.y * P.antL + P.antTip);
  for (const h of Lay.hook) top = Math.max(top, h.y + P.antTip);
  for (const c of Lay.crown) top = Math.max(top, c.y + P.crownR + 0.25 * P.crownK); // a smooth union bulges by up to k / 4
  if (P.topper === 2) top = Math.max(top, Lay.crest.c.y + Lay.crest.b.y);
  if (P.topper === 1) for (const g of Lay.gog) top = Math.max(top, g.c.y + P.gogH * Math.abs(g.y.y) + P.gogT * Math.abs(g.z.y));
  // Half-width at rest (for the brand size-class check): head, rim, ears, crown puffs, skirt.
  let half = P.headW * Math.max(1, P.headTaper);
  if (P.rim) half = Math.max(half, Lay.rim.r[0] + P.rimT);
  if (P.ears) half = Math.max(half, Lay.ears[1].x + (P.ears === 3 ? P.earR : P.earT));
  for (const c of Lay.crown) half = Math.max(half, Math.abs(c.x) + P.crownR + 0.25 * P.crownK);
  if (P.topper === 1) for (const g of Lay.gog) half = Math.max(half, Math.abs(g.c.x) + P.gogW * Math.abs(g.x.x) + P.gogT * Math.abs(g.z.x));
  for (const k of Lay.skirt) half = Math.max(half, Math.abs(k.a.x) + P.skirtR, k.c ? Math.abs(k.c.x) + P.skirtR : 0);
  return { top: top * P.size, bottom: Lay.bottom * P.size, half: half * P.size };
}

/** A parameterised drone. setParams() takes any subset of params.js keys; setPalette() a palette.js entry. */
export function makeDrone({ palette = PALETTES.base } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const vecs = (n) => Array.from({ length: n }, () => V());
  const U = {
    uInvModel: { value: new THREE.Matrix4() }, uLightLocal: { value: V() }, uPixK: { value: 0.0035 },
    uShell: { value: colors(palette.shell) }, uTrim: { value: colors(palette.trim) }, uAcc: { value: colors(palette.accent) },
    uGlow: { value: colors(palette.glow) }, uScr: { value: colors(palette.screen) }, uSmoke: { value: colors(palette.smoke) },
    uHeadB: { value: V() }, uHeadK: { value: new THREE.Vector4() },
    uChin: { value: 0 }, uChinC: { value: V() }, uChinR: { value: 0 },
    uRim: { value: 0 }, uRimC: { value: V() }, uRimR: { value: new THREE.Vector2(1, 1) }, uRimT: { value: 0 },
    uScreen: { value: new THREE.Vector4() }, uBezel: { value: 0 }, uEyePhys: { value: new THREE.Vector2() },
    uEyeXf: { value: new THREE.Vector4(0, 0, 1, 1) }, uGlyph: { value: new THREE.Vector4() }, uEyesOn: { value: 1 }, uFaceDebug: { value: 0 },
    uEars: { value: 0 }, uEarC: { value: vecs(2) }, uEarR: { value: 0 }, uEarT: { value: 0 }, uEarSweep: { value: 0 },
    uTopper: { value: 0 }, uGogC: { value: vecs(2) }, uGogX: { value: vecs(2) }, uGogY: { value: vecs(2) }, uGogZ: { value: vecs(2) }, uGogB: { value: V() }, uGogR: { value: 0 }, uGogF: { value: 0 },
    uGogBr: { value: 0 }, uBrA: { value: V() }, uBrM: { value: V() }, uBrB: { value: V() }, uBrR: { value: 0 }, uGogSt: { value: 0 }, uStC: { value: V() }, uStN: { value: V(0, 1, 0) }, uStR: { value: new THREE.Vector2(1, 1) }, uStT: { value: 0 },
    uCrestC: { value: V() }, uCrestB: { value: V(1, 1, 1) },
    uAntN: { value: 0 }, uAntA: { value: vecs(2) }, uAntB: { value: vecs(2) }, uAntR: { value: 0.0105 }, uAntTip: { value: 0 },
    uThrN: { value: 0 }, uThrA: { value: vecs(4) }, uThrB: { value: vecs(4).map((v) => v.set(0, -1, 0)) }, uThrR: { value: new THREE.Vector2() },
    uAccent: { value: 0 }, uAccentY: { value: 0 }, uAccentW: { value: 0 },
    uSmokeOn: { value: 1 }, uSmokeStyle: { value: 0 }, uPuffN: { value: 0 }, uPuffC: { value: vecs(MAX_PUFFS) }, uPuffV: { value: vecs(MAX_PUFFS) },
    uPuffR: { value: new Array(MAX_PUFFS).fill(0) }, uPuffA: { value: new Array(MAX_PUFFS).fill(0) },
    uSparkN: { value: 0 }, uSparkC: { value: vecs(MAX_SPARKS) }, uSparkS: { value: new Array(MAX_SPARKS).fill(0) },
    uEyes: { value: 0 }, uBlink: { value: 1 },
    uHeadHex: { value: 0 }, uCrownN: { value: 0 }, uCrownC: { value: vecs(MAX_CROWN) }, uCrownR: { value: 0 }, uCrownK: { value: 0 },
    uSkirt: { value: 0 }, uSkirtN: { value: 0 }, uSkA: { value: vecs(MAX_SKIRT) }, uSkB: { value: vecs(MAX_SKIRT) }, uSkC: { value: vecs(MAX_SKIRT) }, uSkR: { value: 0 },
    uSnout: { value: 0 }, uSnA: { value: V() }, uSnB: { value: V(0, 0, 1) }, uSnR: { value: new THREE.Vector2() },
    uHookN: { value: 0 }, uHook: { value: vecs(4) }, uSplit: { value: 0 }, uSplitY: { value: 0 }, uGlyphSet: { value: 0 }, uScrFlat: { value: 0 }, uShades: { value: 0 },
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
    U.uChin.value = P.chin; U.uChinC.value.copy(Lay.chin.c); U.uChinR.value = P.chinR;
    U.uRim.value = P.rim; U.uRimC.value.copy(Lay.rim.c); U.uRimR.value.set(...Lay.rim.r); U.uRimT.value = P.rimT;
    U.uScreen.value.set(P.screenW, P.screenH, P.screenY, P.screenRound); U.uBezel.value = P.bezel;
    // The screen's real half-size, so the eye box keeps its aspect on any screen.
    U.uEyePhys.value.set(Math.min(P.headW * mix(P.screenW, Math.sin(Math.atan(P.screenW)), P.headRound), P.headW * 0.95), P.headH * mix(P.screenH, Math.sin(Math.atan(P.screenH)), P.headRound));
    U.uEyes.value = P.eyes;
    U.uEars.value = P.ears; Lay.ears.forEach((e, i) => U.uEarC.value[i].copy(e)); U.uEarR.value = P.earR; U.uEarT.value = P.earT; U.uEarSweep.value = P.earSweep;
    U.uTopper.value = P.topper;
    Lay.gog.forEach((g, i) => { U.uGogC.value[i].copy(g.c); U.uGogX.value[i].copy(g.x); U.uGogY.value[i].copy(g.y); U.uGogZ.value[i].copy(g.z); });
    U.uGogB.value.set(P.gogW, P.gogH, P.gogT); U.uGogR.value = 0.6 * Math.min(P.gogW, P.gogH); U.uGogF.value = P.gogFrame;
    U.uGogBr.value = Lay.bridge ? 1 : 0;
    if (Lay.bridge) { U.uBrA.value.copy(Lay.bridge.a); U.uBrM.value.copy(Lay.bridge.m); U.uBrB.value.copy(Lay.bridge.b); U.uBrR.value = Lay.bridge.r; }
    U.uGogSt.value = Lay.strap ? 1 : 0;
    if (Lay.strap) { U.uStC.value.copy(Lay.strap.c); U.uStN.value.copy(Lay.strap.n); U.uStR.value.set(...Lay.strap.r); U.uStT.value = Lay.strap.t; }
    U.uCrestC.value.copy(Lay.crest.c); U.uCrestB.value.copy(Lay.crest.b);
    U.uAntN.value = Lay.ant.length; U.uAntTip.value = P.antTip;
    Lay.ant.forEach((a, i) => { U.uAntA.value[i].copy(a.base); U.uAntB.value[i].copy(a.base).addScaledVector(a.dir, P.antL); });
    U.uThrN.value = Lay.thr.length; Lay.thr.forEach((n, i) => { U.uThrA.value[i].copy(n.a); U.uThrB.value[i].copy(n.b); });
    U.uThrR.value.set(P.thrR, P.thrR * P.thrFlare);
    U.uAccent.value = P.accent; U.uAccentY.value = P.accentY; U.uAccentW.value = P.accentW;
    U.uSmokeStyle.value = P.smoke;
    // Brand geometry
    U.uHeadHex.value = P.headHex;
    U.uCrownN.value = Lay.crown.length; Lay.crown.forEach((c, i) => U.uCrownC.value[i].copy(c)); U.uCrownR.value = P.crownR; U.uCrownK.value = P.crownK;
    U.uSkirt.value = P.skirt; U.uSkirtN.value = Lay.skirt.length; U.uSkR.value = P.skirtR;
    placeSkirt(0);
    U.uSnout.value = P.snout;
    if (Lay.snout) { U.uSnA.value.copy(Lay.snout.a); U.uSnB.value.copy(Lay.snout.b); U.uSnR.value.set(...Lay.snout.r); }
    U.uHookN.value = Lay.hook.length; Lay.hook.forEach((h, i) => U.uHook.value[i].copy(h));
    U.uSplit.value = P.screenSplit; U.uSplitY.value = P.splitY; U.uGlyphSet.value = P.glyphSet; U.uScrFlat.value = P.screenFlat; U.uShades.value = P.screenShades;
  }
  function placeSkirt(t) {
    skirtAt(Lay, t).forEach((k, i) => { U.uSkA.value[i].copy(k.a); if (k.b) U.uSkB.value[i].copy(k.b); if (k.c) U.uSkC.value[i].copy(k.c); });
  }
  setParams({});

  function setPalette(pal) {
    for (const [u, k] of [['uShell', 'shell'], ['uTrim', 'trim'], ['uAcc', 'accent'], ['uGlow', 'glow'], ['uScr', 'screen'], ['uSmoke', 'smoke']]) U[u].value.forEach((c, i) => c.set(pal[k][i]));
  }

  const q = new THREE.Quaternion();
  /**
   * Pose at time t. yaw turns the whole view (turntable); motion runs the 12 s behaviour loop
   * (drift, banking, looking around, working); smoke false hides smoke and sparkles; pixK is
   * one pixel's world size per unit of depth, 2 tan(fov / 2) / height (for crisp sparkles).
   */
  function update(t, { yaw = 0, motion = false, smoke = true, blink = null, pixK = 0.0035, faceDebug = false } = {}) {
    const P = params;
    const B = bodyAt(P, t, motion);
    B.m.decompose(body.position, body.quaternion, body.scale);
    root.rotation.y = yaw;
    const beh = behaviour(t, motion);
    const face = faceAt(beh);
    U.uBlink.value = Math.min(blink ?? beh.blink, face.eyeOpen);
    U.uEyesOn.value = face.eyes ? 1 : 0;
    U.uEyeXf.value.set(P.glance * beh.glance, P.gaze, P.eyeScale, U.uBlink.value);
    if (P.skirtWave > 0) placeSkirt(t);
    U.uGlyph.value.set(face.glyphs, beh.workT, P.glyphRate, P.glyphPx);
    U.uFaceDebug.value = faceDebug ? 1 : 0;
    U.uSmokeOn.value = smoke ? 1 : 0;
    const { puffs, sparks } = smokeAt(Lay, t, motion);
    U.uPuffN.value = smoke ? puffs.length : 0;
    puffs.forEach((p, i) => { U.uPuffC.value[i].copy(p.c); U.uPuffV.value[i].copy(p.v); U.uPuffR.value[i] = p.r; U.uPuffA.value[i] = p.u; });
    U.uSparkN.value = smoke ? sparks.length : 0;
    sparks.forEach((s, i) => { U.uSparkC.value[i].copy(s.c); U.uSparkS.value[i] = s.s; });
    U.uPixK.value = pixK;
    root.updateMatrixWorld(true);
    U.uInvModel.value.copy(proxy.matrixWorld).invert();
    proxy.matrixWorld.decompose(V(), q, V());
    U.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
  }
  return { group: root, setParams, setPalette, update, get params() { return params; }, get layout() { return Lay; } };
}
