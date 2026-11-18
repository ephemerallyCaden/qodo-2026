// The drone panel's session detail (#148): what one agent session edited and when, as the panel shows it.
// Pure: no DOM. AGENTS.md Rule 6's session-detail exception: these are one session's own numbers, shown
// for that session only; files keep their folder-and-name order and are never ordered by count.
import { byFolderThenName } from '../../../src/core/drones.js';
import type { DroneDetail, DroneDetailFile, DroneDetailResult } from '../../../src/core/contract/drones.js';
import { ViewError } from '../data/client.js';
import { plain, utc } from './select.js';

/** What the panel's detail section shows. */
export type DetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: DroneDetail }
  /** Nothing to list, and why (an inferred session, an old snapshot, an unknown session). */
  | { kind: 'note'; text: string }
  /** The request failed or was refused; the map and the rest of the panel stay. */
  | { kind: 'failed'; text: string };

export const LOADING: DetailState = { kind: 'loading' };
/** Rule 6: a pseudo-session's numbers would be a person's own commits, counted. */
export const INFERRED_NOTE = 'file detail is for agent sessions only';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const edits = (n: number): string => count(n, 'edit', 'edits');

/** Paths are shown whole (the validator bounds them), so two long ones never look alike (Qodo a9080e71). */
const WHOLE = Number.MAX_SAFE_INTEGER;

export interface FolderGroup { folder: string; files: { name: string; edits: string }[] }

/** The files by folder: root files first ("top level"), then each folder by codepoint, its files by name. */
export function detailGroups(files: readonly DroneDetailFile[]): FolderGroup[] {
  const groups: (FolderGroup & { raw: string })[] = [];
  for (const f of [...files].sort((a, b) => byFolderThenName(a.path, b.path))) {
    const i = f.path.lastIndexOf('/');
    const raw = i < 0 ? '' : f.path.slice(0, i);
    const file = { name: plain(f.path.slice(i + 1), WHOLE), edits: edits(f.edits) };
    // Grouped by the folder itself, not by its label.
    const last = groups.at(-1);
    if (last && last.raw === raw) last.files.push(file);
    else groups.push({ raw, folder: raw === '' ? 'top level' : plain(`${raw}/`, WHOLE), files: [file] });
  }
  return groups.map(({ folder, files: list }) => ({ folder, files: list }));
}

/** The one line for the edited paths with no file at HEAD, naming everything they can be (Rule 1); null when there are none. */
export function otherLine(d: Pick<DroneDetail, 'otherFiles' | 'otherEdits'>): string | null {
  if (d.otherFiles === 0) return null;
  return `${count(d.otherFiles, 'other file', 'other files')} not at HEAD (deleted, renamed, excluded, on another branch or in a removed worktree): ${edits(d.otherEdits)}`;
}

/** Each slice's height in whole cells of `rows`, scaled to the busiest slice; a slice with any edit gets at least one cell. */
export function timelineCells(buckets: readonly number[], rows: number): number[] {
  const max = Math.max(0, ...buckets);
  return buckets.map((n) => (n <= 0 || max === 0 ? 0 : Math.max(1, Math.ceil((n * rows) / max))));
}

/** A duration as h:mm:ss, floored to the second. */
function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/**
 * The timeline in words, for screen readers and as its caption: the total, the span, and how many edits
 * fell in each slice that has any, by its offset from the start, so it says what the graph shows
 * (Qodo PR #167 4dfd03c0). Slice edges are to the second.
 */
export function timelineText(d: Pick<DroneDetail, 'buckets' | 'startedAt' | 'endedAt'>): string {
  const total = d.buckets.reduce((a, b) => a + b, 0);
  const start = utc(d.startedAt);
  if (total === 0) return `no edits from ${start} to ${utc(d.endedAt)}`;
  const span = Date.parse(d.endedAt) - Date.parse(d.startedAt);
  if (!(span > 0)) return total === 1 ? `1 edit, at ${start}` : `${edits(total)}, all at ${start}`;
  const n = d.buckets.length;
  const edge = (i: number) => Math.floor((i * span) / n);
  const slices = d.buckets.flatMap((b, i) => (b > 0 ? [`${b} in ${clock(edge(i))}–${clock(edge(i + 1))}`] : []));
  return `${edits(total)} from ${start} to ${utc(d.endedAt)}, in ${n} slices of ${clock(span / n)}: ${slices.join(', ')} after the start`;
}

/** What a reply (or a failed request) shows for the session `key` at `head`. A reply for anything else is a failure, never shown. */
export function detailState(got: DroneDetailResult | Error, key: string, head: string): DetailState {
  if (got instanceof Error) return { kind: 'failed', text: got instanceof ViewError ? got.title : 'something went wrong' };
  if (!got.ok) {
    return got.error === 'unknown-head'
      ? { kind: 'failed', text: 'the repository was rescanned; the drones will follow the next update' }
      : { kind: 'note', text: 'no file detail for this session' };
  }
  if (got.key !== key || got.head !== head) return { kind: 'failed', text: 'the answer was for another session or scan' };
  if (got.needsRescan) return { kind: 'note', text: "rescan to see this session's files" };
  return { kind: 'ready', detail: got };
}
