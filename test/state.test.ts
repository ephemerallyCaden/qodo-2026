import { mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { writeAtomic } from '../src/state/io.js';

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
