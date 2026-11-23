// Co-change constellations (#211, R9), from git history only. Pure: the scan gives coChangeOf() the
// fog's base (src/core/fog), whose per-file touches already follow renames to the file at HEAD, and gets
// the snapshot's `cochange` record; the server gives coChangeView() the same base and the chart state,
// and gets the view the map draws. Integers only (canonicalJson), no clock, codepoint order (Rule 3).
import { byCodepoint } from './canonical-json.js';
import { COCHANGE, type CoChangeFlag, type CoChangeView } from './contract/cochange.js';
import { reviewedSeqs, type ChartState, type FogBase } from './fog/index.js';
import type { CoChange, CoChangePair, FileId, MissingPair, Sha } from './snapshot/types.js';

/** One commit's content changes: indices into the file list (sorted, unique), with its seq and SHA. */
export interface TouchSet { seq: number; sha: Sha; files: readonly number[] }

type Settings = CoChange['settings'];

interface Candidate { i: number; j: number; both: number; strengthMilli: number }

/** Strongest first: strength, then shared commits, then the pair's ids (indices follow codepoint order). */
const stronger = (x: Candidate, y: Candidate) => y.strengthMilli - x.strengthMilli || y.both - x.both || x.i - y.i || x.j - y.j;

/**
 * Co-change pairs and missing pairs over `files` (sorted by codepoint) from the commits' touch sets, in
 * any order. A commit over `bulkFiles` files counts only towards each file's latest change. `head` is
 * HEAD's seq (default: the latest commit given).
 *
 * - **Pairs:** for files i and j, `both` commits held both and `seen(i) + seen(j) - both` held either;
 *   strength is their ratio ×1000, floored. A pair is kept at `minBoth` shared commits and
 *   `thresholdMilli`, and when it is among the `cap` strongest of at least one of its files (#211 AC1).
 * - **Missing pairs (recent changes only):** for a kept pair at least `flagMilli` strong over at least
 *   `flagMinBoth` shared commits, a file that didn't change in the last `flagWindow` commits (seq above
 *   `head - flagWindow`) while its partner did (AC4). An older skip counts as settled; a change that
 *   touches the file clears it. One per file: its strongest such partner, then the partner first by id.
 */
export function coChange(files: readonly FileId[], commits: readonly TouchSet[], opts: { head?: number; settings?: Settings } = {}): CoChange {
  const settings = opts.settings ?? { ...COCHANGE };
  const n = files.length;
  const seen = new Array<number>(n).fill(0);
  const last = new Array<number>(n).fill(-1);
  const lastSha = new Array<Sha | null>(n).fill(null);
  /** Per file, the counted commits it is in (indices into `counted`). */
  const inCommits: number[][] = files.map(() => []);
  const counted: (readonly number[])[] = [];
  let bulk = 0;
  for (const c of commits) {
    for (const i of c.files) if (c.seq > last[i]!) { last[i] = c.seq; lastSha[i] = c.sha; }
    if (c.files.length === 0) continue;
    if (c.files.length > settings.bulkFiles) { bulk++; continue; }
    for (const i of c.files) { seen[i]!++; inCommits[i]!.push(counted.length); }
    counted.push(c.files);
  }
  // Shared commits one file at a time, in a dense counter reused for every file (PR #214 r1, Qodo
  // 8b2e5a20): the work is still each commit's pairs, but memory stays one counter and the pairs that
  // pass, never a map of every pair seen. A file in fewer than `minBoth` commits can't pass.
  const shared = new Int32Array(n);
  const hit: number[] = [];
  const candidates: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]! < settings.minBoth) continue;
    for (const k of inCommits[i]!) {
      for (const j of counted[k]!) if (j > i && shared[j]!++ === 0) hit.push(j);
    }
    for (const j of hit) {
      const both = shared[j]!;
      shared[j] = 0;
      if (both < settings.minBoth) continue;
      const strengthMilli = Math.floor((both * 1000) / (seen[i]! + seen[j]! - both));
      if (strengthMilli >= settings.thresholdMilli) candidates.push({ i, j, both, strengthMilli });
    }
    hit.length = 0;
  }
  candidates.sort(stronger);
  // Each file's strongest `cap` pairs, in the one global order: a pair stays when either file has room.
  const room = new Array<number>(n).fill(settings.cap);
  const kept = candidates.filter((p) => {
    const keep = room[p.i]! > 0 || room[p.j]! > 0;
    if (room[p.i]! > 0) room[p.i]!--;
    if (room[p.j]! > 0) room[p.j]!--;
    return keep;
  });
  const head = opts.head ?? commits.reduce((m, c) => Math.max(m, c.seq), -1);
  const recent = (i: number) => last[i]! > head - settings.flagWindow;
  const flags = new Map<number, { with: number; strengthMilli: number }>();
  for (const p of kept) {
    if (p.strengthMilli < settings.flagMilli || p.both < settings.flagMinBoth || recent(p.i) === recent(p.j)) continue;
    const [left, by] = recent(p.j) ? [p.i, p.j] : [p.j, p.i];
    const had = flags.get(left);
    if (!had || p.strengthMilli > had.strengthMilli || (p.strengthMilli === had.strengthMilli && by < had.with)) flags.set(left, { with: by, strengthMilli: p.strengthMilli });
  }
  const pairs: CoChangePair[] = kept.sort((x, y) => x.i - y.i || x.j - y.j)
    .map((p) => ({ a: files[p.i]!, b: files[p.j]!, both: p.both, strengthMilli: p.strengthMilli }));
  const missing: MissingPair[] = [...flags].sort((x, y) => x[0] - y[0])
    .map(([i, f]) => ({ fileId: files[i]!, with: files[f.with]!, strengthMilli: f.strengthMilli, at: lastSha[f.with]! }));
  return { settings: { ...settings }, commits: counted.length, bulkCommits: bulk, pairs, missing };
}

/**
 * The snapshot's co-change record from the fog's base: each window commit's content changes (a pure
 * rename or mode change is no change), by file at HEAD, renames followed as fog follows them.
 */
export function coChangeOf(base: FogBase): CoChange {
  const bySeq = new Map<number, Set<number>>();
  base.touches.forEach((list, i) => {
    for (const t of list) {
      if (!t.content) continue;
      const set = bySeq.get(t.seq);
      if (set) set.add(i);
      else bySeq.set(t.seq, new Set([i]));
    }
  });
  const commits = [...bySeq].map(([seq, set]) => ({ seq, sha: base.shaAt.get(seq)!, files: [...set].sort((a, b) => a - b) }));
  const head = base.snapshot.commits.reduce((m, c) => Math.max(m, c.seq), -1);
  return coChange(base.files.map((f) => f.id), commits, { head });
}

const isCount = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

const SETTINGS = Object.keys(COCHANGE) as (keyof Settings)[];

/**
 * Why a stored record (snapshot.json, read back from disk) can't be served, or null: its settings whole
 * numbers; every id a file at HEAD; pairs ordered and unique, with strengths and counts in range and
 * true to the settings (no more shared commits than counted commits, at least `minBoth`, at least
 * `thresholdMilli`); every flag on a stored pair, at its strength and at least `flagMilli`, at a commit
 * of the window (PR #214 r1, Qodo 344af9c7). Never quotes the record.
 */
export function coChangeProblem(cc: unknown, base: FogBase): string | null {
  if (typeof cc !== 'object' || cc === null) return 'co-change record is not an object';
  const r = cc as Partial<CoChange>;
  if (!Array.isArray(r.pairs) || !Array.isArray(r.missing) || !isCount(r.commits) || !isCount(r.bulkCommits)) return 'co-change record has the wrong shape';
  const set = r.settings as Record<string, unknown> | undefined;
  if (typeof set !== 'object' || set === null || !SETTINGS.every((k) => isCount(set[k]))) return 'co-change settings are damaged';
  const settings = set as unknown as Settings;
  const ids = new Set<string>(base.files.map((f) => f.id));
  const strength = new Map<string, number>();
  for (const [k, p] of r.pairs.entries()) {
    if (typeof p !== 'object' || p === null || !ids.has(p.a) || !ids.has(p.b) || byCodepoint(p.a, p.b) >= 0 || !isCount(p.both, r.commits)
      || p.both < settings.minBoth || !isCount(p.strengthMilli, 1000) || p.strengthMilli < settings.thresholdMilli) return 'co-change pair is damaged';
    const prev = r.pairs[k - 1];
    if (prev && (byCodepoint(prev.a, p.a) || byCodepoint(prev.b, p.b)) >= 0) return 'co-change pairs are not sorted and unique';
    strength.set(`${p.a}\0${p.b}`, p.strengthMilli);
  }
  for (const [k, m] of r.missing.entries()) {
    if (typeof m !== 'object' || m === null || !ids.has(m.fileId) || !ids.has(m.with) || m.fileId === m.with || !base.seqOf.has(m.at)) return 'missing-pair flag is damaged';
    const pair = byCodepoint(m.fileId, m.with) < 0 ? `${m.fileId}\0${m.with}` : `${m.with}\0${m.fileId}`;
    if (m.strengthMilli < settings.flagMilli || strength.get(pair) !== m.strengthMilli) return 'missing-pair flag is damaged';
    const prev = r.missing[k - 1];
    if (prev && byCodepoint(prev.fileId, m.fileId) >= 0) return 'missing-pair flags are not sorted and unique';
  }
  return null;
}

/**
 * GET /api/cochange: the snapshot's pairs and the missing-pair flags still standing. A flag is taken out
 * (and counted in `dismissed`) once its flagged file, the partner the change left out (`fileId`, never
 * `with`), is charted at or after the change that raised it, by a chart of that file or a baseline, as fog
 * counts a review (#211: "charting the partner dismisses it", the partner being the file marked "usually
 * changes with X"; reviewing X, the file that did change, says nothing about the one it left out). Paths and
 * homes come from the fog's base, so the view names and places files as the fog counts them. The
 * stored record must have passed coChangeProblem.
 */
export function coChangeView(base: FogBase, chart: ChartState): CoChangeView {
  const s = base.snapshot;
  const cc = s.cochange;
  if (!cc) return { schemaVersion: 'cochange.1', head: s.repo.head, needsRescan: true, links: [], flags: [], dismissed: 0, files: [] };
  const index = new Map(base.files.map((f, i) => [f.id, i]));
  const reviewed = reviewedSeqs(base, chart);
  const flags: CoChangeFlag[] = [];
  let dismissed = 0;
  for (const m of cc.missing) {
    if (reviewed[index.get(m.fileId)!]! >= base.seqOf.get(m.at)!) dismissed++;
    else flags.push({ fileId: m.fileId, with: m.with, strengthMilli: m.strengthMilli, at: m.at });
  }
  const links = cc.pairs.map((p) => ({ a: p.a, b: p.b, strengthMilli: p.strengthMilli }));
  const named = new Set<string>([...links.flatMap((l) => [l.a, l.b]), ...flags.flatMap((f) => [f.fileId, f.with])]);
  const files = base.files.filter((f) => named.has(f.id)).map((f) => ({ fileId: f.id, path: f.path, home: base.home.get(f.id) ?? ('star' as const) }));
  return { schemaVersion: 'cochange.1', head: s.repo.head, needsRescan: false, links, flags, dismissed, files };
}
