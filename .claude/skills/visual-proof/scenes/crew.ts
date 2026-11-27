// Scene crew (#207): the crew's ship and the crew panel, over the crew fixture (test/fixtures/crew: an
// invented crew of six, you as the captain, two bot and agent authors left out; built by its own
// buildCrewRepo, so its authors, dates and .mailmap are the fixture's). Under reduced motion (the clock holds
// at 0): the start view, which frames the ship when a crew is drawn; the captain's porthole clicked, their
// panel open ("you, the captain", their files with a touch count each); Escape; a teammate's porthole
// clicked, their panel open. Where the portholes are comes from this checkout's own camera and ship code; a
// build that draws no ship opens no panel there, and the scene notes that instead of failing, so either
// side can be filmed with `vp.sh try`.
import { buildCrewRepo } from '../../../../test/fixtures/crew/repo.js';
import { startPose } from '../../../../web/src/camera/pose.js';
import { placeShip, portholes, shipCorners } from '../../../../web/src/crew/place.js';
import { buildShip } from '../../../../web/src/render/ship-spec.js';
import type { Scene, SceneContext } from '../scripts/scene.js';
import { onScreen, type Point } from './helpers.js';

/** The crew fixture's crew aboard: you and five teammates. */
const ABOARD = 6;

/** Seat `seat`'s porthole on screen, from the start pose that frames the ship (frame 0). */
function seatAt(s: SceneContext, seat: number): Point {
  const spec = buildShip(ABOARD);
  const hole = portholes(spec, placeShip(s.model, 0), 0)[seat];
  const at = hole ? onScreen(startPose(s.model, shipCorners(s.model, spec)), hole.centre, s.width, s.height) : null;
  if (!at) s.fail(`crew: seat ${seat}'s porthole is not in front of the start pose`);
  return at;
}

const panelText = (s: SceneContext) => s.page.$eval('#crew-panel', (e) => ((e as HTMLElement).hidden ? '' : e.textContent ?? '')).catch(() => '');

/** Clicks seat `seat` and waits up to a few seconds for its panel; notes what opened (nothing, on a build without the ship). */
async function clickSeat(s: SceneContext, seat: number, expect: string): Promise<void> {
  const at = seatAt(s, seat);
  await s.click(at.x, at.y);
  for (let i = 0; i < 20; i++) {
    const text = await panelText(s);
    if (text.includes(expect) && (text.includes('touched') || text.includes('rescan'))) { s.note(`seat ${seat} clicked at ${Math.round(at.x)},${Math.round(at.y)}: the crew panel opened (${expect})`); return; }
    await s.advance(1);
  }
  s.note(`seat ${seat} clicked at ${Math.round(at.x)},${Math.round(at.y)}: no crew panel opened (a build without the ship)`);
}

async function run(s: SceneContext): Promise<void> {
  await s.dismissOffer();
  await s.settle();
  await s.record(2);
  s.still('the start view');
  await clickSeat(s, 0, 'you, the captain');
  await s.record(2);
  s.still("the captain's porthole clicked");
  await s.press('Escape');
  await s.record(2);
  s.still('Escape');
  await clickSeat(s, 1, 'crew member');
  await s.record(2);
  s.still("a teammate's porthole clicked");
}

export const crew: Scene = {
  name: 'crew',
  summary: "The crew's ship over the crew fixture's six from the start view, then the captain's and a teammate's porthole clicked, each opening their own panel (#207), under reduced motion",
  repo: async (dest) => {
    const r = await buildCrewRepo(dest);
    return [`buildCrewRepo (test/fixtures/crew/repo.ts) in ${dest}: ${r.shas.length} commits by the invented crew, head ${r.head}`];
  },
  roots: [],
  reducedMotion: true,
  run,
};
