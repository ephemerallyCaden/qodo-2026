import { byCodepoint } from './canonical-json.js';
import type { CommitClass, SnapshotV02 } from './snapshot/types.js';
import { DEBT_KEYS, zeroDebt } from './structure.js';

const CLASSES: CommitClass[] = ['agent', 'mixed', 'human', 'unknown'];
const LIST_LIMIT = 20;
const day = (iso: string) => iso.slice(0, 10);
// Subjects come from the repo; strip control characters so they can't drive the terminal.
const printable = (t: string) => t.replace(/\p{Cc}/gu, '?');

/** Aggregate log-reading counts: skipped transcripts, dropped records, unattributed transcripts. */
export interface LogCounts { tooLarge: number; unavailable: number; dropped: number; unattributed: number }

/** Human-readable scan summary. Contains repo-relative data only: no absolute paths or code. */
/** `logs` holds aggregate log-reading counts, or null when logs weren't read (--no-ingest). */
export function formatSummary(s: SnapshotV02, logs: LogCounts | null): string {
  const excludedTotal = Object.values(s.exclusions.counts).reduce((a, b) => a + b, 0);
  const excludedList = Object.entries(s.exclusions.counts).sort((a, b) => byCodepoint(a[0], b[0]))
    .map(([k, v]) => `${k} ${v}`).join(', ');
  const count = (k: CommitClass) => s.commits.filter((c) => c.attribution.class === k).length;
  const selfAgent = s.commits.filter((c) => c.attribution.selfCommittedAgentWritten).length;
  const subagents = s.sessions.filter((x) => x.kind === 'subagent').length;
  const [first, last] = [s.coverage[0], s.coverage[s.coverage.length - 1]];
  const skipped = logs ? logs.tooLarge + logs.unavailable : 0;
  const lines = [
    `${s.files.length} files${excludedTotal ? ` (${excludedTotal} excluded: ${excludedList})` : ''}, ` +
      `window ${day(s.window.since)} → ${day(s.window.until)}`,
    `${s.commits.length} commits: ${CLASSES.map((c) => `${c} ${count(c)}`).join(' · ')}`,
    `committed by you, written by an agent: ${selfAgent}`,
    `sessions: ${s.sessions.length} (main ${s.sessions.length - subagents}, subagent ${subagents})`,
    !logs ? 'agent logs not read (--no-ingest): every commit is unknown'
      : first && last ? `Claude Code logs cover ${s.coverage.length} span(s) between ${day(first.from)} and ${day(last.to)}; `
        + 'a commit outside them is never classed human. Logs expire after 30 days.'
      : 'no Claude Code logs found for this repo: every commit is unknown',
  ];
  const tops = s.dirs.filter((d) => d.depth === 1);
  const tests = s.files.filter((f) => f.isTest);
  lines.push(`${s.dirs.length} folders (${tops.length} top-level, ${tops.filter((d) => d.partner).length} with a birth partner), `
    + `${s.branches.length} unmerged branch(es); tests: ${tests.length} (${tests.filter((f) => f.testOf).length} matched to a source)`);
  const debt = zeroDebt();
  for (const f of s.files) for (const k of DEBT_KEYS) debt[k] += f.debt?.[k] ?? 0;
  // Debt is read all-or-nothing; when it wasn't read, no total is shown (Rule 1: no reassuring 0).
  lines.push(`debt markers: ${s.unreadable.files ? 'unknown' : DEBT_KEYS.map((k) => `${k} ${debt[k]}`).join(' · ')}`);
  if (s.unreadable.files) lines.push(`debt markers unreadable for ${s.unreadable.files} file(s); their debt is unknown, not zero`);
  if (s.unreadable.branches) lines.push(`${s.unreadable.branches} branch(es) could not be read and are left out of branches[]`);
  if (s.unreadable.dirs) lines.push(`${s.unreadable.dirs} folder(s) had no lineage record; their id and birth fall back to HEAD`);
  if (skipped) lines.push(`${skipped} transcript(s) skipped (too large ${logs!.tooLarge}, unavailable ${logs!.unavailable}); commits during them are never classed human`);
  if (logs?.dropped) {
    lines.push(`${logs.dropped} log record(s) dropped (over the size cap, malformed, missing ids, or at a path outside the repo); `
      + 'commits during their transcripts are never classed human');
  }
  if (logs?.unattributed) {
    lines.push(`${logs.unattributed} transcript(s) could not be placed in a repo (no usable cwd); commits during them are never classed human`);
  }
  const agentWritten = s.commits.filter((c) => c.attribution.class === 'agent' || c.attribution.class === 'mixed').reverse();
  if (agentWritten.length > 0) {
    lines.push('', 'agent-written commits (newest first):');
    for (const c of agentWritten.slice(0, LIST_LIMIT)) {
      const a = c.attribution;
      const pct = `${Math.floor(a.agentLineShareMilli / 10)}%`.padStart(4);
      lines.push(`  ${c.sha.slice(0, 7)}  ${a.class.padEnd(5)} ${pct}  ${a.sessions.length} session(s)  ${printable(c.subject.slice(0, 60))}`);
    }
    if (agentWritten.length > LIST_LIMIT) lines.push(`  … and ${agentWritten.length - LIST_LIMIT} more`);
  }
  return lines.join('\n') + '\n';
}
