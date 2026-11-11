// The agent's sandbox and the runner's own (Qodo PR #93 b274f225). Everything here works on
// files the test creates under a temp dir; no real credential file is ever touched.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { agentEnv, PASSED_ENV, readClaude } from '../../factory/agent.js';
import { realExec } from '../../factory/exec.js';
import {
  claudeSettings, deniedReads, pinnedGitEnv, PROBE, probeScript, probeVerdict, SANDBOX_EXEC, seatbelt, seatbeltProfile, STATE_MARK,
  type ProbeDirs, type SandboxPaths,
} from '../../factory/sandbox.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'sandbox-test-')));
  dirs.push(d);
  return d;
};

describe('the agent environment is an allowlist (S6)', () => {
  it('keeps only the login basics, drops every token, key and socket, and still clears the GitHub credentials', () => {
    const base = {
      PATH: '/usr/bin', HOME: '/h', USER: 'me', TMPDIR: '/t/', LANG: 'en_US.UTF-8', CLAUDE_CONFIG_DIR: '/h/.claude',
      AWS_SECRET_ACCESS_KEY: 's', AWS_SESSION_TOKEN: 's', ANTHROPIC_API_KEY: 's', SSH_AUTH_SOCK: '/s', GH_TOKEN: 'ghp_x',
      GITHUB_TOKEN: 'ghp_y', NPM_TOKEN: 'n', NODE_OPTIONS: '--require x', COMMET_FACTORY_LOCKED: '1',
    };
    const env = agentEnv(base, '/run/gh-empty');
    expect(env).toEqual({
      PATH: '/usr/bin', HOME: '/h', USER: 'me', TMPDIR: '/t/', LANG: 'en_US.UTF-8', CLAUDE_CONFIG_DIR: '/h/.claude', NO_COLOR: '1',
      GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
      GIT_CONFIG_KEY_1: 'remote.origin.pushurl', GIT_CONFIG_VALUE_1: 'agent-push-disabled://the-runner-pushes',
      GH_CONFIG_DIR: '/run/gh-empty', GH_TOKEN: '', GITHUB_TOKEN: '',
    });
    expect(PASSED_ENV.some((k) => /TOKEN|KEY|SECRET|SOCK|PASS/.test(k))).toBe(false);
  });
});

describe('what the sandbox denies (S1, S2, S3)', () => {
  const p: SandboxPaths = { home: '/h', stateDir: '/r/.git/factory', env: {} };

  it("denies the Midway, AWS, SSH, gh and Claude Code credential stores, and the runner's state for writes", () => {
    expect(deniedReads(p)).toEqual(expect.arrayContaining([
      { path: '/h/.midway', kind: 'dir' }, { path: '/h/.aws', kind: 'dir' }, { path: '/h/.ssh', kind: 'dir' }, { path: '/h/.config/gh', kind: 'dir' },
      { path: '/h/.claude/.credentials.json', kind: 'file' }, { path: '/h/.claude.json', kind: 'prefix' },
      // Qodo PR93 f9a2cd5a: other tokens a home dir holds.
      { path: '/h/.npmrc', kind: 'file' }, { path: '/h/.netrc', kind: 'file' }, { path: '/h/.git-credentials', kind: 'file' },
      { path: '/h/.config/git/credentials', kind: 'file' },
    ]));
    const s = claudeSettings(p, { worktree: '/r/.sandboxes/agent-1' }) as { sandbox: { filesystem: { denyRead: string[]; denyWrite: string[] } }; permissions: { deny: string[] } };
    expect(s.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(['/h/.midway', '/h/.claude.json*', '/h/.claude/.credentials.json']));
    // Qodo PR93 b301674c: the records that tell git where a worktree's config lives.
    expect(s.sandbox.filesystem.denyWrite).toEqual(['/r/.git/factory', '/r/.sandboxes/agent-1/.git',
      '/r/.git/worktrees/*/commondir', '/r/.git/worktrees/*/gitdir', '/r/.git/worktrees/*/config.worktree']);
    // `//` is an absolute path in a permission rule; a single `/` would anchor at the settings source.
    expect(s.permissions.deny).toEqual(expect.arrayContaining([
      'Read(//h/.midway)', 'Read(//h/.midway/**)', 'Read(//h/.claude.json*)', 'Read(//h/.claude/.credentials.json)', 'Edit(//r/.git/factory/**)',
      'Edit(//r/.sandboxes/agent-1/.git)',
    ]));
  });

  it('follows gh and Claude Code to the config dirs the environment names', () => {
    const paths = deniedReads({ ...p, env: { GH_CONFIG_DIR: '/g', XDG_CONFIG_HOME: '/x', CLAUDE_CONFIG_DIR: '/c' } }).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['/g', '/x/gh', '/h/.config/gh', '/c/.credentials.json', '/c/.claude.json', '/h/.claude.json']));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives the checks only localhost, and the install the registry but no repo code', () => {
    const check = seatbeltProfile(p, { worktree: '/r/.sandboxes/agent-1', mode: 'check' });
    expect(check).toContain('(deny network-outbound (require-not (remote ip "localhost:*")))');
    expect(check).toContain('(deny file-read* (subpath "/h/.midway") (subpath "/h/.aws") (subpath "/h/.ssh")');
    expect(check).toContain('(regex #"^/h/\\.claude\\.json")');
    expect(check).toContain('(deny file-write* (subpath "/r/.git/factory") (subpath "/r/.git/hooks") (literal "/r/.git/config")\n' +
      '  (literal "/r/.sandboxes/agent-1/.git") (regex #"^/r/\\.git/worktrees/[^/]+/(commondir|gitdir|config\\.worktree)$"))');
    expect(check).not.toContain('(subpath "/h/.npm")');
    const install = seatbeltProfile(p, { worktree: '/r/.sandboxes/agent-1', mode: 'install' });
    expect(install).not.toContain('network-outbound');
    expect(install).toContain('(subpath "/h/.npm")');
  });
});

describe('the self-test verdict (S4)', () => {
  function probeDirs(): ProbeDirs {
    const base = temp();
    const d = { work: join(base, 'work'), denied: join(base, 'denied'), stateDir: join(base, 'state'), visible: 'V-123', canary: 'C-456' };
    for (const x of [d.work, d.denied, d.stateDir]) mkdirSync(x);
    return d;
  }
  const write = (d: ProbeDirs, files: Record<string, string>) => {
    for (const [k, v] of Object.entries(files)) writeFileSync(join(d.work, `out-${k}`), v);
  };
  const good = {
    visible: 'V-123\n', canary: 'cat: x: Operation not permitted\n', write: 'touch: y: Operation not permitted\n',
    net: 'NET_EPERM\n', local: 'LOCAL_OK\n', done: 'done\n',
  };

  it('passes only a run that read its work dir and was refused the rest', () => {
    const d = probeDirs();
    write(d, good);
    expect(probeVerdict(d)).toEqual([]);
  });

  it.each([
    ['no run at all', {}, 'the probe did not run to the end'],
    ['a canary that was read', { canary: 'C-456\n' }, 'read the denied canary file'],
    ['a canary that was missing, not refused', { canary: 'cat: x: No such file or directory\n' }, 'the canary read was not refused by the sandbox'],
    ['an open internet', { net: 'NET_TIMEOUT\n' }, 'a connection to the internet was not refused'],
    ['no localhost', { local: 'LOCAL_EPERM\n' }, 'could not listen on and connect to 127.0.0.1'],
    ['an unreadable work dir', { visible: 'cat: visible.txt: Operation not permitted\n' }, 'could not read its own working directory'],
  ])('fails %s', (name, over, why) => {
    const d = probeDirs();
    if (name !== 'no run at all') write(d, { ...good, ...over });
    expect(probeVerdict(d)).toContain(why);
  });

  it("fails a write that reached the runner's state dir", () => {
    const d = probeDirs();
    write(d, { ...good, write: '' });
    writeFileSync(join(d.stateDir, STATE_MARK), '');
    expect(probeVerdict(d)).toEqual(["wrote into the runner's state dir"]);
  });

  it('names a sandbox that could not start in the agent call that failed', () => {
    const res = { code: 1, stdout: '', stderr: 'Error: sandbox required but unavailable', timedOut: false };
    expect(readClaude(res, { timeoutMs: 1, wallMs: 1 })).toEqual({ ok: false, reason: 'agent call failed (exit 1, no JSON result, the sandbox could not start)' });
  });
});

// The real thing on macOS: the runner's Seatbelt profile around the real probe. Skipped where
// sandbox-exec can't run, as on Linux CI or inside another sandbox (the agent's own checks).
const canSandbox = existsSync(SANDBOX_EXEC) && spawnSync(SANDBOX_EXEC, ['-p', '(version 1)(allow default)', '/usr/bin/true']).status === 0;

describe.skipIf(!canSandbox)('the runner sandbox, for real (S5)', () => {
  function setup() {
    const root = temp();
    const home = join(root, 'home');
    const stateDir = join(root, 'repo/.git/factory');
    const d: ProbeDirs = { work: join(root, 'repo/.sandboxes/agent-1'), denied: join(root, 'denied'), stateDir, visible: 'VISIBLE-TOKEN', canary: 'CANARY-TOKEN' };
    for (const x of [join(home, '.midway'), d.work, d.denied, stateDir]) mkdirSync(x, { recursive: true });
    writeFileSync(join(home, '.midway/cookie'), 'FAKE-COOKIE-TOKEN\n');
    writeFileSync(join(d.work, 'visible.txt'), 'VISIBLE-TOKEN\n');
    writeFileSync(join(d.denied, 'canary.txt'), 'CANARY-TOKEN\n');
    writeFileSync(join(d.work, PROBE), probeScript(join(d.denied, 'canary.txt'), stateDir));
    const paths: SandboxPaths = { home, stateDir, env: {} };
    const profile = seatbeltProfile(paths, { worktree: d.work, mode: 'check', extra: [{ path: d.denied, kind: 'dir' }] });
    return { d, home, profile };
  }
  const env = { PATH: process.env['PATH'] ?? '/usr/bin:/bin' };

  it('refuses the canary, a credential dir, the state dir and the internet, and keeps the work dir and localhost', async () => {
    const { d, home, profile } = setup();
    const res = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/sh', [PROBE]), { cwd: d.work, timeoutMs: 20_000, env });
    expect(res.code).toBe(0);
    expect(probeVerdict(d)).toEqual([]);
    const cookie = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/cat', [join(home, '.midway/cookie')]), { timeoutMs: 5_000, env });
    expect(cookie.stdout).toBe('');
    expect(cookie.stderr).toMatch(/Operation not permitted/);
  }, 30_000);

  it("refuses rewriting the worktree's .git file and any worktree's commondir, but lets git update the rest (Qodo PR93 b301674c)", async () => {
    const { d, profile } = setup();
    const common = join(d.stateDir, '..');
    for (const x of ['worktrees/agent-1', 'worktrees/other']) mkdirSync(join(common, x), { recursive: true });
    const targets = [join(d.work, '.git'), join(common, 'worktrees/other/commondir'), join(common, 'worktrees/agent-1/gitdir'), join(common, 'worktrees/agent-1/index')];
    const script = targets.map((t, i) => `echo x > '${t}' 2> err-${i} || true`).join('\n');
    const res = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/sh', ['-c', script]), { cwd: d.work, timeoutMs: 10_000, env });
    expect(res.code).toBe(0);
    expect(targets.map((t) => existsSync(t))).toEqual([false, false, false, true]);
  }, 30_000);

  it('the same probe unsandboxed fails the verdict, so a pass means something', async () => {
    const { d } = setup();
    await realExec()('/bin/sh', [PROBE], { cwd: d.work, timeoutMs: 20_000, env });
    expect(probeVerdict(d)).toEqual(expect.arrayContaining(['read the denied canary file', "wrote into the runner's state dir"]));
  }, 30_000);
});

// Real git, offline: the agent can rewrite its worktree's `.git` file and the shared `.git`'s
// worktree records, so the runner's unsandboxed git must not follow them (Qodo PR93 b301674c).
describe("the runner's git in the worktree runs nothing the agent planted (Qodo PR93 b301674c)", () => {
  const git = (cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', ...env } });
    if (r.status !== 0 && args[0] !== 'status') throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r;
  };
  function setup() {
    const root = temp();
    const main = join(root, 'main');
    mkdirSync(main);
    git(main, ['init', '-q', '-b', 'session/week1']);
    writeFileSync(join(main, 'a.txt'), 'a\n');
    git(main, ['add', 'a.txt']);
    git(main, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'a']);
    const worktree = join(main, '.sandboxes/agent-1');
    git(main, ['worktree', 'add', '-q', '-b', 'agent/1-x', worktree]);
    const gitDir = git(worktree, ['rev-parse', '--absolute-git-dir']).stdout.trim();
    const commonDir = join(main, '.git');
    // A repo the agent controls, whose config runs a command on every git status.
    const evil = join(root, 'evil');
    mkdirSync(evil);
    git(evil, ['init', '-q']);
    const pwned = join(root, 'pwned');
    writeFileSync(join(root, 'hook.sh'), `#!/bin/sh\ntouch '${pwned}'\nexit 1\n`, { mode: 0o755 });
    git(evil, ['config', 'core.fsmonitor', join(root, 'hook.sh')]);
    return { worktree, gitDir, commonDir, evilGitDir: join(evil, '.git'), pwned };
  }
  const status = ['status', '--porcelain', '--ignore-submodules=all'];

  it.each([
    ['the worktree .git file', (s: ReturnType<typeof setup>) => writeFileSync(join(s.worktree, '.git'), `gitdir: ${s.evilGitDir}\n`)],
    ['the worktree record commondir', (s: ReturnType<typeof setup>) => writeFileSync(join(s.gitDir, 'commondir'), `${s.evilGitDir}\n`)],
  ])('a rewritten %s runs the planted command for plain git, but not for the pinned git', (_, hijack) => {
    const s = setup();
    hijack(s);
    git(s.worktree, status);
    expect(existsSync(s.pwned), 'the vector is real').toBe(true);
    rmSync(s.pwned);
    git(s.worktree, status, pinnedGitEnv(s));
    expect(existsSync(s.pwned)).toBe(false);
  });
});
