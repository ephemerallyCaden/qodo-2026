// Codebase Space Explorer: batch 1 asset viewer.
// Every asset is a live three.js mesh with flat, banded toon shading. The scene
// is rendered at a low internal resolution and upscaled by an integer factor
// with nearest-neighbour, so pixels stay crisp. There's no dithering and no outline.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

THREE.ColorManagement.enabled = false; // palette hexes go to the screen untouched

// ---------------------------------------------------------------- palette
// Planetarium-style pastels on plum-grey space. Ramps run dark -> light.
export const PALETTE = {
  space: '#2b2535',
  stars: ['#5d5372', '#a99cbf', '#f4ecf7'],
  ocean: ['#2f3a62', '#3f5794', '#5a7fc0', '#80a9dc', '#acd3ee'],
  land: ['#33504a', '#4c7a5a', '#6fa36a', '#9cc678', '#cfe39a'],
  cap: ['#6e6a86', '#b9b3c9', '#e6e0ee', '#fbf8ff'],
  cloud: ['#6e6274', '#b39c94', '#e3cdb0', '#fff6e4'],
  ring: ['#5d4e72', '#8f7fae', '#d8a9b8', '#f2d6b3'],
  suit: ['#68718f', '#a3aec8', '#d3dcea', '#f2f6fc'], // cool white
  gear: ['#4a5170', '#77819f', '#a2adc6', '#c4cee0'], // gloves, boots, backpack
  visor: ['#0f1329', '#232f58'], // near-black blue, two tones
  glint: '#f4f8ff',
};
export const CONTRIBUTORS = {
  coral: ['#6e3a4c', '#b85c66', '#f08e7f', '#ffc4a8'],
  mint: ['#2c5a5a', '#3f9886', '#6fd1b0', '#bff2da'],
  lilac: ['#433a74', '#7563bd', '#a993ec', '#dccfff'],
};

// Depth darkening: each colour has fixed darker steps toward a cool space tone.
// Level 0 is near (unchanged), level 1 is mid (about -35% value), level 2 is far (about -70%).
// Level 3 (furthest) collapses to a near-black silhouette that keeps a faint pastel hint.
const DEPTH_STEPS = [
  [new THREE.Color('#262a46'), 0],
  [new THREE.Color('#262a46'), 0.35],
  [new THREE.Color('#262a46'), 0.7],
  [new THREE.Color('#110f18'), 0.88],
];
const DEPTH_RANGES = [12, 26, 44]; // camera distances at which an object drops a level
const depthCache = new Map();
function depthColor(hex, level) {
  const key = `${hex}:${level}`;
  const [tint, t] = DEPTH_STEPS[level];
  if (!depthCache.has(key)) depthCache.set(key, new THREE.Color(hex).lerp(tint, t));
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
    vec3 n = normalize(normalize(vNormalW) * 0.85 + normalize(vPosW - uCenter) * 0.55);
    gl_FragColor = vec4(uRamp[band(n)], 1.0);
  }
`;

const PLANET_FRAG = /* glsl */ `
  ${NOISE}
  ${BANDS}
  uniform vec3 uOcean[5];
  uniform vec3 uLand[5];
  uniform vec3 uCap[4];
  uniform vec3 uSeedOff;
  uniform float uSea;
  in vec3 vNormalW;
  in vec3 vLocal;
  void main() {
    vec3 p = normalize(vLocal);
    int b = band(normalize(vNormalW));
    float h = fbm(p * 1.6 + uSeedOff) + (fbm(p * 4.1 + uSeedOff.zxy) - 0.5) * 0.22;
    vec3 c;
    if (h < uSea) c = uOcean[min(b + (h > uSea - 0.04 ? 1 : 0), 4)];
    else c = uLand[min(b + (h > uSea + 0.11 ? 1 : 0), 4)];
    float lat = abs(p.y) + (fbm(p * 3.0 + uSeedOff) - 0.5) * 0.25;
    if (lat > 0.9) c = uCap[b];
    gl_FragColor = vec4(c, 1.0);
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

// A material whose colour ramps can be re-tinted for depth. `ramps` maps uniform -> hex list.
function paletteMaterial(frag, ramps, extra = {}, opts = {}) {
  const uniforms = { uLight: { value: LIGHT_DIR }, uBands: { value: new THREE.Vector3(-0.08, 0.28, 0.62) }, ...extra };
  for (const [name, hexes] of Object.entries(ramps)) {
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
      for (const [name, hexes] of Object.entries(m.userData.ramps ?? {})) {
        const arr = m.uniforms[name].value;
        if (Array.isArray(arr)) hexes.forEach((h, i) => arr[i].copy(depthColor(h, level)));
        else arr.copy(depthColor(hexes, level));
      }
    }
  });
}

// ---------------------------------------------------------------- planet
const PLANET_GEO = new THREE.SphereGeometry(1, 72, 48);
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 3);
const MAX_PUFFS = 700;

function makePlanet() {
  const group = new THREE.Group();
  const surfaceMat = paletteMaterial(PLANET_FRAG, { uOcean: PALETTE.ocean, uLand: PALETTE.land, uCap: PALETTE.cap }, {
    uSeedOff: { value: new THREE.Vector3() }, uSea: { value: 0.5 },
    uBands: { value: new THREE.Vector3(0.2, 0.58, 0.86) }, // high bands curve into crescents
  });
  const surface = new THREE.Mesh(PLANET_GEO, surfaceMat);
  group.add(surface);

  // Clouds: clusters of overlapping puffs sitting on the surface, so the tops bulge
  // past the silhouette at the limb. They rotate a little faster than the ground.
  const cloudPivot = new THREE.Group();
  const cloudMat = paletteMaterial(CLOUD_FRAG, { uRamp: PALETTE.cloud }, {
    uBands: { value: new THREE.Vector3(-0.3, 0.12, 0.42) }, uCenter: { value: new THREE.Vector3() },
  });
  const puffs = new THREE.InstancedMesh(PUFF_GEO, cloudMat, MAX_PUFFS);
  cloudPivot.add(puffs);
  group.add(cloudPivot);

  // Ring: scattered single pixels in banded lanes.
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: POINTS_VERT, fragmentShader: RING_FRAG,
    uniforms: {
      uRamp: { value: PALETTE.ring.map((h) => new THREE.Color(h)) }, uLight: { value: LIGHT_DIR },
      uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
    },
  });
  ringMat.userData.ramps = { uRamp: PALETTE.ring };
  const ring = new THREE.Points(new THREE.BufferGeometry(), ringMat);
  ring.rotation.set(0.2, 0, -0.32); // shallow tilt so the front lane crosses the disc
  group.add(ring);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  function rebuild(seed) {
    const rnd = mulberry32(seed * 7919 + 13);
    surfaceMat.uniforms.uSeedOff.value.set(rnd() * 50, rnd() * 50, rnd() * 50);
    surfaceMat.uniforms.uSea.value = 0.47 + rnd() * 0.08;

    // Cloud heaps: a base row of puffs stretched east-west, a few stacked on top,
    // and some small strays. Mostly in two latitude belts.
    let n = 0;
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5; // roughly -1..1, centre-weighted
    // Puffs are squashed along the radial axis so clumps hug the surface; the
    // domed centre still pokes past the silhouette at the limb.
    const FLAT = 0.6;
    const put = (dir, size, lift) => {
      if (n >= MAX_PUFFS) return;
      const d = dir.clone().normalize();
      q.setFromUnitVectors(up, d);
      m4.compose(d.multiplyScalar(1 + size * FLAT * lift), q, new THREE.Vector3(size, size * FLAT, size));
      puffs.setMatrixAt(n++, m4);
    };
    // Stratified placement: jittered golden-spiral sites, kept more often in two
    // latitude belts, so every face of the planet gets weather.
    const SITES = 150;
    for (let c = 0; c < SITES; c++) {
      const y = 1 - ((c + 0.5) / SITES) * 2;
      const lon = c * 2.39996 + rnd() * 0.4;
      const lat = Math.asin(y) + (rnd() - 0.5) * 0.15;
      const belt = Math.exp(-(((Math.abs(lat) - 0.5) / 0.3) ** 2));
      if (rnd() > 0.2 + belt * 0.45) continue;
      const center = new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
      const east = new THREE.Vector3().crossVectors(up, center).normalize();
      const north = new THREE.Vector3().crossVectors(center, east);
      const len = 0.05 + rnd() * 0.14; // east-west half-length
      const wid = len * (0.5 + rnd() * 0.3);
      const count = 3 + Math.floor(rnd() * 4 + len * 25);
      for (let k = 0; k < count; k++) {
        const ex = gauss();
        const nx = gauss();
        const centrality = 1 - Math.min(1, Math.hypot(ex, nx));
        const size = 0.034 + rnd() * 0.024 + centrality * 0.034;
        put(center.clone().addScaledVector(east, ex * len).addScaledVector(north, nx * wid), size, 0.2 + centrality * 0.8);
      }
    }
    puffs.count = n;
    puffs.instanceMatrix.needsUpdate = true;

    // ring dust
    const pts = [];
    const shade = [];
    const sizes = [];
    // One thin band, densest in the middle, every dot 1 internal pixel.
    for (let k = 0; k < 1500; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 1.8 + (rnd() + rnd() - 1) * 0.11;
      pts.push(Math.cos(a) * r, (rnd() - 0.5) * 0.012, Math.sin(a) * r);
      shade.push(1 + Math.floor(rnd() * 3));
      sizes.push(1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    ring.geometry.dispose();
    ring.geometry = g;
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
  in vec3 vPosW;

  const vec3 HEAD = vec3(0.0, 0.79, 0.0);
  const vec3 BMIN = vec3(-0.5, -0.08, -0.42);
  const vec3 BMAX = vec3(0.5, 1.06, 0.42);

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
  float limb(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1) { return smin(sdCapsule(p, a, b, r0), sdCapsule(p, b, c, r1), 0.035); }

  float dHelmet(vec3 p) { return length(p - HEAD) - 0.21; }
  float dTorso(vec3 p) { return sdRoundBox(p - vec3(0.0, 0.47, 0.0), vec3(0.17, 0.155, 0.13), 0.075); }
  float dPack(vec3 p) { return sdRoundBox(p - vec3(0.0, 0.53, -0.2), vec3(0.205, 0.19, 0.085), 0.045); }
  float dArm(vec3 p, int i) { return limb(p, uJ[i], uJ[i + 1], uJ[i + 2], 0.062, 0.056); }
  float dHand(vec3 p, int i) { return length(p - (uJ[i + 2] + normalize(uJ[i + 2] - uJ[i + 1]) * 0.035)) - 0.066; }
  float dLeg(vec3 p, int i) { return limb(p, uJ[i], uJ[i + 1], uJ[i + 2], 0.078, 0.07); }
  float dBoot(vec3 p, int i) { return sdRoundBox(p - (uJ[i + 2] + vec3(0.0, -0.03, 0.025)), vec3(0.066, 0.045, 0.088), 0.036); }

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
      float c = dot(normalize(p - HEAD), normalize(vec3(0.0, -0.08, 1.0)));
      return c > 0.64 ? 3 : c > 0.56 ? 1 : 0; // visor, then a gear-tone rim
    }
    if (part == 1) return (p.z > 0.1 && abs(p.x) < 0.07 && abs(p.y - 0.5) < 0.04) ? 1 : 0; // chest panel
    if (part == 2) return abs(p.y - 0.6) < 0.036 ? 2 : 1; // backpack + contributor stripe
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
      if (dot(refl, L) > 0.955 && b >= 1) c = uGlint;
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
    uSuit: PALETTE.suit, uGear: PALETTE.gear, uAccent: CONTRIBUTORS[colorKey], uVisor: PALETTE.visor, uGlint: PALETTE.glint,
  }, {
    uInvModel: { value: new THREE.Matrix4() }, uModel: { value: null }, uProj: { value: camera.projectionMatrix },
    uLightLocal: { value: new THREE.Vector3() }, uJ: { value: joints },
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
      joints[k].set(s * 0.2, 0.585, 0);
      joints[k + 1].set(s * (0.3 + 0.012 * bob), 0.47 + lift, 0.035);
      joints[k + 2].set(s * (0.325 + 0.015 * bob), 0.37 + lift * 2, 0.11 + 0.01 * sway);
    }
    for (const [k, s, bend] of [[6, -1, 1], [9, 1, 0.6]]) {
      const kb = bend * (0.05 + 0.02 * Math.sin(t * 1.5 + s));
      joints[k].set(s * 0.085, 0.32, 0);
      joints[k + 1].set(s * 0.1, 0.19, 0.03 + kb);
      joints[k + 2].set(s * 0.095, 0.07 + kb * 0.4, -0.02 + kb * 0.2);
    }
  }

  function update(t) {
    const p = t + root.userData.phase;
    body.position.y = Math.sin(p * 1.5) * 0.05;
    body.rotation.z = Math.sin(p * 1.1) * 0.07;
    body.rotation.x = Math.sin(p * 0.9) * 0.05;
    pose(p);
    root.updateMatrixWorld(true);
    mat.uniforms.uInvModel.value.copy(proxy.matrixWorld).invert();
    proxy.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    mat.uniforms.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
  }
  function setColor(key) {
    mat.userData.ramps.uAccent = CONTRIBUTORS[key];
    root.userData.depthLevel = -1; // force a re-tint
  }
  root.userData.phase = 0; // callers stagger this so the crew doesn't bob in sync
  return { group: root, update, setColor };
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
    uniforms: { uRamp: { value: PALETTE.stars.map((h) => new THREE.Color(h)) } },
  });
  const stars = new THREE.Points(g, mat);
  stars.renderOrder = -1;
  return stars;
}

// ---------------------------------------------------------------- world
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(PALETTE.space);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

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
const CREW_SPOT = new THREE.Vector3(14, 0, 0);
const crew = Object.keys(CONTRIBUTORS).map((key, i) => {
  const a = makeAstronaut(key);
  a.group.position.set(CREW_SPOT.x + (i - 1) * 0.72, CREW_SPOT.y, CREW_SPOT.z);
  a.group.rotation.y = [0.6, 0.2, -0.55][i];
  a.group.userData.phase = i * 1.7;
  scene.add(a.group);
  return a;
});

// Solo astronauts at each depth step; they wear the selected contributor colour.
const solos = [
  { pos: [-0.95, 0.55, 5.0], ry: 0.6 },
  { pos: [4.6, -0.4, -8], ry: -0.3 },
  { pos: [-1.5, 2.6, -21], ry: 0.4 },
  { pos: [6.5, 4.2, -38], ry: -0.5 },
].map(({ pos, ry }, i) => {
  const a = makeAstronaut('coral');
  a.group.position.set(...pos);
  a.group.rotation.y = ry;
  a.group.userData.phase = 0.6 + i * 2.3;
  scene.add(a.group);
  return a;
});

const VIEWS = {
  planet: { pos: [1.3, 0.75, 3.9], target: [0, 0, 0] },
  crew: { pos: [CREW_SPOT.x + 0.35, 0.95, 2.7], target: [CREW_SPOT.x, 0.52, 0] },
  depth: { pos: [0.6, 1.4, 8.2], target: [0, 0.4, -9] },
};

// ---------------------------------------------------------------- state
const state = { view: 'planet', seed: 7, ring: true, color: 'coral', pixelH: 180, depth: true, spin: true, time: null, ui: true };
let lastSeed = -1;

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
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / w, innerHeight / h)));
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  const readout = document.getElementById('pixel-readout');
  if (readout) readout.textContent = `${w}×${h} ×${scale}`;
}

function applyState() {
  if (state.seed !== lastSeed) {
    planets.forEach((p) => p.rebuild(state.seed));
    lastSeed = state.seed;
  }
  planets.forEach((p) => (p.ring.visible = state.ring));
  solos.forEach((s) => s.setColor(state.color));
  document.getElementById('ui').hidden = !state.ui;
  resize();
}

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function frame() {
  const t = state.time ?? clock.getElapsedTime();
  controls.update();
  stars.position.copy(camera.position);
  planets.forEach((p) => p.update(t, state.spin));
  [...crew, ...solos].forEach((a) => a.update(t));
  for (const obj of [...planets.map((p) => p.group), ...crew.map((a) => a.group), ...solos.map((a) => a.group)]) {
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
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { state.view = b.dataset.view; applyView(state.view); });
  $('seed').addEventListener('input', (e) => { state.seed = +e.target.value; $('seed-readout').textContent = state.seed; applyState(); });
  $('reseed').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 999); $('seed').value = state.seed; $('seed-readout').textContent = state.seed; applyState(); });
  $('ring').addEventListener('change', (e) => { state.ring = e.target.checked; applyState(); });
  $('color').addEventListener('change', (e) => { state.color = e.target.value; applyState(); });
  $('pixel').addEventListener('input', (e) => { state.pixelH = +e.target.value; applyState(); });
  $('depth').addEventListener('change', (e) => { state.depth = e.target.checked; applyState(); });
  $('spin').addEventListener('change', (e) => { state.spin = e.target.checked; });
  addEventListener('resize', resize);
}

bindUi();
applyView(state.view);
applyState();

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
