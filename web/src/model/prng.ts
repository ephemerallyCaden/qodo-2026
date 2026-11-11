// Seeded PRNG for decorative render detail (principle 4: decorative and seeded). mulberry32, the
// generator the asset viewer uses, so a seed gives the same cloud and ring placement the human
// approved there. Never Math.random (principle 3).

/** A generator of floats in [0, 1), seeded by a 32-bit integer. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fractional part, for the golden-ratio sequences that place moons and moonlets by slot. */
export const fract = (x: number): number => x - Math.floor(x);

/** 1 / φ: the low-discrepancy step for per-slot offsets; slot k depends only on k, so appending never moves the others. */
export const INV_PHI = (Math.sqrt(5) - 1) / 2;
/** The R2 sequence's steps (1/g, 1/g² for the plastic number g): a 2D low-discrepancy walk by slot. */
export const R2 = [0.7548776662466927, 0.5698402909980532] as const;
