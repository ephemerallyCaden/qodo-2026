// Fog of war's uniforms and data on the GPU (#74): each planet's cell texture and uniforms, the
// shared fog uniforms, and the moons' per-instance fog. The GLSL and the look's constants are
// fog-glsl.ts; the state is model/fog.ts. Colours come only from palette.ts (AGENTS.md Rule 5):
// the veil's mixes are palette roles (palette.fog.veil), picked here and never mixed on the GPU.
import * as THREE from 'three';
import { FOG_RAMPS, palette, type FogRamp, type Ramp } from '../../../src/core/palette.js';
import { FOG_TEX_ROWS, type FileFogAt, type Pulse, type SurfacePlan, cellRows } from '../model/fog.js';
import { centresOf } from '../model/territory.js';
import { color } from './materials.js';

/** The veil of a ramp drawn in the view, by palette role: [lit, night, hatch, line]. */
export function veilOf(role: FogRamp): THREE.Color[] {
  const v = palette.fog.veil[role];
  return [v.lit, v.night, v.hatch, v.line].map(color);
}
/** The palette role of a ramp the view draws (by identity: looks.ts hands out the palette's own arrays). */
export function fogRole(r: Ramp): FogRamp {
  const role = FOG_RAMPS.find((k) => palette.world[k] === r);
  if (!role) throw new Error('fog: a ramp with no veil in palette.fog.veil');
  return role;
}

/** Uniforms every fogged material shares, written once per draw. */
export const FOG_SHARED = {
  uFogPhase: { value: 0 },
  uFogView: { value: new THREE.Vector2(320, 180) },
  uFogTeal: { value: color(palette.accent.teal[3]) },
  uFogLimb: { value: color(palette.world.halo) },
};

/** One planet's fog: its plan, its cell texture and the uniforms its surface, cloud shadow and haze share. */
export class PlanetFog {
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly data: Float32Array;
  private readonly tex: THREE.DataTexture;

  constructor(readonly plan: SurfacePlan, ramps: readonly [Ramp, Ramp, Ramp, Ramp]) {
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
      uFogModel: { value: new THREE.Matrix4() },
      uFogToSurface: { value: new THREE.Matrix4() },
      uFogRadiusPx: { value: 0 },
      uFogVeil: { value: ramps.flatMap((r) => veilOf(fogRole(r))) },
    };
    this.set(plan.fileIds.map(() => ({ fogged: true, kind: 0, progress: 0 })), null);
  }

  /** The planet's files at a frame (in plan order) and its pulse. */
  set(at: readonly FileFogAt[], pulse: Pulse | null): void {
    cellRows(this.plan, at, this.data);
    this.tex.needsUpdate = true;
    const u = this.uniforms;
    const pv = u['uFogPulse']!.value as THREE.Vector4;
    if (pulse) {
      const c = centresOf(this.plan.territory.cells);
      pv.set(c[3 * pulse.cell]!, c[3 * pulse.cell + 1]!, c[3 * pulse.cell + 2]!, Math.max(1e-4, pulse.progress));
    } else pv.w = 0;
    u['uFogOn']!.value = pulse || at.some((f) => f.fogged || f.kind !== 0) ? 1 : 0;
  }

  dispose(): void { this.tex.dispose(); }
}

/** Per-instance fog of a moon or moonlet mesh: (fogged, event kind, progress). */
export function moonFogAttribute(count: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3).fill(0), 3);
  for (let i = 0; i < count; i++) a.setX(i, 1); // fogged until a fog view says otherwise (Rule 1)
  return a;
}
export function setMoonFog(a: THREE.InstancedBufferAttribute, at: readonly FileFogAt[]): void {
  at.forEach((f, i) => a.setXYZ(i, f.fogged ? 1 : 0, f.kind, f.progress));
  a.needsUpdate = true;
}
