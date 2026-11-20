// The depth fade scaled to the system (#59): pure maths, checked against the tuned curve and the layouts.
import { describe, expect, it } from 'vitest';
import { palette } from '../../src/core/palette.js';
import { systemDepth } from '../../web/src/camera/pose.js';
import { DEPTH_RANGE, DEPTH_REF_EXTENT, SECOND_STEP, TUNED_DEPTH, depthStretch, fadeStrength } from '../../web/src/model/depth.js';
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
    expect(systemDepth(systemModel(miniLayout))).toEqual(TUNED_DEPTH);
  });

  it('moves the 0.72 step out to the farthest planet when that is beyond the extent\'s reach', () => {
    expect(SECOND_STEP).toBeCloseTo(step(2), 12);
    expect(depthStretch(DEPTH_REF_EXTENT, SECOND_STEP)).toEqual(TUNED_DEPTH);
    const close = (a: { squeeze: number; shift: number }, b: { squeeze: number; shift: number }) => {
      expect(a.squeeze).toBeCloseTo(b.squeeze, 12);
      expect(a.shift).toBeCloseTo(b.shift, 12);
    };
    const st = depthStretch(DEPTH_REF_EXTENT * 2, SECOND_STEP * 3); // the farthest planet asks for more than the extent
    close(st, depthStretch(DEPTH_REF_EXTENT * 3));
    expect(fadeStrength(SECOND_STEP * 3, st)).toBeCloseTo(STRENGTHS[2]!, 9);
    close(depthStretch(DEPTH_REF_EXTENT * 4, SECOND_STEP * 3), depthStretch(DEPTH_REF_EXTENT * 4)); // and never less than the extent's
    expect(depthStretch(DEPTH_REF_EXTENT, Number.POSITIVE_INFINITY)).toEqual(TUNED_DEPTH);
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
