// Hero planet: the system view's centrepiece. One lush planet with a cloud layer, a
// banded ring, a single moon and a starfield, rendered into a 320x180 canvas that CSS
// scales up by a whole number. Motion is driven by an explicit time in seconds, so
// the same t always gives the same frame; the scene loops every 24 s.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PALETTE } from './palette.js';

THREE.ColorManagement.enabled = false; // palette hexes go to the screen untouched

const W = 320, H = 180;
const LOOP = 24; // seconds; every period below divides it
const SPIN = 24, CLOUD_SPIN = 12, MOON_ORBIT = 24;
const RING = { inner: 1.45, outer: 2.25, bands: 32 };
const KEY_LIGHT = new THREE.Vector3(-0.6, 0.45, 0.66).normalize();
const TAU = Math.PI * 2;

const glslColor = (hex: string) => { const { r, g, b } = new THREE.Color(hex); return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`; };
const glslRamp = (name: string, hexes: readonly string[]) =>
  `const vec3 ${name}[${hexes.length}] = vec3[${hexes.length}](${hexes.map(glslColor).join(', ')});`;

// Seeded PRNG (mulberry32) for star placement and ring bands.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);

const VERT = /* glsl */ `
  varying vec3 vObj, vNormal, vWorld;
  void main() {
    vObj = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

// Integer-hashed value noise, so every GPU gets the same continents.
const NOISE = /* glsl */ `
  float hash(vec3 c) {
    uvec3 v = uvec3(ivec3(c) + 4096) * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    return float(v.x ^ v.y ^ v.z) * (1.0 / 4294967296.0);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  int lightBand(vec3 n, vec3 key) {
    float l = dot(normalize(n), key);
    return l < -0.1 ? 0 : l < 0.25 ? 1 : l < 0.6 ? 2 : 3;
  }
`;

const PLANET_FRAG = /* glsl */ `
  uniform vec3 uKey;
  varying vec3 vObj, vNormal, vWorld;
  ${glslRamp('OCEAN', PALETTE.ocean)}
  ${glslRamp('LAND', PALETTE.land)}
  ${glslRamp('CAP', PALETTE.cap)}
  const vec3 HAZE = ${glslColor('#8fe3ff')};
  ${NOISE}
  void main() {
    int band = lightBand(vNormal, uKey);
    float h = vnoise(vObj * 2.2) * 0.65 + vnoise(vObj * 5.1) * 0.35;
    vec3 col = abs(vObj.y) > 0.86 ? CAP[band] : h > 0.55 ? LAND[band + 1] : OCEAN[band];
    float rim = 1.0 - max(dot(normalize(vNormal), normalize(cameraPosition - vWorld)), 0.0);
    if (rim > 0.82 && band > 1) col = HAZE;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const CLOUD_FRAG = /* glsl */ `
  uniform vec3 uKey;
  varying vec3 vObj, vNormal;
  ${glslRamp('CLOUD', PALETTE.cloud)}
  ${NOISE}
  void main() {
    float d = vnoise(vObj * 3.0 + vec3(7.1, 2.3, 4.8)) * 0.6 + vnoise(vObj * 7.0) * 0.4;
    if (d < 0.56) discard;
    gl_FragColor = vec4(CLOUD[lightBand(vNormal, uKey)], 1.0);
  }
`;

// Ring colour comes from a band strip; fragments in the planet's shadow take the darkest tone.
const RING_FRAG = /* glsl */ `
  uniform sampler2D uBands;
  uniform vec3 uKey;
  varying vec3 vObj, vWorld;
  ${glslRamp('RING', PALETTE.ring)}
  void main() {
    float t = (length(vObj.xy) - ${RING.inner.toFixed(2)}) / ${(RING.outer - RING.inner).toFixed(2)};
    vec4 band = texture2D(uBands, vec2(t, 0.5));
    if (band.a < 0.5) discard;
    float b = dot(vWorld, uKey);
    bool inShadow = b < 0.0 && dot(vWorld, vWorld) - b * b < 1.0;
    gl_FragColor = vec4(inShadow ? RING[0] : band.rgb, 1.0);
  }
`;
const STAR_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aLevel, aPhase;
  varying float vLevel, vTwinkle;
  void main() {
    vLevel = aLevel;
    vTwinkle = 0.55 + 0.45 * sin(uTime * 1.7 + aPhase);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 1.0;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying float vLevel, vTwinkle;
  ${glslRamp('STARS', PALETTE.stars)}
  void main() { gl_FragColor = vec4(STARS[int(vLevel)] * vTwinkle, 1.0); }
`;

function ringBands(rand: () => number): THREE.DataTexture {
  const data = new Uint8Array(RING.bands * 4);
  for (let i = 0; i < RING.bands; i++) {
    const c = new THREE.Color(PALETTE.ring[1 + Math.floor(rand() * 3)]);
    data.set([c.r * 255, c.g * 255, c.b * 255, rand() < 0.18 ? 0 : 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, RING.bands, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function starfield(rand: () => number, uTime: THREE.IUniform<number>, count = 420) {
  const pos = new Float32Array(count * 3), level = new Float32Array(count), phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1, a = rand() * TAU, r = Math.sqrt(1 - z * z);
    pos.set([Math.cos(a) * r * 60, z * 60, Math.sin(a) * r * 60], i * 3);
    level[i] = rand() < 0.7 ? 0 : rand() < 0.8 ? 1 : 2;
    phase[i] = rand() * TAU;
  }
  const geo = new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(pos, 3))
    .setAttribute('aLevel', new THREE.BufferAttribute(level, 1))
    .setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uTime }, depthWrite: false }));
}

const shaded = (fragmentShader: string, extra: Record<string, THREE.IUniform> = {}) =>
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms: { uKey: { value: KEY_LIGHT }, ...extra } });

export interface HeroPlanet { frame(t: number): void; dispose(): void }

export function mountHeroPlanet(canvas: HTMLCanvasElement, seed = 1): HeroPlanet {
  const rand = mulberry32(seed);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  camera.position.set(0, 0.9, 7.5);
  camera.lookAt(0, 0, 0);

  const time = { value: 0 };
  const stars = starfield(rand, time);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), shaded(PLANET_FRAG));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.04, 64, 32), shaded(CLOUD_FRAG));
  const bands = ringBands(rand);
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 96), shaded(RING_FRAG, { uBands: { value: bands } }));
  ring.material.side = THREE.DoubleSide;
  ring.rotation.set(-1.25, 0.18, 0);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12), new THREE.MeshStandardMaterial({ color: PALETTE.moon[2], roughness: 0.9, flatShading: true }));
  const sun = new THREE.DirectionalLight();
  sun.position.copy(KEY_LIGHT);
  scene.add(stars, planet, clouds, ring, moon, sun);

  const composer = new EffectComposer(renderer);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.85));

  const fit = () => {
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    Object.assign(canvas.style, { width: `${W * scale}px`, height: `${H * scale}px`, imageRendering: 'pixelated' });
  };
  fit();
  window.addEventListener('resize', fit);

  const frame = (t: number) => {
    const s = t % LOOP;
    planet.rotation.y = (TAU * s) / SPIN;
    clouds.rotation.y = (TAU * s) / CLOUD_SPIN;
    const a = TAU * easeInOutSine((s % MOON_ORBIT) / MOON_ORBIT);
    moon.position.set(Math.cos(a) * 2.9, Math.sin(a) * 0.35, Math.sin(a) * 2.9);
    moon.rotation.y = -a;
    time.value = s;
    composer.render();
  };

  return {
    frame,
    dispose() {
      window.removeEventListener('resize', fit);
      scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { o.geometry.dispose(); o.material.dispose(); } });
      bands.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
