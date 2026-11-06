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
   * changed by a PR without a complete review), never 0.
   */
  qodo: FileQodo | null;
}

/** Open-finding counts per Qodo action level; a level Commet doesn't know counts as `other`. */
export interface QodoByLevel { actionRequired: number; remediationRecommended: number; informational: number; other: number }

export interface FileQodo { open: number; byLevel: QodoByLevel }

/** Why Qodo findings are unknown. A fixed set: no tool output is ever passed through. */
export type QodoReason = 'qodo not installed' | 'gh not installed' | 'not logged in' | 'timed out' | 'rate limited' | 'network error'
  | 'no GitHub remote' | 'too many PRs' | 'truncated result' | 'malformed response' | 'qodo failed' | 'gh failed' | 'cache unreadable';

/**
 * Where files[].qodo came from (#17). `none`: not opted in and no cache. `read`: from a fetch or the
 * cache it wrote, as of `head` (the HEAD it was fetched at); `prs` were read and `skipped` (closed,
 * never merged) were not; `unreviewed` of those read had no complete Qodo review, so the files they
 * change are null; `offHead` open findings sat on no file at this HEAD.
 */
export type QodoSource =
  | { status: 'none' }
  | { status: 'read'; head: Sha; prs: number; skipped: number; unreviewed: number; offHead: number }
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
  people: { id: PersonId; displayName: string; isSelf: boolean }[];
  commits: Commit[];
  sessions: Session[];
}
