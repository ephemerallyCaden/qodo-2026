// Commet's Claude Code hook in `.claude/settings.local.json` (R7): one PostToolUse group that runs
// `commet hook event`. Only the local, uncommitted settings file is ever written, never
// settings.json. The group goes in as text, as the first entry of the innermost of
// `{ hooks: { PostToolUse: [...] } }` that already exists, so every other byte stays as it was.
// The command's marker records what install had to create (the file, `hooks`, `PostToolUse`, or
// nothing), so remove knows exactly what to take out and writes the original back byte for byte.
// A file reformatted since (Claude Code rewrites it when you allow a tool) is undone structurally
// instead, keeping every other key.
import { EDIT_TOOLS } from './event.js';

/** Marks a PostToolUse command as Commet's: a shell comment at its end, naming what install created. */
const COMMAND_MARK = '# commet:hook-event';
/** Commet's command: the CLI's `hook event`, then the marker; a user's command that only ends in the marker isn't. */
const MARKED = / hook event # commet:hook-event(?::(file|hooks|post))?$/;
const HOOK_TIMEOUT_S = 10;

type Created = 'file' | 'hooks' | 'post' | 'none';

interface HookGroup { matcher: string; hooks: { type: 'command'; command: string; timeout: number }[] }

/** The group Commet adds; `command` runs the CLI by absolute path (the plan shows it with placeholders). */
function hookGroup(command: string, created: Created): HookGroup {
  const mark = created === 'none' ? COMMAND_MARK : `${COMMAND_MARK}:${created}`;
  return { matcher: EDIT_TOOLS.join('|'), hooks: [{ type: 'command', command: `${command} hook event ${mark}`, timeout: HOOK_TIMEOUT_S }] };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isOurHook = (h: unknown) => isObj(h) && typeof h['command'] === 'string' && MARKED.test(h['command']);
const isOurs = (g: unknown) => isObj(g) && Array.isArray(g['hooks']) && g['hooks'].some(isOurHook);
const postOf = (v: unknown) => {
  const hooks = isObj(v) ? v['hooks'] : undefined;
  const post = isObj(hooks) ? hooks['PostToolUse'] : undefined;
  return Array.isArray(post) ? post : undefined;
};
/** The first Commet command in a PostToolUse list. */
function ourCommand(post: unknown[]): string | undefined {
  const group = post.find(isOurs) as { hooks: unknown[] } | undefined;
  return (group?.hooks.find(isOurHook) as { command: string } | undefined)?.command;
}

/** A JSON value's span in the text, with its members' (key start included) or items' spans. */
interface Node { start: number; end: number; members?: { key: string; at: number; value: Node }[]; items?: Node[] }

/** Spans of a JSON text JSON.parse already accepted. For a repeated key the last wins, as in JSON.parse. */
function spans(text: string): Node {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const string = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (): Node => {
    ws();
    const start = i;
    const c = text[i];
    if (c === '{' || c === '[') {
      i++;
      const node: Node = c === '{' ? { start, end: 0, members: [] } : { start, end: 0, items: [] };
      for (ws(); text[i] !== '}' && text[i] !== ']'; ws()) {
        if (text[i] === ',') i++;
        ws();
        if (node.members) {
          const at = i;
          const key = string();
          ws();
          i++; // the ':'
          node.members.push({ key, at, value: value() });
        } else node.items!.push(value());
      }
      node.end = ++i;
      return node;
    }
    if (c === '"') string();
    else while (i < text.length && !',]} \t\n\r'.includes(text[i]!)) i++;
    return { start, end: i };
  };
  return value();
}

const member = (n: Node | undefined, key: string) => n?.members?.findLast((m) => m.key === key)?.value;
/** Where a container's first entry starts (a member's key), if it has one. */
const firstAt = (n: Node) => n.members?.[0]?.at ?? n.items?.[0]?.start;
/** Leading whitespace of the line holding `pos`. */
const lineIndent = (text: string, pos: number) => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', pos - 1) + 1))![0];
/** The file's indent unit: the first indented line's indentation, else two spaces. */
const indentUnit = (text: string) => /\n([ \t]+)\S/.exec(text)?.[1] ?? '  ';
/** `v` pretty-printed in `unit` as it would sit at `indent`; compact when `unit` is ''. */
const pretty = (v: unknown, unit: string, indent: string) => JSON.stringify(v, null, unit).replace(/\n/g, `\n${indent}`);

type Install = { text: string; changed: boolean } | { error: string };

/** Why Commet won't edit this settings text, or the parsed value. */
function parseSettings(text: string): { v: Obj } | { error: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { error: 'is not valid JSON' };
  }
  if (!isObj(v)) return { error: 'is not a JSON object' };
  const hooks = v['hooks'];
  if (hooks !== undefined && !isObj(hooks)) return { error: 'has a "hooks" value that is not an object' };
  if (hooks?.['PostToolUse'] !== undefined && !Array.isArray(hooks['PostToolUse'])) return { error: 'has a "hooks.PostToolUse" value that is not a list' };
  return { v };
}

/**
 * The settings text with Commet's group (pure); `text` null when there's no file yet. A file
 * already holding the same group is unchanged, so installing twice changes nothing; an older
 * Commet group (another CLI path) is replaced. Text Commet can't edit safely is refused.
 */
export function installText(text: string | null, command: string): Install {
  if (text === null) return { text: JSON.stringify({ hooks: { PostToolUse: [hookGroup(command, 'file')] } }, null, 2) + '\n', changed: true };
  const parsed = parseSettings(text);
  if ('error' in parsed) return parsed;
  if (postOf(parsed.v)?.some(isOurs)) {
    const before = removeText(text);
    if (before === null || 'error' in before) return { error: 'holds a Commet hook that could not be taken out' };
    const again = installText(before.text, command);
    return 'error' in again ? again : { text: again.text, changed: again.text !== text };
  }
  return { text: insert(text, command), changed: true };
}

function insert(text: string, command: string): string {
  const top = spans(text);
  const hooks = member(top, 'hooks');
  const post = member(hooks, 'PostToolUse');
  // The innermost container that exists, and what goes in as its first entry.
  let into: Node;
  let entry: (unit: string, indent: string) => string;
  if (post) {
    into = post;
    entry = (u, ind) => pretty(hookGroup(command, 'none'), u, ind);
  } else if (hooks) {
    into = hooks;
    entry = (u, ind) => `"PostToolUse": ${pretty([hookGroup(command, 'post')], u, ind)}`;
  } else {
    into = top;
    entry = (u, ind) => `"hooks": ${pretty({ PostToolUse: [hookGroup(command, 'hooks')] }, u, ind)}`;
  }
  const at = into.start + 1;
  const first = firstAt(into);
  let add: string;
  if (first === undefined) {
    const outer = lineIndent(text, into.start);
    const unit = indentUnit(text);
    add = `\n${outer}${unit}${entry(unit, outer + unit)}\n${outer}`;
  } else {
    // The gap before the first entry says how entries are laid out: one per line, or inline.
    const gap = text.slice(at, first);
    const nl = gap.lastIndexOf('\n');
    add = nl < 0 ? `${entry('', '')},` : `\n${gap.slice(nl + 1)}${entry(indentUnit(text), gap.slice(nl + 1))},`;
  }
  return text.slice(0, at) + add + text.slice(at);
}

type Removal = { text: string | null; exact: boolean } | { error: string };

/**
 * The settings text without Commet's group (pure); `text: null` means the file was Commet's alone
 * and goes. Null when the text holds no Commet group. The original is the text with what install
 * added (as its marker says) cut back out, checked by installing again: when that gives exactly
 * this text, it's byte for byte the file install started from (`exact`). Otherwise (reformatted
 * since) the group is taken out structurally, with the containers install created if they're
 * empty, and the file is rewritten in its indent unit.
 */
export function removeText(text: string): Removal | null {
  const parsed = parseSettings(text);
  if ('error' in parsed) return parsed;
  const post = postOf(parsed.v);
  if (!post?.some(isOurs)) return null;
  const marked = ourCommand(post)!;
  // What install created, as its marker says, and the CLI command it ran.
  const created = (MARKED.exec(marked)![1] as Created | undefined) ?? 'none';
  const command = marked.replace(MARKED, '');
  if (created === 'file') {
    const fresh = installText(null, command);
    if (!('error' in fresh) && fresh.text === text) return { text: null, exact: true };
  } else {
    const top = spans(text);
    const hooks = member(top, 'hooks')!;
    const into = created === 'hooks' ? top : created === 'post' ? hooks : member(hooks, 'PostToolUse')!;
    const child = created === 'none' ? into.items?.[0] : into.members?.[0];
    const childEnd = child && ('value' in child ? child.value.end : child.end);
    const childKey = child && 'key' in child ? child.key : undefined;
    if (childEnd !== undefined && (created === 'none' || childKey === (created === 'hooks' ? 'hooks' : 'PostToolUse'))) {
      // Install added the entry right after the opening bracket, then a comma or a line break.
      for (let end = childEnd; end < into.end; end++) {
        if (!/^\s*,?\s*$/.test(text.slice(childEnd, end))) break;
        const before = text.slice(0, into.start + 1) + text.slice(end);
        const redo = parseSettings(before);
        if ('error' in redo || postOf(redo.v)?.some(isOurs)) continue;
        const again = installText(before, command);
        if (!('error' in again) && again.text === text) return { text: before, exact: true };
      }
    }
  }
  return structural(parsed.v, created, indentUnit(text), text.endsWith('\n'));
}

function structural(v: Obj, created: Created, unit: string, newline: boolean): Removal {
  const hooks = v['hooks'] as Obj;
  const kept = (hooks['PostToolUse'] as unknown[]).flatMap((g) => {
    if (!isOurs(g)) return [g];
    const rest = ((g as Obj)['hooks'] as unknown[]).filter((h) => !isOurHook(h));
    return rest.length > 0 ? [{ ...(g as Obj), hooks: rest }] : [];
  });
  hooks['PostToolUse'] = kept;
  if (kept.length === 0 && created !== 'none') delete hooks['PostToolUse'];
  if (Object.keys(hooks).length === 0 && (created === 'hooks' || created === 'file')) delete v['hooks'];
  if (Object.keys(v).length === 0 && created === 'file') return { text: null, exact: false };
  return { text: JSON.stringify(v, null, unit) + (newline ? '\n' : ''), exact: false };
}

/** Commet's group as the plan shows it, with the command's paths as placeholders. */
export function shownGroup(command: string): string {
  return JSON.stringify(hookGroup(command, 'none'), null, 2);
}
