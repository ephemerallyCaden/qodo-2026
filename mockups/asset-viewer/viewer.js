// Codebase Space Explorer: batch 1 asset viewer.
// Every asset is a live three.js mesh with flat, banded toon shading. The scene
// is rendered at a low internal resolution and upscaled by an integer factor
// with nearest-neighbour, so pixels stay crisp. There's no dithering and no outline.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EYE_DESIGNS, EYES_GLSL, eyesFor } from './faces.js';
import { LOSPEC, LOSPEC_ORDER, SPARES } from './palettes.js';
import { mapPalette, mapColors, snapToPool } from './palette-map.js';
import { PLANET_RAMPS } from './planet-ramps.js';

THREE.ColorManagement.enabled = false; // palette hexes go to the screen untouched

// ---------------------------------------------------------------- palette
// Ramps run dark -> light. v2 is current: punchier Planetarium-derived colours on
// near-black blue-plum space. v1 (the batch 1 pastels) is kept for the before/after.
// Each depth entry is [tint, amount]. Level 0 is near, 1 is mid (about -35% value),
// 2 is far (about -70%), and 3 is a dark silhouette that keeps a faint hint of colour.
// On near-black space the silhouette tint sits a little above the background so it still reads.
const SUIT = {
  suit: ['#68718f', '#a3aec8', '#d3dcea', '#f2f6fc'], // cool white (approved, unchanged)
  gear: ['#4a5170', '#77819f', '#a2adc6', '#c4cee0'], // mitts, boots, backpack, visor rim
  visor: ['#0f1329', '#232f58'], // near-black blue, two tones
  glint: '#f4f8ff',
};
export const PALETTES = {
  v1: {
    ...SUIT,
    space: '#2b2535',
    stars: ['#5d5372', '#a99cbf', '#f4ecf7'],
    ocean: ['#2f3a62', '#3f5794', '#5a7fc0', '#80a9dc', '#acd3ee'],
    land: ['#33504a', '#4c7a5a', '#6fa36a', '#9cc678', '#cfe39a'],
    cap: ['#6e6a86', '#b9b3c9', '#e6e0ee', '#fbf8ff'],
    cloud: ['#6e6274', '#b39c94', '#e3cdb0', '#fff6e4'],
    ring: ['#5d4e72', '#8f7fae', '#d8a9b8', '#f2d6b3'],
    contributors: {
      coral: ['#6e3a4c', '#b85c66', '#f08e7f', '#ffc4a8'],
      mint: ['#2c5a5a', '#3f9886', '#6fd1b0', '#bff2da'],
      lilac: ['#433a74', '#7563bd', '#a993ec', '#dccfff'],
    },
    depth: [['#262a46', 0], ['#262a46', 0.35], ['#262a46', 0.7], ['#110f18', 0.88]],
  },
  v2: {
    ...SUIT,
    space: '#0d0b16',
    stars: ['#3b3866', '#9a90e0', '#fff8ff'],
    ocean: ['#141d5c', '#1d3fa6', '#2b6ee0', '#4ea3f7', '#94dcff'],
    land: ['#123d33', '#1d7350', '#38a85a', '#7cd65a', '#d0f56c'],
    cap: ['#3f4590', '#98a3e8', '#dfe5ff', '#ffffff'],
    cloud: ['#30285a', '#8f74b0', '#f2d8b8', '#fffaf0'],
    ring: ['#3a2a78', '#8463e6', '#ff86bf', '#ffd38a'],
    contributors: {
      coral: ['#5c1838', '#cc3f4f', '#ff7663', '#ffbb8c'],
      mint: ['#0e4247', '#0fa384', '#33e6a8', '#a6ffd8'],
      lilac: ['#2a1a74', '#6948ea', '#a27aff', '#dac9ff'],
    },
    depth: [['#1b1f4a', 0], ['#1b1f4a', 0.38], ['#1b1f4a', 0.72], ['#17172f', 0.88]],
  },
};
// Published palettes, mapped onto our roles using only their own colours.
for (const slug of [...LOSPEC_ORDER, ...SPARES]) PALETTES[`lospec:${slug}`] = mapPalette(slug);
// v1/v2 get the biome roles mapped from their own colours; their hand-made ramps win.
const hexesIn = (o) => (typeof o === 'string' ? (o.startsWith('#') ? [o] : []) : o && typeof o === 'object' ? Object.values(o).flatMap(hexesIn) : []);
for (const k of ['v1', 'v2']) PALETTES[k] = { ...mapColors(hexesIn(PALETTES[k])), ...PALETTES[k], snap: null };
// "final": the human's pick. Crew, space, stars and depth exactly as BLK 36 (tile 19);
// planets, rings and accents from the swappable PLANET_RAMPS data.
PALETTES.final = {
  ...PALETTES['lospec:blk-36'],
  ...PLANET_RAMPS,
  // Space: hard bands from BLK 36's near-black at the top to its deep navy and violet at the bottom.
  spaceBands: ['#000000', '#12173d', '#29174c'],
  name: 'final (BLK 36 crew + Earth-like planets)',
};
// Other palettes keep a flat background.
for (const pal of Object.values(PALETTES)) pal.spaceBands ??= [pal.space, pal.space, pal.space];
export const CONTRIBUTOR_KEYS = ['coral', 'mint', 'lilac'];
const HANDLES = { coral: '@caden', mint: '@mira', lilac: '@juno' }; // faces are hashed from these
let paletteName = 'v2';
// Ramp keys are paths into the active palette, e.g. 'ocean' or 'contributors.mint'.
const resolve = (key) => key.split('.').reduce((o, k) => o[k], PALETTES[paletteName]);

const DEPTH_RANGES = [12, 26, 44]; // camera distances at which an object drops a level
const depthCache = new Map();
function depthColor(hex, level) {
  const key = `${paletteName}:${hex}:${level}`;
  if (!depthCache.has(key)) {
    const pal = PALETTES[paletteName];
    const [tint, t] = pal.depth[level];
    const c = new THREE.Color(hex).lerp(new THREE.Color(tint), t);
    // Published palettes snap each depth step back onto their own (darker) colours.
    depthCache.set(key, pal.snap?.[level] ? new THREE.Color(snapToPool(c, pal.snap[level])) : c);
  }
  return depthCache.get(key);
}

const LIGHT_DIR = new THREE.Vector3(-0.3, 0.55, 0.78).normalize(); // top-left key ~40° off the view: concentric crescents

// ---------------------------------------------------------------- GLSL
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT). Value noise left grid creases.
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

const VERT = /* glsl */ `
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
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal); // correct for squashed cloud puffs
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOON_FRAG = /* glsl */ `
  ${BANDS}
  uniform vec3 uRamp[4];
  in vec3 vNormalW;
  void main() { gl_FragColor = vec4(uRamp[band(normalize(vNormalW))], 1.0); }
`;

// Clouds: a puff's own normal blended with the radial direction from the planet
// centre, so overlapping puffs shade as one soft mass and only the outer edge is lumpy.
const CLOUD_FRAG = /* glsl */ `
  ${BANDS}
  uniform vec3 uRamp[4];
  uniform vec3 uCenter;
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() {
    vec3 n = normalize(normalize(vNormalW) * 0.55 + normalize(vPosW - uCenter) * 0.8);
    gl_FragColor = vec4(uRamp[band(n)], 1.0);
  }
`;

// Biome surfaces (art-direction: biome = module health). All flat light bands from
// palette ramps; lava fissures (and toxic veins) are emissive and ignore lighting.
// uA/uB/uC are 5-entry ramps and uG a 3-entry glow ramp, re-keyed per biome (BIOMES).
const PLANET_FRAG = /* glsl */ `
  ${NOISE}
  ${BANDS}
  uniform int uBiome;
  uniform vec3 uA[5];
  uniform vec3 uB[5];
  uniform vec3 uC[5];
  uniform vec3 uG[3];
  uniform vec3 uSeedOff;
  uniform float uSea;
  in vec3 vNormalW;
  in vec3 vLocal;

  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  // Worley F1 distance plus a random id for the nearest cell.
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
  float ridge(vec3 p) { return 1.0 - abs(snoise(p)); } // 1.0 along a network of thin lines

  // Craters: sparse cells get a dark floor and a bright rim.
  vec3 craters(vec3 p, vec3 c, int b, float scale, float density) {
    vec2 w = worley(p * scale + uSeedOff);
    if (w.y < density) {
      float r = 0.2 + 0.22 * fract(w.y * 13.1);
      if (w.x < r * 0.72) c = uB[max(b - 1, 0)]; // floor a band darker, so craters read even on one-ramp moons
      else if (w.x < r) c = uA[min(b + 1, 4)];
    }
    return c;
  }

  void main() {
    vec3 p = normalize(vLocal);
    int b = band(normalize(vNormalW));
    vec3 c;
    if (uBiome == 0 || uBiome == 1 || uBiome == 7) {
      // lush / ocean / toxic: sea + land
      float h = fbm(p * 1.6 + uSeedOff) + (fbm(p * 4.1 + uSeedOff.zxy) - 0.5) * 0.22;
      if (h < uSea) c = uA[min(b + (h > uSea - 0.04 ? 1 : 0), 4)];
      else c = uB[min(b + (h > uSea + 0.11 ? 1 : 0), 4)];
      if (uBiome == 7) {
        if (h >= uSea && worley(p * 6.0 + uSeedOff).x < 0.3) c = uC[min(b + 1, 4)]; // fungal blooms
        if (h < uSea && ridge(p * 5.0 + uSeedOff) > 0.965) c = uB[4]; // glowing sludge veins
      } else {
        float lat = abs(p.y) + (fbm(p * 3.0 + uSeedOff) - 0.5) * 0.25;
        if (lat > 0.9) c = uC[b];
      }
    } else if (uBiome == 2) {
      // ice: bright strata and a network of crevasses
      float h = fbm(p * 2.3 + uSeedOff);
      float strata = sin((p.y * 5.0 + h * 2.4) * 3.14159);
      c = uA[min(b + 1 + (strata > 0.55 ? 1 : 0), 4)];
      if (ridge(p * 2.6 + uSeedOff) > 0.972 || ridge(p * 6.0 + uSeedOff.yzx) > 0.982) c = uB[min(b, 4)];
    } else if (uBiome == 3 || uBiome == 6) {
      // desert dunes / barren moon, both cratered
      float h = fbm(p * 2.0 + uSeedOff);
      int shift = h > 0.56 ? 1 : 0;
      if (uBiome == 3) shift = sin((p.y * 9.0 + p.x * 2.5 + h * 4.5) * 3.14159) > 0.3 ? 1 : 0;
      c = uA[min(b + shift, 4)];
      c = craters(p, c, b, 2.4, uBiome == 6 ? 0.55 : 0.3);
      c = craters(p, c, b, 5.2, uBiome == 6 ? 0.45 : 0.2);
    } else if (uBiome == 4) {
      // lava: dark crust, emissive fissures
      float h = fbm(p * 2.4 + uSeedOff);
      c = uA[min(b, 2) + (h > 0.58 ? 1 : 0)]; // crust stays in the darkest steps
      float f = max(ridge(p * 2.0 + uSeedOff), ridge(p * 4.6 + uSeedOff.zxy) * 0.988);
      if (f > 0.978) c = uG[2];
      else if (f > 0.958) c = uG[1];
      else if (f > 0.935) c = uG[0];
    } else {
      // gas giant: turbulent alternating bands and a storm
      float t = fbm(p * vec3(1.4, 0.45, 1.4) + uSeedOff);
      float lat = p.y * 4.2 + (t - 0.5) * 1.8;
      bool alt = mod(floor(lat), 2.0) < 1.0;
      int shift = fract(lat) > 0.72 ? 1 : 0;
      c = alt ? uA[min(b + shift, 4)] : uB[min(b + shift, 4)];
      vec3 sp = normalize(vec3(0.55, -0.32, 0.77));
      vec3 dp = p - sp;
      if (length(dp * vec3(0.7, 1.6, 0.7)) < 0.16) c = uB[min(b + 2, 4)];
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Atmosphere haze: a slightly larger shell drawn only near the lit limb, so it rims
// the planet and breaks the silhouette without reading as an outline.
const HAZE_FRAG = /* glsl */ `
  uniform vec3 uHaze;
  uniform vec3 uLight;
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float rim = 1.0 - abs(dot(n, normalize(cameraPosition - vPosW)));
    if (rim < 0.72 || dot(n, uLight) < 0.3) discard; // a thin crescent on the lit limb only
    gl_FragColor = vec4(uHaze, 1.0);
  }
`;

// Single-pixel points (ring dust, stars). Ring points darken in the planet's shadow.
const POINTS_VERT = /* glsl */ `
  in float aShade;
  in float aSize;
  out float vShade;
  out vec3 vPosW;
  void main() {
    vShade = aShade;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_PointSize = aSize;
  }
`;
const RING_FRAG = /* glsl */ `
  uniform vec3 uRamp[4];
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uRadius;
  in float vShade;
  in vec3 vPosW;
  void main() {
    int i = int(vShade);
    vec3 oc = vPosW - uCenter;
    float bq = dot(oc, uLight);
    if (bq < 0.0 && dot(oc, oc) - bq * bq < uRadius * uRadius) i = 0;
    gl_FragColor = vec4(uRamp[i], 1.0);
  }
`;
const STAR_FRAG = /* glsl */ `
  uniform vec3 uRamp[3];
  in float vShade;
  void main() { gl_FragColor = vec4(uRamp[int(vShade)], 1.0); }
`;

// ---------------------------------------------------------------- helpers
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Seeded 3D value-noise fbm for CPU-side placement (cloud masses), roughly 0..1.
function makeFbm3(seed) {
  const h = (x, y, z) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w);
  };
  return (x, y, z) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < 4; i++) { sum += amp * noise(x * f + 31.7 * i, y * f, z * f); f *= 2.03; amp *= 0.5; }
    return sum / 0.9375;
  };
}

// A material whose colour ramps can be re-tinted for depth. `ramps` maps uniform -> hex list.
function paletteMaterial(frag, ramps, extra = {}, opts = {}) {
  const uniforms = { uLight: { value: LIGHT_DIR }, uBands: { value: new THREE.Vector3(-0.08, 0.28, 0.62) }, ...extra };
  for (const [name, key] of Object.entries(ramps)) {
    const hexes = resolve(key);
    uniforms[name] = { value: Array.isArray(hexes) ? hexes.map((h) => new THREE.Color(h)) : new THREE.Color(hexes) };
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, ...opts });
  mat.userData.ramps = ramps;
  return mat;
}

function setDepthLevel(obj, level) {
  if (obj.userData.depthLevel === level) return;
  obj.userData.depthLevel = level;
  obj.traverse((o) => {
    const mats = o.material ? [o.material].flat() : [];
    for (const m of mats) {
      for (const [name, key] of Object.entries(m.userData.ramps ?? {})) {
        const hexes = resolve(key);
        const arr = m.uniforms[name].value;
        if (Array.isArray(arr)) arr.forEach((u, i) => u.copy(depthColor(hexes[Math.min(i, hexes.length - 1)], level))); // short ramps repeat their last colour
        else arr.copy(depthColor(hexes, level));
      }
    }
  });
}

// ---------------------------------------------------------------- planet
// Biomes: which palette ramps feed uA/uB/uC/uG, sea level, weather and haze.
// `extra` marks the optional ones (not in the art-direction core set).
export const BIOMES = {
  lush: { id: 0, label: 'lush', ramps: ['ocean', 'land', 'cap', 'glow'], sea: [0.47, 0.55], weather: 'cloud', haze: null },
  ocean: { id: 1, label: 'ocean', ramps: ['water', 'land', 'cap', 'glow'], sea: [0.7, 0.73], weather: 'thin', haze: 'haze.ocean' },
  ice: { id: 2, label: 'ice', ramps: ['ice', 'crevasse', 'cap', 'glow'], weather: null, haze: 'haze.ice' },
  desert: { id: 3, label: 'desert', ramps: ['sand', 'rock', 'cap', 'glow'], weather: null, haze: null },
  lava: { id: 4, label: 'lava', ramps: ['crust', 'crust', 'ash', 'glow'], weather: 'ash', haze: null },
  gas: { id: 5, label: 'gas giant (extra)', ramps: ['gasA', 'gasB', 'cap', 'glow'], weather: null, haze: null, extra: true },
  moon: { id: 6, label: 'barren moon (extra)', ramps: ['moon', 'moon', 'moon', 'glow'], weather: null, haze: null, extra: true },
  toxic: { id: 7, label: 'toxic (extra)', ramps: ['sludge', 'toxic', 'fungus', 'glow'], sea: [0.5, 0.56], weather: 'spore', haze: 'haze.toxic', extra: true },
};
// Weather: cloud-puff settings per biome. thr = density threshold (higher = less cover).
const WEATHER = {
  cloud: { ramp: 'cloud', thr: 0.635, size: 1, lift: 1, strays: 0.025 },
  thin: { ramp: 'cloud', thr: 0.685, size: 0.7, lift: 0.5, strays: 0.012 },
  ash: { ramp: 'ash', thr: 0.66, size: 0.85, lift: 1.7, strays: 0.04 },
  spore: { ramp: 'spore', thr: 0.665, size: 0.7, lift: 1.1, strays: 0.05 },
};

const PLANET_GEO = new THREE.SphereGeometry(1, 72, 48);
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 3);
const MAX_PUFFS = 1200;
const ramp5 = () => ({ value: Array.from({ length: 5 }, () => new THREE.Color()) });

function makePlanet() {
  const group = new THREE.Group();
  const surfaceMat = paletteMaterial(PLANET_FRAG, {}, {
    uBiome: { value: 0 }, uA: ramp5(), uB: ramp5(), uC: ramp5(), uG: { value: [0, 1, 2].map(() => new THREE.Color()) },
    uSeedOff: { value: new THREE.Vector3() }, uSea: { value: 0.5 },
    uBands: { value: new THREE.Vector3(0.2, 0.58, 0.86) }, // high bands curve into crescents
  });
  const surface = new THREE.Mesh(PLANET_GEO, surfaceMat);
  group.add(surface);

  const hazeMat = paletteMaterial(HAZE_FRAG, { uHaze: 'glint' });
  const haze = new THREE.Mesh(PLANET_GEO, hazeMat);
  haze.scale.setScalar(1.06);
  group.add(haze);

  // Clouds / ash / spores: clusters of overlapping puffs sitting on the surface, so
  // the tops bulge past the silhouette at the limb. They drift faster than the ground.
  const cloudPivot = new THREE.Group();
  const cloudMat = paletteMaterial(CLOUD_FRAG, { uRamp: 'cloud' }, {
    uBands: { value: new THREE.Vector3(-0.3, 0.12, 0.42) }, uCenter: { value: new THREE.Vector3() },
  });
  const puffs = new THREE.InstancedMesh(PUFF_GEO, cloudMat, MAX_PUFFS);
  cloudPivot.add(puffs);
  group.add(cloudPivot);

  // Ring: scattered single pixels. A modifier on any biome: off, thin or wide.
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: POINTS_VERT, fragmentShader: RING_FRAG,
    uniforms: {
      uRamp: { value: resolve('ring').map((h) => new THREE.Color(h)) }, uLight: { value: LIGHT_DIR },
      uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
    },
  });
  ringMat.userData.ramps = { uRamp: 'ring' };
  const ring = new THREE.Points(new THREE.BufferGeometry(), ringMat);
  ring.rotation.set(0.2, 0, -0.32); // shallow tilt so the front lane crosses the disc
  group.add(ring);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let built = '';

  function rebuild(seed, biomeKey = 'lush', ringMode = 'thin') {
    const key = `${seed}|${biomeKey}|${ringMode}`;
    if (key === built) return;
    built = key;
    const biome = BIOMES[biomeKey];
    const rnd = mulberry32(seed * 7919 + 13);
    surfaceMat.uniforms.uBiome.value = biome.id;
    surfaceMat.uniforms.uSeedOff.value.set(rnd() * 50, rnd() * 50, rnd() * 50);
    const [s0, s1] = biome.sea ?? [0.5, 0.5];
    surfaceMat.uniforms.uSea.value = s0 + rnd() * (s1 - s0);
    const [a, b, c, g] = biome.ramps;
    surfaceMat.userData.ramps = { uA: a, uB: b, uC: c, uG: g };
    haze.visible = !!biome.haze;
    if (biome.haze) hazeMat.userData.ramps = { uHaze: biome.haze };
    const weather = WEATHER[biome.weather];
    if (weather) cloudMat.userData.ramps = { uRamp: weather.ramp };
    group.userData.depthLevel = -1; // re-tint with the new ramps

    // Noise-driven placement, like Planetarium: one fbm field makes a few big merged
    // masses, a latitude-stretched field makes long east-west streaks, and everything
    // else stays clear sky. Denser sites get bigger, higher puffs, so cores merge and
    // dome. Puffs are squashed radially so clumps hug the surface.
    let n = 0;
    const FLAT = 0.6;
    const put = (dir, size, lift) => {
      if (n >= MAX_PUFFS) return;
      const d = dir.clone().normalize();
      q.setFromUnitVectors(up, d);
      m4.compose(d.multiplyScalar(1 + size * FLAT * lift), q, new THREE.Vector3(size, size * FLAT, size));
      puffs.setMatrixAt(n++, m4);
    };
    // A lone sphere reads as a white ball, so thin weather is built as a mini-clump:
    // a lead puff plus smaller satellites beside it.
    const clump = (center, size, lift, satellites) => {
      put(center, size, lift);
      const east = new THREE.Vector3().crossVectors(up, center).normalize();
      const north = new THREE.Vector3().crossVectors(center, east);
      for (let k = 0; k < satellites; k++) {
        const ang = rnd() * Math.PI * 2;
        const off = size * (0.9 + rnd() * 0.5);
        put(center.clone().addScaledVector(east, Math.cos(ang) * off * 1.4).addScaledVector(north, Math.sin(ang) * off * 0.7), size * (0.5 + rnd() * 0.25), lift * 0.5);
      }
    };
    if (weather) {
      const massField = makeFbm3(seed * 31 + 5);
      const streakField = makeFbm3(seed * 17 + 9);
      const SITES = 1500;
      for (let i = 0; i < SITES; i++) {
        const y = 1 - ((i + 0.5) / SITES) * 2;
        const r = Math.sqrt(1 - y * y);
        const lon = i * 2.39996;
        const dir = new THREE.Vector3(Math.cos(lon) * r, y, Math.sin(lon) * r);
        const mass = massField(dir.x * 1.15 + 4, dir.y * 1.15, dir.z * 1.15);
        const streak = streakField(dir.x * 0.9, dir.y * 6.0 + 2, dir.z * 0.9);
        const density = Math.max(mass, streak) - weather.thr;
        const jitter = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.05);
        if (density > 0.012) {
          const core = Math.min(1, density * 7);
          clump(dir.add(jitter), (0.032 + core * 0.05 + rnd() * 0.012) * weather.size, (0.2 + core * 0.9) * weather.lift, core < 0.35 ? 2 + Math.floor(rnd() * 2) : 1);
        } else if (density > -0.08 && rnd() < weather.strays) {
          clump(dir.add(jitter), (0.026 + rnd() * 0.012) * weather.size, 0.3 * weather.lift, 2 + Math.floor(rnd() * 2));
        }
      }
    }
    puffs.count = n;
    puffs.instanceMatrix.needsUpdate = true;

    // Ring dust, every dot 1 internal pixel. Thin: one band. Wide (shared lib): two dense lanes.
    ring.visible = ringMode !== 'off';
    const pts = [];
    const shade = [];
    const lanes = ringMode === 'wide' ? [[1.62, 0.13, 2600], [2.12, 0.16, 2400]] : [[1.8, 0.11, 1500]];
    for (const [r0, spread, count] of lanes) {
      for (let k = 0; k < count; k++) {
        const ang = rnd() * Math.PI * 2;
        const r = r0 + (rnd() + rnd() - 1) * spread;
        pts.push(Math.cos(ang) * r, (rnd() - 0.5) * 0.012, Math.sin(ang) * r);
        shade.push(1 + Math.floor(rnd() * 3));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(new Array(shade.length).fill(1), 1));
    ring.geometry.dispose();
    ring.geometry = geo;
  }

  function update(t, spinning) {
    if (spinning) {
      surface.rotation.y = t * 0.18;
      cloudPivot.rotation.y = t * 0.24;
      ring.rotation.y = t * 0.05;
    }
    group.getWorldPosition(ringMat.uniforms.uCenter.value);
    cloudMat.uniforms.uCenter.value.copy(ringMat.uniforms.uCenter.value);
    ringMat.uniforms.uRadius.value = group.scale.x;
  }

  return { group, rebuild, update, ring };
}

// ---------------------------------------------------------------- astronaut
// One signed-distance body, raymarched inside a proxy box. Every part joins one
// surface (smooth unions), so a single lighting pass shades the whole figure. Cast
// shadows and contact occlusion come from marching the same field toward the light.
// Limbs are continuous bent tubes: shoulder->elbow->wrist and hip->knee->ankle,
// smooth-unioned so the bend has no seam. Local units: 1 tall, facing +z.
const ASTRO_FRAG = /* glsl */ `
  uniform mat4 uInvModel;
  uniform mat4 uModel;
  uniform mat4 uProj;
  uniform vec3 uLightLocal;
  uniform vec3 uJ[12]; // lS lE lW rS rE rW lH lK lA rH rK rA
  uniform vec3 uSuit[4];
  uniform vec3 uGear[4];
  uniform vec3 uAccent[4];
  uniform vec3 uVisor[2];
  uniform vec3 uGlint;
  ${EYES_GLSL}
  in vec3 vPosW;

  // Chibi: the helmet is ~55% of the figure, with a short torso and stubby limbs.
  const vec3 HEAD = vec3(0.0, 0.71, 0.0);
  const float HEAD_R = 0.27;
  const vec3 BMIN = vec3(-0.5, -0.08, -0.42);
  const vec3 BMAX = vec3(0.5, 1.06, 0.42);

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
  float limb(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1) { return smin(sdCapsule(p, a, b, r0), sdCapsule(p, b, c, r1), 0.035); }

  float dHelmet(vec3 p) { return length(p - HEAD) - HEAD_R; }
  float dTorso(vec3 p) { return sdRoundBox(p - vec3(0.0, 0.36, 0.0), vec3(0.145, 0.1, 0.115), 0.065); }
  float dPack(vec3 p) { return sdRoundBox(p - vec3(0.0, 0.38, -0.18), vec3(0.175, 0.13, 0.075), 0.04); }
  float dArm(vec3 p, int i) { return limb(p, uJ[i], uJ[i + 1], uJ[i + 2], 0.058, 0.054); }
  float dHand(vec3 p, int i) { return length(p - (uJ[i + 2] + normalize(uJ[i + 2] - uJ[i + 1]) * 0.03)) - 0.06; }
  float dLeg(vec3 p, int i) { return limb(p, uJ[i], uJ[i + 1], uJ[i + 2], 0.072, 0.066); }
  float dBoot(vec3 p, int i) { return sdRoundBox(p - (uJ[i + 2] + vec3(0.0, -0.03, 0.025)), vec3(0.062, 0.04, 0.08), 0.034); }

  float map(vec3 p) {
    float d = smin(dHelmet(p), dTorso(p), 0.04);
    d = smin(d, dPack(p), 0.015);
    for (int i = 0; i < 6; i += 3) {
      d = smin(d, dArm(p, i), 0.04);
      d = smin(d, dHand(p, i), 0.02);
      d = smin(d, dLeg(p, i + 6), 0.04);
      d = smin(d, dBoot(p, i + 6), 0.02);
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
    for (int i = 0; i < 40; i++) {
      float h = map(ro + rd * t);
      if (h < 0.002) return 0.0;
      t += max(h, 0.01);
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

  // Visor screen: a rounded rectangle in yaw/pitch about the helmet centre, ~4:3 once
  // projected onto the sphere. xy = screen uv (0..1, y down), z = superellipse value.
  vec3 visorUV(vec3 p) {
    vec3 d = normalize(p - HEAD);
    float yaw = atan(d.x, d.z);
    float pitch = asin(clamp(d.y, -1.0, 1.0)) + 0.02;
    vec2 q = vec2(yaw / 0.74, pitch / 0.54);
    return vec3(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5, pow(abs(q.x), 5.0) + pow(abs(q.y), 5.0));
  }

  // 0 suit, 1 gear, 2 accent, 3 visor
  int region(vec3 p) {
    float best = dHelmet(p);
    int id = 0;
    int part = 0; // 0 helmet 1 torso 2 pack 3 arm 4 hand 5 leg 6 boot
    float d;
    d = dTorso(p); if (d < best) { best = d; part = 1; }
    d = dPack(p); if (d < best) { best = d; part = 2; }
    int armI = 0;
    for (int i = 0; i < 6; i += 3) {
      d = dArm(p, i); if (d < best) { best = d; part = 3; armI = i; }
      d = dHand(p, i); if (d < best) { best = d; part = 4; }
      d = dLeg(p, i + 6); if (d < best) { best = d; part = 5; }
      d = dBoot(p, i + 6); if (d < best) { best = d; part = 6; }
    }
    if (part == 0) {
      float e = visorUV(p).z;
      return e < 1.0 ? 3 : e < 1.75 ? 1 : 0; // screen, then a gear-tone bezel
    }
    if (part == 1) return (p.z > 0.085 && abs(p.x) < 0.06 && abs(p.y - 0.36) < 0.032) ? 1 : 0; // chest panel
    if (part == 2) return abs(p.y - 0.43) < 0.032 ? 2 : 1; // backpack + contributor stripe
    if (part == 3) {
      // contributor shoulder band around the upper arm
      vec3 a = uJ[armI], b = uJ[armI + 1];
      float h = dot(p - a, b - a) / dot(b - a, b - a);
      return (h > 0.22 && h < 0.42) ? 2 : 0;
    }
    return part == 4 || part == 6 ? 1 : 0;
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    float t = tn;
    bool hit = false;
    for (int i = 0; i < 96; i++) {
      float h = map(ro + rd * t);
      if (h < 0.0012 * (1.0 + t)) { hit = true; break; }
      t += h;
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
      // Eyes: evaluated analytically at the hit point, glowing unlit in the contributor
      // colour; the internal-resolution render is what pixelates them.
      vec2 uv = visorUV(p).xy;
      if (eyeLit(uv)) c = uAccent[2];
      if (glintLit(uv)) c = uGlint;
    } else if (r == 2) c = uAccent[b];
    else if (r == 1) c = uGear[b];
    else c = uSuit[b];
    gl_FragColor = vec4(c, 1.0);
    vec4 clip = uProj * viewMatrix * uModel * vec4(p, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  }
`;

const PROXY_GEO = new THREE.BoxGeometry(1, 1.14, 0.84).translate(0, 0.49, 0);

function makeAstronaut(colorKey) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const joints = Array.from({ length: 12 }, () => new THREE.Vector3());
  const mat = paletteMaterial(ASTRO_FRAG, {
    uSuit: 'suit', uGear: 'gear', uAccent: `contributors.${colorKey}`, uVisor: 'visor', uGlint: 'glint',
  }, {
    uInvModel: { value: new THREE.Matrix4() }, uModel: { value: null }, uProj: { value: camera.projectionMatrix },
    uLightLocal: { value: new THREE.Vector3() }, uJ: { value: joints }, uEyes: { value: 0 }, uBlink: { value: 1 },
  }, { side: THREE.BackSide });
  const proxy = new THREE.Mesh(PROXY_GEO, mat);
  mat.uniforms.uModel.value = proxy.matrixWorld;
  body.add(proxy);

  const q = new THREE.Quaternion();
  // Relaxed float: elbows and knees softly bent; the bends breathe with the bob.
  function pose(t) {
    const bob = Math.sin(t * 1.5);
    const sway = Math.sin(t * 1.1 + 0.8);
    for (const [k, s] of [[0, -1], [3, 1]]) {
      const lift = 0.02 * Math.sin(t * 1.5 + 0.6 + s * 0.4);
      // stubby arms: the hands hang at about hip height
      joints[k].set(s * 0.165, 0.42, 0);
      joints[k + 1].set(s * (0.225 + 0.008 * bob), 0.36 + lift * 0.6, 0.03);
      joints[k + 2].set(s * (0.24 + 0.01 * bob), 0.29 + lift * 1.2, 0.08 + 0.008 * sway);
    }
    for (const [k, s, bend] of [[6, -1, 1], [9, 1, 0.6]]) {
      // short legs, about a fifth of the height; knee bend scaled to the shorter tube
      const kb = bend * (0.025 + 0.01 * Math.sin(t * 1.5 + s));
      joints[k].set(s * 0.075, 0.25, 0);
      joints[k + 1].set(s * 0.085, 0.17, 0.02 + kb);
      joints[k + 2].set(s * 0.08, 0.1 + kb * 0.3, -0.01 + kb * 0.15);
    }
  }

  function update(t) {
    const p = t + root.userData.phase;
    body.position.y = Math.sin(p * 1.5) * 0.05;
    body.rotation.z = Math.sin(p * 1.1) * 0.07;
    body.rotation.x = Math.sin(p * 0.9) * 0.05;
    pose(p);
    mat.uniforms.uBlink.value = blink(p);
    root.updateMatrixWorld(true);
    mat.uniforms.uInvModel.value.copy(proxy.matrixWorld).invert();
    proxy.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    mat.uniforms.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
  }
  function setColor(key) {
    mat.userData.ramps.uAccent = `contributors.${key}`;
    root.userData.depthLevel = -1; // force a re-tint
  }
  function setFace(idx) {
    mat.uniforms.uEyes.value = idx;
  }
  // Occasional blink: a quick Y-squash of the eyes, staggered per astronaut.
  const BLINK_PERIOD = 4.3;
  const BLINK_LEN = 0.18;
  function blink(p) {
    const k = ((p * 1.0 + root.userData.phase * 0.37) % BLINK_PERIOD + BLINK_PERIOD) % BLINK_PERIOD;
    if (k > BLINK_LEN) return 1;
    return 1 - Math.sin((k / BLINK_LEN) * Math.PI) * 0.88;
  }
  root.userData.phase = 0; // callers stagger this so the crew doesn't bob in sync
  return { group: root, update, setColor, setFace };
}

// ---------------------------------------------------------------- sky
// Screen-space background bands (top -> bottom), drawn behind everything. Hard
// steps, no smooth gradient; stars and the scene draw over it.
const SKY_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uBands[3];
  uniform float uHeight;
  void main() {
    float y = 1.0 - gl_FragCoord.y / uHeight; // 0 at the top
    gl_FragColor = vec4(uBands[y < 0.66 ? 0 : y < 0.88 ? 1 : 2], 1.0); // low bands keep it subtle, not a horizon
  }
`;
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uBands: { value: resolve('spaceBands').map((h) => new THREE.Color(h)) }, uHeight: { value: 180 } },
  });
  mat.userData.ramps = { uBands: 'spaceBands' };
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  return sky;
}

// ---------------------------------------------------------------- stars
function makeStars() {
  const rnd = mulberry32(4242);
  const pts = [];
  const shade = [];
  const sizes = [];
  for (let i = 0; i < 1400; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * s * 500, u * 500, Math.sin(a) * s * 500);
    const r = rnd();
    shade.push(r < 0.62 ? 0 : r < 0.9 ? 1 : 2);
    sizes.push(1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: POINTS_VERT, fragmentShader: STAR_FRAG, depthWrite: false,
    uniforms: { uRamp: { value: resolve('stars').map((h) => new THREE.Color(h)) } },
  });
  mat.userData.ramps = { uRamp: 'stars' };
  const stars = new THREE.Points(g, mat);
  stars.renderOrder = -1;
  return stars;
}

// ---------------------------------------------------------------- world
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const sky = makeSky();
scene.add(sky);
const stars = makeStars();
scene.add(stars);

// Hero planet at the origin, plus mid, far and silhouette copies (same seed) to prove depth.
const planets = [
  { pos: [0, 0, 0] },
  { pos: [-6.5, 1.2, -13] },
  { pos: [9, 2.2, -27] },
  { pos: [-13, 5, -40] },
].map(({ pos }) => {
  const p = makePlanet();
  p.group.position.set(...pos);
  scene.add(p.group);
  return p;
});

// Crew line-up for the close-up, off to the side of the hero planet.
const CREW_SPOT = new THREE.Vector3(-1.35, -0.2, 4.6); // in front of the hero planet, so one shot shows crew + planet + depth
const crew = CONTRIBUTOR_KEYS.map((key, i) => {
  const a = makeAstronaut(key);
  a.group.position.set(CREW_SPOT.x + (i - 1) * 0.72, CREW_SPOT.y, CREW_SPOT.z);
  a.group.rotation.y = [0.4, 0.05, -0.4][i];
  a.userData = { color: key };
  a.group.userData.phase = i * 1.7;
  scene.add(a.group);
  return a;
});

// Solo astronauts at the mid, far and silhouette steps (the crew covers near); they wear the selected contributor colour.
const solos = [
  { pos: [4.6, -0.4, -8], ry: -0.3 },
  { pos: [-1.5, 2.6, -21], ry: 0.4 },
  { pos: [6.5, 4.2, -38], ry: -0.5 },
].map(({ pos, ry }, i) => {
  const a = makeAstronaut('coral');
  a.userData = { color: null }; // follows state.color
  a.group.position.set(...pos);
  a.group.rotation.y = ry;
  a.group.userData.phase = 0.6 + i * 2.3;
  scene.add(a.group);
  return a;
});

// System scene: mixed biomes, sizes (size ~ LOC) and depths with the crew in front.
// Hidden unless the 'system' view is active; it previews the GIF composition.
const SYSTEM = [
  { biome: 'lush', seed: 7, size: 1.0, ring: 'thin', pos: [0.75, 0.15, 0] },
  { biome: 'gas', seed: 5, size: 2.2, ring: 'off', pos: [-10.5, 2.4, -17] },
  { biome: 'ice', seed: 21, size: 0.62, ring: 'off', pos: [5.4, 0.1, -3.2] },
  { biome: 'lava', seed: 11, size: 0.7, ring: 'off', pos: [3.3, -0.9, 0.9] },
  { biome: 'desert', seed: 3, size: 0.85, ring: 'wide', pos: [-1.0, 3.4, -9] },
  { biome: 'ocean', seed: 42, size: 1.25, ring: 'off', pos: [7.2, 3.6, -19] },
  { biome: 'moon', seed: 9, size: 0.28, ring: 'off', pos: [2.15, 1.3, -0.5] },
  { biome: 'toxic', seed: 13, size: 1.1, ring: 'off', pos: [13, 1.2, -36] },
].map((cfg) => {
  const p = makePlanet();
  p.rebuild(cfg.seed, cfg.biome, cfg.ring);
  p.group.position.set(...cfg.pos);
  p.group.scale.setScalar(cfg.size);
  scene.add(p.group);
  return p;
});

const VIEWS = {
  planet: { pos: [1.3, 0.75, 3.9], target: [0, 0, 0] },
  studio: { pos: [1.55, 0.9, 5.4], target: [0, 0, 0], scene: 'solo' }, // hero planet alone, for biome sheets
  system: { pos: [0.1, 1.3, 10.2], target: [-0.4, 0.4, -6], scene: 'system' },
  crew: { pos: [CREW_SPOT.x + 0.35, CREW_SPOT.y + 0.95, CREW_SPOT.z + 2.7], target: [CREW_SPOT.x, CREW_SPOT.y + 0.52, CREW_SPOT.z] },
  depth: { pos: [0.1, 1.2, 9.6], target: [-0.3, 0.3, -6] },
  face: { pos: [CREW_SPOT.x + 0.08, CREW_SPOT.y + 0.8, CREW_SPOT.z + 1.15], target: [CREW_SPOT.x, CREW_SPOT.y + 0.62, CREW_SPOT.z] }, // head close-up (mint)
};

// ---------------------------------------------------------------- state
const state = {
  view: 'planet', seed: 7, biome: 'lush', size: 1, ringMode: 'thin', color: 'coral', pixelH: 180, depth: true, spin: true,
  time: null, ui: true, palette: 'final', eyes: 'auto',
};

function applyView(name) {
  const v = VIEWS[name];
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
}

function resize() {
  const h = state.pixelH;
  const w = Math.floor((h * 16) / 9); // floor so e.g. 240 tall -> 426 wide still fits x3 on 1280
  renderer.setSize(w, h, false);
  sky.material.uniforms.uHeight.value = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / w, innerHeight / h)));
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  const readout = document.getElementById('pixel-readout');
  if (readout) readout.textContent = `${w}×${h} ×${scale}`;
}

function applyState() {
  planets.forEach((p) => {
    p.rebuild(state.seed, state.biome, state.ringMode);
    p.group.scale.setScalar(state.size);
  });
  // Which objects a view shows: showcase (hero + depth copies + crew), solo planet, or the system.
  const sceneMode = VIEWS[state.view]?.scene ?? 'showcase';
  planets.forEach((p, i) => (p.group.visible = sceneMode === 'showcase' || (sceneMode === 'solo' && i === 0)));
  SYSTEM.forEach((p) => (p.group.visible = sceneMode === 'system'));
  crew.forEach((a) => (a.group.visible = sceneMode !== 'solo'));
  solos.forEach((a) => (a.group.visible = sceneMode === 'showcase'));
  if (state.palette !== paletteName) {
    paletteName = state.palette;
    scene.traverse((o) => { if (o.userData.depthLevel !== undefined) o.userData.depthLevel = -1; }); // force a re-tint
  }
  renderer.setClearColor(resolve('space'));
  document.body.style.background = resolve('space');
  solos.forEach((s) => s.setColor(state.color));
  // Faces: hashed from each contributor's handle unless the UI overrides the eye design.
  for (const a of [...crew, ...solos]) {
    a.setFace(state.eyes === 'auto' ? eyesFor(HANDLES[a.userData.color ?? state.color]) : +state.eyes);
  }
  document.getElementById('ui').hidden = !state.ui;
  resize();
}

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function frame() {
  const t = state.time ?? clock.getElapsedTime();
  controls.update();
  stars.position.copy(camera.position);
  [...planets, ...SYSTEM].forEach((p) => p.update(t, state.spin));
  [...crew, ...solos].forEach((a) => a.update(t));
  setDepthLevel(stars, 0); // stars and sky never fade, but still follow palette switches
  setDepthLevel(sky, 0);
  for (const obj of [...planets, ...SYSTEM, ...crew, ...solos].map((o) => o.group)) {
    const d = camera.position.distanceTo(obj.getWorldPosition(tmp));
    const level = !state.depth ? 0 : DEPTH_RANGES.filter((r) => d >= r).length;
    setDepthLevel(obj, level);
  }
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);

// ---------------------------------------------------------------- UI
function bindUi() {
  const $ = (id) => document.getElementById(id);
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { state.view = b.dataset.view; applyView(state.view); applyState(); });
  $('seed').addEventListener('input', (e) => { state.seed = +e.target.value; $('seed-readout').textContent = state.seed; applyState(); });
  $('reseed').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 999); $('seed').value = state.seed; $('seed-readout').textContent = state.seed; applyState(); });
  $('ring').addEventListener('change', (e) => { state.ringMode = e.target.value; applyState(); });
  for (const [key, b] of Object.entries(BIOMES)) $('biome').add(new Option(b.label, key));
  $('biome').addEventListener('change', (e) => { state.biome = e.target.value; applyState(); });
  $('size').addEventListener('input', (e) => { state.size = +e.target.value / 100; $('size-readout').textContent = state.size.toFixed(2); applyState(); });
  $('color').addEventListener('change', (e) => { state.color = e.target.value; applyState(); });
  $('pixel').addEventListener('input', (e) => { state.pixelH = +e.target.value; applyState(); });
  $('depth').addEventListener('change', (e) => { state.depth = e.target.checked; applyState(); });
  $('spin').addEventListener('change', (e) => { state.spin = e.target.checked; });
  $('palette').addEventListener('change', (e) => { state.palette = e.target.value; applyState(); });
  const fill = (sel, items, label) => items.forEach((v, i) => sel.add(new Option(label(v), String(i))));
  fill($('eyes'), EYE_DESIGNS, (d) => d.name);
  // Published palettes: the 25 contact-sheet picks, then the spares.
  for (const [label, slugs] of [['lospec (contact sheet)', LOSPEC_ORDER], ['lospec (spares)', SPARES]]) {
    const group = document.createElement('optgroup');
    group.label = label;
    slugs.forEach((slug, i) => group.append(new Option(`${label.includes('sheet') ? `${String(i + 1).padStart(2, '0')} ` : ''}${LOSPEC[slug].name}`, `lospec:${slug}`)));
    $('palette').append(group);
  }
  $('eyes').addEventListener('change', (e) => { state.eyes = e.target.value; applyState(); });
  addEventListener('resize', resize);
}

bindUi();
applyView(state.view);
applyState();
document.getElementById('palette').value = state.palette;

// Hook for the screenshot script: set state, pin time, render one frame synchronously.
window.viewer = {
  ready: true,
  set(opts) {
    Object.assign(state, opts);
    if (opts.view) applyView(opts.view);
    if (opts.camera) {
      camera.position.set(...opts.camera.pos);
      controls.target.set(...opts.camera.target);
      controls.update();
    }
    applyState();
    frame();
    frame(); // second pass so depth tints set during the first one are drawn
  },
};
