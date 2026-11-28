// Phase 2 contract amendment (R13, 2026-11-28): space debris, the stale work in a repo. `commet scan` finds
// it from local git only (refs, worktrees, the branch's own commits) and records it in `snapshot.debris`;
// the server serves the pieces at `GET /api/debris` and one piece's panel at `GET /api/debris-detail`, and
// the renderer draws each piece near its home planet. Imports nothing but types, so the view and the render
// stand-ins load it. See docs/contracts/phase2.md "Debris".
import type { DebrisClass, DebrisId, DirId, IsoUtc, SessionKey, Sha } from '../snapshot/types.js';
import type { ChartUnknownHead } from './fog.js';

export type { DebrisClass, DebrisId } from '../snapshot/types.js';

/**
 * The scan's thresholds, in days before HEAD's committer date (never the clock), recorded in the snapshot
 * with the items (R13: deterministic, documented). An unmerged branch is `branch` (abandoned) at
 * `abandonedDays`; a merged one is `merged` once `mergedGraceDays` passed, so a branch just merged or just
 * created at an older commit isn't debris yet; an agent's unmerged branch is `agent` once it and every
 * session on it were idle `agentDays` (lead, 2026-11-28).
 */
export const DEBRIS = { abandonedDays: 30, mergedGraceDays: 3, agentDays: 7 } as const;

/**
 * The art's three decay steps (space-debris.md D2, art direction §6): intact under 60 days, weathered under
 * 180, broken from 180. Separate from the class thresholds.
 */
export const DEBRIS_AGE_STEPS = [60, 180] as const;

/** An age in days as its decay step: 0 intact, 1 weathered, 2 broken. */
export const debrisAgeStep = (days: number): 0 | 1 | 2 => (days >= DEBRIS_AGE_STEPS[1] ? 2 : days >= DEBRIS_AGE_STEPS[0] ? 1 : 0);

/** Where a piece is drawn: a planet's DirId, or `'star'` (root files, unmatched tests), from the fog's `FogBase.home`. */
export type DebrisHome = DirId | 'star';

/**
 * One piece: an item's id, class, home, decay and size. No name, creator, path or commit (Rules 2 and 6),
 * so the list can't be grouped, counted or ranked by person.
 */
export interface DebrisPiece {
  id: DebrisId;
  cls: DebrisClass;
  /**
   * The body holding most of the item's files, ties by codepoint; null when none of them is at HEAD (only
   * new files, or nothing left to show): counted in `total`, never drawn or guessed (Rule 1).
   */
  home: DebrisHome | null;
  /** `debrisAgeStep(ageDays)`. */
  ageStep: 0 | 1 | 2;
  /** Changed lines HEAD lacks (its own commits' numstat; 0 for a merged item). Size follows it (D2). */
  lines: number;
  /** uint32 of sha256(id). The renderer's only source of per-piece variety. */
  seed: number;
}

export interface DebrisView {
  schemaVersion: 'debris.1';
  /** HEAD of the snapshot the view was built from. */
  head: Sha;
  /** Every item, placed or not, sorted by `id` (codepoint). The view ranks a body's pieces biggest first itself (D5). Empty when `needsRescan`. */
  pieces: DebrisPiece[];
  /** `pieces.length`: the repo's debris count (R13 "repo-level tidiness"). */
  total: number;
  /** Pieces whose `home` is not null. */
  placed: number;
  /** The sum of `lines`: the repo's rough mass figure (R13). A repo total, never per person (Rule 6). */
  mass: number;
  /**
   * Stale PRs need GitHub and aren't read in v1 (no opt-in yet): the view says "stale PRs: not read",
   * never 0 (Rule 1). No piece has class `pr` while this is `'not-read'`.
   */
  prs: 'not-read';
  /** True when the snapshot predates R13 (no `debris`): no pieces, and the view says "rescan to see debris". */
  needsRescan: boolean;
}

/**
 * `GET /api/debris-detail?id=<DebrisId>&at=<Sha>`: each key exactly once, nothing else. `at` is the
 * `DebrisView.head` the view shows and must be the current head, else `ChartUnknownHead` (409).
 */
export interface DebrisDetailQuery { id: DebrisId; at: Sha }

/** An agent session whose branch is the item's (`Session.branch`, from the logs; none under `--no-ingest`). */
export interface DebrisSession { key: SessionKey; model: string | null; startedAt: IsoUtc; endedAt: IsoUtc }

/**
 * Fixed warnings the panel shows beside the commands. The server only ever sends one of these texts.
 */
export const DEBRIS_WARNINGS = {
  unmerged: "HEAD doesn't have this work: git branch -d refuses it until it's merged; inspect it first",
  rebased: 'rebased and merged: HEAD has every change (git cherry), but git branch -d refuses it; inspect it first',
  remoteUnmerged: "HEAD doesn't have this work and it's only on the remote: inspect it; Commet shows no delete for it",
  detached: 'a detached worktree: its commits are on no branch, and pruning drops their last reference; inspect it first',
  worktreeAmbiguous: "its worktree's folder name isn't unique: find it with git worktree list",
  worktreeLocked: 'its worktree is locked: git worktree unlock it first, if you mean to',
  hiddenCharacters: 'the name holds invisible or direction-changing characters: no command is shown; inspect it with git branch --list',
} as const;

export type DebrisWarning = (typeof DEBRIS_WARNINGS)[keyof typeof DEBRIS_WARNINGS];

/**
 * One item's panel (R13: age, last commit, who created it, a copyable cleanup command). The creator is this
 * one item's, never listed, grouped or counted across items (Rule 6). No email, absolute path or lock reason.
 */
export interface DebrisDetail {
  ok: true;
  schemaVersion: 'debris-detail.1';
  /** HEAD of the snapshot it was built from: the `at` it answers. */
  head: Sha;
  id: DebrisId;
  cls: DebrisClass;
  /**
   * The branch's short name as git has it: `feature/x` for a local branch, `origin/feature/x` for a
   * remote-only one. Null for a detached worktree's HEAD.
   */
  name: string | null;
  /** True when no local branch holds it: a remote-tracking ref only. */
  remoteOnly: boolean;
  /** Whole days from the tip's committer date to HEAD's, at least 0. */
  ageDays: number;
  /** The tip: full and 7-hex SHA, its subject (paths redacted, as commits' are) and its committer date. */
  lastCommit: { sha: Sha; short: string; subject: string; date: IsoUtc };
  /** Commits on it that HEAD doesn't have; 0 for a merged item. */
  aheadCount: number;
  /** Changed lines HEAD lacks, as the piece's `lines`. */
  lines: number;
  /**
   * Who created it: the mailmapped author of its oldest commit HEAD lacks (of the tip, when HEAD has them
   * all). `captain`: one of your emails; `agent`: an agent author (`isAgentAuthor`).
   */
  creator: { displayName: string; captain: boolean; agent: boolean };
  /** The agent sessions on its branch, by start time, then key. */
  sessions: DebrisSession[];
  /** The bodies its files at HEAD are on, by codepoint; the piece is drawn on `home`, the one holding most. */
  planets: DebrisHome[];
  home: DebrisHome | null;
  /** Its own changed paths with no file at HEAD: counted, never named (Rule 1). */
  filesOutside: number;
  /** The worktree it is checked out in (never its path or lock reason), or null. `prunable`: its folder is gone. */
  worktree: { prunable: boolean; locked: boolean } | null;
  /** Unmerged by ancestry, but `git cherry` finds every commit's change in HEAD (a rebase, then a merge): class `merged`. */
  rebased: boolean;
  /**
   * The cleanup, for the user to copy; Commet never runs it. Every name is POSIX single-quoted after `--`:
   * `git worktree remove -- '<folder>'`, `git worktree prune`, `git branch -d -- '<name>'` (git refuses an
   * unmerged branch; never `-D`), `git push --delete -- '<remote>' '<ref>'` (a merged remote copy only),
   * joined by ` && `. Null when no safe command exists (an unmerged remote-only branch, a hidden character).
   */
  cleanup: string | null;
  /** For work HEAD doesn't have: `git log --oneline HEAD..'<full ref>' --` (or `git cherry -v`, `git worktree list`). Else null. */
  inspect: string | null;
  /** One of DEBRIS_WARNINGS, or null. */
  warning: DebrisWarning | null;
}

/** 200, `ChartUnknownHead` (409: refetch the debris), or 404 for an id the snapshot lacks. */
export type DebrisDetailResult = DebrisDetail | ChartUnknownHead | { ok: false; error: 'no-such-item'; head?: undefined };
