// Fog of war and chart state, pure logic (#33, R5): unit cases, the planet rule, and the AC 7
// property tests, which run on seeded random histories of a model repo (test/fixtures/fog-model.ts).
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import type { FileFog, FogView } from '../src/core/contract/fog.js';
import {
  applyChartAction, emptyChart, fileIdOf, fogBase, fogView, homes, parseChartAction, parseChartState, reasonsOf, unrowedChanges, type ChartState,
} from '../src/core/fog/index.js';
import { pathHistory, type PathHistory } from '../src/core/renames.js';
import type { Commit, FileId } from '../src/core/snapshot/types.js';
import { AGENT, expectedReasons, MATE, Model, NOT_YOURS, prng, randomOps, SELF, YOURS, type Author, type Rand } from './fixtures/fog-model.js';

const fileAt = (fog: FogView, path: string) => fog.files.find((f) => f.fileId === fileIdOf(path))!;
const fogOf = (m: Model, chart: ChartState, opts: Parameters<Model['snapshot']>[0] = {}) => fogView(m.snapshot(opts), chart, m.history(opts.at));

/** Applies an action at the model's head (or `at`), failing the test on an error result. */
function act(m: Model, chart: ChartState, action: Parameters<typeof applyChartAction>[2], at = m.head): ChartState {
  const r = applyChartAction(fogBase(m.snapshot({ at }), m.history(at)), chart, action);
  if (!r.ok) throw new Error(r.error);
  return r.chart;
}
const chartPath = (m: Model, chart: ChartState, path: string, at = m.head) => act(m, chart, { kind: 'chart', fileId: fileIdOf(path) }, at);

describe('reasons', () => {
  const self = new Set([SELF]);
  const commit = (who: Author): Commit => ({ seq: 0, sha: 'a'.repeat(40), date: '', authorDate: '', author: who.who, subject: '', files: [],
    attribution: { class: who.cls, agentLineShareMilli: 0, sessions: [], evidence: [], tier: 'high', selfCommittedAgentWritten: !!who.flag } });

  it('only a human-class commit by one of selfPersonIds is yours', () => {
    expect(reasonsOf(commit(YOURS), self)).toEqual([]);
    expect(reasonsOf(commit({ who: MATE, cls: 'human' }), self)).toEqual(['teammate']);
    expect(reasonsOf(commit({ who: SELF, cls: 'agent', flag: true }), self)).toEqual(['agent', 'self-committed-agent-written']);
    expect(reasonsOf(commit({ who: SELF, cls: 'mixed' }), self)).toEqual(['mixed']);
    expect(reasonsOf(commit({ who: SELF, cls: 'unknown' }), self)).toEqual(['unknown']);
    // Unknown is never yours, and no self ids means nothing is (Rule 1).
    expect(reasonsOf(commit(YOURS), new Set())).toEqual(['teammate']);
    expect(reasonsOf(undefined, self)).toEqual(['unknown']);
    for (const a of NOT_YOURS) expect(reasonsOf(commit(a), self).sort()).toEqual(expectedReasons(a));
  });
});

describe('fogView', () => {
  it('fogs files with changes you did not write, from the oldest one, and leaves yours clear', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'src/b.ts' }, { op: 'add', path: 'README.md' }]);
    const agentSha = m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit({ who: MATE, cls: 'unknown' }, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/b.ts' }]);
    const fog = fogOf(m, emptyChart());
    expect(fileAt(fog, 'src/a.ts')).toEqual({ fileId: fileIdOf('src/a.ts'), state: 'fogged',
      reasons: ['agent', 'self-committed-agent-written', 'unknown'], since: agentSha });
    expect(fileAt(fog, 'src/b.ts').state).toBe('clear');
    expect(fog.files.map((f) => f.fileId)).toEqual([...fog.files.map((f) => f.fileId)].sort());
    expect(fog).toMatchObject({ schemaVersion: 'fog.1', head: m.sha(m.head), baseline: null, star: { total: 1, fogged: 0 } });
    expect(fog.planets).toEqual([{ dirId: m.snapshot().dirs[0]!.id, total: 2, fogged: 1 }]);
  });

  it('an agent edit before your rename still fogs the renamed file (the lineage, not the path)', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    const agentSha = m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'rename', from: 'src/a.ts', to: 'lib/e.ts', edit: true }]);
    expect(fileAt(fogOf(m, emptyChart()), 'lib/e.ts')).toMatchObject({ state: 'fogged', since: agentSha });
  });

  it('a change the snapshot has no row for (binary then, or a merge listed once per parent) still counts', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    const agentSha = m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'rename', from: 'src/a.ts', to: 'src/b.ts', edit: true }]);
    const snap = m.snapshot();
    snap.commits = snap.commits.map((c) => (c.sha === agentSha ? { ...c, files: [] } : c));
    const history = { ...m.history(), unrowed: unrowedChanges(snap, m.lineage(), 0) };
    expect(history.unrowed).toEqual([{ seq: 1, path: 'src/a.ts' }]);
    expect(fileAt(fogView(snap, emptyChart(), history), 'src/b.ts')).toEqual({ fileId: fileIdOf('src/b.ts'), state: 'fogged',
      reasons: ['agent', 'self-committed-agent-written'], since: agentSha });
  });

  it('a pure rename or a mode change by anyone is not a change to the content', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'src/b.ts' }]);
    m.commit(AGENT, [{ op: 'rename', from: 'src/a.ts', to: 'src/x/c.ts' }, { op: 'chmod', path: 'src/b.ts' }]);
    const fog = fogOf(m, emptyChart());
    expect(fileAt(fog, 'src/x/c.ts').state).toBe('clear');
    expect(fileAt(fog, 'src/b.ts').state).toBe('clear');
  });

  it('a chart covers changes up to its commit; a later one you did not write refogs the whole file', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    let chart = chartPath(m, emptyChart(), 'src/a.ts');
    expect(chart.charts).toEqual([{ fileId: fileIdOf('src/a.ts'), at: m.sha(1) }]);
    expect(fileAt(fogOf(m, chart), 'src/a.ts')).toEqual({ fileId: fileIdOf('src/a.ts'), state: 'charted', reasons: [], since: null });
    const mate = m.commit({ who: MATE, cls: 'human' }, [{ op: 'edit', path: 'src/a.ts' }]);
    expect(fileAt(fogOf(m, chart), 'src/a.ts')).toMatchObject({ state: 'fogged', reasons: ['teammate'], since: mate });
    chart = chartPath(m, chart, 'src/a.ts');
    // The new chart covers the old one, which is dropped.
    expect(chart.charts).toEqual([{ fileId: fileIdOf('src/a.ts'), at: mate }]);
    expect(fileAt(fogOf(m, chart), 'src/a.ts').state).toBe('charted');
  });

  it('a chart follows its file through a rename, not its old path', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    const chart = chartPath(m, emptyChart(), 'src/a.ts');
    m.commit(YOURS, [{ op: 'rename', from: 'src/a.ts', to: 'src/b.ts', edit: true }]);
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    const fog = fogOf(m, chart);
    expect(fileAt(fog, 'src/b.ts').state).toBe('charted');
    // The new file at the old path was born after the chart, so the chart says nothing about it.
    expect(fileAt(fog, 'src/a.ts')).toMatchObject({ state: 'fogged', since: m.sha(4) });
  });

  it('a chart before the window, or at a commit off HEAD\'s line, reviews nothing in the window', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    const old = chartPath(m, emptyChart(), 'src/a.ts', 1);
    expect(fileAt(fogOf(m, old, { from: 2 }), 'src/a.ts')).toMatchObject({ state: 'fogged', since: m.sha(2) });
    const elsewhere: ChartState = { ...emptyChart(), charts: [{ fileId: fileIdOf('src/a.ts'), at: 'b'.repeat(40) }], baselines: ['c'.repeat(40)] };
    const fog = fogOf(m, elsewhere);
    expect(fileAt(fog, 'src/a.ts')).toMatchObject({ state: 'fogged', since: m.sha(1) });
    expect(fog.baseline).toBeNull();
  });

  it('a window commit the snapshot has no attribution for is never yours', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
    // Its SHA isn't known either, so the fog points at the commit after it.
    expect(fileAt(fogOf(m, emptyChart(), { holes: new Set([1]) }), 'src/a.ts')).toMatchObject({ state: 'fogged', reasons: ['lineage-unknown'], since: m.sha(2) });
  });

  it('baseline charts every change up to its commit; files born later are not covered', () => {
    const m = new Model();
    m.commit(AGENT, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'g.ts' }]);
    let chart = act(m, emptyChart(), { kind: 'baseline' });
    m.commit(AGENT, [{ op: 'add', path: 'src/b.ts' }]);
    let fog = fogOf(m, chart);
    expect(fog.baseline).toBe(m.sha(0));
    expect(fileAt(fog, 'src/a.ts').state).toBe('charted');
    expect(fileAt(fog, 'g.ts').state).toBe('charted');
    expect(fileAt(fog, 'src/b.ts')).toMatchObject({ state: 'fogged', since: m.sha(1) });
    chart = act(m, chart, { kind: 'baseline' });
    fog = fogOf(m, chart);
    expect(fog.baseline).toBe(m.sha(1));
    expect(fog.files.every((f) => f.state === 'charted')).toBe(true);
    chart = act(m, chart, { kind: 'baseline-undo' });
    expect(fogOf(m, chart).baseline).toBe(m.sha(0));
    chart = act(m, chart, { kind: 'baseline-undo' });
    expect(applyChartAction(fogBase(m.snapshot(), m.history()), chart, { kind: 'baseline-undo' })).toEqual({ ok: false, error: 'no baseline to undo' });
  });

  it('refuses to chart a file that is not in the snapshot', () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }]);
    expect(applyChartAction(fogBase(m.snapshot(), m.history()), emptyChart(), { kind: 'chart', fileId: fileIdOf('src/zz.ts') }))
      .toEqual({ ok: false, error: 'no such file in the latest snapshot' });
  });
});

describe('lineage-unknown: where a change can\'t be tied to a file for certain, it errs to fog', () => {
  const base = () => {
    const m = new Model();
    m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'src/b.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
    return m;
  };

  it('without lineage, every file changed since its chart is fogged; untouched files stay clear', () => {
    const m = base();
    const snap = m.snapshot();
    let fog = fogView(snap, emptyChart(), null);
    expect(fileAt(fog, 'src/a.ts')).toMatchObject({ state: 'fogged', reasons: ['lineage-unknown'], since: m.sha(0) });
    m.commit(YOURS, [{ op: 'add', path: 'g.ts' }]);
    const chart = chartPath(m, emptyChart(), 'src/a.ts', 1);
    fog = fogView(m.snapshot(), chart, null);
    expect(fileAt(fog, 'src/a.ts').state).not.toBe('fogged');
    expect(fileAt(fog, 'g.ts')).toMatchObject({ state: 'fogged', reasons: ['lineage-unknown'], since: m.sha(2) });
  });

  it('history that does not cover the window, or ends at another head, counts as none', () => {
    const m = base();
    const short: PathHistory = pathHistory(m.lineage().slice(1), 1);
    expect(fileAt(fogView(m.snapshot(), emptyChart(), short), 'src/b.ts').reasons).toEqual(['lineage-unknown']);
    expect(fileAt(fogView(m.snapshot(), emptyChart(), m.history(0)), 'src/a.ts').reasons).toEqual(['lineage-unknown']);
    expect(fileAt(fogView(m.snapshot({ from: 1 }), emptyChart(), short), 'src/a.ts').state).toBe('clear');
  });

  it('a gap in the window fogs every file it may have touched', () => {
    const m = base();
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'add', path: 'g.ts' }]);
    for (const history of [m.history(), null]) {
      // src/b.ts has no visible change in the window (from seq 1); only the gap at seq 2 can hide one.
      expect(fileAt(fogView(m.snapshot({ from: 1 }), emptyChart(), history), 'src/b.ts').state).toBe('clear');
      const fog = fogView(m.snapshot({ from: 1, holes: new Set([2]) }), emptyChart(), history);
      expect(fileAt(fog, 'src/b.ts')).toEqual({ fileId: fileIdOf('src/b.ts'), state: 'fogged', reasons: ['lineage-unknown'], since: m.sha(3) });
      // A file born after the gap can't have been touched by it, when its birth is known.
      expect(fileAt(fog, 'g.ts').state).toBe(history ? 'clear' : 'fogged');
    }
  });

  it('an unsure birth (a copy, a rename out of an excluded path, or too big for rename detection) fogs', () => {
    const m = base();
    m.commit(YOURS, [{ op: 'add', path: 'g.ts' }]);
    const history = m.history();
    const unsure = { ...history, births: history.births.map((b) => (b.path === 'g.ts' ? { ...b, unsure: true } : b)) };
    expect(fileAt(fogView(m.snapshot(), emptyChart(), history), 'g.ts').state).toBe('clear');
    expect(fileAt(fogView(m.snapshot(), emptyChart(), unsure), 'g.ts')).toMatchObject({ state: 'fogged', reasons: ['lineage-unknown'], since: m.sha(2) });
  });
});

describe('planets (the rule #18 layout must match)', () => {
  const m = new Model();
  m.commit(YOURS, ['src/a.ts', 'src/x/c.ts', 'README.md', 'test/a.test.ts', 'test/fixtures/data.json', 'test/golden/g.json',
    'src/__snapshots__/s.snap', 'e2e/run.test.ts', 'test/root.test.ts', 'test/dir.test.ts', 'test/lonely.test.ts', 'docs/guide.md',
  ].map((path) => ({ op: 'add', path })));
  const snap = m.snapshot();
  const isTest = (p: string) => p.includes('.test.');
  const dirId = (p: string) => snap.dirs.find((d) => d.path === p)!.id;
  snap.files = snap.files.map((f) => ({ ...f, isTest: isTest(f.path),
    testOf: f.path === 'test/a.test.ts' ? fileIdOf('src/a.ts') : f.path === 'test/root.test.ts' ? fileIdOf('README.md')
      : f.path === 'test/dir.test.ts' ? dirId('src') : null }));
  const home = homes(snap);
  const at = (p: string) => home.get(fileIdOf(p));

  it('places surface files, moons and star files', () => {
    expect(at('src/a.ts')).toBe(dirId('src'));
    expect(at('src/x/c.ts')).toBe(dirId('src'));
    expect(at('docs/guide.md')).toBe(dirId('docs'));
    expect(at('test/a.test.ts')).toBe(dirId('src'));
    expect(at('test/dir.test.ts')).toBe(dirId('src'));
    for (const p of ['README.md', 'test/root.test.ts', 'test/lonely.test.ts', 'e2e/run.test.ts', 'test/fixtures/data.json',
      'test/golden/g.json', 'src/__snapshots__/s.snap']) expect([p, at(p)]).toEqual([p, null]);
  });

  it('test/ and a test-only folder are never planets, and the counts cover every file once', () => {
    const fog = fogView(snap, emptyChart(), m.history());
    expect(fog.planets.map((p) => p.dirId)).toEqual([dirId('docs'), dirId('src')].sort());
    expect(fog.star.total + fog.planets.reduce((n, p) => n + p.total, 0)).toBe(snap.files.length);
    expect(fog.star.total).toBe(7);
  });
});

describe('chart state on disk', () => {
  const sha = 'a'.repeat(40);
  const good: ChartState = { schemaVersion: 'chart.1', charts: [{ fileId: 'f_000000000001', at: sha }, { fileId: 'f_000000000002', at: sha }], baselines: [sha] };

  it('round-trips through canonical JSON', () => {
    expect(parseChartState(canonicalJson(good))).toEqual(good);
    expect(parseChartState(canonicalJson(emptyChart()))).toEqual(emptyChart());
  });

  it('refuses anything but ids and SHAs in the exact shape', () => {
    const bad = [
      '{', '[]', JSON.stringify({ ...good, schemaVersion: 'chart.2' }), JSON.stringify({ ...good, extra: 1 }),
      JSON.stringify({ ...good, charts: [{ fileId: 'src/a.ts', at: sha }] }),
      JSON.stringify({ ...good, charts: [{ fileId: 'f_000000000001', at: sha, path: 'src/a.ts' }] }),
      JSON.stringify({ ...good, charts: [...good.charts].reverse() }),
      JSON.stringify({ ...good, charts: [good.charts[0], good.charts[0]] }),
      JSON.stringify({ ...good, baselines: ['2026-11-10T00:00:00Z'] }),
    ];
    for (const text of bad) expect(() => parseChartState(text), text).toThrow();
  });

  it('accepts exactly one ChartAction', () => {
    expect(parseChartAction({ kind: 'chart', fileId: 'f_000000000001' })).toEqual({ kind: 'chart', fileId: 'f_000000000001' });
    expect(parseChartAction({ kind: 'baseline' })).toEqual({ kind: 'baseline' });
    expect(parseChartAction({ kind: 'baseline-undo' })).toEqual({ kind: 'baseline-undo' });
    for (const body of [null, [], 'baseline', { kind: 'chart' }, { kind: 'chart', fileId: '../x' }, { kind: 'baseline', all: true },
      { kind: 'clear' }, { kind: 'chart', fileId: 'f_000000000001', at: sha }]) expect(parseChartAction(body)).toBeNull();
  });
});

// ---- AC 7 property tests ----

/** A random history of `n` commits, with chart actions taken at random heads on the way. */
function randomRun(r: Rand, n: number) {
  const m = new Model();
  let chart = emptyChart();
  const charted: { uid: number; seq: number }[] = [];
  const baselines: number[] = [];
  const authors = [YOURS, YOURS, YOURS, ...NOT_YOURS];
  m.commit(r.pick(authors), [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'lib/e.ts' }]);
  for (let k = 1; k < n; k++) {
    m.commit(r.pick(authors), randomOps(m, r));
    const roll = r.next();
    if (roll < 0.35 && m.live().size > 0) {
      const [path, uid] = r.pick([...m.live()]);
      chart = chartPath(m, chart, path);
      // A new chart replaces the file's older ones (applyChartAction drops what it covers).
      charted.splice(0, charted.length, ...charted.filter((c) => c.uid !== uid), { uid, seq: m.head });
    } else if (roll < 0.45) {
      chart = act(m, chart, { kind: 'baseline' });
      baselines.push(m.head);
    } else if (roll < 0.5 && baselines.length > 0) {
      chart = act(m, chart, { kind: 'baseline-undo' });
      baselines.pop();
    }
  }
  return { m, chart, charted, baselines };
}

/** The fog from file identities alone (no paths, no lineage): what fogView must agree with. */
function oracle(run: ReturnType<typeof randomRun>, from: number, holes: ReadonlySet<number>) {
  const { m, charted, baselines } = run;
  // Gaps can't be the window's ends; a chart or baseline is only placeable at a commit the snapshot has.
  const gap = (seq: number) => holes.has(seq) && seq !== from && seq !== m.head;
  const placeable = (seq: number) => seq >= from && !gap(seq);
  const baseSeq = Math.max(-1, ...baselines.filter(placeable));
  const nextKnown = (seq: number) => {
    while (gap(seq)) seq++;
    return seq;
  };
  const files = new Map<FileId, FileFog>();
  for (const [path, uid] of m.live()) {
    const through = Math.max(baseSeq, ...charted.filter((c) => c.uid === uid && placeable(c.seq)).map((c) => c.seq));
    let notYours = false;
    let since = Infinity;
    const why = new Set<string>();
    const fog = (seq: number, reasons: string[]) => {
      notYours = true;
      if (seq <= through) return;
      reasons.forEach((x) => why.add(x));
      since = Math.min(since, seq);
    };
    for (const t of m.touches.get(uid) ?? []) {
      const reasons = expectedReasons(t.author);
      if (t.seq >= from && !gap(t.seq) && t.content && reasons.length > 0) fog(t.seq, reasons);
    }
    // A gap hides what it changed from every file alive just after it.
    for (let seq = from; seq <= m.head; seq++) if (gap(seq) && [...m.live(seq).values()].includes(uid)) fog(seq, ['lineage-unknown']);
    const id = fileIdOf(path);
    files.set(id, why.size ? { fileId: id, state: 'fogged', reasons: [...why].sort() as FileFog['reasons'], since: m.sha(nextKnown(since)) }
      : { fileId: id, state: notYours ? 'charted' : 'clear', reasons: [], since: null });
  }
  return { files, baseline: baseSeq < 0 ? null : m.sha(baseSeq) };
}

const RUNS = 400;

describe('property tests (AC 7, seeded)', () => {
  it('fog matches an oracle that follows file identity through renames, deletes and re-adds', () => {
    const r = prng(0xf06);
    let fogged = 0;
    let charted = 0;
    for (let k = 0; k < RUNS; k++) {
      const run = randomRun(r, 2 + r.int(24));
      const from = r.int(Math.max(1, run.m.head));
      const holes = new Set(Array.from({ length: r.int(3) }, () => r.int(run.m.head + 1)));
      const fog = fogOf(run.m, run.chart, { from, holes });
      const want = oracle(run, from, holes);
      expect(fog.baseline).toBe(want.baseline);
      expect(fog.files.length).toBe(want.files.size);
      for (const f of fog.files) expect(f, `run ${k}`).toEqual(want.files.get(f.fileId));
      expect(fog.star.total + fog.planets.reduce((n, p) => n + p.total, 0)).toBe(fog.files.length);
      fogged += fog.files.filter((f) => f.state === 'fogged').length;
      charted += fog.files.filter((f) => f.state === 'charted').length;
    }
    // Guards against a vacuous pass.
    expect(fogged).toBeGreaterThan(200);
    expect(charted).toBeGreaterThan(200);
  });

  it('your own human commit never fogs a file', () => {
    const r = prng(0x5e1f);
    for (let k = 0; k < RUNS; k++) {
      const { m, chart } = randomRun(r, 1 + r.int(20));
      const before = fogOf(m, chart);
      const byUid = new Map([...m.live()].map(([path, uid]) => [uid, fileAt(before, path)]));
      m.commit(YOURS, randomOps(m, r));
      const after = fogOf(m, chart);
      for (const [path, uid] of m.live()) {
        const was = byUid.get(uid);
        const now = fileAt(after, path);
        if (was) expect({ ...now, fileId: was.fileId }, `run ${k}`).toEqual(was);
        else expect(now.state).toBe('clear');
      }
    }
  });

  it('any change that isn\'t yours fogs a charted file', () => {
    const r = prng(0xa6e);
    for (let k = 0; k < RUNS; k++) {
      const run = randomRun(r, 1 + r.int(20));
      const { m } = run;
      if (m.live().size === 0) continue;
      const [path, uid] = r.pick([...m.live()]);
      const chart = r.next() < 0.5 ? chartPath(m, run.chart, path) : act(m, run.chart, { kind: 'baseline' });
      expect(fileAt(fogOf(m, chart), path).state).not.toBe('fogged');
      const author = r.pick(NOT_YOURS);
      const sha = m.commit(author, [r.next() < 0.5 ? { op: 'edit', path } : { op: 'rename', from: path, to: `mv/p2-${k}.ts`, edit: true }]);
      const now = [...m.live()].find(([, u]) => u === uid)![0];
      expect(fileAt(fogOf(m, chart), now), `run ${k}`).toMatchObject({ state: 'fogged', reasons: expectedReasons(author), since: sha });
    }
  });

  it('baseline followed by undo leaves state unchanged', () => {
    const r = prng(0xba5e);
    for (let k = 0; k < RUNS; k++) {
      const { m, chart } = randomRun(r, 1 + r.int(20));
      const undone = act(m, act(m, chart, { kind: 'baseline' }), { kind: 'baseline-undo' });
      expect(canonicalJson(undone)).toBe(canonicalJson(chart));
      expect(fogOf(m, undone)).toEqual(fogOf(m, chart));
    }
  });

  it('chart state survives a re-scan', () => {
    const r = prng(0x5ca9);
    for (let k = 0; k < RUNS; k++) {
      const run = randomRun(r, 2 + r.int(20));
      const { m, chart } = run;
      // What a new scan sees: the state as written to disk, a later head, a fresh snapshot.
      const stored = parseChartState(canonicalJson(chart));
      expect(stored).toEqual(chart);
      const before = fogOf(m, stored);
      for (let j = r.int(3); j > 0; j--) m.commit(YOURS, randomOps(m, r, ['edit', 'chmod', 'add']));
      const after = fogOf(m, parseChartState(canonicalJson(chart)));
      for (const f of before.files) {
        const now = after.files.find((g) => g.fileId === f.fileId);
        if (now) expect(now.state === 'fogged', `run ${k}`).toBe(f.state === 'fogged');
      }
      const want = oracle(run, 0, new Set());
      for (const f of after.files) expect(f, `run ${k}`).toEqual(want.files.get(f.fileId));
    }
  });

  it('a rename keeps charted state', () => {
    const r = prng(0x4e4a);
    let renamed = 0;
    for (let k = 0; k < RUNS; k++) {
      const run = randomRun(r, 1 + r.int(20));
      const { m } = run;
      const live = [...m.live()];
      if (live.length === 0) continue;
      const [path, uid] = r.pick(live);
      const chart = chartPath(m, run.chart, path);
      const was = fileAt(fogOf(m, chart), path).state;
      // Yours (pure or edited), or a pure rename by anyone; then possibly again.
      for (let hops = 1 + r.int(2); hops > 0; hops--) {
        const cur = [...m.live()].find(([, u]) => u === uid)![0];
        const to = `mv/p5-${k}-${hops}.ts`;
        const pure = r.next() < 0.5;
        m.commit(pure ? r.pick([YOURS, ...NOT_YOURS]) : YOURS, [{ op: 'rename', from: cur, to, edit: !pure }]);
        renamed++;
      }
      const now = [...m.live()].find(([, u]) => u === uid)![0];
      expect(fileAt(fogOf(m, chart), now).state, `run ${k}`).toBe(was);
      expect(was).not.toBe('fogged');
    }
    expect(renamed).toBeGreaterThan(RUNS);
  });
});
