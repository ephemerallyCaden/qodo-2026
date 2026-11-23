// Scene panel-labels (#169): labels under the open panels, in this repo's own system under reduced
// motion, so only the scene's own events change the label canvas (the #169 tests' method: keep the
// canvas, act, count the label pixels that changed under each open panel).
// 1. `]` focuses src/core (the first planet), and a 48-character note is left on src/core/palette.ts
//    with `commet beacon`: centred on the planet mid-frame, it runs under the review panel on the right.
// 2. A scripted drone at the lower left of src/core is clicked: its label, drawn under the drone, lands
//    inside the drone panel that opens at the bottom left. (The start pose of this repo has no drone
//    that low: the focused planet fills the frame, so its drones reach the corner.)
import type { Scene, SceneContext, SceneData } from '../scripts/scene.js';
import { systemModel } from '../../../../web/src/model/system.js';
import { bracketPose, filesUnder, findDrone, scriptedDetail, scriptedDrone, type DronePick } from './helpers.js';
import { VIEW } from './view.js';

const PLANET = 'src/core';
const NOTE_FILE = 'src/core/palette.ts';
const NOTE = 'each label is drawn after the pixel pass, on top';

/** The first drone on PLANET whose label, centred under it, falls well inside where the drone panel opens (x 8-296, from y ~480). */
function lowLeft(data: SceneData): DronePick {
  const model = systemModel(data.layout);
  const index = model.planets.findIndex((p) => p.path === PLANET);
  if (index < 0) throw new Error(`panel-labels: the layout has no planet ${PLANET}`);
  const d = findDrone(model, bracketPose(model, index), 0, VIEW.width, VIEW.height, (p) => p.inFront && p.label !== null && p.label.x > 60 && p.label.x < 250 && p.label.y > 500 && p.label.y < 660, [PLANET]);
  if (!d) throw new Error(`panel-labels: no seed puts a drone low on the left of ${PLANET}`);
  return d;
}

const drones = (data: SceneData) => {
  const pick = lowLeft(data);
  const { session, view } = scriptedDrone(data.layout.source.head, pick);
  const files = filesUnder(data.files, PLANET, 3).map((path, i) => ({ path, edits: [3, 1, 2][i]! }));
  return { view, detail: () => scriptedDetail(session, data.layout.source.head, files) };
};

async function run(s: SceneContext): Promise<void> {
  const open = (sel: string) => async () => (await s.page.$(sel)) !== null;
  await s.dismissOffer();
  await s.waitFor('the drone HUD counts the scripted drone', async () => (await s.page.$eval('#drones-hud', (e) => e.textContent ?? '')).includes('1 drone shown'));
  await s.record(4);
  // Shot 1: the note
  await s.focusPlanet(PLANET);
  await s.record(6);
  await s.keepLabels();
  s.cli('beacon', '--', NOTE_FILE, NOTE);
  await s.waitFor('the view shows the new note', async () => (await s.page.$eval('#summary', (e) => e.textContent ?? '')).includes(NOTE));
  await s.record(12);
  s.still(`${PLANET} focused, a 48-character note on it`);
  // Shot 2: the drone
  const pick = lowLeft({ layout: s.layout, files: s.files });
  s.note(`drone: home ${PLANET}, seed ${pick.seed}, clicked at ${Math.round(pick.click.x)},${Math.round(pick.click.y)}; its label centred at ${Math.round(pick.label!.x)},${Math.round(pick.label!.y)}`);
  await s.keepLabels();
  await s.click(pick.click.x, pick.click.y);
  await s.waitFor('the click opened the drone panel with its files', open('#drone-panel:not([hidden]) li'));
  await s.record(12);
  s.still('a drone low on the left selected, its panel open');
}

export const panelLabels: Scene = {
  name: 'panel-labels',
  summary: "A focused planet's note and a selected drone's label, each with its panel open (#169), in this repo's own system under reduced motion",
  reducedMotion: true,
  drones,
  report: ['label px drawn under #panel since the keep', 'label px drawn under #drone-panel since the keep'],
  run,
};
