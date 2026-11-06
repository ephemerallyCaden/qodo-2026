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
import { DEFAULTS } from './params.js';
import { PALETTES } from './palette.js';

export const LIGHT_DIR = new THREE.Vector3(-0.3, 0.55, 0.78).normalize(); // the viewer's top-left key
export const LOOP = 6; // s: idle loop (turntable, stills)
export const MOTION_LOOP = 12; // s: the full behaviour loop (drift, look around, work)
export const PUFF_PERIOD = 1.5; // s: each smoke slot fires at most once per period
// Whole cycles per 12 s motion loop. Bob, sway and puffs also divide the 6 s idle loop.
export const CYCLES = { bob: 4, sway: 2, drift: 1, puffs: MOTION_LOOP / PUFF_PERIOD };
export const MAX_PUFFS = 32;
export const MAX_SPARKS = 6;

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
  uniform vec4 uWork; // code rows shown, lines done, typing progress of the newest line, row count
  uniform int uEars; uniform vec3 uEarC[2]; uniform float uEarR, uEarT, uEarSweep;
  uniform int uTopper; uniform vec3 uGogC[2], uGogX[2], uGogY[2], uGogZ[2], uGogB; uniform float uGogR;
  uniform vec3 uCrestC, uCrestB;
  uniform int uAntN; uniform vec3 uAntA[2], uAntB[2]; uniform float uAntR, uAntTip;
  uniform int uThrN; uniform vec3 uThrA[4], uThrB[4]; uniform vec2 uThrR;
  uniform int uAccent; uniform float uAccentY, uAccentW;
  uniform int uSmokeOn, uSmokeStyle, uPuffN; uniform vec3 uPuffC[${MAX_PUFFS}], uPuffV[${MAX_PUFFS}]; uniform float uPuffR[${MAX_PUFFS}], uPuffA[${MAX_PUFFS}];
  uniform int uSparkN; uniform vec3 uSparkC[${MAX_SPARKS}]; uniform float uSparkS[${MAX_SPARKS}];
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
    if (uChin == 1) d = smin(d, length(p - uChinC) - uChinR, 0.03);
    return d;
  }
  // An elliptical ring hugging the head (scaled torus; under-stepped by the march).
  float dRim(vec3 p) { vec3 q = p - uRimC; float m = min(uRimR.x, uRimR.y); return length(vec2((length(q.xz / uRimR) - 1.0) * m, q.y)) - uRimT; }
  float dEar(vec3 p, int s) {
    if (uEars == 1) return sdCyl(p, uEarC[s], vec3(1.0, 0.0, 0.0), uEarR, uEarT, min(uEarT, uEarR) * 0.6);
    vec3 q = p - uEarC[s]; // swept fin
    float c = cos(uEarSweep), sn = sin(uEarSweep);
    q.yz = mat2(c, -sn, sn, c) * q.yz;
    return sdRoundBox(q, vec3(uEarT, uEarR, uEarR * 0.6), min(uEarT, uEarR) * 0.9);
  }
  vec3 gogLocal(vec3 p, int i) { vec3 q = p - uGogC[i]; return vec3(dot(q, uGogX[i]), dot(q, uGogY[i]), dot(q, uGogZ[i])); }
  float dGog(vec3 p, int i) { return sdRoundBox(gogLocal(p, i), uGogB, uGogR); }
  float dCrest(vec3 p) { return sdEllipsoid(p - uCrestC, uCrestB); }
  float dStalk(vec3 p, int i) { return sdCapsule(p, uAntA[i], uAntB[i], uAntR); }
  float dTip(vec3 p, int i) { return length(p - uAntB[i]) - uAntTip; }
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
    for (int i = 0; i < 4; i++) { if (i >= uThrN) break; d = smin(d, dThr(p, i), K); }
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
  vec3 screenQ(vec3 p) {
    vec3 n = p / uHeadB;
    vec2 q = vec2(atan(n.x, n.z) / atan(uScreen.x), (atan(n.y, length(n.xz)) - atan(uScreen.z)) / atan(uScreen.y));
    return vec3(q, pow(abs(q.x), uScreen.w) + pow(abs(q.y), uScreen.w));
  }
  // Screen coords -> the V2 32 x 24 eye box, fitted inside the screen at its real aspect.
  float eyeUnit() { return min(2.0 * uEyePhys.x / 32.0, 2.0 * uEyePhys.y / 24.0); }
  vec2 boxP(vec2 q) { return vec2(16.0, 12.0) + vec2(q.x * uEyePhys.x, -q.y * uEyePhys.y) / eyeUnit(); }
  bool eyesLit(vec2 P) {
    vec2 E = vec2(16.0, 12.0) + (P - vec2(16.0, 12.0) - vec2(uEyeXf.x, -uEyeXf.y)) / uEyeXf.z;
    return eyeLit(E / vec2(32.0, 24.0)); // uBlink (set to uEyeXf.w) squashes them
  }
  float hash1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
  float hash2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
  // Working state: lines of code typed in at the bottom of the screen and scrolling up.
  // Rows 3 px tall on a 4.5 px pitch; the newest row grows as it is typed.
  bool codeLit(vec2 P) {
    if (uWork.x <= 0.0) return false;
    float base = 23.0 - 1.0; // bottom of the newest row
    float i = floor((base - P.y) / 4.5);
    if (i < 0.0 || i >= uWork.x) return false;
    if (base - P.y - i * 4.5 >= 3.0) return false;
    float n = uWork.y - i;
    float indent = floor(hash1(n) * 3.0) * 3.0;
    float len = 9.0 + floor(hash1(n + 31.0) * 12.0);
    if (i == 0.0) len = floor(len * uWork.z);
    float x = P.x - 6.0 - indent;
    if (x < 0.0 || x >= len) return false;
    return mod(x, 5.0) < 4.0 && hash2(vec2(n, floor(x / 5.0))) > 0.18;
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
    return false;
  }

  // Colour region of a body point: 0 shell, 1 trim, 2 accent, 3 screen, 4 glow, 6 goggle lens.
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
    for (int i = 0; i < 4; i++) { if (i >= uThrN) break; d = dThr(p, i); if (d < best) { best = d; part = 7; gi = i; } }
    if (part == 0) {
      vec3 s = screenQ(p);
      sq = s.xy;
      if (s.z < 1.0) return 3;
      if (uBezel > 0.0 && s.z < pow(1.0 + uBezel, uScreen.w)) return 1;
      return accentAt(p) ? 2 : 0;
    }
    if (part == 6) {
      vec3 g = gogLocal(p, gi);
      if (g.z > 0.0 && sdRoundBox(vec3(g.xy, 0.0), vec3(uGogB.xy - 0.014, 1.0), max(uGogR - 0.014, 0.004)) < 0.0) { sq = g.xy / uGogB.xy; return 6; }
      return 1;
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
              vec2 P = boxP(sq);
              if (codeLit(P)) c = uGlow[2];
              if (eyesLit(P)) c = uGlow[3];
              if (glint(sq)) c = uScr[2];
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
  const headF = shapeField(head.b, head.k);
  const headBottom = -exitAlong(headF, V(), V(0, -1, 0));
  const chin = { on: P.chin === 1, c: V(0, headBottom - 0.15 * P.chinR, -0.1 * P.headD), r: P.chinR };
  const core = chin.on ? (p) => smin(headF(p), p.clone().sub(chin.c).length() - chin.r, 0.03) : headF;
  const top = exitAlong(headF, V(), V(0, 1, 0));
  const bottom = -exitAlong(core, V(), V(0, -1, 0), 1);

  const rimY = P.rimY * P.headH;
  const rim = { c: V(0, rimY, 0), r: [exitAlong(headF, V(0, rimY, 0), V(1, 0, 0)) + 0.35 * P.rimT, exitAlong(headF, V(0, rimY, 0), V(0, 0, 1)) + 0.35 * P.rimT] };

  const earY = P.earY * P.headH;
  const earX = exitAlong(headF, V(0, earY, 0), V(1, 0, 0)) + (P.ears === 1 ? 0.15 : 0.3) * P.earT;
  const ears = [V(-earX, earY, 0), V(earX, earY, 0)];

  const gog = [-1, 1].map((s) => {
    const at = surfacePoint(headF, V(s * P.gogX * P.headW, P.gogY * P.headH, 0.62 * P.headD));
    const z = gradient(headF, at);
    const x = V(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x).normalize();
    return { c: at.addScaledVector(z, 0.003), x, y, z };
  });
  const crest = { c: V(0, top - 0.012, -0.12 * P.headD), b: V(0.014, P.crestH, 0.6 * P.headD) };

  const ant = [];
  for (let i = 0; i < P.antenna; i++) {
    const s = P.antenna === 2 ? (i === 0 ? -1 : 1) : 0;
    const base = surfacePoint(headF, V(s * 0.45 * P.headW, P.headH, -0.12 * P.headD)).multiplyScalar(0.97);
    const lean = P.antenna === 2 ? V(s * Math.sin(P.antTilt), Math.cos(P.antTilt), -0.15) : V(0, Math.cos(P.antTilt), -Math.sin(P.antTilt));
    ant.push({ base, dir: lean.normalize() });
  }

  const thr = LAYOUTS[P.thrusters](P.thrSpread).map(([root, axis]) => {
    const ax = axis.clone().normalize();
    const dir = V(root.x * P.headW, root.y * P.headH, root.z * P.headD).normalize();
    const at = dir.clone().multiplyScalar(exitAlong(core, V(), dir, 1));
    return { a: at.clone().addScaledVector(ax, -0.5 * P.thrL), b: at.clone().addScaledVector(ax, P.thrL), axis: ax };
  });
  const nozzleBottom = Math.min(...thr.map((n) => n.b.y - P.thrR * P.thrFlare));

  return { P, head, headF, core, chin, top, bottom: Math.min(bottom, nozzleBottom), rim, ears, gog, crest, ant, thr };
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
  const pitch = (motion ? 0.6 * P.bank * vz : 0) + 0.04 * Math.sin(W12 * t * CYCLES.sway + 1.3);
  const yaw = P.lookYaw * behaviour(t, motion).glance;
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

/** Pieces the silhouette is meant to have with smoke and sparkles off: always 1. */
export const intendedPieces = () => 1;

/** Top and bottom of the drone at rest (world units from the head centre, excluding smoke), for framing and size. */
export function extents(Lay) {
  const { P } = Lay;
  let top = Lay.top;
  for (const a of Lay.ant) top = Math.max(top, a.base.y + a.dir.y * P.antL + P.antTip);
  if (P.topper === 2) top = Math.max(top, Lay.crest.c.y + Lay.crest.b.y);
  return { top: top * P.size, bottom: Lay.bottom * P.size };
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
    uEyeXf: { value: new THREE.Vector4(0, 0, 1, 1) }, uWork: { value: new THREE.Vector4() },
    uEars: { value: 0 }, uEarC: { value: vecs(2) }, uEarR: { value: 0 }, uEarT: { value: 0 }, uEarSweep: { value: 0 },
    uTopper: { value: 0 }, uGogC: { value: vecs(2) }, uGogX: { value: vecs(2) }, uGogY: { value: vecs(2) }, uGogZ: { value: vecs(2) }, uGogB: { value: V() }, uGogR: { value: 0 },
    uCrestC: { value: V() }, uCrestB: { value: V(1, 1, 1) },
    uAntN: { value: 0 }, uAntA: { value: vecs(2) }, uAntB: { value: vecs(2) }, uAntR: { value: 0.0105 }, uAntTip: { value: 0 },
    uThrN: { value: 0 }, uThrA: { value: vecs(4) }, uThrB: { value: vecs(4).map((v) => v.set(0, -1, 0)) }, uThrR: { value: new THREE.Vector2() },
    uAccent: { value: 0 }, uAccentY: { value: 0 }, uAccentW: { value: 0 },
    uSmokeOn: { value: 1 }, uSmokeStyle: { value: 0 }, uPuffN: { value: 0 }, uPuffC: { value: vecs(MAX_PUFFS) }, uPuffV: { value: vecs(MAX_PUFFS) },
    uPuffR: { value: new Array(MAX_PUFFS).fill(0) }, uPuffA: { value: new Array(MAX_PUFFS).fill(0) },
    uSparkN: { value: 0 }, uSparkC: { value: vecs(MAX_SPARKS) }, uSparkS: { value: new Array(MAX_SPARKS).fill(0) },
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
    U.uChin.value = P.chin; U.uChinC.value.copy(Lay.chin.c); U.uChinR.value = P.chinR;
    U.uRim.value = P.rim; U.uRimC.value.copy(Lay.rim.c); U.uRimR.value.set(...Lay.rim.r); U.uRimT.value = P.rimT;
    U.uScreen.value.set(P.screenW, P.screenH, P.screenY, P.screenRound); U.uBezel.value = P.bezel;
    // The screen's real half-size, so the eye box keeps its aspect on any screen.
    U.uEyePhys.value.set(Math.min(P.headW * mix(P.screenW, Math.sin(Math.atan(P.screenW)), P.headRound), P.headW * 0.95), P.headH * mix(P.screenH, Math.sin(Math.atan(P.screenH)), P.headRound));
    U.uEyes.value = P.eyes;
    U.uEars.value = P.ears; Lay.ears.forEach((e, i) => U.uEarC.value[i].copy(e)); U.uEarR.value = P.earR; U.uEarT.value = P.earT; U.uEarSweep.value = P.earSweep;
    U.uTopper.value = P.topper;
    Lay.gog.forEach((g, i) => { U.uGogC.value[i].copy(g.c); U.uGogX.value[i].copy(g.x); U.uGogY.value[i].copy(g.y); U.uGogZ.value[i].copy(g.z); });
    U.uGogB.value.set(P.gogW, P.gogH, 0.012); U.uGogR.value = 0.6 * Math.min(P.gogW, P.gogH);
    U.uCrestC.value.copy(Lay.crest.c); U.uCrestB.value.copy(Lay.crest.b);
    U.uAntN.value = P.antenna; U.uAntTip.value = P.antTip;
    Lay.ant.forEach((a, i) => { U.uAntA.value[i].copy(a.base); U.uAntB.value[i].copy(a.base).addScaledVector(a.dir, P.antL); });
    U.uThrN.value = Lay.thr.length; Lay.thr.forEach((n, i) => { U.uThrA.value[i].copy(n.a); U.uThrB.value[i].copy(n.b); });
    U.uThrR.value.set(P.thrR, P.thrR * P.thrFlare);
    U.uAccent.value = P.accent; U.uAccentY.value = P.accentY; U.uAccentW.value = P.accentW;
    U.uSmokeStyle.value = P.smoke;
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
  function update(t, { yaw = 0, motion = false, smoke = true, blink = null, pixK = 0.0035 } = {}) {
    const P = params;
    const B = bodyAt(P, t, motion);
    B.m.decompose(body.position, body.quaternion, body.scale);
    root.rotation.y = yaw;
    const beh = behaviour(t, motion);
    const w = beh.work;
    U.uBlink.value = Math.min(blink ?? beh.blink, 1 - 0.4 * w);
    const lift = mix(3.5, 6, clamp01((P.screenRound - 2) / 3)); // round screens have less room up top
    U.uEyeXf.value.set(P.glance * beh.glance, P.gaze * (1 - w) + lift * w, P.eyeScale * (1 - 0.35 * w), U.uBlink.value);
    const lines = beh.workT * P.codeRate;
    U.uWork.value.set(w > 0.5 ? Math.min(P.codeRows, Math.floor(lines) + 1) : 0, Math.floor(lines), lines - Math.floor(lines), P.codeRows);
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
