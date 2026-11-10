// Small 3D vector maths shared by the camera, the scene model and cloud placement. Pure.

export type Vec3 = [number, number, number];
/** A body as a sphere: what picking, focus, culling and label occlusion all work with. */
export interface Sphere { centre: Vec3; radius: number }

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Divides by the length (not × 1/length), so ports of the asset viewer stay bit-identical. */
export const normalize = (a: Vec3): Vec3 => { const l = length(a); return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
