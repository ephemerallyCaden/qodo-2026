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
const GH_API_WRITE_FLAGS = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input']);
const GH_EDIT_FLAGS = new Set(['--add-label', '--remove-label', '--repo']);

export function assertGhAllowed(args: readonly string[]): void {
  const [a = '', b = ''] = args;
  const sub = a === 'api' ? 'api' : `${a} ${b}`;
  if (!GH_ALLOWED.has(sub)) throw new GuardError(`gh ${sub} is not allowed`);
  if (a === 'api') {
    const bad = args.find((x) => GH_API_WRITE_FLAGS.has(x) || /^--(method|field|raw-field|input)=/.test(x));
    if (bad) throw new GuardError(`gh api is read-only here (${bad})`);
    const path = args.find((x) => x.startsWith('repos/'));
    if (path && /\/(secrets|variables|hooks|keys|collaborators|branches\/[^/]+\/protection|actions\/permissions)\b/.test(path)) {
      throw new GuardError(`gh api ${path} touches repo settings`);
    }
  }
  if (sub === 'issue edit') {
    const bad = args.slice(3).filter((x) => x.startsWith('-')).find((x) => !GH_EDIT_FLAGS.has(x));
    if (bad) throw new GuardError(`gh issue edit may only change labels (${bad})`);
    // Only the human approves a ticket or a proposal, and a proposal stays one (repeat-findings R7).
    if (flagValues(args, '--add-label').some((l) => l.split(',').includes(LABELS.ready))) throw new GuardError(`the runner never adds ${LABELS.ready}`);
    if (flagValues(args, '--remove-label').some((l) => l.split(',').includes(LABELS.proposal))) throw new GuardError(`the runner never removes ${LABELS.proposal}`);
  }
  if (sub === 'issue create') assertProposalCreate(args.slice(2));
}

const flagValues = (args: readonly string[], flag: string) => args.flatMap((x, i) => (x === flag ? [args[i + 1] ?? ''] : []));

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
