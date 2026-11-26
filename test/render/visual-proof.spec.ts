// visual-proof (.claude/skills/visual-proof): its take loop end to end, in the built view (dist/web,
// global-setup.ts) against a real `startServer` on a temp repo, as review.spec.ts does. Two takes of a
// scene match pixel for pixel and one changed pixel stops the run (R2); a planted absolute path or
// token-like string in the scene's data stops it (R5); a scripted drone can be selected (R12).
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { WEB_DIST } from '../../src/core/contract/api.js';
import type { DroneView } from '../../src/core/contract/drones.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { applyBeacon, readBeacons } from '../../src/state/beacons.js';
import { applyChart, readDroneDetail, readFog } from '../../src/state/chart.js';
import { readCoChange } from '../../src/state/cochange.js';
import { readDiff, readUnseen } from '../../src/state/diff.js';
import { systemModel } from '../../web/src/model/system.js';
import { findDrone, homePose, scriptedDrone } from '../../.claude/skills/visual-proof/scenes/helpers.js';
import { checkTakes } from '../../.claude/skills/visual-proof/scripts/checks.js';
import { readPng } from '../../.claude/skills/visual-proof/scripts/png.js';
import { bundleOf } from '../../.claude/skills/visual-proof/scripts/prepare.js';
import { privacyHits, takeTexts } from '../../.claude/skills/visual-proof/scripts/privacy.js';
import { compareTakes, privacyStop, Stop, takesStop } from '../../.claude/skills/visual-proof/scripts/rules.js';
import type { Scene } from '../../.claude/skills/visual-proof/scripts/scene.js';
import { instrumentPage, runTake } from '../../.claude/skills/visual-proof/scripts/take.js';
import { context } from '../../playwright.config.js';
import { cli } from '../fixtures/cli.js';
import { realTempDir, removeTempDirs } from '../fixtures/tmp.js';
import { encodePng } from './png.js';

const WEB = join(import.meta.dirname, '../..', WEB_DIST);
const servers: CommetServer[] = [];
test.afterEach(async () => { for (const s of servers.splice(0)) await s.close(); });
test.afterAll(() => removeTempDirs());

/** A repo with planets aa and bb and files on the star, scanned with --no-ingest and served; `drones` through the hook. */
async function fixture(extra: Record<string, string> = {}, drones?: (l: LayoutV1) => DroneView, webRoot = WEB) {
  const dir = realTempDir('commet-vp-spec-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
  for (const [path, text] of Object.entries({ 'aa/one.ts': 'one\n', 'aa/two.ts': 'two\n', 'bb/three.ts': 'three\n', 'README.md': '# r\n', ...extra })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git('add', '-A');
  execFileSync('git', ['commit', '-q', '-m', 'one'], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-10T09:00:00Z', GIT_COMMITTER_DATE: '2026-10-10T09:00:00Z' } });
  expect((await cli(['scan', '--no-ingest', '--no-root'], dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') })).code).toBe(0);
  const layout = JSON.parse(readFileSync(join(dir, '.git', 'commet', 'layout.json'), 'utf8')) as LayoutV1;
  const view = drones?.(layout);
  const server = await startServer({
    stateDir: join(dir, '.git', 'commet'), webRoot, port: 0, token: newToken(), pollMs: 100,
    fog: () => readFog(dir), chart: (a) => applyChart(dir, a), unseen: (q) => readUnseen(dir, q), diff: (q, s) => readDiff(dir, q, s),
    beacons: () => readBeacons(dir), beacon: (a) => applyBeacon(dir, a),
    cochange: () => readCoChange(dir), // #211, as `commet open` serves it
    ...(view ? { drones: async () => view, droneDetail: (q) => readDroneDetail(dir, q) } : {}),
  });
  servers.push(server);
  return { dir, layout, server };
}

/** The start pose, three frames, one still. */
const still: Scene = { name: 'spec-still', summary: 'the start pose', async run(s) { await s.dismissOffer(); await s.record(3); s.still('end'); } };

async function take(browser: Browser, f: Awaited<ReturnType<typeof fixture>>, scene: Scene, name: string) {
  const out = join(realTempDir('commet-vp-take-'), name);
  const ctx = await browser.newContext({ ...context, reducedMotion: scene.reducedMotion ? 'reduce' : 'no-preference' });
  try {
    const page = await ctx.newPage();
    await instrumentPage(page);
    const log = await runTake(page, f.server.url, { scene, layout: f.layout, files: [], out, cli: () => '' });
    writeFileSync(join(out, 'log.json'), JSON.stringify(log));
    return { out, log };
  } finally {
    await ctx.close();
  }
}

test.describe('visual-proof takes', () => {
  test('two takes of a scene match pixel for pixel, and one changed pixel in a take stops the run (R2)', async ({ browser }) => {
    const f = await fixture();
    const a = await take(browser, f, still, 'a'), b = await take(browser, f, still, 'b');
    expect(a.log.frames.length).toBe(3);
    const first = readPng(readFileSync(join(a.out, 'raw', '0000.png')));
    expect([first.width, first.height]).toEqual([1280, 720]);
    const colours = new Set<number>();
    for (let q = 0; q < first.width * first.height; q += 97) colours.add((first.rgba[q * 4]! << 16) | (first.rgba[q * 4 + 1]! << 8) | first.rgba[q * 4 + 2]!);
    expect(colours.size, 'a real frame, not a blank one').toBeGreaterThan(4);
    const same = await compareTakes(a.out, b.out);
    expect(same).toEqual({ frames: 3, differing: [], logDiffers: [] });
    expect(takesStop('before', same)).toBeNull();
    // one pixel of take b's frame 1, changed
    const p = join(b.out, 'raw', '0001.png'), img = readPng(readFileSync(p));
    img.rgba[(100 * 1280 + 200) * 4] = 255 - img.rgba[(100 * 1280 + 200) * 4]!;
    writeFileSync(p, encodePng(img.width, img.height, img.rgba));
    const stop = takesStop('before', await compareTakes(a.out, b.out));
    expect(stop?.code).toBe('takes-differ');
    expect(stop?.message).toContain('frame 1: 1 px, x 200-200, y 100-100');
  });

  test("a static file changed after the bundle scan stops the run: the take hashes what it was served (Qodo 968ff513)", async ({ browser }) => {
    // The build's tree as the run scans it, then served by a server over that same tree
    const tree = realTempDir('commet-vp-tree-');
    cpSync(WEB, join(tree, 'dist', 'web'), { recursive: true });
    const scanned = new Map(bundleOf(tree).contents.map((c) => [c.path, c.sha256]));
    const f = await fixture({}, undefined, join(tree, 'dist', 'web'));
    const clean = await take(browser, f, still, 'clean');
    expect(clean.log.assets.map((a) => a.path), 'the page and its script, hashed').toEqual(expect.arrayContaining(['/', expect.stringMatching(/^\/assets\/index-[\w-]+\.js$/)]));
    expect((await checkTakes({ done: [{ name: 'clean', dir: clean.out, log: clean.log, scanned }], pairs: [], items: [], ctx: { literals: [] } })).stop).toBeNull();
    // A process the build left behind rewrites the page after the scan; the take serves the new bytes
    appendFileSync(join(tree, 'dist', 'web', 'index.html'), '<!-- notes: written after the scan -->\n');
    const swapped = await take(browser, f, still, 'swapped');
    const got = await checkTakes({ done: [{ name: 'swapped', dir: swapped.out, log: swapped.log, scanned }], pairs: [], items: [], ctx: { literals: [] } });
    expect((got.stop as Stop | null)?.code).toBe('privacy');
    expect(got.hits.map((h) => `${h.rule} @ ${h.where}: ${h.excerpt}`)).toEqual(['bytes the bundle scan never read @ take swapped static files: dist/web/index.html changed after the scan']);
  });

  test('a planted absolute path in a beacon note stops the run (R5)', async ({ browser }) => {
    const f = await fixture();
    await applyBeacon(f.dir, { fileId: fileIdOf('README.md'), at: f.layout.source.head, text: 'see /Users/someone/notes.txt for the plan' });
    const { log } = await take(browser, f, still, 'path');
    const hits = privacyHits(takeTexts('path', log), { literals: [] });
    expect(hits.map((h) => `${h.rule} @ ${h.where}`)).toContain('absolute path @ GET /api/beacons');
    expect(hits.every((h) => !h.excerpt.includes('someone'))).toBe(true);
    expect(privacyStop(hits)?.code).toBe('privacy');
  });

  test('a planted token-like file name on the star stops the run (R5)', async ({ browser }) => {
    const f = await fixture({ 'Qx3vL0t9mN2bYk7RfA1sWc8dHe5jUpZa.md': 'x\n' });
    const { log } = await take(browser, f, still, 'token');
    const hits = privacyHits(takeTexts('token', log), { literals: [] });
    expect(hits.some((h) => h.rule === 'token-like string' && h.where.startsWith('take token page text'))).toBe(true);
    expect(privacyStop(hits)?.code).toBe('privacy');
    // and the same scene without it is clean
    const clean = await take(browser, await fixture(), still, 'clean');
    expect(privacyHits(takeTexts('clean', clean.log), { literals: [] })).toEqual([]);
  });

  test('a page that reaches past the local server is blocked and stops the run (PR #199 c1aad869)', async ({ browser }) => {
    const f = await fixture();
    // A navigation away (the view's CSP already refuses a fetch to another origin, but not this); TEST-NET-1 is never routed
    const reach: Scene = { name: 'spec-reach', summary: 'reaches out', async run(s) {
      await s.dismissOffer();
      await s.page.evaluate(() => { location.href = 'http://192.0.2.1:9/leak'; });
      await s.settle();
      await s.record(1);
      s.still('end');
    } };
    const got = await take(browser, f, reach, 'reach').then(() => null, (e: unknown) => e);
    expect(got).toBeInstanceOf(Stop);
    expect((got as Stop).code).toBe('privacy');
    expect((got as Stop).message).toContain('http://192.0.2.1:9');
    expect((got as Stop).message).not.toContain('/leak');
  });

  test('a scene scripts a drone through the server hook and selects it: its panel opens (R12)', async ({ browser }) => {
    const pickOf = (l: LayoutV1) => {
      const model = systemModel(l);
      return findDrone(model, homePose(model), 0, 1280, 720, (d) => d.inFront && d.click.x > 100 && d.click.x < 1180 && d.click.y > 100 && d.click.y < 620)!;
    };
    const f = await fixture({}, (l) => scriptedDrone(l.source.head, pickOf(l)).view);
    const scene: Scene = {
      name: 'spec-drone', summary: 'a drone selected', reducedMotion: true,
      async run(s) {
        await s.dismissOffer();
        await s.waitFor('one drone', async () => (await s.page.$eval('#drones-hud', (e) => e.textContent ?? '')).includes('1 drone shown'));
        await s.record(1);
        // clicked where the build draws it, from the page's own pixels
        const at = await s.locateDrone();
        located.push(at.visible);
        await s.click(at.centre!.x, at.centre!.y);
        await s.waitFor('the drone panel', async () => (await s.page.$('#drone-panel:not([hidden])')) !== null);
        await s.record(2);
        s.still('selected');
        measured.push(await s.measureDrones());
      },
    };
    const located: number[] = [], measured: { drawn: number; visible: number; underPanel: number }[] = [];
    const { log } = await take(browser, f, scene, 'drone');
    expect(log.frames[0]!.boxes['#drone-panel']).toBeUndefined();
    expect(log.frames[2]!.boxes['#drone-panel']).toBeDefined();
    expect(typeof log.frames[2]!.probes['label px under #drone-panel']).toBe('number');
    // the drone is drawn and seen (a frame without one would measure 0), and its measures land in the still's probes
    expect(located[0]).toBeGreaterThan(100);
    expect(measured[0]!.drawn).toBeGreaterThan(100);
    expect(measured[0]!.visible).toBeLessThanOrEqual(measured[0]!.drawn);
    expect(log.frames[2]!.probes['drone px drawn']).toBe(measured[0]!.drawn);
    expect(log.frames[2]!.probes['drone px visible']).toBe(measured[0]!.visible);
    expect(log.served.find((r) => r.path === '/api/drones')?.body).toContain('"total":1');
  });

  test('measureFog counts the fog from the page\'s own pixels, per region, and leaves the take as it was (#201)', async ({ browser }) => {
    const measured: { total: number; regions: Record<string, { fog: number; px: number }> }[] = [];
    const scene: Scene = {
      name: 'spec-fog', summary: 'fog measured', reducedMotion: true,
      async run(s) {
        await s.page.waitForSelector('#panel:not([hidden]) button');
        await s.record(1);
        s.still('measured');
        measured.push(await s.measureFog((x) => (x < 640 ? 'left' : 'right')));
        await s.record(1);
      },
    };
    // every file is fogged (an unknown change, --no-ingest); after the baseline none is
    const fogged = await fixture();
    const a = await take(browser, fogged, scene, 'fogged');
    const seen = await fixture();
    expect((await applyChart(seen.dir, { kind: 'baseline', at: seen.layout.source.head })).ok).toBe(true);
    await take(browser, seen, scene, 'seen');
    const [storm, thin] = measured as [typeof measured[0], typeof measured[0]];
    // the regions cover the frame, so their fog adds up to all of it, and the probes say the same
    expect(storm.regions['left']!.px + storm.regions['right']!.px).toBe(1280 * 720);
    expect(storm.regions['left']!.fog + storm.regions['right']!.fog).toBe(storm.total);
    expect(storm.total, 'a fogged system draws its storm cloud (not vacuous)').toBeGreaterThan(500);
    expect(a.log.frames[0]!.probes['fog px']).toBe(storm.total);
    expect(a.log.frames[0]!.probes['fog px on left']).toBe(storm.regions['left']!.fog);
    expect(a.log.frames[0]!.probes['px of right']).toBe(storm.regions['right']!.px);
    // reviewed files draw thin mist at most (misted) or nothing (clear)
    expect(thin.total).toBeLessThan(storm.total / 2);
    // the measure drew the frame again with the fog off, and put everything back: the next frame is the same
    expect(readFileSync(join(a.out, 'raw', '0001.png')).equals(readFileSync(join(a.out, 'raw', '0000.png')))).toBe(true);
  });
});
