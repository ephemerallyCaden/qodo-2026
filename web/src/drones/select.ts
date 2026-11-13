// Which drones the view draws, and what it says about the rest (#80 AC 5, 6, 8). Pure: no three.js, no DOM.
// A drone is only ever drawn for a session the server placed on a body this layout has (Rule 1: a
// session without a home is counted, never drawn or guessed), and the cap never hides the count.
import type { DroneSession, DroneView } from '../../../src/core/contract/drones.js';
import { byCodepoint } from '../../../src/core/canonical-json.js';
import type { FleetEntry } from '../render/drone-fleet.js';

/** The most drones drawn at once: the placed sessions that ended most recently (system design §10 draw budget). */
export const DRONE_CAP = 16;

export interface DroneSelection {
  /** The sessions drawn, most recently ended first. */
  shown: DroneSession[];
  /** Placed sessions the cap left out. */
  hidden: number;
  /** Sessions that could not be placed: no home, a home this layout lacks, or an old snapshot. */
  unplaced: number;
  total: number;
  needsRescan: boolean;
  cap: number;
}

/** `known(home)`: whether the drawn layout has that body (a planet's DirId, or 'star'). */
export function selectDrones(view: DroneView, known: (home: string) => boolean, cap: number = DRONE_CAP): DroneSelection {
  const placed = view.needsRescan ? [] : view.sessions.filter((s) => s.home !== null && known(s.home));
  const ordered = [...placed].sort((a, b) => byCodepoint(b.endedAt, a.endedAt) || byCodepoint(a.key, b.key));
  const shown = ordered.slice(0, Math.max(0, cap));
  return { shown, hidden: placed.length - shown.length, unplaced: view.sessions.length - placed.length, total: view.sessions.length, needsRescan: view.needsRescan, cap };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The HUD line: always the three counts, or the rescan hint (AC 5). */
export function droneStatus(s: DroneSelection): string {
  if (s.needsRescan) return `rescan to place drones (${plural(s.total, 'session', 'sessions')} not placed)`;
  return `${plural(s.shown.length, 'drone', 'drones')} shown, ${plural(s.hidden, 'placed session', 'placed sessions')} hidden by the cap of ${s.cap}, ${plural(s.unplaced, 'session', 'sessions')} could not be placed`;
}

/** Text from outside the view (a tool name, a branch): printable only, and short. */
export function plain(text: string, max = 60): string {
  const t = text.replace(/\p{Cc}/gu, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** A drone's label next to it: the generic drone names its tool, an inferred session says so (AC 6, 10). */
export function droneLabels(s: DroneSession): { label: string | null; selectedLabel: string } {
  const name = plain(s.tool, 24);
  const parts: string[] = [];
  if (s.tool !== 'claude-code') parts.push(name);
  if (s.inferred) parts.push('inferred');
  return { label: parts.length > 0 ? parts.join(' ') : null, selectedLabel: [name, ...(s.inferred ? ['inferred'] : [])].join(' ') };
}

/** What the scene draws for a placed session. */
export const entryOf = (s: DroneSession): FleetEntry => ({ key: s.key, seed: s.seed, tool: s.tool, home: s.home!, ...droneLabels(s) });

/** `2026-11-13T09:30:00.000Z` → `2026-11-13 09:30:00 UTC`. */
export const utc = (iso: string): string => iso.replace('T', ' ').replace(/\.\d+Z$|Z$/, '') + ' UTC';

/** The panel's rows as label and value (AC 8). Never a line, file or commit count (Rule 6). */
export function droneRows(s: DroneSession, homeName: string): [string, string][] {
  const rows: [string, string][] = [
    ['tool', plain(s.tool)],
    ['kind', s.kind === 'subagent' ? `subagent (${plain(s.agentType ?? 'unknown type')})` : 'main'],
    ['started', utc(s.startedAt)],
    ['ended', utc(s.endedAt)],
    ['branch', s.branch === null ? 'unknown' : plain(s.branch)],
    ['model', s.model === null ? 'unknown' : plain(s.model)],
  ];
  if (s.inferred) rows.push(['source', 'inferred']);
  rows.push(['home', plain(homeName, 120)]);
  return rows;
}
