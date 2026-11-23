// Scene drone-panel (#189): a selected drone hidden under its own panel. The data is review.spec.ts's
// four-file repo (planets aa and bb, a README on the star), scanned with --no-ingest --no-root, with one
// scripted Claude session on bb, which sits low on the left of the start pose, where the drone panel
// opens. Seeds and frames from the #189 debugger (debug/189-drone-panel, verified at e0189cf).
// - A: seed 28, under reduced motion (frame 0 held), drawn where the panel opens: at 1280x720 (stills
//   only) and at 1920x1080. The clean still pairs and pixel numbers.
// - B: seed 78 at 1920x1080 with motion, clicked at frame 0 while clear of the panel, then 12 s of loop
//   time as it orbits down into it. The GIF.
// Each drone is clicked where this build draws it (locateDrone, from the page's own pixels), so either
// build is clicked right wherever it puts the drone; a drone it doesn't show stops the run. Every still
// measures the drone (measureDrones): drawn, visible, and drawn under the open drone panel.
import type { DirId } from '../../../../src/core/snapshot/types.js';
import type { Scene, SceneContext, SceneData, ScenePart } from '../scripts/scene.js';
import { droneAt, homePose, scriptedDetail, scriptedDrone } from './helpers.js';
import { systemModel } from '../../../../web/src/model/system.js';

const FIXTURE = { files: { 'aa/one.ts': 'one\n', 'aa/two.ts': 'two\n', 'bb/three.ts': 'three\n', 'README.md': '# r\n' }, at: '2026-10-10T09:00:00Z' } as const;
const HOME = 'bb';
const HD = { width: 1920, height: 1080 } as const;

const homeOf = (data: SceneData): DirId => {
  const p = data.layout.planets.find((x) => x.path === HOME);
  if (!p) throw new Error(`the layout has no planet ${HOME}`);
  return p.dirId as DirId;
};

/** One session on bb with `seed`; its panel lists bb/three.ts, 3 edits, all in the last slice. */
const drones = (seed: number) => (data: SceneData) => {
  const { session, view } = scriptedDrone(data.layout.source.head, { home: homeOf(data), seed });
  return { view, detail: () => scriptedDetail(session, data.layout.source.head, [{ path: 'bb/three.ts', edits: 3 }]) };
};

async function opening(s: SceneContext): Promise<void> {
  await s.dismissOffer();
  await s.waitFor('the drone HUD counts the scripted drone', async () => (await s.page.$eval('#drones-hud', (e) => e.textContent ?? '')).includes('1 drone shown'));
}

/** Clicks the drone where this build draws it now, and waits for its panel's file list. */
async function select(s: SceneContext, seed: number): Promise<void> {
  const at = await s.locateDrone();
  if (!at.centre) s.fail(`seed ${seed}'s drone isn't visible at frame ${s.frame}, so it can't be clicked`);
  const model = systemModel(s.layout);
  const want = droneAt(model, homePose(model), homeOf({ layout: s.layout, files: s.files }), seed, s.frame, s.width, s.height);
  s.note(`seed ${seed}, frame ${s.frame}: ${at.visible} drone px visible, clicked at their centre ${at.centre.x},${at.centre.y}` +
    `${want ? ` (this checkout's drone code puts it at ${Math.round(want.click.x)},${Math.round(want.click.y)})` : ''}`);
  await s.click(at.centre.x, at.centre.y);
  await s.waitFor('the click opened the drone panel with its files', async () => (await s.page.$('#drone-panel:not([hidden]) li')) !== null);
}

/** A still, measured: the drone must be drawn, or the measure says nothing. */
async function measured(s: SceneContext, name: string): Promise<void> {
  s.still(name);
  const got = await s.measureDrones();
  s.note(`${name}: drone px drawn ${got.drawn}, visible ${got.visible}, drawn under #drone-panel ${got.underPanel}`);
  if (got.drawn === 0) s.fail(`${name}: the drone isn't drawn (or the seam no longer finds the drone shader)`);
}

const covered = (name: string, viewport: { width: number; height: number }, gif: boolean): ScenePart => ({
  name, viewport, gif, reducedMotion: true, drones: drones(28),
  async run(s) {
    await opening(s);
    await s.record(4);
    await select(s, 28);
    await s.record(6);
    await measured(s, 'drone selected at the bottom left of bb, its panel open');
  },
});

const orbit: ScenePart = {
  name: 'B 1920x1080', viewport: HD, drones: drones(78),
  async run(s) {
    await opening(s);
    // clicked at frame 0, as the debugger did: clear of where the panel will open
    await select(s, 78);
    await s.record(1);
    await measured(s, 'clicked, clear of the panel');
    // 12 s of loop time, a recorded frame every 100 ms; measured at 4 s and 8 s (fully under from 3.1 s before the fix) and at the end
    const marks = [120, 240, 360];
    while (marks.length) {
      await s.advance(1);
      await s.record(1);
      if (s.frame >= marks[0]!) await measured(s, `${Math.round(marks.shift()! / 30)} s after the click`);
    }
  },
};

export const dronePanel: Scene = {
  name: 'drone-panel',
  summary: 'A drone selected at the bottom left of its planet, where its own panel opens (#189): seed 28 held still at 1280x720 and 1920x1080, then seed 78 orbiting down into the panel for 12 s at 1920x1080',
  fixture: FIXTURE, roots: [], viewport: HD, gifScale: 2,
  report: ['drone px visible', 'drone px drawn', 'drone px drawn under #drone-panel'],
  parts: [covered('A 1280x720', { width: 1280, height: 720 }, false), covered('A 1920x1080', HD, true), orbit],
};
