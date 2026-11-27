// #201 migration golden: a chart.json written before two-level fog (`chart.1`) reads as `chart.2`
// with no clears, so every file it charted is haze (seen), never clear (understood), and the files
// it didn't chart keep their fog. The golden pins the old file, the migrated state, the state as the
// next write saves it, and the fog it gives. Update deliberately with UPDATE_GOLDEN=1 and a
// Golden-Update: reason.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { fileIdOf, fogView, parseChartState } from '../src/core/fog/index.js';
import { AGENT, MATE, Model, YOURS } from './fixtures/fog-model.js';

const GOLDEN = join(import.meta.dirname, 'golden/chart-migration.json');

/** A repo where an agent and a teammate changed files, and a chart.1 file that charted some of them. */
function fixture() {
  const m = new Model();
  m.commit(YOURS, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'lib/d.ts', 'README.md'].map((path) => ({ op: 'add' as const, path })));
  m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }, { op: 'edit', path: 'src/b.ts' }, { op: 'edit', path: 'lib/d.ts' }]);
  m.commit({ who: MATE, cls: 'human' }, [{ op: 'edit', path: 'src/c.ts' }]);
  const charted = m.sha(m.head);
  // Charted after the teammate's change: src/a.ts and src/c.ts. src/b.ts is charted before an agent's later edit.
  m.commit(AGENT, [{ op: 'edit', path: 'src/b.ts' }]);
  const old = canonicalJson({
    schemaVersion: 'chart.1',
    charts: [{ fileId: fileIdOf('src/a.ts'), at: charted }, { fileId: fileIdOf('src/b.ts'), at: charted }, { fileId: fileIdOf('src/c.ts'), at: charted }]
      .sort((x, y) => (x.fileId < y.fileId ? -1 : 1)),
    baselines: [],
  });
  return { m, old };
}

describe('chart.1 → chart.2 migration (#201)', () => {
  it('matches the golden: charted files become haze, never clear; the rest keep their fog', () => {
    const { m, old } = fixture();
    const migrated = parseChartState(old);
    const fog = fogView(m.snapshot(), migrated, m.history());
    const json = canonicalJson({ old: JSON.parse(old) as unknown, migrated, saved: JSON.parse(canonicalJson(migrated)) as unknown, fog });
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('says what the golden says, so the golden can only change on purpose', () => {
    const { m, old } = fixture();
    const migrated = parseChartState(old);
    expect(migrated.schemaVersion).toBe('chart.2');
    expect(migrated.clears).toEqual([]);
    expect(migrated.charts).toEqual(JSON.parse(old).charts);
    const state = (path: string) => fogView(m.snapshot(), migrated, m.history()).files.find((f) => f.fileId === fileIdOf(path))!.state;
    expect(['src/a.ts', 'src/c.ts'].map(state)).toEqual(['haze', 'haze']);
    expect(state('src/b.ts')).toBe('fogged'); // an agent changed it after its chart
    expect(state('lib/d.ts')).toBe('fogged'); // never charted
    expect(state('README.md')).toBe('haze'); // only your own changes: seen
    // Nothing becomes clear without a quiz.
    expect(fogView(m.snapshot(), migrated, m.history()).files.some((f) => f.state === 'clear')).toBe(false);
  });
});
