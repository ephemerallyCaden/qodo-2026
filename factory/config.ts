import { lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const LABELS = {
  ready: 'ready-for-agent',
  working: 'agent-working',
  help: 'agent-needs-help',
  done: 'agent-done',
  /** A repeat-findings rule proposal (docs/features/repeat-findings.md R6). The runner only ever adds it at creation. */
  proposal: 'rule-proposal',
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
  /** The agent CLI (Claude Code). The local config's `agentCli` overrides the default. */
  claude: string;
  gh: string;
  qodo: string;
  /**
   * Whether `<git-common-dir>/factory/local.json` was read. Without one a tick claims nothing, so a
   * missing file never quietly weakens the sandbox; `{}` keeps only the generic denies (Qodo PR #235 ca6e209e).
   */
  localConfig: boolean;
  /** The local config's credential freshness check, or null for none (R13). */
  credentials: CredentialCheck | null;
  /** The local config's extra paths both sandboxes deny (`localDenies`). */
  denyReads: string[];
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
  timeouts: { gh: number; git: number; npmCi: number; check: number; agent: number; fix: number; qodo: number; judge: number };
  /** Local `qodo review --json` exports the findings sweep reads (repeat-findings R1). */
  evidenceDir: string;
  /** LLM calls (judge and draft) one sweep may make (repeat-findings R10); `sweep --max-calls` sets it. */
  sweepMaxCalls: number;
  /** Findings per judge call. */
  judgeBatch: number;
  judgeBudgetUsd: number;
  /** A sweep starts no new read or LLM call after this long. */
  sweepBudgetMs: number;
  /** PRs one sweep lists; a full list is logged, since older PRs may be cut off. */
  prListLimit: number;
  /** A settled closed PR is still read again after this long. */
  prRereadMs: number;
  dryRun: boolean;
  /** Dry-run preview of one issue as if the owner had just labelled it. */
  previewIssue: number | null;
}

const MIN = 60_000;

export function defaults(home: string, repoDir: string, commonDir: string, slug: string): Config {
  return {
    repoDir, stateDir: join(commonDir, 'factory'), slug, owner: slug.split('/')[0]!, base: 'session/week1', home,
    claude: join(home, '.local/bin/claude'), gh: '/opt/homebrew/bin/gh', qodo: join(home, '.qodo/bin/qodo'),
    localConfig: false, credentials: null, denyReads: [],
    maxFixRounds: 2, pollMs: MIN, reviewTimeoutMs: 30 * MIN, settleMs: 3 * MIN,
    maxTurns: 120, fixMaxTurns: 80, maxBudgetUsd: 15, fixMaxBudgetUsd: 8,
    timeouts: { gh: MIN, git: 2 * MIN, npmCi: 10 * MIN, check: 15 * MIN, agent: 90 * MIN, fix: 30 * MIN, qodo: 2 * MIN, judge: 5 * MIN },
    evidenceDir: join(repoDir, '.archive/docs/hackathon/evidence'),
    sweepMaxCalls: 4, judgeBatch: 20, judgeBudgetUsd: 1, sweepBudgetMs: 20 * MIN, prListLimit: 1000, prRereadMs: 24 * 60 * MIN,
    dryRun: false, previewIssue: null,
  };
}

/**
 * Machine paths that logs, CLI output and GitHub posts show as `.` and `~` instead, plus the agent
 * CLI's dir as `<agent-cli-dir>` when the local config puts it outside both (Qodo PR #235 87229e71).
 */
export function machinePaths(c: Config): [string, string][] {
  const paths: [string, string][] = [[c.repoDir, '.'], [c.home, '~']];
  const cliDir = dirname(c.claude);
  if (!paths.some(([p]) => cliDir === p || cliDir.startsWith(`${p}/`))) paths.push([cliDir, '<agent-cli-dir>']);
  return paths;
}

export const ticksFile = (c: Config) => join(c.stateDir, 'ticks.jsonl');

/** The findings sweep's ledger and log (repeat-findings R2), beside the runner's other state. */
export const findingsDir = (c: Config) => join(c.stateDir, 'findings');

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

/**
 * `https://github.com/o/r(.git)`, `ssh://git@github.com/o/r(.git)` or `git@github.com:o/r(.git)` → `o/r`.
 * The host is anchored (Qodo PR #93 4d01b33a): `evilgithub.com` or `github.com.evil` is no slug.
 */
export function slugFromRemote(url: string): string | null {
  const m = /^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m ? m[1]! : null;
}

// ----- the local config: this machine's own values, never tracked -----

/**
 * A credential freshness check for the agent CLI's login (R13): a claim needs `minHours` left on
 * the cookie `cookie` for `domain` in the Netscape cookie jar `cookieJar`. Only its expiry is read.
 */
export interface CredentialCheck {
  cookieJar: string;
  domain: string;
  cookie: string;
  minHours: number;
}

/** `<git-common-dir>/factory/local.json`. Every key is optional. */
export interface LocalConfig {
  /** The agent CLI's absolute path. */
  agentCli?: string;
  credentials?: CredentialCheck;
  /** Absolute paths both sandboxes deny, each with everything under it. */
  denyReads?: string[];
}

/** Beside the runner's other state, which neither sandbox can write, and outside every work tree. */
export const localConfigFile = (c: Config) => join(c.stateDir, 'local.json');

const LOCAL_KEYS = ['agentCli', 'credentials', 'denyReads'];
const CHECK_KEYS = ['cookieJar', 'domain', 'cookie', 'minHours'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Absolute and already normalised (no `..`, `.`, `//` or trailing slash), so a deny rule names exactly it. */
const isAbsPath = (v: unknown): v is string => typeof v === 'string' && isAbsolute(v) && !v.includes('\0') && resolve(v) === v;

function unknownKeys(v: Record<string, unknown>, known: string[]): string | null {
  const extra = Object.keys(v).filter((k) => !known.includes(k));
  return extra.length ? `has unknown key(s) ${extra.map((k) => JSON.stringify(k)).join(', ')}` : null;
}

function parseCheck(v: unknown): CredentialCheck | string {
  if (!isRecord(v)) return '"credentials" must be an object';
  const extra = unknownKeys(v, CHECK_KEYS);
  if (extra) return `"credentials" ${extra}`;
  const missing = CHECK_KEYS.filter((k) => !(k in v));
  if (missing.length) return `"credentials" needs ${missing.map((k) => JSON.stringify(k)).join(', ')}`;
  const { cookieJar, domain, cookie, minHours } = v;
  if (!isAbsPath(cookieJar)) return '"credentials.cookieJar" must be an absolute, normalised path';
  if (typeof domain !== 'string' || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/.test(domain)) return '"credentials.domain" must be a host name';
  if (typeof cookie !== 'string' || !/^[^\s;,=]+$/.test(cookie)) return '"credentials.cookie" must be a cookie name';
  if (typeof minHours !== 'number' || !Number.isFinite(minHours) || minHours < 0) return '"credentials.minHours" must be a number of hours, at least 0';
  return { cookieJar, domain, cookie, minHours };
}

/**
 * Strict: anything it doesn't know refuses the whole file, so a typo can't silently drop a deny
 * or a check. Messages name keys, never values.
 */
export function parseLocalConfig(text: string): LocalConfig | string {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return 'is not valid JSON';
  }
  if (!isRecord(v)) return 'must be a JSON object';
  const extra = unknownKeys(v, LOCAL_KEYS);
  if (extra) return extra;
  const out: LocalConfig = {};
  if ('agentCli' in v) {
    if (!isAbsPath(v['agentCli'])) return '"agentCli" must be an absolute, normalised path';
    out.agentCli = v['agentCli'];
  }
  if ('credentials' in v) {
    const check = parseCheck(v['credentials']);
    if (typeof check === 'string') return check;
    out.credentials = check;
  }
  if ('denyReads' in v) {
    const list = v['denyReads'];
    if (!Array.isArray(list) || !list.every(isAbsPath)) return '"denyReads" must be a list of absolute, normalised paths';
    out.denyReads = [...list];
  }
  return out;
}

/** The local config if there is one, null if not, or why it can't be used. */
export function readLocalConfig(file: string): LocalConfig | null | string {
  let text: string;
  try {
    if (!lstatSync(file).isFile()) return 'is not a regular file';
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return `can't be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`;
  }
  return parseLocalConfig(text);
}

export function withLocalConfig(c: Config, l: LocalConfig): Config {
  return { ...c, localConfig: true, claude: l.agentCli ?? c.claude, credentials: l.credentials ?? null, denyReads: l.denyReads ?? [] };
}

/** What both sandboxes deny on top of the generic list: the local denies and the checked cookie jar. */
export const localDenies = (c: Config): string[] => [...c.denyReads, ...(c.credentials ? [c.credentials.cookieJar] : [])];
