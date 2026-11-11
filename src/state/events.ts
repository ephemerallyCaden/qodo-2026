// The hook event log (R7, design §4): `<git-common-dir>/commet/events.jsonl`, appended by
// `commet hook event`, one record per line in compact canonical JSON (keys sorted), mode 0600.
// Records hold hashes and allowlisted metadata only: repo-relative paths, HMAC line hashes, the
// session key (never a raw session id), tokens. No code, prompt, cwd or absolute path (Rule 2).
//
// The same edit can be recorded more than once: Claude Code runs every matching hook, and other
// agents (Copilot, Devin, Continue) read Claude-format hooks too (agent-providers.md). So the
// reader keys records by (session key, event id) and counts each event once.
import { byCodepoint, canonicalJson } from '../core/canonical-json.js';
import type { IsoUtc, SessionKey, Tool } from '../core/snapshot/types.js';
import { isoUtc } from '../core/time.js';
import { appendStateLines, readStateBytes } from './io.js';

export const EVENTS_FILE = 'events.jsonl';

export interface EditHunk {
  oldStart: number; oldLines: number; newStart: number; newLines: number;
  /** HMAC-SHA256(key, normalised line)[:16] of the countable added and removed lines. */
  addedHashes: string[]; removedHashes: string[];
}

/** One edit an agent made, as a hook saw it (`commet.edit/1`, design §4). */
export interface AgentEditEvent {
  schema: 'commet.edit/1';
  /** sha256('<tool>:<sessionKey>:<toolUseId>:<i>')[:16]: the same tool use always gets the same id. */
  eventId: string;
  tool: Tool;
  sessionKey: SessionKey;
  parentSessionKey?: SessionKey;
  agentType?: string;
  ts: IsoUtc;
  repoId: string;
  branch?: string;
  headSha?: string;
  /** Repo-relative POSIX path. */
  path: string;
  op: 'create' | 'update';
  capture: 'hook';
  source: 'hook';
  hunks: EditHunk[];
}

/** Why a hook call recorded no edit it may have made: kept as a counted record, never a silent drop (Rule 1). */
export type DropReason = 'not_claude_code' | 'malformed' | 'unplaceable' | 'too_large';
export interface DropRecord { schema: 'commet.drop/1'; ts: IsoUtc; reason: DropReason }
export const dropRecord = (reason: DropReason, nowMs: number): DropRecord => ({ schema: 'commet.drop/1', ts: isoUtc(nowMs), reason });

const DROP_REASONS = new Set<string>(['not_claude_code', 'malformed', 'unplaceable', 'too_large']);
const HASH = /^[0-9a-f]{16}$/;
const SESSION_KEY = /^s_[0-9a-f]{14}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TOKEN = /^[\w.:@+/-]{1,128}$/;
const EVENT_KEYS = new Set(['schema', 'eventId', 'tool', 'sessionKey', 'parentSessionKey', 'agentType', 'ts', 'repoId', 'branch',
  'headSha', 'path', 'op', 'capture', 'source', 'hunks']);
const HUNK_KEYS = new Set(['oldStart', 'oldLines', 'newStart', 'newLines', 'addedHashes', 'removedHashes']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const hashes = (v: unknown) => Array.isArray(v) && v.every((h) => typeof h === 'string' && HASH.test(h));
const optional = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);
const str = (re: RegExp) => (v: unknown) => typeof v === 'string' && re.test(v);
/** A repo-relative POSIX path: no leading `/`, drive or `~`, no `.`/`..` segment, no `.git/` internals. */
const isRepoPath = (p: unknown): p is string => typeof p === 'string' && p !== '' && !/^(?:\/|~|[A-Za-z]:)/.test(p)
  && !p.includes('\\') && !p.includes('\0') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..') && p.split('/')[0] !== '.git';

const isHunk = (h: unknown) => isObj(h) && Object.keys(h).every((k) => HUNK_KEYS.has(k))
  && count(h['oldStart']) && count(h['oldLines']) && count(h['newStart']) && count(h['newLines'])
  && hashes(h['addedHashes']) && hashes(h['removedHashes']);

/** The record as an edit event, or null when it isn't a well-formed one (only allowlisted keys and shapes). */
function asEvent(v: unknown): AgentEditEvent | null {
  if (!isObj(v) || v['schema'] !== 'commet.edit/1' || !Object.keys(v).every((k) => EVENT_KEYS.has(k))) return null;
  const ok = str(HASH)(v['eventId']) && v['tool'] === 'claude-code' && str(SESSION_KEY)(v['sessionKey'])
    && optional(v['parentSessionKey'], str(SESSION_KEY)) && optional(v['agentType'], str(TOKEN)) && str(ISO)(v['ts'])
    && str(HASH)(v['repoId']) && optional(v['branch'], str(TOKEN)) && optional(v['headSha'], str(SHA)) && isRepoPath(v['path'])
    && (v['op'] === 'create' || v['op'] === 'update') && v['capture'] === 'hook' && v['source'] === 'hook'
    && Array.isArray(v['hunks']) && v['hunks'].every(isHunk);
  return ok ? (v as unknown as AgentEditEvent) : null;
}

const isDrop = (v: unknown): v is DropRecord => isObj(v) && v['schema'] === 'commet.drop/1' && str(ISO)(v['ts'])
  && typeof v['reason'] === 'string' && DROP_REASONS.has(v['reason']) && Object.keys(v).length === 3;

/** One record as a line: canonical JSON (sorted keys, integers only) without the indentation. */
function eventLine(record: AgentEditEvent | DropRecord): string {
  // JSON.parse keeps canonicalJson's sorted key order (no key here is an integer-like string).
  return JSON.stringify(JSON.parse(canonicalJson(record))) + '\n';
}

/** Appends records to the log through the state I/O, in one write. */
export function appendEvents(dir: string, records: (AgentEditEvent | DropRecord)[]): void {
  if (records.length > 0) appendStateLines(dir, EVENTS_FILE, records.map(eventLine).join(''));
}

export interface EventLog {
  /** Each event once, sorted by (ts, eventId). */
  events: AgentEditEvent[];
  /** Records naming an event already counted: the same (session key, event id) recorded again. */
  duplicates: number;
  /** Hook calls that may have held an edit but recorded none (drop records), plus unreadable lines. */
  dropped: number;
}

/**
 * Reads the log, counting every event once by (session key, event id), however many times and in
 * whatever order it was recorded: of two records with one key, the smaller line wins, so the
 * result never depends on line order. Malformed lines (a cut-off write, a foreign record) count as
 * dropped, never silently skipped. An absent log is empty; a symlinked or damaged file is exit 5.
 */
export async function readEvents(dir: string): Promise<EventLog> {
  const text = (await readStateBytes(dir, EVENTS_FILE))?.toString('utf8') ?? '';
  const byKey = new Map<string, { line: string; event: AgentEditEvent }>();
  let records = 0;
  let dropped = 0;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      dropped++;
      continue;
    }
    if (isDrop(v)) {
      dropped++;
      continue;
    }
    const event = asEvent(v);
    if (!event) {
      dropped++;
      continue;
    }
    records++;
    const key = `${event.sessionKey}\0${event.eventId}`;
    const seen = byKey.get(key);
    if (!seen || byCodepoint(line, seen.line) < 0) byKey.set(key, { line, event });
  }
  const events = [...byKey.values()].map((e) => e.event)
    .sort((a, b) => byCodepoint(a.ts, b.ts) || byCodepoint(a.eventId, b.eventId) || byCodepoint(a.sessionKey, b.sessionKey));
  return { events, duplicates: records - events.length, dropped };
}
