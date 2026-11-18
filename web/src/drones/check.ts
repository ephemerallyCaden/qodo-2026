// The drone view arrives as untrusted JSON (the local server or a dev fixture), so every field the view
// reads is checked here and a bad document is refused with a reason (AC 10), like layout and fog. So is
// a session's detail (#148).
import { DETAIL_BUCKETS, type DroneDetailResult, type DroneView } from '../../../src/core/contract/drones.js';
import type { Checked } from '../model/validate.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const KEY = /^s_.+/;
const MAX_ERRORS = 8;
/** A string field the view prints: bounded, so a hostile document can't flood the panel. */
const MAX_TEXT = 200;
/** A repo-relative path the panel prints: long enough for any real one, short enough to bound the panel. */
const MAX_PATH = 4096;
/** The most files one session's detail may list (a snapshot holds about 5k). */
const MAX_FILES = 20_000;
const FILE_ID = /^f_[0-9a-f]{12,64}$/;

function checkSession(v: unknown, at: string, errors: string[]): void {
  if (!isObj(v)) { errors.push(`${at} must be an object`); return; }
  const bad = (field: string, what: string) => errors.push(`${at}.${field} ${what}`);
  const text = (f: string, nullable: boolean) => {
    const x = v[f];
    if (x === null && nullable) return;
    if (typeof x !== 'string' || x.length === 0 || x.length > MAX_TEXT) bad(f, `must be a non-empty string of at most ${MAX_TEXT} characters${nullable ? ' or null' : ''}`);
  };
  if (typeof v['key'] !== 'string' || !KEY.test(v['key']) || v['key'].length > MAX_TEXT) bad('key', 'must be a session key (s_…)');
  const seed = v['seed'];
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) bad('seed', 'must be a uint32');
  text('tool', false);
  if (v['kind'] !== 'main' && v['kind'] !== 'subagent') bad('kind', 'must be main or subagent');
  if (v['parentKey'] !== null && (typeof v['parentKey'] !== 'string' || !KEY.test(v['parentKey']))) bad('parentKey', 'must be a session key or null');
  text('agentType', true);
  for (const f of ['startedAt', 'endedAt']) if (typeof v[f] !== 'string' || !ISO.test(v[f]) || !Number.isFinite(Date.parse(v[f]))) bad(f, 'must be a UTC time');
  text('branch', true);
  text('model', true);
  if (typeof v['inferred'] !== 'boolean') bad('inferred', 'must be a boolean');
  if (v['home'] !== null && (typeof v['home'] !== 'string' || v['home'].length === 0 || v['home'].length > MAX_TEXT)) bad('home', 'must be a body id, "star" or null');
}

const isCount = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= Number.MAX_SAFE_INTEGER;

/** The first MAX_ERRORS reasons, and how many more there were. */
function refused<T>(errors: string[]): Checked<T> {
  const shown = errors.slice(0, MAX_ERRORS);
  if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more`);
  return { ok: false, errors: shown };
}

/**
 * `GET /api/drone-detail`'s answer (#148): a detail whose counts add up, or one of its two refusals.
 * Files must be unique; their order is the view's own (it groups them by folder itself).
 */
export function checkDroneDetail(v: unknown): Checked<DroneDetailResult> {
  const errors: string[] = [];
  if (!isObj(v)) return { ok: false, errors: ['the session detail must be an object'] };
  if (v['ok'] !== true) {
    if (v['error'] === 'no-such-session' && v['head'] === undefined) return { ok: true, value: v as unknown as DroneDetailResult };
    if (v['error'] === 'unknown-head' && typeof v['head'] === 'string' && HEX.test(v['head'])) return { ok: true, value: v as unknown as DroneDetailResult };
    return { ok: false, errors: ['a refusal must be no-such-session, or unknown-head with the current head'] };
  }
  if (v['schemaVersion'] !== 'drone-detail.1') errors.push('schemaVersion must be "drone-detail.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  if (typeof v['key'] !== 'string' || !KEY.test(v['key']) || v['key'].length > MAX_TEXT) errors.push('key must be a session key (s_…)');
  for (const f of ['startedAt', 'endedAt']) if (typeof v[f] !== 'string' || !ISO.test(v[f]) || !Number.isFinite(Date.parse(v[f]))) errors.push(`${f} must be a UTC time`);
  const files = Array.isArray(v['files']) ? v['files'] : (errors.push('files must be an array'), []);
  if (files.length > MAX_FILES) errors.push(`files must hold at most ${MAX_FILES} entries`);
  let edits = 0;
  const ids = new Set<unknown>();
  files.forEach((f, i) => {
    const at = `files[${i}]`;
    if (!isObj(f)) { errors.push(`${at} must be an object`); return; }
    if (typeof f['fileId'] !== 'string' || !FILE_ID.test(f['fileId'])) errors.push(`${at}.fileId must be a file id (f_…)`);
    if (typeof f['path'] !== 'string' || f['path'].length === 0 || f['path'].length > MAX_PATH) errors.push(`${at}.path must be a non-empty string of at most ${MAX_PATH} characters`);
    if (!isCount(f['edits'], 1)) errors.push(`${at}.edits must be an integer of at least 1`);
    else edits += f['edits'];
    ids.add(f['fileId']);
  });
  if (ids.size !== files.length) errors.push('file ids must be unique');
  const otherFiles = v['otherFiles'];
  const otherEdits = v['otherEdits'];
  if (!isCount(otherFiles)) errors.push('otherFiles must be a non-negative integer');
  if (!isCount(otherEdits)) errors.push('otherEdits must be a non-negative integer');
  else if (isCount(otherFiles) && (otherEdits < otherFiles || (otherFiles === 0 && otherEdits > 0))) {
    // Each other file has an edit, and an edit there has a file: else the list couldn't explain it (Qodo 05ffa5a8).
    errors.push('otherEdits must be at least otherFiles, and 0 when otherFiles is');
  }
  const buckets = Array.isArray(v['buckets']) ? v['buckets'] : (errors.push('buckets must be an array'), []);
  if (typeof v['needsRescan'] !== 'boolean') errors.push('needsRescan must be a boolean');
  else if (v['needsRescan']) {
    if (files.length > 0 || buckets.length > 0 || otherFiles !== 0 || otherEdits !== 0) errors.push('needsRescan means no files, counts or buckets');
  } else if (buckets.length !== DETAIL_BUCKETS) errors.push(`buckets must hold exactly ${DETAIL_BUCKETS} slices`);
  else if (!buckets.every((b) => isCount(b))) errors.push('buckets must be non-negative integers');
  else if (isCount(otherEdits) && (buckets as number[]).reduce((a, b) => a + b, 0) !== edits + otherEdits) errors.push("buckets must add up to the files' edits plus otherEdits");
  return errors.length === 0 ? { ok: true, value: v as unknown as DroneDetailResult } : refused(errors);
}

export function checkDrones(v: unknown): Checked<DroneView> {
  const errors: string[] = [];
  if (!isObj(v)) return { ok: false, errors: ['the drone view must be an object'] };
  if (v['schemaVersion'] !== 'drones.1') errors.push('schemaVersion must be "drones.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  const sessions = Array.isArray(v['sessions']) ? v['sessions'] : (errors.push('sessions must be an array'), []);
  sessions.forEach((s, i) => checkSession(s, `sessions[${i}]`, errors));
  const keys = sessions.flatMap((s) => (isObj(s) && typeof s['key'] === 'string' ? [s['key']] : []));
  if (new Set(keys).size !== keys.length) errors.push('session keys must be unique');
  const homed = sessions.filter((s) => isObj(s) && s['home'] !== null).length;
  if (v['total'] !== sessions.length) errors.push('total must be the number of sessions');
  if (v['placed'] !== homed) errors.push('placed must be the number of sessions with a home');
  if (typeof v['needsRescan'] !== 'boolean') errors.push('needsRescan must be a boolean');
  else if (v['needsRescan'] && homed > 0) errors.push('needsRescan means no session has a home');
  return errors.length === 0 ? { ok: true, value: v as unknown as DroneView } : refused(errors);
}
