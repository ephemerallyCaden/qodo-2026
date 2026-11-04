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
const SAFE_TOKEN = /^[\w.:@+/-]{1,128}$/;
const VERSION_TOKEN = /^[\w.+-]{1,32}$/;
const PRIVATE_DIRS = [...new Set([homedir(), tmpdir(), realpathSync(tmpdir())])].filter((d) => d.length > 1);
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
  /** Spans of transcripts that vanished or became unreadable after discovery. */
  unreadable: Interval[];
}

export interface Interval { from: number; to: number }

export interface Discovery {
  /** This repo's transcripts; `cwd` stays in memory and is never output. */
  transcripts: { file: string; subagent: boolean; cwd: string; span: Interval }[];
  liveRoots: string[];
  /** Merged spans of the transcripts that were read: when edits would have been logged. */
  coverage: Interval[];
  /** Spans of this repo's transcripts that couldn't be read: no commit in them may be human. */
  blind: Interval[];
  stats: { tooLarge: number; unavailable: number };
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

/**
 * Output metadata (model, branch, agentType): a short token that cannot carry a path. Rejects
 * absolute, home and drive-letter forms, `..` segments, and anything naming the home or temp dir.
 * Branch names such as `feature/x` pass.
 */
export function metaToken(v: unknown): string | undefined {
  if (typeof v !== 'string' || !SAFE_TOKEN.test(v)) return undefined;
  if (/^(\/|~|[A-Za-z]:)/.test(v) || v.split('/').includes('..')) return undefined;
  return PRIVATE_DIRS.some((d) => v.includes(d) || v.includes(d.slice(1))) ? undefined : v;
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

/** First allowlisted record carrying `cwd`, reading at most HEAD_CAP bytes. */
async function readHead(file: string): Promise<{ cwd: string; ts: number } | null> {
  if (!readable(file)) return null;
  const input = createReadStream(file, { end: HEAD_CAP - 1, highWaterMark: 16 << 10 });
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.includes('"cwd"') || DENIED_TYPE.test(line)) continue;
      const r = parseLine(line);
      const cwd = str(r?.['cwd']);
      const ts = Date.parse(str(r?.['timestamp']) ?? '');
      if (cwd && !Number.isNaN(ts)) return { cwd, ts };
    }
    return null;
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

/** Repo-relative POSIX path, preferring the root under which the path is known to git. */
function relativise(abs: string, roots: string[], known: Set<string>): string | null {
  let fallback: string | null = null;
  for (const root of roots) {
    if (abs === root || !under(abs, root)) continue;
    const rel = abs.slice(root.length + 1);
    if (rel.startsWith('.git/') || rel.split('/').includes('..')) return null;
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
 */
export async function discoverClaude(projectsDir: string, commonDir: string, worktreeRoots: string[],
  maxFileBytes = MAX_FILE): Promise<Discovery> {
  const liveRoots = worktreeRoots.flatMap((r) => (existsSync(r) ? [r, realpathSync(r)] : [r]));
  const belongs = async (cwd: string): Promise<boolean> => {
    if (!existsSync(cwd)) return liveRoots.some((r) => under(cwd, r));
    const real = realpathSync(cwd);
    const top = nearestCheckout(real);
    if (!top || !liveRoots.some((r) => under(real, r))) return false;
    if (liveRoots.includes(top)) return true;
    const out = await tryGit(gitRunner(real), ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    return out !== null && realpathSync(out.trim()) === commonDir;
  };
  const list = listTranscripts(projectsDir);
  // Thousands of small reads: overlap their latency, keeping results in listing order.
  const heads: ({ cwd: string; ts: number } | null)[] = new Array(list.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: READ_CONCURRENCY }, async () => {
    for (let i = next++; i < list.length; i = next++) heads[i] = await readHead(list[i]!.file).catch(() => null);
  }));
  const cwds = [...new Set(heads.flatMap((h) => (h ? [h.cwd] : [])))];
  const ours = new Set((await Promise.all(cwds.map(async (c) => ((await belongs(c)) ? [c] : [])))).flat());
  const d: Discovery = { transcripts: [], liveRoots, coverage: [], blind: [], stats: { tooLarge: 0, unavailable: 0 } };
  for (const [i, t] of list.entries()) {
    const head = heads[i];
    if (!head || !ours.has(head.cwd)) continue;
    let size = -1;
    try {
      size = statSync(t.file).size;
    } catch {
      // Deleted since its head was read: its span stays blind (below).
    }
    const last = size < 0 ? null : await readLastTs(t.file, size).catch(() => null);
    const span = { from: head.ts - COVERAGE_SLACK_MS, to: Math.max(last ?? head.ts, head.ts) + COVERAGE_SLACK_MS };
    if (size < 0) {
      d.blind.push(span);
      d.stats.unavailable++;
    } else if (size > maxFileBytes) {
      d.blind.push(span);
      d.stats.tooLarge++;
    } else d.transcripts.push({ ...t, cwd: head.cwd, span });
  }
  d.coverage = mergeIntervals(d.transcripts.map((t) => t.span));
  return d;
}

/** Parses this repo's transcripts through the allowlist into hashed edit events and sessions. */
export async function parseClaude(d: Discovery, knownPaths: Set<string>, hash: (line: string) => string): Promise<ClaudeIngest> {
  const out: ClaudeIngest = { events: [], sessions: new Map(), ranCommits: [], unreadable: [] };
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
    for (const line of text.split('\n')) {
      const isResult = line.includes('"toolUseResult"') && RESULT_KEYS.test(line);
      if (!isResult && !EDIT_CALL.test(line) && (model || !line.includes('"model"'))) continue;
      if (line.length > MAX_LINE || DENIED_TYPE.test(line)) continue;
      const r = parseLine(line);
      if (!r) continue;
      const uuid = str(r['uuid']);
      const resultTs = Date.parse(str(r['timestamp']) ?? '');
      if (r['type'] === 'assistant') {
        model ??= isObj(r['message']) ? metaToken(r['message']['model']) : undefined;
        if (uuid && !Number.isNaN(resultTs)) issuedAt.set(uuid, resultTs);
        continue;
      }
      const res = r['toolUseResult'];
      const sid = str(r['sessionId']);
      if (r['type'] !== 'user' || !isObj(res) || !sid || !uuid || Number.isNaN(resultTs)) continue;
      const callId = str(r['sourceToolAssistantUUID']) ?? str(r['parentUuid']);
      const ts = Math.min(resultTs, (callId && issuedAt.get(callId)) || resultTs);
      const agentId = meta ? (token(r['agentId']) ?? fileAgentId) : undefined;
      const key = sessionKey(TOOL, sid, agentId);
      const edits = editsOf(res);
      const shas = commitShasOf(res);
      if (edits.length === 0 && shas.length === 0) continue;
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
      for (const sha of shas) out.ranCommits.push({ sessionKey: key, sha });
      edits.forEach((e, i) => {
        const eventId = sha256Hex(`${TOOL}:${key}:${uuid}:${i}`).slice(0, 16);
        const path = e.filePath.startsWith('/') ? relativise(e.filePath, roots, knownPaths) : null;
        if (!path || seen.has(eventId)) return;
        seen.add(eventId);
        s.files.add(path);
        s.linesAdded += e.added.length;
        s.linesRemoved += e.removed;
        out.events.push({ eventId, sessionKey: key, ts, path, hashes: hashLines(e.added, hash) });
      });
    }
    if (model) for (const k of fileKeys) out.sessions.get(k)!.model ??= model;
  }
  return out;
}
