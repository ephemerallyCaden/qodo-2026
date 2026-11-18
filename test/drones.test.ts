// Drone view (#80 AC 4): home = the body holding most of a session's files, from the fog's file-to-planet map.
// Drone detail (#148 AC 3, 5): one session's files with their edit counts, its other edits and its timeline.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { DETAIL_BUCKETS, type DroneDetail } from '../src/core/contract/drones.js';
import { droneDetail, droneView } from '../src/core/drones.js';
import type { DirId, FileEntry, FileId, Session, SessionKey, SnapshotV02 } from '../src/core/snapshot/types.js';

const A = 'd_00000000000a';
const B = 'd_00000000000b';
const HEAD = '1'.repeat(40);
const f = (n: number) => `f_${String(n).padStart(12, '0')}` as FileId;
const home = new Map<FileId, DirId | null>([[f(1), A], [f(2), A], [f(3), B], [f(4), B], [f(5), null], [f(6), null]]);

const session = (key: string, over: Partial<Session> = {}): Session => ({
  key: `s_${key}` as SessionKey, tool: 'claude-code', kind: 'main', startedAt: '2026-11-01T00:00:00Z', endedAt: '2026-11-01T01:00:00Z',
  filesTouched: 0, files: [], filesOutside: 0, fileEdits: [], editsOutside: 0, editBuckets: new Array<number>(DETAIL_BUCKETS).fill(0),
  linesAdded: 0, linesRemoved: 0, commits: [], inferred: false, seed: 7, ...over,
});
const snap = (sessions: Session[]) => ({ repo: { head: HEAD }, sessions }) as Pick<SnapshotV02, 'repo' | 'sessions'>;
const homesOf = (sessions: Session[], m = home) => Object.fromEntries(droneView(snap(sessions), m).sessions.map((s) => [s.key, s.home]));

describe('droneView', () => {
  const cases: [string, Session[], Record<string, string | null>][] = [
    ['one planet', [session('a', { files: [f(1), f(2), f(5)] })], { s_a: A }],
    ['a tie goes to the lower codepoint', [session('a', { files: [f(3), f(1)] })], { s_a: A }],
    ['a tie with the star: "d_" sorts before "star"', [session('a', { files: [f(5), f(3)] })], { s_a: B }],
    ['star-only files', [session('a', { files: [f(5), f(6)] })], { s_a: 'star' }],
    ['most files on the star', [session('a', { files: [f(5), f(6), f(1)] })], { s_a: 'star' }],
    ['no files', [session('a')], { s_a: null }],
    ['files the map does not know', [session('a', { files: [f(99)] })], { s_a: null }],
    ['a subagent with no files inherits its parent', [session('p', { files: [f(3)] }), session('c', { kind: 'subagent', parentKey: 's_p' as SessionKey })], { s_p: B, s_c: B }],
    ['a subagent with its own files keeps them', [session('p', { files: [f(3)] }), session('c', { kind: 'subagent', parentKey: 's_p' as SessionKey, files: [f(1)] })], { s_p: B, s_c: A }],
    ['inheritance walks up a chain and stops at a cycle', [
      session('p', { files: [f(1)] }), session('m', { kind: 'subagent', parentKey: 's_p' as SessionKey }), session('c', { kind: 'subagent', parentKey: 's_m' as SessionKey }),
      session('x', { kind: 'subagent', parentKey: 's_y' as SessionKey }), session('y', { kind: 'subagent', parentKey: 's_x' as SessionKey }),
    ], { s_p: A, s_m: A, s_c: A, s_x: null, s_y: null }],
    ['a main session with no files stays null', [session('p', { files: [f(1)] }), session('m', { parentKey: 's_p' as SessionKey })], { s_p: A, s_m: null }],
  ];
  for (const [name, sessions, want] of cases) {
    it(name, () => {
      expect(homesOf(sessions)).toEqual(want);
      expect(droneView(snap(sessions), home).needsRescan).toBe(false);
    });
  }

  it('an old snapshot (no files on any session) needsRescan and places nothing', () => {
    const old = [session('a'), session('b', { kind: 'subagent', parentKey: 's_a' as SessionKey })].map((s) => ({ ...s, files: undefined }) as unknown as Session);
    const v = droneView(snap(old), home);
    expect(v).toMatchObject({ needsRescan: true, total: 2, placed: 0 });
    expect(v.sessions.every((s) => s.home === null)).toBe(true);
  });

  it('counts, sorts by codepoint and is byte-identical for the same inputs', () => {
    const sessions = [session('b', { files: [f(1)] }), session('B'), session('a', { files: [f(5)] })];
    const v = droneView(snap(sessions), home);
    expect(v.sessions.map((s) => s.key)).toEqual(['s_B', 's_a', 's_b']);
    expect(v).toMatchObject({ schemaVersion: 'drones.1', head: HEAD, total: 3, placed: 2, needsRescan: false });
    expect(canonicalJson(droneView(snap([...sessions].reverse()), home))).toBe(canonicalJson(v));
  });

  it('carries no path, subject or count fields (Rules 2 and 6)', () => {
    const v = droneView(snap([session('a', { files: [f(1)], filesTouched: 9, linesAdded: 99, commits: [HEAD as never] })]), home);
    expect(Object.keys(v.sessions[0]!).sort()).toEqual(['agentType', 'branch', 'endedAt', 'home', 'inferred', 'key', 'kind', 'model', 'parentKey', 'seed', 'startedAt', 'tool']);
  });
});

describe('droneDetail (#148)', () => {
  const PATHS = ['README.md', 'lib/x.ts', 'src/a.ts', 'src/a/b.ts', 'src/b.ts'];
  const files = PATHS.map((path, i) => ({ id: f(i + 1), path }) as FileEntry);
  const idOf = (path: string) => f(PATHS.indexOf(path) + 1);
  /** A session that edited `edits` (path → count) at HEAD, plus `outside` edits on `other` paths with no file. */
  const edited = (key: string, edits: Record<string, number>, other = 0, outside = 0, over: Partial<Session> = {}): Session => {
    const fileEdits = Object.entries(edits).map(([p, n]) => ({ id: idOf(p), n })).sort((a, b) => (a.id < b.id ? -1 : 1));
    const buckets = new Array<number>(DETAIL_BUCKETS).fill(0);
    buckets[0] = fileEdits.reduce((a, e) => a + e.n, 0);
    buckets[DETAIL_BUCKETS - 1] = outside;
    return session(key, { files: fileEdits.map((e) => e.id), fileEdits, filesOutside: other, editsOutside: outside, filesTouched: fileEdits.length + other, editBuckets: buckets, ...over });
  };
  const snapOf = (sessions: Session[]) => ({ repo: { head: HEAD }, files, sessions }) as Pick<SnapshotV02, 'repo' | 'files' | 'sessions'>;
  const detail = (s: Session, others: Session[] = []) => droneDetail(snapOf([...others, s]), s.key) as DroneDetail | null;

  it('one file: its path and edit count, the session\'s times and its buckets', () => {
    const s = edited('a', { 'src/a.ts': 3 });
    expect(detail(s)).toEqual({
      ok: true, schemaVersion: 'drone-detail.1', head: HEAD, key: 's_a', startedAt: s.startedAt, endedAt: s.endedAt,
      files: [{ fileId: idOf('src/a.ts'), path: 'src/a.ts', edits: 3 }], otherFiles: 0, otherEdits: 0, buckets: s.editBuckets, needsRescan: false,
    });
  });

  it('several folders: root files first, then each folder by codepoint, its files by name; never by count', () => {
    const s = edited('a', { 'src/a/b.ts': 9, 'src/b.ts': 1, 'src/a.ts': 5, 'lib/x.ts': 2, 'README.md': 7 });
    // Path order alone would interleave folders: src/a.ts < src/a/b.ts < src/b.ts.
    expect(detail(s)!.files.map((x) => [x.path, x.edits])).toEqual([['README.md', 7], ['lib/x.ts', 2], ['src/a.ts', 5], ['src/b.ts', 1], ['src/a/b.ts', 9]]);
  });

  it('a file not at HEAD is counted with the other paths, never named (Rule 1)', () => {
    const gone = f(99);
    const s = edited('a', { 'src/a.ts': 1 }, 2, 4, {});
    const withGone = { ...s, files: [...s.files, gone], fileEdits: [...s.fileEdits, { id: gone, n: 3 }], filesTouched: s.filesTouched + 1,
      editBuckets: s.editBuckets.map((b, i) => (i === 1 ? b + 3 : b)) };
    const d = detail(withGone)!;
    expect(d.files.map((x) => x.path)).toEqual(['src/a.ts']);
    expect(d).toMatchObject({ otherFiles: 3, otherEdits: 7 });
    expect(JSON.stringify(d)).not.toContain(gone);
  });

  it('a session with no files has an empty list, no other edits and all-zero buckets', () => {
    expect(detail(session('a'))).toMatchObject({ files: [], otherFiles: 0, otherEdits: 0, buckets: new Array(DETAIL_BUCKETS).fill(0), needsRescan: false });
  });

  it('describes only the requested session, whoever else is in the snapshot (Rule 6)', () => {
    const s = edited('a', { 'src/a.ts': 1 });
    const busy = edited('b', { 'src/a.ts': 40, 'src/b.ts': 9 }, 3, 3);
    expect(detail(s, [busy])).toEqual(detail(s));
    expect(Object.keys(detail(s)!).sort()).toEqual(['buckets', 'endedAt', 'files', 'head', 'key', 'needsRescan', 'ok', 'otherEdits', 'otherFiles', 'schemaVersion', 'startedAt']);
    expect(Object.keys(detail(s)!.files[0]!).sort()).toEqual(['edits', 'fileId', 'path']);
  });

  it('refuses an unknown key and an inferred pseudo-session (Rule 6)', () => {
    expect(droneDetail(snapOf([edited('a', { 'src/a.ts': 1 })]), 's_zz' as SessionKey)).toBeNull();
    expect(detail(edited('a', { 'src/a.ts': 1 }, 0, 0, { inferred: true as false }))).toBeNull();
  });

  it('an old snapshot (no per-file counts) needsRescan, with nothing listed', () => {
    const old = { ...edited('a', { 'src/a.ts': 2 }), fileEdits: undefined, editsOutside: undefined, editBuckets: undefined } as unknown as Session;
    expect(detail(old)).toMatchObject({ needsRescan: true, files: [], otherFiles: 0, otherEdits: 0, buckets: [] });
  });

  it('a damaged session (malformed counts or slices) is "damaged", never a throw or a bad detail (Qodo 7105505d)', () => {
    const s = edited('a', { 'src/a.ts': 2 });
    const damaged: Partial<Session>[] = [
      { fileEdits: [null as never] }, { fileEdits: [{ id: f(1), n: 0 }] }, { fileEdits: [{ id: f(1), n: 1.5 }] }, { fileEdits: [{ id: 'x' as FileId, n: 1 }] },
      { editsOutside: -1 }, { editsOutside: undefined as never }, { editBuckets: [1] }, { editBuckets: [...s.editBuckets.slice(1), 0.5] },
      { editBuckets: [3, ...s.editBuckets.slice(1)] }, { filesOutside: -1 },
    ];
    for (const over of damaged) expect(droneDetail(snapOf([{ ...s, ...over }]), s.key), JSON.stringify(over)).toBe('damaged');
  });

  it('is byte-identical for the same inputs, in any session order', () => {
    const a = edited('a', { 'src/b.ts': 2, 'README.md': 1 }, 1, 1);
    const b = edited('b', { 'lib/x.ts': 1 });
    expect(canonicalJson(droneDetail(snapOf([a, b]), a.key))).toBe(canonicalJson(droneDetail(snapOf([b, a]), a.key)));
  });
});
