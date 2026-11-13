// Fog of war's state (R5, #74): which drawn files are fogged, the clear and refog events between two
// fog views, the planet-clear pulse, and the per-cell rows the fog shader reads. Pure: no three.js,
// no DOM, no clock. Events are stamped with the loop frame they were seen at, so a frame is still a
// pure function of (layout, fog, events, camera, frame) (principle 3). Ported from the fog lab's
// stateAt() and cellData() (feature/fog-lab 69be694, mockups/asset-viewer/fog-layout.js).
//
// Two rules hold everywhere downstream:
// - clear and charted are one state, "not fogged": the shader gets one bit per file, so the two can
//   never look different (contract: the renderer draws them the same);
// - without evidence a file is fogged (AGENTS.md Rule 1): a file the fog view doesn't list, or every
//   file when there is no usable fog view.
import type { FileFog, FogView } from '../../../src/core/contract/fog.js';
import { FPS } from './motion.js';
import { centresOf, searchWindow, territories, type Territory } from './territory.js';

/** Event lengths in seconds (fog lab EVENT): one-shot, on the frame clock, outside the 24 s loop like the debris sweep. */
export const FOG_EVENT_SECONDS = { clear: 1.0, refog: 2.4, pulse: 0.9 } as const;
/** The same in loop frames. */
export const FOG_EVENT_FRAMES = {
  clear: Math.round(FOG_EVENT_SECONDS.clear * FPS),
  refog: Math.round(FOG_EVENT_SECONDS.refog * FPS),
  pulse: Math.round(FOG_EVENT_SECONDS.pulse * FPS),
} as const;

/** Whether a file is drawn fogged, under a fog view (null: none usable, so every file is). */
export function foggedBy(fog: FogView | null): (fileId: string) => boolean {
  if (!fog) return () => true;
  const state = new Map<string, FileFog['state']>(fog.files.map((f) => [f.fileId, f.state]));
  return (fileId) => { const s = state.get(fileId); return s === undefined || s === 'fogged'; };
}

export type FogEventKind = 'clear' | 'refog';
/** A file clearing (charted) or refogging, from loop frame `start`. */
export interface FogEvent { fileId: string; kind: FogEventKind; start: number }
export const eventEnd = (e: FogEvent): number => e.start + FOG_EVENT_FRAMES[e.kind];
/** When an event stops mattering: a clear's front, then the pulse it may end in. */
export const eventLife = (e: FogEvent): number => eventEnd(e) + (e.kind === 'clear' ? FOG_EVENT_FRAMES.pulse : 0);

/**
 * The events between two fog views, for the files drawn (`fileIds`), starting at `frame`: a file
 * that was fogged and isn't clears, one that wasn't and is refogs. Only between two real views: no
 * review happened between "unknown" and a view, so that change snaps.
 */
export function fogChanges(prev: FogView | null, next: FogView | null, fileIds: Iterable<string>, frame: number): FogEvent[] {
  if (!prev || !next) return [];
  const was = foggedBy(prev), is = foggedBy(next);
  const out: FogEvent[] = [];
  for (const fileId of fileIds) {
    if (was(fileId) && !is(fileId)) out.push({ fileId, kind: 'clear', start: frame });
    else if (!was(fileId) && is(fileId)) out.push({ fileId, kind: 'refog', start: frame });
  }
  return out;
}

/** `events` with `added` in: a file's newer event replaces its older one, and events over by `frame` (eventLife) drop out. Sorted by fileId. */
export function mergeEvents(events: readonly FogEvent[], added: readonly FogEvent[], frame: number): FogEvent[] {
  const byFile = new Map<string, FogEvent>();
  for (const e of [...events, ...added]) byFile.set(e.fileId, e);
  return [...byFile.values()].filter((e) => eventLife(e) > frame).sort((a, b) => (a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0));
}

/** One file at a frame: fogged at rest (the current view's answer), and the event drawn over it, if any. */
export interface FileFogAt { fogged: boolean; kind: 0 | 1 | 2; progress: number }
export function fileFogAt(fogged: boolean, event: FogEvent | undefined, frame: number): FileFogAt {
  if (!event || frame >= eventEnd(event)) return { fogged, kind: 0, progress: 0 };
  const progress = Math.max(0, (frame - event.start) / FOG_EVENT_FRAMES[event.kind]);
  return { fogged, kind: event.kind === 'clear' ? 1 : 2, progress };
}

/** A stable 0..1 value per key (FNV-1a, then a finaliser), for decorative per-parcel choices. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A "?" sits on half the parcels covering at least this share of the grid (the lab's 7 of 256 cells). */
export const QMARK_SHARE = 7 / 256;
/** Per-parcel flag bits (row 0, w). */
export const FLAG = { backslash: 1, qmark: 2 } as const;

/** A planet's surface, ready for the fog: its territories, the shader's search window, each parcel's decoration. */
export interface SurfacePlan {
  fileIds: string[];
  territory: Territory;
  window: number;
  /** Per file: FLAG bits. */
  flags: Int32Array;
  /** Per file: the hatch's dash phase, 0..1. */
  dash: Float32Array;
}

export function surfacePlan(surface: { cells: number; settlements: readonly { fileId: string; cell: number }[] }): SurfacePlan {
  const n = surface.cells;
  const fileIds = surface.settlements.map((s) => s.fileId);
  const territory = territories(surface.settlements.map((s) => s.cell), n);
  const flags = new Int32Array(fileIds.length), dash = new Float32Array(fileIds.length);
  fileIds.forEach((id, k) => {
    flags[k] = (hash01(`${id}:hatch`) > 0.5 ? FLAG.backslash : 0)
      | (territory.size[k]! >= QMARK_SHARE * n && hash01(`${id}:qmark`) > 0.5 ? FLAG.qmark : 0);
    dash[k] = hash01(`${id}:dash`);
  });
  return { fileIds, territory, window: searchWindow(n), flags, dash };
}

/** Rows of the fog shader's cell texture: 0 rest state, 1 event, 2 cell centre. */
export const FOG_TEX_ROWS = 3;

/**
 * The per-cell data the fog shader reads (cells × FOG_TEX_ROWS RGBA texels, row-major):
 * row 0 (fogged at rest 0/1, owner's anchor cell, owner's reach in rad, owner's FLAG bits),
 * row 1 (event kind 0 none / 1 clear / 2 refog, progress 0..1, owner's size in cells, owner's dash phase),
 * row 2 (cell centre x, y, z, 1 if a file owns the cell).
 * The anchor cell doubles as the owner's key: two cells belong to one file exactly when their anchors match.
 */
export function cellRows(plan: SurfacePlan, at: readonly FileFogAt[], out?: Float32Array): Float32Array {
  const { territory: t } = plan, n = t.cells;
  const rows = out ?? new Float32Array(n * FOG_TEX_ROWS * 4);
  const c = centresOf(n);
  // A cell no file owns (every settlement off the grid) is drawn fogged when any file of the planet is, which
  // includes every file under no usable fog view (Rule 1: unknown never looks clear).
  const orphanFogged = at.some((f) => f.fogged);
  for (let i = 0; i < n; i++) {
    const k = t.owner[i]!;
    const f = k >= 0 ? at[k]! : null;
    rows.set([(f ? f.fogged : orphanFogged) ? 1 : 0, k >= 0 ? t.anchor[k]! : i, k >= 0 ? t.reach[k]! : 0, k >= 0 ? plan.flags[k]! : 0], i * 4);
    rows.set([f ? f.kind : 0, f ? f.progress : 0, k >= 0 ? t.size[k]! : 0, k >= 0 ? plan.dash[k]! : 0], (n + i) * 4);
    rows.set([c[3 * i]!, c[3 * i + 1]!, c[3 * i + 2]!, k >= 0 ? 1 : 0], (2 * n + i) * 4);
  }
  return rows;
}

/** The planet-clear pulse (F5, the landing moment): from a parcel's anchor cell, progress 0..1. */
export interface Pulse { cell: number; progress: number }

/**
 * When the last of a planet's fogged files clears, a pulse runs over the whole planet from the last
 * parcel charted, once that file's front is done. Only when the fog view says the planet has no
 * fogged file left (`foggedLeft === 0`), counting unplaced files and moons, so a planet with fog
 * nobody can see never claims to be clear (Rule 1).
 */
export function planetPulse(plan: SurfacePlan, events: ReadonlyMap<string, FogEvent>, moonIds: readonly string[], foggedLeft: number | null, frame: number): Pulse | null {
  if (foggedLeft !== 0) return null;
  let end = -Infinity, cell = -1, cellEnd = -Infinity;
  for (const id of [...plan.fileIds, ...moonIds]) {
    const e = events.get(id);
    if (e?.kind !== 'clear') continue;
    end = Math.max(end, eventEnd(e));
    const k = plan.fileIds.indexOf(id);
    if (k >= 0 && plan.territory.anchor[k]! >= 0 && eventEnd(e) >= cellEnd) { cellEnd = eventEnd(e); cell = plan.territory.anchor[k]!; }
  }
  if (cell < 0 || frame < end || frame >= end + FOG_EVENT_FRAMES.pulse) return null;
  return { cell, progress: (frame - end) / FOG_EVENT_FRAMES.pulse };
}

/** A planet's (or the star's) fog counts from the view, or null when there is no usable view or no entry. */
export interface FogTally { fogged: number; total: number }
export function planetTally(fog: FogView | null, dirId: string): FogTally | null {
  const p = fog?.planets.find((x) => x.dirId === dirId);
  return p ? { fogged: p.fogged, total: p.total } : null;
}
/** The whole repo's counts: every planet plus the star (root files, unmatched tests, test data). */
export function systemTally(fog: FogView | null): FogTally | null {
  if (!fog) return null;
  return [...fog.planets, fog.star].reduce((a, p) => ({ fogged: a.fogged + p.fogged, total: a.total + p.total }), { fogged: 0, total: 0 });
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
