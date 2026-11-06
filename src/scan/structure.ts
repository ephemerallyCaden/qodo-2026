// Git reads for #16: the lineage pass, debt markers and unmerged branches. The pure logic is in
// src/core/structure.ts.
import { redactPaths } from '../attrib/parsers/claude.js';
import { byCodepoint } from '../core/canonical-json.js';
import type { Branch, DebtCounts } from '../core/snapshot/types.js';
import { DEBT_KEYS, zeroDebt, type Change, type LineageCommit } from '../core/structure.js';
import { isoUtc } from '../core/time.js';
import { exclusionOf } from './exclusions.js';
import { LOG_OPTS, tryGit, type Git } from './git.js';

/** Full first-parent history, oldest first, with renames (design §5.1.3). Never windowed. */
export async function lineageLog(git: Git, head: string): Promise<LineageCommit[]> {
  const out = await git(['log', ...LOG_OPTS, '--reverse', '--name-status', '-z', '--format=%x01%H%x00%ct', head]);
  const commits: LineageCommit[] = [];
  for (const chunk of out.split('\x01')) {
    const tokens = chunk.split('\0');
    if (!tokens[0]) continue;
    const changes: Change[] = [];
    for (let i = 2; i < tokens.length; i++) {
      const status = tokens[i]!.replace(/^\n+/, '')[0];
      if (status === 'R' || status === 'C') {
        changes.push({ status, from: tokens[i + 1]!, path: tokens[i + 2]! });
        i += 2;
      } else if (status === 'A' || status === 'D' || status === 'M' || status === 'T') {
        changes.push({ status, path: tokens[++i]! });
      }
    }
    commits.push({ sha: tokens[0], dateMs: Number(tokens[1]) * 1000, changes });
  }
  return commits;
}

const MARKERS = new Map<string, keyof DebtCounts>(DEBT_KEYS.map((k) => [k.toUpperCase(), k]));

/**
 * Marker words per file in HEAD's blobs (`git grep` on the commit, never the working tree).
 * `-o` prints only the matched word, so no comment text is ever read into memory. Binary blobs are
 * skipped. Returns null when git grep fails (debt is then unknown, not zero).
 */
export async function debtCounts(git: Git, head: string): Promise<Map<string, DebtCounts> | null> {
  let out: string;
  try {
    out = await git(['grep', '-o', '-z', '-I', '-w', '-F', '--full-name', '--no-color', ...[...MARKERS.keys()].flatMap((m) => ['-e', m]),
      head, '--', ':(top)']);
  } catch (e) {
    // Exit 1 means no line matched.
    if ((e as { code?: unknown }).code === 1) return new Map();
    return null;
  }
  const counts = new Map<string, DebtCounts>();
  const prefix = `${head}:`;
  // Records are `<head>:<path>\0<WORD>\n`; paths can hold newlines, so parse from the NUL.
  for (let at = 0; at < out.length;) {
    const nul = out.indexOf('\0', at);
    const nl = out.indexOf('\n', nul);
    if (nul < 0 || nl < 0 || !out.startsWith(prefix, at)) return null;
    const path = out.slice(at + prefix.length, nul);
    const key = MARKERS.get(out.slice(nul + 1, nl));
    if (!key) return null;
    const c = counts.get(path) ?? zeroDebt();
    c[key]++;
    counts.set(path, c);
    at = nl + 1;
  }
  return counts;
}

const BRANCH_READS = 8;

/** A branch as read from git: `tops` are the top-level path segments its commits touch. */
export type RawBranch = Omit<Branch, 'dirIds'> & { tops: Set<string> };

/**
 * Unmerged local and remote-tracking branches, from refs already on disk (no fetch), except HEAD's
 * own branch and symbolic refs such as `origin/HEAD`. A branch whose commits can't be read is
 * counted in `unreadable`.
 */
export async function unmergedBranches(git: Git, head: string, headRef: string): Promise<{ branches: RawBranch[]; unreadable: number }> {
  const refs = await git(['for-each-ref', `--no-merged=${head}`,
    '--format=%(refname)%00%(symref)%00%(objectname)%00%(committerdate:unix)', 'refs/heads', 'refs/remotes']);
  const todo = refs.split('\n').filter(Boolean).map((line) => line.split('\0') as [string, string, string, string])
    .filter(([ref, symref]) => ref !== headRef && !symref);
  const branches: RawBranch[] = [];
  let unreadable = 0;
  const read = async ([ref, , sha, ct]: [string, string, string, string]) => {
    // --cc: a merge lists only files it changed against every parent (its own resolutions), not
    // the work it merged in, which HEAD..tip lists through those commits (Qodo local r1 #2).
    const log = await tryGit(git, ['log', '--format=%x01', '--name-only', '--no-renames', '--cc', '-z', `${head}..${sha}`]);
    if (log === null) {
      unreadable++;
      return;
    }
    const chunks = log.split('\x01').slice(1);
    const tops = new Set<string>();
    for (const chunk of chunks) {
      // `\0` ends the format line; a non-merge's first path follows one `\n`. Paths may hold
      // newlines themselves, so only that one is dropped (Qodo local r1 #3).
      for (const [i, t] of chunk.split('\0').entries()) {
        const path = i === 1 && t.startsWith('\n') ? t.slice(1) : t;
        const slash = path.indexOf('/');
        if (slash > 0 && exclusionOf(path) === null) tops.add(path.slice(0, slash));
      }
    }
    const remote = ref.startsWith('refs/remotes/');
    branches.push({ name: redactPaths(ref.slice(remote ? 'refs/remotes/'.length : 'refs/heads/'.length)), remote,
      aheadCount: chunks.length, lastCommitDate: isoUtc(Number(ct) * 1000), tops });
  };
  for (let i = 0; i < todo.length; i += BRANCH_READS) await Promise.all(todo.slice(i, i + BRANCH_READS).map(read));
  branches.sort((a, b) => byCodepoint(a.name, b.name) || Number(a.remote) - Number(b.remote));
  return { branches, unreadable };
}
