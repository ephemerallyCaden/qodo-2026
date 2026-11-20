// Path history (#33, shared with #18's layout): renames and births from #16's lineage log, and the
// planet predicates both use.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathHistory, RENAME_LIMIT } from '../src/core/renames.js';
import { isSurfacePath, isTestData, type LineageCommit } from '../src/core/structure.js';

describe('pathHistory', () => {
  const commit = (changes: LineageCommit['changes']): LineageCommit => ({ sha: 'a'.repeat(40), dateMs: 0, changes });

  it('lists renames and births by seq, offset by the first seq', () => {
    const h = pathHistory([
      commit([{ status: 'A', path: 'a.ts' }, { status: 'A', path: 'node_modules/x.js' }]),
      commit([{ status: 'R', from: 'a.ts', path: 'b.ts' }, { status: 'M', path: 'c.ts' }, { status: 'D', path: 'd.ts' }]),
      commit([{ status: 'C', from: 'b.ts', path: 'c2.ts' }, { status: 'R', from: 'vendor/v.js', path: 'v.js' }]),
    ], 10, (p) => p.startsWith('node_modules/') || p.startsWith('vendor/'));
    expect(h).toEqual({ from: 10, to: 12, renames: [{ seq: 11, from: 'a.ts', to: 'b.ts' }],
      births: [{ seq: 10, path: 'a.ts', unsure: false }, { seq: 12, path: 'c2.ts', unsure: true }, { seq: 12, path: 'v.js', unsure: true }] });
  });

  it('marks births unsure where git skips inexact rename detection', () => {
    const big = (adds: number, dels: number) => commit([
      ...Array.from({ length: adds }, (_, i) => ({ status: 'A' as const, path: `n${i}.ts` })),
      ...Array.from({ length: dels }, (_, i) => ({ status: 'D' as const, path: `o${i}.ts` })),
    ]);
    expect(pathHistory([big(RENAME_LIMIT + 1, RENAME_LIMIT)]).births[0]).toEqual({ seq: 0, path: 'n0.ts', unsure: true });
    expect(pathHistory([big(RENAME_LIMIT, RENAME_LIMIT)]).births[0]).toEqual({ seq: 0, path: 'n0.ts', unsure: false });
  });

  it('pins the same rename limit as git.ts', () => {
    const git = readFileSync(join(import.meta.dirname, '../src/scan/git.ts'), 'utf8');
    expect(git).toContain(`'diff.renameLimit=${RENAME_LIMIT}'`);
  });
});

describe('planet predicates', () => {
  it('a surface file is in a top-level folder and is neither a test nor test data', () => {
    const cases: [string, boolean, boolean][] = [
      // path, isTestData, isSurfacePath
      ['src/a.ts', false, true],
      ['docs/guide.md', false, true],
      ['README.md', false, false],
      ['src/a.test.ts', false, false],
      ['test/helpers.ts', false, false],
      ['test/fixtures/data.json', true, false],
      ['tests/golden/out.txt', true, false],
      ['src/__snapshots__/a.snap', true, false],
      ['__fixtures__/x.json', true, false],
      ['src/fixtures/x.json', false, true],
    ];
    for (const [path, data, surface] of cases) expect([path, isTestData(path), isSurfacePath(path)]).toEqual([path, data, surface]);
  });
});
