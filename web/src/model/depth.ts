// The depth fade's reach, scaled to the system (#59; human, 2026-11-10). Pure: no three.js, no DOM.
//
// The smooth fade (art-direction §5) runs in log distance from NEAR to FAR through the palette's four
// depth steps, one equal log segment per step. It was tuned at the hero's scale: a size-1 planet
// focused at distance 7 fades by 0.18. A whole system seen from its start pose sits much further
// out, so on a large system every planet reached the full 0.88 fade. Here the first segment (0 to
// 0.38, out to about 10 units) stays as tuned, so a focused planet and its moons fade exactly as
// before, and the later steps move out in proportion to the system's extent, and always at least
// far enough that the farthest planet seen from the start pose fades no further than 0.72.
import { palette } from '../../../src/core/palette.js';

/** Smooth depth fade (art-direction §5, pixel-smooth): log distance from NEAR to FAR through the four depth steps. */
export const DEPTH_RANGE = { near: 5, far: 44 } as const;
const LOG_SPAN = Math.log(DEPTH_RANGE.far / DEPTH_RANGE.near);
/** Where the tuned fade reaches its 0.72 step: the end of the second of its three equal log segments. */
export const SECOND_STEP = DEPTH_RANGE.near * Math.exp((2 * LOG_SPAN) / 3);
/** The palette's four depth-step strengths, the ones the shader blends between. */
const STRENGTHS = palette.world.depth.map((d) => d.strength);

/**
 * Systems up to this extent (render units) keep the tuned range; it is the contract's `mini`
 * fixture's extent, the system the #30 and #31 goldens were approved on. Past it the 0.72 step
 * sits at about 2.5 extents, usually just beyond the far side of the system seen from its start
 * pose; depthStretch's `farthest` covers the layouts where it isn't.
 */
export const DEPTH_REF_EXTENT = 8.4;

/**
 * How the shader stretches the fade for a system (uDepthStretch). With x the tuned fade position
 * (0..3, one unit per depth step): x ≤ 1 is unchanged; up to 2 + shift it becomes
 * 1 + (x - 1) × squeeze; beyond, x - shift. So the second segment's far end moves out by the
 * scale (depthStretch) and the third keeps its length.
 */
export interface DepthStretch { squeeze: number; shift: number }
/** The fade as tuned: what every system no larger than DEPTH_REF_EXTENT gets. */
export const TUNED_DEPTH: DepthStretch = { squeeze: 1, shift: 0 };

/**
 * The stretch for a system of `extent`, whose farthest planet seen from its start pose is `farthest`
 * away: the 0.72 step moves out by max(1, extent / DEPTH_REF_EXTENT, farthest / SECOND_STEP), so it
 * never falls short of that planet (pose.ts systemDepth).
 */
export function depthStretch(extent: number, farthest = 0): DepthStretch {
  const ratio = (v: number, ref: number) => (Number.isFinite(v) ? v / ref : 0);
  const ls = Math.log(Math.max(1, ratio(extent, DEPTH_REF_EXTENT), ratio(farthest, SECOND_STEP))); // exactly 0 at scale 1: TUNED_DEPTH
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
