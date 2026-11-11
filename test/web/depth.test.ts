// The depth fade scaled to the system (#59): pure maths, checked against the tuned curve and the layouts.
import { describe, expect, it } from 'vitest';
import { palette } from '../../src/core/palette.js';
import { DEPTH_RANGE, DEPTH_REF_EXTENT, TUNED_DEPTH, depthStretch, fadeStrength } from '../../web/src/model/depth.js';
import { systemModel } from '../../web/src/model/system.js';
import { miniLayout } from '../fixtures/contract/mini.js';

const STRENGTHS = palette.world.depth.map((d) => d.strength);
/** The tuned fade before #59, written out independently: log distance from near to far, one equal segment per depth step. */
function tuned(d: number): number {
  const x = Math.min(1, Math.max(0, Math.log(d / DEPTH_RANGE.near) / Math.log(DEPTH_RANGE.far / DEPTH_RANGE.near))) * 3;
  const i = Math.min(Math.floor(x), 2);
  return STRENGTHS[i]! + (STRENGTHS[i + 1]! - STRENGTHS[i]!) * (x - i);
}
/** The distance of depth step k (0..3) as tuned, with steps 2 and 3 moved out by s. */
const step = (k: number, s = 1) => DEPTH_RANGE.near * (DEPTH_RANGE.far / DEPTH_RANGE.near) ** (k / 3) * (k > 1 ? s : 1);

describe('depthStretch', () => {
  it('leaves a system no larger than the reference with exactly the tuned fade', () => {
    for (const extent of [0, 1, DEPTH_REF_EXTENT / 2, DEPTH_REF_EXTENT, Number.NaN]) expect(depthStretch(extent)).toEqual(TUNED_DEPTH);
    for (const d of [1, 5, 7.05, 10, 20, 30, 44, 60, 200]) expect(fadeStrength(d, TUNED_DEPTH)).toBe(tuned(d));
  });

  it('keeps the mini fixture (the goldens) on the tuned fade', () => {
    expect(systemModel(miniLayout).depth).toEqual(TUNED_DEPTH);
  });

  it('moves the 0.72 and 0.88 steps out in proportion to the extent', () => {
    for (const s of [1.5, 2, 4.26, 10]) {
      const st = depthStretch(DEPTH_REF_EXTENT * s);
      expect(fadeStrength(step(2, s), st)).toBeCloseTo(STRENGTHS[2]!, 9);
      expect(fadeStrength(step(3, s), st)).toBeCloseTo(STRENGTHS[3]!, 9);
      expect(fadeStrength(step(3, s) * 2, st)).toBe(STRENGTHS[3]);
    }
  });

  it('never changes the first step, so a focused planet and its moons fade as tuned', () => {
    const big = depthStretch(DEPTH_REF_EXTENT * 6);
    for (const d of [0.5, 5, 7.05, 9, step(1)]) expect(fadeStrength(d, big)).toBeCloseTo(tuned(d), 12);
  });

  it('fades less, never more, than the tuned curve, and still rises with distance', () => {
    const st = depthStretch(30);
    let last = -1;
    for (let d = 1; d < 400; d *= 1.07) {
      const f = fadeStrength(d, st);
      expect(f).toBeLessThanOrEqual(tuned(d) + 1e-12);
      expect(f).toBeGreaterThanOrEqual(last - 1e-12);
      last = f;
    }
  });
});
