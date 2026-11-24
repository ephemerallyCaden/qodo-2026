// Phase 2 contract (#29): the fog view that R5 (#33) produces and the server (#32) and renderer (#30)
// consume. Chart state on disk is R5's own business; only this view and the actions are shared.
import type { DirId, FileId, Sha } from '../snapshot/types.js';

/** Why a file is fogged. Several can apply. */
export type FogReason =
  | 'agent' // an agent-class commit
  | 'mixed' // a mixed-class commit
  | 'self-committed-agent-written' // committed by you, written by an agent
  | 'teammate' // a human commit by someone who isn't you
  | 'unknown' // attribution unknown (never treated as yours, Rule 1)
  | 'lineage-unknown'; // the change couldn't be mapped to this file for certain, so it errs to fog

/**
 * A file's fog level (#201, understanding mode U1–U3), from most to least fog:
 * - fogged: a change you didn't write (agent, mixed, teammate, unknown) isn't reviewed yet, or the
 *   file's history can't be followed (Rule 1);
 * - haze: seen, not yet understood: every such change is charted (in the CLI or the review panel,
 *   where opening a file's whole diff charts it) or under the baseline, or there was none;
 * - clear: understood: a quiz on this version was passed, and its content hasn't changed since.
 * A cleared file whose content changes, whoever changed it, drops to haze, never straight to fogged.
 */
export type FogLevel = 'fogged' | 'haze' | 'clear';
export const FOG_LEVELS: readonly FogLevel[] = ['fogged', 'haze', 'clear'];

export interface FileFog {
  fileId: FileId;
  state: FogLevel;
  /** Empty unless fogged. Sorted. */
  reasons: FogReason[];
  /** Oldest unreviewed commit when fogged, else null. */
  since: Sha | null;
}

/** Files by level: `fogged + haze + clear === total`. Mastery (U3) is `clear / total`, by count. */
export interface FogCounts { total: number; fogged: number; haze: number; clear: number }

export interface FogView {
  schemaVersion: 'fog.2';
  head: Sha;
  /** The commit the baseline was charted at, or null when there is no baseline. */
  baseline: Sha | null;
  /**
   * Whether a chart or a passed quiz of one file is placed in this window (the baseline aside): the
   * view offers the first-run baseline only while there is none, as fog.1's `charted` state told it.
   */
  charted: boolean;
  /** Every file in snapshot.files, sorted by fileId. */
  files: FileFog[];
  /** One entry per planet in the layout, content and outer (#71), sorted by dirId. */
  planets: ({ dirId: DirId } & FogCounts)[];
  /** Root files and unmatched tests (the star's moonlets). */
  star: FogCounts;
}

/**
 * The only writes the local server accepts for chart state (R14 AC4). `at` is the `FogView.head`
 * the user was looking at (#58), and the write is recorded at it: a chart or baseline covers changes
 * up to `at` and no further. A change that arrived after the view's last fetch is newer than `at`, so
 * it stays fogged and is never marked reviewed unseen (AGENTS.md Rule 1). `at` must be a commit the
 * current snapshot knows (in its window, on HEAD's first-parent line); otherwise the write gets
 * `ChartUnknownHead`.
 */
export type ChartAction =
  | { kind: 'chart'; fileId: FileId; at: Sha }
  | { kind: 'baseline'; at: Sha }
  | { kind: 'baseline-undo'; at: Sha };

/** A refused write: `at` isn't a commit the current snapshot knows. Refetch the fog (at `head`) and act again. */
export interface ChartUnknownHead { ok: false; error: 'unknown-head'; head: Sha }

/**
 * A passed quiz (#201): the file that had id `fileId` was understood as of commit `at`, which clears
 * it. Deliberately not a ChartAction: no route, button or CLI command takes it (AGENTS.md Rule 6, fog
 * clears only when a question is answered). The quiz (#203) records it through `writeQuizPass`
 * (src/state/chart.ts) once it has checked the answers itself.
 */
export interface QuizPass { fileId: FileId; at: Sha }
