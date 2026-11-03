// Codebase Space Explorer — Day 1 hype loop.
// three.js renders the system at 320x180 into a render target; a post pass adds
// the starfield, fog of war and a hard palette snap; a 2D canvas then draws the
// pixel sprites and HUD. Everything is a pure function of the frame index.
import * as THREE from 'three';
import { BIG, MICRO, drawText, textWidth } from './font.js';
import { ASTRO_FRAMES, ASTRO_W, ASTRO_H, drawSprite } from './sprites.js';

const W = 320;
const H = 180;
const FPS = 20; // 5 cs GIF delay, exact
const FRAMES = 120; // 6 s loop
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palette
const P = {
  void: '#07061a', navy: '#0e0c2b', indigo: '#1a1540', plum: '#2a1d5c', violet: '#3d2a78',
  lavDark: '#5a3b96', lav: '#8a5cc2',
  blueDark: '#1b2a5e', blue: '#2c4a8e', sky: '#4a7cc4', skyLight: '#8fc0ee', ice: '#e4f3ff',
  hot: '#fffbe0', yellow: '#ffe27a', orange: '#ffb347', ember: '#ef6b3a', crimson: '#b23a48', maroon: '#6b1f45',
  mint: '#2fe6a8', mintLight: '#b4ffe0', mintDark: '#138a76',
  pink: '#ff6fae', magenta: '#c43f8f',
  fog0: '#100f26', fog1: '#1c1d3a', fog2: '#2e3254', fog3: '#4b5278',
  white: '#f2f0ff', dim: '#9a94c4',
};
const PAL_KEYS = Object.keys(P);
const col = (k) => new THREE.Color(P[k]);
const rampOf = (keys) => {
  const arr = keys.map(col);
  while (arr.length < 8) arr.push(arr[arr.length - 1]);
  return { value: arr };
};

// ---------------------------------------------------------------- timeline
// u = loop phase in [0, 1). Frame 100 == frame 0.
const T = {
  reviewEnd: 0.22, // meter fills while Qodo reviews
  revealStart: 0.25,
  revealEnd: 0.47,
  toastIn: 0.24,
  toastOut: 0.74,
  returnStart: 0.8, // fog drifts back for the next PR
  returnEnd: 0.99,
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// Fog arc: angles (atan2(z, x) on the orbital plane) in [FOG_LO, fogHi(u)] are
// hidden. The reveal pulls the upper edge back across infra/.
const FOG_LO = -2.05;
const FOG_CLOSED = 0.3;
const FOG_OPEN = -0.6;
const revealAmount = (u) => smooth(T.revealStart, T.revealEnd, u) * (1 - smooth(T.returnStart, T.returnEnd, u));
const fogHi = (u) => FOG_CLOSED + (FOG_OPEN - FOG_CLOSED) * revealAmount(u);
const meterValue = (u) => {
  const lo = 0.34;
  const hi = 0.92;
  if (u < T.reviewEnd) return lo + (hi - lo) * smooth(0.02, T.reviewEnd, u);
  return hi - (hi - lo) * smooth(T.returnStart + 0.04, T.returnEnd, u);
};

// ---------------------------------------------------------------- GLSL
const GLSL_COMMON = /* glsl */ `
  float bayer4(vec2 fc) {
    ivec2 p = ivec2(mod(fc, 4.0));
    const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    return (m[p.x + p.y * 4] + 0.5) / 16.0;
  }
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s / 0.9375;
  }
  // Worley distance (F1) for craters.
  float worley(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d = 9.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 o = vec3(hash13(i + g), hash13(i + g + 7.7), hash13(i + g + 3.1));
      d = min(d, length(g + o - f));
    }
    return d;
  }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
`;

const GLSL_RAMP = /* glsl */ `
  uniform vec3 uRamp[8];
  uniform int uRampN;
  vec3 ramp(float v, float dith) {
    float x = clamp(v, 0.0, 1.0) * float(uRampN - 1);
    int i = int(floor(x + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5) * dith));
    return uRamp[clamp(i, 0, uRampN - 1)];
  }
`;

const PLANET_VERT = /* glsl */ `
  out vec3 vLocal;
  out vec3 vNormalW;
  out vec3 vPosW;
  void main() {
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Planet surfaces. Each returns a ramp value in [0, 1]; lighting from the star at the origin.
const PLANET_FRAG = /* glsl */ `
  ${GLSL_COMMON}
  ${GLSL_RAMP}
  in vec3 vLocal;
  in vec3 vNormalW;
  in vec3 vPosW;
  uniform float uSpin;
  uniform float uSeed;
  uniform int uType;
  uniform vec3 uGlow[3];
  uniform vec3 uCam;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 l = normalize(normalize(-vPosW) + 0.9 * normalize(uCam - vPosW));
    float lam = dot(n, l);
    float light = smoothstep(-0.25, 0.85, lam);
    vec3 p = rotY(normalize(vLocal), uSpin) + uSeed;
    float v;
    vec3 outCol;
    if (uType == 0) {
      // lava: dark crust, glowing ridged cracks (emissive, ignore light)
      float crust = fbm(p * 2.2);
      float ridge = 1.0 - abs(vnoise(p * 3.4) * 2.0 - 1.0);
      
      v = crust * 0.3 + light * 0.85 - 0.12;
      outCol = ramp(v, 0.9);
      float b = bayer4(gl_FragCoord.xy);
      if (ridge > 0.93 + b * 0.03) outCol = ridge > 0.975 ? uGlow[2] : uGlow[1];
      else if (ridge > 0.89 + b * 0.03) outCol = uGlow[0];
    } else if (uType == 1) {
      // gas giant: warped latitude bands
      float warp = fbm(p * 1.6) * 1.4;
      float band = sin(p.y * 9.0 + warp * 2.2) * 0.5 + 0.5;
      float storm = smoothstep(0.24, 0.12, length((normalize(vLocal) - normalize(vec3(0.6, -0.25, 0.75)))) );
      v = band * 0.38 + light * 0.8 - 0.18;
      outCol = ramp(v, 0.8);
      if (storm > 0.5 && light > 0.3) outCol = uGlow[storm > 0.85 ? 1 : 0];
    } else if (uType == 2) {
      // rocky: terrain + craters
      float terr = fbm(p * 2.6);
      float w = worley(p * 2.4);
      float rim = smoothstep(0.30, 0.38, w) * smoothstep(0.48, 0.38, w);
      float pit = smoothstep(0.32, 0.18, w);
      v = terr * 0.4 + light * 0.75 - 0.2 + rim * 0.22 - pit * 0.18;
      outCol = ramp(v, 0.8);
    } else if (uType == 3) {
      // ice: pale fbm, bright caps, crack lines
      float terr = fbm(p * 3.0);
      float caps = smoothstep(0.55, 0.75, abs(normalize(vLocal).y));
      float crack = 1.0 - abs(vnoise(p * 4.0) * 2.0 - 1.0);
      v = terr * 0.3 + light * 0.8 - 0.12 + caps * 0.3 - step(0.93, crack) * 0.25;
      outCol = ramp(v, 0.8);
    } else {
      // toxic: swirled bands (always fogged, but give it a real look)
      float t = fbm(p * 2.0 + fbm(p * 3.0));
      v = t * 0.4 + light * 0.75 - 0.15;
      outCol = ramp(v, 0.8);
    }
    gl_FragColor = vec4(outCol, 1.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  ${GLSL_COMMON}
  ${GLSL_RAMP}
  in vec3 vLocal;
  in vec3 vNormalW;
  in vec3 vPosW;
  uniform float uSpin;
  uniform vec3 uLoop;
  uniform vec3 uCam;
  void main() {
    vec3 p = rotY(normalize(vLocal), uSpin);
    float g = fbm(p * 3.2 + uLoop);
    float limb = dot(normalize(vNormalW), normalize(uCam - vPosW));
    float v = g * 0.75 + smoothstep(0.05, 0.8, limb) * 0.5 - 0.18;
    gl_FragColor = vec4(ramp(v, 1.0), 1.0);
  }
`;

const CORONA_FRAG = /* glsl */ `
  ${GLSL_COMMON}
  ${GLSL_RAMP}
  in vec2 vUv;
  uniform vec3 uLoop;
  uniform float uCore;
  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float d = length(q);
    float a = atan(q.y, q.x);
    float rays = fbm(vec3(cos(a) * 2.2, sin(a) * 2.2, 0.0) + uLoop * 0.8);
    float glow = pow(uCore / max(d, 1e-3), 2.6) * (0.55 + rays * 0.9);
    float b = bayer4(gl_FragCoord.xy);
    if (glow < 0.3 + b * 0.12) discard;
    gl_FragColor = vec4(ramp((glow - 0.3) * 1.3, 0.0), 1.0);
  }
`;

const BILLBOARD_VERT = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const RING_VERT = /* glsl */ `
  out vec3 vLocal;
  out vec3 vPosW;
  void main() {
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RING_FRAG = /* glsl */ `
  ${GLSL_COMMON}
  ${GLSL_RAMP}
  in vec3 vLocal;
  in vec3 vPosW;
  uniform vec3 uCenter;
  uniform float uPlanetR;
  uniform float uInner;
  uniform float uOuter;
  void main() {
    float r = (length(vLocal.xy) - uInner) / (uOuter - uInner);
    if (r > 0.56 && r < 0.63) discard; // the gap
    float band = hash12(vec2(floor(r * 14.0), 3.0));
    float v = 0.35 + band * 0.55 - r * 0.2;
    // planet shadow: does the ray towards the star hit the planet sphere?
    vec3 dir = normalize(-vPosW);
    vec3 oc = vPosW - uCenter;
    float bq = dot(oc, dir);
    float cq = dot(oc, oc) - uPlanetR * uPlanetR;
    if (bq < 0.0 && bq * bq - cq > 0.0) v -= 0.55;
    gl_FragColor = vec4(ramp(v, 0.7), 1.0);
  }
`;

const ORBIT_VERT = /* glsl */ `
  in float aAngle;
  out float vAngle;
  void main() { vAngle = aAngle; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const ORBIT_FRAG = /* glsl */ `
  in float vAngle;
  uniform float uDashes;
  uniform float uFlow;
  uniform vec3 uColor;
  void main() {
    if (fract(vAngle / 6.2831853 * uDashes - uFlow) > 0.3) discard;
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

const POST_FRAG = /* glsl */ `
  ${GLSL_COMMON}
  in vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform mat4 uInvViewProj;
  uniform vec3 uCam;
  uniform float uPhase;
  uniform float uLo;
  uniform float uHi;
  uniform float uFront;
  uniform vec3 uPal[${PAL_KEYS.length}];
  uniform vec3 uSky[4];
  uniform vec3 uFog[4];
  uniform vec3 uStar[4];
  uniform vec3 uMint[2];

  vec2 planeXZ(vec2 uv) {
    vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize(w.xyz / w.w - uCam);
    float t = -uCam.y / min(dir.y, -1e-3);
    return (uCam + dir * t).xz;
  }

  float fogAmount(vec2 xz, vec3 drift, out float frontDist) {
    float n = fbm(vec3(xz * 0.5, 0.0) + drift) - 0.5;
    float r = length(xz) + n * 1.6;
    float ang = atan(xz.y, xz.x) + n * 0.55;
    float arc = smoothstep(uLo - 0.06, uLo + 0.06, ang) * smoothstep(uHi + 0.06, uHi - 0.06, ang);
    float inner = smoothstep(2.1, 2.6, r);
    float outer = smoothstep(11.0, 12.5, r);
    frontDist = abs(ang - uHi) / 0.16 + (1.0 - inner) * 9.0 + (1.0 - step(uLo, ang)) * 9.0;
    return max(arc * inner, outer);
  }

  vec3 snap(vec3 c) {
    vec3 best = uPal[0];
    float bd = 1e9;
    for (int i = 0; i < ${PAL_KEYS.length}; i++) {
      vec3 d = c - uPal[i];
      float e = dot(d * d, vec3(0.3, 0.59, 0.11));
      if (e < bd) { bd = e; best = uPal[i]; }
    }
    return best;
  }

  vec3 sky(vec2 fc, vec2 uv) {
    float b = bayer4(fc);
    // static nebula bands
    float neb = fbm(vec3(uv * vec2(3.2, 1.8), 4.0));
    neb = neb * 0.9 + (1.0 - abs(uv.y - 0.25 - uv.x * 0.5) * 2.2) * 0.35;
    int ni = int(clamp(floor(neb * 3.4 - 0.9 + (b - 0.5) * 0.7), 0.0, 3.0));
    vec3 c = uSky[ni];
    // stars
    vec2 cell = floor(fc);
    float h = hash12(cell);
    float tw = 0.5 + 0.5 * sin(6.2831853 * (uPhase * (1.0 + floor(hash12(cell + 9.0) * 2.0)) + hash12(cell + 3.0)));
    if (h > 0.9965) c = tw > 0.35 ? uStar[2] : uStar[1];
    else if (h > 0.988) c = uStar[tw > 0.6 ? 1 : 0];
    // a few plus-shaped sparkles
    for (int k = 0; k < 5; k++) {
      vec2 o = k == 0 ? vec2(0) : k == 1 ? vec2(1, 0) : k == 2 ? vec2(-1, 0) : k == 3 ? vec2(0, 1) : vec2(0, -1);
      vec2 q = cell - o;
      if (hash12(q * 1.37 + 5.0) > 0.99935) {
        float t2 = 0.5 + 0.5 * sin(6.2831853 * (uPhase * 2.0 + hash12(q)));
        if (k == 0) c = uStar[3];
        else if (t2 > 0.45) c = uStar[2];
      }
    }
    return c;
  }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    vec4 s = texture(tScene, vUv);
    bool obj = s.a > 0.5;
    vec3 c = obj ? s.rgb : sky(fc, vUv);
    vec2 xz = planeXZ(vUv);
    float ph = uPhase * 6.2831853;
    vec3 drift = vec3(cos(ph), sin(ph), 0.0) * 0.35;
    float front;
    float f = fogAmount(xz, drift, front);
    float b = bayer4(fc);
    float thresh = 0.04 + b * 0.92;
    if (f > thresh) {
      float cloud = fbm(vec3(xz * 0.32, 2.0) + drift * 0.6);
      float lum = obj ? dot(s.rgb, vec3(0.3, 0.59, 0.11)) : 0.0;
      float v = cloud * 1.1 - 0.35 + lum * 0.85;
      int fi = int(clamp(floor(v * 3.0 + (b - 0.5) * 0.9 + 0.5), 0.0, 3.0));
      c = uFog[fi];
      // uncharted-map dot grid on the orbital plane
      vec2 g = abs(fract(xz / 1.1 + 0.5) - 0.5) * 1.1;
      vec2 w = fwidth(xz);
      if (!obj && g.x < w.x * 0.55 && g.y < w.y * 0.55) c = uFog[2];
      // while revealing, the dissolving edge of the fog burns in the accent colour
      if (uFront > 0.0 && front < 1.6 && f - thresh < 0.16 * uFront)
        c = hash12(fc + floor(uPhase * 100.0)) > 0.6 ? uMint[1] : uMint[0];
    }
    gl_FragColor = vec4(snap(c), 1.0);
  }
`;

// ---------------------------------------------------------------- scene
const glCanvas = document.createElement('canvas');
glCanvas.width = W;
glCanvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // palette hexes go out untouched
THREE.ColorManagement.enabled = false;

const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
camera.position.set(0.4, 9.2, 13.6);
camera.lookAt(0.9, -0.2, -0.4);
camera.updateMatrixWorld();

const shader = (frag, vert, uniforms, extra = {}) =>
  new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, ...extra });

const loopVec = (u, r) => new THREE.Vector3(Math.cos(u * TAU) * r, Math.sin(u * TAU) * r, 0);

// Star (the repo)
const STAR_R = 1.2;
const starMat = shader(STAR_FRAG, PLANET_VERT, {
  uRamp: rampOf(['crimson', 'ember', 'orange', 'yellow', 'hot']), uRampN: { value: 5 },
  uSpin: { value: 0 }, uLoop: { value: new THREE.Vector3() }, uCam: { value: camera.position },
});
const star = new THREE.Mesh(new THREE.SphereGeometry(STAR_R, 48, 32), starMat);
star.renderOrder = 3;
scene.add(star);

const CORONA_SIZE = 4.6;
const coronaMat = shader(CORONA_FRAG, BILLBOARD_VERT, {
  uRamp: rampOf(['maroon', 'crimson', 'ember', 'orange', 'yellow']), uRampN: { value: 5 },
  uLoop: { value: new THREE.Vector3() }, uCore: { value: (STAR_R / (CORONA_SIZE / 2)) * 1.05 },
}, { depthWrite: false });
const corona = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), coronaMat);
corona.quaternion.copy(camera.quaternion);
corona.renderOrder = 0;
scene.add(corona);

// Modules (planets). size ~ LOC, surface ~ churn (hot = high churn, ice = low).
// Positions are art-directed in screen pixels (sx, sy) and projected back onto
// the orbital plane, so the orbit radius and angle fall out of the composition.
const MODULES = [
  { name: 'api/', type: 0, sx: 104, sy: 130, r: 0.66, ramp: ['navy', 'plum', 'maroon', 'crimson', 'ember'], glow: ['crimson', 'ember', 'yellow'], spin: 1, tilt: 0.25, seed: 1.3, moon: true },
  { name: 'web/', type: 1, sx: 68, sy: 72, r: 1.0, ramp: ['indigo', 'plum', 'violet', 'magenta', 'pink', 'lav'], glow: ['pink', 'hot', 'hot'], spin: 1, tilt: -0.35, seed: 4.1, ring: true },
  { name: 'infra/', type: 2, sx: 262, sy: 88, r: 0.62, ramp: ['navy', 'maroon', 'crimson', 'ember', 'orange'], glow: ['ember', 'ember', 'ember'], spin: 1, tilt: 0.2, seed: 7.7, reveal: true },
  { name: 'docs/', type: 3, sx: 250, sy: 132, r: 0.5, ramp: ['blueDark', 'blue', 'sky', 'skyLight', 'ice'], glow: ['ice', 'ice', 'ice'], spin: 1, tilt: -0.2, seed: 2.2 },
  { name: 'ml/', type: 4, sx: 196, sy: 40, r: 0.8, ramp: ['navy', 'mintDark', 'mint', 'mintLight'], glow: ['mint', 'mint', 'mint'], spin: 1, tilt: 0.3, seed: 9.9, hidden: true },
];

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const screenToPlane = (sx, sy) => {
  raycaster.setFromCamera(new THREE.Vector2((sx / W) * 2 - 1, 1 - (sy / H) * 2), camera);
  return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
};
const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
for (const m of MODULES) {
  m.pos = screenToPlane(m.sx, m.sy);
  m.orbit = Math.hypot(m.pos.x, m.pos.z);
  m.angle = Math.atan2(m.pos.z, m.pos.x);
  m.mat = shader(PLANET_FRAG, PLANET_VERT, {
    uRamp: rampOf(m.ramp), uRampN: { value: m.ramp.length },
    uGlow: { value: m.glow.map(col) }, uSpin: { value: 0 }, uSeed: { value: m.seed }, uType: { value: m.type }, uCam: { value: camera.position },
  });
  m.mesh = new THREE.Mesh(sphereGeo, m.mat);
  m.mesh.scale.setScalar(m.r);
  m.mesh.position.copy(m.pos);
  m.mesh.rotation.z = m.tilt;
  m.mesh.renderOrder = 2;
  scene.add(m.mesh);
  if (m.ring) {
    const inner = 1.5;
    const outer = 2.15;
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1), shader(RING_FRAG, RING_VERT, {
      uRamp: rampOf(['indigo', 'violet', 'lavDark', 'lav', 'dim', 'white']), uRampN: { value: 6 },
      uCenter: { value: m.pos }, uPlanetR: { value: m.r }, uInner: { value: inner }, uOuter: { value: outer },
    }, { side: THREE.DoubleSide }));
    ring.position.copy(m.pos);
    ring.scale.setScalar(m.r);
    ring.rotation.set(-Math.PI / 2 + 0.12, 0.0, 0.32);
    ring.renderOrder = 2;
    scene.add(ring);
  }
  if (m.moon) {
    m.moonMesh = new THREE.Mesh(sphereGeo, shader(PLANET_FRAG, PLANET_VERT, {
      uRamp: rampOf(['indigo', 'fog3', 'dim', 'white']), uRampN: { value: 4 },
      uGlow: { value: [col('dim'), col('dim'), col('dim')] }, uSpin: { value: 0 }, uSeed: { value: 3.3 }, uType: { value: 2 }, uCam: { value: camera.position },
    }));
    m.moonMesh.scale.setScalar(0.2);
    m.moonMesh.renderOrder = 2;
    scene.add(m.moonMesh);
  }
}

// Orbit rings: dashed lines that flow one dash per loop.
const orbitMats = [];
for (const m of MODULES) {
  const n = 256;
  const pts = [];
  const ang = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    pts.push(Math.cos(a) * m.orbit, 0, Math.sin(a) * m.orbit);
    ang.push(a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aAngle', new THREE.Float32BufferAttribute(ang, 1));
  const mat = shader(ORBIT_FRAG, ORBIT_VERT, {
    uDashes: { value: Math.round(m.orbit * 16) }, uFlow: { value: 0 }, uColor: { value: col('violet') },
  });
  orbitMats.push(mat);
  const line = new THREE.Line(g, mat);
  line.renderOrder = 1;
  scene.add(line);
}

// Post pass
const invViewProj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
const postMat = shader(POST_FRAG, BILLBOARD_VERT, {
  tScene: { value: rt.texture }, uRes: { value: new THREE.Vector2(W, H) },
  uInvViewProj: { value: invViewProj }, uCam: { value: camera.position },
  uPhase: { value: 0 }, uLo: { value: FOG_LO }, uHi: { value: FOG_CLOSED }, uFront: { value: 0 },
  uPal: { value: PAL_KEYS.map(col) },
  uSky: { value: ['void', 'navy', 'indigo', 'plum'].map(col) },
  uFog: { value: ['fog0', 'fog1', 'fog2', 'fog3'].map(col) },
  uStar: { value: ['violet', 'dim', 'white', 'hot'].map(col) },
  uMint: { value: ['mint', 'mintLight'].map(col) },
}, { depthTest: false, depthWrite: false });
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);

// ---------------------------------------------------------------- helpers
const out = document.getElementById('out');
const ctx = out.getContext('2d');
ctx.imageSmoothingEnabled = false;

const toScreen = (v) => {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) * 0.5 * W, y: (1 - p.y) * 0.5 * H, depth: camera.position.distanceTo(v) };
};
const screenRadius = (pos, r) => {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(r);
  return Math.abs(toScreen(pos.clone().add(right)).x - toScreen(pos).x);
};

// JS mirror of the shader fog test at a point (without noise) for labels.
const isFogged = (pos, u) => {
  const ang = Math.atan2(pos.z, pos.x);
  return (ang > FOG_LO && ang < fogHi(u) - 0.08) || pos.length() > 11;
};

const rect = (c, x, y, w, h) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

function panel(x, y, w, h, border = P.violet, fill = P.void) {
  rect(border, x + 1, y, w - 2, 1);
  rect(border, x + 1, y + h - 1, w - 2, 1);
  rect(border, x, y + 1, 1, h - 2);
  rect(border, x + w - 1, y + 1, 1, h - 2);
  rect(fill, x + 1, y + 1, w - 2, h - 2);
}

function pixelCircle(cx, cy, r, c, gapEvery = 0) {
  // midpoint circle; optional dotted look
  let x = r;
  let y = 0;
  let err = 1 - r;
  let k = 0;
  const plot = (px, py) => { if (!gapEvery || k % gapEvery !== 0) rect(c, cx + px, cy + py, 1, 1); };
  while (x >= y) {
    k++;
    plot(x, y); plot(y, x); plot(-y, x); plot(-x, y);
    plot(-x, -y); plot(-y, -x); plot(y, -x); plot(x, -y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

// ---------------------------------------------------------------- crew
const CREW = [
  { handle: '@caden', suit: P.orange, shade: P.ember, light: P.mint, at: 'infra/', mode: 'frontier', phase: 0.0 },
  { handle: '@mira', suit: P.mint, shade: P.mintDark, light: P.white, at: 'web/', mode: 'orbit', phase: 0.15, radius: 2.1, flip: false },
  { handle: '@juno', suit: P.pink, shade: P.magenta, light: P.mint, at: 'api/', mode: 'orbit', phase: 0.6, radius: 1.9 },
];
const modByName = Object.fromEntries(MODULES.map((m) => [m.name, m]));

function crewPosition(c, u) {
  const m = modByName[c.at];
  if (c.mode === 'frontier') {
    // hovers at the fog edge, between the star and infra/, bobbing
    const base = m.pos.clone().multiplyScalar(0.62).add(new THREE.Vector3(-1.2, 0, 0.5));
    const s = toScreen(base);
    return { x: s.x + Math.sin(u * TAU) * 2, y: s.y + Math.sin(u * TAU * 2) * 1.5, front: true };
  }
  const a = (u + c.phase) * TAU;
  const pr = screenRadius(m.pos, m.r);
  const s = toScreen(m.pos);
  const R = pr * c.radius;
  const dy = Math.sin(a) * R * 0.38 + Math.sin(u * TAU * 3) * 1;
  return { x: s.x + Math.cos(a) * R, y: s.y + dy, front: Math.sin(a) > -0.15, planet: s, pr };
}

// ---------------------------------------------------------------- frame
function renderFrame(i) {
  const u = (((i % FRAMES) + FRAMES) % FRAMES) / FRAMES;

  starMat.uniforms.uSpin.value = u * TAU;
  starMat.uniforms.uLoop.value.copy(loopVec(u, 0.6));
  coronaMat.uniforms.uLoop.value.copy(loopVec(u, 0.5));
  for (const m of MODULES) {
    m.mat.uniforms.uSpin.value = u * TAU * m.spin;
    if (m.moonMesh) {
      const a = u * TAU * 2 + 0.6;
      m.moonMesh.position.set(m.pos.x + Math.cos(a) * 1.3, Math.sin(a) * 0.35, m.pos.z + Math.sin(a) * 1.3);
    }
  }
  orbitMats.forEach((mat) => (mat.uniforms.uFlow.value = u * 2));

  postMat.uniforms.uPhase.value = u;
  postMat.uniforms.uHi.value = fogHi(u);
  const revealing = smooth(T.revealStart, T.revealStart + 0.03, u) * (1 - smooth(T.revealEnd - 0.04, T.revealEnd, u));
  postMat.uniforms.uFront.value = revealing;

  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(glCanvas, 0, 0);
  drawOverlay(u);
  return out.toDataURL('image/png');
}

function drawOverlay(u) {
  const blink = Math.floor(u * 16) % 2 === 0; // even count keeps the seam clean

  // module labels
  for (const m of MODULES) {
    const s = toScreen(m.pos);
    const pr = screenRadius(m.pos, m.r);
    const fogged = m.hidden || isFogged(m.pos, u);
    const label = fogged ? '???' : m.name;
    const color = fogged ? P.fog3 : m.reveal && revealAmount(u) > 0.5 && revealAmount(u) < 0.98 ? P.mintLight : P.white;
    drawText(ctx, label, s.x - textWidth(label, MICRO) / 2, s.y + pr + (m.ring ? 6 : 3), MICRO, { color, outline: fogged ? undefined : P.void });
  }

  // reveal ping on infra/
  const infra = modByName['infra/'];
  const pingT = (u - 0.36) / 0.14;
  if (pingT > 0 && pingT < 1) {
    const s = toScreen(infra.pos);
    const pr = screenRadius(infra.pos, infra.r);
    pixelCircle(Math.round(s.x), Math.round(s.y), Math.round(pr + 3 + pingT * 22), pingT < 0.6 ? P.mintLight : P.mint, pingT > 0.6 ? 2 : 0);
  }
  const popT = (u - 0.38) / 0.22;
  if (popT > 0 && popT < 1) {
    const s = toScreen(infra.pos);
    const label = '+1 SECTOR';
    const y = s.y - 24 - Math.round(easeOutBack(clamp01(popT * 3)) * 6);
    if (popT < 0.85 || blink) drawText(ctx, label, s.x - textWidth(label, MICRO) / 2, y, MICRO, { color: P.mintLight, outline: P.void, shadow: P.mintDark });
  }

  // crew
  const frame = Math.floor(u * 24) % 2;
  for (const c of CREW) {
    const p = crewPosition(c, u);
    if (!p.front && p.planet && Math.hypot(p.x - p.planet.x, p.y - p.planet.y) < p.pr + 3) continue;
    if (c.mode === 'orbit') {
      // jet trail: earlier positions along the path, cooling off
      [P.orange, P.ember, P.maroon].forEach((tc, k) => {
        const q = crewPosition(c, u - 0.014 * (k + 1));
        if (q.front) rect(tc, q.x, q.y + 4, 1, 1);
      });
    }
    const colors = { o: P.void, w: P.white, g: P.dim, v: P.blueDark, V: P.skyLight, s: c.suit, S: c.shade, m: c.light, f: frame ? P.yellow : P.orange, F: frame ? P.orange : P.yellow };
    const sx = Math.round(p.x - ASTRO_W / 2);
    const sy = Math.round(p.y - ASTRO_H / 2);
    drawSprite(ctx, ASTRO_FRAMES[frame], sx, sy, colors, c.flip);
    drawText(ctx, c.handle, Math.round(p.x - textWidth(c.handle, MICRO) / 2), sy - 8, MICRO, { color: c.suit, outline: P.void });
  }

  drawHud(u, blink);
}

function drawHud(u, blink) {
  // title block
  drawText(ctx, 'CODEBASE SPACE EXPLORER', 7, 6, BIG, { color: P.white, color2: P.lav, splitRow: 4, outline: P.void, shadow: P.plum });
  const charted = revealAmount(u) > 0.5;
  const sub = 'caden/qodo-2026 · 5 modules · 3 crew · charted ';
  const sw = drawText(ctx, sub, 7, 17, MICRO, { color: P.dim, outline: P.void });
  drawText(ctx, charted ? '4/6' : '3/6', 8 + sw, 17, MICRO, { color: charted ? P.mint : P.dim, outline: P.void });

  // PR quality meter
  const v = meterValue(u);
  const px = 222;
  const py = 5;
  panel(px, py, 93, 31);
  drawText(ctx, 'PR QUALITY', px + 4, py + 4, MICRO, { color: P.white });
  const segs = 14;
  const lit = Math.round(v * segs);
  const flash = u > T.reviewEnd && u < T.reviewEnd + 0.04 && blink;
  for (let k = 0; k < segs; k++) {
    const segCol = k < lit ? (flash ? P.white : k < 5 ? P.ember : k < 9 ? P.yellow : P.mint) : P.indigo;
    rect(segCol, px + 4 + k * 4, py + 12, 3, 6);
    if (k < lit && !flash) rect(k < 5 ? P.orange : k < 9 ? P.hot : P.mintLight, px + 4 + k * 4, py + 12, 3, 1);
  }
  const num = String(Math.round(v * 100));
  drawText(ctx, num, px + 89 - textWidth(num, BIG), py + 11, BIG, { color: v > 0.8 ? P.mint : P.yellow, color2: v > 0.8 ? P.mintDark : P.orange, splitRow: 5 });
  const status = u < T.reviewEnd ? (blink ? 'qodo reviewing...' : 'qodo reviewing..') : u < T.returnStart ? 'qodo review ✓ merged' : 'next PR: in review';
  drawText(ctx, status, px + 4, py + 22, MICRO, { color: u < T.reviewEnd || u >= T.returnStart ? P.dim : P.mint });


  // toast
  const tIn = smooth(T.toastIn, T.toastIn + 0.05, u);
  const tOut = smooth(T.toastOut, T.toastOut + 0.05, u);
  const shown = tIn * (1 - tOut);
  if (shown > 0.001) {
    const msg = 'PR #42 merged · Qodo review ✓ · +1 sector revealed';
    const tw = textWidth(msg, MICRO);
    const bw = tw + 20;
    const bx = Math.round((W - bw) / 2);
    const by = Math.round(H - 4 - 15 * easeOutBack(shown));
    panel(bx, by, bw, 13, P.mint, P.navy);
    rect(P.mint, bx + 3, by + 3, 7, 7);
    drawText(ctx, '✓', bx + 4, by + 4, MICRO, { color: P.void });
    drawText(ctx, msg, bx + 14, by + 4, MICRO, { color: P.white });
  }
}

window.hype = {
  ready: true,
  info: { frames: FRAMES, fps: FPS, width: W, height: H, layout: MODULES.map((m) => ({ name: m.name, orbit: +m.orbit.toFixed(2), angle: +m.angle.toFixed(2) })) },
  renderFrame,
};

// Live preview when opened outside the render harness.
if (!new URLSearchParams(location.search).has('render')) {
  let f = 0;
  setInterval(() => renderFrame(f++), 1000 / FPS);
}
