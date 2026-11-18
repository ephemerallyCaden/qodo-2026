// buildSessions (#148 AC 1): each session keeps its edits per file at HEAD, its edits on other paths,
// and all its edits in 24 equal time slices, from the parser's deduped edit events.
import { describe, expect, it } from 'vitest';
import { buildSessions } from '../src/attrib/match.js';
import type { ClaudeIngest, EditEvent, SessionMeta } from '../src/attrib/parsers/claude.js';
import { mergeIngest } from '../src/scan/index.js';
import { DETAIL_BUCKETS } from '../src/core/contract/drones.js';
import type { FileId, Session, SessionKey } from '../src/core/snapshot/types.js';

const T0 = Date.parse('2026-11-01T09:00:00.000Z');
const f = (n: number) => `f_${String(n).padStart(12, '0')}` as FileId;
// Ids sort in the opposite order to their paths, so "same order as files" can't pass by accident.
const fileIds = new Map<string, FileId>([['src/a.ts', f(3)], ['src/b.ts', f(2)], ['README.md', f(1)]]);

function meta(key: string, files: string[], firstTs: number, lastTs: number): SessionMeta {
  return { key: `s_${key}` as SessionKey, kind: 'main', parentKey: undefined, agentType: undefined, branch: 'main', model: undefined,
    toolVersion: undefined, linesAdded: 0, linesRemoved: 0, firstTs, lastTs, files: new Set(files) };
}
let n = 0;
const ev = (key: string, ts: number, path: string, added = 1, removed = 0): EditEvent =>
  ({ eventId: `e${String(n++).padStart(15, '0')}`, sessionKey: `s_${key}` as SessionKey, ts, path, hashes: [], added, removed });
const build = (metas: SessionMeta[], events: EditEvent[]): Record<string, Session> =>
  Object.fromEntries(buildSessions(metas, [], new Map(), fileIds, events).map((s) => [s.key.slice(2), s]));
const zeros = () => new Array<number>(DETAIL_BUCKETS).fill(0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('buildSessions: edits per file and over time (#148)', () => {
  it('counts each file\'s edits in the order of files, and the edits on paths with no file at HEAD', () => {
    const last = T0 + 600_000;
    const s = build([meta('a', ['src/a.ts', 'src/b.ts', 'gone.ts'], T0, last)], [
      ev('a', T0, 'src/a.ts'), ev('a', T0 + 1000, 'src/a.ts'), ev('a', T0 + 2000, 'src/a.ts'),
      ev('a', T0 + 300_000, 'src/b.ts'), ev('a', last, 'gone.ts'), ev('a', last, 'gone.ts'),
    ])['a']!;
    expect(s.files).toEqual([f(2), f(3)]);
    expect(s.fileEdits).toEqual([{ id: f(2), n: 1 }, { id: f(3), n: 3 }]);
    expect(s.editsOutside).toBe(2);
    expect(s).toMatchObject({ filesTouched: 3, filesOutside: 1 });
  });

  it('puts the first edit in slice 0, the last in slice 23 and the rest by integer arithmetic', () => {
    // span 23,999 ms: slice i = floor((ts − first) × 24 / 24,000)
    const s = build([meta('a', ['src/a.ts'], T0, T0 + 23_999)], [
      ev('a', T0, 'src/a.ts'), ev('a', T0 + 999, 'src/a.ts'), ev('a', T0 + 1000, 'src/a.ts'), ev('a', T0 + 12_000, 'src/a.ts'), ev('a', T0 + 23_999, 'src/a.ts'),
    ])['a']!;
    const want = zeros();
    want[0] = 2;
    want[1] = 1;
    want[12] = 1;
    want[23] = 1;
    expect(s.editBuckets).toEqual(want);
  });

  it('a zero-length span puts every edit in slice 0', () => {
    const s = build([meta('a', ['src/a.ts', 'README.md'], T0, T0)], [ev('a', T0, 'src/a.ts'), ev('a', T0, 'README.md')])['a']!;
    const want = zeros();
    want[0] = 2;
    expect(s.editBuckets).toEqual(want);
  });

  it('counts only the session\'s own edits, and every edit once: the buckets add up to the files plus the rest', () => {
    const out = build([meta('a', ['src/a.ts', 'x.ts'], T0, T0 + 60_000), meta('b', ['src/a.ts'], T0, T0 + 60_000)], [
      ev('a', T0, 'src/a.ts'), ev('a', T0 + 30_000, 'x.ts'), ev('b', T0 + 10_000, 'src/a.ts'), ev('b', T0 + 20_000, 'src/a.ts'),
    ]);
    expect(out['a']!.fileEdits).toEqual([{ id: f(3), n: 1 }]);
    expect(out['b']!.fileEdits).toEqual([{ id: f(3), n: 2 }]);
    for (const s of Object.values(out)) {
      expect(s.editBuckets).toHaveLength(DETAIL_BUCKETS);
      expect(sum(s.editBuckets)).toBe(sum(s.fileEdits.map((e) => e.n)) + s.editsOutside);
      expect(s.fileEdits.map((e) => e.id)).toEqual(s.files);
    }
  });

  it('a session with commits but no edits has no files and empty slices', () => {
    const s = buildSessions([meta('a', [], T0, T0 + 5000)], ['c1'],
      new Map([['c1', { attribution: { sessions: [{ sessionKey: 's_a' as SessionKey, lines: 0 }] } } as never]]), fileIds, [])[0]!;
    expect(s).toMatchObject({ files: [], fileEdits: [], editsOutside: 0, filesOutside: 0, editBuckets: zeros() });
  });

  it('a session found again by the outside-transcript pass is merged, not replaced: its files, span, lines and edits all count, once (Qodo PR #167 121022e1)', () => {
    const ingest = (sessions: SessionMeta[], events: EditEvent[]): ClaudeIngest =>
      ({ events, sessions: new Map(sessions.map((m) => [m.key, m])), ranCommits: [], ranWindows: [], unreadable: [], partial: [], dropped: 0 });
    const first = { ...meta('a', ['src/a.ts'], T0 + 10_000, T0 + 20_000), linesAdded: 1 };
    // Its three edits (one of them the shared one) added a line each.
    const again = { ...meta('a', ['README.md'], T0, T0 + 23_999), linesAdded: 3, linesRemoved: 0, branch: 'other' };
    const shared = ev('a', T0 + 10_000, 'src/a.ts');
    const into = ingest([first], [shared]);
    mergeIngest(into, ingest([again], [{ ...shared }, ev('a', T0, 'README.md'), ev('a', T0 + 23_999, 'README.md')]));
    const m = into.sessions.get('s_a' as SessionKey)!;
    expect(m).toMatchObject({ firstTs: T0, lastTs: T0 + 23_999, linesAdded: 3, linesRemoved: 0, branch: 'main' });
    expect([...m.files].sort()).toEqual(['README.md', 'src/a.ts']);
    expect(into.events).toHaveLength(3); // the repeated event (same session and event id) once
    const s = buildSessions(into.sessions.values(), [], new Map(), fileIds, into.events)[0]!;
    expect(s).toMatchObject({ filesTouched: 2, filesOutside: 0, editsOutside: 0, fileEdits: [{ id: f(1), n: 2 }, { id: f(3), n: 1 }] });
    // In the merged span, the edits fall where they happened: none is clamped to an end.
    const want = zeros();
    want[0] = 1;
    want[10] = 1;
    want[23] = 1;
    expect(s.editBuckets).toEqual(want);
  });

  it("an edit both parses read counts its lines once, like its event (Qodo PR #167 b7385767)", () => {
    const ingest = (sessions: SessionMeta[], events: EditEvent[]): ClaudeIngest =>
      ({ events, sessions: new Map(sessions.map((m) => [m.key, m])), ranCommits: [], ranWindows: [], unreadable: [], partial: [], dropped: 0 });
    const shared = ev('a', T0, 'src/a.ts', 2, 1);
    const into = ingest([{ ...meta('a', ['src/a.ts'], T0, T0), linesAdded: 2, linesRemoved: 1 }], [shared]);
    // The second parse read the shared edit again (2 added, 1 removed) and one more (5 added, 3 removed).
    mergeIngest(into, ingest([{ ...meta('a', ['src/a.ts', 'x.ts'], T0, T0 + 1000), linesAdded: 7, linesRemoved: 4 }], [{ ...shared }, ev('a', T0 + 1000, 'x.ts', 5, 3)]));
    expect(into.sessions.get('s_a' as SessionKey)).toMatchObject({ linesAdded: 7, linesRemoved: 4 });
    expect(into.events).toHaveLength(2);
  });

  it('never drops an edit: one on a path the session record lacks, or outside its span, still counts (Rule 1)', () => {
    // The parser records a path with every edit and mergeIngest merges records, so this can't come
    // from a scan; if that ever broke, the edit is counted rather than lost.
    const s = build([meta('a', ['src/a.ts'], T0 + 1000, T0 + 2000)], [ev('a', T0 + 1000, 'src/a.ts'), ev('a', T0, 'README.md'), ev('a', T0 + 9000, 'y.ts')])['a']!;
    expect(s.fileEdits).toEqual([{ id: f(1), n: 1 }, { id: f(3), n: 1 }]);
    expect(s).toMatchObject({ filesTouched: 3, filesOutside: 1, editsOutside: 1 });
    expect(s.editBuckets[0]).toBe(2);
    expect(s.editBuckets[DETAIL_BUCKETS - 1]).toBe(1);
  });
});
