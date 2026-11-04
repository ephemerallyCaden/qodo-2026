import { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { writeAtomic } from '../src/state/io.js';
import { cli } from './fixtures/cli.js';
import { miniRepo } from './fixtures/mini.js';

it('writeAtomic never writes through a file or symlink planted at its temp path (bar raiser #7)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commet-state-'));
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
  const target = mkdtempSync(join(tmpdir(), 'commet-state-target-'));
  writeFileSync(join(target, 'keep.txt'), 'untouched');
  chmodSync(target, 0o755);
  symlinkSync(target, join(repo.dir, '.git/commet'));
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'commet-state-claude-')) });
  expect(r.code).toBe(5);
  expect(r.err).toContain('.git/commet is a symlink');
  expect(readdirSync(target)).toEqual(['keep.txt']);
  expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('untouched');
  expect(statSync(target).mode & 0o777).toBe(0o755);
});

it('creates .git/commet with mode 0700 when it is absent', async () => {
  const repo = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# State fixture', 'One commit is enough.'] }]);
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'commet-state-claude-')) });
  expect(r.code).toBe(0);
  expect(lstatSync(join(repo.dir, '.git/commet')).isDirectory()).toBe(true);
  expect(statSync(join(repo.dir, '.git/commet')).mode & 0o777).toBe(0o700);
});
