// Git reads for #16: the lineage pass, debt markers and unmerged branches. The pure logic is in
// src/core/structure.ts.
import { byCodepoint } from '../core/canonical-json.js';
import type { Branch, DebtCounts } from '../core/snapshot/types.js';
import { DEBT_KEYS, zeroDebt, type Change, type LineageCommit } from '../core/structure.js';
import { isoUtc } from '../core/time.js';
import { exclusionOf } from './exclusions.js';
import { LOG_OPTS, tryGit, type Git } from './git.js';

/**
 * Full first-parent history, oldest first, with renames (design §5.1.3). Never windowed, so it is
 * streamed rather than buffered (PR #20 Qodo r1 #4) and parsed token by token as it arrives: a
 * commit starts with an empty token (`\0<sha>\0<ct>`) where a status would be, and each status
 * consumes its one or two paths, so no byte inside a path can split or start a record (Qodo local
 * r2 #2). A git that lists a merge once per parent repeats its header; only the first
 * (first-parent) diff is kept (Qodo local r3 #1).
 */
export async function lineageLog(git: Git, head: string): Promise<LineageCommit[]> {
  const args = ['log', ...LOG_OPTS, '--reverse', '--name-status', '-z', '--format=%x00%H%x00%ct', head];
  const commits: LineageCommit[] = [];
  let cur: LineageCommit | undefined;
  // Changes go here; a repeated header points it at a scratch list that is thrown away.
  let into: LineageCommit['changes'] = [];
  type Want = 'status' | 'sha' | 'ct' | 'from' | 'to' | 'path';
  // Widened so the end-of-stream check below sees what token() set (TS can't track the closure).
  let want = 'status' as Want;
  let status: Change['status'] | null = null;
  let [sha, from] = ['', ''];
  const token = (t: string) => {
    switch (want) {
      case 'status': {
        if (t === '') {
          want = 'sha';
          return;
        }
        // The format line ends with one newline before the commit's first status.
        const s = (t.startsWith('\n') ? t.slice(1) : t)[0];
        // An unknown status (U, X, B; not produced by log) names one path: skip it to stay aligned. A
        // HEAD folder only it would have created falls back in dirsAtHead and is counted there.
        status = s === 'A' || s === 'C' || s === 'D' || s === 'M' || s === 'R' || s === 'T' ? s : null;
        want = status === 'R' || status === 'C' ? 'from' : 'path';
        return;
      }
      case 'sha':
        sha = t;
        want = 'ct';
        return;
      case 'ct':
        if (cur?.sha === sha) into = [];
        else {
          cur = { sha, dateMs: Number(t) * 1000, changes: [] };
          commits.push(cur);
          into = cur.changes;
        }
        want = 'status';
        return;
      case 'from':
        from = t;
        want = 'to';
        return;
      case 'to':
        into.push({ status: status!, from, path: t });
        want = 'status';
        return;
      case 'path':
        if (status) into.push({ status, path: t });
        want = 'status';
    }
  };
  // Complete tokens end in NUL; the unfinished tail waits for the next chunk.
  let pending = '';
  const feed = (chunk: string) => {
    const parts = (pending + chunk).split('\0');
    pending = parts.pop()!;
    for (const t of parts) token(t);
  };
  if (git.stream) await git.stream(args, feed);
  else feed(await git(args));
  // A last header's timestamp may end the output without a closing NUL (an empty HEAD commit);
  // anything else left over is a cut-off record, refused rather than half-read (PR #20 Qodo r2 #1).
  if (pending !== '' && want === 'ct') token(pending);
  else if (pending !== '' || (want !== 'status' && want !== 'sha')) throw new Error('lineage log ended inside an incomplete record');
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

interface Tip { aheadCount: number; ct: number; tops: Set<string>; remote: boolean }

/**
 * Unmerged local and remote-tracking branches, from refs already on disk (no fetch), except HEAD's
 * own branch and symbolic refs such as `origin/HEAD`. A remote-tracking ref that is a local
 * branch's upstream, or is `<remote>/<name>` for a local `<name>`, folds into that branch's entry,
 * which then uses the most advanced tip (#16 AC11). A branch whose commits can't be read is
 * counted in `unreadable`.
 */
export async function unmergedBranches(git: Git, head: string, headRef: string): Promise<{ branches: RawBranch[]; unreadable: number }> {
  const refs = await git(['for-each-ref', `--no-merged=${head}`,
    '--format=%(refname)%00%(symref)%00%(objectname)%00%(committerdate:unix)%00%(upstream)', 'refs/heads', 'refs/remotes']);
  const rows = refs.split('\n').filter(Boolean).map((line) => line.split('\0') as [string, string, string, string, string])
    .filter(([ref, symref]) => ref !== headRef && !symref);

  // Entries keyed by their first ref's full name (a local `origin/x` and the remote-tracking
  // `origin/x` are different entries; Qodo local r5 #2). Locals first, so remotes can find them.
  const groups = new Map<string, typeof rows>();
  const byUpstream = new Map<string, string>();
  for (const row of rows) {
    if (!row[0].startsWith('refs/heads/')) continue;
    groups.set(row[0], [row]);
    if (row[4]) byUpstream.set(row[4], row[0]);
  }
  for (const row of rows) {
    const ref = row[0];
    if (!ref.startsWith('refs/remotes/')) continue;
    const short = ref.slice('refs/remotes/'.length);
    const slash = short.indexOf('/');
    const sameName = slash > 0 ? `refs/heads/${short.slice(slash + 1)}` : '';
    const local = byUpstream.get(ref) ?? (groups.has(sameName) ? sameName : undefined);
    if (local !== undefined) groups.get(local)!.push(row);
    else groups.set(ref, [row]);
  }

  const read = async ([ref, , sha, ct]: (typeof rows)[number]): Promise<Tip | null> => {
    const range = `${head}..${sha}`;
    // --cc: a merge lists only files it changed against every parent (its own resolutions), not
    // the work it merged in, which HEAD..tip lists through those commits (Qodo local r1 #2).
    // An empty format leaves only NUL-separated paths (no separator lines), so no byte in a path can
    // fake a commit boundary or need stripping; rev-list counts the commits (Qodo local r1 #3, r4 #2).
    // Binary changes are excluded as everywhere else: numstat marks them `-`. It can't give a
    // combined diff for merges, so it only flags paths that changed solely as binary in the
    // branch's own commits; a binary changed only inside a merge isn't known (PR #20 Qodo r1 #2).
    const [count, log, stat] = await Promise.all([tryGit(git, ['rev-list', '--count', range]),
      tryGit(git, ['log', '--format=', '--name-only', '--no-renames', '--cc', '-z', range]),
      tryGit(git, ['log', '--format=', '--numstat', '--no-renames', '--no-merges', '-z', range])]);
    if (count === null || log === null || stat === null) return null;
    const binary = new Set<string>();
    const text = new Set<string>();
    for (const row of stat.split('\0')) {
      const t2 = row.indexOf('\t', row.indexOf('\t') + 1);
      if (t2 < 0) continue; // the empty token after the last row
      (row.startsWith('-\t-\t') ? binary : text).add(row.slice(t2 + 1));
    }
    const tops = new Set<string>();
    for (const path of log.split('\0')) {
      const slash = path.indexOf('/');
      if (slash > 0 && exclusionOf(path) === null && (text.has(path) || !binary.has(path))) tops.add(path.slice(0, slash));
    }
    return { aheadCount: Number(count.trim()), ct: Number(ct), tops, remote: ref.startsWith('refs/remotes/') };
  };
  const tips = new Map<string, Tip | null>();
  for (let i = 0; i < rows.length; i += BRANCH_READS) {
    const batch = rows.slice(i, i + BRANCH_READS);
    (await Promise.all(batch.map(read))).forEach((tip, j) => tips.set(batch[j]![0], tip));
  }

  const branches: RawBranch[] = [];
  let unreadable = 0;
  for (const [key, members] of groups) {
    const read = members.map(([ref]) => tips.get(ref)!);
    if (read.some((t) => t === null)) {
      unreadable++;
      continue;
    }
    // Most advanced tip: most commits ahead of HEAD, then the newer tip, then the local one.
    const best = (read as Tip[]).sort((a, b) => b.aheadCount - a.aheadCount || b.ct - a.ct || Number(a.remote) - Number(b.remote))[0]!;
    const remote = key.startsWith('refs/remotes/');
    const name = key.slice(remote ? 'refs/remotes/'.length : 'refs/heads/'.length);
    // Kept as git has it, like file paths: a refname can't start with `/` or hold `~`, `:` or `\`,
    // so it can't be an absolute, home or drive path (Qodo local r4 #3).
    branches.push({ name, remote, alsoRemote: !remote && members.length > 1, aheadCount: best.aheadCount,
      lastCommitDate: isoUtc(best.ct * 1000), tops: best.tops });
  }
  branches.sort((a, b) => byCodepoint(a.name, b.name) || Number(a.remote) - Number(b.remote));
  return { branches, unreadable };
}
