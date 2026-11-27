// visual-proof's run (main.ts) end to end on a fixture checkout, up to the stops that come before any
// take (PR #93's Qodo 648df95e, 878c1941, d8fc556d): what the run would write is scanned before it is
// written, what a build put in dist/web is scanned before anything is served or filmed, and a tree's own
// node_modules is never copied over or through. The tools are compiled once, as vp.sh compiles them,
// and run with the fixture as the checkout (vp.sh always runs them in this one).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NESTED_SANDBOX, probeSandbox } from '../../.claude/skills/visual-proof/scripts/prepare.js';
import { realTempDir } from '../fixtures/tmp.js';

const ROOT = resolve(import.meta.dirname, '../..');
const TOKEN = 'Qx3vL0t9-mN_2bYk7RfA1sWc8dHe5jUp4gZiTo6aVyE';
const RUN = /(?:^|[^A-Za-z0-9_-])aB3aB3aB3/;
let mainJs = '';

beforeAll(() => {
  const tools = realTempDir('commet-vp-tools-');
  execFileSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(ROOT, '.claude', 'skills', 'visual-proof', 'tsconfig.json'), '--outDir', join(tools, 'out')]);
  symlinkSync(join(ROOT, 'node_modules'), join(tools, 'node_modules'));
  writeFileSync(join(tools, 'out', 'package.json'), '{ "type": "module" }\n');
  mainJs = join(tools, 'out', '.claude', 'skills', 'visual-proof', 'scripts', 'main.js');
}, 120_000);

const BUILD = (app: string) => `const fs = require('fs');
fs.mkdirSync('dist/web/assets', { recursive: true });
fs.writeFileSync('dist/web/index.html', '<!doctype html><script src="/assets/app.js"></script>\\n');
fs.writeFileSync('dist/web/assets/app.js', ${app});
`;

/** A checkout whose commits build with `node build.js` into dist/web; its node_modules has just what the tools check looks for. */
function checkout() {
  const dir = realTempDir('commet-vp-run-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']] as const) git('config', k, v);
  mkdirSync(join(dir, 'node_modules', '@playwright', 'test'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', '.bin'));
  writeFileSync(join(dir, 'node_modules', '.bin', 'tsc'), '');
  const commit = (subject: string, files: Readonly<Record<string, string>>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git('add', '--', ...Object.keys(files));
    git('commit', '-q', '-m', subject);
    return git('rev-parse', 'HEAD').trim();
  };
  const base = commit('feat: the view', {
    '.gitignore': 'node_modules/\ndist/\n', 'package-lock.json': '{"lockfileVersion":3}\n',
    'package.json': '{"name":"fixture","private":true,"scripts":{"build":"node build.js"}}\n', 'build.js': BUILD(`'console.log(1);\\n'`),
  });
  return { dir, git, commit, base };
}

/** The scratch dir a run of these two commits gets: the first name it picks (a fresh --out, fresh SHAs). */
const scratchOf = (base: string, head: string) => join(realpathSync('/tmp'), `visual-proof-${base.slice(0, 7)}-${head.slice(0, 7)}-panel-labels`);

/** `main.js run` in `cwd`; the scratch dir (/tmp/<the record's name>), whatever the stop left of it, goes afterwards. */
function run(cwd: string, base: string, head: string, env: Readonly<Record<string, string>> = {}) {
  const out = realTempDir('commet-vp-out-');
  const r = spawnSync(process.execPath, [mainJs, 'run', '--base', base, '--head', head, '--scene', 'panel-labels', '--out', out], { cwd, encoding: 'utf8', timeout: 110_000, env: { ...process.env, ...env } });
  const record = /^record: (.*\.md)$/m.exec(r.stdout)?.[1];
  const scratch = record ? join(realpathSync('/tmp'), basename(record, '.md')) : scratchOf(base, head);
  const left = existsSync(scratch);
  if (left) rmSync(scratch, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out, record: record && existsSync(record) ? readFileSync(record, 'utf8') : null, scratchLeft: left };
}

describe('a visual-proof run', { timeout: 120_000 }, () => {
  it('stops on a private string in a changed path or a commit subject before it writes anything (Qodo 878c1941)', () => {
    const f = checkout();
    const path = f.commit('feat: a file', { [`web/${'aB3'.repeat(11)}.txt`]: 'x\n' });
    const r = run(f.dir, f.base, path);
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stdout).toMatch(/^STOP privacy: 1 hit in what the run would write; nothing was written$/m);
    expect(r.stdout).toMatch(/^ {2}token-like string in the changed paths: aB3aB3… \(33 chars\)$/m);
    expect(r.stdout).not.toMatch(RUN);
    expect(readdirSync(r.out)).toEqual([]);
    expect(r.scratchLeft).toBe(false);

    f.git('reset', '-q', '--hard', f.base);
    const subject = f.commit(`wip ${TOKEN}`, { 'web/view.txt': 'x\n' });
    const s = run(f.dir, f.base, subject);
    expect(s.status).toBe(3);
    expect(s.stdout).toMatch(/^ {2}token-like string in the head commit subject: /m);
    expect(s.stdout).not.toContain(TOKEN);
    expect(readdirSync(s.out)).toEqual([]);
  });

  it.skipIf(process.platform !== 'darwin')("stops on a private file's text a build copied into dist/web, before anything is served or filmed (Qodo 648df95e)", (ctx) => {
    ctx.skip(probeSandbox() === 'nested', NESTED_SANDBOX);
    // The sandbox denies the credential stores only: a build can still read a file like this one
    const secret = join(realTempDir('commet-vp-private-'), 'notes.txt');
    writeFileSync(secret, `token ${TOKEN}\n`);
    const f = checkout();
    const head = f.commit('feat: the view, with notes', { 'build.js': BUILD(`'const notes = ' + JSON.stringify(fs.readFileSync(${JSON.stringify(secret)}, 'utf8')) + ';\\n'`) });
    const r = run(f.dir, f.base, head);
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stdout).toMatch(/^STOP privacy: privacy scan: 1 hit; nothing was composed or kept from this run$/m);
    expect(r.stdout).toMatch(/^ {2}token-like string in the after build's dist\/web\/assets\/app\.js: Qx3vL0… \(\d+ chars\)$/m);
    expect(r.record).toMatch(/^Status: stopped \(privacy\) after step 3: /m);
    expect(r.record).toMatch(/^## 3\. Build before \(/m);
    expect(`${r.stdout}${r.record}`).not.toContain(TOKEN);
    expect(r.scratchLeft, 'a privacy stop removes the scratch dir with the builds').toBe(false);
    expect(readdirSync(r.out).filter((x) => !x.endsWith('.md')), 'nothing composed').toEqual([]);
  });

  it.skipIf(process.platform !== 'darwin')("reads dist/web under the build's sandbox, never in its own process, so what the sandbox denies stays unread whatever the build left running (Qodo af83b6b5)", (ctx) => {
    ctx.skip(probeSandbox() === 'nested', NESTED_SANDBOX);
    const f = checkout();
    const head = f.commit('feat: the view, with a folder', { 'build.js': `${BUILD(`'console.log(1);\\n'`)}fs.mkdirSync('dist/web/private');\nfs.writeFileSync('dist/web/private/notes.js', 'x;\\n');\n` });
    // The sandbox denies the dirs its deny list names (GH_CONFIG_DIR among them): here the head build's own
    // dist/web/private, which the build can write but not read back. The run's own process could read it; the sandbox can't.
    const r = run(f.dir, f.base, head, { GH_CONFIG_DIR: join(scratchOf(f.base, head), 'head', 'dist', 'web', 'private') });
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stdout).toMatch(/^STOP build-failed: the after build's dist\/web couldn't be read under the sandbox \(exit 1\)/m);
    expect(r.record).toMatch(/^## 3\. Build before \(/m);
  });

  it.skipIf(process.platform !== 'darwin')('stops on a tracked node_modules symlink before the copy, and writes nothing outside scratch (Qodo d8fc556d)', (ctx) => {
    ctx.skip(probeSandbox() === 'nested', NESTED_SANDBOX);
    const outside = realTempDir('commet-vp-outside-');
    const f = checkout();
    // Tracked as a link (mode 120000) to a dir outside scratch; the checkout's own node_modules stays a dir
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: f.dir, input: outside, encoding: 'utf8' }).trim();
    f.git('update-index', '--add', '--cacheinfo', `120000,${blob},node_modules`);
    f.git('commit', '-q', '-m', 'chore: link node_modules');
    const head = f.git('rev-parse', 'HEAD').trim();
    const r = run(f.dir, f.base, head);
    expect(readdirSync(outside), 'written through the link').toEqual([]);
    expect(r.status, r.stdout + r.stderr).toBe(3);
    expect(r.stdout).toMatch(/^STOP build-failed: the head tree has its own node_modules \(a symlink\)/m);
    expect(r.record).toMatch(/^## 3\. Build before \(/m);
  });
});
