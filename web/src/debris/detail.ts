// A piece of debris's panel (R13): what the stale item is, as the panel shows it. Pure: no DOM. Its name, class,
// age, last commit and who created it (this one item's creator, never listed, grouped or counted across items:
// Rule 6), the bodies it touches, its worktree, and the server's commands for the user to copy. Commet never runs
// them; the panel says so.
import { debrisAgeStep, type DebrisDetail, type DebrisDetailResult } from '../../../src/core/contract/debris.js';
import { ViewError } from '../data/client.js';
import { plain, utc } from '../drones/select.js';
import { CLASS_LABEL } from '../render/debris-kits.js';
import { AGE_LABEL } from './place.js';

/** What the panel's detail section shows. */
export type DebrisDetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: DebrisDetail }
  /** Nothing to show, and why (a piece the scan no longer has). */
  | { kind: 'note'; text: string }
  /** The request failed or was refused; the map and the rest of the panel stay. */
  | { kind: 'failed'; text: string };

export const DEBRIS_LOADING: DebrisDetailState = { kind: 'loading' };
/** Said once under the commands: they're for the user to run, never run by Commet. */
export const COPY_NOTE = 'copy it and run it in a terminal yourself: Commet never runs a command';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The branch's name as the panel shows it: printable, bounded; a detached worktree has none. */
export const debrisName = (d: Pick<DebrisDetail, 'name'>, max = 80): string => (d.name === null ? 'a detached worktree' : plain(d.name, max) || 'unnamed');

/** The panel's rows as label and value. */
export function debrisRows(d: DebrisDetail, nameOf: (home: string) => string | null): [string, string][] {
  const rows: [string, string][] = [['branch', debrisName(d) + (d.remoteOnly ? ' (only on the remote)' : '')], ['kind', CLASS_LABEL[d.cls]]];
  rows.push(['age', `${count(d.ageDays, 'day', 'days')} since its last commit, as of HEAD (${AGE_LABEL[debrisAgeStep(d.ageDays)]})`]);
  rows.push(['last commit', `${d.lastCommit.short} ${plain(d.lastCommit.subject, 120)}`], ['committed', utc(d.lastCommit.date)]);
  const who = plain(d.creator.displayName, 60) || 'unnamed';
  rows.push(['created by', d.creator.captain ? `you (${who})` : d.creator.agent ? `${who}, an agent` : who]);
  for (const s of d.sessions.slice(0, 3)) rows.push(['agent session', `${s.model === null ? 'model unknown' : plain(s.model, 40)}, ${utc(s.startedAt)} to ${utc(s.endedAt)}`]);
  if (d.sessions.length > 3) rows.push(['agent session', `and ${count(d.sessions.length - 3, 'more', 'more')}`]);
  rows.push(['HEAD lacks', d.cls === 'merged' ? (d.rebased ? 'nothing: rebased, then merged' : 'nothing: it is merged') : `${count(d.aheadCount, 'commit', 'commits')}, ${count(d.lines, 'changed line', 'changed lines')}`]);
  const bodies = d.planets.map((h) => (h === 'star' ? 'the star (root files)' : nameOf(h) ?? 'a body not on this map'));
  if (bodies.length > 0) rows.push(['touches', bodies.join(', ')]);
  if (d.filesOutside > 0) rows.push(['also', `${count(d.filesOutside, 'path', 'paths')} not at HEAD`]);
  if (d.worktree) rows.push(['worktree', d.worktree.prunable ? 'checked out in a worktree whose folder is gone' : `checked out in a worktree${d.worktree.locked ? ' (locked)' : ''}`]);
  return rows;
}

/** The commands to copy, in the order the panel shows them: the cleanup, then the inspect. Either may be missing. */
export function debrisCommands(d: Pick<DebrisDetail, 'cleanup' | 'inspect'>): { label: string; command: string }[] {
  const out: { label: string; command: string }[] = [];
  if (d.cleanup !== null) out.push({ label: 'clean up', command: d.cleanup });
  if (d.inspect !== null) out.push({ label: 'inspect first', command: d.inspect });
  return out;
}

/** The one line said for an answer: whose panel it is. Null for "loading". */
export function debrisAnnouncement(state: DebrisDetailState): string | null {
  if (state.kind === 'loading') return null;
  if (state.kind === 'failed') return `debris detail unavailable: ${state.text}`;
  if (state.kind === 'note') return state.text;
  const d = state.detail;
  return `showing ${CLASS_LABEL[d.cls]} ${debrisName(d, 60)}${d.cleanup === null ? ', with no cleanup command' : ''}`;
}

/** What a reply (or a failed request) shows for piece `id` at `head`. A reply for anything else is a failure, never shown. */
export function debrisDetailState(got: DebrisDetailResult | Error, id: string, head: string): DebrisDetailState {
  if (got instanceof Error) return { kind: 'failed', text: got instanceof ViewError ? got.title : 'something went wrong' };
  if (!got.ok) {
    return got.error === 'unknown-head'
      ? { kind: 'failed', text: 'the repository was rescanned; the debris will follow the next update' }
      : { kind: 'note', text: 'the scan has no such piece any more' };
  }
  if (got.id !== id || got.head !== head) return { kind: 'failed', text: 'the answer was for another piece or scan' };
  return { kind: 'ready', detail: got };
}
