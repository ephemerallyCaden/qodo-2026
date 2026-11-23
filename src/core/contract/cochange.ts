// Phase 2 contract amendment (#211, R9): co-change constellations. `commet scan` counts, from git
// history in the window only, which files usually change in the same commit (Jaccard), keeps the pairs
// above a documented threshold, capped per file, and records which files a strong partner's latest
// change left out. The server serves them at `GET /api/cochange`, with the missing-pair flags the user
// has since charted taken out. Imports nothing but types, so the view and the render stand-ins load it.
import type { DirId, FileId, Sha } from '../snapshot/types.js';

/**
 * The scan's settings, recorded in the snapshot with the pairs (Rule 1: a documented threshold). A pair
 * is kept when its Jaccard (commits with both over commits with either) is at least `thresholdMilli` /
 * 1000, the two files changed together in at least `minBoth` commits, and it is among the `cap` strongest
 * pairs of at least one of its two files. A commit that touched more than `bulkFiles` files is left out
 * of the counting (a reformat or a vendored drop says nothing about coupling) and counted. A missing-pair
 * flag needs a partner at least `flagMilli` strong over at least `flagMinBoth` shared commits that changed
 * in the last `flagWindow` commits at HEAD while the flagged file didn't: recent changes only, so an older
 * skip counts as settled (the human, 2026-11-23).
 */
export const COCHANGE = { thresholdMilli: 150, minBoth: 2, cap: 5, flagMilli: 500, flagMinBoth: 3, flagWindow: 10, bulkFiles: 200 } as const;

/** The three strength steps (weak, mid, strong): each step's lowest strength, Jaccard ×1000. */
export const COCHANGE_STEPS = [150, 300, 500] as const;

/** A strength's step: 0 weak, 1 mid, 2 strong. */
export const strengthStep = (milli: number): 0 | 1 | 2 => (milli >= COCHANGE_STEPS[2] ? 2 : milli >= COCHANGE_STEPS[1] ? 1 : 0);

/** One kept pair: two files at HEAD (`a` < `b` by codepoint) and how strongly they change together. */
export interface CoChangeLink { a: FileId; b: FileId; strengthMilli: number }

/**
 * A missing-pair flag (AC4): `fileId` usually changes with `with` (COCHANGE.flagMilli and flagMinBoth),
 * `with` changed in the last COCHANGE.flagWindow commits (its latest change is commit `at`) and `fileId`
 * didn't. It clears when a later change touches `fileId` or `at` leaves the window (the next scan drops
 * it), or when `fileId` is charted at or after `at`.
 */
export interface CoChangeFlag { fileId: FileId; with: FileId; strengthMilli: number; at: Sha }

/** A file the view names: its repo-relative path for labels, and the body it is drawn on (`home`, as the fog counts it). */
export interface CoChangeFile { fileId: FileId; path: string; home: DirId | 'star' }

export interface CoChangeView {
  schemaVersion: 'cochange.1';
  /** HEAD of the snapshot the view was built from: drawn only over that scan's layout (#64). */
  head: Sha;
  /** The snapshot predates #211 (it has no co-change record): nothing to draw, rescan. */
  needsRescan: boolean;
  /** Every kept pair, sorted by `a`, then `b`. */
  links: CoChangeLink[];
  /** The flags still standing, sorted by `fileId`. */
  flags: CoChangeFlag[];
  /** Flags taken out because their file was charted since (Rule 1: counted, never silently gone). */
  dismissed: number;
  /** Every file a link or flag names, sorted by `fileId`. */
  files: CoChangeFile[];
}
