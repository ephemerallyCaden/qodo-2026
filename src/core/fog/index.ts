// Fog of war (#33, R5). Pure: fogView(snapshot, chart state, path history) gives the contract's
// FogView. The snapshot keys commit files by path, and file ids are path ids, so a rename changes a
// file's id. The PathHistory (src/core/renames.ts) ties a change, or a chart, to the file it now
// belongs to. Without it, or where it can't be followed, a file errs to fogged with
// `lineage-unknown` (Rule 1).
import { byCodepoint } from '../canonical-json.js';
import type { UnseenFile } from '../contract/api.js';
import type { ChartAction, ChartUnknownHead, FileFog, FogCounts, FogReason, FogView } from '../contract/fog.js';
import { sha256Hex } from '../hash.js';
import type { PathHistory, Unrowed } from '../renames.js';
import type { Commit, CommitFile, DirId, FileEntry, FileId, PersonId, Sha, SnapshotV02 } from '../snapshot/types.js';
import { folderHome, planetHome, type Home, type LineageCommit } from '../structure.js';
import { byEntry, type ChartEntry, type ChartState } from './chart-state.js';

export { emptyChart, parseChartAction, parseChartState, type ChartEntry, type ChartState } from './chart-state.js';

/** The snapshot's file id for a path (`f_` + sha256(path)[:12], as `commet scan` assigns it). */
export const fileIdOf = (path: string): FileId => `f_${sha256Hex(path).slice(0, 12)}`;

/** Why a commit's change isn't yours; empty when it is (a human-class commit by one of selfPersonIds). */
export function reasonsOf(c: Commit | undefined, self: ReadonlySet<PersonId>): FogReason[] {
  if (!c) return ['unknown'];
  const out: FogReason[] = [];
  const cls = c.attribution.class;
  if (cls === 'agent' || cls === 'mixed' || cls === 'unknown') out.push(cls);
  else if (!self.has(c.author)) out.push('teammate');
  if (c.attribution.selfCommittedAgentWritten) out.push('self-committed-agent-written');
  return out;
}

/**
 * Where each file is counted: its planet's DirId, or null for the star. A planet is a folder holding
 * a surface file, by planetHome, the rule #18's layout uses too (#71 C8): with no `roots` a top-level
 * folder, so `test/` never is (#23), and with roots also each root's subfolders. A matched test is a
 * moon of its target's planet. Root files, files directly inside a root, unmatched tests, tests of
 * either and test data are on the star. A surface file whose planet folder has no dirs[] entry is
 * counted on the star, not dropped. `roots` are the layout's (`source.roots`).
 */
export function homes(s: SnapshotV02, roots: readonly string[] = []): Map<FileId, DirId | null> {
  const dirIds = new Map(s.dirs.map((d) => [d.path, d.id]));
  const own = new Map(s.files.map((f) => [f.id, planetHome(f.path, roots)]));
  const planets = new Set([...own.values()].flatMap((h) => h?.path ?? []));
  const planetAt = (home: Home | null | undefined) => (home && planets.has(home.path) ? dirIds.get(home.path) ?? null : null);
  const dirById = new Map(s.dirs.map((d) => [d.id, d]));
  const homeOf = (f: FileEntry): DirId | null => {
    const mine = own.get(f.id);
    if (mine) return planetAt(mine);
    if (!f.isTest || f.testOf === null) return null;
    if (own.has(f.testOf as FileId)) return planetAt(own.get(f.testOf as FileId));
    const dir = dirById.get(f.testOf as DirId);
    return dir ? planetAt(folderHome(dir.path, roots)) : null;
  };
  return new Map(s.files.map((f) => [f.id, homeOf(f)]));
}

/**
 * Changes in `commits` (the lineage log behind a PathHistory, first entry at `firstSeq`) that the
 * snapshot's commit at that seq has no row for, on paths the scan doesn't exclude.
 */
export function unrowedChanges(s: SnapshotV02, commits: LineageCommit[], firstSeq: number, excluded: (path: string) => boolean = () => false): Unrowed[] {
  const bySeq = new Map(s.commits.map((c) => [c.seq, new Set(c.files.map((r) => r[0]))]));
  const out: Unrowed[] = [];
  commits.forEach((c, i) => {
    const rows = bySeq.get(firstSeq + i);
    // A commit missing from the snapshot is a gap, which fogBase handles.
    if (!rows) return;
    for (const ch of c.changes) if (ch.status !== 'D' && !excluded(ch.path) && !rows.has(ch.path)) out.push({ seq: firstSeq + i, path: ch.path });
  });
  return out;
}

/** One commit that touched a file under one of its names. `content`: false for a pure rename or mode change (0 lines either way). */
interface Touch { seq: number; reasons: FogReason[]; content: boolean }
/**
 * File `file` had id `id`, at `path`, in the state after each commit `from`..`to`. A name the file
 * already had before the window starts at the window's first seq minus one.
 */
interface Name { file: number; from: number; to: number; path: string }

/**
 * Everything fog needs that doesn't depend on chart state, so a chart write only re-runs fogFrom.
 * Build it once per (snapshot, history) with fogBase.
 */
export interface FogBase {
  readonly snapshot: SnapshotV02;
  /** snapshot.files sorted by id: the order of every per-file array. */
  readonly files: readonly FileEntry[];
  readonly home: ReadonlyMap<FileId, DirId | null>;
  /** No usable path history: renames can't be followed, so every touch may hide older changes. */
  readonly degraded: boolean;
  readonly seqOf: ReadonlyMap<Sha, number>;
  /** SHA for every seq a file's fog can point at (a gap in the window points at the commit after it). */
  readonly shaAt: ReadonlyMap<number, Sha>;
  readonly touches: readonly (readonly Touch[])[];
  /** Per file: seqs past which its history can't be followed. */
  readonly unknownAt: readonly (readonly number[])[];
  /** Which file carried each id, and when. */
  readonly names: ReadonlyMap<FileId, readonly Name[]>;
}

const isContent = (row: CommitFile) => row[1] + row[2] > 0;

function bySeqOf<T extends { seq: number }>(items: readonly T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const x of items) {
    const list = out.get(x.seq);
    if (list) list.push(x);
    else out.set(x.seq, [x]);
  }
  return out;
}

/**
 * Walks the window back from HEAD. Before commit `seq` is undone, byPath and curId name each file
 * as it was just after that commit, which is how a chart taken at that commit names it. `history`
 * must cover the snapshot's window; anything else counts as no history. `roots` are the content
 * roots of the layout beside the snapshot (#71), so fog counts the planets the view draws.
 */
export function fogBase(snapshot: SnapshotV02, history: PathHistory | null, roots: readonly string[] = []): FogBase {
  const files = [...snapshot.files].sort((a, b) => byCodepoint(a.id, b.id));
  const self = new Set<PersonId>(snapshot.repo.selfPersonIds);
  const bySeq = new Map(snapshot.commits.map((c) => [c.seq, c]));
  const seqOf = new Map(snapshot.commits.map((c) => [c.sha, c.seq]));
  let [minSeq, headSeq] = [Infinity, -1];
  for (const c of snapshot.commits) [minSeq, headSeq] = [Math.min(minSeq, c.seq), Math.max(headSeq, c.seq)];
  const usable = history !== null && bySeq.get(headSeq)?.sha === snapshot.repo.head && history.from <= minSeq && history.to === headSeq;
  const renamesAt = bySeqOf(usable ? history.renames : []);
  const birthsAt = bySeqOf(usable ? history.births : []);
  const unrowedAt = bySeqOf(usable ? history.unrowed ?? [] : []);

  const shaAt = new Map<number, Sha>();
  const touches: Touch[][] = files.map(() => []);
  const unknownAt: number[][] = files.map(() => []);
  const names = new Map<FileId, Name[]>();
  const byPath = new Map(files.map((f, i) => [f.path, i]));
  const curId = files.map((f) => f.id);
  const curPath = files.map((f) => f.path);
  const nameTo = files.map(() => headSeq);
  const endName = (i: number, from: number) => {
    const list = names.get(curId[i]!) ?? [];
    list.push({ file: i, from, to: nameTo[i]!, path: curPath[i]! });
    names.set(curId[i]!, list);
  };

  let after: Sha | undefined;
  for (let seq = headSeq; seq >= minSeq; seq--) {
    const c = bySeq.get(seq);
    if (!c) {
      // A gap in the window (the date filter skipped a commit): what it changed isn't known.
      shaAt.set(seq, after!);
      for (const i of byPath.values()) unknownAt[i]!.push(seq);
    } else {
      shaAt.set(seq, (after = c.sha));
      const reasons = reasonsOf(c, self);
      for (const row of c.files) {
        const i = byPath.get(row[0]);
        if (i === undefined) continue; // a path no file at HEAD had after this commit
        touches[i]!.push({ seq, reasons, content: isContent(row) });
        // Without history any touch may be a rename hiding older changes.
        if (!usable) unknownAt[i]!.push(seq);
      }
      // What a change without a row did isn't visible, so it counts as a content change.
      for (const u of unrowedAt.get(seq) ?? []) {
        const i = byPath.get(u.path);
        if (i !== undefined) touches[i]!.push({ seq, reasons, content: true });
      }
    }
    // Undo the commit: a birth ends a file's history, a rename moves it back to its old name.
    for (const b of birthsAt.get(seq) ?? []) {
      const i = byPath.get(b.path);
      if (i === undefined) continue;
      byPath.delete(b.path);
      endName(i, seq);
      if (b.unsure) unknownAt[i]!.push(seq);
    }
    const moves: [from: string, file: number][] = [];
    for (const r of renamesAt.get(seq) ?? []) {
      const i = byPath.get(r.to);
      if (i === undefined) continue;
      byPath.delete(r.to);
      endName(i, seq);
      moves.push([r.from, i]);
    }
    for (const [from, i] of moves) {
      const j = byPath.get(from);
      if (j !== undefined) {
        // Two files claim one old name (inconsistent history): neither can be followed past here.
        unknownAt[i]!.push(seq);
        unknownAt[j]!.push(seq);
        byPath.delete(from);
        endName(j, seq);
        continue;
      }
      byPath.set(from, i);
      curId[i] = fileIdOf(from);
      curPath[i] = from;
      nameTo[i] = seq - 1;
    }
  }
  // Still here after undoing the window's first commit: the file had this name before the window too.
  for (const i of byPath.values()) endName(i, minSeq - 1);
  return { snapshot, files, home: homes(snapshot, roots), degraded: !usable, seqOf, shaAt, touches, unknownAt, names };
}

/** The HEAD file a chart entry reviewed and the entry's seq; null when it can't be placed in the window. */
function place(base: FogBase, e: ChartEntry): { file: number; seq: number } | null {
  const seq = base.seqOf.get(e.at);
  if (seq === undefined) return null; // before the window or off HEAD's first-parent line: reviews nothing in it
  const name = base.names.get(e.fileId)?.find((n) => n.from <= seq && seq <= n.to);
  return name ? { file: name.file, seq } : null;
}

/** The id at HEAD of the file a chart entry reviewed, or null when it can't be placed (see place). */
export function chartedFileId(base: FogBase, e: ChartEntry): FileId | null {
  const p = place(base, e);
  return p ? base.files[p.file]!.id : null;
}

function fileFog(base: FogBase, i: number, through: number): FileFog {
  const fileId = base.files[i]!.id;
  const why = new Set<FogReason>();
  let since = Infinity;
  let notYours = false;
  const fog = (seq: number, reasons: FogReason[]) => {
    for (const r of reasons) why.add(r);
    since = Math.min(since, seq);
  };
  for (const x of base.touches[i]!) {
    if (!x.content || x.reasons.length === 0) continue;
    notYours = true;
    if (x.seq > through) fog(x.seq, x.reasons);
  }
  for (const seq of base.unknownAt[i]!) {
    notYours = true;
    if (seq > through) fog(seq, ['lineage-unknown']);
  }
  if (why.size === 0) return { fileId, state: notYours ? 'charted' : 'clear', reasons: [], since: null };
  return { fileId, state: 'fogged', reasons: [...why].sort(byCodepoint), since: base.shaAt.get(since)! };
}

/** The latest baseline in the window, and per file the seq it's reviewed through (-1: nothing yet). */
function reviewedThrough(base: FogBase, chart: ChartState): { baseline: { sha: Sha; seq: number } | null; reviewed: number[] } {
  let baseline: { sha: Sha; seq: number } | null = null;
  for (const sha of chart.baselines) {
    const seq = base.seqOf.get(sha);
    if (seq !== undefined && seq > (baseline?.seq ?? -1)) baseline = { sha, seq };
  }
  const reviewed = base.files.map(() => baseline?.seq ?? -1);
  for (const e of chart.charts) {
    const p = place(base, e);
    if (p) reviewed[p.file] = Math.max(reviewed[p.file]!, p.seq);
  }
  return { baseline, reviewed };
}

/** The fog view for `chart` on a prepared base. */
export function fogFrom(base: FogBase, chart: ChartState): FogView {
  const { baseline, reviewed } = reviewedThrough(base, chart);
  const files = base.files.map((_, i) => fileFog(base, i, reviewed[i]!));
  const planets = new Map<DirId, FogCounts>();
  for (const id of base.home.values()) if (id !== null && !planets.has(id)) planets.set(id, { total: 0, fogged: 0 });
  const star: FogCounts = { total: 0, fogged: 0 };
  for (const f of files) {
    const id = base.home.get(f.fileId);
    const counts = id ? planets.get(id)! : star;
    counts.total++;
    if (f.state === 'fogged') counts.fogged++;
  }
  return {
    schemaVersion: 'fog.1',
    head: base.snapshot.repo.head,
    baseline: baseline?.sha ?? null,
    files,
    planets: [...planets].sort((a, b) => byCodepoint(a[0], b[0])).map(([dirId, c]) => ({ dirId, ...c })),
    star,
  };
}

/**
 * The fog view (contract `fog.1`). A file is fogged while any change to it since its last chart (or
 * the baseline) isn't yours: agent, mixed, teammate, unknown, or committed by you but written by an
 * agent. Only content changes count, so a pure rename never fogs. `history` is the PathHistory for the
 * snapshot's window, or null when it couldn't be read.
 */
export const fogView = (snapshot: SnapshotV02, chart: ChartState, history: PathHistory | null, roots: readonly string[] = []): FogView =>
  fogFrom(fogBase(snapshot, history, roots), chart);

/**
 * Where a file's unseen diff starts (#75): the first-parent parent of its oldest unseen change. That
 * is the snapshot's commit just below the change (`{ sha }`), or, below the window's first commit,
 * that commit's parent, which the snapshot doesn't hold (`{ parentOf }`; there is none at the root).
 * Never `since^`: for a window gap `since` is the commit after the gap, so its parent would leave the
 * gap's own change out.
 */
export type RangeStart = { sha: Sha } | { parentOf: Sha };

/**
 * One file's unseen range, from the server's own fog (never the client's): GET /api/diff diffs
 * `start..head` over `path`, plus `oldPath`, the path the file had at `start` when that differs (a
 * rename inside the range; null when it's the same or the file didn't exist yet). `since` and
 * `start` are null when nothing is unseen.
 */
export interface UnseenRange { path: string; oldPath: string | null; since: Sha | null; start: RangeStart | null }

/** The unseen range of the file `fileId` names at HEAD, or null when no file at HEAD has that id. */
export function unseenRange(base: FogBase, chart: ChartState, fileId: FileId): UnseenRange | null {
  const i = base.files.findIndex((f) => f.id === fileId);
  if (i < 0) return null;
  const path = base.files[i]!.path;
  const { since } = fileFog(base, i, reviewedThrough(base, chart).reviewed[i]!);
  if (since === null) return { path, oldPath: null, since: null, start: null };
  // For a gap, `since` is the commit just above it (shaAt), with only gaps between: the latest commit
  // below `since` is the latest below the gap too.
  const sinceSeq = base.seqOf.get(since)!;
  let below: Commit | null = null;
  let first: Commit | null = null;
  for (const c of base.snapshot.commits) {
    if (c.seq < sinceSeq && c.seq > (below?.seq ?? -Infinity)) below = c;
    if (c.seq < (first?.seq ?? Infinity)) first = c;
  }
  // A fogged file has a change in the window, so the window has a first commit.
  const [start, startSeq]: [RangeStart, number] = below ? [{ sha: below.sha }, below.seq] : [{ parentOf: first!.sha }, first!.seq - 1];
  const n = [...base.names.values()].flat().find((x) => x.file === i && x.from <= startSeq && startSeq <= x.to);
  return { path, oldPath: n && n.path !== path ? n.path : null, since, start };
}

/**
 * GET /api/unseen (#75): every fogged file counted on planet `home` (null: the star), surface overflow
 * included, with its path, sorted by path. Null when the base has no such planet.
 */
export function unseenFiles(base: FogBase, chart: ChartState, home: DirId | null): UnseenFile[] | null {
  if (home !== null && ![...base.home.values()].includes(home)) return null;
  const { reviewed } = reviewedThrough(base, chart);
  const out: UnseenFile[] = [];
  base.files.forEach((f, i) => {
    if ((base.home.get(f.id) ?? null) !== home) return;
    const fog = fileFog(base, i, reviewed[i]!);
    if (fog.state === 'fogged') out.push({ fileId: f.id, path: f.path, since: fog.since!, reasons: fog.reasons });
  });
  return out.sort((a, b) => byCodepoint(a.path, b.path));
}

export type ChartApplied = { ok: true; chart: ChartState } | ChartUnknownHead | { ok: false; error: string; head?: undefined };

/**
 * Applies one ChartAction (the only write vocabulary). Everything is recorded at `action.at`, the
 * head the user saw (#58), so it never covers a change newer than what they were shown: no check
 * against the current head is needed. `at` must be a commit this snapshot's window knows, else
 * `unknown-head`. `chart` records the file's id as of `at` (it must lead to a file at HEAD) and drops
 * older charts of the same file, which the new one covers. `baseline` pushes `at`; `baseline-undo`
 * pops the last baseline and touches nothing else.
 */
export function applyChartAction(base: FogBase, chart: ChartState, action: ChartAction): ChartApplied {
  if (!base.seqOf.has(action.at)) return { ok: false, error: 'unknown-head', head: base.snapshot.repo.head };
  if (action.kind === 'baseline') return { ok: true, chart: { ...chart, baselines: [...chart.baselines, action.at] } };
  if (action.kind === 'baseline-undo') {
    if (chart.baselines.length === 0) return { ok: false, error: 'no baseline to undo' };
    return { ok: true, chart: { ...chart, baselines: chart.baselines.slice(0, -1) } };
  }
  const entry: ChartEntry = { fileId: action.fileId, at: action.at };
  const mine = place(base, entry);
  if (!mine) return { ok: false, error: 'no such file at that head' };
  const kept = chart.charts.filter((e) => {
    if (byEntry(e, entry) === 0) return false;
    const p = place(base, e);
    return !p || p.file !== mine.file || p.seq > mine.seq;
  });
  return { ok: true, chart: { ...chart, charts: [...kept, entry].sort(byEntry) } };
}
