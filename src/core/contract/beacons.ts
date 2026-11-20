// Phase 2 contract amendment (#79, R10): captain's log beacons. When you chart a file you can leave a
// one-line note; it shows as a beacon on the file's planet. Notes live in `.git/commet/beacons.json`
// (never git notes, which can be pushed) and hold file ids, commit SHAs and the note text only.
// The server serves them at `GET /api/beacons` and takes one write at `POST /api/beacon`.
import type { DirId, FileId, Sha } from '../snapshot/types.js';
import type { ChartUnknownHead } from './fog.js';

/** The longest note, in Unicode code points. */
export const BEACON_TEXT_MAX = 120;
/** The most beacons kept: past it a new one is refused, never an old one dropped (Rule 1). */
export const MAX_BEACONS = 1000;

/**
 * `POST /api/beacon`, exactly these keys: leave the note `text` on the file that had id `fileId` at
 * `at`, the `FogView.head` the view shows (as `ChartAction`, #58). It replaces any earlier note on the
 * same file. `text` is plain text: 1 to BEACON_TEXT_MAX code points on one line, with no control,
 * bidi-control or lone-surrogate characters, and no leading or trailing whitespace. It is refused,
 * never rewritten, when it isn't.
 */
export interface BeaconAction { fileId: FileId; at: Sha; text: string }

/**
 * One beacon the view can draw: the file at the current head (followed through renames from the id
 * it was left on), its repo-relative path for the label, the body it sits on, and the note.
 */
export interface Beacon { fileId: FileId; path: string; home: DirId | 'star'; at: Sha; text: string }

export interface BeaconView {
  schemaVersion: 'beacons.1';
  /** HEAD of the snapshot the view was built from: the view draws it only over that scan's layout (#64). */
  head: Sha;
  /** The beacons placed at `head`, in the order they were left, oldest first. */
  beacons: Beacon[];
  /**
   * Beacons whose file can't be followed to `head` (deleted, or left on another branch or before the
   * scan's window): counted, never drawn or guessed (Rule 1).
   */
  unplaced: number;
}

/** 200 with the new view, `ChartUnknownHead` (409: refetch the fog and ask again), or 400 with a fixed reason. */
export type BeaconResult = { ok: true; beacons: BeaconView } | ChartUnknownHead | { ok: false; error: string; head?: undefined };
