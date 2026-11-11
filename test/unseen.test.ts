// #75: where a file's unseen diff starts, and which files a planet has unseen. Pure, on the fog
// model repo: the range comes from the fog's own seqs, so a window gap is inside it (Rule 1).
import { describe, expect, it } from 'vitest';
import { applyChartAction, emptyChart, fileIdOf, fogBase, fogFrom, unseenFiles, unseenRange, type ChartState } from '../src/core/fog/index.js';
import { AGENT, Model, YOURS } from './fixtures/fog-model.js';

/** Two files of yours, then one more commit of yours. */
function base(): Model {
  const m = new Model();
  m.commit(YOURS, [{ op: 'add', path: 'src/a.ts' }, { op: 'add', path: 'src/b.ts' }]);
  m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
  return m;
}

describe('#75 unseenRange', () => {
  it('starts at the commit just below the oldest unseen change', () => {
    const m = base();
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'edit', path: 'src/b.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/a.ts' }]);
    const b = fogBase(m.snapshot(), m.history());
    expect(unseenRange(b, emptyChart(), fileIdOf('src/a.ts'))).toEqual({ path: 'src/a.ts', oldPath: null, since: m.sha(2), start: { sha: m.sha(1) } });
    // Charted at seq 3: only the change at 4 is unseen.
    const charted = applyChartAction(b, emptyChart(), { kind: 'chart', fileId: fileIdOf('src/a.ts'), at: m.sha(3) });
    if (!charted.ok) throw new Error('refused');
    expect(unseenRange(b, charted.chart, fileIdOf('src/a.ts'))).toMatchObject({ since: m.sha(4), start: { sha: m.sha(3) } });
    // `since` matches the fog view's.
    expect(fogFrom(b, charted.chart).files.find((f) => f.fileId === fileIdOf('src/a.ts'))!.since).toBe(m.sha(4));
  });

  it('nothing unseen: no since and no start; a file not at HEAD: null', () => {
    const b = fogBase(base().snapshot(), base().history());
    expect(unseenRange(b, emptyChart(), fileIdOf('src/b.ts'))).toEqual({ path: 'src/b.ts', oldPath: null, since: null, start: null });
    expect(unseenRange(b, emptyChart(), fileIdOf('src/nope.ts'))).toBeNull();
  });

  it('a window gap is inside the range, never cut off by since^', () => {
    const m = base();
    m.commit(YOURS, [{ op: 'edit', path: 'src/a.ts' }]);
    m.commit(YOURS, [{ op: 'add', path: 'g.ts' }]);
    for (const history of [m.history(), null]) {
      const b = fogBase(m.snapshot({ from: 1, holes: new Set([2]) }), history);
      const r = unseenRange(b, emptyChart(), fileIdOf('src/b.ts'))!;
      // The fog points `since` at the commit after the gap (seq 3); its parent is the gap itself, so
      // since^..head would hide the gap's change. The range starts below the gap instead.
      expect(r.since).toBe(m.sha(3));
      expect(r.start).toEqual({ sha: m.sha(1) });
    }
  });

  it('at the window\'s first commit, the range starts at that commit\'s parent', () => {
    const m = base();
    m.commit(AGENT, [{ op: 'edit', path: 'src/b.ts' }]);
    const b = fogBase(m.snapshot({ from: 2 }), m.history());
    expect(unseenRange(b, emptyChart(), fileIdOf('src/b.ts'))).toEqual({ path: 'src/b.ts', oldPath: null, since: m.sha(2), start: { parentOf: m.sha(2) } });
    // The root commit: its parent doesn't exist (the server diffs from the empty tree).
    const root = new Model();
    root.commit(AGENT, [{ op: 'add', path: 'src/a.ts' }]);
    expect(unseenRange(fogBase(root.snapshot(), root.history()), emptyChart(), fileIdOf('src/a.ts'))!.start).toEqual({ parentOf: root.sha(0) });
  });

  it('follows a rename inside the range back to the path at the start', () => {
    const m = base();
    m.commit(AGENT, [{ op: 'rename', from: 'src/a.ts', to: 'lib/a.ts', edit: true }]);
    m.commit(AGENT, [{ op: 'rename', from: 'lib/a.ts', to: 'lib/z.ts' }, { op: 'edit', path: 'src/b.ts' }]);
    const b = fogBase(m.snapshot(), m.history());
    expect(unseenRange(b, emptyChart(), fileIdOf('lib/z.ts'))).toEqual({ path: 'lib/z.ts', oldPath: 'src/a.ts', since: m.sha(2), start: { sha: m.sha(1) } });
    // Renamed before the window: the name it had at the start is the one before the window.
    const late = fogBase(m.snapshot({ from: 2 }), m.history());
    expect(unseenRange(late, emptyChart(), fileIdOf('lib/z.ts'))).toMatchObject({ oldPath: 'src/a.ts', start: { parentOf: m.sha(2) } });
    // Without history a rename can't be followed: the path at HEAD only, so git shows the whole file.
    expect(unseenRange(fogBase(m.snapshot(), null), emptyChart(), fileIdOf('lib/z.ts'))!.oldPath).toBeNull();
  });
});

describe('#75 unseenFiles', () => {
  it('lists a planet\'s or the star\'s fogged files with paths, sorted; null for an unknown planet', () => {
    const m = base();
    m.commit(YOURS, [{ op: 'add', path: 'README.md' }, { op: 'add', path: 'lib/e.ts' }]);
    m.commit(AGENT, [{ op: 'edit', path: 'src/b.ts' }, { op: 'edit', path: 'src/a.ts' }, { op: 'edit', path: 'README.md' }]);
    const b = fogBase(m.snapshot(), m.history());
    const dirIdOf = (path: string) => b.snapshot.dirs.find((d) => d.path === path)!.id;
    const chart: ChartState = emptyChart();
    const reasons = ['agent', 'self-committed-agent-written'];
    expect(unseenFiles(b, chart, dirIdOf('src'))).toEqual([
      { fileId: fileIdOf('src/a.ts'), path: 'src/a.ts', since: m.sha(3), reasons },
      { fileId: fileIdOf('src/b.ts'), path: 'src/b.ts', since: m.sha(3), reasons },
    ]);
    expect(unseenFiles(b, chart, null)).toEqual([{ fileId: fileIdOf('README.md'), path: 'README.md', since: m.sha(3), reasons }]);
    expect(unseenFiles(b, chart, dirIdOf('lib'))).toEqual([]);
    expect(unseenFiles(b, chart, 'd_0123456789ab')).toBeNull();
    // Its counts match the fog view's.
    const fog = fogFrom(b, chart);
    expect(fog.planets.find((p) => p.dirId === dirIdOf('src'))!.fogged).toBe(2);
    expect(fog.star.fogged).toBe(1);
  });
});
