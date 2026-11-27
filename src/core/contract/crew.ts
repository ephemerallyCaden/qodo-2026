// Phase 2 contract amendment (#207, 2026-11-25): the crew, one astronaut per human author in the scan window,
// that the server serves (`GET /api/crew`) and the renderer draws aboard the ship, and one crew member's own
// panel (`GET /api/crew-detail`). Built from the snapshot's people and commits and the fog's per-file touches
// (`FogBase`), so the panel names and places files as the fog counts them. See docs/contracts/phase2.md "Crew".
import type { DirId, FileId, IsoUtc, PersonId, Sha } from '../snapshot/types.js';
import type { ChartUnknownHead } from './fog.js';

/**
 * One crew member: a human author in the window, aliases merged. Names only (AGENTS.md Rules 2 and 6): no
 * email, path, or count of any kind, so the list can't rank or compare people.
 */
export interface CrewMember {
  person: PersonId;
  /** The name git gives the person's first commit in the window (mailmapped). */
  displayName: string;
  /** uint32 from sha256(person). The renderer's only source of per-person variety. */
  seed: number;
  /** You: the person whose emails are yours (`user.email` and `commet.selfEmail`). At most one. */
  captain: boolean;
}

export interface CrewView {
  schemaVersion: 'crew.1';
  /** HEAD of the snapshot the view was built from. */
  head: Sha;
  /** Every human author in the window, sorted by `person` (codepoint order), never by activity. Empty when `needsRescan`. */
  members: CrewMember[];
  /** `members.length`. */
  total: number;
  /** Bot and agent authors in the window, left out of the crew and counted (Rule 1). 0 when `needsRescan`. */
  bots: number;
  /**
   * True when the snapshot predates #207 (people without `isBot`): bots can't be told from people, so
   * nobody is shown, and the view says "rescan to see your crew".
   */
  needsRescan: boolean;
}

/**
 * `GET /api/crew-detail?person=<PersonId>&at=<Sha>`: each key exactly once, nothing else. `at` is the
 * `CrewView.head` the view shows and must be the current head, else `ChartUnknownHead` (409).
 */
export interface CrewDetailQuery { person: PersonId; at: Sha }

/** A body the person touched: a planet's DirId or `'star'` (root files, unmatched tests), from the fog's `FogBase.home`. */
export type CrewHome = DirId | 'star';

/** One body the person touched, with the number of their window commits that changed a file on it. */
export interface CrewDetailPlanet { home: CrewHome; touches: number }

/** One file at HEAD the person touched. `path` is repo-relative, for its label; `touches` their window commits that changed it (≥ 1). */
export interface CrewDetailFile { fileId: FileId; path: string; home: CrewHome; touches: number }

/**
 * What one crew member touched in the window (AGENTS.md Rule 6's astronaut-panel exception, human,
 * 2026-11-25): that person's own numbers only, never another person's, a ranking, a comparison or a total.
 * A touch is one of their window commits changing the file's content (a pure rename or mode change isn't).
 * Never served for a bot or agent author.
 */
export interface CrewDetail {
  ok: true;
  schemaVersion: 'crew-detail.1';
  /** HEAD of the snapshot it was built from: the `at` it answers. */
  head: Sha;
  person: PersonId;
  displayName: string;
  captain: boolean;
  /** The latest author date of their window commits (git's, never the clock). Null only when `needsRescan`. */
  lastActive: IsoUtc | null;
  /** The bodies they touched, sorted by `home` (codepoint); never by count. */
  planets: CrewDetailPlanet[];
  /** Their files at HEAD, sorted by folder, then name (codepoint); never by count. */
  files: CrewDetailFile[];
  /**
   * Other paths their commits changed, with no file at HEAD (deleted, or a name history can't follow):
   * counted, never named (Rule 1).
   */
  otherFiles: number;
  /** True when the snapshot predates #207: no planets, files or lastActive then. */
  needsRescan: boolean;
}

/** 200, `ChartUnknownHead` (409: refetch the crew), or 404 for a person the snapshot lacks or a bot. */
export type CrewDetailResult = CrewDetail | ChartUnknownHead | { ok: false; error: 'no-such-person'; head?: undefined };
