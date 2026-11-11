// Overview readability on the real view (#59; system-design §10; human, 2026-11-11): at the start
// pose of a self-like system, the farthest planet on screen fades by at most 0.72 and its health
// band still reads. The planet is drawn in each band's look (lava, toxic, ash, then healthy as lush,
// ocean and ice) in its own slot, under the start-pose camera, and measured against the same frame
// without it (legibility.ts). Before #59 the widest overview faded it by 0.88, and toxic, ash and
// healthy were 0.03 apart.
import { expect, test } from '@playwright/test';
import type { HealthBand, LayoutV1 } from '../../src/core/contract/layout.js';
import { startPose, toCameraPose } from '../../web/src/camera/pose.js';
import { lookOf, systemModel, type Look } from '../../web/src/model/system.js';
import { selfLike, selfLikeRoots } from '../fixtures/overview.js';
import { assertRendered, LOW_RES } from './frame.js';
import { openView, render, systemView } from './harness.js';
import { BAND_LOOKS, bandSteps, farthestOnScreen, measureLook, type Swatch } from './legibility.js';
import { OVERVIEW } from './thresholds.js';

const BAND_OF: Record<Look, HealthBand> = { lava: 'lava', toxic: 'toxic', desert: 'ash', lush: 'healthy', ocean: 'healthy', ice: 'healthy' };

/** The planet in a look: its band, and the nearest seed the view draws in that look (system.ts lookOf). */
function asLook(p: LayoutV1['planets'][number], look: Look): LayoutV1['planets'][number] {
  const band = BAND_OF[look];
  let seed = p.biomeSeed;
  while (lookOf(band, seed) !== look) seed++;
  return { ...p, biomeSeed: seed, health: { ...p.health, band } };
}

for (const [name, layout] of [['self-like', selfLike], ['self-like with a content root', selfLikeRoots]] as const) {
  test(`${name}: the farthest planet at the start pose fades ≤ ${OVERVIEW.maxFarFade} and its band reads`, async ({ page }) => {
    const model = systemModel(layout);
    const pose = startPose(model), camera = toCameraPose(pose);
    const far = farthestOnScreen(model, pose, LOW_RES);
    expect(far.fade, 'the fade at that planet, as the shader computes it').toBeLessThanOrEqual(OVERVIEW.maxFarFade);

    const view = await openView(page, systemView());
    const [without] = await render(view, { layout: { ...layout, planets: layout.planets.filter((_, i) => i !== far.i) }, camera }, [0]);
    assertRendered(without!.pixels, without!.stats, LOW_RES, OVERVIEW.minNonSpaceFraction);
    const looks = {} as Record<Look, Swatch>;
    for (const look of BAND_LOOKS) {
      const [r] = await render(view, { layout: { ...layout, planets: layout.planets.map((p, i) => (i === far.i ? asLook(p, look) : p)) }, camera }, [0]);
      assertRendered(r!.pixels, r!.stats, LOW_RES, OVERVIEW.minNonSpaceFraction);
      looks[look] = measureLook(r!.pixels, without!.pixels, far.x, far.y, far.r * 1.12);
      expect(looks[look].px, `${look}: planet pixels`).toBeGreaterThanOrEqual(OVERVIEW.minPlanetPx);
    }
    const steps = bandSteps(looks);
    console.log(`${name}: farthest planet at ${far.d.toFixed(1)}, fade ${far.fade.toFixed(3)}, ${(2 * far.r).toFixed(1)} px disc, ${looks.lava.px} px measured; band steps ${JSON.stringify(steps)}`);
    expect(steps.lavaToxic, 'lava → toxic').toBeGreaterThanOrEqual(OVERVIEW.minBandStep);
    expect(steps.toxicAsh, 'toxic → ash').toBeGreaterThanOrEqual(OVERVIEW.minBandStep);
    expect(steps.ashHealthy, 'ash → the nearest healthy look').toBeGreaterThanOrEqual(OVERVIEW.minBandStep);
    expect(view.errors).toEqual([]);
  });
}
