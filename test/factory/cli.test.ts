import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, RUN_CAP_MS, type CliDeps } from '../../factory/cli.js';
import { defaults } from '../../factory/config.js';
import { realExec } from '../../factory/exec.js';
import { JOB_LABEL, LABEL_DEFS, plistPath, renderPlist } from '../../factory/launchd.js';
import type { Ledger } from '../../factory/ledger.js';
import { ledgerFile } from '../../factory/repeats.js';
import { PROBE_TIMEOUT_MS, SELF_TEST_TIMEOUT_MS } from '../../factory/sandbox.js';
import { BASE, finding, ok, SLUG, World } from './world.js';
import { tempDir } from '../fixtures/tmp.js';

function deps(w: World, over: Partial<CliDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const d: CliDeps = {
    exec: w.exec, clock: w.clock, env: { PATH: '/usr/bin' }, cwd: w.repoDir, home: w.home, uid: 501, user: 'me',
    node: '/n/node', script: join(w.root, 'dist/bin.js'), print: (t) => out.push(t), printErr: (t) => err.push(t), ...over,
  };
  return { d, out, err };
}

describe('one run at a time (R1)', () => {
  it('a tick while the lock is held is busy and touches nothing', async () => {
    const w = new World();
    w.addIssue(24);
    w.lockBusy = true;
    const { d } = deps(w);
    expect(await main(['tick'], d)).toBe(0);
    const lock = w.callsTo('lockf')[0]!;
    expect(lock.args).toEqual(['-s', '-t', '0', join(w.commonDir, 'factory/lock'), '/n/node', d.script, 'tick']);
    expect(lock.env?.['COMMET_FACTORY_LOCKED']).toBe('1');
    expect(w.callsTo('gh')).toHaveLength(0);
    const ticks = w.readLog(join(w.commonDir, 'factory/ticks.jsonl'));
    expect(ticks.map((e) => e['event'])).toEqual(['busy']);
  });

  it('runs the tick inside lockf, and --once is the same one-shot tick, findings sweep included', async () => {
    const w = new World();
    const { d } = deps(w);
    w.inner = () => main(['--once'], { ...d, env: { ...d.env, COMMET_FACTORY_LOCKED: '1' } });
    expect(await main(['--once'], d)).toBe(0);
    expect(w.callsTo('lockf')).toHaveLength(1);
    // The ticket pick, then the findings sweep (repeat-findings R3) with nothing to read.
    expect(w.callsTo('gh').map((c) => c.args.slice(0, 2).join(' '))).toEqual(['issue list', 'pr list']);
    expect(w.callsTo('claude')).toHaveLength(0);
  });

  it('a tick sweeps findings after its ticket work; a dry-run tick does not (repeat-findings R3)', async () => {
    const w = new World();
    w.addOwnerPr(3, [finding('a1')]);
    const { d } = deps(w);
    expect(await main(['tick', '--dry-run'], d)).toBe(0);
    expect(w.callsTo('gh').some((c) => c.args[0] === 'pr')).toBe(false);
    w.inner = () => main(['tick'], { ...d, env: { ...d.env, COMMET_FACTORY_LOCKED: '1' } });
    expect(await main(['tick'], d)).toBe(0);
    expect(Object.keys((JSON.parse(readFileSync(ledgerFile(w.config()), 'utf8')) as Ledger).findings)).toEqual(['a1']);
  });

  it('runs a findings sweep inside the same lock, and reports busy when a tick holds it', async () => {
    const w = new World();
    const { d, out } = deps(w);
    w.inner = () => main(['sweep'], { ...d, env: { ...d.env, COMMET_FACTORY_LOCKED: '1' } });
    expect(await main(['sweep'], d)).toBe(0);
    expect(w.callsTo('lockf')[0]!.args.slice(4)).toEqual(['/n/node', d.script, 'sweep']);
    expect(w.callsTo('gh').map((c) => c.args.slice(0, 2).join(' '))).toEqual(['pr list']);
    expect(out.join('')).toContain('findings sweep: ok, seeding');
    w.lockBusy = true;
    expect(await main(['sweep'], d)).toBe(1);
  });

  it('a dry-run sweep takes no lock and writes nothing', async () => {
    const w = new World();
    const { d, out } = deps(w);
    expect(await main(['sweep', '--dry-run', '--max-calls', '0'], d)).toBe(0);
    expect(w.callsTo('lockf')).toHaveLength(0);
    expect(existsSync(join(w.commonDir, 'factory'))).toBe(false);
    expect(out.join('')).toContain('0 group(s) at the threshold');
  });

  it('keeps the sweep options to sweep, and --issue to tick', async () => {
    const w = new World();
    const { d, err } = deps(w);
    expect(await main(['tick', '--seed-through', '3'], d)).toBe(2);
    expect(await main(['tick', '--max-calls', '3'], d)).toBe(2);
    expect(await main(['sweep', '--dry-run', '--issue', '3'], d)).toBe(2);
    expect(await main(['sweep', '--seed-through', 'x'], d)).toBe(2);
    expect(err.join('')).toContain('--seed-through only works with sweep');
    expect(err.join('')).toContain('--issue only works with tick');
    expect(w.callsTo('lockf')).toHaveLength(0);
  });

  it('a dry run takes no lock', async () => {
    const w = new World();
    const { d } = deps(w);
    expect(await main(['tick', '--dry-run'], d)).toBe(0);
    expect(w.callsTo('lockf')).toHaveLength(0);
    expect(existsSync(join(w.commonDir, 'factory'))).toBe(false);
  });

  it('rejects bad usage and a non-session base', async () => {
    const w = new World();
    const { d, err } = deps(w);
    expect(await main([], d)).toBe(2);
    expect(await main(['tick', '--base', 'main'], d)).toBe(2);
    expect(err.join('')).toContain('session/<name>');
    expect(await main(['tick', '--issue', '3'], d)).toBe(2);
    expect(await main(['merge'], d)).toBe(2);
    expect(w.callsTo('lockf')).toHaveLength(0);
  });

  it.each(['session/.', 'session/foo.lock'])('a --base git refuses as a branch (%s) is a usage error before any setup (Qodo PR93 4c0331e1)', async (base) => {
    const w = new World();
    w.addIssue(24);
    w.lockBusy = true;
    const { d, err } = deps(w);
    expect(await main(['tick', '--base', base], d)).toBe(2);
    expect(err.join('')).toContain(`--base must be a session/<name> branch, not ${JSON.stringify(base)}`);
    expect(w.callsTo('lockf')).toHaveLength(0);
    expect(w.callsTo('gh')).toHaveLength(0);
    expect(w.gitCalls('fetch')).toHaveLength(0);
  });
});

describe('install and uninstall (R11)', () => {
  it('renders a LaunchAgent with the researched PATH, HOME and USER, calling the installed runner', () => {
    const w = new World();
    const plist = renderPlist({ cfg: w.config(), node: `${w.home}/.local/share/mise/installs/node/22/bin/node`, user: 'me', intervalSec: 300 });
    expect(plist).toContain(`<key>Label</key><string>${JOB_LABEL}</string>`);
    expect(plist).toContain(`<string>${join(w.commonDir, 'factory/bin/bin.js')}</string>`);
    expect(plist).toMatch(/<string>tick<\/string>\s*<string>--repo<\/string>/);
    expect(plist).toContain(`<string>${BASE}</string>`);
    expect(plist).toContain(`<string>${SLUG}</string>`);
    expect(plist).toContain(`<key>PATH</key><string>${w.home}/.toolbox/bin:${w.home}/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:${w.home}/.qodo/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>`);
    expect(plist).toContain(`<key>HOME</key><string>${w.home}</string>`);
    expect(plist).toContain('<key>USER</key><string>me</string>');
    expect(plist).toContain('<key>StartInterval</key><integer>300</integer>');
    expect(plist).toContain('<key>RunAtLoad</key><false/>');
    // The runner calls the stable claude symlink (Research).
    expect(w.config().claude).toBe(join(w.home, '.toolbox/bin/claude'));
  });

  it('install copies the runner, writes the plist and loads it; uninstall removes both', async () => {
    const w = new World();
    const dist = join(w.root, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'bin.js'), '// runner');
    writeFileSync(join(dist, 'cli.js'), '// cli');
    const { d } = deps(w);
    expect(await main(['install', '--interval', '120'], d)).toBe(0);
    const bin = join(w.commonDir, 'factory/bin');
    expect(readFileSync(join(bin, 'bin.js'), 'utf8')).toBe('// runner');
    expect(JSON.parse(readFileSync(join(bin, 'package.json'), 'utf8'))).toEqual({ type: 'module' });
    expect(readFileSync(plistPath(w.home), 'utf8')).toContain('<integer>120</integer>');
    expect(w.callsTo('launchctl').map((c) => c.args)).toEqual([
      ['bootout', `gui/501/${JOB_LABEL}`], ['bootstrap', 'gui/501', plistPath(w.home)],
    ]);
    expect(await main(['uninstall'], d)).toBe(0);
    expect(existsSync(plistPath(w.home))).toBe(false);
    expect(existsSync(bin)).toBe(false);
    expect(w.callsTo('launchctl').at(-1)!.args).toEqual(['bootout', `gui/501/${JOB_LABEL}`]);
  });

  it('a failed update keeps the installed runner (Qodo PR37 91496081)', async () => {
    const w = new World();
    const bin = join(w.commonDir, 'factory/bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'bin.js'), '// old runner');
    const { d, err } = deps(w, { script: join(w.root, 'missing-dist/bin.js') });
    expect(await main(['install'], d)).toBe(1);
    expect(readFileSync(join(bin, 'bin.js'), 'utf8')).toBe('// old runner');
    expect(err.join('')).toContain('npm run factory:build');
    expect(w.callsTo('launchctl')).toHaveLength(0);
  });

  it('install --dry-run only prints', async () => {
    const w = new World();
    const { d, out } = deps(w);
    expect(await main(['install', '--dry-run'], d)).toBe(0);
    expect(out.join('')).toContain('would run launchctl bootstrap');
    expect(existsSync(plistPath(w.home))).toBe(false);
    expect(w.callsTo('launchctl')).toHaveLength(0);
  });
});

describe('CLI output shows no absolute machine paths (Qodo PR37 5ffe421b)', () => {
  it('in a not-a-checkout error', async () => {
    const w = new World();
    const exec: CliDeps['exec'] = (cmd, args, opts) => (cmd === 'git' ? Promise.resolve({ code: 128, stdout: '', stderr: 'fatal', timedOut: false }) : w.exec(cmd, args, opts));
    const { d, err } = deps(w, { exec, cwd: join(w.home, 'somewhere') });
    expect(await main(['tick'], d)).toBe(2);
    expect(err.join('')).toContain('not inside a git checkout');
    expect(err.join('')).not.toContain(w.root);
  });

  it('in install, install --dry-run and uninstall', async () => {
    const w = new World();
    const dist = join(w.repoDir, 'factory/dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'bin.js'), '// runner');
    const { d, out } = deps(w, { script: join(dist, 'bin.js'), node: join(w.home, '.local/share/mise/installs/node/22/bin/node') });
    expect(await main(['install', '--dry-run'], d)).toBe(0);
    expect(await main(['install'], d)).toBe(0);
    expect(await main(['uninstall'], d)).toBe(0);
    const text = out.join('');
    expect(text).toContain('~/Library/LaunchAgents/dev.commet.agent-runner.plist');
    expect(text).toContain('./.git/factory');
    expect(text).not.toContain(w.root);
  });
});

describe('labels', () => {
  it('includes rule-proposal (repeat-findings R12)', () => {
    expect(LABEL_DEFS.map((l) => l.name)).toEqual(['ready-for-agent', 'agent-working', 'agent-needs-help', 'agent-done', 'rule-proposal']);
    for (const l of LABEL_DEFS) expect(l.description.length).toBeLessThanOrEqual(100);
  });

  it('creates or updates every label with --force, so it is idempotent', async () => {
    const w = new World();
    const calls: string[][] = [];
    const exec: CliDeps['exec'] = async (cmd, args, opts) => {
      if (cmd.endsWith('gh')) {
        calls.push([...args]);
        return ok();
      }
      return w.exec(cmd, args, opts);
    };
    const { d } = deps(w, { exec });
    expect(await main(['labels'], d)).toBe(0);
    expect(await main(['labels'], d)).toBe(0);
    expect(calls).toHaveLength(2 * LABEL_DEFS.length);
    expect(calls.map((c) => c[2])).toEqual([...LABEL_DEFS, ...LABEL_DEFS].map((l) => l.name));
    for (const c of calls) expect(c).toEqual(expect.arrayContaining(['label', 'create', '--repo', SLUG, '--force']));
  });
});

/** Polls `ok` until it holds: waits on a condition, not a fixed delay. */
async function until(ok: () => boolean, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('timers (R13)', () => {
  it('gives the implement call 90 min and a fix round 30 min, all inside the outer cap', () => {
    const c = defaults('/h', '/r', '/r/.git', 'o/r');
    expect(c.timeouts.agent).toBe(90 * 60_000);
    expect(c.timeouts.fix).toBe(30 * 60_000);
    // The longest a run can take: the sandbox self-test, npm ci and npm rebuild, the implement call,
    // a 4-check verify per agent call, every fix round and a review wait per push. The outer cap must sit above it.
    const verifies = 1 + c.maxFixRounds;
    const worst = PROBE_TIMEOUT_MS + SELF_TEST_TIMEOUT_MS + 2 * c.timeouts.npmCi + c.timeouts.agent + verifies * 4 * c.timeouts.check + c.maxFixRounds * c.timeouts.fix + verifies * c.reviewTimeoutMs;
    // Then the findings sweep: its budget, plus one judge call or qodo read started just before it ran out.
    const sweep = c.sweepBudgetMs + Math.max(c.timeouts.judge, c.timeouts.qodo, c.timeouts.gh);
    expect(worst + sweep).toBeLessThan(RUN_CAP_MS);
  });
});

describe('kill timers (R13)', () => {
  it('kills a hung command and everything in its process group', async () => {
    // The test fires the timers itself, once the grandchild exists, so nothing races the kill.
    const timers: (() => void)[] = [];
    const exec = realExec(5_000, (fn) => {
      timers.push(fn);
      return () => {};
    });
    const dir = tempDir('kill-');
    const pidFile = join(dir, 'pid');
    // Ignores SIGTERM like a stuck login prompt (the ignore is inherited), and leaves a grandchild behind.
    const run = exec('/bin/sh', ['-c', `trap "" TERM; sleep 30 & echo $! > "${pidFile}"; wait`], { timeoutMs: 60_000 });
    await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').endsWith('\n'), 'the grandchild pid');
    const grandchild = Number(readFileSync(pidFile, 'utf8').trim());
    expect(alive(grandchild)).toBe(true);
    expect(timers).toHaveLength(1);
    timers.shift()!(); // the kill timer: SIGTERM, then it schedules the SIGKILL grace timer
    expect(timers).toHaveLength(1);
    timers.shift()!(); // the grace timer: SIGKILL to the whole group
    const res = await run;
    expect(res).toMatchObject({ timedOut: true, code: null });
    await until(() => !alive(grandchild), 'the grandchild to die', 10_000);
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports a command that cannot start', async () => {
    const res = await realExec()('/nonexistent/claude', [], { timeoutMs: 1_000 });
    expect(res).toMatchObject({ code: null, timedOut: false, error: expect.stringContaining('ENOENT') });
  });

  it('returns output and the exit code of a normal command', async () => {
    expect(await realExec()('/bin/sh', ['-c', 'echo hi; echo err >&2; exit 3'], { timeoutMs: 5_000 }))
      .toEqual({ code: 3, stdout: 'hi\n', stderr: 'err\n', timedOut: false });
  });
});

describe('agent worktrees inside the checkout (Qodo PR37 26208d1d)', () => {
  it('are outside lint and git, so a run cannot break the main checkout', async () => {
    const root = join(import.meta.dirname, '../..');
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: root });
    expect(await eslint.isPathIgnored(join(root, '.sandboxes/agent-24/src/x.ts'))).toBe(true);
    expect(await eslint.isPathIgnored(join(root, 'factory/runner.ts'))).toBe(false);
    expect(readFileSync(join(root, '.gitignore'), 'utf8').split('\n')).toContain('.sandboxes/');
  });
});

describe('packaging (task AC7)', () => {
  it('the runner is not part of the published commet package', () => {
    const root = join(import.meta.dirname, '../..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[]; dependencies: Record<string, string> };
    expect(pkg.files).toEqual(['dist']);
    expect(Object.keys(pkg.dependencies)).toEqual(['@noble/hashes']);
    const build = JSON.parse(readFileSync(join(root, 'tsconfig.build.json'), 'utf8')) as { include: string[] };
    expect(build.include).toEqual(['src']);
    const factory = JSON.parse(readFileSync(join(root, 'factory/tsconfig.json'), 'utf8')) as { compilerOptions: { outDir: string } };
    expect(factory.compilerOptions.outDir).toBe('dist');
  });
});
