import { byCodepoint } from './canonical-json.js';
import type { CommitClass, SnapshotV01 } from './snapshot/types.js';

const CLASSES: CommitClass[] = ['agent', 'mixed', 'human', 'unknown'];
const LIST_LIMIT = 20;
const day = (iso: string) => iso.slice(0, 10);
// Subjects come from the repo; strip control characters so they can't drive the terminal.
const printable = (t: string) => t.replace(/\p{Cc}/gu, '?');

/** Human-readable scan summary. Contains repo-relative data only: no absolute paths or code. */
export function formatSummary(s: SnapshotV01, ingested: boolean): string {
  const excludedTotal = Object.values(s.exclusions.counts).reduce((a, b) => a + b, 0);
  const excludedList = Object.entries(s.exclusions.counts).sort((a, b) => byCodepoint(a[0], b[0]))
    .map(([k, v]) => `${k} ${v}`).join(', ');
  const count = (k: CommitClass) => s.commits.filter((c) => c.attribution.class === k).length;
  const selfAgent = s.commits.filter((c) => c.attribution.selfCommittedAgentWritten).length;
  const subagents = s.sessions.filter((x) => x.kind === 'subagent').length;
  const cov = s.coverage[0];
  const lines = [
    `${s.files.length} files${excludedTotal ? ` (${excludedTotal} excluded: ${excludedList})` : ''}, ` +
      `window ${day(s.window.since)} → ${day(s.window.until)}`,
    `${s.commits.length} commits: ${CLASSES.map((c) => `${c} ${count(c)}`).join(' · ')}`,
    `committed by you, written by an agent: ${selfAgent}`,
    `sessions: ${s.sessions.length} (main ${s.sessions.length - subagents}, subagent ${subagents})`,
    !ingested ? 'agent logs not read (--no-ingest): every commit is unknown'
      : cov ? `Claude Code logs cover ${day(cov.from)} → ${day(cov.to)}. Logs expire after 30 days; older commits stay unknown.`
      : 'no Claude Code logs found for this repo: every commit is unknown',
  ];
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
