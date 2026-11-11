// The depth fade's reach, scaled to the system (#59; human, 2026-11-10). Pure: no three.js, no DOM.
//
// The smooth fade (art-direction §5) runs in log distance from NEAR to FAR through the palette's four
// depth steps, one equal log segment per step. It was tuned at the hero's scale: a size-1 planet
// focused at distance 7 fades by 0.18. A whole system seen from its start pose sits much further
// out, so on a large system every planet reached the full 0.88 fade. Here the first segment (0 to
// 0.38, out to about 10 units) stays as tuned, so a focused planet and its moons fade exactly as
// before, and the later steps move out in proportion to the system's extent.
import { palette } from '../../../src/core/palette.js';

/** Smooth depth fade (art-direction §5, pixel-smooth): log distance from NEAR to FAR through the four depth steps. */
export const DEPTH_RANGE = { near: 5, far: 44 } as const;
const LOG_SPAN = Math.log(DEPTH_RANGE.far / DEPTH_RANGE.near);
/** The palette's four depth-step strengths, the ones the shader blends between. */
const STRENGTHS = palette.world.depth.map((d) => d.strength);

/**
 * Systems up to this extent (render units) keep the tuned range; it is the contract's `mini`
 * fixture's extent, the system the #30 and #31 goldens were approved on. Past it the 0.72 step
 * sits at about 2.5 extents, just beyond the far side of the system seen from its start pose.
 */
export const DEPTH_REF_EXTENT = 8.4;

/**
 * How the shader stretches the fade for a system (uDepthStretch). With x the tuned fade position
 * (0..3, one unit per depth step): x ≤ 1 is unchanged; up to 2 + shift it becomes
 * 1 + (x - 1) × squeeze; beyond, x - shift. So the second segment's far end moves out in
 * proportion to the extent and the third keeps its length.
 */
export interface DepthStretch { squeeze: number; shift: number }
/** The fade as tuned: what every system no larger than DEPTH_REF_EXTENT gets. */
export const TUNED_DEPTH: DepthStretch = { squeeze: 1, shift: 0 };

export function depthStretch(extent: number): DepthStretch {
  const ls = Math.log(Number.isFinite(extent) ? Math.max(1, extent / DEPTH_REF_EXTENT) : 1); // exactly 0 at scale 1: TUNED_DEPTH
  const segment = LOG_SPAN / 3; // one step, in log distance
  return { squeeze: segment / (segment + ls), shift: ls / segment };
}

/** The fade strength (0..1) at distance d, as the shader computes it. */
export function fadeStrength(d: number, stretch: DepthStretch): number {
  let x = (Math.log(Math.max(d, 1e-3) / DEPTH_RANGE.near) / LOG_SPAN) * 3;
  if (x > 1) x = x <= 2 + stretch.shift ? 1 + (x - 1) * stretch.squeeze : x - stretch.shift;
  x = Math.min(3, Math.max(0, x));
  const i = Math.min(Math.floor(x), 2);
  return STRENGTHS[i]! + (STRENGTHS[i + 1]! - STRENGTHS[i]!) * (x - i);
}
