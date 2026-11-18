// Captain's log beacons (#79, R10). Pure: the note's text rule, beacons.json's shape, the one write
// and the view the server serves. A beacon is recorded like a chart entry, by the file's id as of the
// commit the user saw (`at`, #58), and followed to the current head through the fog's rename map, so a
// renamed file keeps its note and a deleted one's note is counted as unplaced, never dropped (Rule 1).
// State holds file ids, SHAs and the note text only: no paths, no time, nothing from agent logs (Rule 2).
import type { Beacon, BeaconAction, BeaconView } from './contract/beacons.js';
import { BEACON_TEXT_MAX, MAX_BEACONS } from './contract/beacons.js';
import type { ChartUnknownHead } from './contract/fog.js';
import { chartedFileId, type FogBase } from './fog/index.js';
import type { FileId, Sha } from './snapshot/types.js';

/** One stored note: the file's id as of `at`, the head the user saw when they left it, and the text. */
export interface StoredBeacon { fileId: FileId; at: Sha; text: string }

export interface BeaconState {
  schemaVersion: 'beacons.1';
  /** In the order they were left, oldest first. One per file at the head each was checked against. */
  beacons: StoredBeacon[];
}

export const emptyBeacons = (): BeaconState => ({ schemaVersion: 'beacons.1', beacons: [] });

/**
 * Characters a one-line plain note can't hold: controls (newlines and tabs included), line and
 * paragraph separators, bidi controls (which can make a note read differently from what it holds)
 * and lone surrogates (not text at all).
 */
const FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

/** A note as the user typed it, ready to send: only the surrounding whitespace goes. */
export const cleanBeaconText = (raw: string): string => raw.trim();

/**
 * Why `text` can't be a note, or null when it can. Fixed wording that never quotes the text. A note
 * is refused, never rewritten: the server and the state file only ever hold what the user sent.
 */
export function beaconTextProblem(text: unknown): string | null {
  if (typeof text !== 'string') return 'the note must be text';
  if (text.trim() === '') return 'the note is empty';
  if (FORBIDDEN.test(text)) return 'the note must be one line of plain text, without control characters';
  if (text !== text.trim()) return 'the note must not start or end with spaces';
  if ([...text].length > BEACON_TEXT_MAX) return `the note is longer than ${BEACON_TEXT_MAX} characters`;
  return null;
}

const FILE_ID = /^f_[0-9a-f]{12}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));

/**
 * Parses beacons.json strictly: exactly these keys, ids, SHAs and valid notes only, at most
 * MAX_BEACONS. Throws with a reason that never quotes the file's content.
 */
export function parseBeaconState(json: string): BeaconState {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new Error('not JSON');
  }
  if (!isObject(v) || !hasKeys(v, ['schemaVersion', 'beacons'])) throw new Error('unexpected shape');
  if (v['schemaVersion'] !== 'beacons.1') throw new Error('unknown schemaVersion');
  const list = v['beacons'];
  if (!Array.isArray(list) || list.length > MAX_BEACONS) throw new Error('unexpected shape');
  const beacons: StoredBeacon[] = [];
  for (const b of list as unknown[]) {
    if (!isObject(b) || !hasKeys(b, ['fileId', 'at', 'text'])) throw new Error('bad beacon');
    const { fileId, at, text } = b;
    if (typeof fileId !== 'string' || !FILE_ID.test(fileId) || typeof at !== 'string' || !SHA.test(at) || beaconTextProblem(text) !== null) {
      throw new Error('bad beacon');
    }
    beacons.push({ fileId: fileId as FileId, at, text: text as string });
  }
  return { schemaVersion: 'beacons.1', beacons };
}

/** The file at HEAD a stored beacon is about, or null when it can't be followed there (see chartedFileId). */
const headFile = (base: FogBase, b: { fileId: FileId; at: Sha }): FileId | null => chartedFileId(base, { fileId: b.fileId, at: b.at });

export type BeaconApplied = { ok: true; state: BeaconState } | ChartUnknownHead | { ok: false; error: string; head?: undefined };

/**
 * Leaves one note (the only write vocabulary). `at` must be a commit this snapshot's window knows,
 * else `unknown-head`, as for a chart. The file is named by its id as of `at` and must lead to a file
 * at HEAD. Earlier notes on that same file are replaced; past MAX_BEACONS a new note is refused.
 */
export function applyBeaconAction(base: FogBase, state: BeaconState, action: BeaconAction): BeaconApplied {
  if (!base.seqOf.has(action.at)) return { ok: false, error: 'unknown-head', head: base.snapshot.repo.head };
  const problem = beaconTextProblem(action.text);
  if (problem) return { ok: false, error: problem };
  const target = headFile(base, action);
  if (target === null) return { ok: false, error: 'no such file at that head' };
  const kept = state.beacons.filter((b) => headFile(base, b) !== target);
  if (kept.length >= MAX_BEACONS) return { ok: false, error: `there are already ${MAX_BEACONS} beacons; remove some with \`commet beacon --remove\`` };
  return { ok: true, state: { ...state, beacons: [...kept, { fileId: action.fileId, at: action.at, text: action.text }] } };
}

/** Removes every note on the file that is `fileId` at HEAD; `removed` counts them (0: there was none). */
export function removeBeacons(base: FogBase, state: BeaconState, fileId: FileId): { state: BeaconState; removed: number } {
  const kept = state.beacons.filter((b) => headFile(base, b) !== fileId);
  return { state: { ...state, beacons: kept }, removed: state.beacons.length - kept.length };
}

/**
 * The beacons as the view draws them at the snapshot's head: each placed on its file's planet, or on
 * the star for a root file or unmatched test (the fog's own file-to-planet map), in the order left.
 * A note whose file can't be followed to HEAD is counted in `unplaced`.
 */
export function beaconViewFrom(base: FogBase, state: BeaconState): BeaconView {
  const paths = new Map(base.files.map((f) => [f.id, f.path]));
  const beacons: Beacon[] = [];
  let unplaced = 0;
  for (const b of state.beacons) {
    const id = headFile(base, b);
    const path = id === null ? undefined : paths.get(id);
    if (id === null || path === undefined) {
      unplaced++;
      continue;
    }
    beacons.push({ fileId: id, path, home: base.home.get(id) ?? 'star', at: b.at, text: b.text });
  }
  return { schemaVersion: 'beacons.1', head: base.snapshot.repo.head, beacons, unplaced };
}
