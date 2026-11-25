// Fog events on the real view (#74, F5/F6; cloud since #224): a front starts at the frame a fog change is
// applied and runs to the new rest state. Pins the moons' direction (Qodo PR #117 r3, "moons refog in
// reverse"): a moon going fogged rolls in towards fogged and never shows more fog than its end state, and
// a charted moon clears towards clear and never shows less than its end state. And on a planet: a chart
// turns the file's storm cloud [OIII] teal while it thins to mist (teal only then, under 10% of the frame),
// and a refog rolls cloud back in with no teal.
import { expect, test, type Page } from '@playwright/test';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { palette } from '../../src/core/palette.js';
import { FOG_EVENT_FRAMES } from '../../web/src/model/fog.js';
import { systemModel } from '../../web/src/model/system.js';
import type { CameraPose } from '../../src/core/contract/api.js';
import { eventsPage, fogFor, following, MINI, openView } from './harness.js';

const target = eventsPage();
/** The moons orbit between the sampled frames, so the visible fog area drifts a little. */
const SLACK = 1.1;
const hex = (rgba: readonly number[], p: number) => `#${[0, 1, 2].map((c) => rgba[p * 4 + c]!.toString(16).padStart(2, '0')).join('')}`;
const teal = new Set<string>(palette.accent.teal);
const SAMPLES = [0, 0.2, 0.4, 0.6, 0.8, 1];

type Frame = { width: number; height: number; rgba: number[] };
/** Frame `n` with `fog` at rest (no front): what a sample is measured against. */
async function restFrame(page: Page, layout: LayoutV1, fog: FogView, camera: CameraPose, n: number): Promise<Frame> {
  await page.evaluate(([l, f, c]) => window.__events.setup(l, f, c, 360), [layout, fog, camera] as const);
  return page.evaluate((frame) => window.__events.frame(frame), n);
}
/** Frames at each sample of a change from `from` to `to` landing at `start`. */
async function changeFrames(page: Page, layout: LayoutV1, from: FogView, to: FogView, camera: CameraPose, start: number, kind: 'clear' | 'refog'): Promise<Frame[]> {
  await page.evaluate(([l, f, c]) => window.__events.setup(l, f, c, 360), [layout, from, camera] as const);
  expect(await page.evaluate(([f, n]) => window.__events.change(f, n), [to, start] as const)).toBe(true);
  const out: Frame[] = [];
  for (const u of SAMPLES) out.push(await page.evaluate((frame) => window.__events.frame(frame), start + Math.round(u * FOG_EVENT_FRAMES[kind])));
  return out;
}
const differing = (a: Frame, b: Frame) => { let n = 0; for (let p = 0; p < a.width * a.height; p++) if ([0, 1, 2].some((c) => a.rgba[p * 4 + c] !== b.rgba[p * 4 + c])) n++; return n; };
const tealPx = (f: Frame) => { let n = 0; for (let p = 0; p < f.width * f.height; p++) if (teal.has(hex(f.rgba, p))) n++; return n; };

test('moons: a refog rolls in towards fogged, a chart clears towards clear, never the reverse', async ({ page }) => {
  const model = systemModel(MINI);
  const start = 100; // the frame each change lands on
  const camera = following(model, 'web', start); // web (24 test moons), framed where its orbit has it then (#60); a front moves it under 0.14 units
  const moons = new Set(MINI.planets.find((p) => p.path === 'web')!.moons.map((m) => m.fileId) as string[]);
  const clear = fogFor(MINI), fogged = fogFor(MINI, (id) => moons.has(id));
  const view = await openView(page, target, { testMode: false });
  await page.waitForFunction(() => window.__events !== undefined);

  /** The moons' fog px at each sample: the pixels that differ from the same frame with every moon clear. */
  async function fog(from: FogView, to: FogView, kind: 'clear' | 'refog'): Promise<{ at: number[]; rest: number }> {
    const frames = await changeFrames(page, MINI, from, to, camera, start, kind);
    const at: number[] = [];
    for (const [i, u] of SAMPLES.entries()) at.push(differing(frames[i]!, await restFrame(page, MINI, clear, camera, start + Math.round(u * FOG_EVENT_FRAMES[kind]))));
    return { at, rest: at.at(-1)! };
  }

  const refog = await fog(clear, fogged, 'refog');
  const charted = await fog(fogged, clear, 'clear');
  console.log(`moon fog px, refog (clear → fogged): ${refog.at.join(' ')}; chart (fogged → clear): ${charted.at.join(' ')}`);
  expect(refog.rest, 'not vacuous: fogged moons show their cloud').toBeGreaterThan(0);
  expect(refog.at[0]!, 'a refog starts clear').toBeLessThan(refog.rest);
  for (const c of refog.at) expect(c, 'a refog never shows more fog than its end state').toBeLessThanOrEqual(refog.rest * SLACK);
  expect(refog.at[1]!, 'a refog grows').toBeLessThan(refog.at[3]!);
  expect(charted.at[1]!, 'a chart shrinks').toBeGreaterThan(charted.at[3]!);
  expect(charted.at[0]!, 'a chart starts fogged').toBeGreaterThan(charted.rest);
  expect(charted.rest, 'a charted moon ends clear').toBe(0);
  for (const c of charted.at) expect(c, 'a chart never shows less fog than its end state').toBeGreaterThanOrEqual(charted.rest / SLACK);
  expect(view.errors).toEqual([]);
});

test('#224: a chart turns the file\'s storm cloud teal while it thins to mist; a refog rolls cloud in with no teal', async ({ page }) => {
  const model = systemModel(MINI);
  const start = 100;
  const camera = following(model, 'src', start);
  const src = MINI.planets.find((p) => p.path === 'src')!.surface.settlements.map((s) => s.fileId as string);
  const one = src[0]!;
  const view = await openView(page, target, { testMode: false });
  await page.waitForFunction(() => window.__events !== undefined);

  const fogged = fogFor(MINI, (id) => src.includes(id)), charted = fogFor(MINI, (id) => src.includes(id) && id !== one, (id) => id === one);
  const chart = await changeFrames(page, MINI, fogged, charted, camera, start, 'clear');
  const rolled = await changeFrames(page, MINI, fogFor(MINI), fogFor(MINI, (id) => id === one), camera, start, 'refog');
  const refogRest = await restFrame(page, MINI, fogFor(MINI, (id) => id === one), camera, start + FOG_EVENT_FRAMES.refog);
  const chartTeal = chart.map(tealPx), refogTeal = rolled.map(tealPx);
  const refogLeft = rolled.map((f) => differing(f, refogRest));
  const frame = chart[0]!.width * chart[0]!.height;
  console.log(`teal px through a chart: ${chartTeal.join(' ')} of ${frame}; through a refog: ${refogTeal.join(' ')}; refog px still to come: ${refogLeft.join(' ')}`);
  expect(chartTeal[1]!, 'a chart turns the cloud teal (not vacuous)').toBeGreaterThan(0);
  for (const t of chartTeal) expect(t, 'teal stays under 10% of the frame').toBeLessThan(frame * 0.1);
  expect(chartTeal.at(-1)!, 'the chart ends without teal').toBe(0);
  expect(chartTeal[4]!, 'the teal cloud thins away').toBeLessThan(chartTeal[1]!);
  expect(refogTeal, 'a refog never shows teal').toEqual(SAMPLES.map(() => 0));
  expect(refogLeft[0]!, 'a refog starts with its cloud still to come').toBeGreaterThan(0);
  expect(refogLeft[4]!, 'and rolls it in').toBeLessThan(refogLeft[1]!);
  expect(view.errors).toEqual([]);
});
