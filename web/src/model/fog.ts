// Fog of war's state (R5, #74): which drawn files are fogged, the clear and refog events between two
// fog views, the planet-clear pulse, and the per-cell rows the fog shader reads. Pure: no three.js,
// no DOM, no clock. Events are stamped with the loop frame they were seen at, so a frame is still a
// pure function of (layout, fog, events, camera, frame) (principle 3). Ported from the fog lab's
// stateAt() and cellData() (feature/fog-lab 69be694, mockups/asset-viewer/fog-layout.js).
//
// Two rules hold everywhere downstream:
// - three levels (#201): fogged (cloud), haze (read, not yet tested: shown as "misted", under
//   mist, #224) and clear (understood: nothing over it), one number per file (Level);
// - without evidence a file is fogged (AGENTS.md Rule 1): a file the fog view doesn't list, a state
//   it doesn't know, or every file when there is no usable fog view.
import type { FogLevel, FogView } from '../../../src/core/contract/fog.js';
import { FPS } from './motion.js';
import { centresOf, searchWindow, territories, type Territory } from './territory.js';

/** A file's fog level as the shader reads it: 0 clear, 1 haze, 2 fogged. More is more fog. */
export type Level = 0 | 1 | 2;
export const LEVEL: Readonly<Record<FogLevel, Level>> = { clear: 0, haze: 1, fogged: 2 };

/** Event lengths in seconds (fog lab EVENT): one-shot, on the frame clock, outside the loop like the debris sweep. */
export const FOG_EVENT_SECONDS = { clear: 1.0, refog: 2.4, pulse: 0.9 } as const;
/** The same in loop frames. */
export const FOG_EVENT_FRAMES = {
  clear: Math.round(FOG_EVENT_SECONDS.clear * FPS),
  refog: Math.round(FOG_EVENT_SECONDS.refog * FPS),
  pulse: Math.round(FOG_EVENT_SECONDS.pulse * FPS),
} as const;

/**
 * Each file's level under a fog view (null: none usable, so every file is fogged). A file the view
 * doesn't list, or a state it doesn't know, is fogged too (Rule 1).
 */
export function levelBy(fog: FogView | null): (fileId: string) => Level {
  if (!fog) return () => 2;
  const level = new Map<string, Level | undefined>(fog.files.map((f) => [f.fileId, LEVEL[f.state]]));
  return (fileId) => level.get(fileId) ?? 2;
}

export type FogEventKind = 'clear' | 'refog';
/**
 * A file's fog thinning (`clear`: charted, fogged → haze, or a quiz passed, → clear) or thickening
 * (`refog`: a change, clear → haze or → fogged), from level `from`, from loop frame `start`.
 */
export interface FogEvent { fileId: string; kind: FogEventKind; from: Level; start: number }
export const eventEnd = (e: FogEvent): number => e.start + FOG_EVENT_FRAMES[e.kind];
/** When an event stops mattering: a clear's front, then the pulse it may end in. */
export const eventLife = (e: FogEvent): number => eventEnd(e) + (e.kind === 'clear' ? FOG_EVENT_FRAMES.pulse : 0);

/**
 * The events between two fog views, for the files drawn (`fileIds`), starting at `frame`: a file
 * whose level fell clears, one whose level rose refogs. Only between two real views: no review
 * happened between "unknown" and a view, so that change snaps.
 */
export function fogChanges(prev: FogView | null, next: FogView | null, fileIds: Iterable<string>, frame: number): FogEvent[] {
  if (!prev || !next) return [];
  const was = levelBy(prev), is = levelBy(next);
  const out: FogEvent[] = [];
  for (const fileId of fileIds) {
    const from = was(fileId), to = is(fileId);
    if (to < from) out.push({ fileId, kind: 'clear', from, start: frame });
    else if (to > from) out.push({ fileId, kind: 'refog', from, start: frame });
  }
  return out;
}

/** `events` with `added` in: a file's newer event replaces its older one, and events over by `frame` (eventLife) drop out. Sorted by fileId. */
export function mergeEvents(events: readonly FogEvent[], added: readonly FogEvent[], frame: number): FogEvent[] {
  const byFile = new Map<string, FogEvent>();
  for (const e of [...events, ...added]) byFile.set(e.fileId, e);
  return [...byFile.values()].filter((e) => eventLife(e) > frame).sort((a, b) => (a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0));
}

/**
 * One file at a frame: its level at rest (the current view's answer), and the event drawn over it, if
 * any: its kind (1 clear, 2 refog), progress and the level it started from (`from`, the rest level
 * when there is none).
 */
export interface FileFogAt { level: Level; from: Level; kind: 0 | 1 | 2; progress: number }
export function fileFogAt(level: Level, event: FogEvent | undefined, frame: number): FileFogAt {
  if (!event || frame >= eventEnd(event)) return { level, from: level, kind: 0, progress: 0 };
  const progress = Math.max(0, (frame - event.start) / FOG_EVENT_FRAMES[event.kind]);
  return { level, from: event.from, kind: event.kind === 'clear' ? 1 : 2, progress };
}

/** A stable 0..1 value per key (FNV-1a, then a finaliser), for seeded per-cell choices (model/fog-cloud.ts). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A planet's surface, ready for the fog: its files in surface order, their territories and the shader's search window. */
export interface SurfacePlan {
  fileIds: string[];
  territory: Territory;
  window: number;
}

export function surfacePlan(surface: { cells: number; settlements: readonly { fileId: string; cell: number }[] }): SurfacePlan {
  const n = surface.cells;
  return { fileIds: surface.settlements.map((s) => s.fileId), territory: territories(surface.settlements.map((s) => s.cell), n), window: searchWindow(n) };
}

/**
 * The level every cell no file owns is drawn at: the planet's foggiest file's, which is fogged for
 * every file under no usable fog view (Rule 1: unknown never looks clearer). Only a planet whose every
 * settlement is off its grid has such cells.
 */
export const orphanLevel = (at: readonly FileFogAt[]): Level => at.reduce<Level>((m, f) => (f.level > m ? f.level : m), 0);

/** Rows of the fog shader's cell texture: 0 rest state, 1 event, 2 cell centre. */
export const FOG_TEX_ROWS = 3;

/**
 * The per-cell data the fog shaders read (cells × FOG_TEX_ROWS RGBA texels, row-major): what the haze
 * shell and the lava smoke need to keep off fogged ground (fog-glsl.ts FOG_HAZE).
 * row 0 (level at rest 0 clear / 1 haze / 2 fogged, owner's anchor cell, owner's reach in rad, 0),
 * row 1 (event kind 0 none / 1 clear / 2 refog, progress 0..1, the level the event started from, 0),
 * row 2 (cell centre x, y, z, 1 if a file owns the cell).
 */
export function cellRows(plan: SurfacePlan, at: readonly FileFogAt[], out?: Float32Array): Float32Array {
  const { territory: t } = plan, n = t.cells;
  const rows = out ?? new Float32Array(n * FOG_TEX_ROWS * 4);
  const c = centresOf(n);
  const orphan = orphanLevel(at);
  for (let i = 0; i < n; i++) {
    const k = t.owner[i]!;
    const f = k >= 0 ? at[k]! : null;
    rows.set([f ? f.level : orphan, k >= 0 ? t.anchor[k]! : i, k >= 0 ? t.reach[k]! : 0, 0], i * 4);
    rows.set([f ? f.kind : 0, f ? f.progress : 0, f ? f.from : orphan, 0], (n + i) * 4);
    rows.set([c[3 * i]!, c[3 * i + 1]!, c[3 * i + 2]!, k >= 0 ? 1 : 0], (2 * n + i) * 4);
  }
  return rows;
}

/** The planet-clear pulse (F5, the landing moment): from a parcel's anchor cell, progress 0..1. */
export interface Pulse { cell: number; progress: number }

/**
 * When the last of a planet's fogged files is charted, a pulse runs over the whole planet from the
 * last parcel charted, once that file's front is done. Only when the fog view says the planet has no
 * fogged file left (`foggedLeft === 0`), counting unplaced files and moons, so a planet with fog
 * nobody can see never claims to be charted (Rule 1). A quiz clearing a hazed file (#201) isn't a
 * chart of a fogged one, so it runs no pulse.
 */
export function planetPulse(plan: SurfacePlan, events: ReadonlyMap<string, FogEvent>, moonIds: readonly string[], foggedLeft: number | null, frame: number): Pulse | null {
  if (foggedLeft !== 0) return null;
  let end = -Infinity, cell = -1, cellEnd = -Infinity;
  for (const id of [...plan.fileIds, ...moonIds]) {
    const e = events.get(id);
    if (e?.kind !== 'clear' || e.from !== LEVEL.fogged) continue;
    end = Math.max(end, eventEnd(e));
    const k = plan.fileIds.indexOf(id);
    if (k >= 0 && plan.territory.anchor[k]! >= 0 && eventEnd(e) >= cellEnd) { cellEnd = eventEnd(e); cell = plan.territory.anchor[k]!; }
  }
  if (cell < 0 || frame < end || frame >= end + FOG_EVENT_FRAMES.pulse) return null;
  return { cell, progress: (frame - end) / FOG_EVENT_FRAMES.pulse };
}

/** A planet's (or the star's) fog counts by level from the view, or null when there is no usable view or no entry. */
export interface FogTally { fogged: number; haze: number; clear: number; total: number }
const tallyOf = (c: FogTally): FogTally => ({ fogged: c.fogged, haze: c.haze, clear: c.clear, total: c.total });
export function planetTally(fog: FogView | null, dirId: string): FogTally | null {
  const p = fog?.planets.find((x) => x.dirId === dirId);
  return p ? tallyOf(p) : null;
}
/** The whole repo's counts: every planet plus the star (root files, unmatched tests, test data). */
export function systemTally(fog: FogView | null): FogTally | null {
  if (!fog) return null;
  return [...fog.planets, fog.star].reduce((a, p) => ({ fogged: a.fogged + p.fogged, haze: a.haze + p.haze, clear: a.clear + p.clear, total: a.total + p.total }),
    { fogged: 0, haze: 0, clear: 0, total: 0 });
}

/**
 * The view's fog bookkeeping (#74), kept apart from three.js so it can be tested: which fog is drawn,
 * the fronts in progress, and the tickets that keep an older answer from landing over a newer one
 * (Qodo #75 local r1 #3). View wraps it (view.ts fogTicket, applyFog, load).
 */
export class FogLedger {
  private tickets = 0;
  private applied = 0;
  private layoutHead: string | null = null;
  /** The fog drawn: null when there is no usable view, so every file is drawn fogged (Rule 1). */
  fog: FogView | null = null;
  /** Fronts in progress, by file, stamped with the frame they started at. */
  events: FogEvent[] = [];
  /** Whether the last fog given was dropped for coming from another scan than the layout. */
  mismatch = false;
  /** The fog a new layout dropped, until the next fog is applied: what that fog's changes are measured against (a refog that arrives with a scan still rolls in). */
  private prior: FogView | null = null;
  /** What the last applied fog changed for the files drawn, fronts or not. */
  change = { cleared: 0, refogged: 0 };

  /** A ticket for a request whose answer carries a fog view; take it before sending. */
  ticket(): number { return ++this.tickets; }

  /**
   * Applies the answer to `ticket`, for the files drawn, seen at `frame`. Returns false, changing
   * nothing, when an answer to a later ticket was already applied. A fog from another scan than the
   * layout (one landed between the two fetches) isn't evidence for these files, so it is drawn as
   * no view until the next update refetches (#64). With `animate` false the change snaps.
   */
  apply(fog: FogView | null, ticket: number, fileIds: Iterable<string>, frame: number, animate: boolean): boolean {
    if (ticket <= this.applied) return false;
    this.applied = ticket;
    this.mismatch = fog !== null && fog.head !== this.layoutHead;
    const usable = this.mismatch ? null : fog;
    const changes = fogChanges(this.fog ?? this.prior, usable, fileIds, frame);
    this.prior = null;
    this.change = { cleared: changes.filter((e) => e.kind === 'clear').length, refogged: changes.filter((e) => e.kind === 'refog').length };
    this.events = mergeEvents(this.events, animate ? changes : [], frame);
    this.fog = usable;
    return true;
  }

  /**
   * A new layout is drawn. A fog drawn from another scan is dropped (true: the drawn fog changed to
   * none); `animate` false drops the fronts too.
   */
  setLayout(head: string, animate: boolean): boolean {
    this.layoutHead = head;
    if (!animate) this.events = [];
    if (!this.fog || this.fog.head === head) return false;
    this.prior = this.fog;
    this.fog = null;
    this.mismatch = true;
    this.events = [];
    this.change = { cleared: 0, refogged: 0 }; // the earlier change was of the fog just dropped: never announce it again
    return true;
  }

  /** Drops the fronts over by `frame`; true when any did. */
  prune(frame: number): boolean {
    const live = this.events.filter((e) => eventLife(e) > frame);
    if (live.length === this.events.length) return false;
    this.events = live;
    return true;
  }

  /** Ends every front now (reduced motion turned on); true when any was running. */
  settle(): boolean {
    if (this.events.length === 0) return false;
    this.events = [];
    return true;
  }
}
