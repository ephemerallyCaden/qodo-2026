// Snapshot schema 0.2: explicitly unstable until T2 freezes schemaVersion 1 (delivery plan §5).
// 0.2 (#16) adds dirs[], branches[], unreadable, and files[].debt/isTest/testOf; commit seq became
// the first-parent ordinal from the root, so it shares a scale with dirs[].bornSeq. #17 adds the
// opt-in qodo source and files[].qodo.
// Every number is an integer; there are no floats, clocks, absolute paths, code or prompt text.

export type Sha = string;
/** 'YYYY-MM-DDTHH:MM:SSZ', always UTC. */
export type IsoUtc = string;
export type FileId = `f_${string}`;
export type DirId = `d_${string}`;
export type PersonId = `p_${string}`;
export type SessionKey = `s_${string}`;
export type Tool = 'claude-code';

export type CommitClass = 'agent' | 'mixed' | 'human' | 'unknown';

export interface CommitAttribution {
  class: CommitClass;
  /** Integer 0..1000: agent-matched share of the commit's countable added lines. */
  agentLineShareMilli: number;
  sessions: { sessionKey: SessionKey; lines: number }[];
  evidence: { kind: 'transcript_match' | 'agent_ran_commit'; detail: string }[];
  tier: 'high' | 'none';
  /** "Committed by you, written by an agent". */
  selfCommittedAgentWritten: boolean;
}

/** [path, added, removed, agentLines]. Path-keyed until T2 adds rename lineage. */
export type CommitFile = [path: string, added: number, removed: number, agentLines: number];

export interface Commit {
  /** First-parent ordinal counted from the root commit (0), not from the window start. */
  seq: number;
  sha: Sha;
  date: IsoUtc;
  authorDate: IsoUtc;
  author: PersonId;
  subject: string;
  files: CommitFile[];
  attribution: CommitAttribution;
}

export interface Session {
  key: SessionKey;
  tool: Tool;
  kind: 'main' | 'subagent';
  parentKey?: SessionKey | undefined;
  agentType?: string | undefined;
  startedAt: IsoUtc;
  endedAt: IsoUtc;
  branch?: string | undefined;
  model?: string | undefined;
  toolVersion?: string | undefined;
  filesTouched: number;
  /** Sorted, unique ids of the snapshot files this session edited. */
  files: FileId[];
  /** Edited paths with no snapshot file (deleted since, excluded, another branch); filesTouched = files.length + filesOutside. */
  filesOutside: number;
  /**
   * #148: the session's edits (one tool result's change to one file) per file, one entry per `files` id
   * in the same order, each `n` ≥ 1. Absent in a snapshot scanned before #148.
   */
  fileEdits: { id: FileId; n: number }[];
  /** #148: its edits on the `filesOutside` paths. */
  editsOutside: number;
  /**
   * #148: all its edits in DETAIL_BUCKETS (24) equal slices from its first to its last edit or git record
   * (the times behind startedAt and endedAt). Sums to the `fileEdits` counts plus `editsOutside`.
   */
  editBuckets: number[];
  /** #148: the milliseconds editBuckets divide (last minus first edit or git record), which startedAt/endedAt drop. */
  editSpanMs: number;
  linesAdded: number;
  linesRemoved: number;
  commits: Sha[];
  inferred: false;
  /** uint32 drone seed from sha256(key). */
  seed: number;
}

export interface ExclusionRule {
  id: string;
  kind: 'glob' | 'binary';
  pattern: string;
}

/**
 * A folder holding at least one non-excluded file at HEAD. `id` comes from the folder's birth
 * (`'d_' + sha256(birthPath + '#' + birthOrdinal)[:12]`) and survives a rename that moves ≥ 50% of
 * its files (design §5.1.3). `depth` counts path segments, so top-level folders have depth 1.
 */
export interface Dir {
  id: DirId;
  path: string;
  parent: DirId | null;
  depth: number;
  bornSeq: number;
  bornDate: IsoUtc;
  /**
   * Top-level folders only: the older top-level folder that ≥ 60% of this folder's first 5 commits
   * also touched (the clear-link rule), or null.
   */
  partner?: DirId | null;
}

/** Marker-word counts in the file's HEAD blob. null: the blob couldn't be read (never a guess of 0). */
export interface DebtCounts { todo: number; fixme: number; hack: number; xxx: number }

export interface FileEntry {
  id: FileId;
  path: string;
  loc: number;
  debt: DebtCounts | null;
  isTest: boolean;
  /**
   * What this test tests: a source file named like it, else a folder named like it, else the
   * source it most often changes with; null if none.
   */
  testOf: FileId | DirId | null;
  /**
   * Open Qodo review findings on this file. null: unknown (not read, failed, no reviewed PR, or
   * changed by a PR without a complete review, or added since the cached HEAD), never 0.
   */
  qodo: FileQodo | null;
}

/** Open-finding counts per Qodo action level; a level Commet doesn't know counts as `other`. */
export interface QodoByLevel { actionRequired: number; remediationRecommended: number; informational: number; other: number }

export interface FileQodo { open: number; byLevel: QodoByLevel }

/** Why Qodo findings are unknown. A fixed set: no tool output is ever passed through. */
export type QodoReason = 'qodo not installed' | 'gh not installed' | 'not logged in' | 'timed out' | 'rate limited' | 'network error'
  | 'no GitHub remote' | 'too many PRs' | 'truncated result' | 'malformed response' | 'qodo failed' | 'gh failed' | 'cache unreadable'
  | 'cache HEAD not found';

/**
 * Where files[].qodo came from (#17). `none`: not opted in and no cache. `read`: from a fetch or the
 * cache it wrote, as of `head` (the HEAD it was fetched at); `prs` were read and `skipped` (closed,
 * never merged) were not; `unreviewed` of those read had no complete Qodo review of their head
 * commit, so the files they change are null; `offHead` open findings sat on no file at this HEAD and
 * `onUnknown` on a file whose count is null; `changedSince` files (not already unknown for an
 * unreviewed PR) were added, re-added or changed since `head`, so null too.
 */
export type QodoSource =
  | { status: 'none' }
  | { status: 'read'; head: Sha; prs: number; skipped: number; unreviewed: number; offHead: number; onUnknown: number; changedSince: number }
  | { status: 'unavailable'; reason: QodoReason };

/** An unmerged local or remote-tracking branch (no network: only refs already on disk). */
export interface Branch {
  /** Short name: `feature/x` for a local branch, `origin/feature/x` for a remote-tracking one. */
  name: string;
  /** Remote-tracking only: no local branch of this name. */
  remote: boolean;
  /** A local branch whose remote-tracking copy (its upstream, or `<remote>/<name>`) is folded in. */
  alsoRemote: boolean;
  /** Commits on the branch that HEAD doesn't have (from the most advanced of its tips). */
  aheadCount: number;
  /** Committer date of the branch tip (git data, never the wall clock). */
  lastCommitDate: IsoUtc;
  /** Top-level folders (present at HEAD) that the branch's own commits touch. */
  dirIds: DirId[];
}

/** Inputs the scan couldn't read, so nothing is dropped silently (AGENTS.md Rule 1). */
export interface Unreadable {
  /** HEAD folders with no lineage record; their id and birth fall back to HEAD. */
  dirs: number;
  /** Files whose debt markers couldn't be read (`debt: null`). */
  files: number;
  /** Unmerged branches whose commits couldn't be read; they're absent from branches[]. */
  branches: number;
  /**
   * Commits over 200 files left out of test co-change matching while they held a test that had no
   * name match, so that test's `testOf: null` may be missing evidence.
   */
  bulkCommits: number;
}

/** #211 (R9): one co-change pair, `a` < `b` by codepoint: commits with both (`both`) over commits with either, ×1000, floored. */
export interface CoChangePair { a: FileId; b: FileId; both: number; strengthMilli: number }

/** #211: `fileId` usually changes with `with`, which changed in the last `settings.flagWindow` commits (latest at `at`) while `fileId` didn't. */
export interface MissingPair { fileId: FileId; with: FileId; strengthMilli: number; at: Sha }

/**
 * #211 (R9): co-change from the window's commits, by file at HEAD (renames followed, as fog does). The
 * settings are recorded beside the pairs (contract `COCHANGE`). `commits` were counted and
 * `bulkCommits` left out for touching more than `settings.bulkFiles` files (Rule 1). Pairs are sorted by
 * `a`, then `b`; missing pairs by `fileId`.
 */
export interface CoChange {
  settings: { thresholdMilli: number; minBoth: number; cap: number; flagMilli: number; flagMinBoth: number; flagWindow: number; bulkFiles: number };
  commits: number;
  bulkCommits: number;
  pairs: CoChangePair[];
  missing: MissingPair[];
}

/**
 * One author in the window, aliases merged (#207): `.mailmap` first (git's `--use-mailmap`), then emails
 * whose commits share an exact author name, and every email that is yours (`user.email`, `commet.selfEmail`).
 * `id` is `'p_' + sha256(email)[:12]` of yours for you, else of the group's first email by codepoint; no raw
 * email is stored. Bot and agent authors are never merged by name.
 */
export interface Person {
  id: PersonId;
  displayName: string;
  isSelf: boolean;
  /** #207: a bot or agent author (`isBotAuthor`: `[bot]`, a no-reply address, a known agent's email), never crew. Absent in a snapshot scanned before #207. */
  isBot?: boolean;
}

/** R13: an item's id, `'x_' + sha256(key)[:12]`, its key the item's full refname (`refs/heads/x`, `refs/remotes/o/x`), or `HEAD <sha>` for a detached worktree. Stable across scans. */
export type DebrisId = `x_${string}`;

/**
 * R13 classes: `branch` abandoned (unmerged, `abandonedDays` old), `merged` (merged into HEAD, or rebased
 * and merged, and still there), `agent` (an orphaned agent branch or worktree), `pr` (a stale PR; never
 * produced in v1: PRs aren't read).
 */
export type DebrisClass = 'pr' | 'branch' | 'merged' | 'agent';

/**
 * R13: one stale item, from local git only. A local branch with its remote-tracking copies (its upstream,
 * or `<remote>/<name>`) is one item, as in `branches[]`; a worktree folds into its branch's item. No path,
 * email or lock reason is stored.
 */
export interface DebrisItem {
  id: DebrisId;
  cls: Exclude<DebrisClass, 'pr'>;
  /** The full refname (`refs/heads/x`, or `refs/remotes/origin/x` for a remote-only one); null for a detached worktree's HEAD. */
  ref: string | null;
  /** A remote copy a cleanup may delete: its remote's name and its refname there (`refs/heads/x`). Null when none, or the remote isn't configured. */
  remote: { name: string; ref: string } | null;
  tip: Sha;
  /** The tip's committer date. */
  lastCommitDate: IsoUtc;
  /** `max(0, floor((HEAD's committer time − the tip's) / 1 day))`. */
  ageDays: number;
  /** Commits on it HEAD doesn't have (0 when merged). */
  aheadCount: number;
  /** Added plus removed lines over those commits (no merges, no binaries, no excluded paths); 0 when merged. */
  lines: number;
  /** Sorted ids of the snapshot files its own commits change (a merged item: its tip's first-parent change). */
  files: FileId[];
  /** Those changed paths with no snapshot file (deleted since, new on the branch). Excluded paths aren't counted. */
  filesOutside: number;
  /** The tip's subject, paths redacted as `Commit.subject`. */
  subject: string;
  /** The mailmapped author of its oldest commit HEAD lacks, else of the tip; `self`: one of your emails; `agent`: `isAgentAuthor`. */
  creator: { name: string; self: boolean; agent: boolean };
  /** Sorted keys of the sessions whose `branch` is this local branch. */
  sessions: SessionKey[];
  /**
   * The worktree it is checked out in: `prunable` (its folder is gone), `locked`, and `folder`, its path's
   * last component when no other worktree's is the same (git accepts it in `git worktree remove`), else null.
   */
  worktree: { prunable: boolean; locked: boolean; folder: string | null } | null;
  /** Not an ancestor of HEAD, but `git cherry HEAD <tip>` marks every commit `-` (its upstream is gone). */
  rebased: boolean;
  /** uint32 of sha256(id). */
  seed: number;
}

/** R13: the stale work, its settings recorded beside it (contract `DEBRIS`). Absent in a snapshot scanned before R13. */
export interface Debris {
  settings: { abandonedDays: number; mergedGraceDays: number; agentDays: number };
  /** The default branch names never counted (the remotes' HEADs, else `init.defaultBranch`, else `main` and `master`), sorted. */
  defaults: string[];
  /** Sorted by id. */
  items: DebrisItem[];
  /** Refs or worktrees whose reads failed, left out and counted (Rule 1). */
  unreadable: number;
}

export interface SnapshotV02 {
  schemaVersion: '0.2';
  generator: { name: 'commet'; version: string };
  repo: { repoId: string; head: Sha; headDate: IsoUtc; branch: string; selfPersonIds: PersonId[] };
  window: { months: number; since: IsoUtc; until: IsoUtc; firstParent: true };
  exclusions: { rulesetVersion: string; rules: ExclusionRule[]; counts: Record<string, number> };
  coverage: { tool: Tool; from: IsoUtc; to: IsoUtc }[];
  dirs: Dir[];
  files: FileEntry[];
  branches: Branch[];
  unreadable: Unreadable;
  qodo: QodoSource;
  people: Person[];
  commits: Commit[];
  sessions: Session[];
  /** #211: absent in a snapshot scanned before it. */
  cochange?: CoChange;
  /** R13: absent in a snapshot scanned before it. */
  debris?: Debris;
}
