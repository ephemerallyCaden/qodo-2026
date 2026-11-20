// A file whose fixtures make temp dirs and whose last test fails: its dirs must still go (#53).
// Lists what it made in the file COMMET_TEMP_CASE_OUT names, for test/temp-cleanup.test.ts.
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, it } from 'vitest';
import { miniClaude, miniRepo } from '../mini.js';
import { tempDir } from '../tmp.js';

it('makes a repo, transcripts and a bare temp dir', () => {
  const repo = miniRepo([{ id: 'a', at: '2026-10-10T10:00:00Z', path: 'a.ts', lines: ['export const a = 1;'] }]);
  writeFileSync(process.env['COMMET_TEMP_CASE_OUT']!, [repo.dir, dirname(miniClaude({})), tempDir('commet-temp-case-')].join('\n'));
});

it('then fails', () => {
  expect('this case').toBe('failing on purpose');
});
