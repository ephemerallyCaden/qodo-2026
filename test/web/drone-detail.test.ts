// The drone panel's session detail (#148 AC 4-5), the parts that need no DOM: the reply's validator, the
// file groups, the "other files" line, the timeline's cells and its text, and what each reply shows.
import { describe, expect, it } from 'vitest';
import { DETAIL_BUCKETS, type DroneDetail } from '../../src/core/contract/drones.js';
import { checkDroneDetail } from '../../web/src/drones/check.js';
import { detailGroups, detailState, otherLine, timelineCells, timelineText } from '../../web/src/drones/detail.js';
import { ViewError } from '../../web/src/data/client.js';

const HEAD = '1'.repeat(40);
const KEY = 's_0123456789abcd';
const buckets = (...set: [number, number][]) => {
  const b = new Array<number>(DETAIL_BUCKETS).fill(0);
  for (const [i, n] of set) b[i] = n;
  return b;
};
const detail = (over: Partial<DroneDetail> = {}): DroneDetail => ({
  ok: true, schemaVersion: 'drone-detail.1', head: HEAD, key: KEY, startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T11:00:00Z',
  files: [
    { fileId: 'f_000000000001', path: 'README.md', edits: 1 },
    { fileId: 'f_000000000002', path: 'src/a.ts', edits: 4 },
    { fileId: 'f_000000000003', path: 'src/b.ts', edits: 2 },
    { fileId: 'f_000000000004', path: 'src/a/c.ts', edits: 9 },
  ],
  otherFiles: 2, otherEdits: 3, buckets: buckets([0, 10], [5, 6], [23, 3]), needsRescan: false, ...over,
});

describe('checkDroneDetail', () => {
  const bad = (mutate: (d: DroneDetail) => void): string => {
    const d = structuredClone(detail());
    mutate(d);
    const c = checkDroneDetail(d);
    return c.ok ? 'ok' : c.errors.join('; ');
  };

  it('accepts a detail, the two refusals, and an old snapshot\'s needsRescan', () => {
    expect(checkDroneDetail(detail()).ok).toBe(true);
    expect(checkDroneDetail({ ok: false, error: 'unknown-head', head: HEAD }).ok).toBe(true);
    expect(checkDroneDetail({ ok: false, error: 'no-such-session' }).ok).toBe(true);
    expect(checkDroneDetail(detail({ files: [], otherFiles: 0, otherEdits: 0, buckets: [], needsRescan: true })).ok).toBe(true);
  });

  it('refuses a malformed reply with reasons, never half-showing it', () => {
    expect(bad((d) => { (d as { schemaVersion: string }).schemaVersion = 'drone-detail.2'; })).toMatch(/schemaVersion/);
    expect(bad((d) => { d.head = 'HEAD'; })).toMatch(/head/);
    expect(bad((d) => { d.key = 'f_1' as never; })).toMatch(/key/);
    expect(bad((d) => { d.startedAt = 'yesterday'; })).toMatch(/startedAt/);
    expect(bad((d) => { d.buckets = d.buckets.slice(1); })).toMatch(/24/);
    expect(bad((d) => { d.buckets[3] = 1.5; })).toMatch(/buckets/);
    expect(bad((d) => { d.buckets[3] = 1; })).toMatch(/add up/);
    expect(bad((d) => { d.files[0]!.edits = 0; })).toMatch(/edits/);
    expect(bad((d) => { d.files[0]!.path = ''; })).toMatch(/path/);
    expect(bad((d) => { d.files[0]!.fileId = 'x' as never; })).toMatch(/fileId/);
    expect(bad((d) => { d.files[1]!.fileId = d.files[0]!.fileId; })).toMatch(/unique/);
    expect(bad((d) => { d.otherFiles = -1; })).toMatch(/otherFiles/);
    expect(bad((d) => { d.otherEdits = 1; })).toMatch(/otherEdits/);
    // Edits with no file to explain them would sit in the timeline with no line in the list (Qodo 05ffa5a8).
    expect(bad((d) => { d.otherFiles = 0; })).toMatch(/otherEdits/);
    expect(bad((d) => { d.needsRescan = true; })).toMatch(/needsRescan/);
    expect(checkDroneDetail({ ok: false, error: 'unknown-head' }).ok).toBe(false);
    expect(checkDroneDetail({ ok: false, error: 'nope' }).ok).toBe(false);
    expect(checkDroneDetail(null).ok).toBe(false);
  });
});

describe('the file list (AC 4, Rule 6)', () => {
  it('groups files by folder, root files first, each folder in codepoint order and its files by name; never by count', () => {
    const shuffled = [...detail().files].reverse();
    expect(detailGroups(shuffled)).toEqual([
      { folder: 'top level', files: [{ name: 'README.md', edits: '1 edit' }] },
      { folder: 'src/', files: [{ name: 'a.ts', edits: '4 edits' }, { name: 'b.ts', edits: '2 edits' }] },
      { folder: 'src/a/', files: [{ name: 'c.ts', edits: '9 edits' }] },
    ]);
  });

  it('keeps long paths whole: two folders that differ only past any cut stay apart, and names are never shortened (Qodo a9080e71)', () => {
    const long = 'x'.repeat(130);
    const g = detailGroups([
      { fileId: 'f_000000000001', path: `${long}/a/${'n'.repeat(130)}1.ts`, edits: 1 },
      { fileId: 'f_000000000002', path: `${long}/b/${'n'.repeat(130)}2.ts`, edits: 1 },
    ]);
    expect(g.map((x) => x.folder)).toEqual([`${long}/a/`, `${long}/b/`]);
    expect(g.map((x) => x.files[0]!.name)).toEqual([`${'n'.repeat(130)}1.ts`, `${'n'.repeat(130)}2.ts`]);
  });

  it('strips control and bidirectional characters from paths, so a file name cannot reorder the panel', () => {
    const g = detailGroups([{ fileId: 'f_000000000001', path: 'src‮/evil\u0007.ts', edits: 1 }]);
    expect(g.flatMap((x) => [x.folder, ...x.files.map((f) => f.name)]).join('')).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });

  it('names what the other files can be, and says nothing when there are none', () => {
    expect(otherLine(detail())).toBe('2 other files not at HEAD (deleted, renamed, excluded, on another branch or in a removed worktree): 3 edits');
    expect(otherLine(detail({ otherFiles: 1, otherEdits: 1 }))).toMatch(/^1 other file not at HEAD .*: 1 edit$/);
    expect(otherLine(detail({ otherFiles: 0, otherEdits: 0 }))).toBeNull();
  });
});

describe('the timeline (AC 4, 6)', () => {
  it('scales each slice to whole cells of the tallest, and never rounds a slice with an edit down to nothing', () => {
    expect(timelineCells(buckets([0, 10], [5, 6], [23, 1]), 10)).toEqual(buckets([0, 10], [5, 6], [23, 1]));
    expect(timelineCells(buckets([0, 100], [1, 1]), 10)).toEqual(buckets([0, 10], [1, 1]));
    expect(timelineCells(buckets([2, 3], [3, 2]), 12)).toEqual(buckets([2, 12], [3, 8]));
    expect(timelineCells(buckets(), 10)).toEqual(buckets());
  });

  it('is said in words too: the total, the span, and when each edit happened, slice by slice (Qodo PR #167 4dfd03c0)', () => {
    // 2 h in 24 slices of 5 min: slices 1, 6 and 24.
    expect(timelineText(detail())).toBe('19 edits from 2026-11-10 09:00:00 UTC to 2026-11-10 11:00:00 UTC, in 24 slices of 0:05:00: '
      + '10 in 0:00:00–0:05:00, 6 in 0:25:00–0:30:00, 3 in 1:55:00–2:00:00 after the start');
    expect(timelineText(detail({ files: [], otherFiles: 0, otherEdits: 0, buckets: buckets() }))).toBe('no edits from 2026-11-10 09:00:00 UTC to 2026-11-10 11:00:00 UTC');
  });

  it('two timelines with the same total and peak but edits at other times read differently', () => {
    const early = detail({ buckets: buckets([0, 10], [1, 6], [2, 3]) });
    const late = detail({ buckets: buckets([21, 10], [22, 6], [23, 3]) });
    expect(timelineText(early)).not.toBe(timelineText(late));
    expect(timelineText(late)).toMatch(/10 in 1:45:00–1:50:00/);
  });

  it('a zero-length session says its edits happened at its one time', () => {
    const at = '2026-11-10T09:00:00Z';
    expect(timelineText(detail({ startedAt: at, endedAt: at, buckets: buckets([0, 19]) }))).toBe('19 edits, all at 2026-11-10 09:00:00 UTC');
  });
});

describe('what each reply shows', () => {
  it('a detail of this session and head is ready; a rescan-needing one says so', () => {
    expect(detailState(detail(), KEY, HEAD)).toEqual({ kind: 'ready', detail: detail() });
    expect(detailState(detail({ files: [], otherFiles: 0, otherEdits: 0, buckets: [], needsRescan: true }), KEY, HEAD)).toEqual({ kind: 'note', text: "rescan to see this session's files" });
  });

  it('a refusal, a failure, or a reply for another session or head is a line, never a list', () => {
    expect(detailState({ ok: false, error: 'unknown-head', head: 'b'.repeat(40) }, KEY, HEAD)).toMatchObject({ kind: 'failed', text: expect.stringMatching(/rescanned/) });
    expect(detailState({ ok: false, error: 'no-such-session' }, KEY, HEAD)).toEqual({ kind: 'note', text: 'no file detail for this session' });
    expect(detailState(new ViewError('Couldn\'t reach the Commet server.'), KEY, HEAD)).toEqual({ kind: 'failed', text: "Couldn't reach the Commet server." });
    expect(detailState(new Error('boom'), KEY, HEAD)).toEqual({ kind: 'failed', text: 'something went wrong' });
    expect(detailState(detail({ key: 's_ffffffffffffff' }), KEY, HEAD).kind).toBe('failed');
    expect(detailState(detail({ head: 'c'.repeat(40) }), KEY, HEAD).kind).toBe('failed');
  });
});
