// Runtime guardrails (R8). `guarded` wraps the runner's Exec, so every gh and git command it
// runs is checked before it starts: a bug elsewhere can't merge, push a protected branch,
// force-push, or touch repo settings and secrets. Every runner test goes through it too.
import { basename } from 'node:path';
import { LABELS } from './config.js';
import type { Exec } from './exec.js';

export class GuardError extends Error {}

const GH_ALLOWED = new Set([
  'issue list', 'issue view', 'issue edit', 'issue comment', 'issue create',
  'pr create', 'pr view', 'pr comment', 'pr list',
  'run view', 'label create', 'api',
]);
const GH_EDIT_FLAGS = new Set(['--add-label', '--remove-label', '--repo']);

export function assertGhAllowed(args: readonly string[]): void {
  const [a = '', b = ''] = args;
  const sub = a === 'api' ? 'api' : `${a} ${b}`;
  if (!GH_ALLOWED.has(sub)) throw new GuardError(`gh ${sub} is not allowed`);
  if (a === 'api') assertApiRead(args.slice(1));
  if (sub === 'issue edit') assertRelabel(args.slice(2));
  if (sub === 'issue create') assertProposalCreate(args.slice(2));
}

/** Every move runner.ts's relabel() makes. Only the human approves a ticket or a proposal, and a proposal stays one (repeat-findings R7). */
const RELABELS = new Set([
  `${LABELS.ready} → ${LABELS.working}`, `${LABELS.working} → ${LABELS.done}`, `${LABELS.working} → ${LABELS.help}`, `${LABELS.ready} → ${LABELS.help}`,
]);

/**
 * The runner's only issue edit, its relabel: `<n> --repo <slug> --remove-label <l> --add-label <l>`,
 * each flag spelled out once in any order. The number comes first, so no flag can sit in its place.
 */
function assertRelabel(rest: readonly string[]): void {
  const [n = '', ...pairs] = rest;
  if (!/^[1-9][0-9]*$/.test(n)) throw new GuardError('gh issue edit takes one issue number first');
  const seen = new Map<string, string>();
  for (let i = 0; i < pairs.length; i += 2) {
    const [flag = '', value] = [pairs[i], pairs[i + 1]];
    if (!GH_EDIT_FLAGS.has(flag) || seen.has(flag) || value === undefined) {
      throw new GuardError(`gh issue edit may only relabel, with --repo, --remove-label and --add-label once each (argument ${i + 4})`);
    }
    seen.set(flag, value);
  }
  if (seen.size !== GH_EDIT_FLAGS.size) throw new GuardError('gh issue edit needs --repo, --remove-label and --add-label');
  // One whole label each way, never a list: gh reads these as CSV, so '"ready-for-agent"' would add it.
  if (!RELABELS.has(`${seen.get('--remove-label')} → ${seen.get('--add-label')}`)) {
    throw new GuardError(`gh issue edit only moves a ticket ${[...RELABELS].join(', ')}: the runner never adds ${LABELS.ready} or removes ${LABELS.proposal}`);
  }
}


// GitHub's owner and repo name characters; a repo of only dots would walk up the path.
const SLUG = '[A-Za-z0-9-]+/(?!\\.\\.?/)[A-Za-z0-9._-]+';
/** The only endpoints the runner reads: its login, an issue's events or comments, a commit's check runs. */
const GH_API_ENDPOINTS = [
  /^user$/,
  new RegExp(`^repos/${SLUG}/issues/[1-9][0-9]*/(?:events|comments)$`),
  new RegExp(`^repos/${SLUG}/commits/[0-9a-f]{40}/check-runs\\?per_page=100$`),
];
const GH_API_OPTIONS = new Set(['--paginate', '--slurp', '--jq']);

/**
 * `gh api` only in the shapes the runner makes (Qodo PR93 5543bffc): a GET of one listed endpoint
 * with at most `--paginate`, `--slurp` and `--jq <expr>`, each spelled out once. An allowlist, because
 * gh also takes `-XPOST`, `-X=POST`, `-fbody=x` and a leading slash, which a list of write flags missed.
 * Errors name the reason, never an argument, which could hold a token.
 */
function assertApiRead(rest: readonly string[]): void {
  const seen = new Set<string>();
  const endpoints: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i]!;
    if (!x.startsWith('-')) {
      endpoints.push(x);
      continue;
    }
    if (!GH_API_OPTIONS.has(x)) throw new GuardError(`gh api takes only --paginate, --slurp and --jq <expr>, spelled out (argument ${i + 2} is another option)`);
    if (seen.has(x)) throw new GuardError(`gh api takes ${x} once`);
    seen.add(x);
    if (x === '--jq' && rest[++i] === undefined) throw new GuardError('gh api --jq needs an expression');
  }
  if (endpoints.length !== 1) throw new GuardError(`gh api takes exactly one endpoint (got ${endpoints.length})`);
  if (!GH_API_ENDPOINTS.some((re) => re.test(endpoints[0]!))) {
    throw new GuardError("gh api reads only user, an issue's events or comments, or a commit's check runs (?per_page=100), with no leading slash");
  }
}

const CREATE_FLAGS = new Set(['--repo', '--title', '--body-file', '--label']);

/**
 * The runner's only issue: a rule proposal (repeat-findings R7). Exactly `--repo`, `--title`,
 * `--body-file` and `--label rule-proposal`, each once: no other label, assignee, milestone or project.
 */
function assertProposalCreate(rest: readonly string[]): void {
  const seen = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const [flag = '', value] = [rest[i], rest[i + 1]];
    if (!CREATE_FLAGS.has(flag) || seen.has(flag) || value === undefined) throw new GuardError(`gh issue create may only open a ${LABELS.proposal} issue (${flag})`);
    seen.set(flag, value);
  }
  if (seen.size !== CREATE_FLAGS.size) throw new GuardError(`gh issue create needs ${[...CREATE_FLAGS].join(', ')}`);
  if (seen.get('--label') !== LABELS.proposal) throw new GuardError(`gh issue create may only add the ${LABELS.proposal} label`);
}

// No leading options such as `-c`: config the runner needs goes in GIT_CONFIG_* env instead.
const GIT_ALLOWED = new Set(['fetch', 'worktree', 'rev-parse', 'ls-remote', 'rev-list', 'status', 'diff', 'push', 'merge-base', 'remote', 'log']);
const AGENT_BRANCH = /^agent\/\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertGitAllowed(args: readonly string[]): void {
  const [sub = '', ...rest] = args;
  if (!GIT_ALLOWED.has(sub)) throw new GuardError(`git ${sub} is not allowed`);
  if (sub === 'worktree' && rest[0] !== 'add') throw new GuardError('git worktree may only add');
  if (sub === 'remote' && rest[0] !== 'get-url') throw new GuardError('git remote may only get-url');
  if (sub === 'push') assertSafePush(rest);
}

/**
 * Exactly `push origin <HEAD or a full SHA>:refs/heads/agent/<N>-<slug>`: no flags, no `+`, no
 * deletes. The `agent/` prefix rules out main and every session branch.
 */
function assertSafePush(rest: readonly string[]): void {
  if (rest.length !== 2 || rest[0] !== 'origin') throw new GuardError(`push must be "origin <refspec>", got ${JSON.stringify(rest)}`);
  const m = /^(?:HEAD|[0-9a-f]{40}):refs\/heads\/(.+)$/.exec(rest[1]!);
  if (!m || !AGENT_BRANCH.test(m[1]!)) throw new GuardError(`push to ${rest[1]} is not allowed`);
}

/** Checks every gh and git command before it runs, also one sandbox-exec runs; anything else passes through. */
export function guarded(exec: Exec): Exec {
  return async (cmd, args, opts) => {
    const [name, inner] = basename(cmd) === 'sandbox-exec' ? [basename(args[2] ?? ''), args.slice(3)] : [basename(cmd), args];
    if (name === 'gh') assertGhAllowed(inner);
    if (name === 'git') assertGitAllowed(inner);
    return exec(cmd, args, opts);
  };
}
