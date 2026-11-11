// The view's input boundary: layout.json and the fog view arrive as untrusted JSON (from the local
// server or a dev fixture). Every field the renderer reads is checked here, and a bad document is
// refused with a readable reason (AC9) instead of half-drawing. Pure: no three.js, no DOM.
import type { FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const BANDS = ['lava', 'toxic', 'ash', 'healthy'];
const MOONLET_KINDS = ['root-file', 'unmatched-test'];
const ZONES = ['content', 'outer'];
const FOG_STATES = ['clear', 'charted', 'fogged'];
const FOG_REASONS = ['agent', 'mixed', 'self-committed-agent-written', 'teammate', 'unknown', 'lineage-unknown'];
/** Reasons beyond this many are summarised, so a garbage document still gives a short message. */
const MAX_ERRORS = 8;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

class Checker {
  readonly errors: string[] = [];
  fail(at: string, what: string): void { this.errors.push(`${at} ${what}`); }

  obj(v: unknown, at: string): Obj | null {
    if (isObj(v)) return v;
    this.fail(at, 'must be an object');
    return null;
  }
  arr(v: unknown, at: string): unknown[] {
    if (Array.isArray(v)) return v;
    this.fail(at, 'must be an array');
    return [];
  }
  int(v: unknown, at: string, min = 0, max = Number.MAX_SAFE_INTEGER): void {
    if (typeof v !== 'number' || !Number.isInteger(v)) this.fail(at, 'must be an integer');
    else if (v < min || v > max) this.fail(at, `must be between ${min} and ${max}`);
  }
  str(v: unknown, at: string, prefix = ''): void {
    if (typeof v !== 'string' || v.length === 0) this.fail(at, 'must be a non-empty string');
    else if (prefix && !v.startsWith(prefix)) this.fail(at, `must start with "${prefix}"`);
  }
  oneOf(v: unknown, at: string, options: string[]): void {
    if (typeof v !== 'string' || !options.includes(v)) this.fail(at, `must be one of ${options.join(', ')}`);
  }
  nullableInt(v: unknown, at: string): void {
    if (v !== null) this.int(v, at);
  }
  nullableStr(v: unknown, at: string): void {
    if (v !== null) this.str(v, at);
  }
  /** FogCounts: total and fogged, with fogged ≤ total. */
  counts(o: Obj, at: string): void {
    this.int(o['total'], `${at}.total`);
    this.int(o['fogged'], `${at}.fogged`);
    if (typeof o['total'] === 'number' && typeof o['fogged'] === 'number' && o['fogged'] > o['total']) this.fail(`${at}.fogged`, 'must not exceed total');
  }
  result<T>(value: unknown): Checked<T> {
    if (this.errors.length === 0) return { ok: true, value: value as T };
    const shown = this.errors.slice(0, MAX_ERRORS);
    if (this.errors.length > MAX_ERRORS) shown.push(`…and ${this.errors.length - MAX_ERRORS} more`);
    return { ok: false, errors: shown };
  }
}

function health(c: Checker, v: unknown, at: string): void {
  const h = c.obj(v, at);
  if (!h) return;
  c.oneOf(h['band'], `${at}.band`, BANDS);
  c.int(h['markersPerKlocMilli'], `${at}.markersPerKlocMilli`);
  c.int(h['debtUnknownFiles'], `${at}.debtUnknownFiles`);
  c.nullableInt(h['qodoOpen'], `${at}.qodoOpen`);
  if (typeof h['qodoUnknown'] !== 'boolean') c.fail(`${at}.qodoUnknown`, 'must be a boolean');
}

function settlement(c: Checker, v: unknown, at: string): void {
  const o = c.obj(v, at);
  if (!o) return;
  c.str(o['fileId'], `${at}.fileId`, 'f_');
  c.str(o['dirId'], `${at}.dirId`, 'd_');
  c.int(o['cell'], `${at}.cell`);
  c.int(o['loc'], `${at}.loc`);
  c.int(o['size'], `${at}.size`, 1, 4);
  health(c, o['health'], `${at}.health`);
}

function planet(c: Checker, v: unknown, at: string): void {
  const p = c.obj(v, at);
  if (!p) return;
  c.str(p['dirId'], `${at}.dirId`, 'd_');
  c.str(p['path'], `${at}.path`);
  c.oneOf(p['zone'], `${at}.zone`, ZONES);
  c.int(p['bornSeq'], `${at}.bornSeq`);
  const slot = c.obj(p['slot'], `${at}.slot`);
  if (slot) {
    c.int(slot['index'], `${at}.slot.index`);
    c.int(slot['radiusMilli'], `${at}.slot.radiusMilli`, 1);
    c.int(slot['phaseMilliturn'], `${at}.slot.phaseMilliturn`, 0, 999);
  }
  c.int(p['radiusMilli'], `${at}.radiusMilli`, 1);
  c.int(p['loc'], `${at}.loc`);
  c.int(p['biomeSeed'], `${at}.biomeSeed`, -(2 ** 31), 2 ** 32 - 1);
  health(c, p['health'], `${at}.health`);
  const surface = c.obj(p['surface'], `${at}.surface`);
  if (surface) {
    const grid = c.obj(surface['grid'], `${at}.surface.grid`);
    if (grid) {
      if (grid['kind'] !== 'fibonacci') c.fail(`${at}.surface.grid.kind`, 'must be "fibonacci"');
      c.int(grid['cells'], `${at}.surface.grid.cells`, 1);
    }
    c.arr(surface['continents'], `${at}.surface.continents`).forEach((x, i) => {
      const o = c.obj(x, `${at}.surface.continents[${i}]`);
      if (!o) return;
      c.str(o['dirId'], `${at}.surface.continents[${i}].dirId`, 'd_');
      c.int(o['seedCell'], `${at}.surface.continents[${i}].seedCell`);
    });
    c.arr(surface['settlements'], `${at}.surface.settlements`).forEach((x, i) => settlement(c, x, `${at}.surface.settlements[${i}]`));
    c.int(surface['overflow'], `${at}.surface.overflow`);
  }
  c.arr(p['moons'], `${at}.moons`).forEach((m, i) => {
    const o = c.obj(m, `${at}.moons[${i}]`);
    if (!o) return;
    c.str(o['fileId'], `${at}.moons[${i}].fileId`, 'f_');
    c.int(o['slot'], `${at}.moons[${i}].slot`);
  });
  c.int(p['moonOverflow'], `${at}.moonOverflow`);
}

/** Checks an untrusted layout.json document against `LayoutV1`. */
export function checkLayout(v: unknown): Checked<LayoutV1> {
  const c = new Checker();
  const l = c.obj(v, 'layout');
  if (!l) return c.result(v);
  if (l['schemaVersion'] !== 'layout.1') {
    c.fail('layout.schemaVersion', `must be "layout.1" (got ${JSON.stringify(l['schemaVersion'])})`);
    return c.result(v); // another schema: its fields mean something else, so don't list them
  }
  const source = c.obj(l['source'], 'layout.source');
  if (source) {
    c.str(source['repoId'], 'layout.source.repoId');
    c.str(source['head'], 'layout.source.head');
    // Content roots (#71): accepted and checked, not drawn differently yet.
    c.arr(source['roots'], 'layout.source.roots').forEach((r, i) => c.str(r, `layout.source.roots[${i}]`));
  }
  const k = c.obj(l['constants'], 'layout.constants');
  if (k) {
    c.int(k['slotSpacingMilli'], 'layout.constants.slotSpacingMilli', 1);
    c.int(k['maxPlanetRadiusMilli'], 'layout.constants.maxPlanetRadiusMilli', 1);
    c.int(k['moonCap'], 'layout.constants.moonCap');
  }
  const star = c.obj(l['star'], 'layout.star');
  if (star) {
    c.str(star['repoId'], 'layout.star.repoId');
    c.arr(star['moonlets'], 'layout.star.moonlets').forEach((m, i) => {
      const o = c.obj(m, `layout.star.moonlets[${i}]`);
      if (!o) return;
      c.str(o['fileId'], `layout.star.moonlets[${i}].fileId`, 'f_');
      c.oneOf(o['kind'], `layout.star.moonlets[${i}].kind`, MOONLET_KINDS);
      c.int(o['slot'], `layout.star.moonlets[${i}].slot`);
    });
    c.int(star['moonletOverflow'], 'layout.star.moonletOverflow');
    c.int(star['testData'], 'layout.star.testData');
  }
  c.arr(l['planets'], 'layout.planets').forEach((p, i) => planet(c, p, `layout.planets[${i}]`));
  return c.result(v);
}

/** Checks an untrusted fog view. The view accepts it but doesn't draw fog yet (#30 scope). */
export function checkFog(v: unknown): Checked<FogView> {
  const c = new Checker();
  const f = c.obj(v, 'fog');
  if (!f) return c.result(v);
  if (f['schemaVersion'] !== 'fog.1') {
    c.fail('fog.schemaVersion', `must be "fog.1" (got ${JSON.stringify(f['schemaVersion'])})`);
    return c.result(v);
  }
  c.str(f['head'], 'fog.head');
  c.nullableStr(f['baseline'], 'fog.baseline');
  c.arr(f['files'], 'fog.files').forEach((x, i) => {
    const at = `fog.files[${i}]`;
    const o = c.obj(x, at);
    if (!o) return;
    c.str(o['fileId'], `${at}.fileId`, 'f_');
    c.oneOf(o['state'], `${at}.state`, FOG_STATES);
    c.arr(o['reasons'], `${at}.reasons`).forEach((r, k) => c.oneOf(r, `${at}.reasons[${k}]`, FOG_REASONS));
    c.nullableStr(o['since'], `${at}.since`);
  });
  c.arr(f['planets'], 'fog.planets').forEach((x, i) => {
    const o = c.obj(x, `fog.planets[${i}]`);
    if (!o) return;
    c.str(o['dirId'], `fog.planets[${i}].dirId`, 'd_');
    c.counts(o, `fog.planets[${i}]`);
  });
  const star = c.obj(f['star'], 'fog.star');
  if (star) c.counts(star, 'fog.star');
  return c.result(v);
}
