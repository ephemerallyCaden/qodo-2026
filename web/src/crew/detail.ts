// A crew member's panel (#207 C5): what one teammate touched in the scan window, as the panel shows it. Pure:
// no DOM. AGENTS.md Rule 6's astronaut-panel exception (human, 2026-11-25): one person's own numbers, shown
// for that person only, a touch count beside each planet and file and never a total, a ranking or a
// comparison; files keep their folder-and-name order and planets their name order, never ordered by count.
import type { CrewDetail, CrewDetailFile, CrewDetailResult, CrewMember } from '../../../src/core/contract/crew.js';
import { byCodepoint } from '../../../src/core/canonical-json.js';
import { byFolderThenName } from '../../../src/core/drones.js';
import { ViewError } from '../data/client.js';
import { pathLabel, type FolderGroup } from '../drones/detail.js';
import { utc } from '../drones/select.js';
import { crewName } from './select.js';

/** What the panel's detail section shows. */
export type CrewDetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: CrewDetail }
  /** Nothing to list, and why (an old snapshot, a person no longer in the crew). */
  | { kind: 'note'; text: string }
  /** The request failed or was refused; the map and the rest of the panel stay. */
  | { kind: 'failed'; text: string };

export const CREW_LOADING: CrewDetailState = { kind: 'loading' };
export const RESCAN_NOTE = "rescan to see this crew member's planets and files";
/** What a touch is, said once under the lists. */
export const TOUCH_NOTE = 'a touch is one of their commits in the scan window that changed it';

export const touches = (n: number): string => `${n} ${n === 1 ? 'touch' : 'touches'}`;

/** The panel's rows as label and value: who, their role, when they were last active. Never a count (Rule 6). */
export function crewRows(m: CrewMember, detail: CrewDetail | null): [string, string][] {
  const rows: [string, string][] = [['name', crewName(m, 120)], ['role', m.captain ? 'captain: you' : 'teammate']];
  rows.push(['last active', detail?.lastActive ? utc(detail.lastActive) : detail?.needsRescan ? 'rescan to see' : '…']);
  return rows;
}

/** The planets they touched, by name (the star first), each with its touch count: never ordered by count. */
export function bodyRows(d: Pick<CrewDetail, 'planets'>, nameOf: (home: string) => string | null): { name: string; touches: string }[] {
  const rows = d.planets.map((p) => ({ star: p.home === 'star', name: p.home === 'star' ? 'the star (root files)' : nameOf(p.home) ?? 'a body not on this map', n: p.touches }));
  rows.sort((a, b) => Number(b.star) - Number(a.star) || byCodepoint(a.name, b.name));
  return rows.map((r) => ({ name: r.star ? r.name : pathLabel(r.name), touches: touches(r.n) }));
}

/** The files by folder: root files first ("top level"), then each folder by codepoint, its files by name. */
export function crewFileGroups(files: readonly CrewDetailFile[]): FolderGroup[] {
  const groups: (FolderGroup & { raw: string })[] = [];
  for (const f of [...files].sort((a, b) => byFolderThenName(a.path, b.path))) {
    const i = f.path.lastIndexOf('/');
    const raw = i < 0 ? '' : f.path.slice(0, i);
    const file = { name: pathLabel(f.path.slice(i + 1)), edits: touches(f.touches) };
    const last = groups.at(-1);
    if (last && last.raw === raw) last.files.push(file);
    else groups.push({ raw, folder: raw === '' ? 'top level' : pathLabel(`${raw}/`), files: [file] });
  }
  return groups.map(({ folder, files: list }) => ({ folder, files: list }));
}

/** The one line for the paths their commits changed that lead to no file at HEAD (Rule 1); null when there are none. */
export function otherCrewLine(d: Pick<CrewDetail, 'otherFiles'>): string | null {
  if (d.otherFiles === 0) return null;
  return `${d.otherFiles} other ${d.otherFiles === 1 ? 'path' : 'paths'} they changed ${d.otherFiles === 1 ? 'is' : 'are'} not at HEAD (deleted, or renamed where history can't follow)`;
}

/**
 * The one line said for an answer: whose panel it is, never the list or a count of it (no headline total,
 * Rule 6). Null for "loading".
 */
export function crewAnnouncement(state: CrewDetailState, m: CrewMember): string | null {
  if (state.kind === 'loading') return null;
  if (state.kind === 'failed') return `crew member's files unavailable: ${state.text}`;
  if (state.kind === 'note') return state.text;
  const d = state.detail;
  if (d.planets.length === 0 && d.files.length === 0 && d.otherFiles === 0) return `${crewName(m)} touched no files in the scan window`;
  return `showing what ${m.captain ? 'you' : crewName(m)} touched in the scan window`;
}

/** What a reply (or a failed request) shows for `person` at `head`. A reply for anything else is a failure, never shown. */
export function crewDetailState(got: CrewDetailResult | Error, person: string, head: string): CrewDetailState {
  if (got instanceof Error) return { kind: 'failed', text: got instanceof ViewError ? got.title : 'something went wrong' };
  if (!got.ok) {
    return got.error === 'unknown-head'
      ? { kind: 'failed', text: 'the repository was rescanned; the crew will follow the next update' }
      : { kind: 'note', text: 'no detail for this crew member' };
  }
  if (got.person !== person || got.head !== head) return { kind: 'failed', text: 'the answer was for another crew member or scan' };
  if (got.needsRescan) return { kind: 'note', text: RESCAN_NOTE };
  return { kind: 'ready', detail: got };
}
