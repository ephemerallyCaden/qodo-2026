import { realpathSync } from 'node:fs';
import { CommetError, EXIT } from '../core/errors.js';
import { sha256Hex } from '../core/hash.js';
import { DIFF_OPTS, LOG_OPTS, tryGit, type Git } from './git.js';

const EMPTY_TREE: Record<string, string> = {
  sha1: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  sha256: '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
};

export interface RepoInfo {
  commonDir: string;
  head: string;
  emptyTree: string;
  headMs: number;
  branch: string;
  repoId: string;
  selfEmail: string | null;
  worktreeRoots: string[];
}

export async function readRepo(git: Git): Promise<RepoInfo> {
  const first = await tryGit(git, ['rev-parse', '--is-shallow-repository', '--show-object-format',
    '--path-format=absolute', '--git-common-dir', 'HEAD', '--symbolic-full-name', 'HEAD']);
  if (first === null) {
    const isRepo = (await tryGit(git, ['rev-parse', '--git-dir'])) !== null;
    throw new CommetError(isRepo ? 'repository has no commits yet (no HEAD)' : 'not inside a git repository', EXIT.noRepo);
  }
  const [shallow, format = '', commonDir = '', head = '', ref = ''] = first.split('\n');
  if (shallow === 'true') {
    throw new CommetError(
      'shallow clone refused: history is incomplete.\n  Run `git fetch --unshallow`, then scan again. Commet never fetches.', EXIT.shallow);
  }
  const emptyTree = EMPTY_TREE[format];
  if (!emptyTree) throw new CommetError(`unsupported object format ${JSON.stringify(format)}`, EXIT.internal);
  const [ct, roots, name, email, worktrees] = await Promise.all([
    git(['show', '-s', '--format=%ct', head]),
    git(['rev-list', '--max-parents=0', head]),
    tryGit(git, ['config', 'user.name']),
    tryGit(git, ['config', 'user.email']),
    git(['worktree', 'list', '--porcelain', '-z']),
  ]);
  return {
    commonDir: realpathSync.native(commonDir),
    head,
    emptyTree,
    headMs: Number(ct.trim()) * 1000,
    branch: ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : 'HEAD',
    repoId: sha256Hex(roots.split('\n').filter(Boolean).sort().join('\n')).slice(0, 16),
    selfEmail: await selfEmail(git, name?.trim() ?? '', email?.trim() ?? ''),
    worktreeRoots: worktrees.split('\0').filter((t) => t.startsWith('worktree ')).map((t) => t.slice('worktree '.length)),
  };
}

/**
 * `user.email` canonicalised the way `--use-mailmap` canonicalises commit authors, so self
 * matches mailmapped commits (design §5.1.9). The name goes along because a mailmap entry can
 * match on name and email together. Lowercased, like every author email.
 */
async function selfEmail(git: Git, name: string, email: string): Promise<string | null> {
  if (!email) return null;
  const out = await tryGit(git, ['check-mailmap', name ? `${name} <${email}>` : `<${email}>`]);
  const mapped = out && /<([^<>]*)>\s*$/.exec(out)?.[1];
  return (mapped || email).toLowerCase();
}

export interface NumstatRow { added: number; removed: number; binary: boolean }

/** Parses `--numstat -z` tokens; a rename row has an empty path followed by old and new paths. */
function parseNumstat(tokens: string[]): Map<string, NumstatRow> {
  const rows = new Map<string, NumstatRow>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.replace(/^\n+/, '');
    const t1 = t.indexOf('\t');
    const t2 = t.indexOf('\t', t1 + 1);
    if (t1 < 0 || t2 < 0) continue;
    let path = t.slice(t2 + 1);
    if (path === '') {
      path = tokens[i + 2] ?? '';
      i += 2;
    }
    const a = t.slice(0, t1);
    rows.set(path, { added: a === '-' ? 0 : Number(a), removed: Number(t.slice(t1 + 1, t2)) || 0, binary: a === '-' });
  }
  return rows;
}

/** Every blob at HEAD (ground truth, from the repo root whatever the cwd) with its line count; binary blobs are flagged. */
export async function headFiles(git: Git, head: string, emptyTree: string): Promise<Map<string, NumstatRow>> {
  const [tree, numstat] = await Promise.all([git(['ls-tree', '-r', '-z', '--full-tree', head]),
    git(['diff', '--numstat', '-z', ...DIFF_OPTS, emptyTree, head])]);
  const blobs = tree.split('\0').flatMap((entry) => {
    const tab = entry.indexOf('\t');
    return tab > 0 && entry.slice(0, tab).split(' ')[1] === 'blob' ? [entry.slice(tab + 1)] : [];
  });
  const stats = parseNumstat(numstat.split('\0'));
  return new Map(blobs.map((p) => [p, stats.get(p) ?? { added: 0, removed: 0, binary: false }]));
}

export interface RawCommit {
  sha: string;
  dateMs: number;
  authorMs: number;
  name: string;
  email: string;
  subject: string;
  /** More than one parent (`%P`); its first-parent diff carries the merged-in lines. */
  isMerge: boolean;
  files: Map<string, NumstatRow>;
}

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NUMSTAT_ROW = /^(\d+|-)\t(\d+|-)\t/;

/**
 * Numstat rows per commit from `log --numstat -z --format=%x00%H`, parsed token by token on NUL as
 * lineageLog parses its log (AGENTS.md Rule 7, #24): a commit starts with an empty token where a
 * row would be, then its SHA; a row is `<added>\t<removed>\t<path>`, or `<added>\t<removed>\t`
 * followed by the old and new paths for a rename. No byte inside a path can split or start a
 * record, as U+0001 did when commits were framed by it. Only the one newline git writes after a
 * header, before its first row, is dropped. A repeated header (a git that lists a merge once per
 * parent) keeps only the first, first-parent, diff. A cut-off or misframed record is refused.
 */
function numstatLog(out: string): Map<string, Map<string, NumstatRow>> {
  const stats = new Map<string, Map<string, NumstatRow>>();
  const bad = () => new Error('numstat log holds an incomplete or misframed record');
  // Rows go here; a repeated header points it at a scratch map that is thrown away.
  let into: Map<string, NumstatRow> | undefined;
  // `first` is a row right after a header. Widened so TS sees what header() sets.
  let want = 'row' as 'row' | 'first' | 'sha' | 'from' | 'to';
  let renamed: NumstatRow = { added: 0, removed: 0, binary: false };
  const header = (t: string) => {
    if (!SHA.test(t)) throw bad();
    into = stats.has(t) ? new Map() : stats.set(t, new Map()).get(t)!;
    want = 'first';
  };
  const tokens = out.split('\0');
  // The token after the last NUL: empty unless the output ends inside a record.
  const tail = tokens.pop()!;
  for (const t of tokens) {
    switch (want) {
      case 'sha':
        header(t);
        break;
      case 'from':
        want = 'to';
        break;
      case 'to':
        into!.set(t, renamed);
        want = 'row';
        break;
      case 'row':
      case 'first': {
        if (t === '') {
          want = 'sha';
          break;
        }
        const r = want === 'first' && t.startsWith('\n') ? t.slice(1) : t;
        const m = into && NUMSTAT_ROW.exec(r);
        if (!m) throw bad();
        const binary = m[1] === '-';
        const row = { added: binary ? 0 : Number(m[1]), removed: Number(m[2]) || 0, binary };
        const path = r.slice(m[0].length);
        if (path === '') {
          renamed = row;
          want = 'from';
        } else {
          into!.set(path, row);
          want = 'row';
        }
      }
    }
  }
  // Only a final header's SHA may end the output without its closing NUL (an empty last commit).
  if (want === 'sha' && tail !== '') header(tail);
  else if (tail !== '' || (want !== 'row' && want !== 'first')) throw bad();
  return stats;
}

/** First-parent commits since `sinceIso` (committer date), oldest first, with numstat. */
export async function windowCommits(git: Git, head: string, sinceIso: string): Promise<RawCommit[]> {
  const since = `--since=${sinceIso}`;
  const [metaOut, statOut] = await Promise.all([
    git(['log', '--first-parent', '--use-mailmap', '-z', '--format=%H%x00%ct%x00%at%x00%aN%x00%aE%x00%P%x00%s', since, head]),
    git(['log', ...LOG_OPTS, '--numstat', '-z', '--format=%x00%H', since, head]),
  ]);
  const meta = metaOut.split('\0');
  const stats = numstatLog(statOut);
  const out: RawCommit[] = [];
  for (let i = 0; i + 7 <= meta.length; i += 7) {
    const [sha, ct, at, name, email, parents, subject] = meta.slice(i, i + 7) as [string, string, string, string, string, string, string];
    out.push({ sha, dateMs: Number(ct) * 1000, authorMs: Number(at) * 1000, name, email: email.toLowerCase(),
      subject, isMerge: parents.trim().includes(' '), files: stats.get(sha) ?? new Map() });
  }
  return out.reverse();
}

const C_ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** A patch-header path: drops git's trailing tab (paths with spaces) and undoes its C-style quoting. */
export function headerPath(raw: string): string {
  const p = raw.endsWith('\t') ? raw.slice(0, -1) : raw;
  if (p.length < 2 || !p.startsWith('"') || !p.endsWith('"')) return p;
  const chars = Array.from(p.slice(1, -1));
  const bytes: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const oct = chars.slice(i + 1, i + 4).join('');
    if (ch !== '\\') bytes.push(...Buffer.from(ch));
    else if (/^[0-7]{3}$/.test(oct)) {
      bytes.push(parseInt(oct, 8));
      i += 3;
    } else bytes.push(C_ESCAPES[chars[++i] ?? ''] ?? chars[i]!.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Raw added lines per commit and path; `incomplete` holds the commits whose patch couldn't be read completely (#38). */
export class PatchLines extends Map<string, Map<string, string[]>> {
  readonly incomplete = new Set<string>();
}

const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Raw added lines per path for first-parent commits since `sinceIso`, from `-U0` patches. Patch text
 * can hold NUL (past git's 8,000-byte binary check, or under a `diff` attribute) and U+0001, so the
 * log is read line by line (AGENTS.md Rule 7, #38): a record starts only at a line that begins with
 * NUL while no hunk is open, and the `@@` counts tell content from headers, so no content line can
 * start, end or re-key a record. A commit is `incomplete`, its readable lines kept but never human,
 * when a hunk line isn't one its counts allow (the hunk then ends there), a hunk is still open when
 * the output ends, an `@@` line doesn't parse, a `+` or `-` line other than the `---`/`+++` headers
 * sits outside a hunk, an added line has no path, or the last line is cut off. `window`, when given,
 * holds the commits a header may name. Output that can't be split into records is refused: a
 * non-empty line before the first header, or a header that isn't the full SHA of a window commit.
 * A repeated header keeps only the first record, as numstatLog does.
 */
export async function addedLines(git: Git, head: string, sinceIso: string, window?: ReadonlySet<string>): Promise<PatchLines> {
  const out = new PatchLines();
  const log = await git(['log', ...LOG_OPTS, '-p', '-U0', '--format=%x00%H', `--since=${sinceIso}`, head]);
  const bad = () => new Error('patch log holds a misframed record');
  // The record being read: its SHA (null after a repeated header, whose lines go to a scratch map
  // that is thrown away), its paths, and the lines of the path its last `+++` header named.
  let sha: string | null = null;
  let files: Map<string, string[]> | undefined;
  let cur: string[] | null = null;
  let plus = 0;
  let minus = 0;
  const unread = () => {
    if (sha !== null) out.incomplete.add(sha);
  };
  const read = (l: string) => {
    if (plus > 0 || minus > 0) {
      if (l.startsWith('+') && plus > 0) {
        plus--;
        if (cur) cur.push(l.slice(1));
        else unread();
      } else if (l.startsWith('-') && minus > 0) minus--;
      else if (!l.startsWith('\\')) {
        // A line the counts don't allow: they can't be trusted past it. It never starts a record.
        unread();
        plus = minus = 0;
      }
    } else if (l.startsWith('\0')) {
      const key = l.slice(1);
      if (!SHA.test(key) || (window && !window.has(key))) throw bad();
      sha = out.has(key) ? null : key;
      files = sha === null ? new Map() : out.set(key, new Map()).get(key)!;
      cur = null;
    } else if (!files) {
      if (l !== '') throw bad();
    } else if (l.startsWith('+++ ')) {
      const p = headerPath(l.slice(4));
      cur = p === '/dev/null' ? null : (files.get(p.slice(2)) ?? []);
      if (cur) files.set(p.slice(2), cur);
    } else if (l.startsWith('@@')) {
      const m = HUNK.exec(l);
      if (!m) unread();
      else {
        minus = m[1] === undefined ? 1 : Number(m[1]);
        plus = m[2] === undefined ? 1 : Number(m[2]);
      }
    } else if (l.startsWith('diff --git ')) cur = null;
    else if ((l.startsWith('+') || l.startsWith('-')) && !l.startsWith('--- ')) unread();
  };
  const lines = log.split('\n');
  // The text after the last newline: empty unless the output ends inside a line.
  const tail = lines.pop()!;
  for (const l of lines) read(l);
  if (tail !== '') read(tail);
  // Only a header may end the output without its newline (an empty last commit); a hunk still open,
  // or any other last line, was cut off.
  if (plus > 0 || minus > 0 || (tail !== '' && !tail.startsWith('\0'))) unread();
  return out;
}
