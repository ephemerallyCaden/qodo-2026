// The render harness on the stand-in view (#31 AC 1-6): SwiftShader, determinism, draw budget,
// palette-only output with the depth fade off, and goldens. AC 8 adds the same checks for the real view (#30) once it lands.
import { expect, test } from '@playwright/test';
import { context, launch } from '../../playwright.config.js';
import { assertRendered, diffPixels, LOW_RES, statsProblems } from './frame.js';
import { checkGolden, describeEnv } from './golden.js';
import { goldenOptions, MINI, openView, render, renderEnv, standin, type Rendered } from './harness.js';
import { PIXELS } from './thresholds.js';
import { paletteProblems, type RenderEnv } from './twin.js';

/** A later frame (system-design §10 uses 0, 180 and 360): every orbit has moved off its start. */
const LATER = 180;

let env: RenderEnv;
test.beforeAll(async ({ browser }) => {
  env = await renderEnv(browser);
  console.log(`render env: ${describeEnv(env)}`);
  expect(env.webgl, 'render tests must run on SwiftShader, never the host GPU').toContain('SwiftShader');
});

test('frame n is a pure function of (input, n): same pixels in any order, and in a fresh browser', async ({ page, playwright }) => {
  const a = await render(await openView(page, standin()), { layout: MINI }, [0, LATER, 0]);
  const browser = await playwright.chromium.launch(launch);
  try {
    const b = await render(await openView(await browser.newPage(context), standin()), { layout: MINI }, [LATER, 0]);
    for (const r of [...a, ...b]) assertRendered(r.pixels, r.stats, LOW_RES);
    const px = (rs: Rendered[], i: number) => rs[i]!.pixels;
    const diffs = { sameRunRepeat: diffPixels(px(a, 0), px(a, 2)), freshBrowserF0: diffPixels(px(a, 0), px(b, 1)), freshBrowserLater: diffPixels(px(a, 1), px(b, 0)) };
    console.log(`determinism diffs (max ${PIXELS.maxDiffPixels}): ${JSON.stringify(diffs)}`);
    for (const [k, n] of Object.entries(diffs)) expect(n, k).toBeLessThanOrEqual(PIXELS.maxDiffPixels);
    // Not vacuous: the frame number really moves things.
    expect(diffPixels(px(a, 0), px(a, 1))).toBeGreaterThan(0);
    expect(b.map((r) => r.stats)).toEqual([a[1]!.stats, a[0]!.stats]);
  } finally {
    await browser.close();
  }
});

test('stays within the draw budget (renderer.info, not FPS)', async ({ page }) => {
  const frames = await render(await openView(page, standin()), { layout: MINI }, [0, LATER]);
  for (const r of frames) {
    console.log(`frame ${r.frame}: ${r.stats.drawCalls} draw calls, ${r.stats.triangles} triangles`);
    expect(statsProblems(r.stats, r.pixels)).toEqual([]);
  }
});

const GOLDENS = [
  { name: 'standin-mini-f0', frame: 0, reducedMotion: false },
  { name: `standin-mini-f${LATER}`, frame: LATER, reducedMotion: false },
  { name: `standin-mini-f${LATER}-reduced`, frame: LATER, reducedMotion: true },
];

for (const g of GOLDENS) {
  test(`matches golden ${g.name}`, async ({ page }, info) => {
    const view = await openView(page, standin());
    // §10: with the depth fade off, every pixel is a palette colour.
    const [flat] = await render(view, { layout: MINI, reducedMotion: g.reducedMotion, depthFade: false }, [g.frame]);
    expect(paletteProblems(flat!.pixels)).toEqual([]);
    const [r] = await render(view, { layout: MINI, reducedMotion: g.reducedMotion }, [g.frame]);
    assertRendered(r!.pixels, r!.stats, LOW_RES);
    const result = checkGolden(g.name, r!.pixels, r!.stats, goldenOptions(env));
    if (result.status === 'unpinned') {
      const note = `goldens are authoritative in CI (${describeEnv(result.recorded)}); this run checked determinism, empty output and the budget, and the golden compare is informational: ${result.diffPixels} px differ`;
      info.annotations.push({ type: 'golden-informational', description: note });
      console.log(`${g.name}: ${note}`);
    } else {
      console.log(`${g.name}: ${result.status}`);
    }
    expect(view.errors).toEqual([]);
  });
}
