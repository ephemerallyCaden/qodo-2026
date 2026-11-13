// Phase 2 contract amendment (#80, 2026-11-13): the drone view that the server (`GET /api/drones`) serves
// and the renderer draws. Built from the snapshot's sessions and the fog's file-to-planet map
// (`FogBase.home`), so drones and fog place files on the same planets from the same snapshot/layout pair.
// See docs/contracts/phase2.md "Drone view".
import type { DirId, IsoUtc, SessionKey, Sha } from '../snapshot/types.js';

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
