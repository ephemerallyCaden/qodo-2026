// The render checks (suite.ts) on the stand-in view (#31 AC 1-6). The stand-in is what the negative
// tests break, so this proves the harness on a scene that isn't the product; view.spec.ts runs the
// same checks on the real view (AC 8).
import { expect, test } from '@playwright/test';
import { LOOP_FRAMES } from '../../web/src/model/motion.js';
import { assertRendered, diffPixels, LOW_RES } from './frame.js';
import { MINI_INPUT, openView, render, standin } from './harness.js';
import { LATER, renderSuite } from './suite.js';

renderSuite('standin', standin, [
  { frame: 0, reducedMotion: false },
  { frame: LATER, reducedMotion: false },
  { frame: LATER, reducedMotion: true },
]);

test('the stand-in loops on motion.ts LOOP_FRAMES, never a length of its own (#174): one loop on is frame 0, half a loop on is not', async ({ page }) => {
  const view = await openView(page, standin());
  const [f0, half, loop] = await render(view, { ...MINI_INPUT }, [0, LOOP_FRAMES / 2, LOOP_FRAMES]);
  for (const r of [f0!, half!, loop!]) assertRendered(r.pixels, r.stats, LOW_RES);
  expect(diffPixels(f0!.pixels, loop!.pixels), `frame ${LOOP_FRAMES} (one loop) vs frame 0`).toBe(0);
  expect(diffPixels(f0!.pixels, half!.pixels), `frame ${LOOP_FRAMES / 2} (half a loop) vs frame 0`).toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});
