// Negative tests (#31 AC 3): the harness must fail on empty output. Each breaks the stand-in in
// memory the way real views break (a body shader that doesn't compile, a depth fade that won't turn
// off, no canvas, no test mode)
// and proves the harness rejects it. A render test once passed after a shader compile error.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { assertRendered, coverage, frameProblems, LOW_RES } from './frame.js';
import { MINI, openView, render, standin, type Target } from './harness.js';
import { paletteProblems } from './twin.js';

const MAIN = readFileSync(join(import.meta.dirname, 'standin/main.ts'), 'utf8');
/** Replaces one line of the stand-in's main.ts. Checked here, not when served, so a stale patch fails with this message instead of a hung request. */
function replaceInMain(line: string, by: string): NonNullable<Target['patch']> {
  if (!MAIN.includes(line)) throw new Error(`stand-in main.ts no longer contains ${JSON.stringify(line)}; update this negative test`);
  return (url, source) => (url.endsWith('/standin/main.js') ? source.replace(line, by) : source);
}
/** Only the body shader (sun, planets, moons): the stars keep drawing, as they did in the real failure. */
const brokenBodyShader = replaceInMain('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(c, 1.0) +;');
const noCanvas = replaceInMain('document.body.append(canvas);', '');
/** A view that ignores `depthFade: false` keeps its off-palette fade. */
const fadeAlwaysOn = replaceInMain('const depthFade = input.depthFade ?? true;', 'const depthFade = true;');

test('control: the intact stand-in passes every check these tests break', async ({ page }) => {
  const view = await openView(page, standin());
  const [r] = await render(view, { layout: MINI }, [0]);
  expect(() => assertRendered(r!.pixels, r!.stats, LOW_RES)).not.toThrow();
  expect(view.errors).toEqual([]);
});

test('a body shader that fails to compile leaves stars on background, and the frame fails', async ({ page }) => {
  const view = await openView(page, standin(brokenBodyShader));
  const [r] = await render(view, { layout: MINI }, [0]);
  // Not trivially uniform: the stars still drew, which is what let the old test pass.
  const { colours, nonSpace } = coverage(r!.pixels);
  expect(colours).toBeGreaterThan(1);
  expect(nonSpace).toBeGreaterThan(0);
  expect(frameProblems(r!.pixels, LOW_RES)).toEqual([`blank frame: ${colours} colours (need 12)`, `blank frame: ${nonSpace} of 57600 px aren't space #0d0b16 (need 2880)`]);
  expect(() => assertRendered(r!.pixels, r!.stats, LOW_RES)).toThrow(/blank frame/);
  expect(view.errors.join('\n')).toMatch(/shader/i);
});

test('a view that ignores depthFade: false leaves off-palette pixels, and the palette check fails', async ({ page }) => {
  const control = await render(await openView(page, standin()), { layout: MINI, depthFade: false }, [0]);
  expect(paletteProblems(control[0]!.pixels)).toEqual([]);
  const view = await openView(await page.context().newPage(), standin(fadeAlwaysOn));
  const [r] = await render(view, { layout: MINI, depthFade: false }, [0]);
  expect(paletteProblems(r!.pixels)).toEqual([expect.stringMatching(/^\d+ px off-palette with the depth fade off, first #[0-9a-f]{6} at \d+,\d+$/)]);
});

test('a page without a canvas fails', async ({ page }) => {
  await expect(openView(page, standin(noCanvas))).rejects.toThrow(/standin: no canvas in the page/);
});

test('without ?test=1 there is no render hook, and the harness fails', async ({ page }) => {
  await expect(openView(page, standin(), { testMode: false, hookTimeoutMs: 3_000 })).rejects.toThrow(/window\.__commet never appeared \(opened without \?test=1\)/);
});
