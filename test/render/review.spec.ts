// #75 (R5): the live review panel in the built view (dist/web, global-setup.ts), against a real
// `startServer` on a temp repo. Not a render check: it drives the panel's keyboard and request
// ordering, which only a browser can (Vitest has no DOM). The server's own routes are covered in
// test/server/diff.test.ts. Each test gets its own repo and server, with hooks to delay or replace
// a route's answer.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { WEB_DIST, type ChartResult, type DiffQuery, type DiffResult } from '../../src/core/contract/api.js';
import type { BeaconAction, BeaconResult } from '../../src/core/contract/beacons.js';
import type { ChartAction, FogView } from '../../src/core/contract/fog.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { fovOf, project, projectedRadius, startPose } from '../../web/src/camera/pose.js';
import { CORONA } from '../../web/src/model/star.js';
import { systemModel } from '../../web/src/model/system.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { applyBeacon, readBeacons } from '../../src/state/beacons.js';
import { applyChart, readFog } from '../../src/state/chart.js';
import { readDiff, readUnseen } from '../../src/state/diff.js';
import { cli } from '../fixtures/cli.js';
import { realTempDir, removeTempDirs } from '../fixtures/tmp.js';

const WEB = join(import.meta.dirname, '../..', WEB_DIST);
const STAR = 'the star: root files and unmatched tests';

interface Hooks {
  fog?: () => Promise<FogView>;
  diff?: (q: DiffQuery, s: AbortSignal) => Promise<DiffResult>;
  chart?: (a: ChartAction) => Promise<ChartResult>;
  beacon?: (a: BeaconAction) => Promise<BeaconResult>;
}
interface Fixture { dir: string; server: CommetServer; hooks: Hooks; posted: BeaconAction[]; commit(at: string, change: () => void): void; scan(): Promise<void> }

const servers: CommetServer[] = [];
test.afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});
test.afterAll(() => removeTempDirs());

/** A repo with planets aa (two files) and bb (one), and a README on the star, all fogged; scanned and served. */
async function fixture(): Promise<Fixture> {
  const dir = realTempDir('commet-review-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (at: string, change: () => void) => {
    change();
    git('add', '-A');
    execFileSync('git', ['commit', '-q', '-m', at], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
  };
  // No session logs: every commit is unknown, so every file is fogged.
  const scan = async () => {
    expect((await cli(['scan', '--no-ingest', '--no-root'], dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') })).code).toBe(0);
  };
  commit('2026-10-10T09:00:00Z', () => {
    for (const [path, text] of [['aa/one.ts', 'one\n'], ['aa/two.ts', 'two\n'], ['bb/three.ts', 'three\n'], ['README.md', '# r\n']]) write(path!, text!);
  });
  await scan();
  const hooks: Hooks = {};
  const posted: BeaconAction[] = [];
  const server = await startServer({
    stateDir: join(dir, '.git', 'commet'), webRoot: WEB, port: 0, token: newToken(), pollMs: 100,
    fog: () => (hooks.fog ?? (() => readFog(dir)))(), unseen: (q) => readUnseen(dir, q),
    diff: (q, s) => (hooks.diff ?? ((x, y) => readDiff(dir, x, y)))(q, s),
    chart: (a) => (hooks.chart ?? ((x) => applyChart(dir, x)))(a),
    // #79: beacons through the real state module; `beacon` records every note the page sends.
    beacons: () => readBeacons(dir), beacon: (a) => { posted.push(a); return (hooks.beacon ?? ((x) => applyBeacon(dir, x)))(a); },
  });
  servers.push(server);
  return { dir, server, hooks, posted, commit, scan };
}

/** New layout.json bytes with the same layout: the server announces it and the view reloads layout and fog. */
const touchLayout = (f: Fixture) => appendFileSync(join(f.dir, '.git', 'commet', 'layout.json'), '\n');
const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A promise and the function that settles it. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = () => {};
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
}

const heading = (page: Page) => page.$eval('#panel h2 .sr', (h) => h.textContent);
const listed = (page: Page) => page.$$eval('#panel li button .sr', (xs) => xs.map((x) => (x.textContent ?? '').split(',')[0]));
const has = async (page: Page, key: string) => (await page.$(`#panel button[data-key="${key}"]`)) !== null;
const activeInPanel = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  return a?.closest('#panel') ? `${a.tagName}:${a.dataset['key'] ?? ''}` : `outside:${a?.id ?? a?.tagName ?? ''}`;
});

/** Opens the view, turns down the baseline offer (unless `keepOffer`), and focuses planet `name` with the bracket keys. */
async function open(page: Page, f: Fixture, name: string, keepOffer = false): Promise<void> {
  await page.goto(f.server.url);
  await page.waitForSelector('#panel:not([hidden]) li button');
  if (!keepOffer) await page.click('#panel button[data-key="dismiss"]');
  await page.focus('#view');
  for (let i = 0; i < 4 && (await heading(page)) !== name; i++) {
    await page.keyboard.press(']');
    await expect.poll(() => heading(page)).not.toBe(STAR);
  }
  await expect.poll(() => heading(page)).toBe(name);
  await page.waitForSelector('#panel li button');
}

const openFile = async (page: Page, path: string) => {
  await page.click(`#panel button[data-key="file:${fileIdOf(path)}"]`);
};

test.describe('#75 review panel', () => {
  test('a diff still loading for the old planet never opens under the new one (Qodo local r1 #2)', async ({ page }) => {
    const f = await fixture();
    const g = gate();
    f.hooks.diff = async (q, s) => { await g.wait; return readDiff(f.dir, q, s); };
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.focus('#view');
    await page.keyboard.press(']');
    await expect.poll(() => heading(page)).toBe('bb');
    g.open();
    await page.waitForTimeout(500);
    expect(await page.$('#panel pre.diff')).toBeNull();
    expect(await heading(page)).toBe('bb');
    expect(await listed(page)).toEqual(['bb/three.ts']);
  });

  test('Escape from the diff text keeps keyboard focus in the panel (Qodo local r1 #5)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel pre.diff');
    await page.focus('#panel pre.diff');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.$('#panel pre.diff')).toBeNull();
    expect(await activeInPanel(page)).toMatch(/^BUTTON:file:/);
  });

  test('after a chart the list comes from the server, so a file still unseen stays listed (Qodo local r1 #1)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    const fog = await readFog(f.dir);
    // The chart "succeeds" without charting aa/one.ts, and a newer fog (aa/two.ts charted for real,
    // which the server announces) lands before its answer, so the answer's own fog loses the ticket race.
    f.hooks.chart = async () => {
      await applyChart(f.dir, { kind: 'chart', fileId: fileIdOf('aa/two.ts'), at: fog.head });
      await later(1500);
      return { ok: true, fog };
    };
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel button[data-key="chart"]');
    await page.click('#panel button[data-key="chart"]');
    await expect.poll(() => listed(page), { timeout: 10_000 }).toEqual(['aa/one.ts']);
  });

  test('flying away from a focused planet returns the panel to the star (Qodo local r1 #4)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await page.focus('#view');
    await page.keyboard.down('KeyS');
    await expect.poll(() => heading(page), { timeout: 15_000 }).toBe(STAR);
    await page.keyboard.up('KeyS');
    expect(await listed(page)).toEqual(['README.md']);
  });

  test('a layout reload\'s older fog never replaces a newer chart answer (PR #108 r1 #1)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa', true);
    expect(await has(page, 'baseline')).toBe(true);
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel button[data-key="chart"]');
    // The reload's fog is read now (nothing charted yet) and held back until the chart's answer is in.
    const g = gate();
    let held = 0;
    f.hooks.fog = async () => {
      const fog = await readFog(f.dir);
      if (held++ === 0) await g.wait;
      return fog;
    };
    touchLayout(f);
    await expect.poll(() => held, { timeout: 10_000 }).toBe(1);
    await page.click('#panel button[data-key="chart"]');
    // A file is charted now, so there is chart state: no first-run offer.
    await expect.poll(() => has(page, 'baseline'), { timeout: 10_000 }).toBe(false);
    g.open();
    await page.waitForTimeout(1000);
    // Without the ticket, the older fog (no chart yet) would bring the offer back.
    expect(await has(page, 'baseline')).toBe(false);
  });

  test('a baseline whose answer loses the ticket race still shows as set (PR #108 r1 #2)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa', true);
    const before = await readFog(f.dir);
    // The page's read after the write's announcement is answered with the fog from before it, and
    // lands first. Counted from the end of the write: the server's watcher reads the fog once itself
    // (for the event's head) before it announces, so the page's read is the second.
    let after = -1;
    let served = 0;
    f.hooks.fog = async () => {
      if (after < 0 || ++after !== 2) return readFog(f.dir);
      served++;
      return before;
    };
    f.hooks.chart = async (a) => {
      const r = await applyChart(f.dir, a);
      after = 0;
      await expect.poll(() => served, { timeout: 10_000 }).toBe(1);
      await later(500);
      return r;
    };
    await page.click('#panel button[data-key="baseline"]');
    await expect.poll(() => has(page, 'undo'), { timeout: 10_000 }).toBe(true);
    expect(await has(page, 'baseline')).toBe(false);
  });

  test('charting, then opening another planet\'s diff, keeps the newer diff open (PR #108 r1 #5)', async ({ page }) => {
    const f = await fixture();
    f.hooks.chart = async (a) => { await later(1500); return applyChart(f.dir, a); };
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel button[data-key="chart"]');
    await page.click('#panel button[data-key="chart"]');
    await page.focus('#view');
    await page.keyboard.press(']');
    await expect.poll(() => heading(page)).toBe('bb');
    await openFile(page, 'bb/three.ts');
    await page.waitForSelector('#panel pre.diff');
    await page.waitForTimeout(2000);
    expect(await page.$eval('#panel h3 .sr', (h) => h.textContent)).toBe('bb/three.ts');
    expect(await page.$('#panel pre.diff')).not.toBeNull();
  });

  test('a diff still loading while the fog is unavailable never reopens when it returns (PR #108 r1 #6)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    const g = gate();
    f.hooks.diff = async (q, s) => { await g.wait; return readDiff(f.dir, q, s); };
    await openFile(page, 'aa/one.ts');
    // A new scan lands while the fog read fails: the view keeps no fog of the drawn layout (#64), so none is usable.
    f.hooks.fog = () => Promise.reject(new Error('fog down'));
    f.commit('2026-10-10T10:00:00Z', () => appendFileSync(join(f.dir, 'aa/one.ts'), '// next\n'));
    await f.scan();
    await expect.poll(() => page.$eval('#panel', (p) => p.textContent ?? ''), { timeout: 10_000 }).toContain("isn't available");
    g.open();
    await page.waitForTimeout(500);
    delete f.hooks.fog;
    touchLayout(f);
    await page.waitForSelector('#panel li button', { timeout: 10_000 });
    expect(await page.$('#panel pre.diff')).toBeNull();
  });

  test('a planet renamed under its id gets its new name in the panel (PR #108 r1 #9)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    f.commit('2026-10-10T10:00:00Z', () => execFileSync('git', ['mv', 'aa', 'cc'], { cwd: f.dir }));
    await f.scan();
    await expect.poll(() => heading(page), { timeout: 15_000 }).toBe('cc');
  });
});

test.describe('#79 captain\'s log', () => {
  const beaconsFile = (f: Fixture) => join(f.dir, '.git', 'commet', 'beacons.json');
  const status = (page: Page) => page.$eval('#status', (s) => s.textContent ?? '');
  const chartWith = async (page: Page, note: string) => {
    await page.waitForSelector('#panel input[data-key="note"]');
    await page.fill('#panel input[data-key="note"]', note);
    await page.click('#panel button[data-key="chart"]');
  };

  test('a note typed with the chart becomes a beacon, stored and shown as text, never as HTML', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    const note = '<img src=x onerror="window.__pwned=1">one is the <b>entry</b> point';
    await chartWith(page, `  ${note}  `);
    await expect.poll(() => f.posted.map((a) => a.text), { timeout: 10_000 }).toEqual([note]);
    const fog = await readFog(f.dir);
    expect(f.posted).toEqual([{ fileId: fileIdOf('aa/one.ts'), at: fog.head, text: note }]);
    expect(JSON.parse(readFileSync(beaconsFile(f), 'utf8'))).toEqual({ schemaVersion: 'beacons.1', beacons: [{ fileId: fileIdOf('aa/one.ts'), at: fog.head, text: note }] });
    // Said as text, in the status line and the canvas's text equivalent; nothing it holds became markup or ran.
    await expect.poll(() => status(page), { timeout: 10_000 }).toBe(`charted aa/one.ts and left a beacon: ${note}`);
    await expect.poll(() => page.$eval('#summary', (s) => s.textContent ?? ''), { timeout: 10_000 }).toContain(`beacon notes, newest first: ${note}`);
    expect(await page.$$eval('img, b, script:not([src])', (xs) => xs.length)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await listed(page)).toEqual(['aa/two.ts']);
  });

  test('charting with no note (or only spaces) leaves no beacon', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await chartWith(page, '   ');
    await expect.poll(() => listed(page), { timeout: 10_000 }).toEqual(['aa/two.ts']);
    expect(f.posted).toEqual([]);
    expect(existsSync(beaconsFile(f))).toBe(false);
  });

  test('a note the rule refuses stops the chart before anything is written, and keeps what was typed', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel input[data-key="note"]');
    // A text field drops newlines, but a pasted bidi override or a script can still put one in.
    await page.$eval('#panel input[data-key="note"]', (i) => { (i as HTMLInputElement).value = 'safe\u202etxt.exe'; });
    await page.click('#panel button[data-key="chart"]');
    await expect.poll(() => page.$eval('#panel', (p) => p.textContent ?? ''), { timeout: 10_000 }).toContain('Nothing was charted: the note must be one line of plain text, without control characters.');
    expect(await page.$eval('#panel input[data-key="note"]', (i) => (i as HTMLInputElement).value)).toBe('safe\u202etxt.exe');
    expect(await activeInPanel(page)).toBe('INPUT:note');
    expect(f.posted).toEqual([]);
    expect(existsSync(join(f.dir, '.git', 'commet', 'chart.json'))).toBe(false);
  });

  test('Enter in the note charts, and what was typed survives the panel redrawing under it', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel input[data-key="note"]');
    await page.focus('#panel input[data-key="note"]');
    await page.keyboard.type('half a no');
    // A smaller window halves the text scale, so the panel rebuilds every control (Panel.scale → render).
    const before = await page.$('#panel input[data-key="note"]');
    await page.setViewportSize({ width: 640, height: 360 });
    await expect.poll(() => page.$eval('#panel canvas', (c) => (c as HTMLCanvasElement).height), { timeout: 10_000 }).toBeLessThan(16);
    expect(await before!.evaluate((i) => i.isConnected)).toBe(true); // the same field, reattached
    expect(await activeInPanel(page)).toBe('INPUT:note');
    await page.keyboard.type('te');
    await page.keyboard.press('Enter');
    await expect.poll(() => f.posted.map((a) => a.text), { timeout: 10_000 }).toEqual(['half a note']);
  });

  test('an Enter that confirms an IME composition never charts; a plain Enter does (Qodo 5d3773a4)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel input[data-key="note"]');
    // What browsers send when Enter commits a composition: isComposing (Chrome, Firefox), or keyCode 229 (Safari, after compositionend).
    await page.$eval('#panel input[data-key="note"]', (i) => {
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
      const safari = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(safari, 'keyCode', { get: () => 229 });
      i.dispatchEvent(safari);
    });
    await page.waitForTimeout(1500);
    expect(existsSync(join(f.dir, '.git', 'commet', 'chart.json'))).toBe(false);
    expect(await page.$('#panel pre.diff')).not.toBeNull();
    await page.focus('#panel input[data-key="note"]');
    await page.keyboard.press('Enter');
    await expect.poll(() => listed(page), { timeout: 10_000 }).toEqual(['aa/two.ts']);
  });

  test('a beacon that fails after another diff was opened is said in the status line, not on that diff, and focus stays (Qodo 9a76b01a)', async ({ page }) => {
    const f = await fixture();
    const g = gate();
    f.hooks.beacon = async () => { await g.wait; return { ok: false, error: 'no such file at that head' }; };
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await chartWith(page, 'a note that will fail');
    await expect.poll(() => f.posted.length, { timeout: 10_000 }).toBe(1);
    // While the beacon's answer is out, the user opens the next file and starts typing its note.
    await page.waitForSelector(`#panel button[data-key="file:${fileIdOf('aa/two.ts')}"]`, { timeout: 10_000 });
    await openFile(page, 'aa/two.ts');
    await page.waitForSelector('#panel input[data-key="note"]');
    await page.focus('#panel input[data-key="note"]');
    g.open();
    await expect.poll(() => status(page), { timeout: 10_000 }).toContain('Charted, but the beacon was not left: no such file at that head.');
    await page.waitForTimeout(300);
    expect(await page.$eval('#panel', (p) => p.textContent ?? '')).not.toContain('beacon was not left');
    expect(await page.$eval('#panel h3 .sr', (h) => h.textContent)).toBe('aa/two.ts');
    expect(await activeInPanel(page)).toBe('INPUT:note');
  });

  test('a note of 120 emoji is sent whole from the panel, and 121 gets the rule\'s own message (Qodo 68bd470a)', async ({ page }) => {
    const f = await fixture();
    await open(page, f, 'aa');
    await openFile(page, 'aa/one.ts');
    await page.waitForSelector('#panel input[data-key="note"]');
    await page.focus('#panel input[data-key="note"]');
    const emoji = '\u{1F6F0}'.repeat(120); // 120 characters, 240 UTF-16 units
    await page.keyboard.type(emoji);
    expect(await page.$eval('#panel input[data-key="note"]', (i) => [...(i as HTMLInputElement).value].length)).toBe(120);
    await page.click('#panel button[data-key="chart"]');
    await expect.poll(() => f.posted.map((a) => a.text), { timeout: 10_000 }).toEqual([emoji]);
    await page.waitForSelector(`#panel button[data-key="file:${fileIdOf('aa/two.ts')}"]`, { timeout: 10_000 });
    await openFile(page, 'aa/two.ts');
    await page.waitForSelector('#panel input[data-key="note"]');
    await page.focus('#panel input[data-key="note"]');
    await page.keyboard.type(`${emoji}x`);
    await page.click('#panel button[data-key="chart"]');
    await expect.poll(() => page.$eval('#panel', (p) => p.textContent ?? ''), { timeout: 10_000 }).toContain('Nothing was charted: the note is longer than 120 characters.');
    expect(f.posted).toHaveLength(1);
  });

  test('in free flight the star\'s note is labelled over the star and read in the summary (Qodo 36a4f942)', async ({ page }) => {
    const f = await fixture();
    await page.goto(f.server.url);
    await page.waitForSelector('#panel:not([hidden]) li button');
    await page.click('#panel button[data-key="dismiss"]');
    await page.check('#motion'); // reduced motion holds the frame, so the label canvas changes only with the note
    await page.waitForTimeout(500);
    // The region just above the star's corona on the label canvas (device px; 1280x720 at x4, dpr 1).
    const model = systemModel(JSON.parse(readFileSync(join(f.dir, '.git', 'commet', 'layout.json'), 'utf8')) as LayoutV1);
    const pose = startPose(model);
    const at = project(pose, [0, 0, 0])!;
    const [sx, sy] = [((at.x + 1) / 2) * 1280, ((1 - at.y) / 2) * 720];
    const top = sy - projectedRadius(model.star.radius * CORONA.reach, at.depth, fovOf(pose)) * 360;
    const box = { x: Math.round(sx - 200), y: Math.max(0, Math.round(top - 140)), w: 400, h: Math.round(Math.min(140, top)) };
    const ink = () => page.$eval('#labels', (c, b) => {
      const d = (c as HTMLCanvasElement).getContext('2d')!.getImageData(b.x, b.y, b.w, b.h).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    }, box);
    const before = await ink();
    await applyBeacon(f.dir, { fileId: fileIdOf('README.md'), at: (await readFog(f.dir)).head, text: 'the readme explains the setup' });
    await expect.poll(() => page.$eval('#summary', (s) => s.textContent ?? ''), { timeout: 10_000 }).toContain('beacon notes, newest first: the readme explains the setup');
    await expect.poll(ink, { timeout: 5_000 }).toBeGreaterThan(before + 100);
  });
});
