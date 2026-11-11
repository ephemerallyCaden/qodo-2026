// `commet hook install | remove` (R7, design §8), and the two commands the hooks run: `hook event`
// (Claude Code's PostToolUse hook) and `hook refresh` (the git hooks). Install shows exactly what it
// will write and where, and asks; without a terminal it writes only with --yes. Absolute paths (the
// CLI's, the repo's) are written into the hooks but never printed: the plan shows placeholders.
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommetError, EXIT } from '../core/errors.js';
import { lineHasher, sha256Hex } from '../core/hash.js';
import { installText, removeText, shownGroup } from '../hooks/claude-settings.js';
import { eventsFromPayload } from '../hooks/event.js';
import {
  applyInstall, applyRemove, CHAINED, hookScript, hooksTarget, planInstall, planRemove, shellQuote, type HookStep, type RemoveStep,
} from '../hooks/git-hooks.js';
import { coalescedRefresh } from '../hooks/refresh.js';
import { gitRunner, tryGit, type Git } from '../scan/git.js';
import { repoIdOf, worktreePaths } from '../scan/repo.js';
import { appendEvents, dropRecord } from '../state/events.js';
import { stateDir, writeAtomic } from '../state/io.js';
import { loadOrCreateKey } from '../state/key.js';
import type { Io } from './main.js';

export const HOOK_USAGE = '       commet hook install [--yes] [--git-only | --claude-only]\n'
  + '       commet hook remove [--git-only | --claude-only]\n'
  + '  hook install adds git post-commit/post-merge hooks (refresh the snapshot) and a Claude Code hook in\n'
  + '               .claude/settings.local.json (records edit hashes to .git/commet/events.jsonl); it asks first,\n'
  + '               and without a terminal installs only with --yes (exit 7: not confirmed, nothing written)\n';

const SETTINGS = '.claude/settings.local.json';
/** Largest settings.local.json Commet edits. */
const MAX_SETTINGS_BYTES = 1 << 20;
/** Largest PostToolUse payload read; a bigger one (an edit to a huge file) is a counted drop. */
const MAX_PAYLOAD_BYTES = 32 << 20;

/** Where the hooks run the CLI from: this node and this package's dist/cli.js (overridable for tests). */
export interface HookPaths { node: string; cli: string }
const defaultPaths = (): HookPaths => ({ node: process.execPath, cli: fileURLToPath(new URL('../cli.js', import.meta.url)) });

interface Parts { git: boolean; claude: boolean; yes: boolean }

function parseFlags(args: string[], allowYes: boolean): Parts | string {
  const o: Parts = { git: true, claude: true, yes: false };
  for (const a of args) {
    if (a === '--yes' && allowYes) o.yes = true;
    else if (a === '--git-only' && o.claude && o.git) o.claude = false;
    else if (a === '--claude-only' && o.claude && o.git) o.git = false;
    else if (a === '--git-only' || a === '--claude-only') return '--git-only and --claude-only can\'t be combined';
    else return `unknown option ${JSON.stringify(a)}`;
  }
  return o;
}

interface Repo { git: Git; commonDir: string; top: string | null }

async function openRepo(cwd: string): Promise<Repo> {
  const git = gitRunner(cwd);
  // One call in a work tree; a bare repo has no top level, so git refuses both and only the common dir is asked again.
  const both = await tryGit(git, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel']);
  const [common, top = ''] = (both ?? await tryGit(git, ['rev-parse', '--path-format=absolute', '--git-common-dir']) ?? '').split('\n');
  if (!common) throw new CommetError('not inside a git repository', EXIT.noRepo);
  return { git, commonDir: realpathSync.native(common), top: top ? realpathSync.native(top) : null };
}

/** The settings file as it stands: its text (null when absent), or why Commet won't touch it. */
interface SettingsFile { file: string; dir: string; text: string | null; mode: number; ignored: boolean }

async function readSettings(repo: Repo): Promise<SettingsFile | { refused: string }> {
  if (repo.top === null) return { refused: 'this repository has no work tree, so there is no .claude/settings.local.json' };
  const dir = join(repo.top, '.claude');
  const file = join(dir, 'settings.local.json');
  const dirSt = lstatSync(dir, { throwIfNoEntry: false });
  if (dirSt && !dirSt.isDirectory()) return { refused: '.claude is not a folder (or is a symlink); Commet won\'t write through it' };
  const st = lstatSync(file, { throwIfNoEntry: false });
  if (st && !st.isFile()) return { refused: `${SETTINGS} is not a regular file (or is a symlink); Commet won't write through it` };
  if (st && st.size > MAX_SETTINGS_BYTES) return { refused: `${SETTINGS} is larger than 1 MiB` };
  const git = gitRunner(repo.top);
  if ((await tryGit(git, ['ls-files', '--error-unmatch', '--', SETTINGS])) !== null) {
    return { refused: `${SETTINGS} is committed to this repository; Commet only writes it while it stays local` };
  }
  const ignored = (await tryGit(git, ['check-ignore', '-q', '--', SETTINGS])) !== null;
  return { file, dir, text: st ? readFileSync(file, 'utf8') : null, mode: st ? st.mode & 0o777 : 0o600, ignored };
}

const indent = (text: string) => text.replace(/\n$/, '').split('\n').map((l) => `  | ${l}`).join('\n') + '\n';
const confirmed = (answer: string | null) => answer !== null && /^\s*y(es)?\s*$/i.test(answer);

async function install(args: string[], io: Io, paths: HookPaths): Promise<number> {
  const flags = parseFlags(args, true);
  if (typeof flags === 'string') return usage(io, flags);
  const repo = await openRepo(io.cwd);
  const command = `${shellQuote(paths.node)} ${shellQuote(paths.cli)}`;
  const refusals: string[] = [];
  const lines: string[] = [];
  let gitPlan: { dir: string; steps: HookStep[] } | null = null;
  if (flags.git) {
    const target = await hooksTarget(repo.git, repo.commonDir);
    if ('refused' in target) refusals.push(`git hooks: ${target.refused}`);
    else {
      const steps = planInstall(target.dir, paths.node, paths.cli);
      for (const s of steps) {
        const where = `${target.label}/${s.hook}`;
        if (s.action === 'conflict') refusals.push(`${where}: ${s.why}`);
        else if (s.action === 'write') lines.push(`${where}: new hook`);
        else if (s.action === 'chain-and-write') lines.push(`${where}: your hook moves to ${s.hook}${CHAINED} and still runs first, its exit code kept`);
        else if (s.action === 'rewrite') lines.push(`${where}: Commet's hook updated (the CLI moved)`);
      }
      gitPlan = { dir: target.dir, steps: steps.filter((s) => s.action !== 'unchanged') };
    }
  }
  let claudePlan: { settings: SettingsFile; text: string } | null = null;
  if (flags.claude) {
    const settings = await readSettings(repo);
    if ('refused' in settings) refusals.push(`Claude Code hook: ${settings.refused}`);
    else {
      const next = installText(settings.text, command);
      if ('error' in next) refusals.push(`Claude Code hook: ${SETTINGS} ${next.error}; Commet won't edit it`);
      else if (next.changed) {
        lines.push(`${SETTINGS} (this worktree): ${settings.text === null ? 'new file with' : 'adds'} one PostToolUse hook; every other setting stays`);
        if (!settings.ignored) lines.push(`  note: ${SETTINGS} isn't gitignored; add it to .gitignore so it is never committed`);
        claudePlan = { settings, text: next.text };
      }
    }
  }
  if (refusals.length > 0) {
    const other = flags.git && flags.claude ? ' (install one part alone with --git-only or --claude-only)' : '';
    io.stderr(`commet: hook install refused, nothing was written${other}:\n${refusals.map((r) => `  ${r}\n`).join('')}`);
    return EXIT.usage;
  }
  const gitWrites = (gitPlan?.steps.length ?? 0) > 0;
  if (!gitWrites && !claudePlan) {
    io.stdout('commet hooks are already installed; nothing to change\n');
    return 0;
  }
  let plan = `commet hook install will write:\n${lines.map((l) => `  ${l}\n`).join('')}`;
  if (gitWrites) {
    plan += '\nThe git hook (<node> and <commet> stand for the absolute paths written into it); it refreshes the snapshot\n'
      + 'in the background and never blocks the commit:\n' + indent(hookScript('post-commit', '<node>', '<commet>'));
  }
  if (claudePlan) {
    plan += '\nThe Claude Code hook; it records which lines an edit added, as hashes only (never code, prompts or paths\n'
      + 'outside the repo), to <git-common-dir>/commet/events.jsonl:\n' + indent(shownGroup("'<node>' '<commet>'"));
  }
  io.stdout(plan);
  if (!flags.yes) {
    if (!io.ask) {
      io.stderr('commet: not installed: there is no terminal to ask; run `commet hook install --yes` to install without asking\n');
      return EXIT.declined;
    }
    if (!confirmed(await io.ask('Install? [y/N] '))) {
      io.stdout('not installed; nothing was written\n');
      return EXIT.declined;
    }
  }
  if (gitPlan) applyInstall(gitPlan.dir, gitPlan.steps);
  if (claudePlan) {
    const { settings, text } = claudePlan;
    // readSettings refused anything at .claude but a real folder, so this only makes a missing one.
    mkdirSync(settings.dir, { recursive: true, mode: 0o755 });
    writeAtomic(settings.file, text, settings.mode);
  }
  io.stdout('installed; undo with `commet hook remove`\n');
  return 0;
}

async function remove(args: string[], io: Io): Promise<number> {
  const flags = parseFlags(args, false);
  if (typeof flags === 'string') return usage(io, flags);
  const repo = await openRepo(io.cwd);
  const done: string[] = [];
  const notes: string[] = [];
  if (flags.git) {
    // The hooks dir git uses now, and the default one, in case core.hooksPath changed since install.
    const target = await hooksTarget(repo.git, repo.commonDir);
    const dirs = new Map<string, string>([[join(repo.commonDir, 'hooks'), '<git-common-dir>/hooks']]);
    if (!('refused' in target)) dirs.set(target.dir, target.label);
    for (const [dir, label] of dirs) {
      const steps: RemoveStep[] = planRemove(dir);
      for (const s of steps) {
        if (s.action === 'restore') done.push(`${label}/${s.hook}: your hook is back as it was`);
        else if (s.action === 'delete') done.push(`${label}/${s.hook}: Commet's hook removed`);
        else if (s.action === 'leave') notes.push(`${label}/${s.hook}: ${s.why}`);
      }
      applyRemove(dir, steps);
    }
  }
  if (flags.claude) {
    const settings = await readSettings(repo);
    if ('refused' in settings) {
      if (repo.top !== null) notes.push(`${SETTINGS}: left alone: ${settings.refused}`);
    } else if (settings.text !== null) {
      const before = removeText(settings.text);
      if (before !== null && 'error' in before) notes.push(`${SETTINGS}: left alone: it ${before.error}`);
      else if (before !== null) {
        if (before.text === null) {
          rmSync(settings.file);
          try {
            rmdirSync(settings.dir);
          } catch {
            // Other files live in .claude.
          }
        } else writeAtomic(settings.file, before.text, settings.mode);
        done.push(`${SETTINGS}: Commet's hook taken out; ${before.exact ? 'every other byte of the file is as it was'
          : 'the file was reformatted since install, so it was rewritten with every other setting kept'}`);
      }
    }
  }
  io.stdout(done.length === 0 ? 'no Commet hooks are installed; nothing to remove\n' : `removed:\n${done.map((d) => `  ${d}\n`).join('')}`);
  if (notes.length > 0) io.stdout(notes.map((n) => `  note: ${n}\n`).join(''));
  return 0;
}

/** Reads stdin up to `max` bytes; the rest is drained so the writer never blocks. */
async function readCapped(input: NodeJS.ReadableStream, max: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const b = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += b.length;
    if (size <= max) chunks.push(b);
  }
  return size <= max ? Buffer.concat(chunks) : null;
}

/**
 * `commet hook event`: records the edit in one Claude Code PostToolUse payload. The repo is the
 * Claude project's (CLAUDE_PROJECT_DIR, where the hook was installed), else the working directory.
 * It never fails the tool call: problems go to stderr with exit 1, which Claude Code doesn't block on.
 */
async function event(io: Io, now: () => number): Promise<number> {
  const raw = io.stdin ? await readCapped(io.stdin, MAX_PAYLOAD_BYTES) : Buffer.alloc(0);
  const repoDir = io.env['CLAUDE_PROJECT_DIR'] || io.cwd;
  const repo = await openRepo(repoDir);
  const git = repo.git;
  const [head, branch, roots, worktrees] = await Promise.all([
    tryGit(git, ['rev-parse', '--verify', '-q', 'HEAD']), tryGit(git, ['symbolic-ref', '-q', '--short', 'HEAD']),
    tryGit(git, ['rev-list', '--max-parents=0', 'HEAD']), tryGit(git, ['worktree', 'list', '--porcelain', '-z']),
  ]);
  const dir = stateDir(repo.commonDir);
  const nowMs = now();
  if (raw === null) {
    appendEvents(dir, [dropRecord('too_large', nowMs)]);
    return 0;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    payload = undefined;
  }
  // Real paths of every worktree root, deepest first, so a nested worktree claims its own files.
  const realRoots = worktreePaths(worktrees ?? '').flatMap((r) => {
    try {
      return [realpathSync.native(r)];
    } catch {
      return [];
    }
  }).sort((a, b) => b.length - a.length);
  const hash = lineHasher(loadOrCreateKey(dir));
  appendEvents(dir, eventsFromPayload(payload, { place: (abs) => placePath(abs, realRoots), hash, nowMs, repoId: repoIdOf(roots ?? ''),
    branch: branch?.replace(/\n$/, ''), headSha: head?.trim() || undefined }));
  return 0;
}

/**
 * A file's repo-relative path: its real path (or its folder's, for a file already gone) under the
 * deepest worktree root holding it. Outside every root: null (another repo's file). `.git`
 * internals are never an edit to the repo. A relative path can't be placed.
 */
function placePath(abs: string, realRoots: string[]): string | null | 'unplaceable' {
  if (!abs.startsWith('/')) return 'unplaceable';
  let real: string;
  try {
    real = realpathSync.native(abs);
  } catch {
    try {
      real = join(realpathSync.native(join(abs, '..')), abs.slice(abs.lastIndexOf('/') + 1));
    } catch {
      return realRoots.some((r) => abs.startsWith(r + '/')) ? 'unplaceable' : null;
    }
  }
  const root = realRoots.find((r) => real.startsWith(r + '/'));
  if (!root) return null;
  const rel = real.slice(root.length + 1);
  return rel === '.git' || rel.startsWith('.git/') ? null : rel;
}

/** `commet hook refresh`: a coalesced, quiet scan of this worktree (the git hooks run it detached). */
async function refresh(io: Io, scan: (io: Io) => Promise<number>): Promise<number> {
  const repo = await openRepo(io.cwd);
  const quiet: Io = { stdout: () => undefined, stderr: () => undefined, cwd: io.cwd, env: io.env };
  return coalescedRefresh(stateDir(repo.commonDir), sha256Hex(repo.top ?? repo.commonDir).slice(0, 12), () => scan(quiet));
}

function usage(io: Io, why: string): number {
  io.stderr(`commet: ${why}\n${HOOK_USAGE}`);
  return EXIT.usage;
}

/** Runs `commet hook …`. `scan` runs a scan for `hook refresh`; `paths` and `now` are for tests. */
export async function hookCommand(args: string[], io: Io, scan: (io: Io) => Promise<number>,
  opts: { paths?: HookPaths; now?: () => number } = {}): Promise<number> {
  const [sub, ...rest] = args;
  try {
    if (sub === 'install') return await install(rest, io, opts.paths ?? defaultPaths());
    if (sub === 'remove') return await remove(rest, io);
    if (sub === 'event' && rest.length === 0) return await event(io, opts.now ?? Date.now);
    if (sub === 'refresh' && rest.length === 0) return await refresh(io, scan);
    return usage(io, sub ? `unknown hook command ${JSON.stringify([sub, ...rest].join(' '))}` : 'missing hook command');
  } catch (e) {
    if (e instanceof CommetError) {
      io.stderr(`commet: ${e.message}\n`);
      return e.exitCode;
    }
    // Error text can carry absolute paths (fs errors), so it's shown only on request.
    io.stderr(`commet: internal error${io.env['COMMET_DEBUG'] ? `\n${(e as Error).stack}` : ' (set COMMET_DEBUG=1 for details)'}\n`);
    return EXIT.internal;
  }
}
