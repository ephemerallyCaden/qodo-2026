// Overview readability (#59; system-design §10), pure parts: the far planet's fade at the start pose
// on self-like systems, and the band measure overview.spec.ts applies to rendered frames.
import { describe, expect, it } from 'vitest';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { palette } from '../../src/core/palette.js';
import { startPose } from '../../web/src/camera/pose.js';
import { TUNED_DEPTH, fadeStrength } from '../../web/src/model/depth.js';
import { systemModel, type Look } from '../../web/src/model/system.js';
import { miniLayout } from '../fixtures/contract/mini.js';
import { selfLike, selfLikeRoots } from '../fixtures/overview.js';
import type { Frame } from './frame.js';
import { LOW_RES } from './frame.js';
import { BAND_LOOKS, bandSteps, farthestOnScreen, measureLook, oklab, type Swatch } from './legibility.js';
import { OVERVIEW } from './thresholds.js';

describe('the overview fade rule: the farthest planet on screen at the start pose fades at most 0.72', () => {
  const cases: [string, LayoutV1][] = [['mini', miniLayout], ['self-like', selfLike], ['self-like with a content root', selfLikeRoots]];
  for (const [name, layout] of cases) {
    it(name, () => {
      const model = systemModel(layout);
      const far = farthestOnScreen(model, startPose(model), LOW_RES);
      expect(far.fade).toBeLessThanOrEqual(OVERVIEW.maxFarFade);
    });
  }

  it('is not vacuous: with the tuned range the self-like systems would fade past it (0.81 and 0.88 before #59)', () => {
    expect(OVERVIEW.maxFarFade).toBe(0.72); // the human's wording, 2026-11-11
    for (const layout of [selfLike, selfLikeRoots]) {
      const model = systemModel(layout);
      const far = farthestOnScreen(model, startPose(model), LOW_RES);
      expect(fadeStrength(far.d, TUNED_DEPTH)).toBeGreaterThan(OVERVIEW.maxFarFade + 0.05);
    }
  });

  it('the self-like fixtures span the overviews #59 measured (extents about 16.5 and 35.7)', () => {
    expect(systemModel(selfLike).extent).toBeCloseTo(16.53, 1);
    expect(systemModel(selfLikeRoots).extent).toBeCloseTo(35.73, 1);
  });
});

/** A w×h opaque frame, `paint(x, y)` giving each pixel's RGB. */
function frame(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Frame {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([...paint(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
}
const SPACE = [1, 3, 5].map((i) => parseInt(palette.world.space.slice(i, i + 2), 16)) as [number, number, number];

describe('band measure', () => {
  it('oklab: white is L 1 with no colour, the space colour is near-black, and orange is warm (a, b > 0)', () => {
    const [L, a, b] = oklab(255, 255, 255);
    expect(L).toBeCloseTo(1, 4);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(1e-4);
    expect(oklab(...SPACE)[0]).toBeLessThan(0.2);
    const o = oklab(0xff, 0x76, 0x1a);
    expect(o[1]).toBeGreaterThan(0);
    expect(o[2]).toBeGreaterThan(0);
  });

  it('measureLook counts only the pixels inside the radius that differ from the frame without the planet', () => {
    const without = frame(20, 20, () => SPACE);
    const disc = (x: number, y: number) => Math.hypot(x + 0.5 - 10, y + 0.5 - 10) <= 4;
    const flat = frame(20, 20, (x, y) => (disc(x, y) ? [200, 100, 50] : SPACE));
    const look = measureLook(flat, without, 10, 10, 6);
    expect(look.px).toBe([...Array(400).keys()].filter((i) => disc(i % 20, Math.floor(i / 20))).length);
    expect(look.vector[0]).toBeCloseTo(oklab(200, 100, 50)[0], 9);
    expect(look.vector[4]).toBeCloseTo(0, 9); // one colour: no lightness spread
    expect(look.vector[5]).toBeCloseTo(0, 9); // and no texture
    expect(measureLook(flat, flat, 10, 10, 6).px).toBe(0); // nothing differs: nothing counts
    expect(measureLook(flat, without, 10, 10, 2).px).toBeLessThan(look.px);
  });

  it('measureLook sees texture: stripes have a lightness spread and edges, a flat disc of their mean has neither', () => {
    const without = frame(20, 20, () => SPACE);
    const striped = measureLook(frame(20, 20, (x) => (x % 2 ? [220, 220, 220] : [60, 60, 60])), without, 10, 10, 5);
    expect(striped.vector[4]).toBeGreaterThan(0.2);
    expect(striped.vector[5]).toBeGreaterThan(0.2);
  });

  it('bandSteps measures neighbouring bands, ash against its nearest healthy look', () => {
    const swatch = (L: number, a = 0): Swatch => ({ px: 30, vector: [L, a, 0, 0, 0, 0] });
    const looks = { lava: swatch(0.3, 0.1), toxic: swatch(0.3), desert: swatch(0.5), lush: swatch(0.7), ocean: swatch(0.56), ice: swatch(0.8) } satisfies Record<Look, Swatch>;
    const s = bandSteps(looks);
    expect(s.lavaToxic).toBeCloseTo(0.1, 12);
    expect(s.toxicAsh).toBeCloseTo(0.2, 12);
    expect(s.ashHealthy).toBeCloseTo(0.06, 12); // ocean, the nearest
    expect(BAND_LOOKS).toEqual(['lava', 'toxic', 'desert', 'lush', 'ocean', 'ice']);
  });
});
