// visual-proof: the builds and the data. A tree whose lockfile isn't this checkout's can't borrow its
// node_modules: the run stops and asks (npm ci needs the network). A scene's own repo is the same commit
// every run, so both builds, and every run, see the same data (R12).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addNodeModules, makeFixtureRepo } from '../../.claude/skills/visual-proof/scripts/prepare.js';
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
});
