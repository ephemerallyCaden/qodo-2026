// Captain's log beacons in the view (#79, R10). The beacon view arrives as untrusted JSON, so every
// field the view reads is checked here, the note against the same rule the server stores it by
// (beaconTextProblem): one plain line, no control or bidi characters. Notes only ever reach the page as
// bitmap-font labels or DOM textContent, never as HTML. Pure: no three.js, no DOM.
import { beaconTextProblem } from '../../../src/core/beacon-text.js';
import { MAX_BEACONS, type BeaconResult, type BeaconView } from '../../../src/core/contract/beacons.js';
import { CORONA } from './star.js';
import { planetCentre, type SystemModel } from './system.js';
import type { Checked } from './validate.js';
import type { Vec3 } from './vec.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FILE_ID = /^f_[0-9a-f]{12,64}$/;
const DIR_ID = /^d_[0-9a-f]{12,64}$/;
const MAX_ERRORS = 8;
/** A refusal the view prints: bounded, and printable only. */
const MAX_TEXT = 300;
/** A repo path: shown only as bitmap glyphs or DOM text, so any characters, but bounded. */
const MAX_PATH = 4096;
const printable = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT && !/[\p{Cc}\p{Cf}]/u.test(v);

const result = <T>(v: unknown, errors: string[]): Checked<T> => {
  if (errors.length === 0) return { ok: true, value: v as T };
  const shown = errors.slice(0, MAX_ERRORS);
  if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more`);
  return { ok: false, errors: shown };
};

function checkInto(v: unknown, errors: string[]): void {
  if (!isObj(v)) { errors.push('the beacon view must be an object'); return; }
  if (v['schemaVersion'] !== 'beacons.1') errors.push('schemaVersion must be "beacons.1"');
  if (typeof v['head'] !== 'string' || !SHA.test(v['head'])) errors.push('head must be a full commit SHA');
  const u = v['unplaced'];
  if (typeof u !== 'number' || !Number.isInteger(u) || u < 0) errors.push('unplaced must be a whole number');
  const list = v['beacons'];
  if (!Array.isArray(list) || list.length > MAX_BEACONS) { errors.push(`beacons must be an array of at most ${MAX_BEACONS}`); return; }
  list.forEach((b, i) => {
    const at = `beacons[${i}]`;
    if (!isObj(b)) { errors.push(`${at} must be an object`); return; }
    if (typeof b['fileId'] !== 'string' || !FILE_ID.test(b['fileId'])) errors.push(`${at}.fileId must be a file id`);
    const path = b['path'];
    if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH) errors.push(`${at}.path must be a repo path`);
    if (b['home'] !== 'star' && (typeof b['home'] !== 'string' || !DIR_ID.test(b['home']))) errors.push(`${at}.home must be a planet id or "star"`);
    if (typeof b['at'] !== 'string' || !SHA.test(b['at'])) errors.push(`${at}.at must be a full commit SHA`);
    if (beaconTextProblem(b['text']) !== null) errors.push(`${at}.text must be one plain line of at most 120 characters`);
  });
}

export function checkBeacons(v: unknown): Checked<BeaconView> {
  const errors: string[] = [];
  checkInto(v, errors);
  return result(v, errors);
}

/** A beacon write's answer: the new view (checked like any), or a refusal with short printable text. */
export function checkBeaconResult(v: unknown): Checked<BeaconResult> {
  const errors: string[] = [];
  if (!isObj(v)) return result(v, ['the beacon answer must be an object']);
  if (v['ok'] === true) checkInto(v['beacons'], errors);
  else {
    if (v['ok'] !== false || !printable(v['error'])) errors.push('a refused beacon must say why in one short line');
    if (v['head'] !== undefined && (typeof v['head'] !== 'string' || !SHA.test(v['head']))) errors.push('head must be a full commit SHA');
  }
  return result(v, errors);
}

/** The beacons on one body: a planet (its index in the model) or the star (-1), newest note first. */
export interface BeaconSpot { planet: number; notes: string[] }

/**
 * The bodies holding beacons in this model, planets in model order and then the star. A beacon whose
 * planet this layout lacks is counted with the server's unplaced ones, never drawn (Rule 1).
 */
export function beaconSpots(view: BeaconView | null, model: SystemModel): { spots: BeaconSpot[]; unplaced: number } {
  if (!view) return { spots: [], unplaced: 0 };
  const index = new Map(model.planets.map((p, i) => [p.dirId, i]));
  const notes = new Map<number, string[]>();
  let unplaced = view.unplaced;
  for (const b of view.beacons) {
    const i = b.home === 'star' ? -1 : index.get(b.home);
    if (i === undefined) { unplaced++; continue; }
    const list = notes.get(i);
    if (list) list.unshift(b.text);
    else notes.set(i, [b.text]);
  }
  const order = [...notes.keys()].sort((a, b) => (a < 0 ? 1 : b < 0 ? -1 : a - b));
  return { spots: order.map((planet) => ({ planet, notes: notes.get(planet)! })), unplaced };
}

/** Where a spot's beacon stands at a frame: its body's centre and the radius it stands clear of (the star's corona included). */
export function spotBody(model: SystemModel, spot: BeaconSpot, frame: number): { centre: Vec3; radius: number } {
  const p = spot.planet >= 0 ? model.planets[spot.planet] : undefined;
  return p ? { centre: planetCentre(p, frame), radius: p.radius } : { centre: [0, 0, 0], radius: model.star.radius * CORONA.reach };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The info panel's beacon line for a body with `n` notes, and the view's unplaced count. */
export function beaconLine(n: number, unplaced: number): string | null {
  if (n === 0 && unplaced === 0) return null;
  const here = n > 0 ? plural(n, 'beacon', 'beacons') : 'no beacons';
  return unplaced > 0 ? `${here} (+${unplaced} not placed)` : here;
}
