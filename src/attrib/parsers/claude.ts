// Claude Code transcript reader (format probed on v2.1.31x; no tool documents its log format).
// Privacy (design §6): explicit field allowlist, denylisted records dropped before JSON.parse,
// edit lines hashed immediately. No absolute path, cwd, prompt or code leaves this module.
import { createReadStream, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { byCodepoint } from '../../core/canonical-json.js';
import { sessionKey, sha256Hex } from '../../core/hash.js';
import { hashLines } from '../../core/lines.js';
import type { Session, SessionKey } from '../../core/snapshot/types.js';
import { gitRunner, tryGit } from '../../scan/git.js';

const TOOL = 'claude-code';
const MAX_LINE = 4 << 20;
const MAX_FILE = 200 << 20;
/** First-pass head and tail read budget. A head with no cwd in it is re-read up to the file cap. */
const HEAD_CAP = 4 << 20;
const TAIL_CHUNK = 64 << 10;
/** A transcript covers [first record, last record], widened by this much on each side. */
export const COVERAGE_SLACK_MS = 5 * 60_000;
const READ_CONCURRENCY = 32;
/** Files Commet must never open (history.jsonl, file-history/, api-request*). */
export const DENIED_PATH = /(^|[\\/])(history\.jsonl$|file-history([\\/]|$)|api-request)/;
/** Records dropped by a raw scan before JSON.parse; deliberately over-broad. */
const DENIED_TYPE = /"type"\s*:\s*"(last-prompt|attachment|api-request[^"]*|file-history[^"]*)"/;
/** Cheap pre-parse filters (over-broad is safe): results holding fields we read, and edit-capable calls. */
const RESULT_KEYS = /"(structuredPatch|bashEditDiff|gitOperation|stdout)"/;
const EDIT_CALL = /"name"\s*:\s*"(Edit|Write|MultiEdit|NotebookEdit|Bash)"/;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash']);
/** Global git options that take their value as the next word (`-C <dir>`, `--git-dir <path>`). */
const GIT_VALUE_OPT = '(?:C|c|-git-dir|-work-tree|-namespace|-config-env|-super-prefix)';
/** One character of a shell word, or a whole quoted run: each input has exactly one parse. */
const WORD_UNIT = `(?:[^\\s"']|"[^"]*"|'[^']*')`;
/**
 * A shell command that can create commits: `git commit`, `merge`, `cherry-pick`, `revert`, `am`,
 * `pull` or `rebase`, after any global options, anywhere in a `&&`/`;`/pipe chain or a `bash -c`
 * string. Options take their value as the next word (`-C <dir>`, `--git-dir <path>`), attached
 * (`-C/path`, `-ckey=val`) or after `=` (`--git-dir=…`). The value-taking and plain alternatives
 * exclude each other, so every token has one parse and matching stays linear (Qodo PR6 #6).
 * Over-broad is safe: it only rules out human. The command text is tested against this and
 * never stored, hashed or logged (design §6).
 */
const GIT_COMMIT_CMD = new RegExp(`(?:^|[\\s;&|()"'\`/])git(?:\\s+-(?:${GIT_VALUE_OPT}\\s+${WORD_UNIT}+|(?!${GIT_VALUE_OPT}\\s)${WORD_UNIT}*))*`
  + '\\s+(?:commit|merge|cherry-pick|revert|am|pull|rebase)(?![\\w-])');
/** True when `command` may create a commit (see GIT_COMMIT_CMD). Exported for tests. */
export const runsGitCommit = (command: string): boolean => GIT_COMMIT_CMD.test(command);
/** A git command's window is widened by this on each side: commit dates have 1 s resolution. */
const COMMAND_SLACK_MS = 1000;
const SAFE_TOKEN = /^[\w.:@+/-]{1,128}$/;
const VERSION_TOKEN = /^[\w.+-]{1,32}$/;
/** Home and temp dirs as path segments. `/tmp` is always listed, so `tmp/…` is refused on every platform. */
const PRIVATE_DIRS = [...new Set([homedir(), tmpdir(), realpathSync(tmpdir()), '/tmp'])]
  .map((d) => d.split('/').filter(Boolean)).filter((segs) => segs.length > 0);
const HEX = /^[0-9a-f]{7,64}$/;

export interface EditEvent {
  eventId: string;
  sessionKey: SessionKey;
  ts: number;
  path: string;
  hashes: string[];
}

export type SessionMeta = Pick<Session, 'key' | 'kind' | 'parentKey' | 'agentType' | 'branch' | 'model'
  | 'toolVersion' | 'linesAdded' | 'linesRemoved'> & { firstTs: number; lastTs: number; files: Set<string> };

export interface ClaudeIngest {
  events: EditEvent[];
  sessions: Map<SessionKey, SessionMeta>;
  /** Commit SHAs (possibly abbreviated) seen in a session's `git commit` results. */
  ranCommits: { sessionKey: SessionKey; sha: string }[];
  /** [call − 1 s, result + 1 s] of each commit-creating git command a session ran (Qodo PR6 #2). */
  ranWindows: { sessionKey: SessionKey; from: number; to: number }[];
  /** Spans of transcripts that vanished or became unreadable after discovery. */
  unreadable: Interval[];
  /** Spans of transcripts that dropped a record which could have held an edit: never human. */
  partial: Interval[];
  /** How many such records were dropped (over the line cap, malformed, missing ids, unplaceable path). */
  dropped: number;
}

export interface Interval { from: number; to: number }

export interface Discovery {
  /** This repo's transcripts; `cwd` stays in memory and is never output. */
  transcripts: { file: string; subagent: boolean; cwd: string; span: Interval }[];
  liveRoots: string[];
  /** Merged spans of the transcripts that were read: when edits would have been logged. */
  coverage: Interval[];
  /**
   * Spans no commit in may be human: this repo's transcripts that couldn't be read, and
   * transcripts with no usable cwd, which could belong to any repo (unattributed).
   */
  blind: Interval[];
  stats: { tooLarge: number; unavailable: number; unattributed: number };
}

/** Sorted union of intervals. */
export function mergeIntervals(spans: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const s of [...spans].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = out[out.length - 1];
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const token = (v: unknown): string | undefined => (typeof v === 'string' && SAFE_TOKEN.test(v) ? v : undefined);

/** True when `dir`'s segments appear in `parts` as a contiguous run of whole segments. */
function hasRun(parts: string[], dir: string[]): boolean {
  for (let i = 0; i + dir.length <= parts.length; i++) if (dir.every((s, j) => parts[i + j] === s)) return true;
  return false;
}

/**
 * Output metadata (model, branch, agentType): a short token that cannot carry a path. Rejects
 * absolute, home and drive-letter forms, `..` segments, and anything naming the home or temp dir.
 * Dirs match by whole segments only, so `fix/tmp-cleanup` passes on every platform (Issue #5
 * case 6). A multi-segment dir (`/Users/dev`, `/var/folders/…/T`) is refused anywhere in the
 * value; a single-segment one (`/tmp`, `/root`) only as the first segment of a de-rooted path
 * (`tmp/x/y`), since on its own it names nothing private. Branch names such as `feature/x` pass.
 */
export function metaToken(v: unknown): string | undefined {
  if (typeof v !== 'string' || !SAFE_TOKEN.test(v)) return undefined;
  const parts = v.split('/');
  if (/^(\/|~|[A-Za-z]:)/.test(v) || parts.includes('..')) return undefined;
  const named = PRIVATE_DIRS.some((d) => (d.length > 1 ? hasRun(parts, d) : parts.length > 1 && parts[0] === d[0]));
  return named ? undefined : v;
}
const version = (v: unknown): string | undefined => (typeof v === 'string' && VERSION_TOKEN.test(v) ? v : undefined);
const under = (p: string, root: string) => p === root || p.startsWith(root + '/');

function sortedDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort(byCodepoint);
  } catch {
    return [];
  }
}

/**
 * Re-checked right before every read: no symlinked file, and the real path (which resolves any
 * symlinked directory) must still pass the deny policy.
 */
function readable(file: string): boolean {
  try {
    return !lstatSync(file).isSymbolicLink() && !DENIED_PATH.test(realpathSync(file));
  } catch {
    return false;
  }
}

/** Runs `fn` over `items` with at most READ_CONCURRENCY in flight, keeping results in order. */
async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]!);
  }));
  return out;
}

function fileSize(file: string): number | null {
  try {
    return statSync(file).size;
  } catch {
    return null;
  }
}

/**
 * Logical → real path pairs for a session cwd, most specific first: the cwd onto
 * `realpath.native(cwd)`, and the repo root it implies onto the real root. The root alias is the
 * logical cwd minus the cwd's real repo-relative subpath, when the cwd ends in that subpath
 * (compared case-insensitively, for case-variant paths).
 */
function aliasesOf(cwd: string, roots: string[]): [string, string][] {
  const real = existsSync(cwd) ? realNative(cwd) : null;
  if (real === null) return [];
  const out: [string, string][] = [[cwd, real]];
  const root = roots.find((r) => under(real, r)); // roots are sorted longest first
  if (root === undefined) return out;
  const sub = real.slice(root.length);
  const tail = cwd.slice(cwd.length - sub.length);
  if (sub !== '' && cwd.length > sub.length && tail.toLowerCase() === sub.toLowerCase()) out.push([cwd.slice(0, cwd.length - sub.length), root]);
  return out;
}

/** An assistant record's `tool_use` blocks (`message.content[]`). Callers read `name` and, for Bash, test `input.command`. */
function toolUses(r: Obj): Obj[] {
  const content = isObj(r['message']) ? r['message']['content'] : undefined;
  return Array.isArray(content) ? content.filter((c): c is Obj => isObj(c) && c['type'] === 'tool_use') : [];
}

/** A Bash call whose command may create a commit. `input.command` is only tested, never kept (design §6). */
function isGitCommitCall(use: Obj): boolean {
  const input = use['input'];
  return use['name'] === 'Bash' && isObj(input) && typeof input['command'] === 'string' && runsGitCommit(input['command']);
}

/** Timestamp of the nearest allowlisted record before (`step` −1) or after (+1) line `i`. */
function stampNear(lines: string[], i: number, step: 1 | -1): number | null {
  for (let j = i + step; j >= 0 && j < lines.length; j += step) {
    const l = lines[j]!;
    if (l.length > MAX_LINE || !l.includes('"timestamp"') || DENIED_TYPE.test(l)) continue;
    const ts = Date.parse(str(parseLine(l)?.['timestamp']) ?? '');
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
}

/**
 * Earliest time a record before a transcript's first datable one (`firstTs`) could have: the
 * file's birth time when the platform records one no later than that, else the epoch.
 */
function edgeFrom(file: string, firstTs: number): number {
  try {
    const birth = statSync(file).birthtimeMs;
    return birth > 0 && birth <= firstTs ? birth : 0;
  } catch {
    return 0;
  }
}

/** Latest time a record after a transcript's last datable one could have: its modification time. */
function edgeTo(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function realNative(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

function parseLine(line: string): Obj | null {
  try {
    const v: unknown = JSON.parse(line);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** `<projects>/<slug>/<session>.jsonl` and `<projects>/<slug>/<session>/subagents/agent-<id>.jsonl`. */
export function listTranscripts(projectsDir: string): { file: string; subagent: boolean }[] {
  const out: { file: string; subagent: boolean }[] = [];
  const agents = (dir: string) => {
    for (const s of sortedDir(dir)) if (/^agent-[\w-]+\.jsonl$/.test(s)) out.push({ file: join(dir, s), subagent: true });
  };
  for (const slug of sortedDir(projectsDir)) {
    const dir = join(projectsDir, slug);
    for (const name of sortedDir(dir)) {
      if (name.endsWith('.jsonl')) {
        out.push({ file: join(dir, name), subagent: false });
        continue;
      }
      const sub = join(dir, name, 'subagents');
      agents(sub);
      // Workflow subagents (probed): <session>/subagents/workflows/<wf>/agent-<id>.jsonl.
      for (const wf of sortedDir(join(sub, 'workflows'))) agents(join(sub, 'workflows', wf));
    }
  }
  return out.filter((t) => !DENIED_PATH.test(t.file));
}

interface Head { cwd: string | null; ts: number }

/**
 * The first allowlisted record's timestamp and the first timestamped `cwd`, reading at most
 * `maxBytes`. `cwd` is null when no record has one; null when no record is datable at all.
 */
async function readHead(file: string, maxBytes: number): Promise<Head | null> {
  if (!readable(file)) return null;
  const input = createReadStream(file, { end: maxBytes - 1, highWaterMark: 16 << 10 });
  let first: number | null = null;
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (line.length > MAX_LINE || DENIED_TYPE.test(line)) continue;
      if (!line.includes('"cwd"') && (first !== null || !line.includes('"timestamp"'))) continue;
      const r = parseLine(line);
      const ts = Date.parse(str(r?.['timestamp']) ?? '');
      if (Number.isNaN(ts)) continue;
      first ??= ts;
      const cwd = str(r?.['cwd']);
      if (cwd) return { cwd, ts: first };
    }
    return first === null ? null : { cwd: null, ts: first };
  } finally {
    input.destroy();
  }
}

/** Timestamp of the last allowlisted record, reading backwards in bounded chunks. */
async function readLastTs(file: string, size: number): Promise<number | null> {
  if (!readable(file)) return null;
  const fh = await open(file, 'r');
  try {
    for (let n = Math.min(size, TAIL_CHUNK); ; n = Math.min(size, n * 4)) {
      const buf = Buffer.alloc(n);
      await fh.read(buf, 0, n, size - n);
      const lines = buf.toString('utf8').split('\n');
      if (n < size) lines.shift(); // may be a partial line
      for (const line of lines.reverse()) {
        if (!line.includes('"timestamp"') || DENIED_TYPE.test(line)) continue;
        const ts = Date.parse(str(parseLine(line)?.['timestamp']) ?? '');
        if (!Number.isNaN(ts)) return ts;
      }
      if (n >= size || n >= HEAD_CAP) return null;
    }
  } finally {
    await fh.close();
  }
}

/** Git's own discovery rule: a directory belongs to the nearest ancestor holding `.git`. */
function nearestCheckout(dir: string): string | null {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
}

/** Inside a checkout's own `.git` dir: never part of a commit, so dropping it loses nothing. */
const inGitDir = (abs: string, root: string) => under(abs, `${root}/.git`);

/** Repo-relative POSIX path, preferring the root under which the path is known to git. */
function relativise(abs: string, roots: string[], known: Set<string>): string | null {
  let fallback: string | null = null;
  for (const root of roots) {
    if (abs === root || !under(abs, root)) continue;
    const rel = abs.slice(root.length + 1);
    if (inGitDir(abs, root) || rel.split('/').includes('..')) return null;
    if (known.has(rel)) return rel;
    fallback ??= rel;
  }
  return fallback;
}

/** Added lines and removed count from structuredPatch-shaped hunks. Strings are not retained. */
function hunkLines(hunks: unknown[]): { added: string[]; removed: number } {
  const added: string[] = [];
  let removed = 0;
  for (const h of hunks) {
    if (!isObj(h) || !Array.isArray(h['lines'])) continue;
    for (const l of h['lines']) {
      if (typeof l !== 'string') continue;
      if (l.startsWith('+')) added.push(l.slice(1));
      else if (l.startsWith('-')) removed++;
    }
  }
  return { added, removed };
}

/** Allowlisted edit paths only: Edit/Write structuredPatch, Write-create content, bashEditDiff. */
function editsOf(res: Obj): { filePath: string; added: string[]; removed: number }[] {
  const out: { filePath: string; added: string[]; removed: number }[] = [];
  const fp = str(res['filePath']);
  const patch = res['structuredPatch'];
  if (fp && Array.isArray(patch) && patch.length > 0) out.push({ filePath: fp, ...hunkLines(patch) });
  else if (fp && res['type'] === 'create' && typeof res['content'] === 'string') {
    // Write-create results carry the new file in `content` with an empty structuredPatch (probed).
    const added = res['content'].split('\n');
    if (added[added.length - 1] === '') added.pop();
    out.push({ filePath: fp, added, removed: 0 });
  }
  const bed = res['bashEditDiff'];
  if (isObj(bed) && Array.isArray(bed['files'])) {
    for (const f of bed['files']) {
      const p = isObj(f) ? str(f['filePath']) : undefined;
      if (p && Array.isArray(f['hunks'])) out.push({ filePath: p, ...hunkLines(f['hunks']) });
    }
  }
  return out;
}

function commitShasOf(res: Obj): string[] {
  const out: string[] = [];
  const op = res['gitOperation'];
  const sha = isObj(op) && isObj(op['commit']) ? str(op['commit']['sha']) : undefined;
  if (sha && HEX.test(sha)) out.push(sha);
  if (typeof res['stdout'] === 'string') {
    for (const m of res['stdout'].matchAll(/^\[[^\]\n]* ([0-9a-f]{7,40})\]/gm)) out.push(m[1]!);
  }
  return out;
}

function readMeta(file: string): { agentType: string | undefined; parentAgentId: string | undefined } {
  let m: Obj | null = null;
  const metaFile = file.replace(/\.jsonl$/, '.meta.json');
  try {
    if (readable(metaFile)) m = parseLine(readFileSync(metaFile, 'utf8'));
  } catch {
    // No meta file: the subagent keeps its key and parent, without an agentType.
  }
  return { agentType: metaToken(m?.['agentType']), parentAgentId: token(m?.['parentAgentId']) };
}

/**
 * Finds this repo's transcripts by each transcript's `cwd`, never by folder name (design §5.2,
 * Appendix A.10). A live cwd belongs here when its checkout is one of this repo's registered
 * worktrees (or, for a nested checkout, when git resolves it to our common dir). A cwd that no
 * longer exists (a deleted worktree) falls back to a prefix match against our worktree paths.
 * A transcript with no cwd, or one we can't resolve, could be ours: its span becomes blind.
 */
export async function discoverClaude(projectsDir: string, commonDir: string, worktreeRoots: string[],
  maxFileBytes = MAX_FILE): Promise<Discovery> {
  // realpath.native also gives the on-disk case on case-insensitive filesystems (Issue #5 case 4).
  const liveRoots = worktreeRoots.flatMap((r) => (existsSync(r) ? [r, realpathSync.native(r)] : [r]));
  // 'unplaced': a cwd we can't resolve to a repo, so its transcript could be ours.
  const place = async (cwd: string): Promise<'ours' | 'other' | 'unplaced'> => {
    if (!cwd.startsWith('/')) return 'unplaced';
    if (!existsSync(cwd)) return liveRoots.some((r) => under(cwd, r)) ? 'ours' : 'other';
    const real = realNative(cwd);
    if (real === null) return 'unplaced';
    if (!liveRoots.some((r) => under(real, r))) return 'other';
    const top = nearestCheckout(real);
    if (!top) return 'other';
    if (liveRoots.includes(top)) return 'ours';
    const out = await tryGit(gitRunner(real), ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const common = out === null ? null : realNative(out.trim());
    if (common === null) return 'unplaced';
    return common === commonDir ? 'ours' : 'other';
  };
  const list = listTranscripts(projectsDir);
  const heads = await pool(list, (t) => readHead(t.file, HEAD_CAP).catch(() => null));
  // A head with no cwd in its first 4 MiB is read on, up to the file cap. That's rare, so it
  // runs one at a time, which bounds memory to one long line.
  for (const [i, h] of heads.entries()) {
    if (h?.cwd || (fileSize(list[i]!.file) ?? 0) <= HEAD_CAP) continue;
    heads[i] = await readHead(list[i]!.file, maxFileBytes).catch(() => null);
  }
  const cwds = [...new Set(heads.flatMap((h) => (h?.cwd ? [h.cwd] : [])))];
  const placed = new Map(await Promise.all(cwds.map(async (c) => [c, await place(c)] as const)));
  const d: Discovery = { transcripts: [], liveRoots, coverage: [], blind: [], stats: { tooLarge: 0, unavailable: 0, unattributed: 0 } };
  const mine = list.flatMap((t, i) => {
    const head = heads[i];
    if (!head) return [];
    const where = head.cwd === null ? 'unplaced' : placed.get(head.cwd)!;
    return where === 'other' ? [] : [{ t, head, where }];
  });
  const tails = await pool(mine, async ({ t }) => {
    // -1: deleted since its head was read, so its span stays blind (below).
    const size = fileSize(t.file) ?? -1;
    return { size, last: size < 0 ? null : await readLastTs(t.file, size).catch(() => null) };
  });
  for (const [i, { t, head, where }] of mine.entries()) {
    const { size, last } = tails[i]!;
    const span = { from: head.ts - COVERAGE_SLACK_MS, to: Math.max(last ?? head.ts, head.ts) + COVERAGE_SLACK_MS };
    if (where === 'unplaced') {
      d.blind.push(span);
      d.stats.unattributed++;
    } else if (size < 0) {
      d.blind.push(span);
      d.stats.unavailable++;
    } else if (size > maxFileBytes) {
      d.blind.push(span);
      d.stats.tooLarge++;
    } else d.transcripts.push({ ...t, cwd: head.cwd!, span });
  }
  d.coverage = mergeIntervals(d.transcripts.map((t) => t.span));
  return d;
}

/** Parses this repo's transcripts through the allowlist into hashed edit events and sessions. */
export async function parseClaude(d: Discovery, knownPaths: Set<string>, hash: (line: string) => string): Promise<ClaudeIngest> {
  const out: ClaudeIngest = { events: [], sessions: new Map(), ranCommits: [], ranWindows: [], unreadable: [], partial: [], dropped: 0 };
  const seen = new Set<string>();
  for (const t of d.transcripts) {
    let text: string;
    try {
      if (!readable(t.file)) throw new Error('unreadable');
      text = await readFile(t.file, 'utf8');
    } catch {
      out.unreadable.push(t.span);
      continue;
    }
    const roots = [...d.liveRoots, ...(existsSync(t.cwd) ? [] : [t.cwd])].sort((a, b) => b.length - a.length);
    const meta = t.subagent ? readMeta(t.file) : null;
    const fileAgentId = /agent-([\w-]+)\.jsonl$/.exec(t.file)?.[1];
    let model: string | undefined;
    const fileKeys = new Set<SessionKey>();
    // A result is logged when its tool call finishes, possibly after a `git commit` it ran, so
    // edits are timed by when the call was issued (its assistant record), falling back to the result.
    const issuedAt = new Map<string, number>();
    // Calls whose git command may commit, by uuid, until their result arrives (Qodo PR6 #2).
    const gitCalls = new Map<string, { at: number; sid: string; agentId: string | undefined; r: Obj }>();
    const touch = (sid: string, agentId: string | undefined, ts: number, r: Obj): SessionMeta => {
      const key = sessionKey(TOOL, sid, agentId);
      fileKeys.add(key);
      let s = out.sessions.get(key);
      if (!s) {
        s = { key, kind: agentId ? 'subagent' : 'main', parentKey: agentId ? sessionKey(TOOL, sid, meta?.parentAgentId) : undefined,
          agentType: meta?.agentType, firstTs: ts, lastTs: ts, files: new Set(), linesAdded: 0, linesRemoved: 0 };
        out.sessions.set(key, s);
      }
      if (ts <= s.firstTs) {
        s.branch = metaToken(r['gitBranch']) ?? s.branch;
        s.toolVersion = version(r['version']) ?? s.toolVersion;
      }
      s.firstTs = Math.min(s.firstTs, ts);
      s.lastTs = Math.max(s.lastTs, ts);
      return s;
    };
    // Every dropped record that could hold (or time) an edit makes the transcript partial. The
    // first and last ones are kept by line so the span can reach their datable neighbours.
    let drops = 0;
    let firstDrop = -1;
    let lastDrop = -1;
    const lines = text.split('\n');
    const drop = (i: number) => {
      drops++;
      if (firstDrop < 0) firstDrop = i;
      lastDrop = i;
    };
    // A symlinked, case-variant or /var-vs-/private/var cwd: edits are mapped onto real paths,
    // which liveRoots also hold. The cwd maps onto its realpath, and the root it sits in maps
    // through the same alias, so edits above a subdirectory cwd land too (Qodo PR6 #4).
    const aliases = aliasesOf(t.cwd, roots);
    const onDisk = (p: string) => {
      const a = aliases.find(([logical]) => under(p, logical));
      return a ? a[1] + p.slice(a[0].length) : p;
    };
    // An edit inside any of this repo's paths (logical or real) must land in it; one that can't
    // be placed is a drop. Paths outside them all (another repo, a home dotfile) are ignored.
    const ours = [...aliases.flat(), ...roots];
    const inCwd = (p: string) => !p.startsWith('/') || (ours.some((c) => under(p, c)) && !roots.some((r) => inGitDir(p, r)));
    for (const [li, line] of lines.entries()) {
      const isResult = line.includes('"toolUseResult"') && RESULT_KEYS.test(line);
      const editish = isResult || EDIT_CALL.test(line);
      if (!editish && (model || !line.includes('"model"'))) continue;
      if (DENIED_TYPE.test(line)) continue;
      const r = line.length > MAX_LINE ? null : parseLine(line);
      if (!r) {
        if (editish) drop(li);
        continue;
      }
      const uuid = str(r['uuid']);
      const resultTs = Date.parse(str(r['timestamp']) ?? '');
      if (r['type'] === 'assistant') {
        model ??= isObj(r['message']) ? metaToken(r['message']['model']) : undefined;
        const sid = str(r['sessionId']);
        const uses = toolUses(r);
        if (!uuid || Number.isNaN(resultTs)) {
          // Unlinkable or undated: its edit would be timed by the (later) result (Qodo PR6 #3).
          if (uses.some((u) => EDIT_TOOLS.has(str(u['name']) ?? ''))) drop(li);
          continue;
        }
        issuedAt.set(uuid, resultTs);
        // `git commit -q`, or discarded output, names no SHA, so the call's window marks the
        // commits instead (Qodo PR6 #2). The command is tested, never kept.
        if (uses.some(isGitCommitCall)) {
          if (sid) gitCalls.set(uuid, { at: resultTs, sid, agentId: meta ? (token(r['agentId']) ?? fileAgentId) : undefined, r });
          else drop(li);
        }
        continue;
      }
      const res = r['toolUseResult'];
      const sid = str(r['sessionId']);
      if (r['type'] !== 'user' || !isObj(res)) continue;
      const callId = str(r['sourceToolAssistantUUID']) ?? str(r['parentUuid']);
      const gitCall = callId === undefined ? undefined : gitCalls.get(callId);
      const edits = editsOf(res);
      const shas = commitShasOf(res);
      if (edits.length === 0 && shas.length === 0 && !gitCall) continue;
      if (!sid || !uuid || Number.isNaN(resultTs)) {
        drop(li);
        continue;
      }
      const ts = Math.min(resultTs, (callId && issuedAt.get(callId)) || resultTs);
      const agentId = meta ? (token(r['agentId']) ?? fileAgentId) : undefined;
      const s = touch(sid, agentId, ts, r);
      const key = s.key;
      if (gitCall) {
        gitCalls.delete(callId!);
        out.ranWindows.push({ sessionKey: key, from: gitCall.at - COMMAND_SLACK_MS, to: resultTs + COMMAND_SLACK_MS });
      }
      for (const sha of shas) out.ranCommits.push({ sessionKey: key, sha });
      // A record counts as one drop however many of its paths can't be placed (Qodo PR6 #5).
      let recordDropped = false;
      edits.forEach((e, i) => {
        const eventId = sha256Hex(`${TOOL}:${key}:${uuid}:${i}`).slice(0, 16);
        const abs = onDisk(e.filePath);
        const path = abs.startsWith('/') ? relativise(abs, roots, knownPaths) : null;
        if (!path) {
          if (inCwd(abs) && !recordDropped) {
            recordDropped = true;
            drop(li);
          }
          return;
        }
        if (seen.has(eventId)) return;
        seen.add(eventId);
        s.files.add(path);
        s.linesAdded += e.added.length;
        s.linesRemoved += e.removed;
        out.events.push({ eventId, sessionKey: key, ts, path, hashes: hashLines(e.added, hash) });
      });
    }
    // A git call with no result (a crash, a truncated log) may have committed any time until the
    // file was last written.
    for (const g of gitCalls.values()) {
      const { key } = touch(g.sid, g.agentId, g.at, g.r);
      out.ranWindows.push({ sessionKey: key, from: g.at - COMMAND_SLACK_MS, to: edgeTo(t.file) + COMMAND_SLACK_MS });
    }
    if (model) for (const k of fileKeys) out.sessions.get(k)!.model ??= model;
    if (drops > 0) {
      // A dropped record's time lies between the nearest datable records around it; past either
      // end, the file's birth and modification times bound it (Qodo PR6 #1). Wider is safe.
      const from = stampNear(lines, firstDrop, -1) ?? edgeFrom(t.file, t.span.from + COVERAGE_SLACK_MS);
      const to = stampNear(lines, lastDrop, 1) ?? edgeTo(t.file);
      out.partial.push({ from: Math.min(t.span.from, from - COVERAGE_SLACK_MS), to: Math.max(t.span.to, to + COVERAGE_SLACK_MS) });
      out.dropped += drops;
    }
  }
  return out;
}
