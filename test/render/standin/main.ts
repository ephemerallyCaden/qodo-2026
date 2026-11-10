// Stand-in view for the render harness (#31): the smallest three.js scene that implements the
// contract's RenderHook (docs/contracts/phase2.md, Render hook), so the harness can be proven before
// the real view (#30) lands, and its negative tests have something to break. It is test code, but
// follows the art rules it touches: a low-res target upscaled by a whole number with nearest
// filtering, no AA, palette colours only, banded shading, constant orbital rates, no clocks or
// randomness. A stepped depth fade is its one off-palette output, and `depthFade: false` turns it
// off. Not a design reference for the real view.
import {
  BufferGeometry, Color, ColorManagement, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, LinearSRGBColorSpace, Mesh,
  NearestFilter, Object3D, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Points, Scene, ShaderMaterial, WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { TEST_MODE_PARAM, type CameraPose, type RenderHook, type RenderInput, type RenderStats } from '../../../src/core/contract/api.js';
import { fibonacciCell, type HealthBand } from '../../../src/core/contract/layout.js';
import { palette, type Ramp } from '../../../src/core/palette.js';

// Palette hex values go to the GPU untouched: the target holds exactly the palette's bytes.
ColorManagement.enabled = false;

/** 24 s at 30 frames per second. Every orbit completes a whole number of turns per loop (Rule 4). */
const FRAMES_PER_LOOP = 720;
const MOON_TURNS_PER_LOOP = 4;
const STARS = 240;
const SUN_RADIUS = 7;
/** Bodies drawn larger than the layout's radius, so the stand-in fills enough of the frame (§10: ≥ 5% not space). */
const BODY_SCALE = 1.4;
const DEFAULT_POSE: CameraPose = { position: [0, 95, 65], target: [0, 0, 0], fovDeg: 45 };
/** Distance from the camera (world units) where the depth fade steps to palette.world.depth[1], then [2]. */
const DEPTH_AT: [number, number] = [110, 150];
const BAND_RAMP: Record<HealthBand, Ramp> = {
  lava: palette.world.glow, toxic: palette.world.toxic, ash: palette.world.ash, healthy: palette.world.land,
};

const BODY_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/**
 * Lit from the sun (or, for the sun itself, from the camera), quantised to one ramp colour per band,
 * then the stepped depth fade toward the tint (art-direction §5), scaled by uDepthFade (0 or 1).
 */
const BODY_FRAG = /* glsl */ `
uniform vec3 uRamp[5];
uniform float uSteps;
uniform float uSelfLit;
uniform float uDepthFade;
uniform vec2 uDepthAt;
uniform vec3 uDepthTint[3];
uniform float uDepthStrength[3];
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 toLight = normalize(mix(vec3(0.0), cameraPosition, uSelfLit) - vWorld);
  float lit = clamp(dot(normalize(vNormal), toLight) * 0.5 + 0.5, 0.0, 0.999);
  int band = int(lit * uSteps);
  vec3 c = uRamp[0];
  for (int i = 1; i < 5; i++) { if (i <= band) c = uRamp[i]; }
  float d = distance(cameraPosition, vWorld);
  int k = d < uDepthAt.x ? 0 : d < uDepthAt.y ? 1 : 2;
  c = mix(c, uDepthTint[k], uDepthFade * uDepthStrength[k]);
  gl_FragColor = vec4(c, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute vec3 aColour;
varying vec3 vColour;
void main() {
  vColour = aColour;
  gl_PointSize = 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vColour;
void main() { gl_FragColor = vec4(vColour, 1.0); }`;

const BLIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLIT_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

const DEPTH = palette.world.depth.slice(0, 3);
function bodyMaterial(ramp: Ramp, depthFade: boolean, selfLit = false): ShaderMaterial {
  const colours = Array.from({ length: 5 }, (_, i) => new Color(ramp[Math.min(i, ramp.length - 1)]!));
  return new ShaderMaterial({
    vertexShader: BODY_VERT,
    fragmentShader: BODY_FRAG,
    uniforms: {
      uRamp: { value: colours }, uSteps: { value: ramp.length }, uSelfLit: { value: selfLit ? 1 : 0 },
      uDepthFade: { value: depthFade ? 1 : 0 }, uDepthAt: { value: DEPTH_AT },
      uDepthTint: { value: DEPTH.map((s) => new Color(s.tint)) }, uDepthStrength: { value: DEPTH.map((s) => s.strength) },
    },
  });
}

function starField(): Points {
  const positions: number[] = [], colours: number[] = [];
  const dim = new Color(palette.world.stars[0]), mid = new Color(palette.world.stars[1]), bright = new Color(palette.world.stars[2]);
  for (let i = 0; i < STARS; i++) {
    const [x, y, z] = fibonacciCell(i, STARS);
    positions.push(x * 900, y * 900, z * 900);
    const c = i % 9 === 0 ? bright : i % 3 === 0 ? mid : dim; // mostly the dim one
    colours.push(c.r, c.g, c.b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('aColour', new Float32BufferAttribute(colours, 3));
  return new Points(g, new ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG }));
}

interface Loaded {
  width: number;
  height: number;
  reducedMotion: boolean;
  target: WebGLRenderTarget;
  scene: Scene;
  camera: PerspectiveCamera;
  planets: { mesh: Mesh; orbit: number; phase: number; turns: number; radius: number; moons: number[] }[];
  moons: InstancedMesh | null;
}

const canvas = document.createElement('canvas');
document.body.style.background = palette.world.space;
document.body.append(canvas);
const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = LinearSRGBColorSpace;
renderer.setClearColor(new Color(palette.world.space), 1);
renderer.info.autoReset = false; // renderFrame counts the whole frame: scene pass and upscale
const sphereHi = new IcosahedronGeometry(1, 3);
const sphereLo = new IcosahedronGeometry(1, 1);
const blitMaterial = new ShaderMaterial({ vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG, uniforms: { uTex: { value: null } }, depthTest: false, depthWrite: false });
const blitScene = new Scene().add(Object.assign(new Mesh(new PlaneGeometry(2, 2), blitMaterial), { frustumCulled: false }));
const blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
let state: Loaded | null = null;
let drawn = false;

function dispose(s: Loaded): void {
  s.target.dispose();
  s.scene.traverse((o) => { if (o instanceof Mesh || o instanceof Points) (o.material as ShaderMaterial).dispose(); });
}

function build(input: RenderInput): Loaded {
  const height = input.pixelHeight ?? 180;
  if (!Number.isInteger(height) || height < 120 || height > 480) throw new RangeError(`pixelHeight must be an integer in 120..480, got ${height}`);
  const width = Math.round((height * 16) / 9);
  const target = new WebGLRenderTarget(width, height, { minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false });
  const scene = new Scene();
  scene.add(starField());
  const depthFade = input.depthFade ?? true;
  const sun = new Mesh(sphereHi, bodyMaterial(palette.world.glow, depthFade, true));
  sun.scale.setScalar(SUN_RADIUS);
  scene.add(sun);
  let moonCount = 0;
  const planets = input.layout.planets.map((p) => {
    const mesh = new Mesh(sphereHi, bodyMaterial(BAND_RAMP[p.health.band], depthFade));
    const radius = (p.radiusMilli / 1000) * BODY_SCALE;
    mesh.scale.setScalar(radius);
    scene.add(mesh);
    const moons = p.moons.map(() => moonCount++);
    return { mesh, orbit: p.slot.radiusMilli / 1000, phase: p.slot.phaseMilliturn / 1000, turns: Math.max(1, 3 - p.slot.index), radius, moons };
  });
  const moons = moonCount ? new InstancedMesh(sphereLo, bodyMaterial(palette.world.moonBody, depthFade), moonCount) : null;
  if (moons) scene.add(moons);
  const pose = input.camera ?? DEFAULT_POSE;
  const camera = new PerspectiveCamera(pose.fovDeg, width / height, 1, 2000);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  return { width, height, reducedMotion: input.reducedMotion ?? false, target, scene, camera, planets, moons };
}

/** Puts every body where frame n has it: a pure function of the layout and n. Reduced motion holds frame 0. */
function place(s: Loaded, n: number): void {
  const t = s.reducedMotion ? 0 : n / FRAMES_PER_LOOP;
  const dummy = new Object3D();
  for (const p of s.planets) {
    const a = 2 * Math.PI * (p.phase + p.turns * t);
    p.mesh.position.set(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit);
    p.moons.forEach((id, j) => {
      const b = 2 * Math.PI * (j / p.moons.length + MOON_TURNS_PER_LOOP * t);
      const r = p.radius * (1.6 + 0.35 * (j % 3));
      dummy.position.set(p.mesh.position.x + Math.cos(b) * r, 0, p.mesh.position.z + Math.sin(b) * r);
      dummy.scale.setScalar(Math.max(0.8, p.radius * 0.15));
      dummy.updateMatrix();
      s.moons?.setMatrixAt(id, dummy.matrix);
    });
  }
  if (s.moons) s.moons.instanceMatrix.needsUpdate = true;
}

function draw(n: number): RenderStats {
  if (!state) throw new Error('renderFrame() before load()');
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`frame must be a non-negative integer, got ${n}`);
  const s = state;
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / s.width, window.innerHeight / s.height)));
  renderer.setSize(s.width * scale, s.height * scale);
  place(s, n);
  renderer.info.reset();
  renderer.setRenderTarget(s.target);
  renderer.render(s.scene, s.camera);
  renderer.setRenderTarget(null);
  blitMaterial.uniforms['uTex']!.value = s.target.texture;
  renderer.render(blitScene, blitCamera);
  drawn = true;
  return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, width: s.width, height: s.height };
}

const hook: RenderHook = {
  ready: document.fonts.ready.then(() => undefined),
  async load(input) {
    const next = build(input);
    if (state) dispose(state);
    state = next;
    drawn = false;
  },
  async renderFrame(n) {
    return draw(n);
  },
  lowResPixels() {
    if (!state || !drawn) throw new Error('lowResPixels() before renderFrame()');
    const { width, height, target } = state;
    const gl = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, gl);
    // GL rows run bottom-up; the contract's row 0 is the top.
    const rgba: number[] = new Array<number>(gl.length);
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      const from = (height - 1 - y) * stride;
      for (let i = 0; i < stride; i++) rgba[y * stride + i] = gl[from + i]!;
    }
    return { width, height, rgba };
  },
};

if (new URLSearchParams(location.search).get(TEST_MODE_PARAM) === '1') window.__commet = hook;
