import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, type CliDeps } from '../../factory/cli.js';
import { realExec } from '../../factory/exec.js';
import { JOB_LABEL, LABEL_DEFS, plistPath, renderPlist } from '../../factory/launchd.js';
import { BASE, ok, SLUG, World } from './world.js';

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

  it('runs the tick inside lockf, and --once is the same one-shot tick', async () => {
    const w = new World();
    const { d } = deps(w);
    w.inner = () => main(['--once'], { ...d, env: { ...d.env, COMMET_FACTORY_LOCKED: '1' } });
    expect(await main(['--once'], d)).toBe(0);
    expect(w.callsTo('lockf')).toHaveLength(1);
    expect(w.callsTo('gh').map((c) => c.args.slice(0, 2).join(' '))).toEqual(['issue list']);
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
  it('creates or updates the four labels with --force, so it is idempotent', async () => {
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
    expect(calls).toHaveLength(8);
    expect(calls.map((c) => c[2])).toEqual([...LABEL_DEFS, ...LABEL_DEFS].map((l) => l.name));
    for (const c of calls) expect(c).toEqual(expect.arrayContaining(['label', 'create', '--repo', SLUG, '--force']));
  });
});

describe('kill timers (R13)', () => {
  it('kills a hung command and everything in its process group', async () => {
    const exec = realExec(200);
    const t0 = Date.now();
    // Ignores SIGTERM like a stuck login prompt, and leaves a grandchild behind.
    const res = await exec('/bin/sh', ['-c', 'trap "" TERM; sleep 30 & echo $!; wait'], { timeoutMs: 300 });
    expect(res.timedOut).toBe(true);
    expect(res.code).toBeNull();
    expect(Date.now() - t0).toBeLessThan(5_000);
    const grandchild = Number(res.stdout.trim());
    expect(grandchild).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 100));
    expect(() => process.kill(grandchild, 0)).toThrow();
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
