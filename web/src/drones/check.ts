// The drone view arrives as untrusted JSON (the local server or a dev fixture), so every field the view
// reads is checked here and a bad document is refused with a reason (AC 10), like layout and fog.
import type { DroneView } from '../../../src/core/contract/drones.js';
import type { Checked } from '../model/validate.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const KEY = /^s_.+/;
const MAX_ERRORS = 8;
/** A string field the view prints: bounded, so a hostile document can't flood the panel. */
const MAX_TEXT = 200;

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
  if (errors.length === 0) return { ok: true, value: v as unknown as DroneView };
  const shown = errors.slice(0, MAX_ERRORS);
  if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more`);
  return { ok: false, errors: shown };
}
