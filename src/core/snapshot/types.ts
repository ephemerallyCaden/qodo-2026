// Snapshot schema 0.1: explicitly unstable until T2 freezes schemaVersion 1 (delivery plan §5).
// Every number is an integer; there are no floats, clocks, absolute paths, code or prompt text.

export type Sha = string;
/** 'YYYY-MM-DDTHH:MM:SSZ', always UTC. */
export type IsoUtc = string;
export type FileId = `f_${string}`;
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

export interface SnapshotV01 {
  schemaVersion: '0.1';
  generator: { name: 'commet'; version: string };
  repo: { repoId: string; head: Sha; headDate: IsoUtc; branch: string; selfPersonIds: PersonId[] };
  window: { months: number; since: IsoUtc; until: IsoUtc; firstParent: true };
  exclusions: { rulesetVersion: string; rules: ExclusionRule[]; counts: Record<string, number> };
  coverage: { tool: Tool; from: IsoUtc; to: IsoUtc }[];
  files: { id: FileId; path: string; loc: number }[];
  people: { id: PersonId; displayName: string; isSelf: boolean }[];
  commits: Commit[];
  sessions: Session[];
}
