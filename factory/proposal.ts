// What the findings sweep posts (docs/features/repeat-findings.md R6, R8): the `rule-proposal`
// issue and the comment a later finding adds. Pure. Only Qodo finding titles, descriptions,
// categories, files and links go in, plus the judge's summary and draft; the caller redacts
// machine paths before posting.
import { LABELS } from './config.js';
import type { FindingText } from './judge.js';
import { oneLine, type Draft } from './ledger.js';
import { cell } from './ticket.js';

/** A finding as a post cites it; `where` is markdown: a PR link, or a local review of a ticket. */
export type ProposalFinding = FindingText & { where: string };

export interface QodoRule {
  id: number | string;
  name: string;
  content: string;
  severity?: string;
}

/** Hidden in the issue body so a lost ledger write can't open a second issue for one group. */
export const proposalMarker = (group: string) => `<!-- commet-rule-proposal ${group} -->`;

/** Hidden in a comment: the finding ids it lists, so a lost ledger write can't post them twice. */
const postedMarker = (ids: string[]) => `<!-- commet-rule-proposal-findings ${ids.join(' ')} -->`;

/** The finding ids earlier comments say they listed. */
export function postedIds(commentBodies: string[]): Set<string> {
  const out = new Set<string>();
  for (const body of commentBodies) {
    for (const m of body.matchAll(/<!-- commet-rule-proposal-findings ([^>]*?) -->/g)) for (const id of m[1]!.split(' ')) if (id) out.add(id);
  }
  return out;
}

/**
 * Machine-local paths the redaction of this checkout and HOME can't know about: another user's
 * home, macOS temp folders (R8). Run after `redact`, which turns this machine's own into `.` and `~`.
 */
export const scrubLocalPaths = (s: string) => s
  .replace(/(?:\/private)?\/var\/folders\/[^\s`'")\]]*/g, '<tmp>')
  .replace(/\/(?:Users|home)\/[^/\s`'")\]]+/g, '<home>');

/** No `@name` in a post pings anyone (a Qodo description can quote `@param` or `@types/node`). */
const noMentions = (s: string) => s.replace(/@(?=[A-Za-z0-9_-])/g, '@\u200b');

const line = (s: string) => noMentions(oneLine(s));

export function proposalTitle(d: Draft): string {
  const name = line(d.rule.name);
  return `Rule proposal: ${name.length > 90 ? name.slice(0, 89) + '…' : name}`;
}

function findingRows(fs: ProposalFinding[]): string[] {
  return [
    '| # | Seen in | Finding | Title | Category | File |',
    '|---|---|---|---|---|---|',
    ...fs.map((f, i) => `| ${i + 1} | ${f.where} | \`${f.id.slice(0, 8)}\` | ${cell(line(f.title))} | ${cell(f.category || '?')} | ${f.file ? `\`${cell(f.file)}\`` : '—'} |`),
    '',
    'What Qodo said:',
    ...fs.map((f) => `- \`${f.id.slice(0, 8)}\`: ${line(f.description) || '_no description_'}`),
  ];
}

export function proposalBody(o: {
  group: string; draft: Draft; findings: ProposalFinding[]; sources: number; rules: QodoRule[];
}): string {
  const { draft: d } = o;
  const rules = o.rules.length
    ? [
      '`qodo read rules search` ranked these closest to the draft. If one already covers the mistake, strengthening it may beat adding a rule:',
      ...o.rules.map((r) => `- **${line(r.name)}** (rule ${line(String(r.id))}${r.severity ? `, ${line(r.severity)}` : ''}): ${line(r.content)}`),
    ]
    : ['`qodo read rules search` found no related rule.'];
  return [
    `The agent runner found one mistake in **${o.findings.length} Qodo findings from ${o.sources} different tickets** ` +
      '(AGENTS.md "Working with Qodo": a repeat becomes a proposed rule, and the human decides).',
    '',
    `**The shared mistake:** ${line(d.mistake)}`,
    '',
    '## Findings',
    ...findingRows(o.findings),
    '',
    `## Draft rule: ${line(d.rule.name)}`,
    `- **What:** ${line(d.rule.what)}`,
    `- **Where:** ${line(d.rule.where)}`,
    `- **Why:** ${line(d.rule.why)}`,
    '',
    '## Existing Qodo rules',
    ...rules,
    '',
    '## How to decide',
    `- **Adopt:** label this issue \`${LABELS.ready}\`. The agent runner then writes the AGENTS.md change as a PR against the session branch; Qodo reviews it and you merge, or not.`,
    '- **Reject:** close it.',
    '- The runner never edits AGENTS.md or Qodo rules, and never labels or closes this issue. Later findings of the same mistake are added here as comments.',
    '',
    '## Acceptance criteria',
    ...d.criteria.map((c, i) => `${i + 1}. ${line(c)}`),
    `${d.criteria.length + 1}. Only AGENTS.md changes: no code, tests or other docs.`,
    '',
    proposalMarker(o.group),
    '',
  ].join('\n');
}

export function proposalComment(o: { findings: ProposalFinding[]; total: number; sources: number }): string {
  return [
    `**Seen again.** The agent runner found ${o.findings.length} more Qodo finding(s) of this mistake. ` +
      `The group now has ${o.total} findings from ${o.sources} different tickets.`,
    '',
    ...findingRows(o.findings),
    '',
    postedMarker(o.findings.map((f) => f.id)),
    '',
  ].join('\n');
}
