// `commet hook install | remove | event | refresh` (R7, #77): consent, chaining, worktrees,
// core.hooksPath, the Claude Code settings merge, deduplicated events and coalesced refreshes.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { installText, removeText } from '../src/hooks/claude-settings.js';
import { placePath } from '../src/hooks/event.js';
import { applyInstall, HOOK_MARK, hookScript, planInstall } from '../src/hooks/git-hooks.js';
import { coalescedRefresh } from '../src/hooks/refresh.js';
import { EVENTS_FILE, readEvents } from '../src/state/events.js';
import { reap, withLock } from '../src/state/lock.js';
import { cli, scripted } from './fixtures/cli.js';
import { calls, fakeCli, git, GIT_ENV, hook, hookRepo, mkdirp, tempDir, tree } from './fixtures/hooks.js';


const SETTINGS = '.claude/settings.local.json';
const commit = (dir: string, env: NodeJS.ProcessEnv = {}) => {
  writeFileSync(join(dir, 'change.txt'), `${Math.random()}\n`);
  git(dir, ['add', 'change.txt']);
  const t0 = Date.now();
  git(dir, ['commit', '-q', '-m', 'change'], env);
  return Date.now() - t0;
};
/** Runs a hook file directly the way git does (relative $0, from the work tree), returning its exit code and stderr. */
const runHook = (dir: string, rel: string, env: NodeJS.ProcessEnv = {}) => {
  const r = spawnSync(rel, [], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr };
};

describe('consent', () => {
  it('shows exactly what it writes and where, asks, and writes nothing on no, end of input or without a terminal', async () => {
    const dir = hookRepo();
    const paths = fakeCli();
    const before = tree(dir);
    const noTty = await hook(['install'], dir, { paths });
    expect(noTty.code).toBe(7);
    expect(noTty.err).toContain('run `commet hook install --yes`');
    for (const answers of [['n'], [], ['maybe']]) {
      const ask = scripted(answers);
      const r = await hook(['install'], dir, { paths, ask });
      expect(r.code).toBe(7);
      expect(ask.asked).toEqual(['Install? [y/N] ']);
    }
    expect(tree(dir)).toEqual(before);
    // The plan names every file and shows the script and the settings entry, paths as placeholders.
    expect(noTty.out).toContain('<git-common-dir>/hooks/post-commit: new hook');
    expect(noTty.out).toContain('<git-common-dir>/hooks/post-merge: new hook');
    expect(noTty.out).toContain(`${SETTINGS} (this worktree): new file with one PostToolUse hook`);
    expect(noTty.out).toContain(`  | ${HOOK_MARK}`);
    expect(noTty.out).toContain("\"command\": \"'<node>' '<commet>' hook event # commet:hook-event\"");
    const yes = await hook(['install'], dir, { paths, ask: scripted(['y']) });
    expect(yes.code).toBe(0);
    expect(existsSync(join(dir, '.git/hooks/post-commit'))).toBe(true);
    for (const text of [noTty.out, noTty.err, yes.out, yes.err]) {
      for (const leak of [dir, paths.cli, paths.node, tmpdir(), homedir()]) expect(text.includes(leak), leak).toBe(false);
    }
    // The absolute paths are in the files themselves, so the hooks find the CLI.
    expect(readFileSync(join(dir, '.git/hooks/post-commit'), 'utf8')).toContain(paths.cli);
    expect(readFileSync(join(dir, SETTINGS), 'utf8')).toContain(paths.cli);
  });

  it('--yes installs without a terminal, still printing the plan', async () => {
    const dir = hookRepo();
    const r = await hook(['install', '--yes', '--git-only'], dir, { paths: fakeCli() });
    expect(r.code).toBe(0);
    expect(r.out).toContain('<git-common-dir>/hooks/post-commit: new hook');
    expect(r.out).toContain('installed; undo with `commet hook remove`');
    expect(existsSync(join(dir, SETTINGS))).toBe(false);
  });

  it('acts on the files as they are after the question: an edit made meanwhile is kept, a new hook stops it', async () => {
    const dir = hookRepo();
    mkdirp(join(dir, '.claude'));
    writeFileSync(join(dir, SETTINGS), '{\n  "model": "a"\n}\n');
    const paths = fakeCli();
    // Claude Code rewrites the settings while the question is open.
    const edited = await hook(['install', '--claude-only'], dir, { paths, ask: async () => {
      writeFileSync(join(dir, SETTINGS), '{\n  "model": "b",\n  "env": { "X": "1" }\n}\n');
      return 'y';
    } });
    expect(edited.code).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, SETTINGS), 'utf8'))).toMatchObject({ model: 'b', env: { X: '1' } });
    // Another tool adds a post-commit hook while the question is open: that's not the plan confirmed.
    const other = hookRepo();
    const r = await hook(['install', '--git-only'], other, { paths, ask: async () => {
      writeFileSync(join(other, '.git/hooks/post-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      return 'y';
    } });
    expect(r.code).toBe(5);
    expect(r.err).toContain('the hooks changed while you were asked; nothing was written');
    expect(readFileSync(join(other, '.git/hooks/post-commit'), 'utf8')).toBe('#!/bin/sh\nexit 0\n');
    expect(existsSync(join(other, '.git/hooks/post-commit.commet-chained'))).toBe(false);
    expect(existsSync(join(other, '.git/hooks/post-merge'))).toBe(false);
  });

  it('one install or remove at a time: another holding the lock means nothing is written', async () => {
    const dir = hookRepo();
    writeFileSync(join(dir, '.git/hooks/post-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(dir, '.git/commet-hook.lock'), String(process.pid));
    const before = tree(dir);
    const r = await hook(['install', '--yes'], dir, { paths: fakeCli() });
    expect(r.code).toBe(5);
    expect(r.err).toContain('another `commet hook install` or `remove` is running; nothing was written');
    expect(tree(dir)).toEqual(before);
    rmSync(join(dir, '.git/commet-hook.lock'));
    expect((await hook(['install', '--yes'], dir, { paths: fakeCli() })).code).toBe(0);
    expect(existsSync(join(dir, '.git/commet-hook.lock'))).toBe(false);
  });

  it('rejects unknown and contradictory flags', async () => {
    const dir = hookRepo();
    expect((await hook(['install', '--git-only', '--claude-only'], dir)).code).toBe(2);
    expect((await hook(['remove', '--yes'], dir)).code).toBe(2);
    expect((await hook(['nope'], dir)).code).toBe(2);
    expect((await hook(['install'], tempDir('commet-hooks-norepo-'))).code).toBe(4);
  });
});

describe('git hooks', () => {
  it('a commit runs the refresh in the background, never waiting for it, with the temp index unset', async () => {
    const dir = hookRepo();
    const paths = fakeCli();
    expect((await hook(['install', '--yes', '--git-only'], dir, { paths })).code).toBe(0);
    const ms = commit(dir, { FAKE_LOG: paths.log, FAKE_DELAY_MS: '3000' });
    expect(ms).toBeLessThan(2500);
    expect(await calls(paths.log, 0, 0)).toEqual([]);
    const [call] = await calls(paths.log);
    expect(call).toEqual({ args: ['hook', 'refresh'], cwd: dir, index: null });
  });

  it('chains an existing hook: it runs first, its exit code is kept, and remove restores its bytes and mode', async () => {
    const dir = hookRepo();
    const paths = fakeCli();
    const marker = join(dir, '.git', 'original-ran');
    const original = `#!/bin/sh\necho "args:$*" >> ${JSON.stringify(marker)}\nexit 3\n`;
    writeFileSync(join(dir, '.git/hooks/post-merge'), original, { mode: 0o750 });
    chmodSync(join(dir, '.git/hooks/post-merge'), 0o750);
    const before = tree(join(dir, '.git/hooks'));
    const r = await hook(['install', '--yes', '--git-only'], dir, { paths });
    expect(r.out).toContain('<git-common-dir>/hooks/post-merge: your hook moves to post-merge.commet-chained and still runs first');
    expect(readFileSync(join(dir, '.git/hooks/post-merge.commet-chained'), 'utf8')).toBe(original);
    const run = runHook(dir, '.git/hooks/post-merge', { FAKE_LOG: paths.log });
    expect(run.status).toBe(3);
    expect(readFileSync(marker, 'utf8')).toBe('args:\n');
    expect((await calls(paths.log))[0]!.args).toEqual(['hook', 'refresh']);
    // Through git too: a merge runs the chained hook with its argument.
    git(dir, ['checkout', '-q', '-b', 'side']);
    commit(dir);
    git(dir, ['checkout', '-q', 'main']);
    git(dir, ['merge', '-q', '--no-ff', '--no-edit', 'side'], { FAKE_LOG: paths.log });
    expect(readFileSync(marker, 'utf8')).toBe('args:\nargs:0\n');
    const removed = await hook(['remove', '--git-only'], dir);
    expect(removed.out).toContain('<git-common-dir>/hooks/post-merge: your hook is back as it was');
    expect(removed.out).toContain("<git-common-dir>/hooks/post-commit: Commet's hook removed");
    expect(tree(join(dir, '.git/hooks'))).toEqual(before);
    expect(statSync(join(dir, '.git/hooks/post-merge')).mode & 0o777).toBe(0o750);
  });

  it('a symlinked hook is chained by moving the link itself, and comes back as the same link', async () => {
    const dir = hookRepo();
    const target = join(dir, '.git', 'shared-hook');
    writeFileSync(target, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    symlinkSync(target, join(dir, '.git/hooks/post-commit'));
    const before = tree(join(dir, '.git'));
    expect((await hook(['install', '--yes', '--git-only'], dir, { paths: fakeCli() })).code).toBe(0);
    expect(lstatSync(join(dir, '.git/hooks/post-commit.commet-chained')).isSymbolicLink()).toBe(true);
    await hook(['remove'], dir);
    expect(tree(join(dir, '.git'))).toEqual(before);
  });

  it('installing twice changes nothing, and remove without install (or twice) is a no-op', async () => {
    const dir = hookRepo();
    const paths = fakeCli();
    const pristine = tree(dir);
    const none = await hook(['remove'], dir);
    expect(none).toEqual({ code: 0, out: 'no Commet hooks are installed; nothing to remove\n', err: '' });
    expect(tree(dir)).toEqual(pristine);
    expect((await hook(['install', '--yes'], dir, { paths })).code).toBe(0);
    const installed = tree(dir);
    const again = await hook(['install'], dir, { paths });
    expect(again).toEqual({ code: 0, out: 'commet hooks are already installed; nothing to change\n', err: '' });
    expect(tree(dir)).toEqual(installed);
    expect((await hook(['remove'], dir)).code).toBe(0);
    expect(tree(dir)).toEqual(pristine);
    expect((await hook(['remove'], dir)).out).toBe('no Commet hooks are installed; nothing to remove\n');
    expect(tree(dir)).toEqual(pristine);
  });

  it('a CLI that moved is updated in place, keeping the chained hook', async () => {
    const dir = hookRepo();
    writeFileSync(join(dir, '.git/hooks/post-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await hook(['install', '--yes', '--git-only'], dir, { paths: fakeCli() });
    const moved = fakeCli();
    const r = await hook(['install', '--yes', '--git-only'], dir, { paths: moved });
    expect(r.out).toContain("<git-common-dir>/hooks/post-commit: Commet's hook updated");
    expect(readFileSync(join(dir, '.git/hooks/post-commit'), 'utf8')).toContain(moved.cli);
    expect(readFileSync(join(dir, '.git/hooks/post-commit.commet-chained'), 'utf8')).toBe('#!/bin/sh\nexit 0\n');
  });

  it('refuses, writing nothing, when a chained copy is there but the hook is not Commet\'s', async () => {
    const dir = hookRepo();
    writeFileSync(join(dir, '.git/hooks/post-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(dir, '.git/hooks/post-commit.commet-chained'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const before = tree(dir);
    const r = await hook(['install', '--yes'], dir, { paths: fakeCli() });
    expect(r.code).toBe(2);
    expect(r.err).toContain("post-commit.commet-chained is already there but post-commit isn't Commet's");
    expect(tree(dir)).toEqual(before);
  });

  it('in a worktree, installs into the common dir, and a commit there refreshes that worktree', async () => {
    const dir = hookRepo();
    const wt = join(tempDir('commet-hooks-wt-'), 'wt');
    git(dir, ['worktree', 'add', '-q', '-b', 'wt', wt]);
    const paths = fakeCli();
    const r = await hook(['install', '--yes', '--git-only'], wt, { paths });
    expect(r.out).toContain('<git-common-dir>/hooks/post-commit: new hook');
    expect(readFileSync(join(dir, '.git/hooks/post-commit'), 'utf8')).toContain(HOOK_MARK);
    commit(wt, { FAKE_LOG: paths.log });
    commit(dir, { FAKE_LOG: paths.log });
    expect((await calls(paths.log, 2)).map((c) => c.cwd).sort()).toEqual([dir, wt].sort());
    expect((await hook(['remove'], wt)).code).toBe(0);
    expect(existsSync(join(dir, '.git/hooks/post-commit'))).toBe(false);
  });

  it('honours a core.hooksPath inside the git dir, writing nothing to .git/hooks', async () => {
    const dir = hookRepo();
    git(dir, ['config', 'core.hooksPath', '.git/custom-hooks']);
    const paths = fakeCli();
    const r = await hook(['install', '--yes', '--git-only'], dir, { paths });
    expect(r.out).toContain('<git-common-dir>/custom-hooks/post-commit: new hook');
    expect(existsSync(join(dir, '.git/hooks/post-commit'))).toBe(false);
    commit(dir, { FAKE_LOG: paths.log });
    expect(await calls(paths.log)).toHaveLength(1);
    expect((await hook(['remove'], dir)).out).toContain("<git-common-dir>/custom-hooks/post-commit: Commet's hook removed");
    expect(existsSync(join(dir, '.git/custom-hooks'))).toBe(false);
  });

  it('refuses a core.hooksPath shared with other repos (global config) or in the work tree, writing nothing', async () => {
    const dir = hookRepo();
    const shared = tempDir('commet-hooks-shared-');
    const global = join(tempDir('commet-hooks-global-'), 'gitconfig');
    writeFileSync(global, `[core]\n\thooksPath = ${shared}\n`);
    const before = tree(dir);
    // The CLI's git reads the process environment, as it does when the hook runs it.
    process.env['GIT_CONFIG_GLOBAL'] = global;
    let r: Awaited<ReturnType<typeof hook>>;
    try {
      r = await hook(['install', '--yes'], dir, { paths: fakeCli() });
      expect((await hook(['install', '--yes', '--claude-only'], dir, { paths: fakeCli() })).code).toBe(0);
    } finally {
      process.env['GIT_CONFIG_GLOBAL'] = GIT_ENV.GIT_CONFIG_GLOBAL;
    }
    expect(r.code).toBe(2);
    expect(r.err).toContain('core.hooksPath points outside this repository, so a hook there would also run for other repositories');
    expect(r.err).toContain('nothing was written (install one part alone with --git-only or --claude-only)');
    // It says what still works, so the snapshot can still be refreshed.
    expect(r.err).toContain('Still available: `commet hook install --claude-only` records agent sessions, and `commet scan` refreshes the snapshot by hand');
    expect(r.err.includes(shared)).toBe(false);
    expect(tree(shared)).toEqual({});
    // The refused run wrote nothing; the Claude Code part alone (run second) wrote only its file.
    const after = tree(dir);
    expect(Object.keys(after).filter((k) => !(k in before))).toEqual(['/.claude', `/${SETTINGS}`]);

    const tracked = hookRepo();
    git(tracked, ['config', 'core.hooksPath', '.githooks']);
    const t = await hook(['install', '--yes', '--git-only'], tracked, { paths: fakeCli() });
    expect(t.code).toBe(2);
    expect(t.err).toContain('core.hooksPath points into the work tree');
    expect(existsSync(join(tracked, '.githooks'))).toBe(false);
  });

  it('writes executable hooks whatever the umask, and rewrites a Commet hook that lost its execute bit', async () => {
    const dir = hookRepo();
    const paths = fakeCli();
    const old = process.umask(0o177);
    try {
      expect((await hook(['install', '--yes', '--git-only'], dir, { paths })).code).toBe(0);
    } finally {
      process.umask(old);
    }
    expect(statSync(join(dir, '.git/hooks/post-commit')).mode & 0o777).toBe(0o755);
    chmodSync(join(dir, '.git/hooks/post-merge'), 0o644);
    const r = await hook(['install', '--yes', '--git-only'], dir, { paths });
    expect(r.out).toContain("<git-common-dir>/hooks/post-merge: Commet's hook updated");
    expect(statSync(join(dir, '.git/hooks/post-merge')).mode & 0o777).toBe(0o755);
  });

  it('installs all or nothing: when the settings can\'t be written, the git hooks written first are undone', async () => {
    const dir = hookRepo();
    writeFileSync(join(dir, '.git/hooks/post-merge'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    mkdirp(join(dir, '.claude'));
    const before = tree(dir);
    // The settings folder turns read-only while the question is open, so only the settings write fails.
    const r = await hook(['install'], dir, { paths: fakeCli(), ask: async () => {
      chmodSync(join(dir, '.claude'), 0o555);
      return 'y';
    } });
    chmodSync(join(dir, '.claude'), 0o755);
    expect(r.code).toBe(1);
    expect(tree(dir)).toEqual(before);
  });

  it('remove never follows .git/hooks swapped for a link out of the repo, even to Commet-marked hooks', async () => {
    const dir = hookRepo();
    const elsewhere = tempDir('commet-hooks-elsewhere-');
    writeFileSync(join(elsewhere, 'post-commit'), hookScript('post-commit', '/n', '/c'), { mode: 0o755 });
    writeFileSync(join(elsewhere, 'post-commit.commet-chained'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    rmSync(join(dir, '.git/hooks'), { recursive: true });
    symlinkSync(elsewhere, join(dir, '.git/hooks'));
    const before = tree(elsewhere);
    expect((await hook(['remove'], dir)).out).toBe('no Commet hooks are installed; nothing to remove\n');
    expect(tree(elsewhere)).toEqual(before);
  });

  it('a failed install puts a rewritten hook back with its mode as well as its text', async () => {
    const dir = hookRepo();
    const paths = fakeCli();
    await hook(['install', '--yes', '--git-only'], dir, { paths });
    chmodSync(join(dir, '.git/hooks/post-merge'), 0o644);
    mkdirp(join(dir, '.claude'));
    const before = tree(dir);
    const r = await hook(['install'], dir, { paths, ask: async () => {
      chmodSync(join(dir, '.claude'), 0o555);
      return 'y';
    } });
    chmodSync(join(dir, '.claude'), 0o755);
    expect(r.code).toBe(1);
    expect(tree(dir)).toEqual(before);
  });

  it('refuses to write into a hooks folder swapped for a link after planning', () => {
    const dir = hookRepo();
    const hooks = join(dir, '.git/hooks');
    const steps = planInstall(hooks, process.execPath, '/x/cli.js');
    const elsewhere = tempDir('commet-hooks-swap-');
    renameSync(hooks, join(dir, '.git/hooks-moved'));
    symlinkSync(elsewhere, hooks);
    expect(() => applyInstall(hooks, steps)).toThrow('the hooks folder changed (now a link); nothing was written');
    expect(tree(elsewhere)).toEqual({});
  });

  it('with the CLI gone and no commet on PATH, the hook still exits with the chained hook\'s status, quietly', async () => {
    const dir = hookRepo();
    writeFileSync(join(dir, '.git/hooks/post-commit'), '#!/bin/sh\nexit 4\n', { mode: 0o755 });
    const paths = fakeCli();
    await hook(['install', '--yes', '--git-only'], dir, { paths });
    rmSync(paths.cli);
    const run = runHook(dir, '.git/hooks/post-commit', { PATH: '/usr/bin:/bin', FAKE_LOG: paths.log });
    expect(run).toEqual({ status: 4, stderr: '' });
    rmSync(join(dir, '.git/hooks/post-commit.commet-chained'));
    expect(runHook(dir, '.git/hooks/post-commit', { PATH: '/usr/bin:/bin' })).toEqual({ status: 0, stderr: '' });
    // A commit still succeeds.
    commit(dir, { PATH: `/usr/bin:/bin:${process.env['PATH']}` });
    expect(existsSync(paths.log)).toBe(false);
  });
});

describe('Claude Code hook', () => {
  const shapes: Record<string, string> = {
    'other keys': '{\n  "permissions": {\n    "allow": [\n      "Bash(ls)"\n    ]\n  },\n  "env": {\n    "A": "1"\n  }\n}\n',
    'other hooks': '{\n  "hooks": {\n    "PreToolUse": [\n      {\n        "matcher": "Bash",\n        "hooks": [{ "type": "command", "command": "true" }]\n      }\n    ]\n  }\n}\n',
    'other PostToolUse groups': '{\n  "hooks": {\n    "PostToolUse": [\n      { "matcher": "Edit", "hooks": [{ "type": "command", "command": "lint" }] }\n    ]\n  }\n}',
    'an empty PostToolUse': '{\n    "hooks": {\n        "PostToolUse": []\n    },\n    "model": "x"\n}\n',
    'one line': '{"permissions":{"allow":["Bash(ls)"]}}',
    'empty object': '{}',
    'tabs': '{\n\t"permissions": {\n\t\t"deny": []\n\t}\n}\n',
  };

  it.each(Object.entries(shapes))('merges into a file with %s, keeping every key, and remove restores its bytes', async (_name, text) => {
    const dir = hookRepo();
    mkdirp(join(dir, '.claude'));
    writeFileSync(join(dir, SETTINGS), text, { mode: 0o644 });
    writeFileSync(join(dir, '.claude/settings.json'), '{ "shared": true }\n');
    const paths = fakeCli();
    expect((await hook(['install', '--yes', '--claude-only'], dir, { paths })).code).toBe(0);
    const after = JSON.parse(readFileSync(join(dir, SETTINGS), 'utf8')) as { hooks: { PostToolUse: { hooks: { command: string }[] }[] } };
    const original = JSON.parse(text) as Record<string, unknown>;
    for (const [k, v] of Object.entries(original)) if (k !== 'hooks') expect((after as unknown as Record<string, unknown>)[k]).toEqual(v);
    const ours = after.hooks.PostToolUse.filter((g) => g.hooks.some((h) => h.command.includes('# commet:hook-event')));
    expect(ours).toHaveLength(1);
    expect(ours[0]!.hooks[0]!.command).toContain(`${paths.cli}' hook event`);
    // Every other hook is still there.
    const others = (original['hooks'] as Record<string, unknown[]> | undefined) ?? {};
    for (const [event, groups] of Object.entries(others)) {
      for (const g of groups) expect((after.hooks as Record<string, unknown[]>)[event]).toContainEqual(g);
    }
    expect(readFileSync(join(dir, '.claude/settings.json'), 'utf8')).toBe('{ "shared": true }\n');
    expect(statSync(join(dir, SETTINGS)).mode & 0o777).toBe(0o644);
    expect((await hook(['install', '--claude-only'], dir, { paths })).out).toBe('commet hooks are already installed; nothing to change\n');
    const removed = await hook(['remove', '--claude-only'], dir);
    expect(removed.out).toContain('every other byte of the file is as it was');
    expect(readFileSync(join(dir, SETTINGS), 'utf8')).toBe(text);
  });

  it('a user command that merely ends in Commet\'s marker is not Commet\'s', async () => {
    const dir = hookRepo();
    mkdirp(join(dir, '.claude'));
    const text = '{\n  "hooks": {\n    "PostToolUse": [\n      { "matcher": "Edit", "hooks": [{ "type": "command", "command": "echo ready # commet:hook-event" }] }\n    ]\n  }\n}\n';
    writeFileSync(join(dir, SETTINGS), text);
    expect((await hook(['remove'], dir)).out).toBe('no Commet hooks are installed; nothing to remove\n');
    await hook(['install', '--yes', '--claude-only'], dir, { paths: fakeCli() });
    expect(readFileSync(join(dir, SETTINGS), 'utf8')).toContain('echo ready # commet:hook-event');
    await hook(['remove'], dir);
    expect(readFileSync(join(dir, SETTINGS), 'utf8')).toBe(text);
  });

  it('a user command shaped like Commet\'s tail but not running a quoted CLI is left alone', async () => {
    const dir = hookRepo();
    mkdirp(join(dir, '.claude'));
    const text = '{"hooks": {"PostToolUse": [{"matcher": "Edit", "hooks": [{"type": "command", "command": "echo hook event # commet:hook-event"}]}]}}\n';
    writeFileSync(join(dir, SETTINGS), text);
    expect((await hook(['remove'], dir)).out).toBe('no Commet hooks are installed; nothing to remove\n');
    expect(readFileSync(join(dir, SETTINGS), 'utf8')).toBe(text);
    expect(removeText(text)).toBeNull();
  });

  it('creates the file (and .claude) when absent, and remove takes both away', async () => {
    const dir = hookRepo();
    const before = tree(dir);
    await hook(['install', '--yes', '--claude-only'], dir, { paths: fakeCli() });
    expect(statSync(join(dir, SETTINGS)).isFile()).toBe(true);
    await hook(['remove'], dir);
    expect(tree(dir)).toEqual(before);
  });

  it('a file reformatted since install loses only Commet\'s hook, keeping settings added since', async () => {
    const dir = hookRepo();
    mkdirp(join(dir, '.claude'));
    writeFileSync(join(dir, SETTINGS), '{\n  "permissions": { "allow": ["Bash(ls)"] }\n}\n');
    await hook(['install', '--yes', '--claude-only'], dir, { paths: fakeCli() });
    // Claude Code rewrites the file when a tool is allowed for good; here it also moved the keys around.
    const v = JSON.parse(readFileSync(join(dir, SETTINGS), 'utf8')) as { permissions: { allow: string[] }; hooks: unknown };
    v.permissions.allow.push('Bash(pwd)');
    writeFileSync(join(dir, SETTINGS), JSON.stringify({ permissions: v.permissions, hooks: v.hooks }, null, 4));
    const r = await hook(['remove'], dir);
    expect(r.out).toContain('the file was reformatted since install, so it was rewritten with every other setting kept');
    expect(JSON.parse(readFileSync(join(dir, SETTINGS), 'utf8'))).toEqual({ permissions: { allow: ['Bash(ls)', 'Bash(pwd)'] } });
  });

  it('install output, installText and removeText are inverse for every shape (pure)', () => {
    for (const text of [...Object.values(shapes), null]) {
      const added = installText(text, "'/n' '/c'");
      if ('error' in added) throw new Error(added.error);
      const back = removeText(added.text);
      expect(back).toEqual({ text, exact: true });
    }
    expect(installText('[1]', 'x')).toEqual({ error: 'is not a JSON object' });
    expect(installText('{"hooks": []}', 'x')).toEqual({ error: 'has a "hooks" value that is not an object' });
    expect(installText('{"hooks": {"PostToolUse": {}}}', 'x')).toEqual({ error: 'has a "hooks.PostToolUse" value that is not a list' });
    expect(removeText('{"hooks": {}}')).toBeNull();
  });

  it('never writes a committed, symlinked or unparsable settings.local.json, and notes one that isn\'t gitignored', async () => {
    const committed = hookRepo();
    mkdirp(join(committed, '.claude'));
    writeFileSync(join(committed, SETTINGS), '{}\n');
    git(committed, ['add', SETTINGS]);
    git(committed, ['commit', '-q', '-m', 'settings']);
    const c = await hook(['install', '--yes', '--claude-only'], committed, { paths: fakeCli() });
    expect(c.code).toBe(2);
    expect(c.err).toContain(`${SETTINGS} is committed to this repository`);
    expect(readFileSync(join(committed, SETTINGS), 'utf8')).toBe('{}\n');

    const linked = hookRepo();
    mkdirp(join(linked, '.claude'));
    const elsewhere = join(tempDir('commet-hooks-link-'), 'settings.json');
    writeFileSync(elsewhere, '{}\n');
    symlinkSync(elsewhere, join(linked, SETTINGS));
    expect((await hook(['install', '--yes', '--claude-only'], linked, { paths: fakeCli() })).code).toBe(2);
    expect(readFileSync(elsewhere, 'utf8')).toBe('{}\n');

    const broken = hookRepo();
    mkdirp(join(broken, '.claude'));
    writeFileSync(join(broken, SETTINGS), '{ "a": 1, }');
    const b = await hook(['install', '--yes', '--claude-only'], broken, { paths: fakeCli() });
    expect(b.err).toContain(`${SETTINGS} is not valid JSON; Commet won't edit it`);
    expect(readFileSync(join(broken, SETTINGS), 'utf8')).toBe('{ "a": 1, }');

    const plain = hookRepo();
    const n = await hook(['install', '--claude-only'], plain, { paths: fakeCli() });
    expect(n.out).toContain(`note: ${SETTINGS} isn't gitignored`);
    writeFileSync(join(plain, '.gitignore'), `${SETTINGS}\n`);
    expect((await hook(['install', '--claude-only'], plain, { paths: fakeCli() })).out).not.toContain('gitignored');
  });
});

const SID = '0f1e2d3c-4b5a-4968-8776-655443322110';
const payload = (repo: string, o: Record<string, unknown> = {}) => ({
  session_id: SID, transcript_path: `/somewhere/.claude/projects/-slug/${SID}.jsonl`, cwd: repo, permission_mode: 'default',
  hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_use_id: 'toolu_01AbCdEf',
  tool_input: { file_path: join(repo, 'src/a.ts'), old_string: 'old text', new_string: 'new text' },
  tool_response: { filePath: join(repo, 'src/a.ts'), structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
    lines: ['-export const removedLine = 1;', '+export const addedLineOne = 2;', '+export const addedLineTwo = 3;'] }] },
  ...o,
});
const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const sendEvent = (repo: string, body: unknown, env: NodeJS.ProcessEnv = {}) =>
  hook(['event'], repo, { stdin: Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]), now: () => NOW,
    env: { CLAUDE_PROJECT_DIR: repo, ...env } });
const eventRepo = () => {
  const dir = hookRepo();
  mkdirp(join(dir, 'src'));
  writeFileSync(join(dir, 'src/a.ts'), 'export const addedLineOne = 2;\nexport const addedLineTwo = 3;\n');
  return dir;
};

describe('hook event', () => {
  it('records an edit as a commet.edit/1 event: path, hashes and session key', async () => {
    const dir = eventRepo();
    expect(await sendEvent(dir, payload(dir))).toEqual({ code: 0, out: '', err: '' });
    const log = await readEvents(join(dir, '.git/commet'));
    expect(log.dropped).toBe(0);
    expect(log.events).toHaveLength(1);
    const e = log.events[0]!;
    expect(e).toMatchObject({ schema: 'commet.edit/1', tool: 'claude-code', path: 'src/a.ts', op: 'update', capture: 'hook', source: 'hook',
      ts: '2026-11-11T12:00:00Z', branch: 'main', headSha: git(dir, ['rev-parse', 'HEAD']) });
    expect(e.sessionKey).toMatch(/^s_[0-9a-f]{14}$/);
    expect(e.hunks).toEqual([{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
      addedHashes: [expect.stringMatching(/^[0-9a-f]{16}$/), expect.stringMatching(/^[0-9a-f]{16}$/)], removedHashes: [expect.stringMatching(/^[0-9a-f]{16}$/)] }]);
    expect(statSync(join(dir, '.git/commet', EVENTS_FILE)).mode & 0o777).toBe(0o600);
  });

  it('counts the same event once however often it is recorded (Claude Code runs every matching hook; other agents read them too)', async () => {
    const dir = eventRepo();
    // The hook in settings.local.json and a copy in settings.json both fire for one tool use.
    await sendEvent(dir, payload(dir));
    await sendEvent(dir, payload(dir));
    // The same tool use again, a second later: still the same event.
    await hook(['event'], dir, { stdin: Readable.from([JSON.stringify(payload(dir))]), now: () => NOW + 1000, env: { CLAUDE_PROJECT_DIR: dir } });
    await sendEvent(dir, payload(dir, { tool_use_id: 'toolu_02Other' }));
    const state = join(dir, '.git/commet');
    const log = await readEvents(state);
    expect(log.events).toHaveLength(2);
    expect(log.duplicates).toBe(2);
    expect(new Set(log.events.map((e) => e.eventId)).size).toBe(2);
    // Line order never matters: reversed, the same events come back.
    const lines = readFileSync(join(state, EVENTS_FILE), 'utf8').split('\n').filter(Boolean);
    writeFileSync(join(state, EVENTS_FILE), lines.reverse().join('\n') + '\n');
    expect(await readEvents(state)).toEqual(log);
  });

  it('a Claude-format payload from another agent, a malformed one or a cut-off line is a counted drop, never an edit', async () => {
    const dir = eventRepo();
    await sendEvent(dir, payload(dir, { transcript_path: '/home/x/.copilot/session-state/abc/events.jsonl' }));
    await sendEvent(dir, payload(dir, { tool_use_id: 'call_123' }));
    await sendEvent(dir, payload(dir, { session_id: 'not-a-uuid' }));
    await sendEvent(dir, payload(dir, { tool_response: { filePath: join(dir, 'src/a.ts'), structuredPatch: [{ lines: 'x' }] } }));
    await sendEvent(dir, '{ not json');
    const state = join(dir, '.git/commet');
    writeFileSync(join(state, EVENTS_FILE), readFileSync(join(state, EVENTS_FILE), 'utf8') + '{"schema":"commet.edit/1","even');
    const log = await readEvents(state);
    expect(log).toEqual({ events: [], duplicates: 0, dropped: 6 });
    // The next record starts on a line of its own: the cut-off one never swallows it.
    await sendEvent(dir, payload(dir));
    expect((await readEvents(state)).events).toHaveLength(1);
    const reasons = readFileSync(join(state, EVENTS_FILE), 'utf8').split('\n').filter((l) => l.includes('commet.drop/1'))
      .map((l) => (JSON.parse(l) as { reason: string }).reason);
    expect(reasons).toEqual(['not_claude_code', 'not_claude_code', 'not_claude_code', 'malformed', 'malformed']);
  });

  it('records nothing for other tools, other events or files outside the repo; a Write records its new file', async () => {
    const dir = eventRepo();
    const outside = join(tempDir('commet-hooks-outside-'), 'x.ts');
    writeFileSync(outside, 'export const elsewhere = 1;\n');
    await sendEvent(dir, payload(dir, { tool_name: 'Bash' }));
    await sendEvent(dir, payload(dir, { hook_event_name: 'PreToolUse' }));
    await sendEvent(dir, payload(dir, { tool_response: { filePath: outside, structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1,
      lines: ['+export const elsewhere = 1;'] }] } }));
    await sendEvent(dir, payload(dir, { tool_response: { filePath: join(dir, '.git/config'), structuredPatch: [{ oldStart: 1, oldLines: 0,
      newStart: 1, newLines: 1, lines: ['+[core] bare = false'] }] } }));
    expect(existsSync(join(dir, '.git/commet', EVENTS_FILE))).toBe(false);
    await sendEvent(dir, payload(dir, { tool_name: 'Write', tool_response: { type: 'create', filePath: join(dir, 'src/new.ts'),
      content: 'export const createdLine = 1;\nexport const createdTwo = 2;\n', structuredPatch: [] } }));
    const [e] = (await readEvents(join(dir, '.git/commet'))).events;
    expect(e).toMatchObject({ path: 'src/new.ts', op: 'create', hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, removedHashes: [] }] });
    expect(e!.hunks[0]!.addedHashes).toHaveLength(2);
  });

  it('places a file by its real path under the deepest worktree, Windows paths included', () => {
    const real = (f: string) => f;
    const roots = ['C:\\repo\\.sandboxes\\t1', 'C:\\repo'];
    expect(placePath('C:\\repo\\src\\a.ts', roots, win32, real)).toBe('src/a.ts');
    expect(placePath('C:\\repo\\.sandboxes\\t1\\src\\a.ts', roots, win32, real)).toBe('src/a.ts');
    expect(placePath('C:\\repo\\.git\\config', roots, win32, real)).toBeNull();
    expect(placePath('C:\\other\\a.ts', roots, win32, real)).toBeNull();
    expect(placePath('src\\a.ts', roots, win32, real)).toBe('unplaceable');
    // A root that is a prefix of another folder's name doesn't hold it.
    expect(placePath('C:\\repo2\\a.ts', ['C:\\repo'], win32, real)).toBeNull();
    // POSIX: a backslash is part of a filename.
    expect(placePath('/r/dir/a\\b.ts', ['/r'], posix, real)).toBe('dir/a\\b.ts');
    // A file already gone is placed through its folder; one whose folder is gone too, inside a root, can't be.
    const gone = (f: string) => {
      if (f.endsWith('.ts') || f.endsWith('gone')) throw new Error('ENOENT');
      return f;
    };
    expect(placePath('/r/src/x.ts', ['/r'], posix, gone)).toBe('src/x.ts');
    expect(placePath('/r/gone/x.ts', ['/r'], posix, gone)).toBe('unplaceable');
  });

  it('an edit to a POSIX filename with a backslash is recorded and read back', async () => {
    const dir = eventRepo();
    writeFileSync(join(dir, 'src/a\\b.ts'), 'export const slashed = 1;\n');
    await sendEvent(dir, payload(dir, { tool_response: { filePath: join(dir, 'src/a\\b.ts'), structuredPatch: [{ oldStart: 1, oldLines: 0,
      newStart: 1, newLines: 1, lines: ['+export const slashed = 1;'] }] } }));
    expect(await readEvents(join(dir, '.git/commet'))).toMatchObject({ events: [{ path: 'src/a\\b.ts' }], dropped: 0 });
  });

  it('a Write that creates an empty file is recorded, with no hunks', async () => {
    const dir = eventRepo();
    writeFileSync(join(dir, 'src/empty.ts'), '');
    await sendEvent(dir, payload(dir, { tool_name: 'Write', tool_response: { type: 'create', filePath: join(dir, 'src/empty.ts'), content: '', structuredPatch: [] } }));
    expect(await readEvents(join(dir, '.git/commet'))).toMatchObject({ events: [{ path: 'src/empty.ts', op: 'create', hunks: [] }], dropped: 0 });
  });

  it('an oversized payload is drained and counted as a drop', async () => {
    const dir = eventRepo();
    const big = Readable.from((function* () {
      for (let i = 0; i < 33; i++) yield Buffer.alloc(1 << 20, 0x20);
    })());
    expect((await hook(['event'], dir, { stdin: big, now: () => NOW, env: { CLAUDE_PROJECT_DIR: dir } })).code).toBe(0);
    expect(await readEvents(join(dir, '.git/commet'))).toEqual({ events: [], duplicates: 0, dropped: 1 });
  });
});

describe('hook refresh', () => {
  it('coalesces: refreshes asked for while one runs fold into one more scan', async () => {
    const dir = tempDir('commet-hooks-refresh-');
    let scans = 0;
    let release!: () => void;
    const first = coalescedRefresh(dir, 'k', () => {
      scans++;
      return scans === 1 ? new Promise<number>((r) => (release = () => r(0))) : Promise.resolve(0);
    });
    await new Promise((r) => setTimeout(r, 20));
    const others = await Promise.all([1, 2, 3].map(() => coalescedRefresh(dir, 'k', async () => {
      scans += 100;
      return 0;
    })));
    expect(others).toEqual([0, 0, 0]);
    release();
    await first;
    expect(scans).toBe(2);
    expect(tree(dir)).toEqual({});
  });

  it('never takes a lock its owner is still writing (no pid yet, just made)', async () => {
    const dir = tempDir('commet-hooks-fresh-');
    writeFileSync(join(dir, 'refresh-k.lock'), '');
    let scans = 0;
    await coalescedRefresh(dir, 'k', async () => (scans++, 0));
    expect(scans).toBe(0);
    expect(existsSync(join(dir, 'refresh-k.lock'))).toBe(true);
  });

  it('keeps folding requests in until none arrive, however many rounds that takes', async () => {
    const dir = tempDir('commet-hooks-rounds-');
    let scans = 0;
    // Each of the first seven scans sees a new commit arrive while it runs.
    await coalescedRefresh(dir, 'k', async () => {
      if (++scans <= 7) writeFileSync(join(dir, 'refresh-k.pending'), '');
      return 0;
    });
    expect(scans).toBe(8);
    expect(tree(dir)).toEqual({});
  });

  it('reaping a stale lock removes only the file inspected, never a fresh one taken meanwhile', () => {
    const dir = tempDir('commet-hooks-reap-');
    const lock = join(dir, 'x.lock');
    writeFileSync(lock, '1');
    const staleIno = lstatSync(lock, { bigint: true }).ino;
    // Another process reaped it and took the lock first.
    rmSync(lock);
    writeFileSync(join(dir, 'keep'), '');
    writeFileSync(lock, String(process.pid));
    reap(lock, staleIno);
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
    reap(lock, lstatSync(lock, { bigint: true }).ino);
    expect(existsSync(lock)).toBe(false);
    expect(Object.keys(tree(dir))).toEqual(['/keep']);
  });

  it('takes over a lock its process left behind', async () => {
    const dir = tempDir('commet-hooks-stale-');
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
    writeFileSync(join(dir, 'refresh-k.lock'), dead);
    let scans = 0;
    await coalescedRefresh(dir, 'k', async () => (scans++, 0));
    expect(scans).toBe(1);
  });

  it('scans publish one at a time: a held lock is waited for, never written through', async () => {
    const dir = tempDir('commet-hooks-publish-');
    const lock = join(dir, 'publish.lock');
    writeFileSync(lock, String(process.pid));
    expect(await withLock(lock, () => 1, 3, 5)).toBeNull();
    setTimeout(() => rmSync(lock), 50);
    expect(await withLock(lock, () => 2, 100, 5)).toEqual({ value: 2 });
    expect(existsSync(lock)).toBe(false);
  });

  it('a scan waits for the publish lock and, while another scan holds it, writes nothing', async () => {
    const dir = hookRepo();
    mkdirSync(join(dir, '.git/commet'), { mode: 0o700 });
    writeFileSync(join(dir, '.git/commet/publish.lock'), String(process.pid));
    const r = await cli(['scan'], dir, { ...process.env, CLAUDE_CONFIG_DIR: tempDir('commet-hooks-claude-') });
    expect(r.code).toBe(5);
    expect(r.err).toContain('another scan has been writing its results for 5 s; nothing was written');
    expect(existsSync(join(dir, '.git/commet/snapshot.json'))).toBe(false);
    expect(existsSync(join(dir, '.git/commet/layout.json'))).toBe(false);
  }, 60_000);

  it('runs a quiet scan of the worktree it was called from', async () => {
    const dir = hookRepo();
    const r = await hook(['refresh'], dir, { env: { CLAUDE_CONFIG_DIR: tempDir('commet-hooks-claude-') } });
    expect(r).toEqual({ code: 0, out: '', err: '' });
    expect(existsSync(join(dir, '.git/commet/snapshot.json'))).toBe(true);
    expect(Object.keys(tree(join(dir, '.git/commet'))).filter((f) => f.includes('refresh') || f.includes('lock'))).toEqual([]);
  });
});

it('the suite never runs git with the machine\'s config', () => {
  const r = spawnSync('git', ['config', '--show-origin', '--get-all', 'core.hooksPath'], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  expect(r.stdout).toBe('');
});
