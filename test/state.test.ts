import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeAtomic } from '../src/state/io.js';
import { cli } from './fixtures/cli.js';
import { miniRepo } from './fixtures/mini.js';
import { tempDir } from './fixtures/tmp.js';

afterEach(() => vi.resetModules());

it('writeAtomic never writes through a file or symlink planted at its temp path (bar raiser #7)', () => {
  const dir = tempDir('commet-state-');
  const victim = join(dir, 'victim');
  writeFileSync(victim, 'untouched');
  const file = join(dir, 'snapshot.json');
  symlinkSync(victim, `${file}.tmp-${process.pid}`);
  writeAtomic(file, 'new snapshot');
  expect(readFileSync(victim, 'utf8')).toBe('untouched');
  expect(readFileSync(file, 'utf8')).toBe('new snapshot');
  expect(statSync(file).mode & 0o777).toBe(0o600);
});

it('refuses a symlinked .git/commet with exit 5 and leaves its target untouched (Qodo PR8 #5)', async () => {
  const repo = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# State fixture', 'One commit is enough.'] }]);
  const target = tempDir('commet-state-target-');
  writeFileSync(join(target, 'keep.txt'), 'untouched');
  chmodSync(target, 0o755);
  symlinkSync(target, join(repo.dir, '.git/commet'));
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: tempDir('commet-state-claude-') });
  expect(r.code).toBe(5);
  expect(r.err).toContain('.git/commet is a symlink');
  expect(readdirSync(target)).toEqual(['keep.txt']);
  expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('untouched');
  expect(statSync(target).mode & 0o777).toBe(0o755);
});

it('creates .git/commet with mode 0700 when it is absent', async () => {
  const repo = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# State fixture', 'One commit is enough.'] }]);
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: tempDir('commet-state-claude-') });
  expect(r.code).toBe(0);
  expect(lstatSync(join(repo.dir, '.git/commet')).isDirectory()).toBe(true);
  expect(statSync(join(repo.dir, '.git/commet')).mode & 0o777).toBe(0o700);
});

describe('Qodo PR10 #3: a parallel first scan creating .git/commet first', () => {
  /** Loads io.js with mkdirSync replaced: `race` runs first (the other scan), then EEXIST is thrown. */
  async function stateDirRacing(race: (dir: string) => void) {
    vi.resetModules();
    vi.doMock('node:fs', async (orig) => {
      const fs = await orig<typeof import('node:fs')>();
      return { ...fs, mkdirSync: (p: string) => {
        race(p);
        throw Object.assign(new Error(`EEXIST: file already exists, mkdir '${p}'`), { code: 'EEXIST' });
      } };
    });
    try {
      return (await import('../src/state/io.js')).stateDir;
    } finally {
      vi.doUnmock('node:fs');
    }
  }

  it('accepts the directory the other scan made', async () => {
    const common = tempDir('commet-race-');
    const stateDir = await stateDirRacing((p) => mkdirSync(p, { mode: 0o755 }));
    expect(stateDir(common)).toBe(join(common, 'commet'));
    expect(statSync(join(common, 'commet')).mode & 0o777).toBe(0o700);
  });

  it('still refuses a symlink planted in the race', async () => {
    const common = tempDir('commet-race-');
    const target = tempDir('commet-race-target-');
    chmodSync(target, 0o755);
    const stateDir = await stateDirRacing((p) => symlinkSync(target, p));
    expect(() => stateDir(common)).toThrow(/symlink/);
    expect(statSync(target).mode & 0o777).toBe(0o755);
  });
});
