// What the star hides (docs/features/star-art.md S2), from the numbers the star shader draws with:
// picking and labels treat everything behind its disc or its corona as hidden. Pure.
import type { Occluder } from './vec.js';

const HALO = 1.13, LUMP = 0.1, GRAIN = 0.04;
/**
 * The corona's outer (halo) edge, in star radii: halo + lump × f + grain × f2 for its two fbm fields
 * f, f2 in 0..1 (render/shaders.ts STAR_FRAG), so it never reaches past `reach`, where the shader
 * also clamps it.
 */
export const CORONA = { halo: HALO, lump: LUMP, grain: GRAIN, reach: HALO + LUMP + GRAIN } as const;

/**
 * The star at the origin as occluders: its disc, a sphere of its radius, and its corona, the flat disc
 * the shader draws through its centre facing the eye, out to CORONA.reach. A body in front of that
 * plane still shows over the corona; one behind it is hidden.
 */
export const starOccluders = (radius: number): Occluder[] => [
  { centre: [0, 0, 0], radius },
  { centre: [0, 0, 0], radius: radius * CORONA.reach, flat: true },
];
