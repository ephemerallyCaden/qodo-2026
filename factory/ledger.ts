// The repeat-findings ledger (docs/features/repeat-findings.md R2, R5): one entry per Qodo finding
// id, where each was seen, which source (ticket) that is, and the group the judge put it in. Pure;
// repeats.ts reads the inputs and writes the file.
import type { ExecResult } from './exec.js';
import { iso } from './log.js';
import { firstJson, parseQodo, type Finding, type ReviewRun } from './review.js';

/** A group becomes a rule proposal at this many findings from this many sources (R5). */
export const THRESHOLD = { findings: 3, sources: 2 } as const;
/** Garbled judge answers a finding (or drafts a group) may get before it's set aside. */
export const MAX_ATTEMPTS = 3;

export interface LedgerFinding {
  id: string;
  title: string;
  description: string;
  category: string;
  file: string | null;
  /** When the review that raised it started (ISO), if known. */
  reviewedAt: string | null;
  /** Where it was seen: `pr:<N>` or `file:<path under the evidence dir>`. One id, however many places. */
  origins: string[];
  /** History: reviewed at or before the ledger's seed cutoff (R9). It counts, but never triggers a proposal. */
  seed: boolean;
  /** Qodo dismissed it as a false positive: recorded, never judged or counted. */
  falsePositive: boolean;
  group: string | null;
  judgeAttempts: number;
  /** Set aside after MAX_ATTEMPTS garbled answers; every sweep's summary counts these. */
  unjudgeable: boolean;
}

export interface LedgerPr {
  number: number;
  head: string;
  /** Tickets it works on: closing keywords in its body, the number in its branch, a `(#N)` title suffix. */
  tickets: number[];
  /** GitHub's `updatedAt` when its findings were last fully read and settled; null until then (R4). */
  readAt: string | null;
  /** The head review and finding ids its last complete read saw: a PR is settled once two reads agree. */
  settleKey?: string | null;
  /** When its findings were last read whole: anything new after that was raised after it. */
  lastReadAt?: string | null;
  /** The start of its latest real (not skipped) review, for `--seed-through`. */
  lastReviewAt: string | null;
}

export interface LedgerFile {
  size: number;
  mtimeMs: number;
  /** A complete local review export, fully ingested. Anything else is re-read next sweep (R4). */
  done: boolean;
}

export interface Draft {
  mistake: string;
  rule: { name: string; what: string; where: string; why: string };
  category: string;
  criteria: string[];
}

export interface Group {
  id: string;
  mistake: string;
  /** The `rule-proposal` issue, once opened. */
  issue: number | null;
  /** Finding ids the issue already lists, in its body or a comment. */
  reported: string[];
  /** The judge's draft, kept so a failed rule search or issue create doesn't pay for it twice. */
  draft: Draft | null;
  draftAttempts: number;
}

export interface Ledger {
  version: 1;
  /**
   * Findings reviewed at or before this time are history (R9): when the ledger was created, or
   * the `--seed-through` PR's latest review. History a seeding sweep couldn't read yet stays history.
   */
  seedCutoff: string;
  prs: Record<string, LedgerPr>;
  files: Record<string, LedgerFile>;
  findings: Record<string, LedgerFinding>;
  groups: Record<string, Group>;
}

export const emptyLedger = (seedCutoff: string): Ledger => ({ version: 1, seedCutoff, prs: {}, files: {}, findings: {}, groups: {} });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The ledger in `text`, or null if it isn't one (damaged state is reported, never reset). */
export function parseLedger(text: string): Ledger | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(o) || o['version'] !== 1 || typeof o['seedCutoff'] !== 'string') return null;
  if (!['prs', 'files', 'findings', 'groups'].every((k) => isRecord(o[k]))) return null;
  const findings = Object.values(o['findings'] as Record<string, unknown>);
  const origins = (f: Record<string, unknown>) => Array.isArray(f['origins']) && f['origins'].length > 0 && f['origins'].every((o) => typeof o === 'string');
  const groups = o['groups'] as Record<string, unknown>;
  const group = (f: Record<string, unknown>) => f['group'] == null || (typeof f['group'] === 'string' && f['group'] in groups);
  if (!findings.every((f) => isRecord(f) && typeof f['id'] === 'string' && origins(f) && group(f))) return null;
  return o as unknown as Ledger;
}

// ----- inputs -----

/** The tickets a PR works on (a source is one ticket, R5). */
export function prTickets(pr: { title: string; body?: string; headRefName: string }): number[] {
  const out = new Set<number>();
  for (const m of (pr.body ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi)) out.add(Number(m[1]));
  const branch = /^[a-z]+\/(\d+)-/.exec(pr.headRefName);
  if (branch) out.add(Number(branch[1]));
  const title = /\(#(\d+)(?: AC \d+)?\)\s*$/.exec(pr.title);
  if (title) out.add(Number(title[1]));
  return [...out].sort((a, b) => a - b);
}

/** One ISO form (`…T11:34:32.697Z`) for Qodo's `Z` and local exports' `+00:00` times, so they compare as strings. */
function isoTime(t: unknown): string | null {
  const ms = typeof t === 'string' ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? iso(ms) : null;
}

/** Codepoint order (never `localeCompare`). */
export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** When the run on the finding's commit started, else the PR's first run, else unknown. */
function runTime(runs: ReviewRun[], sha: string | undefined): string | null {
  const times = (rs: ReviewRun[]) => rs.map((r) => isoTime(r.started_at)).filter((t): t is string => !!t).sort();
  return times(runs.filter((r) => r.commit_sha === sha))[0] ?? times(runs)[0] ?? null;
}

/** Run statuses that are over. Anything else (queued, in progress, a status not seen yet) is a partial read (R4). */
const TERMINAL = new Set(['completed', 'aborted', 'superseded']);

export type PrRead =
  /**
   * Complete: ingest. `unfinished` says why the PR must still be read again: its latest run was
   * skipped, or no real review covers its head yet (findings for that push may still come).
   */
  | {
    kind: 'complete'; findings: Finding[]; runs: ReviewRun[]; unfinished: string | null; lastReviewAt: string | null;
    /** When the latest real review of the head started, and that review plus the sorted finding ids: for the settle check. */
    headReviewAt: string | null; settleKey: string;
  }
  | { kind: 'failed'; why: string };

/**
 * Classifies one `qodo read pr-review-session findings --extended --json` result for a PR whose
 * head is `head`. Fails closed: a failed, timed-out, unreadable, truncated or still-running read
 * is `failed`, and nothing in it is ingested. A skipped latest run isn't a review, and a head no
 * real review covers may still get findings, so either way the PR stays unread and is read again.
 */
export function classifyPrRead(res: ExecResult, head: string): PrRead {
  if (res.timedOut) return { kind: 'failed', why: 'qodo timed out' };
  if (res.code !== 0) return { kind: 'failed', why: `qodo exit ${res.code}` };
  const parsed = parseQodo(res.stdout);
  if (!parsed) return { kind: 'failed', why: 'qodo output unreadable' };
  if (parsed.truncated) return { kind: 'failed', why: 'qodo output truncated' };
  const open = parsed.runs.find((r) => !TERMINAL.has(r.status));
  if (open) return { kind: 'failed', why: `a review run is ${open.status}` };
  const at = (r: ReviewRun) => isoTime(r.started_at) ?? '';
  const byTime = parsed.runs.filter((r) => r.status === 'completed').sort((a, b) => cmp(at(a), at(b)));
  const real = byTime.filter((r) => r.review_effort !== 'skip');
  const headReviewAt = isoTime(real.filter((r) => r.commit_sha === head).at(-1)?.started_at);
  const unfinished = byTime.at(-1)?.review_effort === 'skip' ? 'its latest review was skipped'
    : !real.some((r) => r.commit_sha === head) ? 'no review of its head yet' : null;
  return {
    kind: 'complete', findings: parsed.findings, runs: parsed.runs, unfinished, lastReviewAt: isoTime(real.at(-1)?.started_at),
    headReviewAt, settleKey: `${headReviewAt}|${parsed.findings.map((f) => f.id).sort().join(',')}`,
  };
}

/**
 * Why a complete read can't mark the PR done yet, or null. Findings land after a run completes
 * (the runner's own done-check waits for them, review.ts), so the head's review must be at least
 * `settleMs` old and the previous complete read must have seen the same head review and ids.
 */
export function unsettled(read: Extract<PrRead, { kind: 'complete' }>, prevKey: string | null | undefined, nowMs: number, settleMs: number): string | null {
  if (read.unfinished) return read.unfinished;
  if (!read.headReviewAt || nowMs - Date.parse(read.headReviewAt) < settleMs) return 'its latest review is still settling';
  if (prevKey !== read.settleKey) return 'its findings may still be landing';
  return null;
}

export type LocalExport =
  | { kind: 'export'; findings: Finding[]; reviewedAt: string | null }
  | { kind: 'partial'; why: string }
  /** Some other JSON in the evidence folder (a PR read, a rules dump, a report). */
  | { kind: 'other' };

/** Named like a local review export (`t16-local/…`, `<branch>-local-r1.json`, `qodo-local-review-r2.json`). */
export const namedLikeExport = (path: string) => /(^|[-/])local([-./]|$)/.test(path);

/**
 * A local `qodo review --json` export: `findings` plus `finding_state`. Fails closed: an error
 * export, an incomplete finding state or coverage, a skipped review, or a file named like an
 * export that isn't valid JSON (cut off mid-write) is `partial` (R4).
 */
export function parseLocalExport(text: string, named = false): LocalExport {
  const o = firstJson(text);
  if (o === null && named) return { kind: 'partial', why: 'not valid JSON' };
  if (!isRecord(o)) return { kind: 'other' };
  // A failed review is partial even beside findings and complete-looking state (PR #99 d1546926).
  if ('error' in o) return { kind: 'partial', why: 'the review failed' };
  if (!Array.isArray(o['findings']) || !isRecord(o['finding_state'])) return { kind: 'other' };
  const findings = o['findings'] as unknown[];
  if (!findings.every((f) => isRecord(f) && typeof f['id'] === 'string')) return { kind: 'partial', why: 'a finding has no id' };
  if (o['finding_state']['complete'] !== true) return { kind: 'partial', why: 'finding_state is not complete' };
  const meta = isRecord(o['meta']) ? o['meta'] : {};
  if (!isRecord(meta['coverage']) || meta['coverage']['complete'] !== true) return { kind: 'partial', why: 'coverage is not confirmed complete' };
  const run = isRecord(meta['run']) ? meta['run'] : {};
  const effort = isRecord(run['effort']) ? run['effort']['effective'] : undefined;
  if (effort === 'skip') return { kind: 'partial', why: 'the review was skipped' };
  const timing = isRecord(run['timing']) ? run['timing'] : {};
  return { kind: 'export', findings: findings as Finding[], reviewedAt: isoTime(timing['started_at']) };
}

/**
 * A repo-relative path, or null: nothing absolute, home-relative or outside the repo goes into a
 * post (R8), and nothing that could close the code span it's shown in.
 */
function repoPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p || /^([/\\~]|[A-Za-z]:)/.test(p) || /[`\r\n]/.test(p) || p.split(/[/\\]/).includes('..')) return null;
  return p;
}

/** Bounds on kept text, so one finding can't blow up a judge prompt (passed as one argument) or a post. */
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 2000;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Adds a read's findings to the ledger: a new id gets an entry, a known id gains the origin (a
 * later poll, a re-listed id, a local id carried into the PR is the same finding, R2). Returns the
 * new ids. Title and description stay as first seen; dismissal follows the latest read. A finding
 * reviewed at or before the seed cutoff is history (R9).
 */
export function ingest(l: Ledger, origin: string, findings: Finding[], reviewedAt: (f: Finding) => string | null): string[] {
  const added: string[] = [];
  for (const f of findings) {
    const falsePositive = f.dismiss_reason === 'false_positive';
    const known = l.findings[f.id];
    if (known) {
      if (!known.origins.includes(origin)) known.origins.push(origin);
      // Dismissals live on the PR; a local export never carries one, so it can't undo it (PR #99 30ccac80).
      known.falsePositive = origin.startsWith('pr:') ? falsePositive : known.falsePositive || falsePositive;
      continue;
    }
    const at = reviewedAt(f);
    l.findings[f.id] = {
      id: f.id, title: clip(oneLine(f.title ?? ''), MAX_TITLE), description: clip(oneLine(f.description ?? ''), MAX_DESCRIPTION), category: f.category ?? '',
      file: repoPath(f.location?.file_path), reviewedAt: at, origins: [origin],
      seed: isHistory(l, at), falsePositive, group: null, judgeAttempts: 0, unjudgeable: false,
    };
    added.push(f.id);
  }
  return added;
}

/** History is what was reviewed at or before the cutoff; a finding with no known time counts as history. */
export const isHistory = (l: Ledger, reviewedAt: string | null) => reviewedAt === null || reviewedAt <= l.seedCutoff;

/**
 * When a PR finding was raised: the run on its commit, or, for a finding missing from the PR's
 * last whole read, just after that read. Later runs on one commit can raise new findings, and
 * the commit's first run would date them too early (into history).
 */
export const prReviewedAt = (runs: ReviewRun[], lastReadAt?: string | null) => (f: Finding) => {
  const t = runTime(runs, f.git_sha);
  const after = lastReadAt ? iso(Date.parse(lastReadAt) + 1) : null;
  return after && (t === null || t < after) ? after : t;
};

/** Collapses a text to one line, so nothing quoted into a post can start a heading or a list item. */
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

// ----- sources (R5) -----

const ROUND_WORDS = /^(local|qodo|review|rereview|incomplete|extended|comments|r\d+)$/i;

/**
 * The name a local export is filed under: `t16-local/t16-qodo-r2.json` → `t16`,
 * `day5-rules-local-r1.json` → `day5-rules`, `pr-view/qodo-local-r1.json` → `pr-view`.
 */
export function exportStem(path: string): string {
  const parts = path.split('/');
  const base = parts.at(-1)!.replace(/\.json$/i, '');
  const words = base.split('-');
  while (words.length && ROUND_WORDS.test(words.at(-1)!)) words.pop();
  return words.join('-') || (parts.length > 1 ? parts.at(-2)! : base.replace(/-r\d+$/i, ''));
}

/** `t16` → ticket 16 (`t31b`, `t32ac8` too); `pr27` → PR 27. */
function stemTarget(stem: string): string | null {
  const t = /^t(\d+)(?:[a-z][a-z0-9]*)?$/.exec(stem);
  if (t) return `ticket:${Number(t[1])}`;
  const p = /^pr(\d+)$/.exec(stem);
  return p ? `pr:${Number(p[1])}` : null;
}

/** Day PRs share a session branch, so it says nothing about which ticket a PR is. */
const isSessionBranch = (head: string) => /^session\//.test(head);

/** A stem names a branch when it equals the branch's last segment, ignoring a ticket number and a `pr-` prefix. */
function stemMatchesBranch(stem: string, head: string): boolean {
  const last = head.split('/').at(-1)!;
  // Also the whole branch with its slashes flattened: `feature-repeat-findings-local-r1.json` (PR #99 ead2defd).
  const names = new Set([last, last.replace(/^\d+-/, ''), head.replace(/\//g, '-')]);
  return names.has(stem) || names.has(stem.replace(/^pr-/, ''));
}

export interface Sources {
  /** The source (a union-find root) a finding belongs to. */
  of(f: LedgerFinding): string;
  /**
   * Whether the finding can supply a source. A Day PR (head `session/*`) re-reviews work that has
   * its own tickets, so a finding seen only on Day PRs counts toward a group's total, never as a source.
   */
  counted(f: LedgerFinding): boolean;
  /** How a source reads in a post: `#16`, `PR #3` or a local export name. */
  label(source: string): { text: string; ticket: number | null; pr: number | null };
}

/**
 * Sources are tickets (R5). A PR joins its tickets and its branch (not a shared session branch);
 * a local export joins the ticket or PR its name gives, or a PR whose branch it names; and every
 * place one finding id was seen joins up, since local and PR reviews share ids.
 */
export function sources(l: Ledger): Sources {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  const prs = Object.values(l.prs);
  const dayPr = (origin: string) => origin.startsWith('pr:') && isSessionBranch(l.prs[origin.slice(3)]?.head ?? '');
  for (const pr of prs) {
    const node = `pr:${pr.number}`;
    find(node);
    // A Day PR joins nothing: not the tickets it closes, not its shared branch (PR #99 cd40c8b1).
    if (isSessionBranch(pr.head)) continue;
    for (const t of pr.tickets) union(node, `ticket:${t}`);
    union(node, `branch:${pr.head}`);
  }
  for (const path of Object.keys(l.files)) {
    const stem = exportStem(path);
    union(`file:${path}`, `stem:${stem}`);
    const target = stemTarget(stem);
    if (target) union(`stem:${stem}`, target);
    for (const pr of prs) if (!isSessionBranch(pr.head) && stemMatchesBranch(stem, pr.head)) union(`stem:${stem}`, `pr:${pr.number}`);
  }
  // Every place one id was seen joins up, except a Day PR, which would bridge separate tickets.
  const placed = (f: LedgerFinding) => f.origins.filter((o) => !dayPr(o));
  for (const f of Object.values(l.findings)) {
    const [first, ...rest] = placed(f);
    for (const o of rest) union(first!, o);
  }

  const members = new Map<string, string[]>();
  for (const node of parent.keys()) push(members, find(node), node);
  const nums = (nodes: string[], kind: string) => nodes.filter((n) => n.startsWith(`${kind}:`)).map((n) => Number(n.slice(kind.length + 1))).sort((a, b) => a - b);
  return {
    of: (f) => find(placed(f)[0] ?? f.origins[0]!),
    counted: (f) => !f.origins.every(dayPr),
    label: (source) => {
      const nodes = members.get(source) ?? [source];
      const ticket = nums(nodes, 'ticket')[0] ?? null;
      const pr = nums(nodes, 'pr')[0] ?? null;
      const stem = nodes.find((n) => n.startsWith('stem:'))?.slice(5);
      return { text: ticket !== null ? `#${ticket}` : pr !== null ? `PR #${pr}` : `local review "${stem ?? source}"`, ticket, pr };
    },
  };
}

// ----- groups (R5) -----

export interface GroupState {
  group: Group;
  /** Counted findings: not false positives, not set aside. */
  members: LedgerFinding[];
  /** The distinct sources its members supply (a Day PR supplies none, R5). */
  sources: string[];
  meets: boolean;
  /** At least one member isn't history, so meeting the threshold may open a proposal (R9). */
  live: boolean;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

/** Each group's counted findings (not false positives), oldest review first. */
export function membersByGroup(l: Ledger): Map<string, LedgerFinding[]> {
  const m = new Map<string, LedgerFinding[]>();
  for (const f of Object.values(l.findings).sort(byReview)) if (f.group && !f.falsePositive && !f.unjudgeable) push(m, f.group, f);
  return m;
}

export function groupStates(l: Ledger, src: Sources = sources(l)): GroupState[] {
  const byGroup = membersByGroup(l);
  return Object.values(l.groups).map((group) => {
    const members = byGroup.get(group.id) ?? [];
    const srcs = [...new Set(members.filter((f) => src.counted(f)).map((f) => src.of(f)))].sort();
    return {
      group, members, sources: srcs,
      meets: members.length >= THRESHOLD.findings && srcs.length >= THRESHOLD.sources,
      live: members.some((f) => !f.seed),
    };
  });
}

/** Oldest review first, then by id: the judge sees history before what's new. */
export const byReview = (a: LedgerFinding, b: LedgerFinding) => cmp(a.reviewedAt ?? '', b.reviewedAt ?? '') || cmp(a.id, b.id);

/** Findings still waiting for the judge, in the order it should see them. */
export const unjudged = (l: Ledger) => Object.values(l.findings).filter((f) => !f.group && !f.falsePositive && !f.unjudgeable).sort(byReview);

/** A new group's id: `g-` and its founding finding's id prefix, so a rebuilt ledger finds its old issue again. */
export function groupId(l: Ledger, founder: string): string {
  for (const n of [8, 13, founder.length]) {
    const id = `g-${founder.slice(0, n)}`;
    if (!l.groups[id]) return id;
  }
  let k = 2;
  while (l.groups[`g-${founder}-${k}`]) k++;
  return `g-${founder}-${k}`;
}
