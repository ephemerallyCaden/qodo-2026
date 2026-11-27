// Where the selected drone's panel docks (#189, web/src/drones/dock.ts): clear of that drone over its whole turn
// round its home, holding still while it does, and off the other open panels. Pure functions over the model of
// drone-panel.spec.ts's repo (planets aa and bb, a README on the star) from its start pose at 1920x1080, as its
// scene B: planet bb sits low on the left, under the panel's home in the bottom left.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { project, startPose } from '../../web/src/camera/pose.js';
import { chooseDock, DOCK_INSET, DOCK_MARGIN, DOCKS, dockBox, droneTrack, HIDES, TRACK_SAMPLES, type Dock, type DockInput } from '../../web/src/drones/dock.js';
import { DRONE_TURNS, homeBody, placeDrone } from '../../web/src/drones/place.js';
import type { Rect } from '../../web/src/labels/place.js';
import { LOOP_FRAMES } from '../../web/src/model/motion.js';
import { systemModel } from '../../web/src/model/system.js';
import { layout } from '../../src/core/layout/index.js';
import { A, world } from '../fixtures/layout.js';

const repo = world([[A('aa/one.ts'), A('aa/two.ts'), A('bb/three.ts'), A('README.md')]]);
const model = systemModel(layout(repo.snapshot, repo.history));
const pose = startPose(model);
const W = 1920, H = 1080;
const SCREEN: Rect = { x: 0, y: 0, w: W, h: H };
/** #drone-panel's size with one file listed (drone-panel.spec.ts measured it: the same at 1280x720 and 1920x1080). */
const PANEL = { w: 289, h: 381 };
const TURN = LOOP_FRAMES / DRONE_TURNS;
const input = (track: readonly Rect[], over: Partial<DockInput> = {}): DockInput => ({ track, panel: PANEL, window: { w: W, h: H }, topLeft: 60, others: [], ...over });
/** How much of box `a` lies under box `b`, as a share of `a`. */
const under = (a: Rect, b: Rect) =>
  (Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))) / (a.w * a.h);
const homes = model.planets.map((p) => p.dirId as string);

/** The first drone (home, seed) clear of the panel's home in the bottom left when it's clicked at frame 0, then more than half under it later in its turn: #189's scene B. */
function orbitsUnder(): { home: string; seed: number } {
  const home0 = dockBox('bottom-left', input([]));
  for (let seed = 0; seed < 5000; seed++) {
    for (const home of homes) {
      const [now, ...turn] = droneTrack(model, home, seed, 0, pose, SCREEN);
      if (!now || under(now, home0) > 0 || now.x < 0 || now.y < 0) continue;
      if (turn.some((b) => under(b, home0) > HIDES)) return { home, seed };
    }
  }
  throw new Error('no drone orbits under the panel');
}

describe("the selected drone's panel docks clear of it (#189)", () => {
  it('opens at its home in the bottom left when that keeps the drone clear for its whole turn', () => {
    const home0 = dockBox('bottom-left', input([]));
    const clear = homes.flatMap((home) => Array.from({ length: 200 }, (_, seed) => ({ home, seed })))
      .find(({ home, seed }) => droneTrack(model, home, seed, 0, pose, SCREEN).every((b) => under(b, home0) === 0))!;
    expect(clear, 'some drone keeps clear of the bottom left').toBeDefined();
    expect(chooseDock(input(droneTrack(model, clear.home, clear.seed, 0, pose, SCREEN)), null)).toBe('bottom-left');
  });

  it('docks a drone that orbits under its home elsewhere, keeps all of it in view and holds still every frame of a whole turn (AC 1, 4, 5)', () => {
    const { home, seed } = orbitsUnder();
    const home0 = dockBox('bottom-left', input([]));
    let dock: Dock | null = null;
    const docks: Dock[] = [], hiddenAtHome: number[] = [];
    for (let f = 0; f <= TURN; f++) {
      const track = droneTrack(model, home, seed, f, pose, SCREEN);
      dock = chooseDock(input(track), dock);
      docks.push(dock);
      expect(under(track[0]!, dockBox(dock, input(track))), `the drone under its panel at frame ${f}`).toBe(0);
      if (under(track[0]!, home0) > HIDES) hiddenAtHome.push(f);
    }
    expect(hiddenAtHome.length, 'docked at home, the panel would hide the drone for part of the turn (the bug)').toBeGreaterThan(0);
    expect(new Set(docks), 'one corner for the whole turn').toEqual(new Set([docks[0]]));
    expect(docks[0]).toBe('bottom-right');
  });

  it('is a pure function of its input (Rule 3)', () => {
    const { home, seed } = orbitsUnder();
    expect(droneTrack(model, home, seed, 123, pose, SCREEN)).toEqual(droneTrack(model, home, seed, 123, pose, SCREEN));
    const track = droneTrack(model, home, seed, 123, pose, SCREEN);
    for (const current of [null, ...DOCKS]) expect(chooseDock(input(track), current)).toBe(chooseDock(input(track), current));
  });

  it('tracks the drone now and its whole turn round its home where the home is now', () => {
    const { home, seed } = orbitsUnder();
    const f = 400, track = droneTrack(model, home, seed, f, pose, SCREEN);
    expect(track).toHaveLength(TRACK_SAMPLES + 1);
    const centre = (b: Rect) => [b.x + b.w / 2, b.y + b.h / 2];
    const at = (p: readonly number[]) => { const s = project(pose, p as [number, number, number])!; return [((s.x + 1) / 2) * W, ((1 - s.y) / 2) * H]; };
    const now = at(placeDrone(model, home, seed, f)!.centre);
    expect(centre(track[0]!)[0]).toBeCloseTo(now[0]!, 6);
    expect(centre(track[0]!)[1]).toBeCloseTo(now[1]!, 6);
    // sample k is the drone k/48 of a turn on, round the home as it is at frame f (no drift along the home's own orbit)
    const k = 7, fk = (k * TURN) / TRACK_SAMPLES, h = homeBody(model, home, f)!.centre, hk = homeBody(model, home, fk)!.centre, pk = placeDrone(model, home, seed, fk)!.centre;
    const ring = at([0, 1, 2].map((i) => h[i]! + pk[i]! - hk[i]!));
    expect(centre(track[k + 1]!)[0]).toBeCloseTo(ring[0]!, 6);
    expect(centre(track[k + 1]!)[1]).toBeCloseTo(ring[1]!, 6);
    expect(droneTrack(model, 'd_nowhere', seed, f, pose, SCREEN)).toEqual([]);
  });

  // Synthetic tracks from here: one 100 px drone box against the docks.
  const box = (x: number, y: number): Rect => ({ x, y, w: 100, h: 100 });
  const br = dockBox('bottom-right', input([]));

  it('holds still near a tie: it leaves a corner only for one that covers at least DOCK_MARGIN less of the drone (AC 4)', () => {
    expect(DOCK_MARGIN).toBe(0.1);
    const slightly = box(br.x - 95, br.y + 100), more = box(br.x - 85, br.y + 100); // 5% and 15% under the bottom right, clear of the bottom left
    expect(chooseDock(input([slightly]), 'bottom-right')).toBe('bottom-right');
    expect(chooseDock(input([more]), 'bottom-right')).toBe('bottom-left');
    // and a corner that keeps the drone clear is kept, though the panel would open elsewhere
    expect(chooseDock(input([box(W / 2, H / 2)]), 'top-right')).toBe('top-right');
    expect(chooseDock(input([box(W / 2, H / 2)]), null)).toBe('bottom-left');
  });

  it('keeps off the other open panels when a corner clear of them keeps the drone in view', () => {
    const review: Rect = { x: W - 8 - 512, y: 56, w: 512, h: H - 64 }; // a review panel showing a diff, the right edge's full height
    const low = box(100, H - 200); // under the bottom left
    expect(chooseDock(input([low]), null)).toBe('bottom-right');
    expect(chooseDock(input([low], { others: [review] }), null)).toBe('top-left');
    expect(chooseDock(input([low], { others: [review] }), 'bottom-right'), 'and leaves one that covers it').toBe('top-left');
  });

  it('would rather cover another panel than hide the drone (AC 1)', () => {
    const review: Rect = { x: W - 8 - 512, y: 56, w: 512, h: H - 64 };
    const turn = [box(100, H - 200), box(100, 200)]; // a turn under both left corners
    const got = chooseDock(input(turn, { others: [review] }), null);
    expect(got.endsWith('right')).toBe(true);
    for (const b of turn) expect(under(b, dockBox(got, input(turn)))).toBeLessThanOrEqual(HIDES);
  });

  it('places each corner at its insets, the bottom left matching style.css (#drone-panel)', () => {
    const i = input([], { topLeft: 97 });
    expect(dockBox('bottom-left', i)).toEqual({ x: 8, y: H - 40 - PANEL.h, ...PANEL });
    expect(dockBox('bottom-right', i)).toEqual({ x: W - 8 - PANEL.w, y: H - 40 - PANEL.h, ...PANEL });
    expect(dockBox('top-left', i)).toEqual({ x: 8, y: 97, ...PANEL });
    expect(dockBox('top-right', i)).toEqual({ x: W - 8 - PANEL.w, y: 56, ...PANEL });
    const css = readFileSync(join(import.meta.dirname, '../../web/src/style.css'), 'utf8');
    const rule = /#drone-panel \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain(`left: ${DOCK_INSET.side}px`);
    expect(rule).toContain(`bottom: ${DOCK_INSET.bottom}px`);
  });
});
