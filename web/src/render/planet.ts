// One planet: surface, clouds and their shadows, haze and test moons, built from a
// PlanetModel and posed purely from a frame number. Ported from the asset viewer's makePlanet and
// rebuild (feature/asset-library mockups/asset-viewer/viewer.js), so a planet looks as the human
// approved there. Seeded from biomeSeed (decorative, principle 4); never Math.random.
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import { TURNS, turnAngle } from '../model/motion.js';
import { mulberry32 } from '../model/prng.js';
import { MOON_RADIUS, moonOffset, planetReach, type PlanetModel } from '../model/system.js';
import { dot, normalize, type Vec3 } from '../model/vec.js';
import { LOOKS, type Weather } from './looks.js';
import { orbitingSpheres, placeSpheres, ramp, shaderMaterial, toonMaterial } from './materials.js';
import { crackMask, crackShare, makeFbm3, nearestCell, poolField, tangentFrame, voronoiCells } from './noise.js';
import { CLOUD_FRAG, CLOUD_VERT, CRACKS, HAZE_FRAG, PLANET_FRAG, SHADOW_FRAG, SHADOW_VERT, type CrackSpec } from './shaders.js';

const PLANET_GEO = new THREE.SphereGeometry(1, 72, 48);
/**
 * Puff level of detail, by the planet's radius on screen in internal px (a function of the camera
 * pose and pixel height, so frames stay deterministic). A puff is about 0.06–0.1 planet radii, so
 * below NEAR_PX it is a few px across and a 20-face icosahedron with smooth normals draws the same
 * pixels as the 80-face icosphere used above it. Below SHADOW_MIN_PX cloud shadows are sub-pixel
 * noise and are skipped. Keeps a system inside the 500k-triangle budget (system design §10).
 */
export const PUFF_LOD = { nearPx: 48, shadowMinPx: 16 } as const;
const PUFF_NEAR = new THREE.IcosahedronGeometry(1, 1);
const PUFF_FAR = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) nrm.setXYZ(i, pos.getX(i), pos.getY(i), pos.getZ(i)); // unit sphere: normal = position
  return g;
})();
export const MOON_GEO = new THREE.SphereGeometry(1, 20, 14);
/** Cap on cloud puffs per planet (the asset viewer's, enough for its densest weather). */
const MAX_PUFFS = 3200;

const crackLift = (size: number) => {
  const { max, from, to } = CRACKS.lift;
  return max * (1 - THREE.MathUtils.clamp((size - from) / (to - from), 0, 1));
};

/** n evenly spread unit directions (a Fibonacci sphere, the asset viewer's sampling). */
function fibonacciDirs(n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), lon = i * 2.39996;
    return [Math.cos(lon) * r, y, Math.sin(lon) * r];
  });
}
/** The value with `share` of the values above it (largest first). */
const quantile = (values: readonly number[], share: number): number => [...values].sort((a, b) => b - a)[Math.round(share * values.length)]!;

/** poolField per plate, memoised: many samples fall in the same plate. */
function poolFieldOf(off: Vec3, scale: number): (cell: Vec3) => number {
  const memo = new Map<string, number>();
  return (cell) => {
    const key = cell.join(',');
    let v = memo.get(key);
    if (v === undefined) memo.set(key, (v = poolField(cell, off, scale)));
    return v;
  };
}

/** The field cut that opens `share` of the sphere (lava pools, ice water), by a quantile over Fibonacci samples. */
function poolCut({ freq, pool }: CrackSpec, off: Vec3): number {
  const field = poolFieldOf(off, pool.scale);
  return quantile(fibonacciDirs(3000).map((d) => field(nearestCell(d[0] * freq + off[0], d[1] * freq + off[1], d[2] * freq + off[2]))), pool.share);
}

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

export interface PlanetObject {
  model: PlanetModel;
  root: THREE.Group;
  update(frame: number, centre: Vec3, radiusPx: number): void;
  dispose(): void;
}

export function makePlanet(model: PlanetModel): PlanetObject {
  const look = LOOKS[model.look];
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(model.radius);
  root.add(body);

  const rnd = mulberry32(model.seed * 7919 + 13);
  const seedOff: Vec3 = [rnd() * 50, rnd() * 50, rnd() * 50];
  const [s0, s1] = look.sea;
  const sea = s0 + rnd() * (s1 - s0);
  const lift = crackLift(model.radius);
  const cut = model.look === 'lava' ? poolCut(CRACKS.lava, seedOff)
    : model.look === 'ice' ? poolCut(CRACKS.ice, [seedOff[1], seedOff[2], seedOff[0]]) // the shader's uSeedOff.yzx
    : 9;
  const [a, b, c, g] = look.ramps;

  const surfaceMat = shaderMaterial(PLANET_FRAG, {
    uBiome: { value: look.id },
    uA: { value: ramp(a, 5) }, uB: { value: ramp(b, 5) }, uC: { value: ramp(c, 5) }, uG: { value: ramp(g, 3) },
    uSeedOff: { value: v3(seedOff) }, uSea: { value: sea }, uPoolCut: { value: cut }, uCrackLift: { value: lift },
    uBands: { value: new THREE.Vector3(0.2, 0.58, 0.86) }, // lit directional terminator, crescent bands
    uLavaTime: { value: new THREE.Vector2(1, 0) },
  });
  const spin = new THREE.Group();
  const surface = new THREE.Mesh(PLANET_GEO, surfaceMat);
  spin.add(surface);
  body.add(spin);

  const disposables: { dispose(): void }[] = [surfaceMat];
  let haze: THREE.Mesh | null = null;
  if (look.haze) {
    const hazeMat = shaderMaterial(HAZE_FRAG, { uHaze: { value: ramp([look.haze], 1)[0] } });
    haze = new THREE.Mesh(PLANET_GEO, hazeMat);
    haze.scale.setScalar(1.06);
    body.add(haze);
    disposables.push(hazeMat);
  }

  const center = { value: new THREE.Vector3() };
  const radius = { value: model.radius };
  const sky = new THREE.Group();
  body.add(sky);
  let shadowMat: THREE.ShaderMaterial | null = null;
  let puffs: THREE.InstancedMesh | null = null, shadow: THREE.InstancedMesh | null = null;
  let puffGeos: { near: THREE.BufferGeometry; far: THREE.BufferGeometry } | null = null;
  if (look.weather) {
    const clouds = buildWeather(look.weather, model.seed, rnd, seedOff, cut, lift);
    const cloudMat = shaderMaterial(CLOUD_FRAG, {
      uRamp: { value: ramp(look.weather.ramp, 4) }, uCenter: center,
      uBands: { value: new THREE.Vector3(-0.3, 0.12, 0.42) },
    }, { vertexShader: CLOUD_VERT });
    // Both detail levels carry this planet's per-puff mass anchors.
    const near = PUFF_NEAR.clone(), far = PUFF_FAR.clone();
    near.setAttribute('aMass', clouds.mass);
    far.setAttribute('aMass', clouds.mass);
    puffGeos = { near, far };
    puffs = new THREE.InstancedMesh(far, cloudMat, clouds.matrices.length);
    clouds.matrices.forEach((m, i) => puffs!.setMatrixAt(i, m));
    puffs.computeBoundingSphere(); // over the instances, so an off-screen planet's clouds are culled
    sky.add(puffs);
    disposables.push(cloudMat, near, far, puffs);
    if (!look.weather.fissure) {
      shadowMat = new THREE.ShaderMaterial({
        vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        uniforms: { ...surfaceMat.uniforms, uCenter: center, uRadius: radius, uToSurface: { value: new THREE.Matrix4() } },
      });
      shadow = new THREE.InstancedMesh(far, shadowMat, 0);
      shadow.instanceMatrix = puffs.instanceMatrix; // the same puffs, projected onto the surface
      shadow.count = puffs.count;
      shadow.boundingSphere = puffs.boundingSphere; // the shadows lie on the surface, inside the clouds' sphere
      sky.add(shadow);
      disposables.push(shadowMat, shadow);
    }
  }

  // Test moons: warm three-tone spheres, all one size, on inclined orbits (one per surface turn).
  let moons: THREE.InstancedMesh | null = null;
  if (model.moons.length > 0) {
    const moonMat = toonMaterial(palette.world.moonBody);
    moons = orbitingSpheres(moonMat, model.moons.length, planetReach(model), MOON_GEO);
    root.add(moons);
    disposables.push(moonMat, moons);
  }

  /** radiusPx: the planet's radius on screen in internal px, for the puff level of detail. */
  function update(frame: number, centreAt: Vec3, radiusPx: number): void {
    root.position.set(centreAt[0], centreAt[1], centreAt[2]);
    if (puffs && puffGeos) {
      puffs.geometry = radiusPx >= PUFF_LOD.nearPx ? puffGeos.near : puffGeos.far;
      if (shadow) { shadow.geometry = puffs.geometry; shadow.visible = radiusPx >= PUFF_LOD.shadowMinPx; }
    }
    const turn = turnAngle(frame, TURNS.surface);
    spin.rotation.y = -turn; // right to left
    sky.rotation.y = -turnAngle(frame, TURNS.clouds); // clouds drift ahead of the ground
    const lava = turnAngle(frame, TURNS.lava);
    (surfaceMat.uniforms['uLavaTime']!.value as THREE.Vector2).set(Math.cos(lava), Math.sin(lava));
    if (moons) placeSpheres(moons, model.moons.map((m) => moonOffset(m, frame)), MOON_RADIUS);
    center.value.copy(root.position);
    if (shadowMat) {
      root.updateMatrixWorld(true); // the shadow pass needs this frame's surface matrix now; render() updates the rest
      (shadowMat.uniforms['uToSurface']!.value as THREE.Matrix4).copy(surface.matrixWorld).invert();
    }
  }

  return {
    model,
    root,
    update,
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}

interface WeatherBuild { matrices: THREE.Matrix4[]; mass: THREE.InstancedBufferAttribute }

/**
 * Cloud, spore or ash puffs (asset viewer rebuild): one fbm field makes a few big merged masses, a
 * latitude-stretched field makes east-west streaks, and the rest stays clear sky. Cover comes from a
 * quantile of the field, so it holds per seed. Lava smoke rises only off the visible fissures.
 */
function buildWeather(weather: Weather, seed: number, rnd: () => number, off: Vec3, openCut: number, lift: number): WeatherBuild {
  const matrices: THREE.Matrix4[] = [];
  const puffMass: number[] = [];
  let mass = -1;
  const put = (dir: Vec3, size: number, lft: number, flat: number, stretch: number) => {
    if (matrices.length >= MAX_PUFFS) return;
    const d = normalize(dir);
    const { east, north } = tangentFrame(d);
    const m = new THREE.Matrix4().makeBasis(v3(east).multiplyScalar(size * stretch), v3(d).multiplyScalar(size * flat), v3(north).multiplyScalar(size));
    m.setPosition(v3(d).multiplyScalar(1 + weather.float + size * flat * (0.75 + lft * 0.5)));
    puffMass.push(mass);
    matrices.push(m);
  };
  const clump = (center: Vec3, size: number, lft: number, satellites: number, flat: number, stretch: number) => {
    put(center, size, lft, flat, stretch);
    const { east, north } = tangentFrame(normalize(center));
    for (let k = 0; k < satellites; k++) {
      const ang = rnd() * Math.PI * 2;
      const o = size * (0.9 + rnd() * 0.5);
      const ex = Math.cos(ang) * o * 1.4 * stretch, nx = Math.sin(ang) * o * 0.7;
      put([center[0] + east[0] * ex + north[0] * nx, center[1] + east[1] * ex + north[1] * nx, center[2] + east[2] * ex + north[2] * nx], size * (0.5 + rnd() * 0.25), lft * 0.5, flat, stretch);
    }
  };

  const share = Math.min(1, weather.cover * weather.gain);
  const SITES = weather.fissure ? 4000 : Math.round(1500 / weather.size ** 2);
  const dirs = fibonacciDirs(SITES);
  let raw: number[];
  if (weather.fissure) {
    const { freq, cut, half, tip, pool } = CRACKS.lava;
    const patch = makeFbm3(seed * 23 + 3);
    const field = poolFieldOf(off, pool.scale);
    raw = dirs.map((d) => {
      const { edge, own, across } = voronoiCells(d[0] * freq + off[0], d[1] * freq + off[1], d[2] * freq + off[2]);
      const open = [own, across].filter((cell) => field(cell) > openCut).length;
      if (open === 2) return -1; // inside a lake: no edge shows here
      if (open === 0 && crackShare(crackMask(d, freq, off), cut, lift) * half < tip) return -1; // no crack drawn here
      return 1 - (edge / freq) * 8 + (patch(d[0] * 1.6, d[1] * 1.6, d[2] * 1.6) - 0.5) * 0.25;
    });
  } else {
    const massField = makeFbm3(seed * 31 + 5);
    const streakField = makeFbm3(seed * 17 + 9);
    const k = weather.mass;
    raw = dirs.map((d) => Math.max(massField(d[0] * k + 4, d[1] * k, d[2] * k), streakField(d[0] * 0.9, d[1] * 6.0 + 2, d[2] * 0.9)));
  }
  const thr = share > 0 ? quantile(raw, Math.min(share, (SITES - 1) / SITES)) - 0.012 : Infinity;
  // Masses: cloudy sites joined to their neighbours (union-find), so each mass shades as one dome.
  const cloudy = weather.fissure ? [] : dirs.map((_, i) => i).filter((i) => raw[i]! - thr > 0.012);
  const root = new Map(cloudy.map((i) => [i, i]));
  const find = (i: number): number => { while (root.get(i) !== i) { root.set(i, root.get(root.get(i)!)!); i = root.get(i)!; } return i; };
  const near = Math.cos(1.8 * Math.sqrt((4 * Math.PI) / SITES));
  for (let x = 0; x < cloudy.length; x++) for (let y = x + 1; y < cloudy.length; y++) {
    if (dot(dirs[cloudy[x]!]!, dirs[cloudy[y]!]!) > near) root.set(find(cloudy[x]!), find(cloudy[y]!));
  }
  const massOf = new Map<number, number>();
  const masses: number[][] = [];
  for (const i of cloudy) {
    const r = find(i);
    if (!massOf.has(r)) { massOf.set(r, masses.length); masses.push([]); }
    massOf.set(i, massOf.get(r)!);
    masses[massOf.get(r)!]!.push(i);
  }
  for (let i = 0; i < SITES; i++) {
    const density = raw[i]! - thr;
    const jitter: Vec3 = [(rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05];
    const dir = dirs[i]!;
    const at: Vec3 = [dir[0] + jitter[0], dir[1] + jitter[1], dir[2] + jitter[2]];
    mass = massOf.get(i) ?? -1;
    if (weather.fissure) {
      if (density <= 0.012) continue; // below the smoke threshold: clear sky by design
      mass = -1;
      const { east } = tangentFrame(dir);
      const size = (0.022 + rnd() * 0.014) * weather.size * 2;
      const trail = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k <= trail; k++) {
        const s = k * size * weather.stretch * 1.1;
        put([dir[0] + east[0] * s, dir[1] + east[1] * s, dir[2] + east[2] * s], size * (1 - k * 0.22), weather.lift * (1 + k * 0.4), weather.flat, weather.stretch);
      }
    } else if (density > 0.012) {
      const core = Math.min(1, density * 7);
      dirs[i] = at; // the asset viewer jitters the site in place, so its mass anchor sees the jitter too
      clump(at, (0.058 + core * 0.04 + rnd() * 0.01) * weather.size, (0.2 + core * 0.9) * weather.lift, core < 0.35 ? 2 + Math.floor(rnd() * 2) : 1, weather.flat, weather.stretch);
    } else if (density > -0.08 && rnd() < weather.strays) {
      masses.push([i]);
      mass = masses.length - 1;
      dirs[i] = at;
      clump(at, (0.026 + rnd() * 0.012) * weather.size, 0.3 * weather.lift, 2 + Math.floor(rnd() * 2), weather.flat, weather.stretch);
    }
  }
  // Mass anchors: below each mass's centre by about its radius, so the dome normal tilts out to the edge.
  const anchors = (weather.fissure ? [] : masses).map((sites) => {
    const cc: Vec3 = [0, 0, 0];
    for (const i of sites) { const d = dirs[i]!; cc[0] += d[0]; cc[1] += d[1]; cc[2] += d[2]; }
    const cn = normalize(cc);
    const rad = Math.acos(Math.min(1, Math.min(...sites.map((i) => dot(dirs[i]!, cn)))));
    const k = 1 + weather.float - Math.min(0.5, Math.max(0.06, rad * 1.1));
    return [cn[0] * k, cn[1] * k, cn[2] * k] as Vec3;
  });
  const massAttr = new THREE.InstancedBufferAttribute(new Float32Array(matrices.length * 4), 4);
  for (let i = 0; i < matrices.length; i++) {
    const an = anchors[puffMass[i]!];
    if (an) massAttr.setXYZW(i, an[0], an[1], an[2], 1);
    else massAttr.setXYZW(i, 0, 0, 0, 0);
  }
  return { matrices, mass: massAttr };
}
