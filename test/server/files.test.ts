// Qodo #32 r1: where O_NOFOLLOW doesn't exist (Windows), a symlinked state or bundle file must still
// be refused before it is read (Rule 2), not followed.
import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

vi.mock('node:fs', async (orig) => {
  const fs = await orig<typeof import('node:fs')>();
  const constants = { ...fs.constants, O_NOFOLLOW: undefined };
  return { ...fs, constants, default: { ...fs, constants } };
});

it('refuses symlinked state and bundle files without O_NOFOLLOW', async () => {
  const { constants } = await import('node:fs');
  expect(constants.O_NOFOLLOW).toBeUndefined();
  const { readBundleFile } = await import('../../src/server/files.js');
  const { readStateBytes } = await import('../../src/state/io.js');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-nofollow-')));
  writeFileSync(join(dir, 'secret.txt'), 'SECRET-CANARY');
  symlinkSync(join(dir, 'secret.txt'), join(dir, 'snapshot.json'));
  await expect(readStateBytes(dir, 'snapshot.json')).rejects.toThrow('.git/commet/snapshot.json is or sits behind a symlink');
  expect(await readBundleFile(join(dir, 'snapshot.json'))).toBeNull();
  // A plain file still reads.
  expect((await readStateBytes(dir, 'secret.txt'))?.toString()).toBe('SECRET-CANARY');
});
