// Fog events on the real view (#74, F5/F6): a front starts at the frame a fog change is applied and
// runs to the new rest state. Pins the moons' direction (Qodo PR #117 r3, "moons refog in reverse"):
// a moon going fogged rolls in towards fogged and never shows more fog than its end state, and a
// charted moon clears towards clear and never shows less than its end state.
import { expect, test } from '@playwright/test';
import { palette } from '../../src/core/palette.js';
import { focusPose, startPose, toCameraPose } from '../../web/src/camera/pose.js';
import { FOG_EVENT_FRAMES } from '../../web/src/model/fog.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { fogFor, MINI, openView } from './harness.js';

const target = { name: 'events', entry: '/test/render/events/index.html', mounts: ['test/render/events', 'web/src', 'src/core', 'node_modules/three/build'].map((d) => ({ url: `/${d}/`, dir: d })) };
const veil = new Set<string>(Object.values(palette.fog.veil.moonBody));
/** The moons orbit between the sampled frames, so the visible veil area drifts a little (3813 against 3596 at rest). */
const SLACK = 1.1;
const hex = (rgba: readonly number[], p: number) => `#${[0, 1, 2].map((c) => rgba[p * 4 + c]!.toString(16).padStart(2, '0')).join('')}`;

interface Events { setup(l: unknown, f: unknown, c: unknown, h: number): Promise<void>; change(f: unknown, n: number): boolean; frame(n: number): { width: number; height: number; rgba: number[] } }
declare global { interface Window { __events: Events } }

test('moons: a refog rolls in towards fogged, a chart clears towards clear, never the reverse', async ({ page }) => {
  const model = systemModel(MINI);
  const web = model.planets.find((p) => p.path === 'web')!; // 24 test moons
  const camera = toCameraPose(focusPose(startPose(model), planetCentre(web, 0), web.radius));
  const moons = new Set(MINI.planets.find((p) => p.path === 'web')!.moons.map((m) => m.fileId) as string[]);
  const clear = fogFor(MINI), fogged = fogFor(MINI, (id) => moons.has(id));
  const view = await openView(page, target, { testMode: false });
  await page.waitForFunction(() => window.__events !== undefined);

  /** Moon-veil pixels at each frame offset after a change from `from` to `to`, and at rest in `to`. */
  async function veils(from: typeof clear, to: typeof clear, kind: 'clear' | 'refog'): Promise<{ at: number[]; rest: number }> {
    await page.evaluate(([l, f, c]) => window.__events.setup(l, f, c, 360), [MINI, from, camera] as const);
    const start = 100;
    expect(await page.evaluate(([f, n]) => window.__events.change(f, n), [to, start] as const)).toBe(true);
    const n = FOG_EVENT_FRAMES[kind];
    const at: number[] = [];
    for (const k of [0, 0.2, 0.4, 0.6, 0.8, 1].map((u) => Math.round(u * n))) {
      const f = await page.evaluate((frame) => window.__events.frame(frame), start + k);
      let c = 0;
      for (let p = 0; p < f.width * f.height; p++) if (veil.has(hex(f.rgba, p))) c++;
      at.push(c);
    }
    return { at, rest: at.at(-1)! };
  }

  const refog = await veils(clear, fogged, 'refog');
  const charted = await veils(fogged, clear, 'clear');
  console.log(`moon veil px, refog (clear → fogged): ${refog.at.join(' ')}; chart (fogged → clear): ${charted.at.join(' ')}`);
  expect(refog.rest, 'not vacuous: fogged moons show their veil').toBeGreaterThan(0);
  expect(refog.at[0]!, 'a refog starts clear').toBeLessThan(refog.rest);
  for (const c of refog.at) expect(c, 'a refog never shows more fog than its end state').toBeLessThanOrEqual(refog.rest * SLACK);
  expect(refog.at[1]!, 'a refog grows').toBeLessThan(refog.at[3]!);
  expect(charted.at[1]!, 'a chart shrinks').toBeGreaterThan(charted.at[3]!);
  expect(charted.at[0]!, 'a chart starts fogged').toBeGreaterThan(charted.rest);
  expect(charted.rest, 'a charted moon ends clear').toBe(0);
  for (const c of charted.at) expect(c, 'a chart never shows less fog than its end state').toBeGreaterThanOrEqual(charted.rest / SLACK);
  expect(view.errors).toEqual([]);
});
