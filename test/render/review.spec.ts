// #75 (R5): the live review panel in the built view (dist/web, global-setup.ts), against a real
// `startServer` on a temp repo. Not a render check: it drives the panel's keyboard and request
// ordering, which only a browser can (Vitest has no DOM). The server's own routes are covered in
// test/server/diff.test.ts. Each test gets its own repo and server, with hooks to delay or replace
// a route's answer.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { WEB_DIST, type ChartResult, type DiffQuery, type DiffResult } from '../../src/core/contract/api.js';
import type { ChartAction, FogView } from '../../src/core/contract/fog.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
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
}
interface Fixture { dir: string; server: CommetServer; hooks: Hooks; commit(at: string, change: () => void): void; scan(): Promise<void> }

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
  const server = await startServer({
    stateDir: join(dir, '.git', 'commet'), webRoot: WEB, port: 0, token: newToken(), pollMs: 100,
    fog: () => (hooks.fog ?? (() => readFog(dir)))(), unseen: (q) => readUnseen(dir, q),
    diff: (q, s) => (hooks.diff ?? ((x, y) => readDiff(dir, x, y)))(q, s),
    chart: (a) => (hooks.chart ?? ((x) => applyChart(dir, x)))(a),
  });
  servers.push(server);
  return { dir, server, hooks, commit, scan };
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
    // The fog read fails during a reload: the view has no usable fog.
    f.hooks.fog = () => Promise.reject(new Error('fog down'));
    touchLayout(f);
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
