// The star's corona as the CPU sees it (docs/features/star-art.md S2), from the numbers the star
// shader draws with. Pure.
const HALO = 1.13, LUMP = 0.1, GRAIN = 0.04;
/**
 * The corona's outer (halo) edge, in star radii: halo + lump × f + grain × f2 for its two fbm fields
 * f, f2 in 0..1 (render/shaders.ts STAR_FRAG), so it never reaches past `reach`, where the shader
 * also clamps it.
 */
export const CORONA = { halo: HALO, lump: LUMP, grain: GRAIN, reach: HALO + LUMP + GRAIN } as const;

