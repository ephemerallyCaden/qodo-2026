// `commet hook event` (R7): turns one Claude Code PostToolUse payload into edit events, hashing
// every line as it's read. Privacy (Rule 2, design §6): only the fields named here are read.
// `tool_input` (old and new strings), `originalFile`, prompts and `cwd` are never touched;
// `transcript_path` is only shape-tested, then discarded. No path, code or text leaves this module
// except repo-relative paths, HMAC hashes and allowlisted tokens.
import { basename, dirname } from 'node:path';
import { metaToken } from '../attrib/parsers/claude.js';
import { sessionKey, sha256Hex } from '../core/hash.js';
import { hashLines } from '../core/lines.js';
import { isoUtc } from '../core/time.js';
import { dropRecord, type AgentEditEvent, type DropReason, type DropRecord, type EditHunk } from '../state/events.js';

const TOOL = 'claude-code';
/** The edit tools the hook is registered for (its matcher); their results carry structuredPatch. */
export const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write'] as const;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Claude Code's tool-use ids (Anthropic API `toolu_…`, Bedrock `toolu_bdrk_…`). */
const TOOL_USE_ID = /^toolu_[A-Za-z0-9_-]{1,128}$/;
const AGENT_ID = /^[\w-]{1,64}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** Where this repo is, and how to place an absolute path in it. */
export interface EventContext {
  /** Repo-relative POSIX path of an absolute file path in this repo; null when it's outside the repo; 'unplaceable' when inside but not placeable. */
  place: (absPath: string) => string | null | 'unplaceable';
  hash: (line: string) => string;
  repoId: string;
  /** The checked-out branch as git names it; kept only when it's a safe token (metaToken). */
  branch: string | undefined;
  headSha: string | undefined;
  nowMs: number;
}

/**
 * Whether the payload is Claude Code's: other agents (Copilot, Devin, Continue) run Claude-format
 * hooks too, so the tool comes from the payload, never from where the hook is installed
 * (agent-providers.md): a UUID session id, an Anthropic tool-use id, and a transcript named after
 * the session under Claude's `projects/<slug>/` (a subagent's under `<session>/subagents/`).
 */
function isClaudeCode(p: Obj, sid: string): boolean {
  const tp = p['transcript_path'];
  if (typeof tp !== 'string' || !TOOL_USE_ID.test(String(p['tool_use_id']))) return false;
  const file = tp.replace(/\\/g, '/');
  const dir = dirname(file);
  if (basename(file) === `${sid}.jsonl`) return basename(dirname(dir)) === 'projects';
  return /^agent-[\w-]+\.jsonl$/.test(basename(file)) && basename(dir) === 'subagents' && basename(dirname(dir)) === sid
    && basename(dirname(dirname(dirname(dir)))) === 'projects';
}

/** structuredPatch hunks, or null when one is malformed. Line text is hashed here and dropped. */
function hunksOf(patch: unknown[], hash: (line: string) => string): EditHunk[] | null {
  const out: EditHunk[] = [];
  for (const h of patch) {
    if (!isObj(h) || !count(h['oldStart']) || !count(h['oldLines']) || !count(h['newStart']) || !count(h['newLines'])
      || !Array.isArray(h['lines']) || !h['lines'].every((l) => typeof l === 'string')) return null;
    const lines = h['lines'] as string[];
    out.push({ oldStart: h['oldStart'], oldLines: h['oldLines'], newStart: h['newStart'], newLines: h['newLines'],
      addedHashes: hashLines(lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1)), hash),
      removedHashes: hashLines(lines.filter((l) => l.startsWith('-')).map((l) => l.slice(1)), hash) });
  }
  return out;
}

/**
 * The records one PostToolUse payload makes: its edit event, or a drop record when the payload
 * isn't Claude Code's, is malformed, or edits this repo at a path that can't be placed (a counted
 * drop, Rule 1). One that isn't a registered edit tool, makes no change, or edits a file outside
 * this repo makes none.
 */
export function eventsFromPayload(payload: unknown, ctx: EventContext): (AgentEditEvent | DropRecord)[] {
  const drop = (reason: DropReason) => [dropRecord(reason, ctx.nowMs)];
  if (!isObj(payload)) return drop('malformed');
  if (payload['hook_event_name'] !== 'PostToolUse') return [];
  const toolName = payload['tool_name'];
  if (typeof toolName !== 'string' || !(EDIT_TOOLS as readonly string[]).includes(toolName)) return [];
  const sid = payload['session_id'];
  if (typeof sid !== 'string' || !SESSION_ID.test(sid) || !isClaudeCode(payload, sid)) return drop('not_claude_code');
  const res = payload['tool_response'];
  if (!isObj(res) || typeof res['filePath'] !== 'string' || res['filePath'] === '') return drop('malformed');
  const patch = res['structuredPatch'];
  let hunks: EditHunk[] | null;
  if (Array.isArray(patch) && patch.length > 0) hunks = hunksOf(patch, ctx.hash);
  else if (toolName === 'Write' && res['type'] === 'create' && typeof res['content'] === 'string') {
    // Write-create results carry the new file in `content` with an empty structuredPatch (probed).
    const lines = res['content'].split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    hunks = lines.length === 0 ? [] : [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length,
      addedHashes: hashLines(lines, ctx.hash), removedHashes: [] }];
  } else if (Array.isArray(patch)) hunks = [];
  else return drop('malformed');
  if (hunks === null) return drop('malformed');
  if (hunks.length === 0) return [];
  const path = ctx.place(res['filePath']);
  if (path === null) return [];
  if (path === 'unplaceable') return drop('unplaceable');
  const agentId = typeof payload['agent_id'] === 'string' && AGENT_ID.test(payload['agent_id']) ? payload['agent_id'] : undefined;
  const key = sessionKey(TOOL, sid, agentId);
  const event: AgentEditEvent = {
    schema: 'commet.edit/1', eventId: sha256Hex(`${TOOL}:${key}:${String(payload['tool_use_id'])}:0`).slice(0, 16), tool: TOOL,
    sessionKey: key, ts: isoUtc(ctx.nowMs), repoId: ctx.repoId, path, op: res['type'] === 'create' ? 'create' : 'update',
    capture: 'hook', source: 'hook', hunks,
  };
  if (agentId) event.parentSessionKey = sessionKey(TOOL, sid);
  const agentType = metaToken(payload['agent_type']);
  if (agentId && agentType) event.agentType = agentType;
  const branch = metaToken(ctx.branch);
  if (branch) event.branch = branch;
  if (ctx.headSha) event.headSha = ctx.headSha;
  return [event];
}
