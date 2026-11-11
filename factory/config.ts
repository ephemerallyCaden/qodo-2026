import { join } from 'node:path';

export const LABELS = {
  ready: 'ready-for-agent',
  working: 'agent-working',
  help: 'agent-needs-help',
  done: 'agent-done',
} as const;

export interface Config {
  /** Main checkout root; agent worktrees go in `<repoDir>/.sandboxes/`. */
  repoDir: string;
  /** `<git-common-dir>/factory`: lock, logs and the installed runner. Never tracked by git. */
  stateDir: string;
  /** `owner/repo` on GitHub. */
  slug: string;
  /** The only login whose tickets the runner acts on (R12). */
  owner: string;
  /** PR base and worktree start point. Must be a session branch (R5, R8). */
  base: string;
  home: string;
  claude: string;
  gh: string;
  qodo: string;
  midwayCookie: string;
  /** Hours the Midway session must still have before a claim (R13). */
  minCredHours: number;
  maxFixRounds: number;
  pollMs: number;
  /** One deadline per wait for CI plus Qodo on a head (R6). */
  reviewTimeoutMs: number;
  /** Findings must hold still on a poll this long after the run started. */
  settleMs: number;
  maxTurns: number;
  fixMaxTurns: number;
  maxBudgetUsd: number;
  fixMaxBudgetUsd: number;
  timeouts: { gh: number; git: number; npmCi: number; check: number; agent: number; fix: number; qodo: number };
  dryRun: boolean;
  /** Dry-run preview of one issue as if the owner had just labelled it. */
  previewIssue: number | null;
}

const MIN = 60_000;

export function defaults(home: string, repoDir: string, commonDir: string, slug: string): Config {
  return {
    repoDir, stateDir: join(commonDir, 'factory'), slug, owner: slug.split('/')[0]!, base: 'session/week1', home,
    claude: join(home, '.toolbox/bin/claude'), gh: '/opt/homebrew/bin/gh', qodo: join(home, '.qodo/bin/qodo'),
    midwayCookie: join(home, '.midway/cookie'), minCredHours: 2,
    maxFixRounds: 2, pollMs: MIN, reviewTimeoutMs: 30 * MIN, settleMs: 3 * MIN,
    maxTurns: 120, fixMaxTurns: 80, maxBudgetUsd: 15, fixMaxBudgetUsd: 8,
    timeouts: { gh: MIN, git: 2 * MIN, npmCi: 10 * MIN, check: 15 * MIN, agent: 90 * MIN, fix: 30 * MIN, qodo: 2 * MIN },
    dryRun: false, previewIssue: null,
  };
}

/** Machine paths that logs and GitHub posts show as `.` and `~` instead. */
export const machinePaths = (c: Config): [string, string][] => [[c.repoDir, '.'], [c.home, '~']];

export const ticksFile = (c: Config) => join(c.stateDir, 'ticks.jsonl');

/**
 * `session/<name>` with a name git accepts as a ref component (Qodo PR #93 4c0331e1): no leading
 * dot, no `..`, and no trailing `.` or `.lock`, so a bad name fails here and not at the fetch.
 */
const SESSION_BRANCH = /^session\/(?!\.)(?!.*\.\.)(?!.*\.$)(?!.*\.lock$)[A-Za-z0-9._-]+$/;

/** The base must be a session branch: the runner never targets or pushes `main` (R8). */
export function configError(c: Config): string | null {
  if (!SESSION_BRANCH.test(c.base)) return `--base must be a session/<name> branch, not ${JSON.stringify(c.base)}`;
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(c.slug)) return `bad GitHub repo ${JSON.stringify(c.slug)}`;
  if (c.previewIssue !== null && !c.dryRun) return '--issue only works with --dry-run';
  return null;
}

/** `https://github.com/o/r(.git)` or `git@github.com:o/r(.git)` → `o/r`. */
export function slugFromRemote(url: string): string | null {
  const m = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? m[1]! : null;
}
