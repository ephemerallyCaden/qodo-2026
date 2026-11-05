// The counter-example: the hero scene the way a coding agent builds it when nobody stops it,
// with the usual three.js "make it look nice" defaults. It deliberately breaks AGENTS.md Rule 4
// (pixel honesty): stock MeshStandardMaterial / MeshPhysicalMaterial, ambient + directional
// light with soft shadow maps, antialias, full resolution at devicePixelRatio, mipmapped
// linear-filtered textures, UnrealBloomPass and tweened (eased) spin and orbits.
// It keeps Rule 5's inputs: every colour comes from the same palette modules the house build
// uses (v2 world ramps, BLK 36 crew roles), so the only difference is the rendering pipeline.
// Layout, camera and terrain match the asset viewer (scene.js; the continents use the viewer's
// own noise and seed). Seeded PRNG only, and time is passed in, so renders are reproducible.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { V2_PLANET_RAMPS as V2 } from '../../asset-viewer/planet-ramps.js';
import { mapPalette } from '../../asset-viewer/palette-map.js';
import { snoise } from '../../asset-viewer/snoise.js';
import { CAMERA, CREW, FIGURE, LIGHT_DIR, MOONS, RING, easedMotion, constantMotion, mulberry32 } from '../scene.js';

const BLK = mapPalette('blk-36'); // crew roles, as the house build uses them
const WHITE = V2.cap[3]; // light colour: v2's white

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene(); // no background set: three.js clears to its default
const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(...CAMERA.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // eased orbit
controls.target.set(...CAMERA.target);
controls.update();

scene.add(new THREE.AmbientLight(WHITE, 0.35));
const sun = new THREE.DirectionalLight(WHITE, 2.6);
sun.position.copy(new THREE.Vector3(...LIGHT_DIR).normalize().multiplyScalar(20));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------------------------------------------------------------- textures
// Equirectangular canvas textures, mipmapped and linear-filtered (three's defaults), with max anisotropy.
const fbm = (x, y, z) => { // the viewer's GLSL fbm, on the CPU (snoise.js is its line-for-line port)
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { s += a * snoise(x, y, z); x = x * 2.03 + 11.7; y = y * 2.03 + 11.7; z = z * 2.03 + 11.7; a *= 0.5; }
  return (s / 0.9375) * 0.5 + 0.5;
};
const sphereDir = (u, v) => { // SphereGeometry's uv -> direction (u along phi, v from the north pole)
  const phi = u * Math.PI * 2, theta = v * Math.PI;
  return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
};
const gradient = (hexes) => { // smooth multi-stop lerp through a ramp, t in 0..1
  const cs = hexes.map((h) => new THREE.Color(h));
  return (t) => {
    const x = Math.min(0.9999, Math.max(0, t)) * (cs.length - 1), i = Math.floor(x);
    return cs[i].clone().lerp(cs[i + 1], x - i);
  };
};
function canvasTexture(w, h, texel) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set(texel((x + 0.5) / w, (y + 0.5) / h), (y * w + x) * 4);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
const bytes = (col, a = 255) => { const c = col.clone().convertLinearToSRGB(); return [c.r * 255, c.g * 255, c.b * 255, a]; };

// The viewer's lush terrain for seed 7: the same seed offset, sea level and height field, but
// shaded with smooth gradients instead of bands.
const rnd = mulberry32(7 * 7919 + 13);
const off = [rnd() * 50, rnd() * 50, rnd() * 50];
const sea = 0.47 + rnd() * (0.55 - 0.47);
const ocean = gradient([V2.ocean[0], V2.ocean[1], V2.ocean[2], V2.ocean[3]]);
const land = gradient(V2.land.slice(1));
const cap = gradient(V2.cap.slice(1));
const surfaceTex = canvasTexture(1024, 512, (u, v) => {
  const [x, y, z] = sphereDir(u, v);
  const h = fbm(x * 1.6 + off[0], y * 1.6 + off[1], z * 1.6 + off[2]) + (fbm(x * 4.1 + off[2], y * 4.1 + off[0], z * 4.1 + off[1]) - 0.5) * 0.22;
  const lat = Math.abs(y) + (fbm(x * 3 + off[0], y * 3 + off[1], z * 3 + off[2]) - 0.5) * 0.25;
  let c = h < sea ? ocean(1 - (sea - h) / 0.25) : land((h - sea) / 0.25);
  if (lat > 0.86) c = c.lerp(cap((lat - 0.86) / 0.14), Math.min(1, (lat - 0.86) / 0.04));
  return bytes(c);
});
// Clouds and ring: an opaque colour map plus a separate alphaMap (alpha baked into a canvas is
// premultiplied away, which fringes the edges dark once the mipmaps blend it).
const alphaTexture = (w, h, alpha) => {
  const tex = canvasTexture(w, h, (u, v) => { const a = alpha(u, v) * 255; return [a, a, a, 255]; });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
};
const cloudCream = new THREE.Color(V2.cloud[3]), cloudShade = new THREE.Color(V2.cloud[1]);
const cloudField = (u, v) => {
  const [x, y, z] = sphereDir(u, v);
  return THREE.MathUtils.smoothstep(fbm(x * 2.2 + 40, y * 2.2 * 1.8 + 3, z * 2.2 + 17), 0.56, 0.72);
};
const cloudTex = canvasTexture(1024, 512, (u, v) => bytes(cloudShade.clone().lerp(cloudCream, cloudField(u, v))));
const cloudAlpha = alphaTexture(1024, 512, (u, v) => cloudField(u, v) * 0.92);
const ringBands = (() => { const r = mulberry32(99); return Array.from({ length: 64 }, () => [r(), r()]); })(); // radial bands with seeded gaps
const ringC = gradient(V2.ring.slice(1));
const ringTex = canvasTexture(256, 1, (u) => bytes(ringC(ringBands[Math.floor(u * 64)][0])));
const ringAlpha = alphaTexture(256, 1, (u) => (ringBands[Math.floor(u * 64)][1] < 0.25 ? 0.15 : 0.47 + 0.47 * Math.sin(u * Math.PI)));

// ---------------------------------------------------------------- hero planet
const std = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, metalness: 0, ...extra });
const hero = new THREE.Group();
scene.add(hero);
const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: surfaceTex, roughness: 0.85, metalness: 0 }));
planet.castShadow = planet.receiveShadow = true;
hero.add(planet);
const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.06, 128, 64), new THREE.MeshStandardMaterial({ map: cloudTex, alphaMap: cloudAlpha, transparent: true, depthWrite: false, roughness: 1 }));
hero.add(clouds);

const ringGeo = new THREE.RingGeometry(RING.inner, RING.inner + RING.width, 256, 1);
{ // the usual fix so the texture runs across the ring radially
  const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - RING.inner) / RING.width, 0.5); }
}
const ring = new THREE.Mesh(ringGeo, std(WHITE, { map: ringTex, alphaMap: ringAlpha, transparent: true, side: THREE.DoubleSide, roughness: 0.9 }));
ring.rotation.x = -Math.PI / 2; // RingGeometry is in XY; lay it in the planet's equator (XZ)
ring.castShadow = ring.receiveShadow = true;
const ringTilt = new THREE.Group();
ringTilt.rotation.set(...RING.tilt);
ringTilt.add(ring);
hero.add(ringTilt);

const moons = MOONS.map((m) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(m.size, 32, 16), std(V2.moonBody[2]));
  mesh.castShadow = mesh.receiveShadow = true;
  hero.add(mesh);
  return { ...m, mesh };
});

// ---------------------------------------------------------------- stars
{
  const r = mulberry32(4242);
  const pts = [];
  for (let i = 0; i < 2500; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * s * 400, u * 400, Math.sin(a) * s * 400);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: WHITE, size: 1.4, sizeAttenuation: false })));
}

// ---------------------------------------------------------------- crew
// The classic primitive astronaut: capsule body and limbs, sphere helmet, glossy visor,
// glowing eyes and shoulder bands in the contributor colour.
const H = FIGURE.height;
function astronaut(color) {
  const suit = std(BLK.suit[2], { roughness: 0.55 });
  const gear = std(BLK.gear[1], { roughness: 0.6 });
  const accent = std(BLK.contributors[color][2], { roughness: 0.5 });
  const visor = new THREE.MeshPhysicalMaterial({ color: BLK.visor[0], metalness: 0.6, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glow = new THREE.MeshStandardMaterial({ color: BLK.contributors[color][3], emissive: BLK.contributors[color][3], emissiveIntensity: 2.5 });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const add = (geo, mat, [x, y, z], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * H, y * H + FIGURE.lift, z * H);
    m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true;
    body.add(m);
    return m;
  };
  add(new THREE.SphereGeometry(0.285 * H, 48, 32), suit, [0, 0.715, 0]); // helmet, ~57% of the height
  add(new THREE.SphereGeometry(0.2 * H, 48, 32), visor, [0, 0.72, 0.17]).scale.set(1.15, 0.85, 0.6);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.028 * H, 16, 8), glow, [s * 0.065, 0.73, 0.29]);
  add(new THREE.CapsuleGeometry(0.15 * H, 0.08 * H, 8, 24), suit, [0, 0.37, 0]).scale.set(1.05, 1, 0.8); // torso
  add(new THREE.BoxGeometry(0.184 * 2 * H, 0.137 * 2 * H, 0.079 * 2 * H), gear, [0, 0.4, -0.16]); // backpack
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.058 * H, 0.17 * H, 8, 16), suit, [s * 0.22, 0.36, 0], [0, 0, s * 0.6]); // arm
    add(new THREE.TorusGeometry(0.062 * H, 0.018 * H, 12, 32), accent, [s * 0.19, 0.44, 0], [0, Math.PI / 2, s * 0.6]); // shoulder band
    add(new THREE.SphereGeometry(0.063 * H, 24, 16), gear, [s * 0.29, 0.25, 0.02]); // mitt
    add(new THREE.CapsuleGeometry(0.07 * H, 0.12 * H, 8, 16), suit, [s * 0.09, 0.15, 0]); // leg
    add(new THREE.BoxGeometry(0.13 * H, 0.09 * H, 0.18 * H), gear, [s * 0.09, 0.045, 0.03]); // boot
  }
  return { root, body };
}
const crew = CREW.map((c) => {
  const a = astronaut(c.color);
  a.root.position.set(...c.pos);
  a.root.rotation.y = c.yaw;
  scene.add(a.root);
  return { ...a, phase: c.phase };
});

// ---------------------------------------------------------------- post
// MSAA on the composer's target (three's documented fix: antialias: true alone doesn't reach a composer).
const size = renderer.getDrawingBufferSize(new THREE.Vector2());
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(1); // the target is already at drawing-buffer size
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(size, 0.55, 0.45, 0.82));
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- frame
const up = new THREE.Vector3(0, 1, 0);
function pose(t, eased) {
  const m = (eased ? easedMotion : constantMotion)(t);
  planet.rotation.y = m.spin;
  clouds.rotation.y = m.clouds;
  for (const moon of moons) { // the viewer's inclined orbits
    const a = m.moon + moon.offset * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * moon.orbit, -Math.sin(a) * moon.orbit * Math.sin(moon.incl), Math.sin(a) * moon.orbit * Math.cos(moon.incl));
    moon.mesh.position.copy(p.applyAxisAngle(up, moon.yaw));
  }
  const W = (Math.PI * 2) / 12;
  for (const a of crew) { // the viewer's idle bob
    const p = t + a.phase;
    a.body.position.y = Math.sin(p * 2 * W) * 0.05;
    a.body.rotation.z = Math.sin(p * W) * 0.07;
    a.body.rotation.x = Math.sin(p * W + 1.3) * 0.05;
  }
}

window.defaults = {
  ready: true,
  /** Render the scene at time t (s); eased = tweened spin and orbits (the default), else constant rates. Returns a PNG data URL. */
  render(t, eased = true) {
    pose(t, eased);
    controls.update();
    composer.render();
    return renderer.domElement.toDataURL('image/png');
  },
  size: () => [renderer.domElement.width, renderer.domElement.height],
  internals: { scene, renderer, sun, planet, clouds, ring, crew }, // for probes
};
