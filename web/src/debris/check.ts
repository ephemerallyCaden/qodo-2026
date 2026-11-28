// The debris view and a piece's panel arrive as untrusted JSON (the local server, a dev fixture or the render hook),
// so every field the view reads is checked here and a bad document is refused with a reason, like the crew's
// (R13, docs/contracts/phase2.md "Debris"). The checks hold the contract's own promises the view relies on: pieces
// by id, totals that add up, no name, creator or path in the list (Rule 6), and commands that are one line of
// printable text, so a copied command can never carry a newline that runs it on paste.
import { DEBRIS_WARNINGS, type DebrisDetailResult, type DebrisView } from '../../../src/core/contract/debris.js';
import { byCodepoint } from '../../../src/core/canonical-json.js';
import type { Checked } from '../model/validate.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHORT = /^[0-9a-f]{7}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const ID = /^x_[0-9a-f]{12}$/;
const DIR_ID = /^d_[0-9a-f]{12,64}$/;
const CLASSES = new Set(['pr', 'branch', 'merged', 'agent']);
const WARNINGS = new Set<unknown>(Object.values(DEBRIS_WARNINGS));
const PIECE_KEYS = ['ageStep', 'cls', 'home', 'id', 'lines', 'seed'];
/** Control, format (bidi and invisible) and line or paragraph separator characters: never in a command the user copies. */
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const MAX_ERRORS = 8;

function refused<T>(errors: string[]): Checked<T> {
  const shown = errors.slice(0, MAX_ERRORS);
  if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more`);
  return { ok: false, errors: shown };
}

const isHome = (v: unknown): boolean => v === 'star' || (typeof v === 'string' && DIR_ID.test(v));
const isTime = (v: unknown): boolean => typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v));
/** A command to copy: one line of printable text, or null. */
const isCommand = (v: unknown): boolean => v === null || (typeof v === 'string' && v.length > 0 && !UNSAFE.test(v));

export function checkDebris(v: unknown): Checked<DebrisView> {
  if (!isObj(v)) return { ok: false, errors: ['the debris view must be an object'] };
  const errors: string[] = [];
  if (v['schemaVersion'] !== 'debris.1') errors.push('schemaVersion must be "debris.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  const pieces = Array.isArray(v['pieces']) ? v['pieces'] : (errors.push('pieces must be an array'), []);
  pieces.forEach((p, i) => {
    const at = `pieces[${i}]`;
    if (!isObj(p)) { errors.push(`${at} must be an object`); return; }
    // exactly these keys: a name, creator or path in the list would let it be grouped by person (Rule 6)
    if (Object.keys(p).sort(byCodepoint).join() !== PIECE_KEYS.join()) errors.push(`${at} must have exactly ${PIECE_KEYS.join(', ')}`);
    if (typeof p['id'] !== 'string' || !ID.test(p['id'])) errors.push(`${at}.id must be a debris id (x_…)`);
    if (!CLASSES.has(p['cls'] as string)) errors.push(`${at}.cls must be pr, branch, merged or agent`);
    else if (p['cls'] === 'pr' && v['prs'] === 'not-read') errors.push(`${at} is a stale PR, but PRs are not read`);
    if (p['home'] !== null && !isHome(p['home'])) errors.push(`${at}.home must be a DirId, "star" or null`);
    if (p['ageStep'] !== 0 && p['ageStep'] !== 1 && p['ageStep'] !== 2) errors.push(`${at}.ageStep must be 0, 1 or 2`);
    if (!isCount(p['lines'])) errors.push(`${at}.lines must be a count`);
    if (!isCount(p['seed']) || (p['seed'] as number) > 0xffffffff) errors.push(`${at}.seed must be a uint32`);
  });
  const ids = pieces.flatMap((p) => (isObj(p) && typeof p['id'] === 'string' ? [p['id']] : []));
  if (ids.some((id, i) => i > 0 && byCodepoint(ids[i - 1]!, id) >= 0)) errors.push('pieces must be unique and in id order');
  if (v['total'] !== pieces.length) errors.push('total must be the number of pieces');
  if (v['placed'] !== pieces.filter((p) => isObj(p) && p['home'] !== null).length) errors.push('placed must be the number of pieces with a home');
  if (v['mass'] !== pieces.reduce((n: number, p) => n + (isObj(p) && isCount(p['lines']) ? p['lines'] : 0), 0)) errors.push('mass must be the sum of lines');
  if (!isCount(v['unreadable'])) errors.push('unreadable must be a count');
  if (v['prs'] !== 'not-read') errors.push('prs must be "not-read"');
  if (typeof v['needsRescan'] !== 'boolean') errors.push('needsRescan must be a boolean');
  else if (v['needsRescan'] && (pieces.length > 0 || v['unreadable'] !== 0)) errors.push('needsRescan means no pieces and nothing unreadable');
  return errors.length === 0 ? { ok: true, value: v as unknown as DebrisView } : refused(errors);
}

/** `GET /api/debris-detail`'s answer: one of its two refusals, or one piece's own panel. */
export function checkDebrisDetail(v: unknown): Checked<DebrisDetailResult> {
  if (!isObj(v)) return { ok: false, errors: ['the debris detail must be an object'] };
  if (v['ok'] !== true) {
    if (v['error'] === 'no-such-item' && v['head'] === undefined) return { ok: true, value: v as unknown as DebrisDetailResult };
    if (v['error'] === 'unknown-head' && typeof v['head'] === 'string' && HEX.test(v['head'])) return { ok: true, value: v as unknown as DebrisDetailResult };
    return { ok: false, errors: ['a refusal must be no-such-item, or unknown-head with the current head'] };
  }
  const errors: string[] = [];
  if (v['schemaVersion'] !== 'debris-detail.1') errors.push('schemaVersion must be "debris-detail.1"');
  if (typeof v['head'] !== 'string' || !HEX.test(v['head'])) errors.push('head must be a full commit SHA');
  if (typeof v['id'] !== 'string' || !ID.test(v['id'])) errors.push('id must be a debris id (x_…)');
  if (!CLASSES.has(v['cls'] as string)) errors.push('cls must be pr, branch, merged or agent');
  if (v['name'] !== null && (typeof v['name'] !== 'string' || v['name'].length === 0)) errors.push('name must be a non-empty string or null');
  if (typeof v['remoteOnly'] !== 'boolean') errors.push('remoteOnly must be a boolean');
  for (const k of ['ageDays', 'aheadCount', 'lines', 'filesOutside']) if (!isCount(v[k])) errors.push(`${k} must be a count`);
  const c = v['lastCommit'];
  if (!isObj(c) || typeof c['sha'] !== 'string' || !HEX.test(c['sha']) || typeof c['short'] !== 'string' || !SHORT.test(c['short']) || !c['sha'].startsWith(c['short'])
    || typeof c['subject'] !== 'string' || !isTime(c['date'])) errors.push('lastCommit must be a SHA, its 7-hex short form, a subject and a UTC date');
  const who = v['creator'];
  if (!isObj(who) || typeof who['displayName'] !== 'string' || typeof who['captain'] !== 'boolean' || typeof who['agent'] !== 'boolean') errors.push('creator must be a display name and two booleans');
  const sessions = Array.isArray(v['sessions']) ? v['sessions'] : (errors.push('sessions must be an array'), []);
  sessions.forEach((s, i) => {
    if (!isObj(s) || typeof s['key'] !== 'string' || s['key'].length === 0 || (s['model'] !== null && typeof s['model'] !== 'string') || !isTime(s['startedAt']) || !isTime(s['endedAt'])) {
      errors.push(`sessions[${i}] must be a key, a model or null, and two UTC times`);
    }
  });
  const planets = Array.isArray(v['planets']) ? v['planets'] : (errors.push('planets must be an array'), []);
  if (!planets.every(isHome)) errors.push('planets must be DirIds or "star"');
  if (planets.some((h, i) => i > 0 && byCodepoint(planets[i - 1] as string, h as string) >= 0)) errors.push('planets must be unique and in codepoint order');
  if (v['home'] !== null && !isHome(v['home'])) errors.push('home must be a DirId, "star" or null');
  else if (v['home'] !== null && !planets.includes(v['home'])) errors.push('home must be one of planets');
  const wt = v['worktree'];
  if (wt !== null && (!isObj(wt) || typeof wt['prunable'] !== 'boolean' || typeof wt['locked'] !== 'boolean')) errors.push('worktree must be null or two booleans');
  if (typeof v['rebased'] !== 'boolean') errors.push('rebased must be a boolean');
  if (!isCommand(v['cleanup'])) errors.push('cleanup must be one line of printable text, or null');
  if (!isCommand(v['inspect'])) errors.push('inspect must be one line of printable text, or null');
  if (v['warning'] !== null && !WARNINGS.has(v['warning'])) errors.push('warning must be one of the contract\'s warnings, or null');
  return errors.length === 0 ? { ok: true, value: v as unknown as DebrisDetailResult } : refused(errors);
}
