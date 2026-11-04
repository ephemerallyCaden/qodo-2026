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

/** Every blob at HEAD (ground truth) with its line count; binary blobs are flagged. */
export async function headFiles(git: Git, head: string, emptyTree: string): Promise<Map<string, NumstatRow>> {
  const [tree, numstat] = await Promise.all([git(['ls-tree', '-r', '-z', head]),
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

/** First-parent commits since `sinceIso` (committer date), oldest first, with numstat. */
export async function windowCommits(git: Git, head: string, sinceIso: string): Promise<RawCommit[]> {
  const since = `--since=${sinceIso}`;
  const [metaOut, statOut] = await Promise.all([
    git(['log', '--first-parent', '--use-mailmap', '-z', '--format=%H%x00%ct%x00%at%x00%aN%x00%aE%x00%P%x00%s', since, head]),
    git(['log', ...LOG_OPTS, '--numstat', '-z', '--format=%x01%H', since, head]),
  ]);
  const meta = metaOut.split('\0');
  const stats = new Map<string, Map<string, NumstatRow>>();
  for (const chunk of statOut.split('\x01')) {
    const tokens = chunk.split('\0');
    if (tokens[0]) stats.set(tokens[0], parseNumstat(tokens.slice(1)));
  }
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

/** Raw added lines per path for first-parent commits since `sinceIso`, from `-U0` patches. */
export async function addedLines(git: Git, head: string, sinceIso: string): Promise<Map<string, Map<string, string[]>>> {
  const out = new Map<string, Map<string, string[]>>();
  // NUL separates records: text patches can't contain it (git treats such files as binary).
  const log = await git(['log', ...LOG_OPTS, '-p', '-U0', '--format=%x00%H', `--since=${sinceIso}`, head]);
  for (const chunk of log.split('\0')) {
    const lines = chunk.split('\n');
    if (!lines[0]) continue;
    const files = new Map<string, string[]>();
    out.set(lines[0], files);
    let cur: string[] | null = null;
    let plus = 0;
    let minus = 0;
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (plus > 0 || minus > 0) {
        // Count hunk lines exactly so content such as "+++ x" is never read as a header.
        if (l.startsWith('+')) {
          plus--;
          cur?.push(l.slice(1));
        } else if (l.startsWith('-')) minus--;
        continue;
      }
      if (l.startsWith('+++ ')) {
        const p = headerPath(l.slice(4));
        cur = p === '/dev/null' ? null : (files.get(p.slice(2)) ?? []);
        if (cur) files.set(p.slice(2), cur);
      } else if (l.startsWith('@@ ')) {
        const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(l);
        if (!m) continue;
        minus = m[1] === undefined ? 1 : Number(m[1]);
        plus = m[2] === undefined ? 1 : Number(m[2]);
      }
    }
  }
  return out;
}
