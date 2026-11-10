// Deciding whether a PR's head commit has a finished review (R6). Every function here fails
// closed: anything unreadable, truncated, missing or on another commit is "pending", never clean
// (AGENTS.md "Working with Qodo": a skipped or missing review looks like a clean one).

export const shortSha = (sha: string) => sha.slice(0, 7);

export interface ReviewRun {
  run_id?: number;
  commit_sha: string;
  started_at?: string;
  status: string;
  review_effort?: string;
}

export interface Finding {
  id: string;
  title?: string;
  description?: string;
  action_level?: string;
  category?: string;
  attribution_status?: string;
  dismiss_reason?: string | null;
  location?: { file_path?: string; start_line?: number; end_line?: number };
  evidence?: { explanation?: string };
}

export interface QodoOutput {
  runs: ReviewRun[];
  findings: Finding[];
  truncated: boolean;
}

/** The first JSON object in `text` (qodo prints a `trace …` line after it). */
export function firstJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function hasTruncation(v: unknown, depth = 0): boolean {
  if (!v || typeof v !== 'object' || depth > 4) return false;
  for (const [k, x] of Object.entries(v)) {
    if (k === 'qar_operation_result_truncated' && x) return true;
    if (hasTruncation(x, depth + 1)) return true;
  }
  return false;
}

/** Parses `qodo read pr-review-session findings --extended --json`; null if it isn't that shape. */
export function parseQodo(stdout: string): QodoOutput | null {
  const o = firstJson(stdout);
  if (!o || typeof o !== 'object') return null;
  const { review_runs: runs, findings } = o as { review_runs?: unknown; findings?: unknown };
  if (!Array.isArray(runs) || !Array.isArray(findings)) return null;
  const okRun = (r: unknown): r is ReviewRun =>
    !!r && typeof (r as ReviewRun).commit_sha === 'string' && typeof (r as ReviewRun).status === 'string';
  const okFinding = (f: unknown): f is Finding => !!f && typeof (f as Finding).id === 'string';
  if (!runs.every(okRun) || !findings.every(okFinding)) return null;
  return { runs, findings, truncated: hasTruncation(o) };
}

/**
 * Open = neither implemented nor dismissed. That covers the statuses seen so far
 * (pending, partial_implementation, not_implemented, focus_areas_edited) and treats any new
 * status as open too.
 */
export const isOpen = (f: Finding) => f.dismiss_reason == null && f.attribution_status !== 'implemented';
export const isBlocking = (f: Finding) => isOpen(f) && f.action_level === 'action_required';

/** The reviewed-commit marker Qodo hides in its "Code Review by Qodo" comment; the last one wins. */
export function qodoMarker(commentBodies: string, slug: string): string | null {
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<!-- https://github\\.com/${esc}/commit/([0-9a-f]{40}) -->`, 'g');
  let last: string | null = null;
  for (const m of commentBodies.matchAll(re)) last = m[1]!;
  return last;
}

export type QodoState =
  | { kind: 'pending'; why: string; ids?: string[] }
  | { kind: 'skipped'; run: ReviewRun }
  | { kind: 'complete'; run: ReviewRun; findings: Finding[] };

/**
 * Done when, for the head commit: the latest run completed and wasn't skipped, the output isn't
 * truncated, the comment marker names the head, and the finding ids match the previous poll's
 * on a poll at least `settleMs` after the run started (findings land after the marker moves).
 * `prevIds` are the ids from the previous poll if that poll was complete on this head, else null.
 */
export function qodoState(
  q: QodoOutput | null, head: string, marker: string | null, prevIds: string[] | null,
  nowMs: number, firstSeenMs: number, settleMs: number,
): QodoState {
  if (!q) return { kind: 'pending', why: 'qodo output unreadable' };
  const onHead = q.runs.filter((r) => r.commit_sha === head);
  if (!onHead.length) return { kind: 'pending', why: 'no review run on head yet' };
  const run = onHead.reduce((a, b) => ((Date.parse(b.started_at ?? '') || 0) > (Date.parse(a.started_at ?? '') || 0) ? b : a));
  if (run.review_effort === 'skip') return { kind: 'skipped', run };
  if (run.status !== 'completed') return { kind: 'pending', why: `run status ${run.status}` };
  if (q.truncated) return { kind: 'pending', why: 'qodo output truncated' };
  if (marker !== head) return { kind: 'pending', why: `comment marker on ${marker ? shortSha(marker) : 'none'}` };
  const ids = q.findings.map((f) => f.id).sort();
  const started = Date.parse(run.started_at ?? '');
  const since = Number.isFinite(started) ? started : firstSeenMs;
  if (nowMs - since < settleMs) return { kind: 'pending', why: 'settling', ids };
  if (!prevIds || prevIds.join(',') !== ids.join(',')) return { kind: 'pending', why: 'finding ids not yet stable', ids };
  return { kind: 'complete', run, findings: q.findings };
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export type CiState =
  | { kind: 'pending'; why: string }
  | { kind: 'complete'; runs: CheckRun[]; failed: CheckRun[] };

/** Conclusions GitHub's required status checks accept as passing. */
const PASSING = new Set(['success', 'neutral', 'skipped']);

/**
 * CI is clean when every check run on the head completed and passed. Zero runs, or fewer runs
 * than the API's `total_count` (another page), is pending: an unseen run is not a passing one.
 */
export function ciState(checkRunsJson: string): CiState {
  const o = firstJson(checkRunsJson) as { check_runs?: unknown; total_count?: unknown } | null;
  if (!o || !Array.isArray(o.check_runs)) return { kind: 'pending', why: 'check runs unreadable' };
  const runs = o.check_runs as CheckRun[];
  if (!runs.length) return { kind: 'pending', why: 'no check runs yet' };
  if (typeof o.total_count === 'number' && o.total_count > runs.length) return { kind: 'pending', why: `only ${runs.length} of ${o.total_count} check runs visible` };
  const open = runs.filter((r) => r.status !== 'completed');
  if (open.length) return { kind: 'pending', why: `${open.length} check run(s) ${open[0]!.status}` };
  return { kind: 'complete', runs, failed: runs.filter((r) => !PASSING.has(r.conclusion ?? '')) };
}
