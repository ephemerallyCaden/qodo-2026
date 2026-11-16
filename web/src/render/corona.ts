// The star's corona outline on the CPU (render/shaders.ts STAR_FRAG, docs/features/star-art.md S2):
// the same fbm fields at the same churn, so picking and labels hide exactly what the corona draws over,
// lumps and gaps alike. Pure: no three.js.
import { turnAngle, TURNS } from '../model/motion.js';
import { CORONA } from '../model/star.js';
import type { Occluder } from '../model/vec.js';
import { fbm } from './noise.js';

/** The corona's halo edge, in star radii, toward unit direction `a` (x right, y up as the camera sees it) at a frame. */
export function coronaEdge(a: readonly [number, number], frame: number): number {
  const churn = turnAngle(frame, TURNS.starChurn), c = Math.cos(churn), s = Math.sin(churn);
  const f = fbm(a[0] * 1.7, a[1] * 1.7 + c * 0.55, s * 0.55);
  const f2 = fbm(a[0] * 4.2 + s * 0.35, a[1] * 4.2 + c * 0.35, 3);
  return Math.min(CORONA.halo + CORONA.lump * f + CORONA.grain * f2, CORONA.reach);
}

/**
 * The star at the origin as occluders at a frame: its disc, a sphere of its radius, and its corona, the
 * flat disc the shader draws through its centre facing the eye, out to its lumpy edge. A body in front
 * of that plane still shows over the corona, and so does one seen past the edge; one behind it is hidden.
 */
export const starOccluders = (radius: number, frame: number): Occluder[] => [
  { centre: [0, 0, 0], radius },
  { centre: [0, 0, 0], radius: radius * CORONA.reach, flat: true, edge: (a) => radius * coronaEdge(a, frame) },
];
