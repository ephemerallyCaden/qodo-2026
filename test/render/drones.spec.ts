// The agent drones on the real view (#80 AC 5-7): a fixture the size of this repo (11 planets, 90
// sessions) adds at most DRONE_CAP draw calls and stays inside the frame budget; the Claude and the
// generic drone both draw, in palette colours only; a frame is a pure function of (input, n); reduced
// motion freezes the idle. The drone view reaches the hook as `RenderInput.drones`. A rescan's layout,
// loaded by View.load() itself, draws none of the old scan's drones (#180).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { RenderInput } from '../../src/core/contract/api.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import type { DroneSession } from '../../src/core/contract/drones.js';
import { palette } from '../../src/core/palette.js';
import { startPose, toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { placeDrone } from '../../web/src/drones/place.js';
import { DRONE_CAP, entryOf, selectDrones } from '../../web/src/drones/select.js';
import { systemModel } from '../../web/src/model/system.js';
import { droneView, repoDrones } from '../fixtures/drones.js';
import { selfLikeRoots } from '../fixtures/overview.js';
import { assertRendered, coverage, diffPixels, hex, LOW_RES, rgbaAt, statsProblems, type Frame } from './frame.js';
import { checkGolden, describeEnv, GOLDEN_DIR } from './golden.js';
import { eventsPage, fogFor, goldenOptions, openView, render, renderEnv, systemView } from './harness.js';
import { LATER } from './suite.js';
import { OVERVIEW } from './thresholds.js';
import { paletteProblems, type RenderEnv } from './twin.js';

const model = systemModel(selfLikeRoots);
const repo = repoDrones(selfLikeRoots);
const withDrones = (extra: Partial<RenderInput> = {}, drones = repo): RenderInput => ({ layout: selfLikeRoots, drones, ...extra });
/** The closeup frames are mostly space: they need only a drone's worth of pixels, not the golden fixtures' 5%. */
const CLOSEUP_MIN = 0.02;

/** A camera 1.2 units out from a drone's face and a little above it, looking at it. */
function closeup(s: DroneSession, frame: number): ReturnType<typeof toCameraPose> {
  const at = placeDrone(model, s.home!, s.seed, frame)!;
  const out: [number, number, number] = [Math.sin(at.yaw), 0, Math.cos(at.yaw)];
  const pose: OrbitPose = { target: at.centre, yaw: Math.atan2(out[0], out[2]), pitch: 0.15, dist: 1.2 };
  return toCameraPose(pose);
}
/** The one drone alone in the frame (so the pixels are its own and its planet's), as a drone view. */
const alone = (s: DroneSession) => droneView(repo.head, [s]);
const count = (f: Frame, colour: string) => { let n = 0; for (let i = 0; i < f.rgba.length; i += 4) if (hex(rgbaAt(f.rgba, i)) === colour) n++; return n; };

const claude = repo.sessions.find((s) => s.tool === 'claude-code' && s.home !== null)!;
const generic = repo.sessions.find((s) => s.tool === 'codex' && s.home !== null)!;

test.describe('drones', () => {
  let env: RenderEnv;
  test.beforeAll(async ({ browser }) => {
    env = await renderEnv(browser);
    console.log(`render env: ${describeEnv(env)}`);
  });

  test('90 sessions on 11 planets add at most DRONE_CAP draw calls and stay within 100 draw calls and 500k triangles', async ({ page }) => {
    const view = await openView(page, systemView());
    const [bare] = await render(view, { layout: selfLikeRoots }, [0]);
    const [full] = await render(view, withDrones(), [0]);
    expect(repo.total).toBe(90);
    expect(selfLikeRoots.planets).toHaveLength(11);
    const drawn = selectDrones(repo, () => true).shown.length;
    const added = full!.stats.drawCalls - bare!.stats.drawCalls;
    console.log(`bare: ${bare!.stats.drawCalls} draw calls, ${bare!.stats.triangles} triangles; with ${drawn} drones: ${full!.stats.drawCalls} draw calls, ${full!.stats.triangles} triangles (+${added} draw calls)`);
    expect(drawn).toBe(DRONE_CAP);
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThanOrEqual(DRONE_CAP);
    assertRendered(full!.pixels, full!.stats, LOW_RES, OVERVIEW.minNonSpaceFraction); // not a blank frame
    expect(statsProblems(full!.stats, full!.pixels)).toEqual([]);
    expect(view.errors).toEqual([]);
  });

  test('draws the Claude drone and the generic drone, in palette colours only', async ({ page }) => {
    const view = await openView(page, systemView());
    const bare = await render(view, { layout: selfLikeRoots, camera: closeup(claude, 0), depthFade: false }, [0]);
    const c = await render(view, withDrones({ camera: closeup(claude, 0), depthFade: false }, alone(claude)), [0]);
    const g = await render(view, withDrones({ camera: closeup(generic, 0), depthFade: false }, alone(generic)), [0]);
    for (const r of [...c, ...g]) {
      assertRendered(r.pixels, r.stats, LOW_RES, CLOSEUP_MIN);
      expect(paletteProblems(r.pixels)).toEqual([]);
    }
    // Not vacuous: the drone is what changed, and each look has its own colours.
    expect(diffPixels(bare[0]!.pixels, c[0]!.pixels)).toBeGreaterThan(100);
    const orange = palette.drone.claude.shell[3], lilac = palette.drone.generic.shell[3];
    console.log(`claude closeup: ${count(c[0]!.pixels, orange)} px ${orange} (${coverage(c[0]!.pixels).colours} colours); generic closeup: ${count(g[0]!.pixels, lilac)} px ${lilac}, ${count(g[0]!.pixels, orange)} px ${orange}`);
    expect(count(c[0]!.pixels, orange)).toBeGreaterThan(20);
    expect(count(g[0]!.pixels, lilac)).toBeGreaterThan(20);
    expect(count(g[0]!.pixels, orange)).toBe(0);
    expect(view.errors).toEqual([]);
  });

  test('frame n is a pure function of (input, n); reduced motion holds frame 0', async ({ page }) => {
    const view = await openView(page, systemView());
    const cam = closeup(claude, 0);
    const input = withDrones({ camera: cam }, alone(claude));
    const a = await render(view, input, [0, LATER, 0]);
    expect(diffPixels(a[0]!.pixels, a[2]!.pixels)).toBe(0);
    expect(diffPixels(a[0]!.pixels, a[1]!.pixels)).toBeGreaterThan(0); // the drone moves (it needs its own camera: it orbits)
    const still = await render(view, { ...input, reducedMotion: true }, [0, LATER]);
    expect(diffPixels(still[0]!.pixels, still[1]!.pixels)).toBe(0);
    expect(view.errors).toEqual([]);
  });

  // The hook's own check (30f24af). It can't show what View.load() does with the drones it holds, since the
  // hook sets them on every load: that check is tested in 'drones over a rescan' below (#180).
  test("the render hook refuses drones of another scan's head", async ({ page }) => {
    const view = await openView(page, systemView());
    const other = { ...repo, head: 'f'.repeat(40) };
    await expect(render(view, withDrones({}, other), [0])).rejects.toThrow(/different scans/);
  });

  test('two loads of the same inputs give identical frames', async ({ page }) => {
    const view = await openView(page, systemView());
    const first = await render(view, withDrones(), [0, 90]);
    const second = await render(view, withDrones(), [90, 0]);
    assertRendered(first[0]!.pixels, first[0]!.stats, LOW_RES, OVERVIEW.minNonSpaceFraction); // not two blank frames
    expect(diffPixels(first[0]!.pixels, second[1]!.pixels)).toBe(0);
    expect(diffPixels(first[1]!.pixels, second[0]!.pixels)).toBe(0);
  });

  // New goldens are made in CI's pinned container and committed from its artifact (test/render/README.md).
  // (No overview golden: checkGolden holds a golden to the 5% anti-empty floor, which a system overview can't meet.)
  // Locally, with none committed, there is nothing to compare: everything above still ran.
  const cases = [
    ['drones-claude-closeup-f0', () => ({ input: withDrones({ camera: closeup(claude, 0) }, alone(claude)), frame: 0 })],
    ['drones-generic-closeup-f0', () => ({ input: withDrones({ camera: closeup(generic, 0) }, alone(generic)), frame: 0 })],
  ] as const;
  for (const [name, make] of cases) {
    test(`matches golden ${name}`, async ({ page }, info) => {
      test.skip(!existsSync(join(GOLDEN_DIR, `${name}.png`)) && !process.env['CI'] && process.env['UPDATE_GOLDEN'] !== '1', `no golden ${name} committed yet; CI's artifact provides it`);
      const view = await openView(page, systemView());
      const { input, frame } = make();
      const [r] = await render(view, input, [frame]);
      assertRendered(r!.pixels, r!.stats, LOW_RES, CLOSEUP_MIN);
      const result = checkGolden(name, r!.pixels, r!.stats, goldenOptions(env));
      if (result.status === 'unpinned') info.annotations.push({ type: 'golden-informational', description: `${result.diffPixels} px differ (not pinned)` });
      expect(view.errors).toEqual([]);
    });
  }
});

// The rescan case on the view's own loading path (#180, Qodo bf47b2c8 on #127). The live view loads a
// rescan's layout first and asks for its drones after, so until they come View.load() itself must leave
// the old scan's drones out. The render hook can't show it: it sets the drones on every load. The events
// page calls View.load() and View.setDrones() directly. #180's proof: with View.load()'s head check
// (30f24af) removed, both tests fail with 54 draw calls instead of 38 (the 16 old drones drawn); with only
// View.setDrones()'s removed, the second fails (it returns true). Both pass on the code as it is.
test.describe('drones over a rescan, through View.load() (#180)', () => {
  /** The same planets at a new commit: every old drone's home is still on the map. */
  const rescan: LayoutV1 = { ...selfLikeRoots, source: { ...selfLikeRoots.source, head: 'f'.repeat(40) } };
  const camera = toCameraPose(startPose(model));
  /** The old scan's drones, as its drone controller hands them to the view. */
  const entries = selectDrones(repo, () => true).shown.map(entryOf);
  const asFrame = (f: { width: number; height: number; rgba: number[] }): Frame => ({ width: f.width, height: f.height, rgba: Uint8Array.from(f.rgba) });
  const frame0 = (page: Page) => page.evaluate(() => window.__events.frame(0));
  const reload = (page: Page, l: LayoutV1) => page.evaluate(([l, f]) => window.__events.reload(l, f), [l, fogFor(l)] as const);

  /**
   * Draws the rescan's map with no drones ever set (the reference), then the old scan's map with its
   * drones, as the live view has them when the rescan lands. Both frames are checked not blank, and the
   * drones are checked drawn, so a missing drone later means one was left out.
   */
  async function oldScanWithDrones(page: Page) {
    const view = await openView(page, eventsPage(), { testMode: false });
    await page.waitForFunction(() => window.__events !== undefined);
    await page.evaluate(([l, f, c, h]) => window.__events.setup(l, f, c, h), [rescan, fogFor(rescan), camera, LOW_RES.height] as const);
    const bare = await frame0(page);
    await page.evaluate(([l, f, c, h]) => window.__events.setup(l, f, c, h), [selfLikeRoots, fogFor(selfLikeRoots), camera, LOW_RES.height] as const);
    expect(await page.evaluate(([e, h]) => window.__events.drones(e, h), [entries, repo.head] as const)).toBe(true);
    const old = await frame0(page);
    assertRendered(asFrame(bare), bare.stats, LOW_RES, OVERVIEW.minNonSpaceFraction);
    assertRendered(asFrame(old), old.stats, LOW_RES, OVERVIEW.minNonSpaceFraction);
    expect(entries).toHaveLength(DRONE_CAP);
    expect(old.stats.drawCalls, 'the old scan draws its drones').toBe(bare.stats.drawCalls + DRONE_CAP);
    expect(diffPixels(asFrame(old), asFrame(bare)), 'the drones show in the frame').toBeGreaterThan(0);
    return { view, bare };
  }

  test("a rescan's layout draws none of the old scan's drones; a reload of the same scan keeps them (Qodo bf47b2c8)", async ({ page }) => {
    const { view, bare } = await oldScanWithDrones(page);
    await reload(page, selfLikeRoots);
    expect((await frame0(page)).stats.drawCalls, 'a reload of the same scan keeps its drones').toBe(bare.stats.drawCalls + DRONE_CAP);
    await reload(page, rescan);
    const after = await frame0(page);
    console.log(`rescan map: ${after.stats.drawCalls} draw calls (${bare.stats.drawCalls} with no drones), ${diffPixels(asFrame(after), asFrame(bare))} px differ from it`);
    expect(after.stats.drawCalls, "the rescan's map draws no drone of the old scan").toBe(bare.stats.drawCalls);
    expect(diffPixels(asFrame(after), asFrame(bare)), "the rescan's map is its map with no drones, pixel for pixel").toBe(0);
    expect(view.errors).toEqual([]);
  });

  test("the old scan's drones, set after the rescan's layout loaded, are refused (a late answer)", async ({ page }) => {
    const { view, bare } = await oldScanWithDrones(page);
    await reload(page, rescan);
    expect(await page.evaluate(([e, h]) => window.__events.drones(e, h), [entries, repo.head] as const), 'setDrones refuses another scan').toBe(false);
    const after = await frame0(page);
    expect(after.stats.drawCalls, "the rescan's map draws no drone of the old scan").toBe(bare.stats.drawCalls);
    expect(diffPixels(asFrame(after), asFrame(bare)), "the rescan's map is its map with no drones, pixel for pixel").toBe(0);
    expect(view.errors).toEqual([]);
  });
});
