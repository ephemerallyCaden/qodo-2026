// Fog of war on the GPU (#74; cloud since #224): each planet's cell texture and uniforms, its fog sky
// (the storm cloud, the teal of a clear, the mist and the storm's shadow, as instanced puffs over the
// ground), and the moons' per-instance fog. The GLSL is fog-glsl.ts and the cloud's placement
// model/fog-cloud.ts; the state is model/fog.ts. Colours come only from palette.ts (AGENTS.md Rule 5).
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import { CloudPlan, puffRise, SKY_SITES, type Puff } from '../model/fog-cloud.js';
import { FOG_TEX_ROWS, type FileFogAt, type Pulse, type SurfacePlan, cellRows } from '../model/fog.js';
import { centresOf } from '../model/territory.js';
import { tangentFrame } from './noise.js';
import { color } from './materials.js';

/** Uniforms every fogged material shares. */
export const FOG_SHARED = {
  uFogTeal: { value: color(palette.accent.teal[3]) },
};

/** One planet's fog: its plan, its cell texture, the uniforms its surface, shadows, haze and smoke share, and its sky. */
export class PlanetFog {
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly data: Float32Array;
  private readonly tex: THREE.DataTexture;
  private sky: FogClouds | null = null;
  private at: readonly FileFogAt[];

  constructor(readonly plan: SurfacePlan) {
    const n = plan.territory.cells;
    this.data = new Float32Array(n * FOG_TEX_ROWS * 4);
    this.tex = new THREE.DataTexture(this.data, n, FOG_TEX_ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; // texelFetch only; never filtered (Rule 4)
    this.tex.generateMipmaps = false;
    this.uniforms = {
      ...FOG_SHARED,
      uFogOn: { value: 0 },
      uFogCells: { value: this.tex },
      uFogN: { value: n },
      uFogWin: { value: plan.window },
      uFogPulse: { value: new THREE.Vector4(0, 1, 0, 0) },
      uFogToSurface: { value: new THREE.Matrix4() },
    };
    this.at = plan.fileIds.map(() => ({ level: 2, from: 2, kind: 0, progress: 0 })); // fogged until a fog view says otherwise (Rule 1)
    this.set(this.at, null);
  }

  /** Draws this planet's fog sky from now on, starting at the files' current fog. */
  draw(sky: FogClouds): void {
    this.sky = sky;
    sky.set(this.at);
  }

  /** The planet's files at a frame (in plan order) and its pulse. */
  set(at: readonly FileFogAt[], pulse: Pulse | null): void {
    this.at = at;
    cellRows(this.plan, at, this.data);
    this.tex.needsUpdate = true;
    const u = this.uniforms;
    const pv = u['uFogPulse']!.value as THREE.Vector4;
    if (pulse) {
      const c = centresOf(this.plan.territory.cells);
      pv.set(c[3 * pulse.cell]!, c[3 * pulse.cell + 1]!, c[3 * pulse.cell + 2]!, Math.max(1e-4, pulse.progress));
    } else pv.w = 0;
    u['uFogOn']!.value = pulse || at.some((f) => f.level > 0 || f.kind !== 0) ? 1 : 0;
    this.sky?.set(at);
  }

  dispose(): void { this.tex.dispose(); }
}

/** Puffs per site at most, per layer: a lead puff and its satellites (model/fog-cloud.ts STORM.sats, MIST.sats). */
const PUFFS_PER_SITE = 4;
/** The sky's reach in planet radii, past the tallest puff: what culling tests (the puffs change, so it is set, not fitted). */
const SKY_REACH = 1.6;

/** The materials a fog sky draws with: the storm cloud, its teal while clearing, the mist, and the storm's shadow on the ground. */
export interface FogSkyMaterials { storm: THREE.Material; teal: THREE.Material; mist: THREE.Material; shadow: THREE.Material }

/** Puff geometry at two levels of detail (render/planet.ts PUFF_LOD). */
export interface PuffGeometry { near: THREE.BufferGeometry; far: THREE.BufferGeometry }

const M4 = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
/** A puff's instance matrix: squashed along its direction and set at its rise, as the weather's puffs (render/planet.ts put()). */
function puffMatrix(p: Puff): THREE.Matrix4 {
  const l = Math.hypot(p.dir[0], p.dir[1], p.dir[2]);
  const d: [number, number, number] = [p.dir[0] / l, p.dir[1] / l, p.dir[2] / l];
  const { east, north } = tangentFrame(d);
  M4.makeBasis(X.set(east[0], east[1], east[2]).multiplyScalar(p.size * p.stretch), Y.set(d[0], d[1], d[2]).multiplyScalar(p.size * p.flat), Z.set(north[0], north[1], north[2]).multiplyScalar(p.size));
  const r = puffRise(p);
  return M4.setPosition(d[0] * r, d[1] * r, d[2] * r);
}

/** One layer of puffs: an instanced mesh and its per-puff mass anchors (CLOUD_VERT aMass). */
class Layer {
  readonly mesh: THREE.InstancedMesh;
  private readonly mass: THREE.InstancedBufferAttribute;
  readonly geos: PuffGeometry;

  constructor(geos: PuffGeometry, material: THREE.Material, capacity: number) {
    this.mass = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.geos = { near: geos.near.clone(), far: geos.far.clone() }; // each layer carries its own anchors
    this.geos.near.setAttribute('aMass', this.mass);
    this.geos.far.setAttribute('aMass', this.mass);
    this.mesh = new THREE.InstancedMesh(this.geos.far, material, capacity);
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_REACH);
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  set(puffs: readonly Puff[]): void {
    const n = Math.min(puffs.length, this.mass.count);
    for (let i = 0; i < n; i++) {
      const p = puffs[i]!;
      this.mesh.setMatrixAt(i, puffMatrix(p));
      if (p.anchor) this.mass.setXYZW(i, p.anchor[0], p.anchor[1], p.anchor[2], 1);
      else this.mass.setXYZW(i, 0, 0, 0, 0);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mass.needsUpdate = true;
  }

  lod(near: boolean): void { this.mesh.geometry = near ? this.geos.near : this.geos.far; }
  dispose(): void { this.geos.near.dispose(); this.geos.far.dispose(); this.mesh.dispose(); }
}

/**
 * A planet's fog sky (#224): C6's storm cloud over every fogged file's territory, in the ground's frame
 * (add `group` to the surface's spin) so it stays over its files, with its shadow on the ground; the
 * clearing part of it in teal; and mist over every misted file, with no shadow. Rebuilt only when the
 * files' fog changes, so a frame is still a pure function of (fog, events, frame).
 */
export class FogClouds {
  readonly group = new THREE.Group();
  private readonly plan: CloudPlan;
  private readonly storm: Layer;
  private readonly teal: Layer;
  private readonly mist: Layer;
  private readonly shadow: THREE.InstancedMesh;
  private shadowOn = true;
  private key = '';

  constructor(plan: SurfacePlan, seed: number, geos: PuffGeometry, mats: FogSkyMaterials) {
    this.plan = new CloudPlan(plan, seed);
    const cap = Math.max(plan.territory.cells, SKY_SITES) * PUFFS_PER_SITE;
    this.storm = new Layer(geos, mats.storm, cap);
    this.teal = new Layer(geos, mats.teal, cap);
    this.mist = new Layer(geos, mats.mist, cap);
    this.shadow = new THREE.InstancedMesh(this.storm.geos.far, mats.shadow, cap);
    this.shadow.instanceMatrix = this.storm.mesh.instanceMatrix; // the storm's puffs, projected onto the surface
    this.shadow.boundingSphere = this.storm.mesh.boundingSphere;
    this.shadow.count = 0;
    this.shadow.visible = false;
    this.group.add(this.storm.mesh, this.shadow, this.teal.mesh, this.mist.mesh);
  }

  /** The files' fog at a frame (in plan order). */
  set(at: readonly FileFogAt[]): void {
    const key = at.map((f) => `${f.level}${f.from}${f.kind}${f.progress}`).join(',');
    if (key === this.key) return;
    this.key = key;
    const sky = this.plan.at(at);
    this.storm.set(sky.storm);
    this.teal.set(sky.teal);
    this.mist.set(sky.mist);
    this.shadow.count = this.storm.mesh.count;
    this.shadow.visible = this.shadowOn && this.shadow.count > 0;
  }

  /** The level of detail for the planet's size on screen: near puffs, and whether the storm casts its shadow. */
  lod(near: boolean, shadow: boolean): void {
    for (const l of [this.storm, this.teal, this.mist]) l.lod(near);
    this.shadow.geometry = this.storm.mesh.geometry;
    this.shadowOn = shadow;
    this.shadow.visible = shadow && this.shadow.count > 0;
  }

  dispose(): void {
    for (const l of [this.storm, this.teal, this.mist]) l.dispose();
    this.shadow.dispose();
  }
}

/** Per-instance fog of a moon or moonlet mesh: (level at rest 0..2, event kind, progress, the level the event started from). */
export function moonFogAttribute(count: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4).fill(0), 4);
  for (let i = 0; i < count; i++) a.setXYZW(i, 2, 0, 0, 2); // fogged until a fog view says otherwise (Rule 1)
  return a;
}
export function setMoonFog(a: THREE.InstancedBufferAttribute, at: readonly FileFogAt[]): void {
  at.forEach((f, i) => a.setXYZW(i, f.level, f.kind, f.progress, f.from));
  a.needsUpdate = true;
}
