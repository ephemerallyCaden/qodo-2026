// One file's diff between two commits, for GET /api/diff (#75, R5). Argv-only git (system design §9
// check 8), no shell: `diff-tree` compares the two commits and never reads the work tree or the index
// (so no fsmonitor or hook runs), the revisions are full hex ids, and the paths come after `--` under
// --literal-pathspecs, so no value can act as an option or as pathspec magic. The output is parsed and
// returned, never stored: the raw listing NUL-framed (AGENTS.md Rule 7), the patch by its hunk counts.
import { DIFF_LIMITS, type DiffHunk, type DiffSection, type DiffStatus } from '../core/contract/api.js';
import { isSha } from '../core/qodo.js';
import type { Sha } from '../core/snapshot/types.js';
import { DIFF_OPTS, type Git } from './git.js';

/**
 * Pinned on top of the scan's config: an empty context line stays " " (hunk counts rely on it), and
 * paths are literal. The same options for the listing and the patch, so git pairs renames the same way.
 */
const DIFF_TREE = ['-c', 'diff.suppressBlankEmpty=false', '--literal-pathspecs', 'diff-tree', '-r', ...DIFF_OPTS];

/** A raw listing larger than this for one or two paths is not a listing of them. */
const MAX_RAW = 64 * 1024;

/** One file pair from `diff-tree --raw -z`. */
export interface RawPair { status: DiffStatus; path: string; oldPath: string | null }

/** Thrown from onData to stop git once the patch passes DIFF_LIMITS. */
const CUT = Symbol('cut');

/**
 * Parses `diff-tree -r -z --raw` output by position: a `:` meta token (modes, ids, status), then one
 * path, or two (source, destination) for a rename or copy. Every token ends with NUL; anything else
 * (an unknown status, a missing path, a cut-off record) is refused, never half-read (Rule 7).
 */
export function parseRaw(out: string): RawPair[] {
  const tokens = out.split('\0');
  if (tokens.pop() !== '') throw new Error('raw diff listing is cut off');
  const pairs: RawPair[] = [];
  for (let i = 0; i < tokens.length;) {
    const m = /^:[0-7]{6} [0-7]{6} ([0-9a-f]+) ([0-9a-f]+) ([AMDRT])\d*$/.exec(tokens[i++]!);
    if (!m) throw new Error('unexpected raw diff record');
    const [, from, to, letter] = m as unknown as [string, string, string, string];
    const take = () => {
      const p = tokens[i++];
      if (p === undefined || p === '') throw new Error('raw diff record without its path');
      return p;
    };
    if (letter === 'R') {
      const oldPath = take();
      pairs.push({ status: 'renamed', path: take(), oldPath });
      continue;
    }
    const path = take();
    const status: DiffStatus = letter === 'A' ? 'added' : letter === 'D' ? 'deleted' : from === to ? 'mode' : 'modified';
    pairs.push({ status, path, oldPath: null });
  }
  return pairs;
}

/** One file pair's patch: whether git showed it as binary, and its hunks. */
export interface PatchSection { binary: boolean; hunks: DiffHunk[] }

/**
 * Splits `diff-tree -p` text into one section per `diff --git` header. Content is told from headers by
 * the `@@` counts alone (Rule 7), so a content line such as "+diff --git x" is never a header. A
 * "\ No newline" marker belongs to the hunk it follows and isn't counted. Text cut off mid-hunk (a
 * truncated patch) just ends that hunk early.
 */
export function parsePatch(text: string): PatchSection[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const out: PatchSection[] = [];
  let section: PatchSection | null = null;
  let hunk: DiffHunk | null = null;
  let minus = 0;
  let plus = 0;
  for (const l of lines) {
    if (hunk && (minus > 0 || plus > 0)) {
      const c = l[0];
      if (c === '+') plus--;
      else if (c === '-') minus--;
      else if (c === ' ') { plus--; minus--; }
      else if (c !== '\\') throw new Error('unexpected line inside a hunk');
      hunk.lines.push(l);
      continue;
    }
    if (hunk && l.startsWith('\\')) { hunk.lines.push(l); continue; }
    hunk = null;
    if (l.startsWith('diff --git ')) { out.push(section = { binary: false, hunks: [] }); continue; }
    if (!section) throw new Error('patch text before its first header');
    if (l.startsWith('@@ ')) {
      const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(l);
      if (!m) throw new Error('malformed hunk header');
      minus = m[1] === undefined ? 1 : Number(m[1]);
      plus = m[2] === undefined ? 1 : Number(m[2]);
      section.hunks.push(hunk = { header: l, lines: [] });
    } else if (l.startsWith('Binary files ') || l === 'GIT binary patch') section.binary = true;
    // Any other header line (index, modes, similarity, rename, ---/+++) is what the raw listing gave.
  }
  return out;
}

/** Where `text` must be cut to stay within DIFF_LIMITS (after its last whole line inside them), or null when it fits. */
export function cutAt(text: string): number | null {
  let end = Math.min(text.length, DIFF_LIMITS.chars);
  for (let n = 1, nl = -1; ; n++) {
    nl = text.indexOf('\n', nl + 1);
    if (nl < 0 || nl >= end) break;
    if (n === DIFF_LIMITS.lines) { end = nl + 1; break; }
  }
  return end === text.length ? null : text.lastIndexOf('\n', end - 1) + 1;
}

/** git's stdout through the stream runner, which can be stopped. A git failure says so without its argv, so without a path. */
async function streamGit(git: Git, args: string[], onData: (chunk: string) => void, signal?: AbortSignal): Promise<void> {
  if (!git.stream) throw new Error('this git runner cannot stream');
  try {
    await git.stream(args, onData, signal);
  } catch (e) {
    if (e === CUT || signal?.aborted) throw e;
    const code = (e as { code?: unknown }).code;
    throw Object.assign(new Error(`git couldn't produce the diff${typeof code === 'number' ? ` (exit ${code})` : ''}`), { code: 'EGITDIFF' });
  }
}

/** The first parent of commit `sha`, or null for a root commit. */
export async function firstParent(git: Git, sha: Sha, signal?: AbortSignal): Promise<Sha | null> {
  if (!isSha(sha)) throw new Error('not a full commit id');
  let out = '';
  await streamGit(git, ['rev-list', '--parents', '-n', '1', sha, '--'], (c) => { out += c; }, signal);
  const [self, parent] = out.trim().split(' ');
  if (self !== sha) throw new Error('rev-list answered for another commit');
  if (parent === undefined) return null;
  if (!isSha(parent)) throw new Error('rev-list gave a malformed parent');
  return parent;
}

export interface FileDiff { sections: DiffSection[]; truncated: boolean; shownLines: number }

/**
 * The diff from `base` to `at` over `paths` (the file's path, and its path at `base` after a rename),
 * cut at DIFF_LIMITS. The listing names each pair; the patch, in the same order, gives its hunks.
 */
export async function fileDiff(git: Git, base: Sha, at: Sha, paths: readonly string[], signal?: AbortSignal): Promise<FileDiff> {
  if (!isSha(base) || !isSha(at)) throw new Error('not a full object id');
  if (paths.length === 0 || paths.some((p) => p === '')) throw new Error('no path to diff');
  let raw = '';
  await streamGit(git, [...DIFF_TREE, '-z', '--raw', base, at, '--', ...paths], (c) => {
    raw += c;
    if (raw.length > MAX_RAW) throw new Error('raw diff listing too large');
  }, signal);
  const pairs = parseRaw(raw);
  if (pairs.length === 0) return { sections: [], truncated: false, shownLines: 0 };

  let text = '';
  let newlines = 0;
  try {
    await streamGit(git, [...DIFF_TREE, '-p', '-U3', '--inter-hunk-context=0', base, at, '--', ...paths], (c) => {
      text += c;
      for (let i = c.indexOf('\n'); i >= 0; i = c.indexOf('\n', i + 1)) newlines++;
      // Past a limit: stop git; the cut below keeps whole lines within both.
      if (text.length > DIFF_LIMITS.chars || newlines > DIFF_LIMITS.lines) throw CUT;
    }, signal);
  } catch (e) {
    if (e !== CUT) throw e;
  }
  // CUT is thrown only past a limit, so a cut is exactly the truncated case.
  const cut = cutAt(text);
  const truncated = cut !== null;
  if (truncated) text = text.slice(0, cut);
  const patch = parsePatch(text);
  if (patch.length > pairs.length || (!truncated && patch.length !== pairs.length)) throw new Error('the patch and the listing disagree');
  let shownLines = 0;
  const sections = pairs.map((p, i): DiffSection => {
    const s = patch[i] ?? { binary: false, hunks: [] };
    for (const h of s.hunks) shownLines += h.lines.length;
    return { ...p, binary: s.binary, hunks: s.hunks };
  });
  return { sections, truncated, shownLines };
}
