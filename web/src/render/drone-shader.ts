// The drone's shader, ported from the drone lab (feature/asset-library, mockups/drone-lab/drone.js at
// 968bc0c) and cut to the two looks the view draws: the generic drone (D-final) and the Claude drone
// (D-final plus Clawd's four stubby legs). One raymarched signed-distance body per drone inside a
// proxy box, so one drone is one draw call. The lab's lighting is kept: four flat bands from the one
// key light, self-shadowing and contact occlusion, the V2 screen eyes, crisp 1 px sparkles. Every
// colour is a uniform from the palette (AGENTS.md Rule 5); the shader only picks a band (Rule 4).
// Cut from the lab: goggles, ears, crown, snout, fins, hex and star heads, sunglasses and the other
// brands' glyph sets. Local units are lab world units; the drone faces +z.

export const MAX_PUFFS = 16;
export const MAX_SPARKS = 6;
export const MAX_LEGS = 4;
/** The proxy box that bounds the drone (local units). */
export const BMIN = [-0.6, -0.62, -0.6] as const;
export const BMAX = [0.6, 0.46, 0.6] as const;

export const DRONE_VERT = /* glsl */ `
  out vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const DRONE_FRAG = /* glsl */ `
  uniform mat4 uInvModel, uModel, uViewProj;
  uniform vec3 uLightLocal;
  uniform float uPixK;
  uniform vec3 uShell[4], uTrim[4], uAcc[4], uGlow[4], uScr[3], uSmoke[3];
  uniform vec3 uHeadB; uniform vec4 uHeadK; // half-size; corner, round, taper, flat
  uniform vec3 uRimC; uniform vec2 uRimR; uniform float uRimT;
  uniform vec4 uScreen; // half-width tan, half-height tan, centre height, superellipse exponent
  uniform float uBezel; uniform vec2 uEyePhys;
  uniform vec4 uEyeXf; // eye offset x, y (eye-box px), scale, blink
  uniform vec4 uGlyph; // glyph coverage 0..1, time into the work (s), flips per second, glyph pixel size
  uniform int uEyesOn, uGlyphSet;
  uniform vec3 uAntA, uAntB; uniform float uAntR, uAntTip;
  uniform vec3 uThrA, uThrB; uniform vec2 uThrR;
  uniform int uSkirtN; uniform vec3 uSkA[${MAX_LEGS}], uSkB[${MAX_LEGS}]; uniform float uSkR;
  uniform int uPuffN; uniform vec3 uPuffC[${MAX_PUFFS}]; uniform float uPuffR[${MAX_PUFFS}], uPuffA[${MAX_PUFFS}];
  uniform int uSparkN; uniform vec3 uSparkC[${MAX_SPARKS}]; uniform float uSparkS[${MAX_SPARKS}];
  uniform int uEyes; uniform float uBlink;
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

  // The head: a rounded box blended toward an ellipsoid, tapered toward the bottom, its bottom
  // optionally cut flat (k = corner radius, round, taper, flat). Mirrored in JS (shapeField).
  float sdShape(vec3 q, vec3 b, vec4 k) {
    float t = clamp((q.y + b.y) / (2.0 * b.y), 0.0, 1.0);
    float s = 1.0 / mix(k.z, 1.0, t);
    vec3 r = vec3(q.x * s, q.y, q.z * s);
    float d = mix(sdRoundBox(r, b, k.x), sdEllipsoid(r, b), k.y) * min(1.0, 1.0 / s);
    if (k.w > 0.001) d = smax(d, -b.y * (1.0 - k.w) - q.y, 0.02);
    return d;
  }
  float dHead(vec3 p) { return sdShape(p, uHeadB, uHeadK); }
  // An elliptical ring hugging the head (scaled torus; under-stepped by the march).
  float dRim(vec3 p) { vec3 q = p - uRimC; float m = min(uRimR.x, uRimR.y); return length(vec2((length(q.xz / uRimR) - 1.0) * m, q.y)) - uRimT; }
  float dStalk(vec3 p) { return sdCapsule(p, uAntA, uAntB, uAntR); }
  float dTip(vec3 p) { return length(p - uAntB) - uAntTip; }
  float dLeg(vec3 p, int i) { return sdCapsule(p, uSkA[i], uSkB[i], uSkR); }
  float dThr(vec3 p) { return sdRoundCone(p, uThrA, uThrB, uThrR.x, uThrR.y); }

  float mapBody(vec3 p) {
    float d = dHead(p);
    d = smin(d, dRim(p), K);
    d = smin(d, dStalk(p), K);
    d = smin(d, dTip(p), K);
    d = smin(d, dThr(p), K);
    for (int i = 0; i < ${MAX_LEGS}; i++) { if (i >= uSkirtN) break; d = smin(d, dLeg(p, i), K); }
    return d;
  }
  // Smoke: free-floating round puffs, each three blended spheres (a chunky cloud).
  float dPuff(vec3 p, int i) {
    vec3 c = uPuffC[i]; float r = uPuffR[i];
    float d = length(p - c) - r;
    d = smin(d, length(p - c - vec3(0.62, 0.3, 0.15) * r) - r * 0.72, r * 0.45);
    return smin(d, length(p - c - vec3(-0.58, 0.2, -0.25) * r) - r * 0.78, r * 0.45);
  }
  float mapSmoke(vec3 p, out float age) {
    float d = 1e9; age = 0.0;
    for (int i = 0; i < ${MAX_PUFFS}; i++) {
      if (i >= uPuffN) break;
      if (uPuffR[i] <= 0.0) continue;
      if (length(p - uPuffC[i]) - uPuffR[i] * 2.2 > d) continue;
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

  // Face screen, in yaw/pitch about the head centre (normalised head space), so it wraps the head;
  // xy = screen coords (-1..1, y up), z = superellipse value (< 1 inside).
  vec3 screenQ(vec3 p) {
    vec3 n = p / uHeadB;
    vec2 q = vec2(atan(n.x, n.z) / atan(uScreen.x), (atan(n.y, length(n.xz)) - atan(uScreen.z)) / atan(uScreen.y));
    return vec3(q, pow(abs(q.x), uScreen.w) + pow(abs(q.y), uScreen.w));
  }
  // Screen coords -> the V2 32 x 24 eye box, fitted inside the screen at its real aspect.
  float eyeUnit() { return min(2.0 * uEyePhys.x / 32.0, 2.0 * uEyePhys.y / 24.0); }
  vec2 boxP(vec2 q) { return vec2(16.0, 12.0) + vec2(q.x * uEyePhys.x, -q.y * uEyePhys.y) / eyeUnit(); }

  // The V2 eye designs the two looks use (faces.js): 0 dots, 3 binocular. uBlink squashes them.
  float sdRRect(vec2 p, vec2 c, vec2 hs, float r) { vec2 q = abs(p - c) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float ring(vec2 p, vec2 c, float r) { float d = length(p - c); return max(d - r, r * 0.45 - d); } // disc minus pupil
  bool eyeLit(vec2 uv) {
    const float W = 32.0, CX = 16.0, CY = 12.0;
    const float e = 16.0 * 1.12;
    vec2 P = uv * vec2(32.0, 24.0);
    P.y = CY + (P.y - CY) / max(uBlink, 0.05);
    float d = 1e9;
    if (uEyes == 0) {
      for (int k = -1; k <= 1; k += 2) d = min(d, length(P - vec2(CX + float(k) * W * 0.22, CY)) - e * 0.2);
    } else {
      for (int k = -1; k <= 1; k += 2) d = min(d, ring(P, vec2(CX + float(k) * W * 0.21, CY), e * 0.27));
    }
    return d < 0.0;
  }
  bool eyesLit(vec2 P) {
    vec2 E = vec2(16.0, 12.0) + (P - vec2(16.0, 12.0) - vec2(uEyeXf.x, -uEyeXf.y)) / uEyeXf.z;
    return eyeLit(E / vec2(32.0, 24.0));
  }
  float hash1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
  float hash2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
  // Working face: the eyes go and the whole screen flashes with typed ASCII glyphs (a 5 x 7 pixel
  // font). Glyph pixels are squares in eye-box units, so only the pixel pass pixelates them.
  const int GLYPH_N = 17;
  const int SET_STAR[4] = int[4](14, 14, 3, 4); // Claude's asterisk spinner: * + .
  const int GLYPHS[119] = int[119](0, 14, 17, 21, 17, 14, 0, 0, 17, 10, 4, 10, 17, 0, 0, 31, 17, 17, 17, 31, 0, 0, 4, 4, 31, 4, 4, 0, 0, 0, 0, 4, 0, 0, 0, 1, 2, 2, 4, 8, 8, 16, 16, 8, 8, 4, 2, 2, 1, 6, 4, 4, 8, 4, 4, 6, 12, 4, 4, 2, 4, 4, 12, 0, 4, 0, 0, 4, 4, 8, 2, 4, 8, 16, 8, 4, 2, 8, 4, 2, 1, 2, 4, 8, 10, 10, 31, 10, 31, 10, 10, 0, 0, 31, 0, 31, 0, 0, 0, 4, 21, 14, 21, 4, 0, 14, 17, 19, 21, 25, 17, 14, 4, 12, 4, 4, 4, 4, 14);
  bool glyphLit(vec2 q, out int tone) {
    tone = 3;
    if (uGlyph.x <= 0.0) return false;
    float u = eyeUnit(), gp = uGlyph.w;
    vec2 S = uEyePhys / u;
    vec2 cell = vec2(6.0, 8.0) * gp;
    vec2 n = max(floor(2.0 * S / cell), vec2(1.0));
    vec2 P = vec2(q.x * S.x, -q.y * S.y) + n * cell * 0.5;
    vec2 ci = floor(P / cell);
    if (ci.x < 0.0 || ci.y < 0.0 || ci.x >= n.x || ci.y >= n.y) return false;
    vec2 cq = ((ci + 0.5) * cell - n * cell * 0.5) / S * 1.2;
    if (pow(abs(cq.x), uScreen.w) + pow(abs(cq.y), uScreen.w) > 1.0) return false;
    float id = ci.x + ci.y * 17.0;
    if (hash1(id + 3.1) >= uGlyph.x) return false;
    float flip = floor(uGlyph.y * uGlyph.z + hash1(id + 7.7) * 4.0);
    float h = hash2(vec2(id, flip));
    if (h > 0.86) return false;
    float hg = hash2(vec2(id + 0.5, flip + 0.25));
    int g = int(hg * float(GLYPH_N)) % GLYPH_N;
    if (uGlyphSet == 1) g = SET_STAR[int(hg * 4.0) % 4];
    ivec2 b = ivec2(floor((P - ci * cell) / gp - 0.5));
    if (b.x < 0 || b.x > 4 || b.y < 0 || b.y > 6) return false;
    tone = h < 0.22 ? 1 : h < 0.6 ? 2 : 3;
    return ((GLYPHS[g * 7 + b.y] >> (4 - b.x)) & 1) == 1;
  }
  bool glint(vec2 q) {
    float u = eyeUnit();
    float o = mix(6.0, 3.0, clamp((uScreen.w - 2.0) / 4.0, 0.0, 1.0));
    vec2 G = vec2((q.x + 1.0) * uEyePhys.x, (1.0 - q.y) * uEyePhys.y) / u - o;
    return (G.y >= 0.0 && G.y < 1.0 && G.x >= 0.0 && G.x < 2.0) || (G.y >= 1.0 && G.y < 2.0 && G.x >= 0.0 && G.x < 1.0);
  }

  // Colour region of a body point: 0 shell, 1 trim, 2 accent (legs), 3 screen, 4 glow.
  int region(vec3 p, out vec2 sq) {
    sq = vec2(0.0);
    float best = dHead(p), d;
    int part = 0; // 0 head 1 trim 2 accent 4 glow 7 nozzle
    d = dRim(p); if (d < best) { best = d; part = 1; }
    d = dStalk(p); if (d < best) { best = d; part = 1; }
    d = dTip(p); if (d < best) { best = d; part = 4; }
    d = dThr(p); if (d < best) { best = d; part = 7; }
    for (int i = 0; i < ${MAX_LEGS}; i++) { if (i >= uSkirtN) break; d = dLeg(p, i); if (d < best) { best = d; part = 2; } }
    if (part == 0) {
      vec3 s = screenQ(p);
      sq = s.xy;
      if (s.z < 1.0) return 3;
      if (uBezel > 0.0 && s.z < pow(1.0 + uBezel, uScreen.w)) return 1;
      return 0;
    }
    if (part == 7) return dot(p - uThrB, normalize(uThrB - uThrA)) > 0.45 * uThrR.y ? 4 : 1; // the nozzle's mouth glows
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
    vec3 c = vec3(0.0);
    bool have = false;
    float depth = gl_FragCoord.z;
    if (hit) {
      vec3 p = ro + rd * t;
      vec4 clip = uViewProj * (uModel * vec4(p, 1.0));
      depth = clip.z / clip.w * 0.5 + 0.5;
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
          if (r == 3) {
            vec3 refl = reflect(rd, n);
            c = (refl.y > 0.18 && b >= 2) ? uScr[1] : uScr[0];
            int tone;
            if (glyphLit(sq, tone)) c = uGlow[tone];
            else if (uEyesOn == 1 && eyesLit(boxP(sq))) c = uGlow[3];
            if (glint(sq)) c = uScr[2];
          } else if (r == 2) c = uAcc[b];
          else if (r == 1) c = uTrim[b];
          else c = uShell[b];
        }
      }
      have = true;
    }
    // Sparkles: crisp 1-pixel dots and + crosses at their projected pixel, hidden behind anything nearer.
    if (uSparkN > 0) {
      mat3 toLocal = mat3(uInvModel);
      vec3 R = normalize(toLocal * vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
      vec3 Up = normalize(toLocal * vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
      vec3 F = cross(Up, R);
      for (int i = 0; i < ${MAX_SPARKS}; i++) {
        if (i >= uSparkN) break;
        if (uSparkS[i] < 0.5) continue;
        vec3 v = uSparkC[i] - ro;
        float along = dot(v, rd), dz = dot(v, F);
        if (along <= 0.0 || (hit && t < along)) continue;
        vec3 off = ro + rd * (dz / dot(rd, F)) - uSparkC[i];
        float pix = dz * uPixK;
        float dx = abs(dot(off, R)) / pix, dy = abs(dot(off, Up)) / pix;
        bool on = uSparkS[i] < 1.5 ? (dx < 0.5 && dy < 0.5) : ((dx < 0.5 && dy < 1.5) || (dy < 0.5 && dx < 1.5));
        if (on) {
          c = uSmoke[2]; have = true;
          vec4 sp = uViewProj * (uModel * vec4(ro + rd * (dz / dot(rd, F)), 1.0)); // the sparkle's own depth
          depth = sp.z / sp.w * 0.5 + 0.5;
        }
      }
    }
    if (!have) discard;
    gl_FragColor = vec4(c, 1.0);
    gl_FragDepth = depth;
  }
`;
