// #95: `commet open` keeps the view live without git hooks. It watches HEAD and the branches
// (read-only) and runs one coalesced child `commet scan` per burst of ref changes, through the same
// lock and request as `commet hook refresh`. Git's config is isolated here (fixtures/hooks.ts: no
// system or global config), and one case sets a shared core.hooksPath like git-defender's.
import { createRequire } from 'node:module';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runOpen, type OpenControl } from '../../src/cli/open.js';
import { startRescans, type RescanCommand, type RescanResult } from '../../src/cli/rescan.js';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import { refreshKey } from '../../src/hooks/refresh.js';
import { watchRefs } from '../../src/server/refs.js';
import { tryLock } from '../../src/state/lock.js';
import { cli } from '../fixtures/cli.js';
import { git, GIT_ENV, hookRepo, mkdirp, tempDir, tree } from '../fixtures/hooks.js';
import { liveEvents, openStream, req, waitFor } from '../fixtures/http.js';

const env = { ...process.env, CLAUDE_CONFIG_DIR: join(tmpdir(), 'commet-no-claude') };
const URL_LINE = /^Commet is open at http:\/\/127\.0\.0\.1:(\d+)\/#t=([A-Za-z0-9_-]{43})$/m;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

let n = 0;
/** A commit at a fixed date, so the same steps give the same SHAs. */
const commit = (dir: string, file = 'src/a.ts', extra: NodeJS.ProcessEnv = {}) => {
  n++;
  mkdirp(join(dir, 'src'));
  writeFileSync(join(dir, file), `export const v = ${n};\n`);
  git(dir, ['add', '--', file]);
  git(dir, ['commit', '-q', '-m', `change ${n}`], { GIT_AUTHOR_DATE: '2026-10-02T09:00:00Z', GIT_COMMITTER_DATE: '2026-10-02T09:00:00Z', ...extra });
  return git(dir, ['rev-parse', 'HEAD']);
};

interface FakeRecord { what: 'start' | 'end' | 'publish-start' | 'publish-end' | 'sigterm'; pid: number; args: string[]; cwd: string; stdinTty: boolean; stdoutTty: boolean; gitConfig: string | null; t: number }

/**
 * A stand-in for `commet scan`: logs its start and end, sleeps $FAKE_DELAY_MS, writes $FAKE_STDERR and
 * exits with the code in $FAKE_EXIT_FILE (0 without one), so a test can change the next run's outcome.
 * With $FAKE_PUBLISH_DIR it first holds that dir's publish.lock for $FAKE_PUBLISH_MS, as a scan
 * publishing its pair does (the next slot, holding its pid, then marked released). With
 * $FAKE_TRAP_TERM it logs a SIGTERM, with its time, before it exits.
 */
function fakeScan() {
  const dir = tempDir('commet-rescan-cli-');
  const script = join(dir, 'fake-scan.cjs');
  const log = join(dir, 'calls.jsonl');
  const exitFile = join(dir, 'exit');
  writeFileSync(script, `const { appendFileSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const rec = (what) => appendFileSync(process.env.FAKE_LOG, JSON.stringify({ what, pid: process.pid, args: process.argv.slice(2), cwd: process.cwd(),
  stdinTty: Boolean(process.stdin.isTTY), stdoutTty: Boolean(process.stdout.isTTY), gitConfig: process.env.GIT_CONFIG_GLOBAL ?? null, t: Date.now() }) + '\\n');
rec('start');
if (process.env.FAKE_TRAP_TERM) process.on('SIGTERM', () => { rec('sigterm'); process.exit(143); });
const finish = () => setTimeout(() => {
  rec('end');
  let code = 0;
  try { code = Number(readFileSync(process.env.FAKE_EXIT_FILE, 'utf8')); } catch {}
  if (process.env.FAKE_STDERR) process.stderr.write(process.env.FAKE_STDERR);
  process.exitCode = code;
}, Number(process.env.FAKE_DELAY_MS || 0));
const pub = process.env.FAKE_PUBLISH_DIR;
if (pub) {
  const taken = readdirSync(pub).map((f) => /^publish\\.lock\\.(\\d+)$/.exec(f)).filter(Boolean).map((m) => Number(m[1]));
  const slot = join(pub, 'publish.lock.' + (Math.max(0, ...taken) + 1));
  writeFileSync(slot, String(process.pid), { flag: 'wx' });
  rec('publish-start');
  setTimeout(() => { rec('publish-end'); writeFileSync(slot, 'released'); finish(); }, Number(process.env.FAKE_PUBLISH_MS));
} else finish();
`);
  const records = (): FakeRecord[] => {
    try {
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as FakeRecord);
    } catch {
      return [];
    }
  };
  return {
    command: { node: process.execPath, argv: [script] } satisfies RescanCommand,
    env: (extra: NodeJS.ProcessEnv = {}) => ({ ...env, FAKE_LOG: log, FAKE_EXIT_FILE: exitFile, ...extra }),
    exitNext: (code: number) => writeFileSync(exitFile, String(code)),
    starts: () => records().filter((r) => r.what === 'start'),
    records,
  };
}

/** Rescans of `dir`'s worktree with the fake scan, as `commet open` starts them, and everything they report. */
function rescansOf(dir: string, fake: ReturnType<typeof fakeScan>, extraEnv: NodeJS.ProcessEnv = {}) {
  const state = join(dir, '.git', 'commet');
  mkdirp(state);
  const key = refreshKey(dir, join(dir, '.git'));
  const reports: RescanResult[] = [];
  const r = startRescans({ cwd: dir, env: fake.env(extraEnv), stateDir: state, key, command: fake.command, settleMs: 40, maxWaitMs: 2000,
    report: (x) => reports.push(x) });
  return { ...r, reports, state, lock: join(state, `refresh-${key}.lock`), pending: join(state, `refresh-${key}.pending`) };
}

describe('watching refs (read-only)', () => {
  it('a commit, checkout, merge, rebase, packed refs, a fetch and a new worktree each count; staging, untracked files, state writes, a scan and another worktree\'s HEAD do not', async () => {
    const dir = hookRepo();
    const common = join(dir, '.git');
    let changes = 0;
    const w = await watchRefs(common, () => changes++, 50);
    try {
      const expectChange = async (what: string, step: () => void) => {
        const before = changes;
        step();
        await waitFor(() => changes > before, 10_000, what);
      };
      // Nothing that leaves HEAD and the branches alone is a change.
      writeFileSync(join(dir, 'untracked.txt'), 'x\n');
      writeFileSync(join(dir, 'README.md'), '# staged\n');
      git(dir, ['add', 'README.md']);
      git(dir, ['status', '--porcelain']);
      mkdirp(join(common, 'commet'));
      writeFileSync(join(common, 'commet', 'snapshot.json'), '{}');
      // A scan itself moves no ref, so a rescan can never set off another one.
      expect((await cli(['scan'], dir, env)).code).toBe(0);
      await sleep(400);
      expect(changes).toBe(0);

      await expectChange('commit', () => commit(dir));
      await expectChange('new branch checkout', () => git(dir, ['checkout', '-q', '-b', 'side']));
      await expectChange('commit on side', () => commit(dir, 'src/side.ts'));
      await expectChange('checkout', () => git(dir, ['checkout', '-q', 'main']));
      await expectChange('merge', () => git(dir, ['merge', '-q', '--no-ff', '-m', 'merge side', 'side']));
      git(dir, ['checkout', '-q', '-b', 'topic', 'main~1']);
      commit(dir, 'src/topic.ts');
      await expectChange('rebase', () => git(dir, ['rebase', '-q', 'main']));
      await expectChange('pack-refs', () => git(dir, ['pack-refs', '--all']));
      // A scan lists remote-tracking branches too, so a fetch that only moves one counts (Qodo PR #158 dae803ce).
      const remote = hookRepo();
      git(dir, ['remote', 'add', 'origin', remote]);
      await expectChange('first fetch', () => git(dir, ['fetch', '-q', 'origin']));
      commit(remote, 'src/remote.ts');
      await expectChange('fetch of a moved remote branch', () => git(dir, ['fetch', '-q', 'origin']));
      const wt = join(tempDir('commet-rescan-wt-'), 'wt');
      await expectChange('worktree add', () => git(dir, ['worktree', 'add', '-q', '-b', 'other', wt]));
      // Another worktree's HEAD moves no branch this one's scan shows (Qodo PR #158 7d21ad85).
      git(wt, ['checkout', '-q', '--detach']);
      await sleep(400);
      const quiet = changes;
      git(wt, ['checkout', '-q', 'other']);
      await sleep(400);
      expect(changes).toBe(quiet);
    } finally {
      w.close();
    }
  });

  it('a linked worktree\'s watcher counts its own HEAD, not the main worktree\'s (Qodo PR #158 7d21ad85)', async () => {
    const dir = hookRepo();
    const common = join(dir, '.git');
    const wt = join(tempDir('commet-rescan-wt-'), 'wt');
    git(dir, ['worktree', 'add', '-q', '-b', 'other', wt]);
    git(dir, ['branch', 'spare']);
    let changes = 0;
    const w = await watchRefs(common, () => changes++, 50, git(wt, ['rev-parse', '--path-format=absolute', '--git-dir']));
    try {
      git(dir, ['checkout', '-q', 'spare']);
      git(dir, ['checkout', '-q', '--detach']);
      await sleep(400);
      expect(changes).toBe(0);
      git(wt, ['checkout', '-q', '--detach']);
      await waitFor(() => changes > 0, 10_000, 'its own checkout');
    } finally {
      w.close();
    }
  });

  it('writes nothing to the repository: not to git config, the hooks, the refs or anything else', async () => {
    const dir = hookRepo();
    const before = tree(join(dir, '.git'));
    const w = await watchRefs(join(dir, '.git'), () => undefined, 20);
    await sleep(300);
    w.close();
    expect(tree(join(dir, '.git'))).toEqual(before);
  });
});

describe('coalesced rescans', () => {
  it('a burst of ref changes is one `scan`, run without a shell or a terminal in the served worktree, with its environment', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const r = rescansOf(dir, fake);
    try {
      for (let i = 0; i < 25; i++) r.request();
      await waitFor(() => fake.records().some((x) => x.what === 'end'), 10_000, 'the scan');
      await sleep(300);
      expect(fake.starts()).toHaveLength(1);
      expect(fake.starts()[0]).toMatchObject({ args: ['scan'], cwd: dir, stdinTty: false, stdoutTty: false, gitConfig: GIT_ENV.GIT_CONFIG_GLOBAL });
      expect(r.reports).toEqual([]);
    } finally {
      await r.close();
    }
  });

  it('changes during a scan fold into one more scan after it: never two at once, never one per change', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const r = rescansOf(dir, fake, { FAKE_DELAY_MS: '600' });
    try {
      r.request();
      await waitFor(() => fake.starts().length === 1, 10_000, 'the first scan');
      // Five separate bursts while it runs (each past the 40 ms settle time).
      for (let i = 0; i < 5; i++) {
        r.request();
        await sleep(80);
      }
      await waitFor(() => fake.records().filter((x) => x.what === 'end').length === 2, 15_000, 'the second scan');
      await sleep(400);
      const recs = fake.records();
      expect(recs.map((x) => x.what)).toEqual(['start', 'end', 'start', 'end']);
      expect(recs[2]!.t).toBeGreaterThanOrEqual(recs[1]!.t);
      expect(existsSync(r.pending)).toBe(false);
    } finally {
      await r.close();
    }
  });

  it('shares #77\'s refresh lock: while `commet hook refresh` holds it, a change only leaves the request for it', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const r = rescansOf(dir, fake);
    mkdirp(r.state);
    // This process standing in for a running `hook refresh` of the same worktree (same key).
    const release = tryLock(r.lock)!;
    try {
      r.request();
      await sleep(400);
      expect(fake.starts()).toEqual([]);
      expect(existsSync(r.pending)).toBe(true);
    } finally {
      release();
      await r.close();
    }
  });

  it('says a failed scan once per failure with the scan\'s own message, then the first success after it, and no other', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const r = rescansOf(dir, fake, { FAKE_STDERR: 'commet: state error: .git/commet/config.json is not valid\n' });
    try {
      fake.exitNext(5);
      r.request();
      await waitFor(() => r.reports.length === 1, 10_000, 'the failure');
      expect(r.reports).toEqual([{ ok: false, exitCode: 5, detail: 'commet: state error: .git/commet/config.json is not valid' }]);
      fake.exitNext(0);
      r.request();
      await waitFor(() => r.reports.length === 2, 10_000, 'the recovery');
      r.request();
      await waitFor(() => fake.records().filter((x) => x.what === 'end').length === 3, 10_000, 'the third scan');
      await sleep(200);
      expect(r.reports).toEqual([{ ok: false, exitCode: 5, detail: 'commet: state error: .git/commet/config.json is not valid' }, { ok: true }]);
    } finally {
      await r.close();
    }
  });

  it('a scan that can\'t start is exit 1, said by its error code only (no path)', async () => {
    const dir = hookRepo();
    const state = join(dir, '.git', 'commet');
    mkdirp(state);
    const missing = join(tempDir('commet-rescan-gone-'), 'no-such-node');
    const reports: RescanResult[] = [];
    const r = startRescans({ cwd: dir, env, stateDir: state, key: refreshKey(dir, join(dir, '.git')), command: { node: missing, argv: [] },
      settleMs: 10, maxWaitMs: 100, report: (x) => reports.push(x) });
    try {
      r.request();
      await waitFor(() => reports.length === 1, 10_000, 'the failure');
      expect(reports).toEqual([{ ok: false, exitCode: 1, detail: "the scan couldn't start (ENOENT)" }]);
    } finally {
      await r.close();
    }
  });

  it('close() kills the running scan (its own child), waits for it, starts no more and leaves a waiting request for the next refresh', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const r = rescansOf(dir, fake, { FAKE_DELAY_MS: '60000' });
    r.request();
    await waitFor(() => fake.starts().length === 1, 10_000, 'the scan');
    const pid = fake.starts()[0]!.pid;
    expect(alive(pid)).toBe(true);
    r.request();
    await sleep(150); // past the settle time: the request is waiting behind the running scan
    expect(existsSync(r.pending)).toBe(true);
    await r.close();
    expect(alive(pid)).toBe(false);
    r.request();
    await sleep(300);
    expect(fake.records().map((x) => x.what)).toEqual(['start']);
    expect(r.reports).toEqual([]);
    expect(existsSync(r.pending)).toBe(true);
    // The lock is free again for the next refresh.
    const again = tryLock(r.lock);
    expect(again).not.toBeNull();
    again!();
  });

  it('close() never signals the scan without holding publish.lock, however long another process holds it (Qodo PR #158 ac6cc7be)', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const state = join(dir, '.git', 'commet');
    const r = rescansOf(dir, fake, { FAKE_DELAY_MS: '60000', FAKE_TRAP_TERM: '1' });
    r.request();
    await waitFor(() => fake.starts().length === 1, 10_000, 'the scan');
    // Another scan publishing, held past the 5 s a scan itself waits for it: a child stopped without
    // the lock could be the one that takes it next, so close() waits for it, however long.
    const held = tryLock(join(state, 'publish.lock'))!;
    const closing = r.close();
    await sleep(7000);
    const freed = Date.now();
    held();
    await closing;
    const term = fake.records().filter((x) => x.what === 'sigterm');
    expect(term).toHaveLength(1);
    expect(term[0]!.t).toBeGreaterThanOrEqual(freed);
    expect(r.reports).toEqual([]);
  }, 30_000);

  it('close() waiting for publish.lock stops waiting when the scan ends by itself, and signals nothing', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const state = join(dir, '.git', 'commet');
    const r = rescansOf(dir, fake, { FAKE_DELAY_MS: '800', FAKE_TRAP_TERM: '1' });
    r.request();
    await waitFor(() => fake.starts().length === 1, 10_000, 'the scan');
    const held = tryLock(join(state, 'publish.lock'))!;
    try {
      const t0 = Date.now();
      await r.close();
      expect(Date.now() - t0).toBeLessThan(4000); // the scan's own 800 ms, not a wait for the lock
      expect(fake.records().map((x) => x.what)).toEqual(['start', 'end']);
      expect(r.reports).toEqual([]);
    } finally {
      held();
    }
  });

  it('close() never stops a scan halfway through publishing its pair: it waits for publish.lock first (Qodo local 992fb9c8)', async () => {
    const dir = hookRepo();
    const fake = fakeScan();
    const state = join(dir, '.git', 'commet');
    const r = rescansOf(dir, fake, { FAKE_PUBLISH_DIR: state, FAKE_PUBLISH_MS: '700', FAKE_DELAY_MS: '60000' });
    r.request();
    await waitFor(() => fake.records().some((x) => x.what === 'publish-start'), 10_000, 'the publish');
    const pid = fake.starts()[0]!.pid;
    await r.close();
    expect(fake.records().map((x) => x.what)).toEqual(['start', 'publish-start', 'publish-end']);
    expect(alive(pid)).toBe(false);
    expect(r.reports).toEqual([]);
    // The lock close() took to stop the child is free again.
    const again = tryLock(join(state, 'publish.lock'));
    expect(again).not.toBeNull();
    again!();
  });
});

/** Runs `commet open` in-process with rescans on, until `stop()`. */
async function launch(dir: string, ctl: OpenControl, launchEnv: NodeJS.ProcessEnv) {
  let out = '';
  let err = '';
  const ac = new AbortController();
  const web = tempDir('commet-rescan-web-');
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>commet view</title>');
  const done = runOpen(['--no-open'], { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd: dir, env: launchEnv },
    { signal: ac.signal, webRoot: web, pollMs: 100, settleMs: 100, ...ctl });
  let code: number | undefined;
  void done.then((c) => (code = c));
  await waitFor(() => URL_LINE.test(out) || code !== undefined, 20_000, 'the URL');
  const m = URL_LINE.exec(out);
  const port = Number(m?.[1]);
  const auth = { [TOKEN_HEADER]: m?.[2] ?? '' };
  const stream = openStream(port, API.events, auth);
  await waitFor(() => stream.text().includes(': commet live updates'), 10_000, 'the event stream');
  const events = () => liveEvents(stream.text()) as { type: string; head?: string; ok?: boolean; exitCode?: number }[];
  return { port, auth, out: () => out, err: () => err, events, stop: async () => (stream.close(), ac.abort(), done) };
}

/** The real CLI from source, through vite-node (vitest's own runner), so the rescans are real scans of this code. */
const VITE_NODE = join(createRequire(createRequire(import.meta.url).resolve('vitest/package.json')).resolve('vite-node/package.json'), '..', 'vite-node.mjs');
const REAL_SCAN: RescanCommand = { node: process.execPath, argv: [VITE_NODE, join(import.meta.dirname, '..', '..', 'src', 'cli.ts')] };

describe('commet open rescans on its own (#95)', () => {
  it('a commit, checkout, merge and rebase each reach the open view, under a shared core.hooksPath, with the saved roots and nothing written to git', async () => {
    const dir = hookRepo();
    commit(dir, 'src/a.ts');
    const first = git(dir, ['rev-parse', 'HEAD']);
    // git-defender's shape: a machine-wide core.hooksPath outside the repo, here through the (isolated) global config.
    const defender = tempDir('commet-rescan-defender-');
    mkdirp(join(defender, 'hooks'));
    writeFileSync(join(defender, 'hooks', 'post-commit'), '#!/bin/sh\necho ran >> "$(dirname "$0")/../ran.log"\n', { mode: 0o755 });
    const globalConfig = join(defender, 'gitconfig');
    writeFileSync(globalConfig, `[core]\n\thooksPath = ${join(defender, 'hooks')}\n`);
    const runEnv = { ...env, GIT_CONFIG_GLOBAL: globalConfig };
    // Roots saved by a scan at a terminal's say-so: the rescans must use them and never write config.json.
    expect((await cli(['scan', '--no-ingest', '--root', 'src'], dir, runEnv)).code).toBe(0);
    const configFile = join(dir, '.git', 'commet', 'config.json');
    const config = readFileSync(configFile);
    const configIno = lstatSync(configFile).ino;
    const gitConfigs = [readFileSync(join(dir, '.git', 'config')), readFileSync(globalConfig)];
    const hooksBefore = [tree(join(dir, '.git', 'hooks')), tree(join(defender, 'hooks'))];

    const s = await launch(dir, { rescan: REAL_SCAN }, runEnv);
    const reached = async (head: string, what: string) => {
      await waitFor(() => s.events().some((e) => e.type === 'snapshot' && e.head === head), 60_000, `the view to get ${what}`);
      const layout = JSON.parse((await req(s.port, { path: API.layout, headers: s.auth })).body) as { source: { head: string; roots: string[] } };
      expect(layout.source).toMatchObject({ head, roots: ['src'] });
    };
    try {
      expect(s.out()).toContain('Watching HEAD and branches');
      const main1 = commit(dir, 'src/b.ts', runEnv);
      await reached(main1, 'the commit');
      git(dir, ['checkout', '-q', '-b', 'side', first]);
      await reached(first, 'the checkout');
      commit(dir, 'src/side.ts', runEnv);
      git(dir, ['checkout', '-q', 'main']);
      git(dir, ['merge', '-q', '--no-ff', '-m', 'merge side', 'side'], runEnv);
      await reached(git(dir, ['rev-parse', 'HEAD']), 'the merge');
      git(dir, ['checkout', '-q', '-b', 'topic', first]);
      commit(dir, 'src/topic.ts', runEnv);
      git(dir, ['rebase', '-q', 'main'], runEnv);
      await reached(git(dir, ['rev-parse', 'HEAD']), 'the rebase');
      expect(s.err()).toBe('');
      expect(s.events().filter((e) => e.type === 'rescan')).toEqual([]);
    } finally {
      expect(await s.stop()).toBe(0);
    }
    // The shared hooksPath really was in force (git ran its hook), and nothing of git's was touched.
    expect(readFileSync(join(defender, 'ran.log'), 'utf8')).toContain('ran');
    expect([readFileSync(join(dir, '.git', 'config')), readFileSync(globalConfig)]).toEqual(gitConfigs);
    expect([tree(join(dir, '.git', 'hooks')), tree(join(defender, 'hooks'))]).toEqual(hooksBefore);
    expect(readFileSync(configFile)).toEqual(config);
    expect(lstatSync(configFile).ino).toBe(configIno);
  }, 240_000);

  it('a failed rescan is said on stderr and to the view, the server keeps serving, and the next good one says so', async () => {
    const dir = hookRepo();
    commit(dir, 'src/a.ts');
    expect((await cli(['scan', '--no-ingest', '--no-root'], dir, env)).code).toBe(0);
    const configFile = join(dir, '.git', 'commet', 'config.json');
    const saved = readFileSync(configFile);
    writeFileSync(configFile, '{ damaged');
    const s = await launch(dir, { rescan: REAL_SCAN }, env);
    try {
      commit(dir, 'src/b.ts');
      await waitFor(() => s.events().some((e) => e.type === 'rescan'), 60_000, 'the failed rescan');
      expect(s.events().filter((e) => e.type === 'rescan')).toEqual([{ type: 'rescan', ok: false, exitCode: 5 }]);
      expect(s.err()).toMatch(/^commet: the automatic rescan after a git change failed \(exit 5\); the view keeps the last scan:\n {2}commet: .*config\.json/);
      expect(s.err()).not.toContain(dir);
      expect((await req(s.port, { path: API.snapshot, headers: s.auth })).status).toBe(200);
      // A view that connects while rescans fail hears it too: it's the state, not only news.
      const late = openStream(s.port, API.events, s.auth);
      await waitFor(() => liveEvents(late.text()).length === 1, 10_000, 'the late view\'s event');
      expect(liveEvents(late.text())).toEqual([{ type: 'rescan', ok: false, exitCode: 5 }]);
      late.close();

      writeFileSync(configFile, saved);
      const head = commit(dir, 'src/c.ts');
      await waitFor(() => s.events().some((e) => e.type === 'snapshot' && e.head === head), 60_000, 'the good rescan');
      await waitFor(() => s.events().filter((e) => e.type === 'rescan').length === 2, 10_000, 'the recovery event');
      expect(s.events().filter((e) => e.type === 'rescan')[1]).toEqual({ type: 'rescan', ok: true, exitCode: 0 });
      expect(s.out()).toContain('commet: the automatic rescan works again');
      const after = openStream(s.port, API.events, s.auth);
      await waitFor(() => after.text().includes(': commet live updates'), 10_000, 'a view after the recovery');
      await sleep(100);
      expect(liveEvents(after.text())).toEqual([]);
      after.close();
    } finally {
      expect(await s.stop()).toBe(0);
    }
  }, 240_000);

  it('opens and rescans a repository whose path ends in a space (Qodo local 59080452)', async () => {
    const dir = join(tempDir('commet-rescan-space-'), 'repo ');
    mkdirp(dir);
    git(dir, ['init', '-q', '-b', 'main']);
    for (const [k, v] of [['user.name', 'Commet Test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false']]) git(dir, ['config', k!, v!]);
    commit(dir, 'src/a.ts');
    expect((await cli(['scan', '--no-ingest', '--no-root'], dir, env)).code).toBe(0);
    const fake = fakeScan();
    const s = await launch(dir, { rescan: fake.command }, fake.env());
    try {
      expect(s.err()).toBe('');
      commit(dir, 'src/b.ts');
      await waitFor(() => fake.records().some((x) => x.what === 'end'), 20_000, 'the rescan');
      expect(fake.starts()[0]!.cwd).toBe(dir);
    } finally {
      expect(await s.stop()).toBe(0);
    }
  });

  it('stopping `commet open` stops its running rescan, and a stopped rescan is no failure', async () => {
    const dir = hookRepo();
    commit(dir, 'src/a.ts');
    expect((await cli(['scan', '--no-ingest', '--no-root'], dir, env)).code).toBe(0);
    const fake = fakeScan();
    const s = await launch(dir, { rescan: fake.command }, fake.env({ FAKE_DELAY_MS: '60000' }));
    commit(dir, 'src/b.ts');
    await waitFor(() => fake.starts().length === 1, 20_000, 'the rescan');
    const pid = fake.starts()[0]!.pid;
    expect(await s.stop()).toBe(0);
    expect(alive(pid)).toBe(false);
    expect(fake.records().map((x) => x.what)).toEqual(['start']);
    expect(s.err()).toBe('');
  });
});
