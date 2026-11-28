// Git reads for space debris (R13): every branch and remote-tracking ref, which of them HEAD has merged, the
// remotes' fetch refspecs and the default branch, then, for the refs planDebris() keeps, their own commits and
// changes. Local refs only: nothing is fetched. The pure logic is src/core/debris.ts.
import { redactPaths } from '../attrib/parsers/claude.js';
import type { DebrisCommit, DebrisGit, DebrisPlan, DebrisRead, RefRow, RemoteRow, WorktreeRow } from '../core/debris.js';
import { worktreeKey } from '../core/debris.js';
import { exclusionOf } from './exclusions.js';
import { tryGit, type Git } from './git.js';
import type { RefWork } from './structure.js';

const READS = 8;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CT = /^(?:0|[1-9][0-9]*)$/;
const HEADS = 'refs/heads/';
const REMOTES = 'refs/remotes/';

/**
 * The refs, remotes, default branch and worktrees debris is planned from. A ref listing that fails fails the
 * scan, as `branches[]`'s does. Refnames can hold neither NUL nor a newline (`git check-ref-format`), so a
 * newline ends a row and `%00` separates its fields.
 */
export async function readDebrisGit(git: Git, head: string, headCt: number, headRef: string, worktrees: WorktreeRow[]): Promise<DebrisGit> {
  const [all, merged, fetch, initDefault] = await Promise.all([
    git(['for-each-ref', '--format=%(refname)%00%(symref)%00%(objectname)%00%(committerdate:unix)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)',
      HEADS, REMOTES]),
    git(['for-each-ref', `--merged=${head}`, '--format=%(refname)', HEADS, REMOTES]),
    // Exit 1: no remote has a fetch refspec. Any failure leaves no remote known, so no push command is shown.
    tryGit(git, ['config', '-z', '--get-regexp', '^remote\\..*\\.fetch$']),
    tryGit(git, ['config', 'init.defaultBranch']),
  ]);
  const mergedSet = new Set(merged.split('\n').filter(Boolean));
  const refs: RefRow[] = all.split('\n').filter(Boolean).map((line) => {
    const f = line.split('\0');
    const [ref, symref, sha, ct, upstream, upstreamRemote, upstreamRemoteRef] = f as [string, string, string, string, string, string, string];
    if (f.length !== 7 || !(ref.startsWith(HEADS) || ref.startsWith(REMOTES)) || (!symref && (!SHA.test(sha) || !CT.test(ct)))) {
      throw new Error('for-each-ref listed a malformed ref');
    }
    return { ref, symref, sha, ct: Number(ct), upstream, upstreamRemote, upstreamRemoteRef, merged: mergedSet.has(ref) };
  });
  return { head, headCt, headRef, refs, remotes: remotesOf(fetch ?? ''), initDefault: initDefault?.trim() || null, worktrees };
}

/** Remotes from `git config -z --get-regexp '^remote\..*\.fetch$'` (`<key>\n<value>\0` each), standard or not. */
export function remotesOf(out: string): RemoteRow[] {
  const specs = new Map<string, string[]>();
  for (const entry of out.split('\0')) {
    const nl = entry.indexOf('\n');
    const key = nl < 0 ? entry : entry.slice(0, nl);
    if (!key.startsWith('remote.') || !key.endsWith('.fetch') || key.length <= 'remote..fetch'.length) continue;
    const name = key.slice('remote.'.length, -'.fetch'.length);
    specs.set(name, [...(specs.get(name) ?? []), nl < 0 ? '' : entry.slice(nl + 1)]);
  }
  return [...specs].map(([name, values]) => ({ name, standard: values.length === 1 && values[0] === `+refs/heads/*:refs/remotes/${name}/*` }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const COMMIT_FORMAT = '--format=%H%x00%ct%x00%aN%x00%aE%x00%s';

/**
 * `log -z` records of COMMIT_FORMAT (five fields each), newest first, or null when the output doesn't split
 * into whole, well-formed records (a cut-off read, or a field that held a NUL). Names and subjects are redacted
 * as commits' are; emails lowercased and kept in memory only.
 */
export function parseCommits(out: string, extra = 0): { commits: DebrisCommit[]; extras: string[][] } | null {
  const width = 5 + extra;
  const tokens = out.split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  if (tokens.length % width !== 0) return null;
  const commits: DebrisCommit[] = [];
  const extras: string[][] = [];
  for (let i = 0; i < tokens.length; i += width) {
    // With -z, git ends each record with NUL and starts the next right after it: no newline to drop.
    const [sha, ct, name, email, subject, ...rest] = tokens.slice(i, i + width) as [string, string, string, string, string, ...string[]];
    if (!SHA.test(sha) || !CT.test(ct)) return null;
    commits.push({ sha, ct: Number(ct), name: redactPaths(name), email: email.toLowerCase(), subject: redactPaths(subject) });
    extras.push(rest);
  }
  return { commits, extras };
}

/**
 * Changed paths from `diff-tree -r -z --numstat --no-renames` (`<added>\t<removed>\t<path>\0` each, AGENTS.md
 * Rule 7: split on NUL only, the path never trimmed), binary-only and excluded paths left out. Null when a
 * record doesn't parse.
 */
export function numstatPaths(out: string): string[] | null {
  const tokens = out.split('\0');
  if (tokens.pop() !== '') return null;
  const paths: string[] = [];
  for (const t of tokens) {
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(t);
    if (!m || t.length === m[0].length) return null;
    const path = t.slice(m[0].length);
    if (m[1] !== '-' && exclusionOf(path) === null) paths.push(path);
  }
  return paths;
}

/** A tip's own commit and its first-parent change (the empty tree's for a root commit), for a merged item or a worktree. */
async function tipRead(git: Git, sha: string, emptyTree: string): Promise<Omit<DebrisRead, 'aheadCount'> | null> {
  const log = await tryGit(git, ['log', '-1', '--use-mailmap', '-z', `${COMMIT_FORMAT}%x00%P`, sha, '--']);
  const parsed = log === null ? null : parseCommits(log, 1);
  if (!parsed || parsed.commits.length !== 1) return null;
  const parent = parsed.extras[0]![0]!.split(' ')[0] || emptyTree;
  if (!SHA.test(parent)) return null;
  const diff = await tryGit(git, ['diff-tree', '-r', '-z', '--numstat', '--no-renames', '--no-ext-diff', '--no-textconv', parent, sha, '--']);
  const paths = diff === null ? null : numstatPaths(diff);
  return paths && { commits: parsed.commits, lines: 0, paths, cherryMerged: false };
}

/** `git cherry HEAD <tip>`: every line `- <sha>` (its change is in HEAD), and at least one. Null when it fails. */
async function cherryMerged(git: Git, head: string, tip: string): Promise<boolean | null> {
  const out = await tryGit(git, ['cherry', head, tip]);
  if (out === null) return null;
  const lines = out.split('\n').filter(Boolean);
  return lines.length > 0 && lines.every((l) => l.startsWith('- '));
}

/**
 * What planDebris() asked for, keyed as buildDebris() reads it: a merged group's tip; an unmerged group's own
 * commits (HEAD..tip) with its work from the branch reads (`work`, no extra numstat), and `git cherry` when its
 * upstream is gone; a prunable worktree's HEAD, with the commits HEAD lacks when it's detached. A failed or
 * malformed read is null (counted as unreadable, never guessed).
 */
export async function readDebris(git: Git, plan: DebrisPlan, work: ReadonlyMap<string, RefWork>, head: string, emptyTree: string):
  Promise<Map<string, DebrisRead | null>> {
  const jobs: [string, () => Promise<DebrisRead | null>][] = [];
  for (const g of plan.groups) {
    jobs.push([g.key, async () => {
      if (g.merged) {
        const r = await tipRead(git, g.best.sha, emptyTree);
        return r && { ...r, aheadCount: 0 };
      }
      const w = work.get(g.best.ref);
      if (!w) return null;
      const [log, cherry] = await Promise.all([tryGit(git, ['log', '--use-mailmap', '-z', COMMIT_FORMAT, `${head}..${g.best.sha}`, '--']),
        g.upstreamGone ? cherryMerged(git, head, g.best.sha) : false]);
      const parsed = log === null ? null : parseCommits(log);
      if (!parsed || parsed.commits.length === 0 || cherry === null) return null;
      return { commits: parsed.commits, aheadCount: w.aheadCount, lines: w.lines, paths: [...w.paths], cherryMerged: cherry };
    }]);
  }
  const keys = new Set<string>();
  for (const w of plan.worktrees) {
    const key = worktreeKey(w);
    if (!w.prunable || keys.has(key)) continue;
    keys.add(key);
    jobs.push([key, async () => {
      if (!SHA.test(w.head)) return null;
      const [r, ahead] = await Promise.all([tipRead(git, w.head, emptyTree),
        w.ref === null ? tryGit(git, ['rev-list', '--count', `${head}..${w.head}`, '--']) : '0']);
      if (!r || ahead === null || !CT.test(ahead.trim())) return null;
      return { ...r, aheadCount: Number(ahead.trim()) };
    }]);
  }
  const out = new Map<string, DebrisRead | null>();
  for (let i = 0; i < jobs.length; i += READS) {
    const batch = jobs.slice(i, i + READS);
    (await Promise.all(batch.map(([, run]) => run()))).forEach((r, j) => out.set(batch[j]![0], r));
  }
  return out;
}
