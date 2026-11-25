// The crew view and a crew member's panel arrive as untrusted JSON (the local server, a dev fixture or the
// render hook), so every field the view reads is checked here and a bad document is refused with a reason,
// like the drones' (#207, docs/contracts/phase2.md "Crew"). The checks also hold the contract's own promises
// the view relies on: members by person id (never by activity, Rule 6), one captain at most, files in folder
// order, no per-person count in the list.
import type { CrewDetailResult, CrewView } from '../../../src/core/contract/crew.js';
import { byCodepoint } from '../../../src/core/canonical-json.js';
import { byFolderThenName } from '../../../src/core/drones.js';
import type { Checked } from '../model/validate.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= Number.MAX_SAFE_INTEGER;
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const PERSON = /^p_[0-9a-f]{12,64}$/;
const FILE_ID = /^f_[0-9a-f]{12,64}$/;
const DIR_ID = /^d_[0-9a-f]{12,64}$/;
const MAX_ERRORS = 8;
/** A name the view prints: bounded, so a hostile document can't flood the panel. */
export const CREW_LIMITS = { text: 200, path: 4096, files: 20_000, members: 100_000 } as const;
const MEMBER_KEYS = ['captain', 'displayName', 'person', 'seed'];

function refused<T>(errors: string[]): Checked<T> {
  const shown = errors.slice(0, MAX_ERRORS);
  if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more`);
  return { ok: false, errors: shown };
}

const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= CREW_LIMITS.text;
const isHome = (v: unknown): boolean => v === 'star' || (typeof v === 'string' && DIR_ID.test(v));

export function checkCrew(v: unknown): Checked<CrewView> {
  if (!isObj(v)) return { ok: false, errors: ['the crew view must be an object'] };
  const errors: string[] = [];
  if (v['schemaVersion'] !== 'crew.1') errors.push('schemaVersion must be "crew.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  const members = Array.isArray(v['members']) ? v['members'] : (errors.push('members must be an array'), []);
  if (members.length > CREW_LIMITS.members) errors.push(`members must be at most ${CREW_LIMITS.members}`);
  members.forEach((m, i) => {
    const at = `members[${i}]`;
    if (!isObj(m)) { errors.push(`${at} must be an object`); return; }
    // exactly these keys: a count of any kind per person would be a ranking waiting to happen (Rule 6)
    const keys = Object.keys(m).sort(byCodepoint);
    if (keys.join() !== MEMBER_KEYS.join()) errors.push(`${at} must have exactly ${MEMBER_KEYS.join(', ')}`);
    if (typeof m['person'] !== 'string' || !PERSON.test(m['person'])) errors.push(`${at}.person must be a person id (p_…)`);
    if (!isName(m['displayName'])) errors.push(`${at}.displayName must be a string of at most ${CREW_LIMITS.text} characters`);
    if (!isCount(m['seed']) || (m['seed'] as number) > 0xffffffff) errors.push(`${at}.seed must be a uint32`);
    if (typeof m['captain'] !== 'boolean') errors.push(`${at}.captain must be a boolean`);
  });
  const ids = members.flatMap((m) => (isObj(m) && typeof m['person'] === 'string' ? [m['person']] : []));
  if (new Set(ids).size !== ids.length) errors.push('person ids must be unique');
  if (ids.some((id, i) => i > 0 && byCodepoint(ids[i - 1]!, id) > 0)) errors.push('members must be in person-id order');
  if (members.filter((m) => isObj(m) && m['captain'] === true).length > 1) errors.push('there is at most one captain');
  if (v['total'] !== members.length) errors.push('total must be the number of members');
  if (!isCount(v['bots'])) errors.push('bots must be a count');
  if (typeof v['needsRescan'] !== 'boolean') errors.push('needsRescan must be a boolean');
  else if (v['needsRescan'] && (members.length > 0 || v['bots'] !== 0)) errors.push('needsRescan means no members and no bots');
  return errors.length === 0 ? { ok: true, value: v as unknown as CrewView } : refused(errors);
}

/** `GET /api/crew-detail`'s answer: one of its two refusals, or one person's own panel. */
export function checkCrewDetail(v: unknown): Checked<CrewDetailResult> {
  if (!isObj(v)) return { ok: false, errors: ['the crew detail must be an object'] };
  if (v['ok'] !== true) {
    if (v['error'] === 'no-such-person' && v['head'] === undefined) return { ok: true, value: v as unknown as CrewDetailResult };
    if (v['error'] === 'unknown-head' && typeof v['head'] === 'string' && HEX.test(v['head'])) return { ok: true, value: v as unknown as CrewDetailResult };
    return { ok: false, errors: ['a refusal must be no-such-person, or unknown-head with the current head'] };
  }
  const errors: string[] = [];
  if (v['schemaVersion'] !== 'crew-detail.1') errors.push('schemaVersion must be "crew-detail.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  if (typeof v['person'] !== 'string' || !PERSON.test(v['person'])) errors.push('person must be a person id (p_…)');
  if (!isName(v['displayName'])) errors.push(`displayName must be a string of at most ${CREW_LIMITS.text} characters`);
  if (typeof v['captain'] !== 'boolean') errors.push('captain must be a boolean');
  const last = v['lastActive'];
  if (last !== null && (typeof last !== 'string' || !ISO.test(last) || !Number.isFinite(Date.parse(last)))) errors.push('lastActive must be a UTC time or null');
  const planets = Array.isArray(v['planets']) ? v['planets'] : (errors.push('planets must be an array'), []);
  planets.forEach((p, i) => {
    if (!isObj(p) || !isHome(p['home']) || !isCount(p['touches'], 1)) errors.push(`planets[${i}] must be a body (a DirId or "star") with touches ≥ 1`);
  });
  const homes = planets.flatMap((p) => (isObj(p) && typeof p['home'] === 'string' ? [p['home']] : []));
  if (new Set(homes).size !== homes.length || homes.some((h, i) => i > 0 && byCodepoint(homes[i - 1]!, h) > 0)) errors.push('planets must be unique and sorted by home');
  const files = Array.isArray(v['files']) ? v['files'] : (errors.push('files must be an array'), []);
  if (files.length > CREW_LIMITS.files) errors.push(`files must be at most ${CREW_LIMITS.files}`);
  files.forEach((f, i) => {
    const at = `files[${i}]`;
    if (!isObj(f)) { errors.push(`${at} must be an object`); return; }
    if (typeof f['fileId'] !== 'string' || !FILE_ID.test(f['fileId'])) errors.push(`${at}.fileId must be a file id`);
    if (typeof f['path'] !== 'string' || f['path'].length === 0 || f['path'].length > CREW_LIMITS.path) errors.push(`${at}.path must be a non-empty string of at most ${CREW_LIMITS.path} characters`);
    if (!isHome(f['home'])) errors.push(`${at}.home must be a DirId or "star"`);
    if (!isCount(f['touches'], 1)) errors.push(`${at}.touches must be at least 1`);
  });
  const paths = files.flatMap((f) => (isObj(f) && typeof f['path'] === 'string' ? [f['path']] : []));
  if (paths.some((p, i) => i > 0 && byFolderThenName(paths[i - 1]!, p) >= 0)) errors.push('files must be unique and in folder-then-name order');
  if (!isCount(v['otherFiles'])) errors.push('otherFiles must be a count');
  if (typeof v['needsRescan'] !== 'boolean') errors.push('needsRescan must be a boolean');
  else if (v['needsRescan'] && (last !== null || planets.length > 0 || files.length > 0)) errors.push('needsRescan means no lastActive, planets or files');
  else if (!v['needsRescan'] && last === null) errors.push('lastActive is null only when needsRescan');
  return errors.length === 0 ? { ok: true, value: v as unknown as CrewDetailResult } : refused(errors);
}
