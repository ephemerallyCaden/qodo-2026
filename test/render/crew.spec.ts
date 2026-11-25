// The crew's ship on the real view (#207 C2–C4, C8; Qodo ae4b1e97): the R2-4c hull carries the crew fixture's six
// (test/golden/crew.json, the JSON twin of test/fixtures/crew) at one draw call each, inside the frame budget; it
// fails on a frame without the ship; every pixel it adds is BLK 36; each rider shows through their porthole (the
// window's interior march steps inside the hull) and the captain wears the cap (the flameless cap shader
// compiles); one 12 s idle cycle later the ship and crew are pixel-identical; a frame is a pure function of its
// input. The crew view reaches the hook as `RenderInput.crew`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { RenderInput } from '../../src/core/contract/api.js';
import type { CrewMember, CrewView } from '../../src/core/contract/crew.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { palette } from '../../src/core/palette.js';
import { startPose, toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { placeShip, portholes, shipCorners } from '../../web/src/crew/place.js';
import { FPS } from '../../web/src/model/motion.js';
import { systemModel } from '../../web/src/model/system.js';
import { buildShip, CYCLE, MAX_ABOARD } from '../../web/src/render/ship-spec.js';
import { repoDrones } from '../fixtures/drones.js';
import { selfLikeRoots } from '../fixtures/overview.js';
import { assertRendered, diffPixels, hex, LOW_RES, rgbaAt, statsProblems, type Frame } from './frame.js';
import { describeEnv } from './golden.js';
import { MINI, openView, render, renderEnv, systemView } from './harness.js';
import { LATER } from './suite.js';
import { BUDGET } from './thresholds.js';
import { paletteProblems } from './twin.js';

const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, '../golden/crew.json'), 'utf8')) as { crew: CrewView };
const BLK_36 = new Set<string>(JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/blk-36.published.json'), 'utf8')).colors);
/** The crew fixture's crew, on another layout's head: the members are what the ship draws. */
const crewOn = (l: LayoutV1, crew: CrewView = GOLDEN.crew): CrewView => ({ ...crew, head: l.source.head });
/** n invented crew members, `captain` (an index) being you. */
function crewOf(l: LayoutV1, n: number, captain: number | null): CrewView {
  const members: CrewMember[] = Array.from({ length: n }, (_, i) => ({ person: `p_${(i + 1).toString(16).padStart(12, '0')}` as CrewMember['person'], displayName: `Crew ${i}`, seed: (i * 2654435761) >>> 0, captain: i === captain }));
  return { schemaVersion: 'crew.1', head: l.source.head, members, total: n, bots: 0, needsRescan: false };
}
const ABOARD = GOLDEN.crew.members.length; // 6, the captain among them

const model = systemModel(MINI);
/** A camera on the ship at `frame`, `lift` up its axis, looking at its front from `dist`. */
function onShip(frame: number, lift: number, dist: number, pitch = 0.12): ReturnType<typeof toCameraPose> {
  const at = placeShip(model, frame);
  const pose: OrbitPose = { target: [at.centre[0], at.centre[1] + lift, at.centre[2]], yaw: at.yaw, pitch, dist };
  return toCameraPose(pose);
}
const WHOLE = (frame: number) => onShip(frame, 2.0, 9, 0.2);
/** A camera `dist` level in front of the captain's porthole (seat 0) of a ship of `seats`, at frame 0: the cap's crown shows above the visor. */
function onCaptain(seats: number, dist: number): ReturnType<typeof toCameraPose> {
  const at = placeShip(model, 0), hole = portholes(buildShip(seats), at, 0)[0]!;
  return toCameraPose({ target: hole.centre, yaw: at.yaw, pitch: 0, dist });
}
const count = (f: Frame, colours: readonly string[]) => {
  const set = new Set(colours);
  let n = 0;
  for (let i = 0; i < f.rgba.length; i += 4) if (set.has(hex(rgbaAt(f.rgba, i)))) n++;
  return n;
};
/** The pixels that differ between two frames, as indices. */
const changedPixels = (a: Frame, b: Frame) => {
  const out: number[] = [];
  for (let p = 0; p < a.width * a.height; p++) if (rgbaAt(a.rgba, p * 4) !== rgbaAt(b.rgba, p * 4)) out.push(p);
  return out;
};

test.describe('crew ship', () => {
  test.beforeAll(async ({ browser }) => {
    console.log(`render env: ${describeEnv(await renderEnv(browser))}`);
  });

  test('draws the crew fixture\'s six aboard as 1 hull + 6 astronauts + 1 cap draw calls in BLK 36 only, and fails on a frame without the ship', async ({ page }) => {
    const view = await openView(page, systemView());
    const shot = async (crew: CrewView | null, camera = WHOLE(0)) => (await render(view, { layout: MINI, crew, camera, depthFade: false }, [0]))[0]!;
    const bare = await shot(null), full = await shot(crewOn(MINI));
    const added = full.stats.drawCalls - bare.stats.drawCalls;
    const changed = changedPixels(bare.pixels, full.pixels);
    console.log(`ship close-up: ${bare.stats.drawCalls} → ${full.stats.drawCalls} draw calls (+${added}), ${changed.length} px changed`);
    expect(added).toBe(1 + ABOARD + 1);
    assertRendered(full.pixels, full.stats, LOW_RES, 0.02); // not a blank frame
    expect(changed.length).toBeGreaterThan(3000); // the ship is what changed: a view that drew no ship fails here
    expect(statsProblems(full.stats, full.pixels)).toEqual([]);
    // every colour it adds is BLK 36 (palette.ship and palette.crew), never teal, and nothing is off-palette
    const top = onCaptain(ABOARD, 2.2);
    const bareTop = await shot(null, top), capt = await shot(crewOn(MINI), top);
    for (const [b, r] of [[bare, full], [bareTop, capt]] as const) {
      expect(paletteProblems(r.pixels)).toEqual([]);
      const colours = new Set(changedPixels(b.pixels, r.pixels).map((p) => hex(rgbaAt(r.pixels.rgba, p * 4))));
      expect(colours.size).toBeGreaterThanOrEqual(6);
      expect([...colours].filter((h) => !BLK_36.has(h))).toEqual([]);
      expect([...colours].filter((h) => (palette.accent.teal as readonly string[]).includes(h))).toEqual([]);
    }
    // each rider shows through their porthole (the window's interior march steps inside the hull first):
    // six aboard show far more visor and suit than one
    const visor = [...palette.crew.visor], suit = ['#4185d8', '#5ab9e5']; // the suit's blues: no hull colour
    const one = await shot(crewOf(MINI, 1, 0));
    const crewPx = (f: Frame) => count(f, [...visor, ...suit]);
    console.log(`crew px at the whole-ship close-up: 1 aboard ${crewPx(one.pixels)}, 6 aboard ${crewPx(full.pixels)}`);
    expect(crewPx(one.pixels)).toBeGreaterThan(10);
    expect(crewPx(full.pixels)).toBeGreaterThan(4 * crewPx(one.pixels));
    // the captain's porthole up close, flame out of frame: the cap's gold shows (its flameless shader
    // compiled), and only on the captain
    const gold = ['#ff965f', '#ffe091'];
    const none = await shot(crewOf(MINI, 6, null), top);
    console.log(`cap gold px: with the captain ${count(capt.pixels, gold)}, without ${count(none.pixels, gold)}; visor px in the captain's porthole ${count(capt.pixels, visor)}`);
    expect(count(capt.pixels, gold)).toBeGreaterThan(20);
    expect(count(none.pixels, gold)).toBe(0);
    expect(count(capt.pixels, visor)).toBeGreaterThan(40);
    expect(view.errors).toEqual([]);
  });

  test('with a crew, the start view (no camera given, as Home) frames the ship; without one it is the layout\'s own', async ({ page }) => {
    const view = await openView(page, systemView());
    const home = toCameraPose(startPose(model, shipCorners(model, buildShip(ABOARD))));
    const [shipHome] = await render(view, { layout: MINI, crew: crewOn(MINI), depthFade: false }, [0]);
    const [bareHome] = await render(view, { layout: MINI, camera: home, depthFade: false }, [0]);
    const [plain] = await render(view, { layout: MINI, depthFade: false }, [0]);
    const [plainPose] = await render(view, { layout: MINI, camera: toCameraPose(startPose(model)), depthFade: false }, [0]);
    const ship = diffPixels(bareHome!.pixels, shipHome!.pixels);
    console.log(`start view: the ship adds ${ship} px; the framing moved ${diffPixels(plain!.pixels, bareHome!.pixels)} px of the bare system`);
    expect(shipHome!.stats.drawCalls - bareHome!.stats.drawCalls).toBe(1 + ABOARD + 1); // every proxy in view
    expect(ship).toBeGreaterThan(400);
    expect(diffPixels(plain!.pixels, plainPose!.pixels)).toBe(0); // no crew: the start pose is untouched
    expect(view.errors).toEqual([]);
  });

  test('stays inside the frame budget (100 draw calls, 500k triangles) with 16 aboard, on mini and on the repo-sized fixture with 90 sessions', async ({ page }) => {
    const view = await openView(page, systemView());
    // pulled back from the start pose until the ship is in view too, so every proxy is drawn: the worst case
    const all = (l: LayoutV1) => {
      const m = systemModel(l), s = startPose(m), at = placeShip(m, 0);
      return toCameraPose({ ...s, target: [s.target[0] / 2 + at.centre[0] / 2, s.target[1] / 2 + at.centre[1] / 2 + 1.5, s.target[2] / 2 + at.centre[2] / 2], dist: s.dist * 1.6 });
    };
    const cases: [string, RenderInput][] = [
      ['mini, 40 crew (16 aboard, +24)', { layout: MINI, crew: crewOf(MINI, 40, 0), camera: all(MINI) }],
      ['selfLikeRoots, 90 sessions, 40 crew', { layout: selfLikeRoots, drones: repoDrones(selfLikeRoots), crew: crewOf(selfLikeRoots, 40, 7), camera: all(selfLikeRoots) }],
    ];
    for (const [name, input] of cases) {
      const [bare] = await render(view, { ...input, crew: null }, [0]);
      const [r] = await render(view, input, [0]);
      console.log(`${name}: ${r!.stats.drawCalls} draw calls (${bare!.stats.drawCalls} without the ship), ${r!.stats.triangles} triangles`);
      expect(r!.stats.drawCalls - bare!.stats.drawCalls).toBe(1 + MAX_ABOARD + 1);
      expect(r!.stats.drawCalls).toBeLessThanOrEqual(BUDGET.maxDrawCalls);
      expect(r!.stats.triangles).toBeLessThanOrEqual(BUDGET.maxTriangles);
      expect(statsProblems(r!.stats, r!.pixels)).toEqual([]);
    }
    expect(view.errors).toEqual([]);
  });

  // The camera rides with the ship, which turns round the star with the orbits (6° in 12 s), so the two frames
  // see it through rotated matrices: float rounding can flip a few edge pixels (0 to 3 of about 4600 seen), far
  // under the frame-to-frame change the seam rule compares against (art-direction §7 "Seamless test"). The pure
  // poses are exactly periodic: test/web/crew.test.ts.
  test('one 12 s idle cycle later, the ship and crew are the same frame (art-direction §7 loop lock)', async ({ page }) => {
    const view = await openView(page, systemView());
    const f0 = 90, f1 = f0 + CYCLE * FPS, next = f0 + 1;
    // the camera rides with the ship, which turns with the orbits: only the ship's own motion is left
    const at = async (f: number, crew: CrewView | null) => (await render(view, { layout: MINI, crew, camera: WHOLE(f), depthFade: false }, [f]))[0]!.pixels;
    const [a, b, step] = [await at(f0, crewOn(MINI)), await at(f1, crewOn(MINI)), await at(next, crewOn(MINI))];
    const mask = new Set([...changedPixels(await at(f0, null), a), ...changedPixels(await at(f1, null), b)]);
    const differ = [...mask].filter((p) => rgbaAt(a.rgba, p * 4) !== rgbaAt(b.rgba, p * 4)).length;
    const frameStep = [...mask].filter((p) => rgbaAt(a.rgba, p * 4) !== rgbaAt(step.rgba, p * 4)).length;
    console.log(`ship mask ${mask.size} px; one cycle on ${differ} differ; one frame on ${frameStep}`);
    expect(mask.size).toBeGreaterThan(3000);
    expect(differ).toBeLessThanOrEqual(Math.min(mask.size * 0.005, frameStep / 4)); // far under one frame's change: no seam
    expect(frameStep).toBeGreaterThan(30); // not vacuous: the idle does move
    expect(view.errors).toEqual([]);
  });

  test('frame n is a pure function of (input, n); two loads give identical frames; reduced motion holds frame 0', async ({ page }) => {
    const view = await openView(page, systemView());
    const input: RenderInput = { layout: MINI, crew: crewOn(MINI), camera: WHOLE(0) };
    const a = await render(view, input, [0, LATER, 0]);
    const b = await render(view, input, [LATER, 0]);
    expect(diffPixels(a[0]!.pixels, a[2]!.pixels)).toBe(0);
    expect(diffPixels(a[1]!.pixels, b[0]!.pixels)).toBe(0);
    expect(diffPixels(a[0]!.pixels, a[1]!.pixels)).toBeGreaterThan(0);
    const still = await render(view, { ...input, reducedMotion: true }, [0, LATER]);
    expect(diffPixels(still[0]!.pixels, still[1]!.pixels)).toBe(0);
    expect(view.errors).toEqual([]);
  });

  test('the render hook refuses a crew of another scan\'s head, or a malformed one', async ({ page }) => {
    const view = await openView(page, systemView());
    await expect(render(view, { layout: MINI, crew: { ...GOLDEN.crew, head: 'f'.repeat(40) } }, [0])).rejects.toThrow(/different scans/);
    await expect(render(view, { layout: MINI, crew: { ...crewOn(MINI), members: [...GOLDEN.crew.members].reverse() } }, [0])).rejects.toThrow(/invalid crew/);
  });
});
