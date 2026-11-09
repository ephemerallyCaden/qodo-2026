// Text the runner posts to GitHub: the PR body (task AC3), fix-round dispositions (R6) and the
// end-of-run ticket comment (R9). Pure; the caller redacts machine paths before posting.
import type { CriterionEvidence, Disposition } from './agent.js';
import { isOpen, shortSha as short, type CheckRun, type Finding } from './review.js';
import { cell, type Ticket } from './ticket.js';

export interface CheckResult {
  check: string;
  ok: boolean;
}

const met = (m: boolean | null) => (m === true ? 'yes' : m === false ? 'no' : 'unknown');

export function prBody(o: {
  ticket: Ticket; base: string; branch: string; head: string; summary: string;
  criteria: string[]; evidence: CriterionEvidence[]; checks: CheckResult[];
  sessionId: string; turns: number; costUsd: number;
}): string {
  const n = o.ticket.number;
  return [
    `Automated PR from the Commet agent runner for [#${n}](${o.ticket.url}): ${o.ticket.title}`,
    '',
    `Closes #${n}`,
    '',
    `> \`Closes\` only auto-closes on the default branch. This PR targets \`${o.base}\`, so close #${n} by hand, with the evidence, once it merges.`,
    '',
    '## Summary',
    o.summary.trim() || '_The agent gave no summary._',
    '',
    `## Acceptance criteria (from #${n})`,
    '| # | Criterion | Met | Evidence |',
    '|---|---|---|---|',
    ...o.criteria.map((c, i) => `| ${i + 1} | ${cell(c)} | ${met(o.evidence[i]?.met ?? null)} | ${cell(o.evidence[i]?.evidence ?? '')} |`),
    '',
    `## Checks (run by the runner on \`${short(o.head)}\`)`,
    '| Check | Result |',
    '|---|---|',
    ...o.checks.map((c) => `| \`${c.check}\` | ${c.ok ? 'pass' : 'FAIL'} |`),
    '',
    '## Agent',
    `Headless Claude Code session \`${o.sessionId || 'unknown'}\`: ${o.turns} turns, $${o.costUsd.toFixed(2)}. ` +
      `Branch \`${o.branch}\`, cut from \`origin/${o.base}\`.`,
    'The runner pushes and opens PRs but never merges. The human decides.',
  ].join('\n');
}

const findingLabel = (f: Finding) =>
  `${f.title ?? 'untitled'}${f.location?.file_path ? ` (\`${f.location.file_path}\`)` : ''} \`${f.id.slice(0, 8)}\``;

export function dispositionsComment(o: {
  round: number; maxRounds: number; before: string; after: string;
  findings: Finding[]; dispositions: Disposition[]; ciFailures: CheckRun[]; notes: string;
}): string {
  const out = [`**Agent fix round ${o.round} of ${o.maxRounds}** (\`${short(o.before)}\` → \`${short(o.after)}\`)`, ''];
  if (o.findings.length) {
    out.push('| Finding | Verdict | Reason | Fix |', '|---|---|---|---|');
    for (const f of o.findings) {
      const d = o.dispositions.find((x) => x.id === f.id);
      out.push(`| ${cell(findingLabel(f))} | ${d?.verdict ?? 'unanswered'} | ${cell(d?.reason ?? '')} | ${cell(d?.fix ?? '')} |`);
    }
    out.push('');
  }
  if (o.ciFailures.length) out.push(`CI failures sent to the agent: ${o.ciFailures.map((r) => `${r.name} (${r.conclusion})`).join(', ')}.`);
  if (o.notes.trim()) out.push(`Agent notes: ${o.notes.trim()}`);
  if (o.before === o.after) out.push('No new commits in this round.');
  return out.join('\n');
}

export interface RunSummary {
  state: 'done' | 'needs-help';
  reason: string | null;
  runId: string;
  logPath: string;
  pr: string | null;
  head: string | null;
  checks: CheckResult[];
  ci: CheckRun[] | null;
  reviewRounds: number;
  lastRun: { commit_sha: string; review_effort?: string } | null;
  fixRounds: number;
  maxFixRounds: number;
  agentCalls: number;
  turns: number;
  costUsd: number;
  sessionId: string;
  findings: Finding[];
  dispositions: (Disposition & { round: number })[];
}

function disposition(f: Finding, all: RunSummary['dispositions']): string {
  const d = all.filter((x) => x.id === f.id).at(-1);
  if (d && d.verdict !== 'unanswered') return `${d.verdict} in round ${d.round}: ${d.reason}${d.fix ? `; fix: ${d.fix}` : ''}`;
  if (f.dismiss_reason) return `dismissed (${f.dismiss_reason})`;
  if (!isOpen(f)) return f.attribution_status ?? 'closed';
  return f.action_level === 'action_required' ? 'OPEN' : 'open recommendation (optional)';
}

export function summaryComment(s: RunSummary): string {
  const head = s.state === 'done'
    ? '**Agent run done.** The PR is ready for the human to review and merge, or not.'
    : `**Agent run stopped and needs help:** ${s.reason ?? 'unknown reason'}`;
  const ci = s.ci ? s.ci.map((r) => `${r.name} ${r.conclusion ?? r.status}`).join(', ') || 'none' : 'not reached';
  const checks = s.checks.length ? s.checks.map((c) => `${c.check.replace(/^npm (run )?/, '')} ${c.ok ? 'pass' : 'FAIL'}`).join(', ') : 'not reached';
  const review = s.lastRun ? `${s.reviewRounds} (last: completed on \`${short(s.lastRun.commit_sha)}\`, effort ${s.lastRun.review_effort ?? '?'})` : `${s.reviewRounds}`;
  const out = [
    head, '',
    '| | |', '|---|---|',
    `| PR | ${s.pr ? `${s.pr}${s.head ? ` (head \`${short(s.head)}\`)` : ''}` : 'none'} |`,
    `| Checks (runner, last commit) | ${checks} |`,
    `| CI on the head | ${ci} |`,
    `| Completed Qodo reviews | ${review} |`,
    `| Fix rounds used | ${s.fixRounds} of ${s.maxFixRounds} |`,
    `| Agent | ${s.agentCalls} call(s), ${s.turns} turns, $${s.costUsd.toFixed(2)}, session \`${s.sessionId || 'none'}\` |`,
    `| Run | \`${s.runId}\`, local log \`${s.logPath}\` |`,
  ];
  if (s.findings.length) {
    out.push('', '**Findings**', '', '| Finding | Level | Disposition |', '|---|---|---|');
    for (const f of s.findings) out.push(`| ${cell(findingLabel(f))} | ${f.action_level ?? '?'} | ${cell(disposition(f, s.dispositions))} |`);
  }
  return out.join('\n');
}
