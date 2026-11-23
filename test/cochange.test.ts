// Co-change constellations (#211, R9): the pair counting (Jaccard), the threshold, the shared-commit
// floor and the per-file cap on hand-computed histories; bulk commits; determinism; the missing-pair
// flag's lifecycle (raised by a partner's latest change, cleared by a later change or a chart); and the
// view the server serves. The scan's own wiring on a real fixture repo is test/cochange-scan.test.ts.
import { describe, expect, it } from 'vitest';
import { coChange, coChangeOf, coChangeProblem, coChangeView, type TouchSet } from '../src/core/cochange.js';
import { canonicalJson } from '../src/core/canonical-json.js';
import { COCHANGE, strengthStep } from '../src/core/contract/cochange.js';
import { emptyChart, fileIdOf, fogBase, type ChartState } from '../src/core/fog/index.js';
import type { FileId } from '../src/core/snapshot/types.js';
import { Model, YOURS } from './fixtures/fog-model.js';

/** Sorted ids for n files: f_000000000000, f_000000000001, … */
const ids = (n: number): FileId[] => Array.from({ length: n }, (_, i) => `f_${String(i).padStart(12, '0')}` as FileId);
const sha = (seq: number) => seq.toString(16).padStart(40, '0');
/** Commit k touches the files listed at k. */
const history = (lists: number[][]): TouchSet[] => lists.map((files, seq) => ({ seq, sha: sha(seq), files: [...files].sort((a, b) => a - b) }));
const times = (n: number, files: number[]) => Array.from({ length: n }, () => files);

describe('coChange: the pairs', () => {
  it('scores a pair by Jaccard: commits with both over commits with either, ×1000 and floored', () => {
    const r = coChange(ids(3), history([[0, 1], [0, 1], [0], [1, 2], [1, 2], [2]]));
    // a,b: 2 together, a in 3, b in 4 → 2 / 5. b,c: 2 together, b in 4, c in 3 → 2 / 5. a,c never together.
    expect(r.pairs).toEqual([
      { a: ids(3)[0], b: ids(3)[1], both: 2, strengthMilli: 400 },
      { a: ids(3)[1], b: ids(3)[2], both: 2, strengthMilli: 400 },
    ]);
    expect(r.commits).toBe(6);
    expect(r.settings).toEqual(COCHANGE);
  });

  it('keeps a pair at exactly the threshold (0.15) and drops one just under it', () => {
    // f0 in 20 commits, f1 in 3 of them: 3 / 20 = 150. f2 in 21, f3 in 3 of them: 3 / 21 = 142.
    const r = coChange(ids(4), history([...times(3, [0, 1]), ...times(17, [0]), ...times(3, [2, 3]), ...times(18, [2])]));
    expect(r.pairs.map((p) => [p.a, p.b, p.strengthMilli])).toEqual([[ids(4)[0], ids(4)[1], 150]]);
  });

  it('needs two shared commits: one commit together is no evidence that they usually do', () => {
    expect(coChange(ids(2), history([[0, 1]])).pairs).toEqual([]);
    expect(coChange(ids(2), history([[0, 1], [0, 1]])).pairs).toEqual([{ a: ids(2)[0], b: ids(2)[1], both: 2, strengthMilli: 1000 }]);
  });

  it('keeps a pair only among the 5 strongest of at least one of its files', () => {
    // 7 files that always change together: 21 pairs at 1000, ranked by id. Every file has room for 5;
    // a pair stays while either file has room, so only the last pair (f5, f6) finds both full.
    const r = coChange(ids(7), history(times(2, [0, 1, 2, 3, 4, 5, 6])));
    expect(r.pairs).toHaveLength(20);
    expect(r.pairs.some((p) => p.a === ids(7)[5] && p.b === ids(7)[6])).toBe(false);
  });

  it("keeps a weak file's strongest partner even when that partner's own 5 are all stronger", () => {
    // f0's 5 strongest are f1..f5 (4 of 6 commits each, 666); f6 shares 2 of f0's 6 (333), its only pair.
    const r = coChange(ids(7), history([...times(4, [0, 1, 2, 3, 4, 5]), ...times(2, [0, 6])]));
    const six = r.pairs.filter((p) => p.b === ids(7)[6]);
    expect(six).toEqual([{ a: ids(7)[0], b: ids(7)[6], both: 2, strengthMilli: 333 }]);
  });

  it('leaves commits over 200 files out of the counting, and counts them', () => {
    const big = Array.from({ length: COCHANGE.bulkFiles + 1 }, (_, i) => i);
    const r = coChange(ids(COCHANGE.bulkFiles + 1), history([big, big, big, [0, 1], [0, 1]]));
    expect([r.commits, r.bulkCommits]).toEqual([2, 3]);
    expect(r.pairs).toEqual([{ a: ids(2)[0], b: ids(2)[1], both: 2, strengthMilli: 1000 }]);
  });

  it('is the same for the same history in any commit order', () => {
    const lists = [[0, 1, 2], [0, 1], [1, 3], [0, 2, 3], [2, 3], [0, 1, 3], [1, 2], [0, 3]];
    const a = coChange(ids(4), history(lists));
    const shuffled = history(lists).reverse();
    expect(canonicalJson(coChange(ids(4), shuffled))).toBe(canonicalJson(a));
  });

  it('steps strengths as weak from 0.15, mid from 0.30 and strong from 0.50', () => {
    expect([150, 299, 300, 499, 500, 1000].map(strengthStep)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('coChange: missing-pair flags (recent changes only)', () => {
  // f0 = x, f1 = y, f2 = z; the last file is a filler that changes alone, to age the history past the window.
  const [x, y, z] = ids(4);
  const FILL = 3;
  /** n commits touching only the filler. */
  const quiet = (n: number) => times(n, [FILL]);
  const flags = (lists: number[][]) => coChange(ids(4), history(lists)).missing;

  it("flags a file whose strong partner changed in the last 10 commits when it didn't, at that change", () => {
    // x,y together 3 times, then quiet, then x alone at HEAD: 3 / 4 = 750, 3 shared commits.
    expect(flags([...times(3, [0, 1]), ...quiet(10), [0]])).toEqual([{ fileId: y, with: x, strengthMilli: 750, at: sha(13) }]);
  });

  it("counts an older skip as settled: the partner's change is past the last 10 commits", () => {
    expect(flags([...times(3, [0, 1]), [0], ...quiet(10)])).toEqual([]);
    expect(flags([...times(3, [0, 1]), [0], ...quiet(9)])).toEqual([{ fileId: y, with: x, strengthMilli: 750, at: sha(3) }]); // 10th from HEAD: still in
  });

  it('needs 3 shared commits: a strong pair from 2 is kept as a pair but raises no flag', () => {
    const r = coChange(ids(4), history([...times(2, [0, 1]), ...quiet(10), [0]]));
    expect(r.pairs.find((p) => p.a === x && p.b === y)).toMatchObject({ both: 2, strengthMilli: 666 });
    expect(r.missing).toEqual([]);
  });

  it('raises nothing when the file changed in the window too, before or after its partner', () => {
    expect(flags([...times(3, [0, 1]), ...quiet(10), [1], [0]])).toEqual([]);
    expect(flags([...times(3, [0, 1]), ...quiet(10), [0], [1]])).toEqual([]);
  });

  it('is cleared by a bulk commit in the window too, which is still a change to the file', () => {
    const big = Array.from({ length: COCHANGE.bulkFiles + 1 }, (_, i) => i);
    const r = coChange(ids(COCHANGE.bulkFiles + 1), history([...times(3, [0, 1]), ...times(10, [5]), [0], big.filter((i) => i !== 0)]));
    expect(r.missing.map((m) => m.fileId)).not.toContain(y);
  });

  it('needs a strong partner (0.50): a mid one left out raises nothing', () => {
    // x,y together 3 of 7 → 428.
    expect(flags([...times(3, [0, 1]), ...times(3, [0]), ...quiet(10), [0]])).toEqual([]);
  });

  it('raises one flag per file, for its strongest partner left out', () => {
    // z with x: 3 of 4 (750); with y: 3 of 5 (600). Then x and y change in the window, z doesn't.
    const r = coChange(ids(4), history([...times(3, [0, 1, 2]), [1], ...quiet(10), [0, 1]]));
    expect(r.missing).toEqual([{ fileId: z, with: x, strengthMilli: 750, at: sha(14) }]);
  });

  it('records its window and shared-commit floor with the other settings', () => {
    expect(coChange(ids(2), []).settings).toMatchObject({ minBoth: 2, flagMinBoth: 3, flagWindow: 10, flagMilli: 500 });
  });
});

describe('coChange: the counting itself', () => {
  /** The plain definition, for comparison: every pair of every non-bulk commit counted in one map. */
  function reference(n: number, commits: TouchSet[]) {
    const seen = new Array<number>(n).fill(0), both = new Map<string, number>();
    for (const c of commits) {
      if (c.files.length > COCHANGE.bulkFiles) continue;
      for (const i of c.files) seen[i]!++;
      for (const i of c.files) for (const j of c.files) if (i < j) both.set(`${i},${j}`, (both.get(`${i},${j}`) ?? 0) + 1);
    }
    return [...both].filter(([, k]) => k >= COCHANGE.minBoth).map(([key, k]) => {
      const [i, j] = key.split(',').map(Number) as [number, number];
      return { i, j, both: k, strengthMilli: Math.floor((k * 1000) / (seen[i]! + seen[j]! - k)) };
    }).filter((p) => p.strengthMilli >= COCHANGE.thresholdMilli);
  }

  it('finds exactly the pairs of the plain definition, on seeded random histories (PR #214 r1, Qodo 8b2e5a20)', () => {
    let seed = 211;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let round = 0; round < 20; round++) {
      const n = 4 + Math.floor(rnd() * 30);
      const lists = Array.from({ length: 5 + Math.floor(rnd() * 60) }, () => [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => Math.floor(rnd() * n)))]);
      const r = coChange(ids(n), history(lists), { settings: { ...COCHANGE, cap: n } }); // no cap: every pair above the floors
      const want = reference(n, history(lists)).map((p) => ({ a: ids(n)[p.i], b: ids(n)[p.j], both: p.both, strengthMilli: p.strengthMilli }))
        .sort((x, y) => (x.a! < y.a! ? -1 : x.a! > y.a! ? 1 : x.b! < y.b! ? -1 : 1));
      expect(r.pairs, `round ${round}`).toEqual(want);
    }
  });
});

describe('coChangeOf: from the fog base', () => {
  it('follows a rename to the file at HEAD and counts only content changes', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'web/b.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }, { op: 'edit', path: 'web/b.ts' }]);
    m.commit(YOURS, [{ op: 'rename', from: 'web/b.ts', to: 'web/c.ts' }]); // a pure rename: no change
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }, { op: 'edit', path: 'web/c.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
    const cc = coChangeOf(fogBase(m.snapshot(), m.history()));
    const [a, c] = [fileIdOf('src/a.ts'), fileIdOf('web/c.ts')].sort();
    expect(cc.commits).toBe(4);
    // a in 4, c (b before the rename) in 3, together 3: 3 / 4.
    expect(cc.pairs).toEqual([{ a, b: c, both: 3, strengthMilli: 750 }]);
    expect(cc.missing).toEqual([]); // c changed in the last 10 commits: nothing to flag
  });
});

describe('coChangeView: what the server serves', () => {
  const m = new Model();
  m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'web/b.ts' }, { op: 'add', path: 'README.md' }]);
  for (let k = 0; k < 2; k++) m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }, { op: 'edit', path: 'web/b.ts' }]);
  for (let k = 0; k < 10; k++) m.commit(YOURS, [{ op: 'edit', path: 'README.md' }]); // seqs 3..12
  const RAISED = 13;
  m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]); // seq 13 leaves web/b.ts out, which last changed at seq 2
  m.commit(YOURS, [{ op: 'edit', path: 'README.md' }]);
  const snapshot = m.snapshot();
  const base = (s = snapshot) => fogBase(s, m.history());
  snapshot.cochange = coChangeOf(base());
  const [A, B] = [fileIdOf('src/a.ts'), fileIdOf('web/b.ts')];
  const chart = (...entries: [FileId, number][]): ChartState => ({ ...emptyChart(), charts: entries.map(([fileId, seq]) => ({ fileId, at: m.sha(seq) })) });

  it('serves the links, the standing flags and the files they name, with their paths and homes', () => {
    const v = coChangeView(base(), emptyChart());
    expect(v).toMatchObject({ schemaVersion: 'cochange.1', head: snapshot.repo.head, needsRescan: false, dismissed: 0 });
    expect(v.flags).toEqual([{ fileId: B, with: A, strengthMilli: 750, at: m.sha(RAISED) }]);
    expect(v.files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'web/b.ts']);
    expect(v.files.every((f) => f.home !== 'star')).toBe(true);
  });

  it('takes a flag out once its file is charted at or after the change that raised it, and counts it', () => {
    expect(coChangeView(base(), chart([B, RAISED - 1])).flags).toHaveLength(1); // charted before: still stands
    expect(coChangeView(base(), chart([A, RAISED + 1])).flags).toHaveLength(1); // the partner charted: not this file
    for (const seq of [RAISED, RAISED + 1]) expect(coChangeView(base(), chart([B, seq]))).toMatchObject({ flags: [], dismissed: 1 });
    expect(coChangeView(base(), { ...emptyChart(), baselines: [m.sha(RAISED + 1)] })).toMatchObject({ flags: [], dismissed: 1 });
  });

  it('says rescan for a snapshot from before #211', () => {
    const old = { ...snapshot };
    delete old.cochange;
    expect(coChangeView(base(old), emptyChart())).toMatchObject({ needsRescan: true, links: [], flags: [], files: [] });
  });

  it('refuses a damaged record without quoting it', () => {
    expect(coChangeProblem(snapshot.cochange, base())).toBeNull();
    const cc = snapshot.cochange!;
    for (const bad of [null, 'x', { ...cc, pairs: 'no' }, { ...cc, commits: -1 },
      { ...cc, pairs: [{ ...cc.pairs[0]!, a: 'f_ffffffffffff' }] }, { ...cc, pairs: [{ ...cc.pairs[0]!, strengthMilli: 1001 }] },
      { ...cc, pairs: [cc.pairs[0], cc.pairs[0]] }, { ...cc, missing: [{ ...cc.missing[0]!, at: 'e'.repeat(40) }] },
      // PR #214 r1 (Qodo 344af9c7): settings and counts that contradict the record are damage too
      { ...cc, settings: undefined }, { ...cc, settings: { ...cc.settings, cap: 'x' } },
      { ...cc, pairs: [{ ...cc.pairs[0]!, both: cc.commits + 1 }] }, { ...cc, pairs: [{ ...cc.pairs[0]!, both: 1 }] },
      { ...cc, pairs: [{ ...cc.pairs[0]!, strengthMilli: cc.settings.thresholdMilli - 1 }] },
      { ...cc, missing: [{ ...cc.missing[0]!, strengthMilli: cc.settings.flagMilli - 1 }] },
      { ...cc, missing: [{ ...cc.missing[0]!, strengthMilli: 999 }] }, { ...cc, pairs: [] }]) {
      expect(coChangeProblem(bad, base()), JSON.stringify(bad)).toMatch(/^(co-change|missing-pair)/);
    }
  });
});
