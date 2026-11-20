// layout() (#18): the scan as a star system, in the layout.1 shape (src/core/contract/layout.ts).
// Pure: the same snapshot and structural history (which carries the content roots, #71) always
// give the same layout.json bytes (Rule 3).
//
// Placement is decided once. layout() replays the full first-parent history (StructureHistory, from
// the scan's lineage pass), so every body is placed when it is born and stays put: later births
// only take free places, and a deleted body frees its place for later ones. The history isn't in
// snapshot.json, so layout.json can't be recomputed from the snapshot alone; `commet scan` writes it.
import { byCodepoint } from '../canonical-json.js';
import type { Health, LayoutV1, Moon, Moonlet, Planet, Settlement } from '../contract/layout.js';
import { u32 } from '../hash.js';
import type { DirId, FileEntry, FileId, SnapshotV02 } from '../snapshot/types.js';
import {
  ancestors, byBirth, clearLink, fileHome, folderHome, isTestData, olderThan, planetHome, trackedDepth, type BirthRank, type FileEvent,
  type PlanetBirth, type StructureHistory, type Zone,
} from '../structure.js';
import { LIST_LIMIT, printable } from '../summary.js';
import {
  CONTENT_SLOTS, FIRST_ORBIT_MILLI, MAX_PLANET_RADIUS_MILLI, MIN_PLANET_RADIUS_MILLI, MOON_CAP, MOONLET_CAP, OUTER_GAP_SLOTS,
  PHASE_STEP_MILLITURN, RADIUS_PER_LOG2_MILLI, SETTLEMENT_SIZE_MAX_LOC, SLOT_SPACING_MILLI, SURFACE_CELLS,
} from './constants.js';
import { health, type HealthInput } from './health.js';
import { Surface } from './surface.js';

export interface LayoutOptions {
  /** Cells per surface grid (tests use a small one). */
  surfaceCells?: number;
}

/** What layout() placed on weaker evidence, for the scan summary (Rule 1: counted, never hidden). */
export interface LayoutNotes {
  /**
   * Files at HEAD born where git couldn't follow an older file (a copy, a move out of an excluded
   * path, a commit over the rename limit), so they were placed as new.
   */
  unsure: number;
  /** Files at HEAD whose history didn't match the snapshot (it shouldn't happen); they were placed or moved last. */
  unmatched: number;
}

/**
 * floor(1000 × log2(x)) for an integer x ≥ 1, by repeated squaring. IEEE multiplication is exactly
 * rounded everywhere, while Math.log2 is only an approximation, so this keeps radii byte-stable.
 */
export function log2Milli(x: number): number {
  let n = 0;
  while (2 ** (n + 1) <= x) n++;
  let y = x / 2 ** n;
  let frac = 0;
  for (let bit = 0; bit < 20; bit++) {
    y *= y;
    frac *= 2;
    if (y >= 2) {
      y /= 2;
      frac += 1;
    }
  }
  return n * 1000 + Math.floor((frac * 1000) / 2 ** 20);
}

/** Body radius from clamped log2(1 + LOC). */
export const planetRadiusMilli = (loc: number) =>
  Math.min(MAX_PLANET_RADIUS_MILLI, Math.max(MIN_PLANET_RADIUS_MILLI, Math.floor((log2Milli(1 + loc) * RADIUS_PER_LOG2_MILLI) / 1000)));

/** Settlement size class 1..4 from LOC. */
export function settlementSize(loc: number): number {
  const i = SETTLEMENT_SIZE_MAX_LOC.findIndex((max) => loc <= max);
  return i < 0 ? SETTLEMENT_SIZE_MAX_LOC.length + 1 : i + 1;
}

const orbitSlot = (index: number) =>
  ({ index, radiusMilli: FIRST_ORBIT_MILLI + index * SLOT_SPACING_MILLI, phaseMilliturn: (index * PHASE_STEP_MILLITURN) % 1000 });

/**
 * A planet in the replay: its zone and folder id (#71). A folder that moves between zones (into a
 * content root, or out of one) leaves one planet and becomes another, placed in its new zone.
 */
type PlanetKey = `${Zone} ${DirId}`;
const planetKey = (zone: Zone, id: DirId): PlanetKey => `${zone} ${id}`;
const idOf = (k: PlanetKey) => k.slice(k.indexOf(' ') + 1) as DirId;
const zoneOf = (k: PlanetKey) => k.slice(0, k.indexOf(' ')) as Zone;

interface FileState { key: number; path: string; sub: DirId | null; planet: PlanetKey | null; cell: number | null; unsure: boolean }
interface PlanetState { id: DirId; zone: Zone; slot: number; partner: DirId | null; rank: BirthRank }

/**
 * Replays the structural history. Each commit: files that leave a planet free their cells; a
 * planet's folder left with no surface file stops being a planet and frees its slot; folders
 * gaining their first surface file are placed, oldest first; then arriving files claim cells,
 * oldest first. A file that moves within its planet keeps its cell. Only surface files settle
 * (planetHome): root files and files directly inside a content root orbit the star, and tests and
 * test data ride with the tests.
 */
class Replay {
  readonly files = new Map<number, FileState>();
  readonly planets = new Map<PlanetKey, PlanetState>();
  readonly surfaces = new Map<PlanetKey, Surface>();
  private readonly surfaceFiles = new Map<PlanetKey, number>();
  private readonly slots = new Set<number>();
  private readonly births: Record<Zone, Map<DirId, PlanetBirth>>;
  private readonly roots: string[];
  /** The outer zone's first slot: 0 with no roots (#18), else past the content slots and the gap (#71). */
  private readonly outerFrom: number;

  constructor(history: StructureHistory, private readonly cells: number) {
    this.births = { outer: new Map(history.births.map((b) => [b.id, b])), content: new Map(history.rootBirths.map((b) => [b.id, b])) };
    this.roots = history.roots;
    this.outerFrom = history.roots.length === 0 ? 0 : CONTENT_SLOTS + OUTER_GAP_SLOTS;
  }

  private surface(k: PlanetKey): Surface {
    let s = this.surfaces.get(k);
    if (!s) this.surfaces.set(k, (s = new Surface(this.cells, idOf(k))));
    return s;
  }

  /** Replays `events[from..to)`, one commit. */
  step(events: FileEvent[], from: number, to: number): void {
    const seq = events[from]!.seq;
    const arrivals: FileState[] = [];
    const changed = new Set<PlanetKey>();
    for (let i = from; i < to; i++) {
      const ev = events[i]!;
      const prev = this.files.get(ev.key);
      const home = ev.to === null ? null : planetHome(ev.to, this.roots);
      const id = home === null ? undefined : ev.dirs[home.depth - 1];
      const planet = home === null || id === undefined ? null : planetKey(home.zone, id);
      // Its continent: the planet's subfolder it is in, if any (deeper folders fold into it).
      const sub = home === null ? null : ev.dirs[home.depth] ?? null;
      if (prev?.planet && prev.planet !== planet) {
        if (prev.cell !== null) this.surfaces.get(prev.planet)!.release(prev.cell);
        this.surfaceFiles.set(prev.planet, this.surfaceFiles.get(prev.planet)! - 1);
        changed.add(prev.planet);
      }
      if (ev.to === null) {
        this.files.delete(ev.key);
        continue;
      }
      const stays = planet !== null && prev?.planet === planet;
      const next: FileState = { key: ev.key, path: ev.to, sub, planet, cell: stays ? prev!.cell : null,
        unsure: prev?.unsure ?? ev.unsure === true };
      this.files.set(ev.key, next);
      if (stays) {
        // A rename keeps its cell; a new continent still gets its seed when its folder arrives.
        if (sub !== null) this.surface(planet).seed(sub);
      } else if (planet !== null) {
        this.surfaceFiles.set(planet, (this.surfaceFiles.get(planet) ?? 0) + 1);
        changed.add(planet);
        arrivals.push(next);
      }
    }
    for (const k of changed) {
      const p = this.planets.get(k);
      if (p && this.surfaceFiles.get(k) === 0) {
        this.planets.delete(k);
        this.slots.delete(p.slot);
      }
    }
    const born = [...changed].filter((k) => !this.planets.has(k) && (this.surfaceFiles.get(k) ?? 0) > 0).map((k) => {
      const b = this.births[zoneOf(k)].get(idOf(k));
      return { k, rank: { id: idOf(k), seq: b?.seq ?? seq, order: b?.order ?? 0 } };
    }).sort((a, b) => byBirth(a.rank, b.rank));
    for (const me of born) this.place(me.k, me.rank);
    for (const f of arrivals.sort(byKey)) {
      const s = this.surface(f.planet!);
      f.cell = s.claim(s.seed(f.sub ?? idOf(f.planet!)));
    }
  }

  /**
   * In its zone's slots, the free one nearest its birth partner (ties: the inner one), or with none
   * the innermost free one. Partners are older planets in the same zone. A content planet born while
   * every content slot is taken goes to the innermost free slot past the gap, so nothing moves (#71).
   */
  private place(k: PlanetKey, me: BirthRank): void {
    const zone = zoneOf(k);
    const older = [...this.planets.values()].filter((p) => p.zone === zone).map((p) => p.rank).filter((x) => olderThan(x, me));
    const partner = clearLink(this.births[zone].get(me.id)?.first ?? [], older);
    let full = zone === 'content';
    for (let i = 0; full && i < CONTENT_SLOTS; i++) full = this.slots.has(i);
    const [lo, hi] = zone === 'outer' || full ? [this.outerFrom, Infinity] : [0, CONTENT_SLOTS];
    const near = full ? null : partner;
    const free = (i: number) => i >= lo && i < hi && !this.slots.has(i);
    let slot = lo;
    if (near === null) while (!free(slot)) slot++;
    else {
      const at = this.planets.get(planetKey(zone, near))!.slot;
      let d = 1;
      while (!free(at - d) && !free(at + d)) d++;
      slot = free(at - d) ? at - d : at + d;
    }
    this.planets.set(k, { id: me.id, zone, slot, partner, rank: me });
    this.slots.add(slot);
  }
}

/**
 * Closes the history at HEAD: files the history has but HEAD doesn't leave, files whose folders
 * differ move, and files the history lacks are born last. So the replay ends exactly at the
 * snapshot and nothing in it is dropped. On a scan this is empty; what it repairs is counted.
 */
function reconcile(snapshot: SnapshotV02, events: FileEvent[], roots: readonly string[]): FileEvent[] {
  const dirByPath = new Map(snapshot.dirs.map((d) => [d.path, d.id]));
  // The lineage's folder ids for a path (FileEvent.dirs); a folder the snapshot lacks ends the list
  // there, as what's below it can't be placed on it.
  const idsOf = (path: string) => {
    const dirs: DirId[] = [];
    for (const d of ancestors(path).slice(0, trackedDepth(path, roots))) {
      const id = dirByPath.get(d);
      if (id === undefined) break;
      dirs.push(id);
    }
    return dirs;
  };
  const same = (a: DirId[], b: DirId[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const end = new Map<number, FileEvent>();
  let nextKey = 0;
  for (const ev of events) {
    nextKey = Math.max(nextKey, ev.key + 1);
    if (ev.to === null) end.delete(ev.key);
    else end.set(ev.key, ev);
  }
  const seq = (events.at(-1)?.seq ?? -1) + 1;
  const head = new Set(snapshot.files.map((f) => f.path));
  const out: FileEvent[] = [];
  const seen = new Set<string>();
  for (const [key, ev] of [...end].sort((a, b) => a[0] - b[0])) {
    const path = ev.to!;
    if (!head.has(path) || seen.has(path)) {
      out.push({ seq, key, from: path, to: null, dirs: [] });
      continue;
    }
    seen.add(path);
    const ids = idsOf(path);
    if (!same(ids, ev.dirs)) out.push({ seq, key, from: path, to: path, dirs: ids });
  }
  for (const f of snapshot.files) if (!seen.has(f.path)) out.push({ seq, key: nextKey++, from: null, to: f.path, dirs: idsOf(f.path) });
  return out;
}

const byKey = <T extends { key: number }>(a: T, b: T) => a.key - b.key;
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};
/** The first `cap`, and how many more there are. */
const capped = <T>(xs: T[], cap: number): [T[], number] => [xs.slice(0, cap), Math.max(0, xs.length - cap)];

export function layout(snapshot: SnapshotV02, history: StructureHistory, o: LayoutOptions = {}): LayoutV1 {
  return layoutReport(snapshot, history, o).layout;
}

/** layout(), plus what it placed on weaker evidence. */
export function layoutReport(snapshot: SnapshotV02, history: StructureHistory, o: LayoutOptions = {}): { layout: LayoutV1; notes: LayoutNotes } {
  const { roots } = history;
  const replay = new Replay(history, o.surfaceCells ?? SURFACE_CELLS);
  const closing = reconcile(snapshot, history.events, roots);
  for (const events of [history.events, closing]) {
    for (let i = 0; i < events.length;) {
      let j = i;
      while (j < events.length && events[j]!.seq === events[i]!.seq) j++;
      replay.step(events, i, j);
      i = j;
    }
  }
  const stateOf = new Map([...replay.files.values()].map((s) => [s.path, s]));
  // Open findings: null is unknown, never 0, so the band is then markers-only (qodoUnknown).
  const input = (f: FileEntry): HealthInput => ({ loc: f.loc, debt: f.debt, qodoOpen: f.qodo?.open ?? null });

  // Every file at HEAD lives on one planet (its surface or a moon) or around the star.
  const dirById = new Map(snapshot.dirs.map((d) => [d.id, d]));
  const dirByPath = new Map(snapshot.dirs.map((d) => [d.path, d]));
  const fileById = new Map(snapshot.files.map((f) => [f.id, f]));
  // A test orbits the planet holding its source; a test of a test, of test data or of a root file has none.
  const targetPlanet = (testOf: FileId | DirId): PlanetKey | null => {
    if (testOf.startsWith('f_')) {
      const t = fileById.get(testOf as FileId);
      return t ? stateOf.get(t.path)?.planet ?? null : null;
    }
    const d = dirById.get(testOf as DirId);
    const home = d ? folderHome(d.path, roots) : null;
    const top = home ? dirByPath.get(home.path) : undefined;
    const k = home && top ? planetKey(home.zone, top.id) : null;
    return k !== null && replay.planets.has(k) ? k : null;
  };
  const surfaceFiles = new Map<PlanetKey, FileEntry[]>();
  const moons = new Map<PlanetKey, { f: FileEntry; key: number }[]>();
  const moonlets: { f: FileEntry; key: number }[] = [];
  let testData = 0;
  for (const f of snapshot.files) {
    const s = stateOf.get(f.path)!;
    const moonOf = f.isTest && f.testOf !== null ? targetPlanet(f.testOf) : null;
    if (isTestData(f.path)) testData++;
    else if (s.planet !== null) push(surfaceFiles, s.planet, f);
    else if (moonOf !== null) push(moons, moonOf, { f, key: s.key });
    else moonlets.push({ f, key: s.key });
  }

  const planets: Planet[] = [...replay.planets].map(([k, p]): Planet => {
    const id = p.id;
    const files = surfaceFiles.get(k)!;
    const dir = dirById.get(id)!;
    const surface = replay.surfaces.get(k)!;
    const settlements: Settlement[] = [];
    const subs = new Set<DirId>();
    let overflow = 0;
    for (const f of files) {
      const s = stateOf.get(f.path)!;
      if (s.sub !== null) subs.add(s.sub);
      if (s.cell === null) overflow++;
      else settlements.push({ fileId: f.id, dirId: s.sub ?? id, cell: s.cell, loc: f.loc, size: settlementSize(f.loc), health: health([input(f)]) });
    }
    const loc = files.reduce((n, f) => n + f.loc, 0);
    const [shown, moonOverflow] = capped((moons.get(k) ?? []).sort(byKey), MOON_CAP);
    return {
      dirId: id,
      path: dir.path,
      zone: p.zone,
      bornSeq: dir.bornSeq,
      partner: p.partner,
      slot: orbitSlot(p.slot),
      radiusMilli: planetRadiusMilli(loc),
      loc,
      biomeSeed: u32(`biome:${id}`),
      health: health(files.map(input)),
      surface: {
        grid: { kind: 'fibonacci', cells: surface.cells },
        continents: [{ dirId: id, parent: null, seedCell: surface.seeds.get(id)! },
          ...[...subs].sort(byCodepoint).map((sub) => ({ dirId: sub, parent: id, seedCell: surface.seeds.get(sub)! }))],
        settlements: settlements.sort((a, b) => a.cell - b.cell),
        overflow,
      },
      moons: shown.map(({ f }, slot): Moon => ({ fileId: f.id, testOf: f.testOf!, slot })),
      moonOverflow,
    };
  }).sort((a, b) => a.slot.index - b.slot.index);

  const [shownMoonlets, moonletOverflow] = capped(moonlets.sort(byKey), MOONLET_CAP);
  const layout: LayoutV1 = {
    schemaVersion: 'layout.1',
    source: { repoId: snapshot.repo.repoId, head: snapshot.repo.head, roots: [...roots] },
    constants: { slotSpacingMilli: SLOT_SPACING_MILLI, maxPlanetRadiusMilli: MAX_PLANET_RADIUS_MILLI, moonCap: MOON_CAP },
    star: {
      repoId: snapshot.repo.repoId,
      moonlets: shownMoonlets.map(({ f }, slot): Moonlet => ({ fileId: f.id,
        // A file beside the star (in the repo root or directly inside a content root: no fileHome) is a
        // root file, unless it is a test with no target (#18 AC3, #71).
        kind: f.isTest && (f.testOf === null || fileHome(f.path, roots) !== null) ? 'unmatched-test' : 'root-file', slot })),
      moonletOverflow,
      testData,
    },
    planets,
  };
  return { layout, notes: { unsure: snapshot.files.filter((f) => stateOf.get(f.path)!.unsure).length, unmatched: closing.filter((e) => e.to !== null).length } };
}

const BANDS = ['lava', 'toxic', 'ash', 'healthy'] as const;

/** Human-readable layout summary for `commet scan`: repo-relative names and counts only. */
export function formatLayout(l: LayoutV1, notes: LayoutNotes): string {
  const pathOf = new Map(l.planets.map((p) => [p.dirId, p.path]));
  const bands = (hs: Health[]) => BANDS.map((b) => `${b} ${hs.filter((h) => h.band === b).length}`).join(' · ');
  const sum = (f: (p: Planet) => number) => l.planets.reduce((n, p) => n + f(p), 0);
  // With content roots (#71), each planet's zone is shown; without, the summary is #18's.
  const zoned = l.source.roots.length > 0;
  const content = l.planets.filter((p) => p.zone === 'content').length;
  const count = zoned ? `${l.planets.length} planet(s) (${content} content in ${l.source.roots.map(printable).join(', ')}, `
    + `${l.planets.length - content} outer)` : `${l.planets.length} planet(s)`;
  const lines = [`layout: ${count}, ${l.star.moonlets.length + l.star.moonletOverflow} moonlet(s) around the star, `
    + `${l.star.testData} test-data file(s) riding with the tests`];
  for (const p of l.planets.slice(0, LIST_LIMIT)) {
    const partner = p.partner === null ? '-' : printable(pathOf.get(p.partner) ?? p.partner);
    lines.push(`  slot ${String(p.slot.index).padStart(2)}  ${zoned ? `${p.zone.padEnd(7)} ` : ''}${printable(p.path).slice(0, 24).padEnd(24)} `
      + `partner ${partner.slice(0, 24).padEnd(24)} `
      + `${p.health.band.padEnd(7)} ${p.surface.settlements.length + p.surface.overflow} file(s), ${p.moons.length + p.moonOverflow} moon(s)`);
  }
  if (l.planets.length > LIST_LIMIT) lines.push(`  … and ${l.planets.length - LIST_LIMIT} more`);
  lines.push(`health: planets ${bands(l.planets.map((p) => p.health))}; `
    + `settlements ${bands(l.planets.flatMap((p) => p.surface.settlements.map((s) => s.health)))}`);
  if (l.planets.some((p) => p.health.qodoUnknown)) lines.push('health uses debt markers only where open Qodo findings are unknown');
  lines.push(`overflow (counted, not drawn): surface ${sum((p) => p.surface.overflow)}, moons ${sum((p) => p.moonOverflow)}, `
    + `moonlets ${l.star.moonletOverflow}`);
  if (notes.unsure) {
    lines.push(`${notes.unsure} file(s) began where git couldn't follow an older file (a copy, a move out of an excluded path, `
      + 'or a commit over the rename limit); they were placed as new');
  }
  if (notes.unmatched) lines.push(`${notes.unmatched} file(s) didn't match their history; they were placed or moved last`);
  return lines.join('\n') + '\n';
}
