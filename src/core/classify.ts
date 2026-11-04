import type { CommitClass } from './snapshot/types.js';

export const SHARE_AGENT = 900;
export const SHARE_MIXED = 300;

/** Everything the commit class depends on; gathered by the matcher, decided here with no I/O. */
export interface ClassifyInput {
  /** Countable added lines (non-excluded paths, non-trivial lines). */
  counted: number;
  /** Integer 0..1000: floor(matched × 1000 / counted). */
  shareMilli: number;
  /** Lines matched verbatim to an agent edit. Below 300‰ they never rule out human ("with traces"). */
  matched: number;
  /** A session's `git commit` output named this commit (agent_ran_commit evidence). */
  ranCommit: boolean;
  /** More than one parent: its first-parent diff carries other people's lines. */
  isMerge: boolean;
  isSelf: boolean;
  /** Inside log coverage and outside every blind span. */
  covered: boolean;
  /** Inside a transcript that dropped a record which could have held an edit. */
  partial: boolean;
}

/**
 * The commit class (design §5.2.7). "Unknown, never human": `human` needs a self-authored,
 * non-merge commit with countable lines under 300‰, inside fully parsed coverage, that no
 * agent session committed. Every other case without enough matched lines is `unknown`.
 */
export function classify(i: ClassifyInput): CommitClass {
  // Merges first: teammate lines arriving through one must never read as yours (#5 decision 3).
  if (i.isMerge || i.counted === 0) return 'unknown';
  if (i.shareMilli >= SHARE_AGENT) return 'agent';
  if (i.shareMilli >= SHARE_MIXED) return 'mixed';
  return i.isSelf && i.covered && !i.partial && !i.ranCommit ? 'human' : 'unknown';
}
