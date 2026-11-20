// The captain's log note rule (#79, R10), on its own: the view imports it, so it imports nothing but
// the contract's constants. The rest of src/core/beacons.ts needs the fog core, whose hashing comes
// from a package the render stand-ins, which serve src/core unbundled, can't load (PR #165 CI).
import { BEACON_TEXT_MAX } from './contract/beacons.js';

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
