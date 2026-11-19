import { byCodepoint } from '../core/canonical-json.js';
import { classify } from '../core/classify.js';
import { DETAIL_BUCKETS } from '../core/contract/drones.js';
import { u32 } from '../core/hash.js';
import type { CommitAttribution, FileId, Session, SessionKey } from '../core/snapshot/types.js';
import { isoUtc } from '../core/time.js';
import type { EditEvent, SessionMeta } from './parsers/claude.js';

export interface MatchCommit {
  sha: string;
  /** Committer time: edits after it can't be in the commit. */
  dateMs: number;
  isSelf: boolean;
  isMerge: boolean;
  /** Committed inside a span the agent logs cover, and outside any span they couldn't read. */
  covered: boolean;
  /** Committed inside a transcript that dropped a record which could have held an edit. */
  partial: boolean;
  /** Countable added-line hashes per non-excluded path (empty before the logs begin). */
  added: Map<string, string[]>;
  /** Its patch couldn't be read completely (#38), so `added` may be missing lines: never human. */
  patchIncomplete: boolean;
  /** Sessions whose `git commit` output named this commit. */
  ranBy: Set<SessionKey>;
  /** Sessions running a commit-creating git command when this commit was made (Qodo PR6 #2). */
  ranByCommand: Set<SessionKey>;
}

export interface MatchResult {
  attribution: CommitAttribution;
  agentLines: Map<string, number>;
}

/**
 * Verbatim line matching (design §5.2). A commit line is agent-written when an edit event on the
 * same path added the same normalised line no later than the commit; the latest such event
 * owns it (last writer wins; ties go to the lowest eventId).
 */
export function matchCommits(commits: MatchCommit[], events: EditEvent[]): Map<string, MatchResult> {
  const index = new Map<string, Map<string, EditEvent[]>>();
  const ordered = [...events].sort((a, b) => a.ts - b.ts || byCodepoint(b.eventId, a.eventId));
  for (const e of ordered) {
    let byHash = index.get(e.path);
    if (!byHash) index.set(e.path, (byHash = new Map()));
    for (const h of new Set(e.hashes)) {
      const list = byHash.get(h);
      if (list) list.push(e);
      else byHash.set(h, [e]);
    }
  }
  const out = new Map<string, MatchResult>();
  for (const c of commits) {
    // The committer time is when the commit was created; later edits can't be in it. Dates have
    // 1 s resolution, so an edit in the same second still precedes the commit.
    const upper = c.dateMs + 1000;
    const perSession = new Map<SessionKey, number>();
    const agentLines = new Map<string, number>();
    let counted = 0;
    let matched = 0;
    for (const [path, hashes] of c.added) {
      const byHash = index.get(path);
      for (const h of hashes) {
        counted++;
        const owner = byHash?.get(h)?.findLast((e) => e.ts < upper);
        if (!owner) continue;
        matched++;
        perSession.set(owner.sessionKey, (perSession.get(owner.sessionKey) ?? 0) + 1);
        agentLines.set(path, (agentLines.get(path) ?? 0) + 1);
      }
    }
    for (const k of [...c.ranBy, ...c.ranByCommand]) if (!perSession.has(k)) perSession.set(k, 0);
    const ranCommit = c.ranBy.size > 0 || c.ranByCommand.size > 0;
    const share = counted > 0 ? Math.floor((matched * 1000) / counted) : 0;
    // Matched lines are evidence wherever they fall; only "human" needs the logs to have been watching.
    const cls = classify({ counted, shareMilli: share, matched, ranCommit, isMerge: c.isMerge,
      isSelf: c.isSelf, covered: c.covered, partial: c.partial, patchIncomplete: c.patchIncomplete });
    const evidence: CommitAttribution['evidence'] = [];
    if (matched > 0) evidence.push({ kind: 'transcript_match', detail: 'verbatim' });
    // One agent_ran_commit entry: the SHA in the command's output when there is one, else the command's window.
    if (c.ranBy.size > 0) evidence.push({ kind: 'agent_ran_commit', detail: 'git_commit_output' });
    else if (c.ranByCommand.size > 0) evidence.push({ kind: 'agent_ran_commit', detail: 'git_command' });
    out.set(c.sha, {
      agentLines,
      attribution: {
        class: cls,
        agentLineShareMilli: share,
        sessions: [...perSession].sort((a, b) => b[1] - a[1] || byCodepoint(a[0], b[0]))
          .map(([sessionKey, lines]) => ({ sessionKey, lines })),
        evidence,
        tier: cls === 'unknown' ? 'none' : 'high',
        selfCommittedAgentWritten: c.isSelf && (cls === 'agent' || cls === 'mixed'),
      },
    });
  }
  return out;
}

/**
 * Which of a session's DETAIL_BUCKETS equal time slices an edit at `ts` falls in (#148): integers only, the
 * first edit in slice 0 and the last in the final one. A zero-length span puts everything in slice 0, and a
 * time outside the span is clamped, never dropped (Rule 1).
 */
function bucketOf(ts: number, first: number, last: number): number {
  const span = last - first;
  if (span <= 0) return 0;
  return Math.min(DETAIL_BUCKETS - 1, Math.max(0, Math.floor(((ts - first) * DETAIL_BUCKETS) / (span + 1))));
}

/**
 * Session records for sessions that touched this repo; commits are listed in window order. `events` are
 * the parser's deduped edit events: a session's edit counts per file and its timeline come from them (#148).
 */
export function buildSessions(metas: Iterable<SessionMeta>, commitOrder: string[],
  results: Map<string, MatchResult>, fileIds: ReadonlyMap<string, FileId>, events: readonly EditEvent[] = []): Session[] {
  const commitsOf = new Map<SessionKey, string[]>();
  for (const sha of commitOrder) {
    for (const s of results.get(sha)?.attribution.sessions ?? []) {
      const list = commitsOf.get(s.sessionKey);
      if (list) list.push(sha);
      else commitsOf.set(s.sessionKey, [sha]);
    }
  }
  const eventsOf = new Map<SessionKey, EditEvent[]>();
  for (const e of events) {
    const list = eventsOf.get(e.sessionKey);
    if (list) list.push(e);
    else eventsOf.set(e.sessionKey, [e]);
  }
  const sessions: Session[] = [];
  for (const { firstTs, lastTs, files: metaFiles, ...rest } of metas) {
    const commits = commitsOf.get(rest.key) ?? [];
    const edits = eventsOf.get(rest.key) ?? [];
    // The parser adds a path to the session for every edit event, so these are the same paths; an event
    // whose path the record lacks still counts, so no edit is dropped (Rule 1).
    const files = new Set(metaFiles);
    for (const e of edits) files.add(e.path);
    if (files.size === 0 && commits.length === 0) continue;
    const ids = new Set<FileId>();
    const perId = new Map<FileId, number>();
    const buckets = new Array<number>(DETAIL_BUCKETS).fill(0);
    let editsOutside = 0;
    for (const path of files) {
      const id = fileIds.get(path);
      if (id) ids.add(id);
    }
    for (const e of edits) {
      const id = fileIds.get(e.path);
      if (id) perId.set(id, (perId.get(id) ?? 0) + 1);
      else editsOutside++;
      buckets[bucketOf(e.ts, firstTs, lastTs)]!++;
    }
    const sorted = [...ids].sort(byCodepoint);
    sessions.push({ ...rest, tool: 'claude-code', startedAt: isoUtc(firstTs), endedAt: isoUtc(lastTs),
      filesTouched: files.size, files: sorted, filesOutside: files.size - ids.size,
      fileEdits: sorted.map((id) => ({ id, n: perId.get(id) ?? 0 })), editsOutside, editBuckets: buckets, editSpanMs: lastTs - firstTs,
      commits, inferred: false, seed: u32(rest.key) });
  }
  return sessions.sort((a, b) => byCodepoint(a.startedAt, b.startedAt) || byCodepoint(a.key, b.key));
}
