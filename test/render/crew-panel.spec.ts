// The crew panel in live mode (#207 C5): the built view (dist/web) served by the real server over the crew
// fixture repo (test/fixtures/crew: an invented crew of six, two bots), scanned with the CLI. From the start
// view, which frames the ship (human, 2026-11-25), clicking the captain's porthole opens the captain's own
// panel ("you, the captain"), with their name, when they were last active and the planets and files they
// touched, a touch count each and no total (Rule 6's astronaut-panel exception); Escape closes it; a
// teammate's porthole opens theirs. Reduced motion, so the view's clock holds at frame 0.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { WEB_DIST } from '../../src/core/contract/api.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { readFileSync } from 'node:fs';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { applyChart, readFog } from '../../src/state/chart.js';
import { readCrew, readCrewDetail } from '../../src/state/crew.js';
import { project, startPose } from '../../web/src/camera/pose.js';
import { placeShip, portholes, shipCorners } from '../../web/src/crew/place.js';
import { systemModel } from '../../web/src/model/system.js';
import { buildShip } from '../../web/src/render/ship-spec.js';
import { cli } from '../fixtures/cli.js';
import { buildCrewRepo } from '../fixtures/crew/repo.js';
import { realTempDir, removeTempDirs } from '../fixtures/tmp.js';

const WEB = join(import.meta.dirname, '../..', WEB_DIST);
const W = 1280, H = 720;
const servers: CommetServer[] = [];
test.afterEach(async () => { for (const s of servers.splice(0)) await s.close(); });
test.afterAll(() => removeTempDirs());

/** The crew fixture, scanned and served as `commet open` serves it (the crew routes included). */
async function serve(): Promise<{ server: CommetServer; layout: LayoutV1 }> {
  const { dir } = await buildCrewRepo(realTempDir('commet-crew-panel-'));
  expect((await cli(['scan', '--no-ingest', '--no-root'], dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') })).code).toBe(0);
  const server = await startServer({
    stateDir: join(dir, '.git', 'commet'), webRoot: WEB, port: 0, token: newToken(), pollMs: 100,
    fog: () => readFog(dir), chart: (a) => applyChart(dir, a),
    crew: () => readCrew(dir), crewDetail: (q) => readCrewDetail(dir, q),
  });
  servers.push(server);
  return { server, layout: JSON.parse(readFileSync(join(dir, '.git', 'commet', 'layout.json'), 'utf8')) as LayoutV1 };
}

/** Where seat `seat`'s porthole is in the window, from this checkout's own camera and ship code (frame 0, the start pose that frames the ship). */
function seatAt(layout: LayoutV1, aboard: number, seat: number): { x: number; y: number } {
  const model = systemModel(layout), spec = buildShip(aboard);
  const hole = portholes(spec, placeShip(model, 0), 0)[seat]!;
  const p = project(startPose(model, shipCorners(model, spec)), hole.centre)!;
  return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H };
}

const panelText = (page: Page) => page.$eval('#crew-panel', (e) => ((e as HTMLElement).hidden ? null : e.textContent));

test('from the start view, clicking a porthole opens that crew member\'s own panel; Escape closes it', async ({ page }) => {
  const { server, layout } = await serve();
  await page.setViewportSize({ width: W, height: H });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(server.url);
  await expect.poll(() => page.$eval('#crew-hud', (e) => e.textContent ?? ''), { timeout: 15_000 }).toBe('crew: 6 aboard, 2 bot or agent authors left out');

  // the captain: seat 0, the top porthole
  const top = seatAt(layout, 6, 0);
  expect(top.x).toBeGreaterThan(0); expect(top.x).toBeLessThan(W); expect(top.y).toBeGreaterThan(0); expect(top.y).toBeLessThan(H); // in the start view
  // not under the review panel, which opens over the top right of the start view
  const review = await page.$eval('#panel', (e) => { const r = e.getBoundingClientRect(); return (e as HTMLElement).hidden ? null : { x: r.left, y: r.top, w: r.width, h: r.height }; });
  if (review) expect(top.x < review.x || top.x > review.x + review.w || top.y < review.y || top.y > review.y + review.h).toBe(true);
  await page.mouse.click(top.x, top.y);
  await expect.poll(() => panelText(page), { timeout: 10_000 }).toContain('planets touched');
  const captain = (await panelText(page))!;
  expect(captain).toContain('you, the captain');
  expect(captain).toContain('Nova Reyes');
  expect(captain).toContain('captain: you');
  expect(captain).toMatch(/last active2026-10-\d\d \d\d:00:00 UTC/);
  expect(captain).toContain('README.md1 touch');
  expect(captain).not.toMatch(/total|in all|altogether/i); // no headline total
  await expect.poll(() => page.$eval('#status', (e) => e.textContent ?? '')).toBe('showing what you touched in the scan window');
  // the panel lists only this person's numbers; the canvas keeps the keyboard when it closes
  await page.keyboard.press('Escape');
  await expect.poll(() => panelText(page)).toBeNull();

  // a teammate: seat 1, the first teammate by person id (Bram Tiller, p_206cbb7a81b9)
  const mate = seatAt(layout, 6, 1);
  await page.mouse.click(mate.x, mate.y);
  await expect.poll(() => panelText(page), { timeout: 10_000 }).toContain('files touched');
  const bram = (await panelText(page))!;
  expect(bram).toContain('crew member');
  expect(bram).toContain('Bram Tiller');
  expect(bram).toContain('teammate');
  expect(bram).toContain('nav.ts2 touches');
  expect(bram).not.toContain('you, the captain');
  expect(errors).toEqual([]);
});
