// Opt-in Qodo reads for #17 (CONSTITUTION principle 1: read-only network calls only as an explicit
// opt-in). Outbound only, through read-only commands: `gh pr list`, `gh pr view` and Qodo's
// non-mutating `qodo read` gateway. No listener, no writes to Qodo or GitHub. Tool output is parsed for ids,
// statuses, levels and paths only and is never printed; a failure maps to a fixed reason.
import { execFile } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { count, parseCache, parsePrFindings, type PrFindings, type QodoCache, type QodoFetch } from '../core/qodo.js';
import type { QodoReason } from '../core/snapshot/types.js';

/** More PRs than this can't be listed in one read, so the list may be incomplete: unknown. */
export const PR_LIMIT = 1000;
export const QODO_TIMEOUT_MS = 60_000;
const PARALLEL = 4;
/** The counts-only cache, in the repo's state dir. */
export const QODO_CACHE_FILE = 'qodo-findings.json';
// The form `gh` prints for a PR; also keeps anything option-shaped out of qodo's argv.
const PR_URL = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/[^\s?#]+\/pull\/\d+$/;

type Tool = 'gh' | 'qodo';
type Ran = { stdout: string } | { reason: QodoReason };

function run(tool: Tool, args: string[], cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<Ran> {
  // No prompts, pagers, colour or update checks; stdin is closed so nothing can wait for input.
  const env = { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_PAGER: '', NO_COLOR: '1', CLICOLOR: '0' };
  return new Promise((resolve) => {
    const child = execFile(tool, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 << 20, signal },
      (err, stdout, stderr) => {
        if (!err) return resolve({ stdout });
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        resolve({ reason: e.code === 'ENOENT' ? `${tool} not installed`
          : e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || e.code === 'ABORT_ERR' ? `${tool} failed`
          : e.killed ? 'timed out'
          : failure(tool, `${stdout}\n${stderr}`) });
      });
    child.stdin?.end();
  });
}

/** Maps a failed tool's output to a fixed reason. The text is only regex-tested, then dropped. */
function failure(tool: Tool, text: string): QodoReason {
  const t = text.toLowerCase();
  if (/not[ _-]?logged[ _-]?in|unauthori[sz]ed|unauthenticated|\b401\b|gh auth login|gh_token/.test(t)) return 'not logged in';
  if (/rate[ _-]?limit|\b429\b|too many requests/.test(t)) return 'rate limited';
  if (/enotfound|econnrefused|econnreset|etimedout|eai_again|getaddrinfo|error connecting|internet connection|network/.test(t)) {
    return 'network error';
  }
  if (tool === 'gh' && /none of the git remotes|no git remotes|not a git repository|could not determine/.test(t)) return 'no GitHub remote';
  return `${tool} failed`;
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The paths a PR changes, from `gh pr view`; a list shorter than the PR's file count is truncated. */
function parseFiles(v: unknown): string[] | 'malformed response' | 'truncated result' {
  const { files, changedFiles } = (v ?? {}) as { files?: unknown; changedFiles?: unknown };
  if (!Array.isArray(files) || !count(changedFiles)) return 'malformed response';
  const paths = files.map((f) => (f as { path?: unknown } | null)?.path);
  if (!paths.every((p): p is string => typeof p === 'string')) return 'malformed response';
  return paths.length < changedFiles ? 'truncated result' : paths;
}

/**
 * Lists this repo's PRs with `gh` and reads each one's stored Qodo findings. Closed PRs that never
 * merged are skipped (their code reached no branch) and counted. For a PR without a complete review
 * the files it changes are read too, so they become unknown rather than clean. Never rejects; any
 * failure is a reason, and the whole read is then unknown (a partial read could hide findings).
 */
export async function fetchQodo(repoDir: string, timeoutMs = QODO_TIMEOUT_MS): Promise<QodoFetch | QodoReason> {
  const listed = await run('gh', ['pr', 'list', '--state', 'all', '--limit', String(PR_LIMIT), '--json', 'number,url,state'], repoDir, timeoutMs);
  if ('reason' in listed) return listed.reason;
  const prs = parseJson(listed.stdout);
  if (!Array.isArray(prs)) return 'malformed response';
  if (prs.length >= PR_LIMIT) return 'too many PRs';
  const urls: string[] = [];
  for (const pr of prs as unknown[]) {
    const { url, state } = (pr ?? {}) as { url?: unknown; state?: unknown };
    if (typeof url !== 'string' || !PR_URL.test(url) || typeof state !== 'string') return 'malformed response';
    if (state !== 'CLOSED') urls.push(url);
  }
  // PARALLEL workers take the next PR; the first failure stops them and kills the calls in flight.
  const out: PrFindings[] = [];
  const unreviewedPaths: string[] = [];
  const stop = new AbortController();
  let failed: QodoReason | undefined;
  let next = 0;
  const worker = async () => {
    while (failed === undefined && next < urls.length) {
      const i = next++;
      const r = await run('qodo', ['--no-onboarding', 'read', 'pr-review-session', 'findings', '--pr-url', urls[i]!, '--json'], repoDir,
        timeoutMs, stop.signal);
      let parsed: PrFindings | string[] | QodoReason = 'reason' in r ? r.reason : parsePrFindings(parseJson(r.stdout));
      if (typeof parsed !== 'string') {
        out[i] = parsed;
        if (!parsed.reviewed) {
          const v = await run('gh', ['pr', 'view', urls[i]!, '--json', 'files,changedFiles'], repoDir, timeoutMs, stop.signal);
          parsed = 'reason' in v ? v.reason : parseFiles(parseJson(v.stdout));
          if (typeof parsed !== 'string') unreviewedPaths.push(...parsed);
        }
      }
      if (typeof parsed === 'string' && failed === undefined) {
        failed = parsed;
        stop.abort();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, urls.length) }, worker));
  return failed ?? { prs: out, skipped: prs.length - urls.length, unreviewedPaths };
}

/** The cached counts, null when there is no cache, or a reason when it can't be trusted. */
export function readQodoCache(stateDir: string): QodoCache | null | 'cache unreadable' {
  const file = join(stateDir, QODO_CACHE_FILE);
  try {
    // Never read through a planted link (as for every file in the state dir).
    if (!lstatSync(file).isFile()) return 'cache unreadable';
    return parseCache(readFileSync(file, 'utf8')) ?? 'cache unreadable';
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'cache unreadable';
  }
}
