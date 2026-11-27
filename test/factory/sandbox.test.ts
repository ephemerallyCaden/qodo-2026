// The agent's sandbox and the runner's own (Qodo PR #93 b274f225). Everything here works on
// files the test creates under a temp dir; no real credential file is ever touched.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentEnv, PASSED_ENV, readClaude } from '../../factory/agent.js';
import { realExec } from '../../factory/exec.js';
import {
  claudeSettings, deniedReads, pinnedGitEnv, PROBE, probeScript, probeVerdict, SANDBOX_EXEC, seatbelt, seatbeltProfile, STATE_MARK, worktreeGit,
  type ProbeDirs, type SandboxPaths,
} from '../../factory/sandbox.js';
import { realTempDir } from '../fixtures/tmp.js';

const temp = () => realTempDir('sandbox-test-');

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

  it("denies the AWS, SSH, qodo, gh and Claude Code credential stores, and the runner's state for writes", () => {
    expect(deniedReads(p)).toEqual(expect.arrayContaining([
      { path: '/h/.aws', kind: 'dir' }, { path: '/h/.qodo', kind: 'dir' }, { path: '/h/.ssh', kind: 'dir' }, { path: '/h/.config/gh', kind: 'dir' },
      { path: '/h/.claude/.credentials.json', kind: 'file' }, { path: '/h/.claude.json', kind: 'prefix' },
      // Qodo PR93 f9a2cd5a: other tokens a home dir holds.
      { path: '/h/.npmrc', kind: 'file' }, { path: '/h/.netrc', kind: 'file' }, { path: '/h/.git-credentials', kind: 'file' },
      { path: '/h/.config/git/credentials', kind: 'file' },
    ]));
    const s = claudeSettings(p, { worktree: '/r/.sandboxes/agent-1' }) as { sandbox: { filesystem: { denyRead: string[]; denyWrite: string[] } }; permissions: { deny: string[] } };
    expect(s.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(['/h/.aws', '/h/.claude.json*', '/h/.claude/.credentials.json']));
    // Qodo PR93 b301674c: the records that tell git where a worktree's config lives.
    expect(s.sandbox.filesystem.denyWrite).toEqual(['/r/.git/factory', '/r/.sandboxes/agent-1/.git', '/r/.git/commondir', '/r/.git/config.worktree',
      '/r/.git/worktrees/*/commondir', '/r/.git/worktrees/*/gitdir', '/r/.git/worktrees/*/config.worktree',
      ...['refs/tags', 'refs/remotes', 'packed-refs', 'HEAD', 'index', 'ORIG_HEAD', 'FETCH_HEAD'].map((f) => `/r/.git/${f}`)]);
    // `//` is an absolute path in a permission rule; a single `/` would anchor at the settings source.
    expect(s.permissions.deny).toEqual(expect.arrayContaining([
      'Read(//h/.aws)', 'Read(//h/.aws/**)', 'Read(//h/.claude.json*)', 'Read(//h/.claude/.credentials.json)', 'Edit(//r/.git/factory/**)',
      'Edit(//r/.sandboxes/agent-1/.git)',
    ]));
  });

  it("denies the agent's Bash the shared .git's tags, remote refs, packed-refs and the main checkout's HEAD, index, ORIG_HEAD and FETCH_HEAD, never its own (Qodo PR239 56aaacc6)", () => {
    const root = temp();
    const common = join(root, 'repo/.git');
    mkdirSync(join(common, 'refs/heads/agent'), { recursive: true });
    // Spelt from the resolved .git, as Seatbelt matches them: here the common dir is reached through a symlink.
    symlinkSync(join(root, 'repo'), join(root, 'link'));
    const linked: SandboxPaths = { home: '/h', stateDir: join(root, 'link/.git/factory'), env: {} };
    const deny = (claudeSettings(linked, { worktree: join(root, 'repo/.sandboxes/agent-1') }) as { sandbox: { filesystem: { denyWrite: string[] } } })
      .sandbox.filesystem.denyWrite;
    const shared = ['refs/tags', 'refs/remotes', 'packed-refs', 'HEAD', 'index', 'ORIG_HEAD', 'FETCH_HEAD'].map((f) => join(common, f));
    expect(deny).toEqual(expect.arrayContaining(shared));
    const own = ['objects', 'objects/ab/cdef', 'worktrees/agent-1', 'worktrees/agent-1/HEAD', 'worktrees/agent-1/index', 'refs', 'refs/heads',
      'refs/heads/agent/1-x', 'refs/heads/agent/1-x.lock', 'logs/refs/heads/agent/1-x'].map((f) => join(common, f));
    for (const path of own) expect(deny.filter((d) => path === d || path.startsWith(`${d}/`)), path).toEqual([]);
  });

  it("denies reads of the runner's state, local config and run logs included (Qodo PR235 7bdf99b6)", () => {
    expect(deniedReads(p)).toContainEqual({ path: '/r/.git/factory', kind: 'dir' });
    const s = claudeSettings(p, { worktree: '/r/.sandboxes/agent-1' }) as { sandbox: { filesystem: { denyRead: string[] } }; permissions: { deny: string[] } };
    expect(s.sandbox.filesystem.denyRead).toContain('/r/.git/factory');
    expect(s.permissions.deny).toEqual(expect.arrayContaining(['Read(//r/.git/factory)', 'Read(//r/.git/factory/**)']));
    expect(seatbeltProfile(p, { worktree: '/r/.sandboxes/agent-1', mode: 'check' })).toMatch(/\(deny file-read\* [^\n]*\(subpath "\/r\/\.git\/factory"\)/);
  });

  it("adds the machine's local denies to both sandboxes, each path with everything under it", () => {
    const local: SandboxPaths = { ...p, denyReads: ['/opt/login', '/h/.config/login'] };
    expect(deniedReads(local)).toEqual(expect.arrayContaining([{ path: '/opt/login', kind: 'dir' }, { path: '/h/.config/login', kind: 'dir' }]));
    const s = claudeSettings(local, { worktree: '/r/.sandboxes/agent-1' }) as { sandbox: { filesystem: { denyRead: string[] } }; permissions: { deny: string[] } };
    expect(s.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(['/opt/login', '/h/.config/login']));
    expect(s.permissions.deny).toEqual(expect.arrayContaining(['Read(//opt/login)', 'Read(//opt/login/**)', 'Read(//h/.config/login/**)']));
    expect(seatbeltProfile(local, { worktree: '/r/.sandboxes/agent-1', mode: 'check' })).toContain('(subpath "/opt/login") (subpath "/h/.config/login")');
    expect(deniedReads(p).map((d) => d.path)).not.toContain('/opt/login');
  });

  it('denies the docker, kube, gcloud, azure and gnupg stores, and where the environment moves them (Qodo PR93 e947968f)', () => {
    const dirs = ['/h/.docker', '/h/.kube', '/h/.config/gcloud', '/h/.azure', '/h/.gnupg'];
    expect(deniedReads(p)).toEqual(expect.arrayContaining(dirs.map((path) => ({ path, kind: 'dir' }))));
    const s = claudeSettings(p, { worktree: '/r/.sandboxes/agent-1' }) as { sandbox: { filesystem: { denyRead: string[] } }; permissions: { deny: string[] } };
    expect(s.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(dirs));
    expect(s.permissions.deny).toEqual(expect.arrayContaining(dirs.flatMap((d) => [`Read(/${d})`, `Read(/${d}/**)`])));
    const check = seatbeltProfile(p, { worktree: '/r/.sandboxes/agent-1', mode: 'check' });
    for (const d of dirs) expect(check).toContain(`(subpath "${d}")`);
    const env = { DOCKER_CONFIG: '/d', CLOUDSDK_CONFIG: '/g', AZURE_CONFIG_DIR: '/a', GNUPGHOME: '/n', KUBECONFIG: '/k/one:relative:/k/two' };
    expect(deniedReads({ ...p, env })).toEqual(expect.arrayContaining([
      { path: '/d', kind: 'dir' }, { path: '/g', kind: 'dir' }, { path: '/a', kind: 'dir' }, { path: '/n', kind: 'dir' },
      { path: '/k/one', kind: 'file' }, { path: '/k/two', kind: 'file' },
    ]));
  });

  it('denies a relative store override where the runner itself would read it, never drops it (Qodo PR239 819ccbe2)', () => {
    const env = { DOCKER_CONFIG: 'rel/docker', CLOUDSDK_CONFIG: './gcloud', AZURE_CONFIG_DIR: '../azure', GNUPGHOME: 'gnupg', KUBECONFIG: 'rel/kube::/k/abs:' };
    const list = deniedReads({ ...p, env });
    expect(list).toEqual(expect.arrayContaining([
      { path: resolve('rel/docker'), kind: 'dir' }, { path: resolve('gcloud'), kind: 'dir' }, { path: resolve('../azure'), kind: 'dir' },
      { path: resolve('gnupg'), kind: 'dir' }, { path: resolve('rel/kube'), kind: 'file' }, { path: '/k/abs', kind: 'file' },
    ]));
    expect(list.every((d) => isAbsolute(d.path)), 'every deny is absolute, as Seatbelt needs').toBe(true);
    expect(list.map((d) => d.path)).not.toContain(resolve(''));
  });

  it('follows gh and Claude Code to the config dirs the environment names', () => {
    const paths = deniedReads({ ...p, env: { GH_CONFIG_DIR: '/g', XDG_CONFIG_HOME: '/x', CLAUDE_CONFIG_DIR: '/c' } }).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['/g', '/x/gh', '/h/.config/gh', '/c/.credentials.json', '/c/.claude.json', '/h/.claude.json']));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives the checks only localhost, and the install the registry but no repo code', () => {
    const check = seatbeltProfile(p, { worktree: '/r/.sandboxes/agent-1', mode: 'check' });
    expect(check).toContain('(deny network-outbound (require-not (remote ip "localhost:*")))');
    expect(check).toContain('(deny file-read* (subpath "/h/.aws") (subpath "/h/.ssh") (subpath "/h/.qodo") (subpath "/h/.config/gh")');
    expect(check).toContain('(regex #"^/h/\\.claude\\.json")');
    expect(check).toContain('(deny file-write* (subpath "/r/.git/factory") (subpath "/r/.git/hooks") (literal "/r/.git/config")\n' +
      '  (literal "/r/.sandboxes/agent-1/.git") (literal "/r/.git/commondir") (literal "/r/.git/config.worktree") (literal "/r/.git/worktrees")' +
      ' (regex #"^/r/\\.git/worktrees/[^/]+$") (regex #"^/r/\\.git/worktrees/[^/]+/(commondir|gitdir|config\\.worktree)$"))');
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
  function setup(gitDir?: string) {
    const root = temp();
    const home = join(root, 'home');
    const stateDir = join(root, 'repo/.git/factory');
    const d: ProbeDirs = { work: join(root, 'repo/.sandboxes/agent-1'), denied: join(root, 'denied'), stateDir, visible: 'VISIBLE-TOKEN', canary: 'CANARY-TOKEN' };
    for (const x of [join(home, '.aws'), d.work, d.denied, stateDir]) mkdirSync(x, { recursive: true });
    writeFileSync(join(home, '.aws/credentials'), 'FAKE-SECRET-TOKEN\n');
    writeFileSync(join(d.work, 'visible.txt'), 'VISIBLE-TOKEN\n');
    writeFileSync(join(d.denied, 'canary.txt'), 'CANARY-TOKEN\n');
    writeFileSync(join(d.work, PROBE), probeScript(join(d.denied, 'canary.txt'), stateDir));
    const paths: SandboxPaths = { home, stateDir, env: {} };
    const own = gitDir ? { gitDir: join(root, 'repo/.git', gitDir) } : {};
    const profile = seatbeltProfile(paths, { worktree: d.work, mode: 'check', ...own, extra: [{ path: d.denied, kind: 'dir' }] });
    return { d, home, profile };
  }
  const env = { PATH: process.env['PATH'] ?? '/usr/bin:/bin' };

  it('refuses the canary, a credential dir, the state dir and the internet, and keeps the work dir and localhost', async () => {
    const { d, home, profile } = setup();
    const res = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/sh', [PROBE]), { cwd: d.work, timeoutMs: 20_000, env });
    expect(res.code).toBe(0);
    expect(probeVerdict(d)).toEqual([]);
    const secret = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/cat', [join(home, '.aws/credentials')]), { timeoutMs: 5_000, env });
    expect(secret.stdout).toBe('');
    expect(secret.stderr).toMatch(/Operation not permitted/);
  }, 30_000);

  it("refuses rewriting the worktree's .git file and any worktree's commondir, but lets git update the rest (Qodo PR93 b301674c)", async () => {
    const { d, profile } = setup('worktrees/agent-1');
    const common = join(d.stateDir, '..');
    for (const x of ['worktrees/agent-1', 'worktrees/other']) mkdirSync(join(common, x), { recursive: true });
    const targets = [join(d.work, '.git'), join(common, 'worktrees/other/commondir'), join(common, 'worktrees/agent-1/gitdir'),
      join(common, 'commondir'), join(common, 'config.worktree'), join(common, 'worktrees/agent-1/index')];
    const script = [...targets.map((t, i) => `echo x > '${t}' 2> err-${i} || true`),
      // Qodo PR104 2372ddf8: nor can a worktree dir be moved aside and swapped for a symlink.
      `mv '${join(common, 'worktrees/other')}' '${join(common, 'worktrees/moved')}' 2> err-mv || true`].join('\n');
    const res = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/sh', ['-c', script]), { cwd: d.work, timeoutMs: 10_000, env });
    expect(res.code).toBe(0);
    expect(targets.map((t) => existsSync(t))).toEqual([false, false, false, false, false, true]);
    expect(existsSync(join(common, 'worktrees/other'))).toBe(true);
  }, 30_000);

  it("refuses reading the runner's local config and logs, and the self-test's write probe still reads as refused (Qodo PR235 7bdf99b6)", async () => {
    const { d, profile } = setup();
    writeFileSync(join(d.stateDir, 'local.json'), '{"agentCli": "/LOCAL-CONFIG-TOKEN"}\n');
    const res = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/cat', [join(d.stateDir, 'local.json')]), { timeoutMs: 5_000, env });
    expect(res.stdout).toBe('');
    expect(res.stderr).toMatch(/Operation not permitted/);
    const probe = await realExec()(SANDBOX_EXEC, seatbelt(profile, '/bin/sh', [PROBE]), { cwd: d.work, timeoutMs: 20_000, env });
    expect(probe.code).toBe(0);
    expect(probeVerdict(d)).toEqual([]);
  }, 30_000);

  it("refuses a path the machine's local config lists, which is readable without it", async () => {
    const root = temp();
    const home = join(root, 'home');
    const stateDir = join(root, 'repo/.git/factory');
    const work = join(root, 'repo/.sandboxes/agent-1');
    const login = join(root, 'machine/login');
    for (const x of [home, stateDir, work, login]) mkdirSync(x, { recursive: true });
    writeFileSync(join(login, 'cookies'), 'LOCAL-LOGIN-TOKEN\n');
    const read = (paths: SandboxPaths) => realExec()(SANDBOX_EXEC, seatbelt(seatbeltProfile(paths, { worktree: work, mode: 'check' }), '/bin/cat', [join(login, 'cookies')]), { timeoutMs: 5_000, env });
    expect((await read({ home, stateDir, env: {} })).stdout, 'the generic list does not cover it').toContain('LOCAL-LOGIN-TOKEN');
    const denied = await read({ home, stateDir, env: {}, denyReads: [login] });
    expect(denied.stdout).toBe('');
    expect(denied.stderr).toMatch(/Operation not permitted/);
  }, 30_000);

  // Qodo PR93 b488a43f: install and test scripts run under this profile, and the shared .git holds
  // every branch. Real git, offline: only the run's own branch, its worktree dir and objects move.
  describe("under the shared .git, writes only the run's own branch, worktree dir and objects (Qodo PR93 b488a43f)", () => {
    const gitEnv = { PATH: process.env['PATH'] ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const git = (cwd: string, args: string[]) => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout.trim();
    };
    function repo() {
      const root = temp();
      const main = join(root, 'repo');
      mkdirSync(main);
      git(main, ['init', '-q', '-b', 'session/week1']);
      git(main, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'a']);
      git(main, ['branch', 'other']);
      git(main, ['tag', 'v1']);
      const worktree = join(main, '.sandboxes/agent-1');
      git(main, ['worktree', 'add', '-q', '-b', 'agent/1-x', worktree]);
      const common = join(main, '.git');
      const stateDir = join(common, 'factory');
      mkdirSync(stateDir);
      const gitDir = git(worktree, ['rev-parse', '--absolute-git-dir']);
      git(worktree, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'b']);
      const paths: SandboxPaths = { home: join(root, 'home'), stateDir, env: {} };
      return { root, main, worktree, common, gitDir, paths, base: git(main, ['rev-parse', 'session/week1']), tip: git(worktree, ['rev-parse', 'HEAD']) };
    }
    const run = (profile: string, cwd: string, cmd: string, args: string[]) =>
      realExec()(SANDBOX_EXEC, seatbelt(profile, cmd, args), { cwd, timeoutMs: 10_000, env: gitEnv });

    it.each(['check', 'install'] as const)('%s: another branch, a tag, a remote ref, packed-refs, the main HEAD and .git/commet are refused', async (mode) => {
      const s = repo();
      const profile = seatbeltProfile(s.paths, { worktree: s.worktree, mode, gitDir: s.gitDir, branch: 'agent/1-x' });
      const refused = [
        ['git', ['update-ref', 'refs/heads/other', s.tip]], ['git', ['update-ref', 'refs/heads/session/week1', s.tip]],
        ['git', ['update-ref', 'refs/heads/new', s.tip]], ['git', ['tag', '-f', 'v1', s.tip]], ['git', ['update-ref', 'refs/remotes/origin/session/week1', s.tip]],
        ['/bin/sh', ['-c', `echo x > '${join(s.common, 'packed-refs')}'`]], ['/bin/sh', ['-c', `echo 'ref: refs/heads/other' > '${join(s.common, 'HEAD')}'`]],
        ['/bin/sh', ['-c', `mkdir -p '${join(s.common, 'commet')}' && echo x > '${join(s.common, 'commet/x')}'`]],
      ] as const;
      for (const [cmd, args] of refused) {
        const res = await run(profile, s.worktree, cmd, [...args]);
        expect(res.code, `${cmd} ${args.join(' ')}`).not.toBe(0);
        expect(res.stderr, `${cmd} ${args.join(' ')}`).toMatch(/Operation not permitted|unable to create directory/);
      }
      expect(git(s.main, ['rev-parse', 'other', 'session/week1', 'v1'])).toBe([s.base, s.base, s.base].join('\n'));
      expect(git(s.main, ['symbolic-ref', 'HEAD'])).toBe('refs/heads/session/week1');
      expect(existsSync(join(s.common, 'commet'))).toBe(false);
    }, 30_000);

    it("the run's own branch, its reflog, its worktree dir and the object store still update", async () => {
      const s = repo();
      const profile = seatbeltProfile(s.paths, { worktree: s.worktree, mode: 'check', gitDir: s.gitDir, branch: 'agent/1-x' });
      const reflog = () => readFileSync(join(s.common, 'logs/refs/heads/agent/1-x'), 'utf8').trim().split('\n').length;
      const before = reflog();
      const commit = await run(profile, s.worktree, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'c']);
      expect(commit.code, commit.stderr).toBe(0);
      expect(git(s.worktree, ['log', '-1', '--format=%s'])).toBe('c');
      const moved = await run(profile, s.worktree, 'git', ['update-ref', 'refs/heads/agent/1-x', s.tip]);
      expect(moved.code, moved.stderr).toBe(0);
      expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(s.tip);
      expect(reflog()).toBe(before + 2);
      const own = await run(profile, s.worktree, '/bin/sh', ['-c', `echo x > '${join(s.gitDir, 'scratch')}'`]);
      expect(own.code, own.stderr).toBe(0);
    }, 30_000);

    it('fails closed when the worktree dir has been swapped for a symlink into the refs', async () => {
      const s = repo();
      renameSync(s.gitDir, `${s.gitDir}-moved`);
      symlinkSync(join(s.common, 'refs/heads'), s.gitDir);
      const profile = seatbeltProfile(s.paths, { worktree: s.worktree, mode: 'check', gitDir: s.gitDir, branch: 'agent/1-x' });
      const res = await run(profile, s.main, '/bin/sh', ['-c', `echo x > '${join(s.gitDir, 'other')}'`]);
      expect(res.stderr).toMatch(/Operation not permitted/);
      expect(git(s.main, ['rev-parse', 'other'])).toBe(s.base);
    }, 30_000);
  });

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

// Real git and real Seatbelt (Qodo PR104 2372ddf8): with extensions.worktreeConfig on, a worktree
// dir swapped for a symlink to one holding a planted config.worktree beats pinning alone. The
// runner's git in the worktree runs sandboxed, so the planted command runs contained.
describe.skipIf(!canSandbox)("the runner's git in a hijacked worktree runs contained (Qodo PR104 2372ddf8)", () => {
  const git = (cwd: string, args: string[]) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout;
  };
  it('a planted fsmonitor reads a credential and writes the state dir for unsandboxed git, but neither under worktreeGit', async () => {
    const root = temp();
    const home = join(root, 'home');
    mkdirSync(join(home, '.aws'), { recursive: true });
    writeFileSync(join(home, '.aws/credentials'), 'FAKE-SECRET-TOKEN\n');
    const main = join(root, 'main');
    mkdirSync(main);
    git(main, ['init', '-q', '-b', 'session/week1']);
    writeFileSync(join(main, 'a.txt'), 'a\n');
    git(main, ['add', 'a.txt']);
    git(main, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'a']);
    const worktree = join(main, '.sandboxes/agent-1');
    git(main, ['worktree', 'add', '-q', '-b', 'agent/1-x', worktree]);
    const gitDir = git(worktree, ['rev-parse', '--absolute-git-dir']).trim();
    const stateDir = join(main, '.git/factory');
    mkdirSync(stateDir);
    git(main, ['config', 'extensions.worktreeConfig', 'true']);
    // The swap: the real worktree dir moved aside, a symlink to a copy with a planted config in its place.
    const leak = join(root, 'leak');
    writeFileSync(join(root, 'hook.sh'), `#!/bin/sh\ncat '${join(home, '.aws/credentials')}' > '${leak}' 2>&1\ntouch '${join(stateDir, 'pwned')}'\nexit 1\n`, { mode: 0o755 });
    const evil = join(root, 'evil-gitdir');
    cpSync(gitDir, evil, { recursive: true });
    writeFileSync(join(evil, 'config.worktree'), `[core]\n\tfsmonitor = ${join(root, 'hook.sh')}\n`);
    renameSync(gitDir, `${gitDir}-moved`);
    symlinkSync(evil, gitDir);
    const status = ['status', '--porcelain', '--ignore-submodules=all'];
    const paths: SandboxPaths = { home, stateDir, env: {} };
    const base = { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: home, GIT_CONFIG_NOSYSTEM: '1' };

    // Pinning alone: the planted command runs with the runner's access.
    spawnSync('git', status, { cwd: worktree, env: { ...base, ...pinnedGitEnv({ gitDir, commonDir: join(main, '.git'), worktree }) } });
    expect(readFileSync(leak, 'utf8')).toContain('FAKE-SECRET-TOKEN');
    expect(existsSync(join(stateDir, 'pwned'))).toBe(true);
    rmSync(leak);
    rmSync(join(stateDir, 'pwned'));

    const g = worktreeGit(paths, { gitDir, worktree }, status, base);
    await realExec()(g.cmd, g.args, { cwd: worktree, timeoutMs: 20_000, env: g.env });
    expect(existsSync(leak) ? readFileSync(leak, 'utf8') : '').not.toContain('FAKE-SECRET-TOKEN');
    expect(existsSync(join(stateDir, 'pwned'))).toBe(false);
  }, 30_000);
});
