// The crew panel in live mode (#207 C5): the built view (dist/web) served by the real server over the crew
// fixture repo (test/fixtures/crew: an invented crew of six, two bots), scanned with the CLI. From the start
// view, which frames the ship (human, 2026-11-25), clicking the captain's porthole opens the captain's own
// panel ("you, the captain"), with their name, when they were last active and the planets and files they
// touched, a touch count each and no total (Rule 6's astronaut-panel exception); Escape closes it; a
// teammate's porthole opens theirs. Reduced motion, so the view's clock holds at frame 0.
import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { WEB_DIST } from '../../src/core/contract/api.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { readFileSync } from 'node:fs';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { applyChart, readFog } from '../../src/state/chart.js';
import { readCrew, readCrewDetail } from '../../src/state/crew.js';
import { project, startPose } from '../../web/src/camera/pose.js';
import { belowShip, placeShip, portholes, shipCorners } from '../../web/src/crew/place.js';
import { rasterText } from '../../web/src/labels/font.js';
import { fontScale, labelBox } from '../../web/src/labels/overlay.js';
import { systemModel } from '../../web/src/model/system.js';
import { buildShip, MAX_ABOARD } from '../../web/src/render/ship-spec.js';
import { UI_COLOURS } from '../../web/src/ui/colours.js';
import { cli } from '../fixtures/cli.js';
import { buildCrewRepo } from '../fixtures/crew/repo.js';
import { realTempDir, removeTempDirs } from '../fixtures/tmp.js';

const WEB = join(import.meta.dirname, '../..', WEB_DIST);
const W = 1280, H = 720;
const servers: CommetServer[] = [];
test.afterEach(async () => { for (const s of servers.splice(0)) await s.close(); });
test.afterAll(() => removeTempDirs());

const git = promisify(execFile);
/**
 * `n` more invented teammates on top of the crew fixture, one commit each (to ui/roster.ts, a file of the ui
 * planet), a day apart after its last commit: a crew too big for the ship.
 */
async function addTeammates(dir: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const who = { name: `Roster Mate ${String(i + 1).padStart(2, '0')}`, email: `mate${i + 1}@crew.test` };
    const date = `2026-10-${String(12 + i).padStart(2, '0')}T10:00:00Z`;
    appendFileSync(join(dir, 'ui', 'roster.ts'), `export const mate${i + 1} = ${i + 1};\n`);
    await git('git', ['add', 'ui/roster.ts'], { cwd: dir });
    await git('git', ['commit', '-q', '-m', `roster ${i + 1}`], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date },
    });
  }
}

/** The crew fixture (with `more` invented teammates), scanned and served as `commet open` serves it (the crew routes included). */
async function serve(more = 0): Promise<{ server: CommetServer; layout: LayoutV1 }> {
  const { dir } = await buildCrewRepo(realTempDir('commet-crew-panel-'));
  await addTeammates(dir, more);
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
  // docked like the drone panel (drones/dock.ts): in a corner of the window, clear of the porthole clicked
  const box = await page.$eval('#crew-panel', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  expect(box.x >= 0 && box.y >= 0 && box.x + box.w <= W && box.y + box.h <= H).toBe(true);
  expect(top.x < box.x || top.x > box.x + box.w || top.y < box.y || top.y > box.y + box.h).toBe(true);
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

test('a crew too big for the ship: 16 aboard on two decks, and a "+N" label under the ship on the label canvas (outside the pixel pass)', async ({ page }) => {
  const { server, layout } = await serve(14); // the fixture's 6 and 14 more: 20
  await page.setViewportSize({ width: W, height: H });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(server.url);
  await expect.poll(() => page.$eval('#crew-hud', (e) => e.textContent ?? ''), { timeout: 15_000 }).toBe('crew: 16 aboard, 4 more not seated (shown as +4), 2 bot or agent authors left out');
  // where this checkout's view puts the label: under the ship's box in the start view (1280x720 is x4, so 2 device px a font px)
  const model = systemModel(layout), spec = buildShip(MAX_ABOARD), px = fontScale(4);
  const at = belowShip(model, spec, 0, startPose(model, shipCorners(model, spec)), W, H)!;
  const text = '+4 crew', b = labelBox({ text, x: at.x, y: at.y + 2 * px, align: 'centre' }, px);
  const ink = rasterText(text).bits.reduce((n, bit) => n + bit, 0) * px * px;
  const inked = () => page.$eval('#labels', (c, a) => {
    const d = (c as HTMLCanvasElement).getContext('2d')!.getImageData(Math.round(a.b.x), Math.round(a.b.y), Math.round(a.b.w), Math.round(a.b.h)).data;
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(a.colour.slice(i, i + 2), 16));
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === bl && d[i + 3] === 255) n++;
    return n;
  }, { b, colour: UI_COLOURS.ink });
  await expect.poll(inked, { timeout: 10_000 }).toBe(ink); // exactly the label's glyphs, in the label ink
  expect(errors).toEqual([]);
});
