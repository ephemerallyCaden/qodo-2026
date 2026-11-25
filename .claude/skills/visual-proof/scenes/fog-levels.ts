// Scene fog-levels (#201): what counts as seen. The scene's own repo is one planet, aa, with three files,
// one per way a file can stand before anyone opens it:
// - aa/untouched.ts: its only commit is 31 months before HEAD, outside the scan's 24-month window;
// - aa/changed.ts: changed in the window, with no agent session read (--no-ingest), so the change is unknown;
// - aa/charted.ts: changed in the window like changed.ts, then charted (`commet chart`) in setup.
// The scan puts the three on grid cells 0-2, by the north pole, so their parcels meet there. Opening
// changed.ts (cell 0, the pole) in the directory view (#209) turns the planet's pole to the camera, and
// all three parcels show at once, with each row's fog level beside them and the planet's counts in its
// panel. Clear (a passed quiz) has no route or command yet, so no file is clear.
// - A (reduced motion, the clock held at 0): the row opened, the focus a cut; one still, its fog measured
//   per parcel from the page's own pixels (measureFog: the frame drawn with and without the fog), and the
//   build's own `commet chart status`, the view's summary of the canvas (the planet's counts and, from #201,
//   its mastery), the review panel's and the rows' words as notes.
// - B (motion): the start pose for a second, then the same row opened and the glide in, then three
//   seconds of the planet turning under the camera. The GIF.
import { fileIdOf } from '../../../../src/core/fog/index.js';
import { focusPose, startPose } from '../../../../web/src/camera/pose.js';
import { planetCentre, surfaceDirection } from '../../../../web/src/model/system.js';
import type { Scene, SceneContext, ScenePart } from '../scripts/scene.js';
import { parcelsOnScreen } from './parcels.js';

const PLANET = 'aa';
const FILES = { untouched: 'aa/untouched.ts', changed: 'aa/changed.ts', charted: 'aa/charted.ts' } as const;
const FIXTURE = {
  earlier: [{ at: '2024-03-01T09:00:00Z', files: { [FILES.untouched]: 'untouched\n', [FILES.changed]: 'changed\n', [FILES.charted]: 'charted\n' } }],
  files: { [FILES.changed]: 'changed\nin the window\n', [FILES.charted]: 'charted\nin the window\n' },
  at: '2026-10-10T09:00:00Z',
};
/** The row opened: its settlement is on the pole, where the three parcels meet. */
const OPENED = FILES.changed;
/** A parcel this small on screen (CSS px: 625 internal px) shows too little of its fog to measure. */
const MIN_PX = 10_000;

const byId = new Map<string, string>(Object.values(FILES).map((path) => [fileIdOf(path), path]));

/** The directory view's rows, by name, with where each is on screen. */
const rows = (s: SceneContext) => s.page.$$eval('#tree [role=treeitem]', (els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return { name: e.querySelector('.name')?.textContent ?? '', label: e.getAttribute('aria-label') ?? '', selected: e.getAttribute('aria-selected') === 'true', x: r.x + r.width / 2, y: r.y + r.height / 2 };
}));

/** Clicks the row named `name` where it is, then waits for `done`. */
async function clickRow(s: SceneContext, name: string, what: string, done: () => Promise<boolean>): Promise<void> {
  await s.waitFor(`the directory view lists ${name}`, async () => (await rows(s)).some((r) => r.name === name));
  const r = (await rows(s)).find((x) => x.name === name)!;
  await s.click(r.x, r.y);
  await s.waitFor(what, done);
}

/** The start panel, then the directory view open with aa's files listed. */
async function opening(s: SceneContext): Promise<void> {
  // charted.ts is charted, so the start panel offers no baseline: nothing to dismiss
  await s.waitFor('the start panel', async () => (await s.page.$('#panel:not([hidden])')) !== null);
}

/**
 * Opens the directory view, then `aa/` (which focuses it), then the row of OPENED (which turns its
 * settlement to the camera). The view's toggle is pressed from the keyboard: at 1280x720 the open panel
 * covers the lower part of it (from y 56), its centre included, so a click there lands on the panel.
 */
async function openRow(s: SceneContext, afterTree: () => Promise<void>): Promise<void> {
  await s.page.focus('#tree-toggle');
  await s.press('Enter');
  await s.waitFor('the directory view opened', async () => (await s.page.$('#tree:not([hidden])')) !== null);
  await afterTree();
  await clickRow(s, `${PLANET}/`, `the row ${PLANET}/ focused ${PLANET}`, async () => (await s.heading()) === PLANET);
  const file = OPENED.slice(PLANET.length + 1);
  await clickRow(s, file, `${OPENED}'s row opened`, async () => (await rows(s)).some((r) => r.name === file && r.selected) && (await s.heading()) === PLANET);
}

const held: ScenePart = {
  name: 'A', reducedMotion: true, gif: false,
  async run(s) {
    await opening(s);
    await s.record(2);
    await openRow(s, async () => {});
    await s.record(4);
    s.still(`${PLANET} opened at ${OPENED} from the directory view: ${Object.values(FILES).join(', ')}`);
    // the pose that open made, from this checkout's camera code (live.ts setFocus under reduced motion)
    const p = s.model.planets.find((x) => x.path === PLANET)!;
    const cell = p.surface.settlements.find((x) => x.fileId === fileIdOf(OPENED))?.cell ?? s.fail(`${OPENED} has no settlement on ${PLANET}`);
    const pose = focusPose(startPose(s.model), planetCentre(p, s.frame), p.radius, surfaceDirection(p, cell, s.frame));
    const parcel = parcelsOnScreen(s.model, pose, PLANET, s.frame, s.width, s.height);
    const got = await s.measureFog((x, y) => { const id = parcel(x, y); return id === null ? null : (byId.get(id) ?? id); });
    for (const path of Object.values(FILES)) {
      const r = got.regions[path] ?? { fog: 0, px: 0 };
      if (r.px < MIN_PX) s.fail(`${path}'s parcel shows ${r.px} px from the open pose, under ${MIN_PX}: too little to measure`);
      s.note(`${path}: fog px ${r.fog} of ${r.px} px of its parcel`);
    }
    const on = Object.values(got.regions).reduce((n, r) => n + r.fog, 0);
    s.note(`fog px ${got.total} in all, ${got.total - on} of them off the three parcels (the limb, the haze shell)`);
    s.note(`commet chart status: ${s.cli('chart', 'status').trimEnd().split('\n').join(' | ')}`);
    const text = (sel: string) => s.page.$eval(sel, (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    s.note(`what the canvas shows, as the view says it (#summary): ${await text('#summary')}`);
    s.note(`${PLANET}'s review panel: ${await text('#panel')}`);
    s.note(`the directory view's rows: ${(await rows(s)).map((r) => r.label).join(' | ')}`);
  },
};

const turning: ScenePart = {
  name: 'B',
  async run(s) {
    await opening(s);
    await s.record(20);
    s.still('the start pose, one second in');
    await openRow(s, () => s.record(4));
    await s.record(60);
    s.still(`${PLANET} opened at ${OPENED}, three seconds into the glide`);
  },
};

export const fogLevels: Scene = {
  name: 'fog-levels',
  summary: 'What counts as seen (#201): one planet with a file untouched in the window, one changed with no session, and one changed then charted, opened from the directory view so all three parcels show, their fog measured per parcel (reduced motion), then the glide in (motion)',
  fixture: FIXTURE, roots: [],
  setup: (s) => { s.cli('chart', '--', FILES.charted); },
  report: [...Object.values(FILES).flatMap((p) => [`fog px on ${p}`, `px of ${p}`]), 'fog px'],
  parts: [held, turning],
};
