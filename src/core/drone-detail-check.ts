// One rule set for a session's drone detail (#148). It replaces the per-field guards that each Qodo review
// of PR #167 extended by one field (7105505d, af483acc, 1eabd165, then 582ea944, 5f2af634, 3bc5a746).
// The server checks a snapshot record with sessionDetailProblems before building a detail from it, and
// the detail it built with droneDetailProblems. The view checks what it receives with droneDetailProblems
// too, so the server never serves a detail the view refuses. It imports only the contract's constants,
// as the view and the render stand-ins load it (no package imports; see beacon-text.ts).
import { DETAIL_BUCKETS } from './contract/drones.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A whole number from `min` to MAX_SAFE_INTEGER: every count and time in a detail (582ea944). */
const isCount = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= Number.MAX_SAFE_INTEGER;

const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const KEY = /^s_.+/;
const FILE_ID = /^f_[0-9a-f]{12,64}$/;

/** Bounds on what the panel prints, so a hostile or damaged document can't flood it. */
export const DETAIL_LIMITS = { text: 200, path: 4096, files: 20_000 } as const;

/** A UTC time that parses, or null (5f2af634). */
const timeOf = (v: unknown): number | null => (typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);

/** Both times parse and the end isn't before the start (5f2af634); their milliseconds, or null. */
function timesOf(o: Obj, errors: string[]): [number, number] | null {
  const start = timeOf(o['startedAt']);
  const end = timeOf(o['endedAt']);
  if (start === null) errors.push('startedAt must be a UTC time');
  if (end === null) errors.push('endedAt must be a UTC time');
  if (start === null || end === null) return null;
  if (end < start) { errors.push('endedAt must not be before startedAt'); return null; }
  return [start, end];
}

/** The span the buckets divide, in milliseconds: it matches the times to within the second they drop (d23a7a91). */
function spanProblems(span: unknown, times: [number, number] | null, name: string, errors: string[]): void {
  if (!isCount(span)) errors.push(`${name} must be a whole number of milliseconds`);
  else if (times !== null && Math.abs(span - (times[1] - times[0])) >= 1000) errors.push(`${name} must match startedAt and endedAt to the second`);
}

/** The other paths' counts: each has an edit, and an edit there has a path (05ffa5a8, 3bc5a746). */
function otherProblems(files: unknown, edits: unknown, names: [string, string], errors: string[]): void {
  if (!isCount(files)) errors.push(`${names[0]} must be a whole number`);
  if (!isCount(edits)) errors.push(`${names[1]} must be a whole number`);
  else if (isCount(files) && (edits < files || (files === 0) !== (edits === 0))) errors.push(`${names[1]} must be at least ${names[0]}, and 0 exactly when it is`);
}

/** DETAIL_BUCKETS whole numbers that add up to `total` (7105505d). */
function bucketProblems(buckets: unknown, total: number | null, name: string, errors: string[]): void {
  if (!Array.isArray(buckets) || buckets.length !== DETAIL_BUCKETS) { errors.push(`${name} must hold exactly ${DETAIL_BUCKETS} slices`); return; }
  if (!buckets.every((b) => isCount(b))) { errors.push(`${name} must be whole numbers`); return; }
  if (total !== null && buckets.reduce((a: number, b: number) => a + b, 0) !== total) errors.push(`${name} must add up to every edit`);
}

/** A snapshot sessions[] entry that can be read at all: an object with a string key (af483acc). */
export const isSessionEntry = (x: unknown): boolean => isObj(x) && typeof x['key'] === 'string';

/**
 * What a snapshot record's #148 fields must hold before a detail is built from it: `'old'` when none is
 * there (scanned before #148), else the problems, [] when there are none. These are the scanner's own
 * identities: `fileEdits` lists exactly `files`, in order, each file once with at least one edit;
 * `filesTouched = files.length + filesOutside`; the buckets add up to every edit; the times and span agree.
 */
export function sessionDetailProblems(s: unknown): 'old' | string[] {
  if (!isObj(s)) return ['the session must be an object'];
  if (['fileEdits', 'editsOutside', 'editBuckets', 'editSpanMs'].every((k) => s[k] === undefined)) return 'old';
  const errors: string[] = [];
  const files = s['files'];
  const fileEdits = s['fileEdits'];
  let total: number | null = 0;
  if (!Array.isArray(files) || !files.every((id) => typeof id === 'string' && FILE_ID.test(id))) { errors.push('files must be file ids'); total = null; }
  else if (new Set(files).size !== files.length) errors.push('files must name each file once (1eabd165)');
  if (!Array.isArray(fileEdits)) { errors.push('fileEdits must be an array'); total = null; }
  else {
    fileEdits.forEach((e: unknown, i) => {
      if (!isObj(e) || typeof e['id'] !== 'string' || !FILE_ID.test(e['id'])) { errors.push(`fileEdits[${i}] must be a file id and a count`); total = null; return; }
      if (!isCount(e['n'], 1)) { errors.push(`fileEdits[${i}].n must be a whole number of at least 1`); total = null; return; }
      if (total !== null) total += e['n'];
    });
    if (Array.isArray(files) && (fileEdits.length !== files.length || fileEdits.some((e: unknown, i) => !isObj(e) || e['id'] !== files[i]))) {
      errors.push('fileEdits must list exactly the files, in order (3bc5a746)');
    }
  }
  if (!isCount(s['filesTouched'])) errors.push('filesTouched must be a whole number');
  else if (Array.isArray(files) && isCount(s['filesOutside']) && s['filesTouched'] !== files.length + s['filesOutside']) {
    errors.push('filesTouched must be files plus filesOutside (3bc5a746)');
  }
  otherProblems(s['filesOutside'], s['editsOutside'], ['filesOutside', 'editsOutside'], errors);
  bucketProblems(s['editBuckets'], total !== null && isCount(s['editsOutside']) ? total + s['editsOutside'] : null, 'editBuckets', errors);
  spanProblems(s['editSpanMs'], timesOf(s, errors), 'editSpanMs', errors);
  return errors;
}

/**
 * What a served `DroneDetail` (an `ok` answer of GET /api/drone-detail) must hold to be shown; [] when it
 * can be. Files are unique with at least one edit each; the other counts agree; the buckets add up to
 * every edit; the times and span agree; `needsRescan` means nothing is listed. File order is the view's own.
 */
export function droneDetailProblems(v: unknown): string[] {
  if (!isObj(v)) return ['the session detail must be an object'];
  const errors: string[] = [];
  if (v['ok'] !== true) errors.push('ok must be true');
  if (v['schemaVersion'] !== 'drone-detail.1') errors.push('schemaVersion must be "drone-detail.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  if (typeof v['key'] !== 'string' || !KEY.test(v['key']) || v['key'].length > DETAIL_LIMITS.text) errors.push('key must be a session key (s_…)');
  const files = Array.isArray(v['files']) ? v['files'] : (errors.push('files must be an array'), []);
  if (files.length > DETAIL_LIMITS.files) errors.push(`files must hold at most ${DETAIL_LIMITS.files} entries`);
  let total: number | null = 0;
  const ids = new Set<unknown>();
  files.forEach((f: unknown, i) => {
    const at = `files[${i}]`;
    if (!isObj(f)) { errors.push(`${at} must be an object`); total = null; return; }
    if (typeof f['fileId'] !== 'string' || !FILE_ID.test(f['fileId'])) errors.push(`${at}.fileId must be a file id (f_…)`);
    if (typeof f['path'] !== 'string' || f['path'].length === 0 || f['path'].length > DETAIL_LIMITS.path) errors.push(`${at}.path must be a non-empty string of at most ${DETAIL_LIMITS.path} characters`);
    if (!isCount(f['edits'], 1)) { errors.push(`${at}.edits must be a whole number of at least 1`); total = null; }
    else if (total !== null) total += f['edits'];
    ids.add(f['fileId']);
  });
  if (ids.size !== files.length) errors.push('file ids must be unique (1eabd165)');
  otherProblems(v['otherFiles'], v['otherEdits'], ['otherFiles', 'otherEdits'], errors);
  const times = timesOf(v, errors);
  if (typeof v['needsRescan'] !== 'boolean') errors.push('needsRescan must be a boolean');
  else if (v['needsRescan']) {
    if (files.length > 0 || !Array.isArray(v['buckets']) || v['buckets'].length > 0 || v['otherFiles'] !== 0 || v['otherEdits'] !== 0 || v['spanMs'] !== 0) {
      errors.push('needsRescan means no files, counts, buckets or span');
    }
  } else {
    bucketProblems(v['buckets'], total !== null && isCount(v['otherEdits']) ? total + v['otherEdits'] : null, 'buckets', errors);
    spanProblems(v['spanMs'], times, 'spanMs', errors);
  }
  return errors;
}
