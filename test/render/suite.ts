// The render checks every view gets (#31 AC 1-6 and 8): SwiftShader, determinism, reduced motion,
// the draw budget, empty output, palette-only output with the depth fade off, and goldens. Each
// spec registers them once for its view: standin.spec.ts for the stand-in, view.spec.ts for the
// real view built into dist/web.
import { expect, test } from '@playwright/test';
import { context, launch } from '../../playwright.config.js';
import { assertRendered, coverage, diffPixels, LOW_RES, statsProblems } from './frame.js';
import { checkGolden, describeEnv } from './golden.js';
import { goldenOptions, MINI_INPUT, openView, render, renderEnv, type Rendered, type Target } from './harness.js';
import { PIXELS } from './thresholds.js';
import { paletteProblems, share, type RenderEnv } from './twin.js';

/** A later frame (system-design §10 uses 0, 180 and 360): every animated layer has moved off its start. */
export const LATER = 180;

/** The pixels of the i-th frame rendered. */
const px = (rs: Rendered[], i: number) => rs[i]!.pixels;

/** A golden of the `mini` fixture with its fog (#74), named `<view>-mini-f<frame>[-reduced]` in test/golden/render/. */
export interface GoldenCase { frame: number; reducedMotion: boolean }

/** One line of evidence for a frame: renderer.info figures and how much of it isn't space. */
function describeFrame(r: Rendered): string {
  const { colours, nonSpace } = coverage(r.pixels);
  const total = r.pixels.width * r.pixels.height;
  return `${r.stats.drawCalls} draw calls, ${r.stats.triangles} triangles, ${colours} colours, ` +
    `${nonSpace} of ${total} px off space (${share(nonSpace, total)})`;
}

/**
 * Registers the render checks for one view, titled `name`, which also prefixes its golden names.
 * Every check also fails on a page or console error, even when the frame looks right.
 */
export function renderSuite(name: string, target: () => Target, goldens: GoldenCase[]): void {
  test.describe(name, () => {
    let env: RenderEnv;
    test.beforeAll(async ({ browser }) => {
      env = await renderEnv(browser);
      console.log(`render env: ${describeEnv(env)}`);
      expect(env.webgl, 'render tests must run on SwiftShader, never the host GPU').toContain('SwiftShader');
    });

    test('frame n is a pure function of (input, n): same pixels in any order, and in a fresh browser', async ({ page, playwright }) => {
      const first = await openView(page, target());
      const a = await render(first, { ...MINI_INPUT }, [0, LATER, 0]);
      const browser = await playwright.chromium.launch(launch);
      try {
        const fresh = await openView(await browser.newPage(context), target());
        const b = await render(fresh, { ...MINI_INPUT }, [LATER, 0]);
        for (const r of [...a, ...b]) assertRendered(r.pixels, r.stats, LOW_RES);
        const diffs = { sameRunRepeat: diffPixels(px(a, 0), px(a, 2)), freshBrowserF0: diffPixels(px(a, 0), px(b, 1)), freshBrowserLater: diffPixels(px(a, 1), px(b, 0)) };
        console.log(`determinism diffs (max ${PIXELS.maxDiffPixels}): ${JSON.stringify(diffs)}`);
        for (const [k, n] of Object.entries(diffs)) expect(n, k).toBeLessThanOrEqual(PIXELS.maxDiffPixels);
        // Not vacuous: the frame number really moves things.
        expect(diffPixels(px(a, 0), px(a, 1))).toBeGreaterThan(0);
        expect(b.map((r) => r.stats)).toEqual([a[1]!.stats, a[0]!.stats]);
        expect([...first.errors, ...fresh.errors]).toEqual([]);
      } finally {
        await browser.close();
      }
    });

    test('reduced motion holds frame 0 (system-design §7: n is fixed at 0)', async ({ page }) => {
      const view = await openView(page, target());
      const still = await render(view, { ...MINI_INPUT, reducedMotion: true }, [0, LATER]);
      const moving = await render(view, { ...MINI_INPUT }, [0, LATER]);
      for (const r of [...still, ...moving]) assertRendered(r.pixels, r.stats, LOW_RES);
      expect(diffPixels(px(still, 1), px(still, 0)), `reduced motion, frame ${LATER} vs 0`).toBe(0);
      expect(diffPixels(px(still, 1), px(moving, 0)), `reduced motion, frame ${LATER} vs frame 0 without it`).toBe(0);
      // Not vacuous: without reduced motion the same frame has moved.
      expect(diffPixels(px(moving, 1), px(moving, 0))).toBeGreaterThan(0);
      expect(view.errors).toEqual([]);
    });

    test('stays within the draw budget (renderer.info, not FPS)', async ({ page }) => {
      const view = await openView(page, target());
      const frames = await render(view, { ...MINI_INPUT }, [0, LATER]);
      for (const r of frames) {
        console.log(`frame ${r.frame}: ${describeFrame(r)}`);
        expect(statsProblems(r.stats, r.pixels)).toEqual([]);
      }
      expect(view.errors).toEqual([]);
    });

    for (const g of goldens) {
      const golden = `${name}-mini-f${g.frame}${g.reducedMotion ? '-reduced' : ''}`;
      test(`matches golden ${golden}`, async ({ page }, info) => {
        const view = await openView(page, target());
        // §10: with the depth fade off, every pixel is a palette colour.
        const [flat] = await render(view, { ...MINI_INPUT, reducedMotion: g.reducedMotion, depthFade: false }, [g.frame]);
        assertRendered(flat!.pixels, flat!.stats, LOW_RES); // an empty frame is trivially palette-only
        expect(paletteProblems(flat!.pixels)).toEqual([]);
        const [r] = await render(view, { ...MINI_INPUT, reducedMotion: g.reducedMotion }, [g.frame]);
        assertRendered(r!.pixels, r!.stats, LOW_RES);
        console.log(`${golden}: ${describeFrame(r!)}; depth fade off: ${describeFrame(flat!)}, 0 px off-palette`);
        expect(view.errors).toEqual([]);
        const result = checkGolden(golden, r!.pixels, r!.stats, goldenOptions(env));
        if (result.status === 'unpinned') {
          const note = `goldens are authoritative in CI (${describeEnv(result.recorded)}); this run checked determinism, empty output, the budget and the palette, and the golden compare is informational: ${result.diffPixels} px differ`;
          info.annotations.push({ type: 'golden-informational', description: note });
          console.log(`${golden}: ${note}`);
        } else {
          console.log(`${golden}: ${result.status}`);
        }
      });
    }
  });
}
