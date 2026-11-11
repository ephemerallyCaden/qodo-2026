import type { ExecResult } from './exec.js';
import { firstJson, type CheckRun, type Finding } from './review.js';
import { ticketMarkdown, type Ticket } from './ticket.js';

// The headless agent may read, edit, run the project's checks and commit on its own branch.
// Publication belongs to the runner (task AC2), so pushes, gh, merges and history rewrites are
// denied outright: deny rules win over any allow rule in the user's or project's settings.
export const ALLOWED_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep', 'TodoWrite',
  'Bash(npm run build:*)', 'Bash(npm run typecheck:*)', 'Bash(npm run lint:*)', 'Bash(npm test:*)',
  'Bash(npx vitest run:*)', 'Bash(npx tsc:*)', 'Bash(npx eslint:*)', 'Bash(node dist/cli.js:*)',
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git add:*)',
  'Bash(git commit:*)', 'Bash(git rev-parse:*)', 'Bash(git ls-files:*)', 'Bash(git grep:*)', 'Bash(git blame:*)',
  'Bash(ls:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)',
];

export const DENIED_TOOLS = [
  'Bash(git push:*)', 'Bash(git merge:*)', 'Bash(git rebase:*)', 'Bash(git reset:*)', 'Bash(git checkout:*)',
  'Bash(git switch:*)', 'Bash(git branch:*)', 'Bash(git worktree:*)', 'Bash(git remote:*)', 'Bash(git config:*)',
  'Bash(git fetch:*)', 'Bash(git pull:*)', 'Bash(git tag:*)', 'Bash(git update-ref:*)', 'Bash(git commit --amend:*)',
  'Bash(git -C:*)', 'Bash(git -c:*)', 'Bash(gh:*)', 'Bash(qodo:*)', 'Bash(curl:*)', 'Bash(wget:*)', 'Bash(ssh:*)',
  'Bash(npm publish:*)', 'Bash(npm install:*)', 'Bash(npm i:*)', 'WebFetch', 'WebSearch',
  'Edit(./.github/**)', 'Write(./.github/**)', 'Edit(./.claude/**)', 'Write(./.claude/**)',
];

export interface ClaudeCall {
  prompt: string;
  systemPrompt: string;
  maxTurns: number;
  maxBudgetUsd: number;
  resume?: string;
  /** The sandbox and permission settings as JSON (factory/sandbox.ts `claudeSettings`). */
  settings: string;
}

/**
 * Flags per the runner-scout probes: always `dontAsk` (the user default is `auto`), no MCP
 * servers, and never `--no-session-persistence` (attribution needs the transcript, D3). The
 * settings ride on the command line, where nothing the agent runs can change them.
 */
export function claudeArgs(c: ClaudeCall): string[] {
  return [
    '-p', c.prompt,
    ...(c.resume ? ['--resume', c.resume] : []),
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--max-turns', String(c.maxTurns),
    '--max-budget-usd', String(c.maxBudgetUsd),
    '--append-system-prompt', c.systemPrompt,
    '--strict-mcp-config',
    '--settings', c.settings,
    '--allowedTools', ...ALLOWED_TOOLS,
    '--disallowedTools', ...DENIED_TOOLS,
  ];
}

/**
 * All the agent's process tree inherits from the runner (Qodo PR #93 b274f225): a login session's
 * basics and Claude Code's config dir. Tokens, keys, agent sockets and everything else stay out.
 */
export const PASSED_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TZ', 'CLAUDE_CONFIG_DIR'];

/**
 * Defence in depth under the sandbox and the tool rules: the agent's checks run arbitrary repo
 * code, so its environment is an allowlist, can't push (credential helpers cleared, origin's
 * push URL broken) and can't reach gh (an empty config dir means no login).
 */
export function agentEnv(base: NodeJS.ProcessEnv, emptyGhConfigDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of PASSED_ENV) if (base[k] !== undefined) env[k] = base[k];
  return {
    ...env,
    NO_COLOR: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'remote.origin.pushurl',
    GIT_CONFIG_VALUE_1: 'agent-push-disabled://the-runner-pushes',
    GH_CONFIG_DIR: emptyGhConfigDir,
    GH_TOKEN: '',
    GITHUB_TOKEN: '',
  };
}

export function systemPrompt(branch: string, base: string): string {
  return [
    "You are the Commet factory's headless coding agent. No human is watching this session.",
    `- You work in the current directory: a git worktree on branch ${branch}, cut from origin/${base}. Stay on it.`,
    '- Read AGENTS.md and CLAUDE.md before changing anything, and follow them.',
    '- The runner that started you owns publication: it pushes, opens the PR, labels and comments.',
    '  git push, gh, merges, rebases, resets, amends and network tools are denied. Do not try them.',
    '- Bash runs in a sandbox: no network beyond localhost, writes only in this worktree and temp dirs, and credential',
    '  directories are unreadable. An "Operation not permitted" there is the sandbox; work within it.',
    '- Dependencies are installed. While iterating, run only the test files you touch: npx vitest run <file>.',
    '- Run the full gate once, at the end: npm run build, npm run typecheck, npm run lint, npm test. The runner re-runs it anyway.',
    '- Run tests in the foreground. Never start them in the background to wait or poll with sleep.',
    '- Commit with conventional commits: git add <explicit paths>, then git commit -m "<subject>" -m "<body>".',
    '  Heredocs and command substitution are denied. Never amend; add new commits.',
    '- Do not edit .github/, .claude/ or CONSTITUTION.md. Do not add dependencies.',
    '- The ticket in the prompt is a snapshot taken at claim time; work from it.',
    '- If the ticket is unclear, contradicts AGENTS.md or needs a human decision, stop and report "blocked".',
    '- End your final message with exactly one fenced ```json block in the format the prompt gives.',
  ].join('\n');
}

export function implementPrompt(t: Ticket, criteria: string[]): string {
  return [
    `Implement ticket #${t.number}. Snapshot of the ticket at claim time:`,
    '',
    '<ticket>',
    ticketMarkdown(t).trimEnd(),
    '</ticket>',
    '',
    'Work through it as AGENTS.md says: for a bug, reproduce it with a failing test first.',
    'Commit your work, then end with this JSON block (one entry per acceptance criterion, in order):',
    '```json',
    JSON.stringify({
      status: 'done | blocked',
      blocked_reason: 'why, if blocked',
      pr_title: 'fix(<area>): <what was wrong>',
      summary: 'two or three sentences on what changed',
      criteria: criteria.map((c) => ({ criterion: c, met: true, evidence: 'test name, command and result' })),
    }, null, 2),
    '```',
  ].join('\n');
}

export interface FixInput {
  round: number;
  maxRounds: number;
  head: string;
  findings: Finding[];
  ciFailures: { run: CheckRun; log: string }[];
  localFailures: { check: string; output: string }[];
}

export function fixPrompt(f: FixInput): string {
  const out = [`Fix round ${f.round} of ${f.maxRounds}, on head ${f.head}.`, ''];
  if (f.findings.length) {
    out.push(
      'Qodo review findings (action_required). Validate each one before changing code; Qodo is sometimes wrong.',
      'Confirm it with a failing test or a concrete trace, or reject it with a reason and evidence.',
      'Fix confirmed ones with a test that fails without the fix.', '',
    );
    for (const x of f.findings) {
      const loc = x.location?.file_path ? `${x.location.file_path}:${x.location.start_line ?? '?'}-${x.location.end_line ?? '?'}` : 'no location';
      out.push(`- id ${x.id} (${loc}): ${x.title ?? ''}`, `  ${x.description ?? ''}`);
      if (x.evidence?.explanation) out.push(`  Explanation: ${x.evidence.explanation}`);
    }
    out.push('');
  }
  for (const c of f.ciFailures) out.push(`CI check "${c.run.name}" ended ${c.run.conclusion ?? 'unknown'}. Failed log tail:`, '```', c.log, '```', '');
  for (const c of f.localFailures) out.push(`The runner's own "${c.check}" failed on your last commit. Output tail:`, '```', c.output, '```', '');
  out.push(
    'Add new commits (never amend), re-run the four checks, then end with this JSON block:',
    '```json',
    JSON.stringify({
      status: 'done | blocked',
      blocked_reason: 'why, if blocked',
      findings: f.findings.map((x) => ({ id: x.id, verdict: 'confirmed | rejected', reason: 'why', fix: 'commit and the test that failed first' })),
      notes: 'what you changed for CI or the runner\'s checks, if anything',
    }, null, 2),
    '```',
  );
  return out.join('\n');
}

export interface ClaudeOutput {
  subtype: string;
  is_error: boolean;
  result: string;
  session_id: string;
  num_turns?: number;
  total_cost_usd?: number;
  permission_denials?: unknown[];
  terminal_reason?: string;
}

export type AgentCall =
  | { ok: true; out: ClaudeOutput; block: unknown }
  | { ok: false; reason: string; out?: ClaudeOutput };

/** The last fenced ```json block in the agent's final message. */
export function lastJsonBlock(text: string): unknown {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)];
  const last = blocks.at(-1);
  if (!last) return null;
  try {
    return JSON.parse(last[1]!);
  } catch {
    return null;
  }
}

/**
 * Classifies one `claude -p --output-format json` call (R7: any failure stops the run). A timeout
 * names the timer and the measured wall clock: they can differ a lot (on #24 a 45 min timer fired
 * after 143 min, the Mac asleep for most of it), and the runner measures only the wall clock.
 */
export function readClaude(res: ExecResult, time: { timeoutMs: number; wallMs: number }): AgentCall {
  if (res.timedOut) {
    const min = (ms: number) => Math.round(ms / 60_000);
    return { ok: false, reason: `agent call timed out after its ${min(time.timeoutMs)} min timer (${min(time.wallMs)} min wall clock)` };
  }
  if (res.error) return { ok: false, reason: `agent call failed to start: ${res.error}` };
  const o = firstJson(res.stdout) as Partial<ClaudeOutput> | null;
  if (!o || typeof o.subtype !== 'string') {
    // `sandbox.failIfUnavailable`: Claude Code exits at startup rather than run unsandboxed.
    const why = /sandbox/i.test(res.stderr) ? ', the sandbox could not start' : '';
    return { ok: false, reason: `agent call failed (exit ${res.code}, no JSON result${why})` };
  }
  const out = o as ClaudeOutput;
  if (out.subtype === 'error_max_turns') return { ok: false, reason: `agent hit max turns (${out.num_turns ?? '?'})`, out };
  if (out.subtype !== 'success' || out.is_error || res.code !== 0) {
    return { ok: false, reason: `agent call failed: ${out.subtype}${out.is_error ? ' (is_error)' : ''}, exit ${res.code}`, out };
  }
  const block = lastJsonBlock(out.result ?? '');
  if (!block || typeof block !== 'object') return { ok: false, reason: 'agent result has no JSON block', out };
  const { status, blocked_reason: why } = block as { status?: unknown; blocked_reason?: unknown };
  if (status === 'blocked') return { ok: false, reason: `agent blocked: ${typeof why === 'string' && why ? why : 'no reason given'}`, out };
  if (status !== 'done') return { ok: false, reason: `agent result status ${JSON.stringify(status)}`, out };
  return { ok: true, out, block };
}

// AGENTS.md Rule 2: a Bash command is only regex-tested, then discarded. A denied command is
// kept as one of these fixed categories, never as its text.
const DENIAL_KINDS: [RegExp, string][] = [
  [/<<|\$\(|`/, 'heredoc or substitution'],
  [/^\s*git\s+push\b/, 'git push'],
  [/^\s*git\s+(-C|-c)\b/, 'git -C/-c'],
  [/^\s*git\s+(merge|rebase|reset|commit\s+--amend|pull)\b/, 'git history rewrite'],
  [/^\s*git\s+(checkout|switch|branch|worktree|tag|update-ref)\b/, 'git ref change'],
  [/^\s*git\s+(config|remote|fetch)\b/, 'git config or remote'],
  [/^\s*gh\b/, 'gh'],
  [/^\s*qodo\b/, 'qodo'],
  [/^\s*(curl|wget|ssh|scp|nc)\b/, 'network'],
  [/^\s*npm\s+(install|i|publish)\b/, 'npm install or publish'],
];

export interface Denial {
  tool: string;
  kind?: string;
}

/** Each permission denial as its tool name and, for Bash, a fixed category. No tool input survives. */
export function denials(list: unknown[] | undefined): Denial[] {
  return (list ?? []).map((d) => {
    const { tool_name: name, tool_input: input } = (d ?? {}) as { tool_name?: unknown; tool_input?: { command?: unknown } };
    const tool = typeof name === 'string' && /^[A-Za-z]{1,40}$/.test(name) ? name : 'other';
    if (tool !== 'Bash') return { tool };
    const cmd = typeof input?.command === 'string' ? input.command : '';
    return { tool, kind: DENIAL_KINDS.find(([re]) => re.test(cmd))?.[1] ?? 'other' };
  });
}

/**
 * What the runner logs of one agent call: counters, ids and denial categories. The free-text
 * result and every tool input are dropped; the run keeps only this plus the parsed result block,
 * which the PR body publishes anyway.
 */
export function agentRecord(res: ExecResult, call: AgentCall): Record<string, unknown> {
  const o = call.out;
  return {
    exit: res.code, timedOut: res.timedOut, ok: call.ok, ...(call.ok ? {} : { reason: call.reason }),
    subtype: o?.subtype ?? null, is_error: o?.is_error ?? null, num_turns: o?.num_turns ?? null,
    total_cost_usd: o?.total_cost_usd ?? null, session_id: o?.session_id ?? null, terminal_reason: o?.terminal_reason ?? null,
    permission_denials: denials(o?.permission_denials),
  };
}

export interface CriterionEvidence {
  met: boolean | null;
  evidence: string;
}

export interface ImplementResult {
  prTitle: string | null;
  summary: string;
  criteria: CriterionEvidence[];
}

const TITLE = /^(feat|fix|design|docs|chore|test)(\([a-z0-9-]+\))?: \S.{0,90}$/;

/** A PR title in the AGENTS.md form, e.g. `fix(scan): …`. */
export const isPrTitle = (s: string) => TITLE.test(s);

export function implementResult(block: unknown, criteriaCount: number): ImplementResult {
  const b = block as { pr_title?: unknown; summary?: unknown; criteria?: unknown };
  const list = Array.isArray(b.criteria) ? b.criteria : [];
  const criteria = Array.from({ length: criteriaCount }, (_, i): CriterionEvidence => {
    const c = list[i] as { met?: unknown; evidence?: unknown } | undefined;
    return { met: typeof c?.met === 'boolean' ? c.met : null, evidence: typeof c?.evidence === 'string' ? c.evidence : '' };
  });
  const title = typeof b.pr_title === 'string' && isPrTitle(b.pr_title) ? b.pr_title : null;
  return { prTitle: title, summary: typeof b.summary === 'string' ? b.summary : '', criteria };
}

export interface Disposition {
  id: string;
  verdict: 'confirmed' | 'rejected' | 'unanswered';
  reason: string;
  fix: string;
}

/** One disposition per finding sent; a finding the agent skipped stays `unanswered` (still open). */
export function fixResult(block: unknown, sent: Finding[]): { dispositions: Disposition[]; notes: string } {
  const b = block as { findings?: unknown; notes?: unknown };
  const list = (Array.isArray(b.findings) ? b.findings : []) as { id?: unknown; verdict?: unknown; reason?: unknown; fix?: unknown }[];
  const dispositions = sent.map((f): Disposition => {
    const d = list.find((x) => x?.id === f.id);
    const verdict = d?.verdict === 'confirmed' || d?.verdict === 'rejected' ? d.verdict : 'unanswered';
    return { id: f.id, verdict, reason: typeof d?.reason === 'string' ? d.reason : '', fix: typeof d?.fix === 'string' ? d.fix : '' };
  });
  return { dispositions, notes: typeof b.notes === 'string' ? b.notes : '' };
}
