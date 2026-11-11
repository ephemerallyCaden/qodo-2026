// GLSL for the system view, ported from the approved asset viewer (feature/asset-library,
// mockups/asset-viewer/viewer.js) and cut to what the view draws: the health-band looks (lush,
// ocean or ice for healthy, desert for ash, toxic, lava), clouds and their shadows, haze, moons, the
// star, the starfield and the nearest-neighbour upscale. No rings: they carry no meaning yet
// (contract amendment 2026-11-10). Every colour arrives as a uniform from the palette
// (AGENTS.md Rule 5); the shaders only pick ramp steps. All lighting comes from the one key light
// (uLight) in flat bands; there are no stock materials, shadow maps or post passes (Rule 4).
import { DEPTH_RANGE } from '../model/depth.js';

/**
 * Lava fissures and ice crevasses, and their open plates (lava pools, ice water), from the asset
 * viewer's CRACKS. Widths are hero px: a size-1 planet at distance 7, 180 px tall.
 */
export const CRACKS = {
  lava: { freq: 3.2, cut: 0.25, half: 1.5, tip: 0.55, pool: { scale: 0.3, share: 0.3 } },
  ice: { freq: 3.8, cut: 0.23, half: 1.2, tip: 0.55, pool: { scale: 0.35, share: 0.27 } },
  lift: { max: 0.35, from: 0.44, to: 1.67 },
  heroPx: 40.8, floorPx: 1.0,
} as const;
export type CrackSpec = (typeof CRACKS)['lava' | 'ice'];
/** Loop-locked lava flow (asset viewer LAVA_FLOW, 'layered' mode). */
export const LAVA_FLOW = { freq: 1.2, warp: 1.0, drift: 0.5, layer: [0.337, 0.39, 0.65] } as const;

/** Look ids, as the surface shader's uBiome (the asset viewer's BIOMES ids). */
export const LOOK_ID = { lush: 0, ocean: 1, ice: 2, desert: 3, lava: 4, toxic: 7 } as const;

const f3 = (x: number) => x.toFixed(3);

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT). noise.ts is its CPU twin.
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s / 0.9375 * 0.5 + 0.5;
  }
`;

// Light bands: 0 night, 1 terminator, 2 lit, 3 full light.
const BANDS = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uBands;
  int band(vec3 n) {
    float d = dot(n, uLight);
    return d > uBands.z ? 3 : d > uBands.y ? 2 : d > uBands.x ? 1 : 0;
  }
`;

// The one sanctioned gradient (art-direction §5): a continuous per-pixel blend toward the depth tint,
// by each fragment's own distance from the eye. k scales the strength (lava glow and the star fade at
// half strength). uEye, not cameraPosition, so an ortho rig can share it. uDepthOn = 0 turns it off
// (RenderInput.depthFade), leaving only palette colours. uDepthStretch (squeeze, shift) moves the
// later steps out to the system's size (model/depth.ts depthStretch, #59); (1, 0) is the tuned fade.
const DEPTH = /* glsl */ `
  uniform vec3 uEye;
  uniform vec4 uDepthTint[4];
  uniform bool uDepthOn;
  uniform vec2 uDepthStretch;
  vec3 depthFade(vec3 c, vec3 posW, float k) {
    if (!uDepthOn) return c;
    float d = distance(posW, uEye);
    float x = log(max(d, 1e-3) / ${f3(DEPTH_RANGE.near)}) / log(${f3(DEPTH_RANGE.far)} / ${f3(DEPTH_RANGE.near)}) * 3.0;
    if (x > 1.0) x = x <= 2.0 + uDepthStretch.y ? 1.0 + (x - 1.0) * uDepthStretch.x : x - uDepthStretch.y;
    x = clamp(x, 0.0, 3.0);
    int i = int(min(floor(x), 2.0));
    vec4 tint = mix(uDepthTint[i], uDepthTint[i + 1], x - float(i));
    return mix(c, tint.rgb, tint.a * k);
  }
`;

export const VERT = /* glsl */ `
  out vec3 vNormalW;
  out vec3 vPosW;
  out vec3 vLocal;
  void main() {
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vLocal = position;
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** Moons and moonlets: a 4-step ramp in light bands. */
export const TOON_FRAG = /* glsl */ `
  ${BANDS}
  ${DEPTH}
  uniform vec3 uRamp[4];
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() { gl_FragColor = vec4(depthFade(uRamp[band(normalize(vNormalW))], vPosW, 1.0), 1.0); }
`;

/** The star: unlit, three glow bands from the limb in (centre hottest). */
export const STAR_FRAG = /* glsl */ `
  ${DEPTH}
  uniform vec3 uGlow[3];
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() {
    float d = dot(normalize(vNormalW), normalize(uEye - vPosW));
    vec3 c = d > 0.8 ? uGlow[2] : d > 0.5 ? uGlow[1] : uGlow[0];
    gl_FragColor = vec4(depthFade(c, vPosW, 0.5), 1.0);
  }
`;

const WORLEY = /* glsl */ `
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  // Integer cell hash (pcg3d), bit-exact on the CPU (noise.ts cellHash).
  uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
  }
  vec3 cellHash(vec3 c) { return vec3(pcg3d(uvec3(ivec3(c) + 4096))) * (1.0 / 4294967296.0); }
  // Distance to the nearest Voronoi cell edge (Quilez's two-pass method); own = the nearest cell,
  // across = the neighbour on the other side of that edge (integer cell coords).
  float voronoiCells(vec3 p, out vec3 own, out vec3 across) {
    vec3 i = floor(p), f = fract(p);
    vec3 r1 = vec3(0.0), c1 = vec3(0.0);
    float d1 = 9.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 r = g + cellHash(i + g) - f;
      float dd = dot(r, r);
      if (dd < d1) { d1 = dd; r1 = r; c1 = g; }
    }
    float e = 9.0;
    vec3 ga = c1;
    for (int z = -2; z <= 2; z++) for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec3 g = c1 + vec3(x, y, z);
      vec3 r = g + cellHash(i + g) - f;
      vec3 dr = r - r1;
      if (dot(dr, dr) > 1e-5) {
        float d = dot(0.5 * (r1 + r), normalize(dr));
        if (d < e) { e = d; ga = g; }
      }
    }
    own = i + c1;
    across = i + ga;
    return e;
  }
  float poolField(vec3 cell, vec3 off, float scale) { return snoise((cell + cellHash(cell)) * scale + off.zxy) + (cellHash(cell + 31.0).x - 0.5) * 0.5; }
  float crackMask(vec3 p, float freq, vec3 off) { return snoise(p * freq * 0.35 + off.yzx) * 0.5 + 0.5; }
  const float LAVA_CRACK_FREQ = ${f3(CRACKS.lava.freq)}, LAVA_CRACK_CUT = ${f3(CRACKS.lava.cut)}, LAVA_POOL_SCALE = ${f3(CRACKS.lava.pool.scale)};
  const float LAVA_CRACK_HALF = ${f3(CRACKS.lava.half)}, LAVA_CRACK_TIP = ${f3(CRACKS.lava.tip)};
  const float ICE_CRACK_FREQ = ${f3(CRACKS.ice.freq)}, ICE_CRACK_CUT = ${f3(CRACKS.ice.cut)}, ICE_POOL_SCALE = ${f3(CRACKS.ice.pool.scale)};
  const float ICE_CRACK_HALF = ${f3(CRACKS.ice.half)}, ICE_CRACK_TIP = ${f3(CRACKS.ice.tip)};
  const float CRACK_HERO_PX = ${f3(CRACKS.heroPx)}, CRACK_FLOOR_PX = ${f3(CRACKS.floorPx)};
`;

// Loop-locked domain-warped FBM: each warp input rides a circle (uLavaTime = cos, sin of the lava
// angle), so the molten layer churns and returns to itself every cycle.
const LAVA = /* glsl */ `
  uniform vec2 uLavaTime;
  float fbmL(vec3 p) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 3; i++) { s += a * snoise(p); n += a; p = p * 2.03 + 11.7; a *= 0.5; }
    return s / n * 0.5 + 0.5;
  }
  vec3 fbm3v(vec3 p) { return vec3(snoise(p), snoise(p + vec3(5.2, 1.3, 2.8)), snoise(p + vec3(1.7, 9.2, 4.1))) * 0.5; }
  float lavaFlow(vec3 p) {
    const float D = ${f3(LAVA_FLOW.drift)}, W = ${f3(LAVA_FLOW.warp)};
    vec3 a = p * ${f3(LAVA_FLOW.freq)} + uSeedOff.zxy;
    vec3 q = fbm3v(a + vec3(uLavaTime * D, 0.0));
    vec3 r = fbm3v(a + W * q + vec3(8.3, 2.8, 1.1) + vec3(0.0, uLavaTime.yx * D));
    return fbmL(a + W * r);
  }
`;

/**
 * The planet surface, shared by the surface pass and the cloud-shadow pass (each adds its own
 * main). uA/uB/uC are 5-step ramps and uG the 3-step glow, keyed per look (looks.ts). Bands come
 * from the key light; lava's molten layer is emissive (gGlow) and ignores it.
 */
const SURFACE = /* glsl */ `
  ${NOISE}
  ${BANDS}
  ${DEPTH}
  uniform int uBiome;
  uniform vec3 uA[5];
  uniform vec3 uB[5];
  uniform vec3 uC[5];
  uniform vec3 uG[3];
  uniform vec3 uSeedOff;
  uniform float uSea;
  uniform mat4 modelMatrix;
  uniform float uPoolCut;
  uniform float uCrackLift;
  in vec3 vNormalW;
  in vec3 vLocal;
  in vec3 vPosW;

  ${WORLEY}
  ${LAVA}
  vec2 worley(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d = 9.0, id = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 r = g + hash33(i + g) - f;
      float dd = dot(r, r);
      if (dd < d) { d = dd; id = hash33(i + g + 7.7).x; }
    }
    return vec2(sqrt(d), id);
  }
  float ridge(vec3 p) { return 1.0 - abs(snoise(p)); }

  // Screen scale, set once per fragment: gPx = sphere units per screen px here, gHero = screen px
  // per hero-framing px (crack widths are fixed on the planet, floored on screen).
  float gPx = 0.01, gHero = 1.0;
  void setScreenScale(vec3 p) {
    vec3 dx = dFdx(p), dy = dFdy(p);
    gPx = max(1e-5, max(length(dx), length(dy)));
    float size = length(modelMatrix[0].xyz);
    gHero = 1.0 / (CRACK_HERO_PX * gPx * size);
  }
  float worldPx(float heroPx, float floorPx) { return max(heroPx * gHero, floorPx); }
  float plates(vec3 p, float freq, vec3 off, out vec3 own, out vec3 across) { return voronoiCells(p * freq + off, own, across) / (freq * gPx); }
  float crackHero(vec3 p, float freq, vec3 off, float cut, float halfPx, float tipPx) {
    float w = halfPx * smoothstep(cut + uCrackLift, cut + uCrackLift + 0.25, crackMask(p, freq, off));
    return w < tipPx ? 0.0 : w;
  }
  float crackPx(float hero) { return hero > 0.0 ? worldPx(hero, CRACK_FLOOR_PX) : 0.0; }
  float gLavaV = 0.5;
  // Set by surface(): this pixel shows lava's emissive molten layer, which fades at half strength.
  bool gGlow = false;

  vec3 craters(vec3 p, vec3 c, int b, float scale, float density) {
    vec2 w = worley(p * scale + uSeedOff);
    if (w.y < density) {
      float r = 0.2 + 0.22 * fract(w.y * 13.1);
      if (w.x < r * 0.72) c = uB[max(b - 1, 0)];
      else if (w.x < r) c = uA[min(b + 1, 4)];
    }
    return c;
  }

  vec3 surface(vec3 p, int b) {
    vec3 c;
    gGlow = false;
    if (uBiome == ${LOOK_ID.lush} || uBiome == ${LOOK_ID.ocean} || uBiome == ${LOOK_ID.toxic}) {
      // lush / ocean / toxic: sea and land
      float h = fbm(p * 1.6 + uSeedOff) + (fbm(p * 4.1 + uSeedOff.zxy) - 0.5) * 0.22;
      if (h < uSea) c = uA[min(b + (h > uSea - 0.04 ? 1 : 0), 4)];
      else c = uB[min(b + (h > uSea + 0.11 ? 1 : 0), 4)];
      if (uBiome == ${LOOK_ID.toxic}) {
        if (h >= uSea && worley(p * 6.0 + uSeedOff).x < 0.3) c = uC[min(b + 1, 4)]; // oxidised crusts
        if (h < uSea && ridge(p * 5.0 + uSeedOff) > 0.965) c = uB[4]; // ember veins in the slag seas
      } else {
        float lat = abs(p.y) + (fbm(p * 3.0 + uSeedOff) - 0.5) * 0.25;
        if (lat > 0.9) c = uC[b]; // polar caps
      }
    } else if (uBiome == ${LOOK_ID.ice}) {
      // ice: bright strata cut by jagged crevasses (deeper blue at the core), over open water leads
      float h = fbm(p * 2.3 + uSeedOff);
      float strata = sin((p.y * 5.0 + h * 2.4) * 3.14159);
      c = uA[min(b + 1 + (strata > 0.55 ? 1 : 0), 4)];
      vec3 own, across;
      float dpx = plates(p, ICE_CRACK_FREQ, uSeedOff.yzx, own, across);
      if (poolField(own, uSeedOff.yzx, ICE_POOL_SCALE) > uPoolCut) {
        // open dark water between the sheets, with a paler submerged-ice fringe at the shore
        bool shore = poolField(across, uSeedOff.yzx, ICE_POOL_SCALE) <= uPoolCut && dpx < worldPx(1.5, 1.5);
        c = shore ? uC[min(b, 2)] : uC[max(min(b, 2) - 1, 0)];
      } else {
        float w = crackPx(crackHero(p, ICE_CRACK_FREQ, uSeedOff.yzx, ICE_CRACK_CUT, ICE_CRACK_HALF, ICE_CRACK_TIP));
        // no crack along a shore: the water's fringe marks that edge
        if (dpx < w && poolField(across, uSeedOff.yzx, ICE_POOL_SCALE) <= uPoolCut) c = dpx < w * 0.5 ? uB[max(b - 1, 0)] : uB[min(b, 4)];
      }
    } else if (uBiome == ${LOOK_ID.desert}) {
      // desert: wind dunes and craters
      float h = fbm(p * 2.0 + uSeedOff);
      int shift = sin((p.y * 9.0 + p.x * 2.5 + h * 4.5) * 3.14159) > 0.3 ? 1 : 0;
      c = uA[min(b + shift, 4)];
      c = craters(p, c, b, 2.4, 0.3);
      c = craters(p, c, b, 5.2, 0.2);
    } else {
      // lava (layered): dark crust plates over a molten layer; a gap between plates is a crack and a
      // missing plate a pool, both showing the moving lava
      float h = fbm(p * 2.4 + uSeedOff);
      int crust = min(b, 2) + (h > 0.58 ? 1 : 0);
      c = uA[crust];
      vec3 own, across;
      float dpx = plates(p, LAVA_CRACK_FREQ, uSeedOff, own, across);
      bool pool = poolField(own, uSeedOff, LAVA_POOL_SCALE) > uPoolCut;
      bool shore = poolField(across, uSeedOff, LAVA_POOL_SCALE) <= uPoolCut;
      float w = 0.0;
      bool fissure = false;
      if (!pool) { w = crackPx(crackHero(p, LAVA_CRACK_FREQ, uSeedOff, LAVA_CRACK_CUT, LAVA_CRACK_HALF, LAVA_CRACK_TIP)); fissure = dpx < w && shore; }
      float v = gLavaV;
      const vec3 L = vec3(${LAVA_FLOW.layer.map(f3).join(', ')});
      if (pool || fissure) {
        bool deep = pool && (!shore || dpx > worldPx(2.0, 2.0));
        bool skin = v < L.x && deep; // a dark cooling skin out in an open pool
        c = skin ? uA[crust + 1] : v < L.y ? uG[0] : v < L.z ? uG[1] : uG[2];
        gGlow = !skin;
      } else if ((w > 0.0 && shore && dpx < w + 1.0) || (!shore && dpx < 1.0)) {
        c = uA[4]; // the plate's lit 1 px edge facing the lava
      }
    }
    return c;
  }
`;

export const PLANET_FRAG = /* glsl */ `${SURFACE}
  void main() {
    vec3 p = normalize(vLocal);
    setScreenScale(p);
    if (uBiome == ${LOOK_ID.lava}) gLavaV = lavaFlow(p);
    int b = band(normalize(vNormalW));
    vec3 c = surface(p, b);
    gl_FragColor = vec4(depthFade(c, vPosW, gGlow ? 0.5 : 1.0), 1.0);
  }
`;

// Cloud shadow: the puffs projected along the light onto the surface (r = 1.003), drawn as the
// terrain one light band darker. It shares the surface material's uniforms.
export const SHADOW_VERT = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform mat4 uToSurface;
  out vec3 vLocal;
  out vec3 vHitW;
  out vec3 vPosW;
  out float vReach;
  void main() {
    vec3 w = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
    vec3 oc = w - uCenter;
    float R = uRadius * 1.003, b = dot(oc, uLight), disc = b * b - (dot(oc, oc) - R * R);
    if (disc < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float t = b - sqrt(disc);
    if (t <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 hit = w - uLight * t;
    vHitW = hit - uCenter;
    vPosW = hit;
    vReach = t / uRadius;
    vLocal = (uToSurface * vec4(hit, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(hit, 1.0);
  }
`;
export const SHADOW_FRAG = /* glsl */ `${SURFACE}
  in vec3 vHitW;
  in float vReach;
  void main() {
    if (vReach < 0.0 || vReach > 0.1) discard;
    vec3 p = normalize(vLocal);
    setScreenScale(p);
    int b = band(normalize(vHitW));
    if (b == 0) discard;
    gl_FragColor = vec4(depthFade(surface(p, b - 1), vPosW, 1.0), 1.0);
  }
`;

// Clouds: each puff's normal blends the planet-radial direction and its mass's dome, so a mass
// shades as one lumpy body (aMass.w = 1), not a pile of spheres; lava smoke keeps plain puffs (w = 0).
export const CLOUD_VERT = /* glsl */ `
  in vec4 aMass;
  out vec3 vNormalW;
  out vec3 vPosW;
  out vec3 vAnchorW;
  out float vMass;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vAnchorW = (modelMatrix * vec4(aMass.xyz, 1.0)).xyz;
    vMass = aMass.w;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
export const CLOUD_FRAG = /* glsl */ `
  ${BANDS}
  ${DEPTH}
  uniform vec3 uRamp[4];
  uniform vec3 uCenter;
  in vec3 vNormalW;
  in vec3 vPosW;
  in vec3 vAnchorW;
  in float vMass;
  void main() {
    vec3 g = normalize(vNormalW), r = normalize(vPosW - uCenter), m = normalize(vPosW - vAnchorW);
    float rg = dot(r, g), mg = dot(m, g);
    if (rg < 0.0) r -= rg * g;
    if (mg < 0.0) m -= mg * g;
    vec3 n = mix((g * 0.55 + r * 0.8) / 1.35, (g * 0.1 + r * 0.3 + m * 1.1) / 1.5, vMass);
    gl_FragColor = vec4(depthFade(uRamp[band(n)], vPosW, 1.0), 1.0);
  }
`;

/** Haze: a slightly larger shell drawn only near the lit limb, a thin crescent, never an outline. */
export const HAZE_FRAG = /* glsl */ `
  ${DEPTH}
  uniform vec3 uHaze;
  uniform vec3 uLight;
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float rim = 1.0 - abs(dot(n, normalize(uEye - vPosW)));
    if (rim < 0.72 || dot(n, uLight) < 0.3) discard;
    gl_FragColor = vec4(depthFade(uHaze, vPosW, 1.0), 1.0);
  }
`;

/** Background stars: 1 px, static, never faded, never twinkling. */
export const STARFIELD_VERT = /* glsl */ `
  in float aShade;
  out float vShade;
  void main() {
    vShade = aShade;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_PointSize = 1.0;
  }
`;
export const STARFIELD_FRAG = /* glsl */ `
  uniform vec3 uRamp[3];
  in float vShade;
  void main() { gl_FragColor = vec4(uRamp[int(vShade)], 1.0); }
`;

/** The upscale: each output pixel copies exactly one internal texel (nearest neighbour, whole factor). */
export const BLIT_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const BLIT_FRAG = /* glsl */ `
  uniform sampler2D uSource;
  uniform float uScale;
  void main() { gl_FragColor = texelFetch(uSource, ivec2(floor(gl_FragCoord.xy / uScale)), 0); }
`;
