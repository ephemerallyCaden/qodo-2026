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

export interface FileFog {
  fileId: FileId;
  /**
   * clear: no change you didn't write since the window start. charted: every such change is
   * reviewed. fogged: at least one isn't. The renderer draws clear and charted the same.
   */
  state: 'clear' | 'charted' | 'fogged';
  /** Empty unless fogged. Sorted. */
  reasons: FogReason[];
  /** Oldest unreviewed commit when fogged, else null. */
  since: Sha | null;
}

export interface FogCounts { total: number; fogged: number }

export interface FogView {
  schemaVersion: 'fog.1';
  head: Sha;
  /** The commit the baseline was charted at, or null when there is no baseline. */
  baseline: Sha | null;
  /** Every file in snapshot.files, sorted by fileId. */
  files: FileFog[];
  /** One entry per planet (top-level folder that is a planet in the layout), sorted by dirId. */
  planets: ({ dirId: DirId } & FogCounts)[];
  /** Root files and unmatched tests (the star's moonlets). */
  star: FogCounts;
}

/** The only writes the local server accepts for chart state (R14 AC4). */
export type ChartAction =
  | { kind: 'chart'; fileId: FileId }
  | { kind: 'baseline' }
  | { kind: 'baseline-undo' };
