// Phase 2 contract amendment (#80, 2026-11-13): the drone view that the server (`GET /api/drones`) serves
// and the renderer draws. Built from the snapshot's sessions and the fog's file-to-planet map
// (`FogBase.home`), so drones and fog place files on the same planets from the same snapshot/layout pair.
// See docs/contracts/phase2.md "Drone view". Amended 2026-11-18 (#148): one agent session's own detail,
// `DroneDetail`, served on its own route (see "Drone detail" there).
import type { DirId, FileId, IsoUtc, SessionKey, Sha } from '../snapshot/types.js';
import type { ChartUnknownHead } from './fog.js';

/**
 * One agent session. It carries safe metadata only (AGENTS.md Rules 2 and 6): no paths, commit subjects,
 * prompts, or per-session line, file or commit counts, so a session can't be scored or ranked.
 */
export interface DroneSession {
  key: SessionKey;
  /** uint32 from the snapshot. The renderer's only source of per-session variety. */
  seed: number;
  /** `'claude-code'` today. Any other string draws the generic drone with this name as its label. */
  tool: string;
  kind: 'main' | 'subagent';
  parentKey: SessionKey | null;
  agentType: string | null;
  startedAt: IsoUtc;
  endedAt: IsoUtc;
  branch: string | null;
  model: string | null;
  /** True for pseudo-sessions inferred from commit clustering. The scanner doesn't emit any yet. */
  inferred: boolean;
  /**
   * Where the drone circles: the planet holding most of the session's files, `'star'` when most are
   * root files, or null when it can't be placed (no files at HEAD). Never guessed (Rule 1).
   */
  home: DirId | 'star' | null;
}

export interface DroneView {
  schemaVersion: 'drones.1';
  /** HEAD of the snapshot the view was built from. */
  head: Sha;
  /** Every session in the snapshot, sorted by `key` (codepoint order), placed or not. */
  sessions: DroneSession[];
  /** `sessions.length`. */
  total: number;
  /** Sessions whose `home` is not null. */
  placed: number;
  /**
   * True when the snapshot predates `Session.files` (scanned before #80). Every `home` is then null, and
   * the view says "rescan to place drones" instead of the placed count.
   */
  needsRescan: boolean;
}

// ---- One agent session's own detail (#148, amended 2026-11-18) ----

/** How many equal time slices a session's edit timeline has (human, 2026-11-18: 24, fixed). */
export const DETAIL_BUCKETS = 24;

/**
 * `GET /api/drone-detail?key=<SessionKey>&at=<Sha>`: each key exactly once, nothing else. `at` is the
 * `DroneView.head` the view shows and must be the current head, else `ChartUnknownHead` (409).
 */
export interface DroneDetailQuery { key: SessionKey; at: Sha }

/** One file the session edited that is in the snapshot at HEAD. `path` is repo-relative, for its label. */
export interface DroneDetailFile { fileId: FileId; path: string; edits: number }

/**
 * What one agent session edited and when (AGENTS.md Rule 6's session-detail exception): its own numbers
 * only, never another session's, a ranking or a total across sessions. An edit is one tool result's
 * change to one file. Never served for an `inferred` pseudo-session.
 */
export interface DroneDetail {
  ok: true;
  schemaVersion: 'drone-detail.1';
  /** HEAD of the snapshot it was built from: the `at` it answers. */
  head: Sha;
  key: SessionKey;
  startedAt: IsoUtc;
  endedAt: IsoUtc;
  /** Its files at HEAD with their edit counts (each ≥ 1), sorted by folder, then name (codepoint); never by count. */
  files: DroneDetailFile[];
  /**
   * Its other edited paths, which have no file at HEAD: deleted, renamed, excluded, on another branch
   * or in a removed worktree. Counted, never named (Rule 1).
   */
  otherFiles: number;
  /** Its edits on those paths. */
  otherEdits: number;
  /**
   * All its edits in DETAIL_BUCKETS equal slices from its first to its last edit or git record
   * (`startedAt`..`endedAt`); they sum to the files' edits plus `otherEdits`. Empty when `needsRescan`.
   */
  buckets: number[];
  /** True when the snapshot predates #148 (no per-file counts): no files, counts or buckets then. */
  needsRescan: boolean;
}

/** 200, `ChartUnknownHead` (409: refetch the drones), or 404 for a key the snapshot doesn't have or an inferred session. */
export type DroneDetailResult = DroneDetail | ChartUnknownHead | { ok: false; error: 'no-such-session'; head?: undefined };
