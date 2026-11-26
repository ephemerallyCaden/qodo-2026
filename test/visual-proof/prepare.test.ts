// visual-proof: the builds and the data. A tree whose lockfile isn't this checkout's can't borrow its
// node_modules: the run stops and asks (npm ci needs the network). A scene's own repo is the same commit
// every run, so both builds, and every run, see the same data (R12).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addNodeModules, bundleFiles, bundleOf, contained, exportTree, libraryRuns, makeFixtureRepo, makeScratch, NESTED_SANDBOX, probeSandbox, revisionEnv, SANDBOX_EXEC, sandboxProfile, sandboxState, worktreeRev } from '../../.claude/skills/visual-proof/scripts/prepare.js';
import { bundleHits } from '../../.claude/skills/visual-proof/scripts/privacy.js';
import { Stop } from '../../.claude/skills/visual-proof/scripts/rules.js';
import { tempDir } from '../fixtures/tmp.js';

function checkout(dir: string, lock: string): string {
  mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'dep', 'index.js'), 'export {};\n');
  writeFileSync(join(dir, 'package-lock.json'), lock);
  return dir;
}

describe('addNodeModules', () => {
  it("stops, and copies nothing, when the tree's package-lock.json differs from this checkout's", () => {
    const root = tempDir('commet-vp-prep-');
    const top = checkout(join(root, 'top'), '{"lockfileVersion":3,"a":1}\n');
    const base = join(root, 'base');
    mkdirSync(base);
    writeFileSync(join(base, 'package-lock.json'), '{"lockfileVersion":3,"a":2}\n');
    let got: unknown;
    try { addNodeModules(top, base); } catch (e) { got = e; }
    expect(got).toBeInstanceOf(Stop);
    expect((got as Stop).code).toBe('build-failed');
    expect((got as Stop).message).toMatch(/the base tree's package-lock.json differs .* needs the network/);
    expect(existsSync(join(base, 'node_modules'))).toBe(false);
  });
  it('copies node_modules into a tree with the same lockfile', () => {
    const root = tempDir('commet-vp-prep-');
    const top = checkout(join(root, 'top'), '{"lockfileVersion":3}\n');
    const head = join(root, 'head');
    mkdirSync(head);
    writeFileSync(join(head, 'package-lock.json'), '{"lockfileVersion":3}\n');
    addNodeModules(top, head);
    expect(existsSync(join(head, 'node_modules', 'dep', 'index.js'))).toBe(true);
  });
  it('stops before the copy when a tracked node_modules is a symlink out of the tree, and writes nothing outside it (Qodo d8fc556d)', () => {
    const root = tempDir('commet-vp-prep-');
    const top = checkout(join(root, 'top'), '{"lockfileVersion":3}\n');
    const outside = join(root, 'outside');
    mkdirSync(outside);
    // A revision that tracks node_modules as a link to a dir outside scratch, exported as the run exports it
    const repo = join(root, 'repo');
    mkdirSync(repo);
    const g = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    g('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']] as const) g('config', k, v);
    writeFileSync(join(repo, 'package-lock.json'), '{"lockfileVersion":3}\n');
    symlinkSync(outside, join(repo, 'node_modules'));
    g('add', 'package-lock.json', 'node_modules');
    g('commit', '-q', '-m', 'link');
    const rev = { sha: g('rev-parse', 'HEAD').trim(), short: 'x', subject: 'link', worktree: false };
    const head = join(root, 'head');
    exportTree(repo, rev, head, join(root, 'head.tar'));
    expect(lstatSync(join(head, 'node_modules')).isSymbolicLink()).toBe(true);
    let got: unknown;
    try { addNodeModules(top, head); } catch (e) { got = e; }
    expect(readdirSync(outside), 'written through the link').toEqual([]);
    expect(got).toBeInstanceOf(Stop);
    expect((got as Stop).code).toBe('build-failed');
    expect((got as Stop).message).toMatch(/^the head tree has its own node_modules \(a symlink\)/);
  });
  it('stops, and leaves it as it is, when the tree has a node_modules of any other kind: a dir, a file, a dangling link', () => {
    const root = tempDir('commet-vp-prep-');
    const top = checkout(join(root, 'top'), '{"lockfileVersion":3}\n');
    const cases: [string, (p: string) => void][] = [
      ['a directory', (p) => { mkdirSync(join(p, 'own')); }],
      ['a file', (p) => { rmSync(p, { recursive: true }); writeFileSync(p, 'x\n'); }],
      ['a symlink', (p) => { rmSync(p, { recursive: true }); symlinkSync(join(root, 'no-such-dir'), p); }],
    ];
    for (const [kind, make] of cases) {
      const tree = join(root, `base-${kind.replace(/\W/g, '')}`);
      mkdirSync(join(tree, 'node_modules'), { recursive: true });
      writeFileSync(join(tree, 'package-lock.json'), '{"lockfileVersion":3}\n');
      make(join(tree, 'node_modules'));
      const before = readdirSync(tree, { recursive: true }).map(String).sort();
      let got: unknown;
      try { addNodeModules(top, tree); } catch (e) { got = e; }
      expect((got as Stop).code, kind).toBe('build-failed');
      expect((got as Stop).message, kind).toContain(`has its own node_modules (${kind})`);
      expect(readdirSync(tree, { recursive: true }).map(String).sort(), kind).toEqual(before);
      expect(existsSync(join(root, 'no-such-dir')), kind).toBe(false);
    }
  });
});

describe('bundleOf', () => {
  const tree = (make: (web: string) => void) => {
    const dest = tempDir('commet-vp-prep-');
    mkdirSync(join(dest, 'dist', 'web', 'assets'), { recursive: true });
    writeFileSync(join(dest, 'dist', 'web', 'index.html'), '<!doctype html>\n');
    make(join(dest, 'dist', 'web'));
    return dest;
  };
  it("lists dist/web's files, and their text for the privacy scan (Qodo 648df95e)", () => {
    const dest = tree((web) => writeFileSync(join(web, 'assets', 'a.js'), 'x;\n'));
    const b = bundleOf(dest);
    expect(b.files).toEqual(['assets/a.js', 'index.html']);
    expect(bundleFiles(dest, b)).toEqual([{ path: 'assets/a.js', text: 'x;\n' }, { path: 'index.html', text: '<!doctype html>\n' }]);
  });
  it('stops on a link the build made in dist/web, which this process would read through outside the sandbox', () => {
    const secret = join(tempDir('commet-vp-prep-'), 'id');
    writeFileSync(secret, 'secret\n');
    const linked = tree((web) => symlinkSync(secret, join(web, 'assets', 'a.js')));
    expect(() => bundleOf(linked)).toThrow(/^the build wrote a symlink into dist\/web; it may hold files and folders only$/);
    const whole = tempDir('commet-vp-prep-');
    mkdirSync(join(whole, 'dist'));
    symlinkSync(dirname(secret), join(whole, 'dist', 'web'));
    expect(() => bundleOf(whole)).toThrow(/^the build's dist\/web is a symlink, not a folder$/);
  });
});

describe('libraryRuns (Qodo 648df95e)', () => {
  const ROOT = resolve(import.meta.dirname, '../..');
  it("holds the token-like runs of this checkout's own three.js build, so the view bundle's WebGL names pass the bundle scan", () => {
    const library = libraryRuns(ROOT);
    expect(library.has('COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR')).toBe(true);
    const three = [{ path: 'assets/index.js', text: readFileSync(join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'), 'utf8') }];
    expect(bundleHits('after', three, { literals: [] }).map((h) => h.rule)).toContain('token-like string');
    expect(bundleHits('after', three, { literals: [], library })).toEqual([]);
  });
  it('is empty in a checkout without three', () => {
    expect(libraryRuns(tempDir('commet-vp-prep-')).size).toBe(0);
  });
});

describe('makeFixtureRepo', () => {
  it('gives the same files the same commit, in a git dir of its own', () => {
    const root = tempDir('commet-vp-prep-');
    const files = { 'bb/three.ts': 'three\n', 'aa/one.ts': 'one\n', 'README.md': '# r\n' };
    const sha = (d: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf8' }).trim();
    makeFixtureRepo(files, '2026-10-10T09:00:00Z', join(root, 'a'));
    makeFixtureRepo({ ...files }, '2026-10-10T09:00:00Z', join(root, 'b'));
    expect(sha(join(root, 'a'))).toMatch(/^[0-9a-f]{40}$/);
    expect(sha(join(root, 'a'))).toBe(sha(join(root, 'b')));
    expect(execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: join(root, 'a'), encoding: 'utf8' }).trim()).toBe('.git');
    expect(execFileSync('git', ['ls-files'], { cwd: join(root, 'a'), encoding: 'utf8' }).trim().split('\n')).toEqual(['README.md', 'aa/one.ts', 'bb/three.ts']);
  });
  it('makes the earlier commits first, oldest first, each at its own date, and gives them the same SHA every time', () => {
    const root = tempDir('commet-vp-prep-');
    const earlier = [{ at: '2024-03-01T09:00:00Z', files: { 'aa/old.ts': 'old\n', 'aa/new.ts': 'new\n' } }];
    const git = (d: string, ...args: string[]) => execFileSync('git', args, { cwd: d, encoding: 'utf8' }).trim();
    const lines = makeFixtureRepo({ 'aa/new.ts': 'new\nagain\n' }, '2026-10-10T09:00:00Z', join(root, 'a'), earlier);
    makeFixtureRepo({ 'aa/new.ts': 'new\nagain\n' }, '2026-10-10T09:00:00Z', join(root, 'b'), earlier);
    expect(git(join(root, 'a'), 'rev-parse', 'HEAD')).toBe(git(join(root, 'b'), 'rev-parse', 'HEAD'));
    // newest first: the last commit changed new.ts only, the earlier one added both
    expect(git(join(root, 'a'), 'log', '--format=%aI %cI', '--name-only').split('\n').filter(Boolean)).toEqual([
      '2026-10-10T09:00:00Z 2026-10-10T09:00:00Z', 'aa/new.ts', '2024-03-01T09:00:00Z 2024-03-01T09:00:00Z', 'aa/new.ts', 'aa/old.ts',
    ]);
    expect(readFileSync(join(root, 'a', 'aa', 'new.ts'), 'utf8')).toBe('new\nagain\n');
    expect(lines.join('\n')).toContain('2 commits, oldest first: 2 files at 2024-03-01T09:00:00Z (aa/new.ts, aa/old.ts); 1 files at 2026-10-10T09:00:00Z (aa/new.ts)');
  });
});

describe('worktreeRev', () => {
  it('names a working tree that holds an untracked nested repo and a dangling symlink, instead of crashing (PR #199 aaa13fc5)', () => {
    const root = tempDir('commet-vp-prep-');
    makeFixtureRepo({ 'a.ts': 'a\n' }, '2026-10-10T09:00:00Z', root);
    writeFileSync(join(root, 'a.ts'), 'changed\n');
    makeFixtureRepo({ 'x.ts': 'x\n' }, '2026-10-10T09:00:00Z', join(root, 'nested'));
    symlinkSync(join(root, 'no-such-target'), join(root, 'dangling'));
    const r = worktreeRev(root);
    expect(r.worktree).toBe(true);
    expect(r.diffHash).toMatch(/^[0-9a-f]{64}$/);
    // the same tree, the same name
    expect(worktreeRev(root).diffHash).toBe(r.diffHash);
  });
});

describe('the revisions run contained (PR #199 6683b8a2)', () => {
  it('keeps only an allowlist of the environment: no tokens or keys reach a build, a scan or a take', () => {
    const env = revisionEnv({ PATH: '/bin', HOME: '/h', TMPDIR: '/t', LANG: 'C', GH_TOKEN: 'x', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'x', ANTHROPIC_API_KEY: 'x', NPM_TOKEN: 'x', SSH_AUTH_SOCK: '/s' }, { CLAUDE_CONFIG_DIR: '/c' });
    expect(env).toEqual({ PATH: '/bin', HOME: '/h', TMPDIR: '/t', LANG: 'C', CLAUDE_CONFIG_DIR: '/c' });
  });

  it.skipIf(process.platform !== 'darwin')('under sandbox-exec: no read of a credential store, no write outside the scratch and temp dirs, no network beyond localhost', (ctx) => {
    // Under the agent runner's checks (themselves under sandbox-exec) no sandbox can start: skipped with the reason, never passed
    ctx.skip(probeSandbox() === 'nested', NESTED_SANDBOX);
    const home = tempDir('commet-vp-home-'), scratch = tempDir('commet-vp-scr-');
    mkdirSync(join(home, '.ssh'));
    writeFileSync(join(home, '.ssh', 'id'), 'secret\n');
    writeFileSync(join(home, 'notes.txt'), 'fine\n');
    const profile = sandboxProfile({ home, env: {}, writable: [scratch] });
    const run = (js: string) => { const c = contained(process.execPath, ['-e', js], profile); return spawnSync(c.cmd, c.args, { encoding: 'utf8' }); };
    const read = (f: string) => run(`try { require('fs').readFileSync(${JSON.stringify(f)}); console.log('read') } catch (e) { console.log(e.code) }`).stdout.trim();
    expect(read(join(home, '.ssh', 'id'))).toBe('EPERM');
    expect(read(join(home, 'notes.txt'))).toBe('read');
    const write = (f: string) => run(`try { require('fs').writeFileSync(${JSON.stringify(f)}, 'x'); console.log('wrote') } catch (e) { console.log(e.code) }`).stdout.trim();
    expect(write(join(home, 'planted.txt'))).toBe('EPERM');
    expect(write(join(scratch, 'ok.txt'))).toBe('wrote');
    // TEST-NET-1 (192.0.2.0/24) is never routed: refused at once inside, where outside it would hang
    const connect = (host: string) => run(`const s = require('net').connect({ host: ${JSON.stringify(host)}, port: 9 }); s.on('error', (e) => { console.log(e.code); process.exit(0) }); s.on('connect', () => { console.log('connected'); process.exit(0) }); setTimeout(() => { console.log('timeout'); process.exit(0) }, 3000)`).stdout.trim();
    expect(connect('192.0.2.1')).toBe('EPERM');
    expect(connect('127.0.0.1')).toMatch(/^(ECONNREFUSED|connected)$/);
  });
});

describe('sandboxState', () => {
  it('is nested only on the refusal a sandboxed process gets, and unavailable on any other failure', () => {
    expect(sandboxState({ status: 0, stderr: '' })).toBe('ok');
    expect(sandboxState({ status: 71, stderr: 'sandbox-exec: sandbox_apply: Operation not permitted\n' })).toBe('nested');
    expect(sandboxState({ status: 65, stderr: 'sandbox-exec: syntax error\n' })).toBe('unavailable');
    expect(sandboxState({ status: null, stderr: null })).toBe('unavailable');
  });
  it.skipIf(process.platform !== 'darwin')('reads a real sandbox-exec inside another as nested', () => {
    // One level below wherever this runs: the inner one can't start (if this process is sandboxed already, neither can the outer).
    // The outer denies one thing: a profile that denies nothing lets a sandbox start inside it.
    const outer = '(version 1)(allow default)(deny file-read* (literal "/commet-no-such-file"))';
    const r = spawnSync(SANDBOX_EXEC, ['-p', outer, SANDBOX_EXEC, '-p', '(version 1)(allow default)', '/usr/bin/true'], { encoding: 'utf8' });
    expect(sandboxState(r)).toBe('nested');
  });
  it.skipIf(process.platform === 'darwin')('is unavailable where there is no sandbox-exec', () => {
    expect(probeSandbox()).toBe('unavailable');
  });
});

describe('makeScratch', () => {
  it('makes the scratch dir private to this user (0700): raw takes hold page text and API bodies (PR #199 868113ad)', () => {
    const dir = join(tempDir('commet-vp-prep-'), 'visual-proof-x');
    makeScratch(dir);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });
});
