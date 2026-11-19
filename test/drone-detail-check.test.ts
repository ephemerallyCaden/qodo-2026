// The one rule set for a session's drone detail (#148, the root-cause round after Qodo's backstop review of
// PR #167): what a snapshot record must hold to be served, and what a served detail must hold to be shown.
// The server checks both and the view checks the second, so the server never serves a detail the view
// refuses. Every damaged case any review found is a row here, so none comes back.
import { describe, expect, it } from 'vitest';
import { DETAIL_BUCKETS, type DroneDetail } from '../src/core/contract/drones.js';
import { droneDetailProblems, isSessionEntry, sessionDetailProblems } from '../src/core/drone-detail-check.js';
import type { FileId, Session, SessionKey } from '../src/core/snapshot/types.js';

const f = (n: number) => `f_${String(n).padStart(12, '0')}` as FileId;
const slices = (...set: [number, number][]) => {
  const b = new Array<number>(DETAIL_BUCKETS).fill(0);
  for (const [i, n] of set) b[i] = n;
  return b;
};

/** A record as buildSessions writes it: 2 files at HEAD (3 and 1 edits), 1 other path (2 edits), one hour. */
const record = (): Session => ({
  key: 's_0123456789abcd' as SessionKey, tool: 'claude-code', kind: 'main', startedAt: '2026-11-01T00:00:00Z', endedAt: '2026-11-01T01:00:00Z',
  filesTouched: 3, files: [f(1), f(2)], filesOutside: 1, fileEdits: [{ id: f(1), n: 3 }, { id: f(2), n: 1 }], editsOutside: 2,
  editBuckets: slices([0, 4], [23, 2]), editSpanMs: 3_600_400, linesAdded: 0, linesRemoved: 0, commits: [], inferred: false, seed: 1,
});

/** A served detail of that record. */
const served = (): DroneDetail => ({
  ok: true, schemaVersion: 'drone-detail.1', head: '1'.repeat(40), key: 's_0123456789abcd' as SessionKey,
  startedAt: '2026-11-01T00:00:00Z', endedAt: '2026-11-01T01:00:00Z',
  files: [{ fileId: f(1), path: 'src/a.ts', edits: 3 }, { fileId: f(2), path: 'src/b.ts', edits: 1 }],
  otherFiles: 1, otherEdits: 2, buckets: slices([0, 4], [23, 2]), spanMs: 3_600_400, needsRescan: false,
});

const BIG = Number.MAX_SAFE_INTEGER + 1;

describe('sessionDetailProblems: what a snapshot record must hold to be served', () => {
  it('a record as the scanner writes it has no problem; one from before #148 is old', () => {
    expect(sessionDetailProblems(record())).toEqual([]);
    const old = { ...record(), fileEdits: undefined, editsOutside: undefined, editBuckets: undefined, editSpanMs: undefined };
    expect(sessionDetailProblems(old)).toBe('old');
  });

  // [finding, what is damaged, the change]
  const rows: [string, string, (s: Record<string, unknown>) => void][] = [
    ['7105505d', 'a null fileEdits entry', (s) => { s['fileEdits'] = [null]; }],
    ['7105505d', 'an edit count of 0', (s) => { s['fileEdits'] = [{ id: f(1), n: 0 }, { id: f(2), n: 4 }]; }],
    ['7105505d', 'a fractional edit count', (s) => { s['fileEdits'] = [{ id: f(1), n: 2.5 }, { id: f(2), n: 1.5 }]; }],
    ['7105505d', 'a fileEdits id that is not a file id', (s) => { s['fileEdits'] = [{ id: 'x', n: 3 }, { id: f(2), n: 1 }]; }],
    ['7105505d', 'a negative editsOutside', (s) => { s['editsOutside'] = -1; }],
    ['7105505d', 'only some of the #148 fields', (s) => { s['editsOutside'] = undefined; }],
    ['7105505d', 'buckets that are not 24', (s) => { s['editBuckets'] = [6]; }],
    ['7105505d', 'a fractional bucket', (s) => { s['editBuckets'] = slices([0, 3.5], [23, 2.5]); }],
    ['7105505d', 'buckets that do not add up', (s) => { s['editBuckets'] = slices([0, 5], [23, 2]); }],
    ['7105505d', 'a negative filesOutside', (s) => { s['filesOutside'] = -1; s['filesTouched'] = 1; }],
    ['1eabd165', 'a file listed twice in fileEdits', (s) => { s['fileEdits'] = [{ id: f(1), n: 2 }, { id: f(1), n: 2 }]; s['files'] = [f(1), f(1)]; }],
    ['582ea944', 'an edit count past MAX_SAFE_INTEGER', (s) => { s['fileEdits'] = [{ id: f(1), n: BIG }, { id: f(2), n: 1 }]; s['editBuckets'] = slices([0, BIG + 1], [23, 2]); }],
    ['582ea944', 'a bucket past MAX_SAFE_INTEGER', (s) => { s['editBuckets'] = slices([0, BIG], [23, 2]); }],
    ['582ea944', 'filesTouched past MAX_SAFE_INTEGER', (s) => { s['filesTouched'] = BIG; s['filesOutside'] = BIG - 2; }],
    ['582ea944', 'editsOutside past MAX_SAFE_INTEGER', (s) => { s['editsOutside'] = BIG; }],
    ['5f2af634', 'no startedAt', (s) => { s['startedAt'] = undefined; }],
    ['5f2af634', 'an endedAt that is not a time', (s) => { s['endedAt'] = 'yesterday'; }],
    ['5f2af634', 'a startedAt that does not parse', (s) => { s['startedAt'] = '2026-13-45T25:61:61Z'; }],
    ['5f2af634', 'an endedAt before the startedAt', (s) => { s['endedAt'] = '2026-10-31T00:00:00Z'; }],
    ['3bc5a746', 'counts for a file the session does not list', (s) => { s['files'] = [f(1)]; s['filesTouched'] = 2; }],
    ['3bc5a746', 'a listed file with no count', (s) => { s['files'] = [f(1), f(2), f(3)]; s['filesTouched'] = 4; }],
    ['3bc5a746', 'fileEdits in another order than files', (s) => { s['fileEdits'] = [{ id: f(2), n: 1 }, { id: f(1), n: 3 }]; }],
    ['3bc5a746', 'filesTouched that is not files plus filesOutside', (s) => { s['filesTouched'] = 9; }],
    ['3bc5a746', 'files that is not an array', (s) => { s['files'] = 'f_000000000001'; }],
    ['3bc5a746', 'edits outside with no file outside', (s) => { s['filesOutside'] = 0; s['filesTouched'] = 2; }],
    ['3bc5a746', 'a file outside with no edit', (s) => { s['editsOutside'] = 0; s['editBuckets'] = slices([0, 4]); }],
    ['d23a7a91', 'a span that is not a count', (s) => { s['editSpanMs'] = -1; }],
    ['d23a7a91', 'a span the times rule out', (s) => { s['editSpanMs'] = 99_999_999; }],
  ];
  for (const [id, what, change] of rows) {
    it(`${what} is damaged (${id})`, () => {
      const s = record() as unknown as Record<string, unknown>;
      change(s);
      const p = sessionDetailProblems(s);
      expect(p).not.toBe('old');
      expect((p as string[]).length).toBeGreaterThan(0);
    });
  }

  it('an entry that is not a session object is damaged (af483acc)', () => {
    for (const bad of [null, 7, 'x', [], { key: 9 }, undefined]) expect(isSessionEntry(bad), JSON.stringify(bad)).toBe(false);
    expect(isSessionEntry(record())).toBe(true);
  });
});

describe('droneDetailProblems: what a served detail must hold to be shown (the view runs the same rules)', () => {
  it('a detail of a good record has no problem, and neither does a needsRescan one', () => {
    expect(droneDetailProblems(served())).toEqual([]);
    expect(droneDetailProblems({ ...served(), files: [], otherFiles: 0, otherEdits: 0, buckets: [], spanMs: 0, needsRescan: true })).toEqual([]);
  });

  const rows: [string, string, (d: Record<string, unknown>) => void][] = [
    ['schema', 'another schemaVersion', (d) => { d['schemaVersion'] = 'drone-detail.2'; }],
    ['schema', 'a head that is not a full SHA', (d) => { d['head'] = 'HEAD'; }],
    ['schema', 'a key that is not a session key', (d) => { d['key'] = 'f_1'; }],
    ['5f2af634', 'no startedAt', (d) => { delete d['startedAt']; }],
    ['5f2af634', 'an endedAt that does not parse', (d) => { d['endedAt'] = '2026-13-45T25:61:61Z'; }],
    ['7105505d', 'a null file', (d) => { d['files'] = [null]; }],
    ['7105505d', 'an edit count of 0', (d) => { (d['files'] as Record<string, unknown>[])[0]!['edits'] = 0; }],
    ['7105505d', 'an empty path', (d) => { (d['files'] as Record<string, unknown>[])[0]!['path'] = ''; }],
    ['1eabd165', 'a file listed twice', (d) => { (d['files'] as Record<string, unknown>[])[1]!['fileId'] = f(1); }],
    ['582ea944', 'an edit count past MAX_SAFE_INTEGER', (d) => { (d['files'] as Record<string, unknown>[])[0]!['edits'] = BIG; d['buckets'] = slices([0, BIG + 1], [23, 2]); }],
    ['582ea944', 'a bucket past MAX_SAFE_INTEGER', (d) => { d['buckets'] = slices([0, BIG], [23, 2]); }],
    ['05ffa5a8', 'other edits with no other file', (d) => { d['otherFiles'] = 0; }],
    ['05ffa5a8', 'fewer other edits than other files', (d) => { d['otherFiles'] = 3; }],
    ['7105505d', 'buckets that are not 24', (d) => { d['buckets'] = [6]; }],
    ['7105505d', 'buckets that do not add up', (d) => { d['buckets'] = slices([0, 5], [23, 2]); }],
    ['needsRescan', 'needsRescan with files', (d) => { d['needsRescan'] = true; }],
    ['d23a7a91', 'no spanMs', (d) => { delete d['spanMs']; }],
    ['d23a7a91', 'a negative spanMs', (d) => { d['spanMs'] = -1; }],
    ['d23a7a91', 'a spanMs the times rule out', (d) => { d['spanMs'] = 99_999_999; }],
  ];
  for (const [id, what, change] of rows) {
    it(`${what} is refused (${id})`, () => {
      const d = structuredClone(served()) as unknown as Record<string, unknown>;
      change(d);
      expect(droneDetailProblems(d).length).toBeGreaterThan(0);
    });
  }

  it('a non-object is refused', () => {
    for (const bad of [null, 7, 'x', []]) expect(droneDetailProblems(bad).length, JSON.stringify(bad)).toBeGreaterThan(0);
  });
});
