// Reviewing from the view (#75, R5): the decisions behind the review panel, kept pure so they're
// tested without a DOM. Fog clears only when you chart what you were shown (AGENTS.md Rules 1, 6).
import type { DiffView } from '../../../src/core/contract/api.js';
import type { FogView } from '../../../src/core/contract/fog.js';

export const shortSha = (sha: string): string => sha.slice(0, 7);

/**
 * The first-run baseline (R5, approved 2026-11-04): offered while there is no chart state at all (no
 * baseline, no charted file) and something is fogged, unless dismissed this launch. Once a baseline
 * exists the panel shows it with its undo instead. Never repeated as a reminder (Rule 6).
 */
export function baselineState(fog: FogView, dismissed: boolean): 'offer' | 'set' | null {
  if (fog.baseline !== null) return 'set';
  if (dismissed) return null;
  const charted = fog.files.some((f) => f.state === 'charted');
  return !charted && fog.files.some((f) => f.state === 'fogged') ? 'offer' : null;
}

/**
 * Whether an open diff still matches the fog. `current`: same head and same unseen range. `newer`: a
 * scan landed, but the file's oldest unseen change is the same, so charting at the diff's own head
 * still covers exactly what it shows (#58). `stale`: the unseen range itself moved (a baseline undone,
 * a chart from the CLI) or the file is gone, so Chart waits for a reload: it could otherwise clear
 * changes the diff never showed (Rule 1).
 */
export function diffFreshness(view: DiffView, fog: FogView): 'current' | 'newer' | 'stale' {
  const f = fog.files.find((x) => x.fileId === view.fileId);
  if (!f) return 'stale';
  const since = f.state === 'fogged' ? f.since : null;
  if (since !== view.since) return 'stale';
  return fog.head === view.at ? 'current' : 'newer';
}

/** A path as one POSIX shell word: single-quoted, so nothing in it is ever run or expanded. */
export const shellWord = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** The command that shows the whole unseen diff in a terminal, for a cut-off one. Paths are literal, as the server's are (a file named `*.ts` is only itself). */
export function gitDiffCommand(view: DiffView): string | null {
  if (view.base === null) return null;
  const paths = [...new Set(view.sections.flatMap((s) => (s.oldPath ? [s.path, s.oldPath] : [s.path])))];
  return `git --literal-pathspecs diff -M ${view.base} ${view.at} -- ${paths.map(shellWord).join(' ')}`;
}

/** What the panel says about a diff beyond its lines: nothing to show, binary parts, a cut. */
export function diffNotes(view: DiffView): string[] {
  const notes: string[] = [];
  if (view.since !== null && view.sections.length === 0) {
    notes.push("git shows no text change for this file in the range. It's fogged because its history couldn't be followed for certain.");
  }
  for (const s of view.sections) {
    if (s.binary) notes.push(`${s.path} is binary: Commet can't show its change. Check it elsewhere before you chart it.`);
    else if (s.status === 'mode') notes.push(`${s.path}: only its mode changed.`);
  }
  if (view.truncated) notes.push(`This diff is too long to show in full: the first ${view.shownLines} lines are here. Chart covers the whole change, not only what's shown.`);
  return notes;
}

/** The kind of a hunk line, for its colour. */
export const lineKind = (line: string): 'add' | 'del' | 'ctx' | 'meta' =>
  line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : line.startsWith(' ') ? 'ctx' : 'meta';

/** One section's heading: what happened to which path. */
export function sectionTitle(s: DiffView['sections'][number]): string {
  if (s.status === 'renamed') return `renamed ${s.oldPath ?? '?'} → ${s.path}`;
  return `${s.status} ${s.path}`;
}

/** What the panel shows of a fog: head, baseline, each file's state, range and reasons, and the planets. Equal keys, nothing to redo. */
export const fogKey = (fog: FogView): string => [fog.head, fog.baseline ?? '',
  fog.files.map((f) => `${f.fileId}:${f.state}:${f.since ?? ''}:${f.reasons.join('+')}`).join(','),
  fog.planets.map((p) => `${p.dirId}:${p.fogged}/${p.total}`).join(','), `${fog.star.fogged}/${fog.star.total}`].join('|');
