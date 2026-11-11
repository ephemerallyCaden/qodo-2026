// Commet's git hooks (R7, design §8): post-commit and post-merge refresh the snapshot in the
// background. An existing hook is chained, never replaced: it's renamed to `<hook>.commet-chained`
// and run first, and its exit code is the hook's. `remove` renames it back, so its bytes and mode
// come back exactly. Hooks are only written inside this repo's git dir (see hooksTarget).
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { tryGit, type Git } from '../scan/git.js';

export const GIT_HOOKS = ['post-commit', 'post-merge'] as const;
export type GitHookName = (typeof GIT_HOOKS)[number];
export const CHAINED = '.commet-chained';
/** The second line of every hook Commet writes: how install and remove recognise their own. */
export const HOOK_MARK = '# commet-hook 1: added by `commet hook install`; `commet hook remove` puts back the hook it replaced.';
/** Largest hook file read to look for HOOK_MARK; Commet's own is far smaller. */
const MAX_HOOK_BYTES = 64 << 10;

/** A shell word that stays literal (single-quoted). */
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The hook script. `node` and `cli` are absolute paths (shown to the user as placeholders, never
 * printed): when they're gone, `commet` on PATH is used, and with neither the hook only runs the
 * chained one. The refresh runs detached with its output discarded, so the commit never waits.
 */
export function hookScript(name: GitHookName, node: string, cli: string): string {
  return `#!/bin/sh
${HOOK_MARK}
# It runs the hook it replaced first (${name}${CHAINED}), keeps that hook's exit code, then
# refreshes Commet's snapshot in the background.
commet_status=0
if [ -x "$0${CHAINED}" ]; then
  "$0${CHAINED}" "$@"
  commet_status=$?
fi
commet_node=${shellQuote(node)}
commet_cli=${shellQuote(cli)}
if [ -x "$commet_node" ] && [ -f "$commet_cli" ]; then
  set -- "$commet_node" "$commet_cli"
elif command -v commet >/dev/null 2>&1; then
  set -- commet
else
  exit "$commet_status"
fi
(unset GIT_INDEX_FILE; "$@" hook refresh </dev/null >/dev/null 2>&1 &)
exit "$commet_status"
`;
}

export type HooksTarget = { dir: string; label: string } | { refused: string };

/** The nearest existing ancestor's real path, plus the rest: a path's real form before it exists. */
function realish(p: string): string {
  const rest: string[] = [];
  for (let at = p; ; at = dirname(at)) {
    try {
      return join(realpathSync.native(at), ...rest.reverse());
    } catch {
      if (dirname(at) === at) return p;
      rest.push(basename(at));
    }
  }
}

/**
 * Where git runs this repo's hooks (`--git-path hooks`, so core.hooksPath and worktrees are
 * honoured: a worktree's hooks are the common dir's). Commet writes there only when it's inside
 * the repo's git common dir. A core.hooksPath outside it can be shared by other repos (a global or
 * system hooks dir), and one in the work tree can be committed or owned by a hook manager (husky
 * finds its hook by `$0`, which chaining renames), so both are refused with the reason.
 */
export async function hooksTarget(git: Git, commonDir: string): Promise<HooksTarget> {
  const out = await tryGit(git, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  if (out === null) return { refused: 'git could not say where this repository\'s hooks are' };
  const dir = realish(out.replace(/\n$/, ''));
  const rel = relative(commonDir, dir);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    const top = (await tryGit(git, ['rev-parse', '--show-toplevel']))?.replace(/\n$/, '');
    const inTree = top !== undefined && top !== '' && !relative(realish(top), dir).startsWith('..');
    return { refused: inTree
      ? 'core.hooksPath points into the work tree, where hooks can be committed or belong to a hook manager; add `commet hook refresh` to that hook yourself'
      : 'core.hooksPath points outside this repository, so a hook there would also run for other repositories. '
        + 'Still available: `commet hook install --claude-only` records agent sessions, and `commet scan` refreshes the snapshot by hand '
        + '(or add `commet hook refresh` to that hook yourself)' };
  }
  return { dir, label: rel === '' ? '<git-common-dir>' : `<git-common-dir>/${rel.split(sep).join('/')}` };
}

type Entry = { kind: 'absent' } | { kind: 'ours'; text: string } | { kind: 'other' } | { kind: 'unusable' };

function entry(file: string): Entry {
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
    throw e;
  }
  // A symlinked hook is another tool's: it's chained like any other (the link itself is moved).
  if (st.isSymbolicLink()) return { kind: 'other' };
  if (!st.isFile()) return { kind: 'unusable' };
  if (st.size > MAX_HOOK_BYTES) return { kind: 'other' };
  const text = readFileSync(file, 'utf8');
  return text.split('\n')[1] === HOOK_MARK ? { kind: 'ours', text } : { kind: 'other' };
}

export type HookStep =
  | { hook: GitHookName; action: 'write' | 'chain-and-write' | 'rewrite'; script: string }
  | { hook: GitHookName; action: 'unchanged' }
  | { hook: GitHookName; action: 'conflict'; why: string };

/** What install would do to each hook, without touching anything. */
export function planInstall(dir: string, node: string, cli: string): HookStep[] {
  return GIT_HOOKS.map((hook): HookStep => {
    const script = hookScript(hook, node, cli);
    const target = entry(join(dir, hook));
    const chained = entry(join(dir, hook + CHAINED)).kind !== 'absent';
    if (target.kind === 'unusable') return { hook, action: 'conflict', why: `${hook} is not a file` };
    if (target.kind === 'ours') return target.text === script ? { hook, action: 'unchanged' } : { hook, action: 'rewrite', script };
    if (chained) {
      return { hook, action: 'conflict', why: `${hook}${CHAINED} is already there but ${hook} isn't Commet's; move one of them away first` };
    }
    return { hook, action: target.kind === 'absent' ? 'write' : 'chain-and-write', script };
  });
}

/**
 * Writes the planned hooks. The new script is staged beside the target first (exclusive create,
 * mode 0755), so a failure before the rename leaves the original where it was; a failed final
 * rename moves the original back.
 */
export function applyInstall(dir: string, steps: HookStep[]): void {
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  for (const step of steps) {
    if (step.action !== 'write' && step.action !== 'chain-and-write' && step.action !== 'rewrite') continue;
    const target = join(dir, step.hook);
    const staged = join(dir, `.${step.hook}.commet-${process.pid}`);
    rmSync(staged, { force: true });
    writeFileSync(staged, step.script, { mode: 0o755, flag: 'wx' });
    try {
      if (step.action === 'chain-and-write') renameSync(target, target + CHAINED);
      try {
        renameSync(staged, target);
      } catch (e) {
        if (step.action === 'chain-and-write') renameSync(target + CHAINED, target);
        throw e;
      }
    } finally {
      rmSync(staged, { force: true });
    }
  }
}

export type RemoveStep =
  | { hook: GitHookName; action: 'restore' | 'delete' | 'none' }
  | { hook: GitHookName; action: 'leave'; why: string };

/** What remove would do: only a hook carrying HOOK_MARK is Commet's to undo. */
export function planRemove(dir: string): RemoveStep[] {
  return GIT_HOOKS.map((hook): RemoveStep => {
    const target = entry(join(dir, hook));
    const chained = entry(join(dir, hook + CHAINED)).kind !== 'absent';
    if (target.kind === 'ours') return { hook, action: chained ? 'restore' : 'delete' };
    if (chained) return { hook, action: 'leave', why: `${hook} is no longer Commet's, so ${hook}${CHAINED} was left as it is` };
    return { hook, action: 'none' };
  });
}

/**
 * Undoes install: the chained hook is renamed back over Commet's (bytes and mode as they were).
 * A hooks dir left empty is taken away too (install creates one only when there was none; git
 * treats an empty hooks dir and a missing one alike).
 */
export function applyRemove(dir: string, steps: RemoveStep[]): void {
  let changed = false;
  for (const step of steps) {
    const target = join(dir, step.hook);
    if (step.action === 'restore') renameSync(target + CHAINED, target);
    else if (step.action === 'delete') rmSync(target);
    else continue;
    changed = true;
  }
  if (!changed) return;
  try {
    rmdirSync(dir);
  } catch {
    // Not empty: other hooks live there.
  }
}
