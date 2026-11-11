// Palette colours as GPU uniforms, and the uniforms every material shares (key light, eye, depth
// tints). Colours only ever come from palette.ts (AGENTS.md Rule 5).
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import type { Vec3 } from '../model/vec.js';
import { TOON_FRAG, VERT } from './shaders.js';

// Palette hexes go to the screen untouched: no sRGB conversion anywhere in the pipeline.
THREE.ColorManagement.enabled = false;

export const color = (hex: string): THREE.Color => new THREE.Color(hex);
/** A ramp as n uniform colours; a shorter ramp repeats its last colour (asset viewer setDepthLevel). */
export const ramp = (hexes: readonly string[], n: number): THREE.Color[] =>
  Array.from({ length: n }, (_, i) => color(hexes[Math.min(i, hexes.length - 1)]!));

/** The key light, view-relative: top-left, about 40° off the view axis (asset viewer LIGHT_DIR). */
export const LIGHT_VIEW = new THREE.Vector3(-0.3, 0.55, 0.78).normalize();

/** Uniforms shared by reference across every material: one write per frame updates them all. */
export const SHARED = {
  uLight: { value: LIGHT_VIEW.clone() },
  uEye: { value: new THREE.Vector3() },
  uDepthOn: { value: true },
  uDepthTint: { value: palette.world.depth.map((d) => { const c = color(d.tint); return new THREE.Vector4(c.r, c.g, c.b, d.strength); }) },
};

type Uniforms = Record<string, THREE.IUniform>;

export function shaderMaterial(fragmentShader: string, uniforms: Uniforms, opts: Partial<THREE.ShaderMaterialParameters> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms: { ...SHARED, ...uniforms }, ...opts });
}

/** Moons and moonlets: a 4-step ramp in light bands. */
export const toonMaterial = (hexes: readonly string[]): THREE.ShaderMaterial =>
  shaderMaterial(TOON_FRAG, { uRamp: { value: ramp(hexes, 4) }, uBands: { value: new THREE.Vector3(-0.15, 0.35, 0.7) } });

/**
 * An instanced mesh of same-size spheres (moons, moonlets) that move on fixed orbits round its
 * origin: one culling sphere of `reach` covers every frame, so it is set once instead of refitted.
 */
export function orbitingSpheres(material: THREE.Material, count: number, reach: number, geo: THREE.BufferGeometry): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), reach);
  return mesh;
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
/** Places instance i at positions[i], all of one radius. */
export function placeSpheres(mesh: THREE.InstancedMesh, positions: readonly Vec3[], radius: number): void {
  S.setScalar(radius);
  positions.forEach((p, i) => mesh.setMatrixAt(i, M4.compose(P.set(p[0], p[1], p[2]), Q, S)));
  mesh.instanceMatrix.needsUpdate = true;
}
