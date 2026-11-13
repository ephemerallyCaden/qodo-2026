// The agent drones on the real view (#80 AC 5-7): a fixture the size of this repo (11 planets, 90
// sessions) adds at most DRONE_CAP draw calls and stays inside the frame budget; the Claude and the
// generic drone both draw, in palette colours only; a frame is a pure function of (input, n); reduced
// motion freezes the idle. The drone view reaches the hook as `RenderInput.drones`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { RenderInput } from '../../src/core/contract/api.js';
import type { DroneSession } from '../../src/core/contract/drones.js';
import { palette } from '../../src/core/palette.js';
import { toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { placeDrone } from '../../web/src/drones/place.js';
import { DRONE_CAP, selectDrones } from '../../web/src/drones/select.js';
import { systemModel } from '../../web/src/model/system.js';
import { droneView, repoDrones } from '../fixtures/drones.js';
import { selfLikeRoots } from '../fixtures/overview.js';
import { assertRendered, coverage, diffPixels, hex, LOW_RES, rgbaAt, statsProblems, type Frame } from './frame.js';
import { checkGolden, describeEnv, GOLDEN_DIR } from './golden.js';
import { goldenOptions, openView, render, renderEnv, systemView } from './harness.js';
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

  test('two loads of the same inputs give identical frames', async ({ page }) => {
    const view = await openView(page, systemView());
    const first = await render(view, withDrones(), [0, 90]);
    const second = await render(view, withDrones(), [90, 0]);
    expect(diffPixels(first[0]!.pixels, second[1]!.pixels)).toBe(0);
    expect(diffPixels(first[1]!.pixels, second[0]!.pixels)).toBe(0);
  });

  // New goldens are made in CI's pinned container and committed from its artifact (test/render/README.md).
  // Locally, with none committed, there is nothing to compare: everything above still ran.
  const cases = [
    ['drones-claude-closeup-f0', () => ({ input: withDrones({ camera: closeup(claude, 0) }, alone(claude)), frame: 0 })],
    ['drones-generic-closeup-f0', () => ({ input: withDrones({ camera: closeup(generic, 0) }, alone(generic)), frame: 0 })],
    ['drones-repo-f0', () => ({ input: withDrones(), frame: 0 })],
  ] as const;
  for (const [name, make] of cases) {
    test(`matches golden ${name}`, async ({ page }, info) => {
      test.skip(!existsSync(join(GOLDEN_DIR, `${name}.png`)) && !process.env['CI'] && process.env['UPDATE_GOLDEN'] !== '1', `no golden ${name} committed yet; CI's artifact provides it`);
      const view = await openView(page, systemView());
      const { input, frame } = make();
      const [r] = await render(view, input, [frame]);
      assertRendered(r!.pixels, r!.stats, LOW_RES, name === 'drones-repo-f0' ? OVERVIEW.minNonSpaceFraction : CLOSEUP_MIN);
      const result = checkGolden(name, r!.pixels, r!.stats, goldenOptions(env));
      if (result.status === 'unpinned') info.annotations.push({ type: 'golden-informational', description: `${result.diffPixels} px differ (not pinned)` });
      expect(view.errors).toEqual([]);
    });
  }
});
