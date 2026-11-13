// Choosing the content roots for `commet scan` (#71 C1–C5): flags, the saved answer, or a guess the
// user confirms at a terminal. Without one (hooks, CI, the agent runner) nothing is asked, nothing is
// saved, the last scan's roots are kept (#73) and the scan never blocks. Output names repo-relative folders only (C10).
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CommetError, EXIT } from '../core/errors.js';
import { guessRoot, parseRoots, type RootGuess } from '../core/roots.js';
import { printable } from '../core/summary.js';
import { readScanPair } from '../state/chart.js';
import { readSavedRoots, saveRoots } from '../state/config.js';
import { stateDir } from '../state/io.js';
import type { HeadTree } from '../scan/index.js';

/** One line of the user's answer, or null at the end of input. */
export type Ask = (question: string) => Promise<string | null>;

/** What the scan flags say about roots: `--root` (repeatable), `--no-root` or `--ask`, at most one kind. */
export type RootFlags = { kind: 'set'; roots: string[] } | { kind: 'none' } | { kind: 'ask' } | { kind: 'default' };

const HOW = 'change with --root <dir>, --no-root or `commet scan --ask`';
const list = (roots: readonly string[]) => (roots.length === 0 ? 'none' : roots.map(printable).join(', '));
const share = (g: RootGuess) => `${printable(g.root)} holds ${g.sharePct}% of the code`;
const goneNote = (gone: readonly string[]) => (gone.length > 0 ? `; ${list(gone)} no longer a folder at HEAD, left out` : '');

/** The roots the last scan's layout used, or why they can't be kept; null when there is no layout yet. */
type LastRoots = { roots: string[] } | { unusable: string } | null;

/**
 * The last scan's roots (#73), from the state dir's layout through the pair reader (#64), so they come
 * from a layout that matches its snapshot. Its head may be older than this scan's; its repo must be
 * this one. A damaged, unpaired or other-repo layout gives no roots, and says why (Rule 1).
 */
async function lastRoots(dir: string, repoId: string): Promise<LastRoots> {
  try {
    lstatSync(join(dir, 'layout.json'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
  }
  try {
    const { snapshot, roots } = await readScanPair(dir);
    return snapshot.repo.repoId === repoId ? { roots } : { unusable: 'the last scan is of another repository, its roots not kept' };
  } catch {
    // Any failure (damaged, unpaired, or unreadable such as EACCES) keeps the scan going: it replaces these files.
    return { unusable: 'the last scan\'s layout is unreadable, its roots not kept' };
  }
}

/**
 * The roots for this scan, from HEAD's files and folders. Prints exactly one `roots:` line saying which and
 * whether it was saved. Only a flag or the human's answer is saved; with neither, nor a saved answer, the
 * last scan's roots are kept, so planets never move unless you choose (#73), and the guess is used only
 * without them. A bad --root is a usage error (exit 2); a damaged config.json is a state error (exit 5).
 * `ask` is present only at a terminal.
 */
export async function chooseRoots(flags: RootFlags, { commonDir, repoId, files, folders }: HeadTree, out: (text: string) => void,
  ask: Ask | undefined): Promise<string[]> {
  const dir = () => stateDir(commonDir);
  const say = (roots: readonly string[], how: string) => out(`roots: ${list(roots)} (${how})\n`);
  // An explicit choice replaces config.json unread, so it is also the way out of a damaged one; the
  // write renames over the path, replacing a symlink itself, never writing through it.
  if (flags.kind === 'set' || flags.kind === 'none') {
    const parsed = flags.kind === 'none' ? { roots: [] } : parseRoots(flags.roots, folders);
    if ('error' in parsed) throw new CommetError(`--root: ${parsed.error}`, EXIT.usage);
    saveRoots(dir(), parsed.roots);
    say(parsed.roots, `from ${flags.kind === 'none' ? '--no-root' : '--root'}, saved; ${HOW}`);
    return parsed.roots;
  }
  const saved = await readSavedRoots(dir());
  // A saved root that is no longer a folder is left out of this scan and said so, never dropped silently (Rule 1).
  const kept = saved?.filter((r) => folders.has(r)) ?? null;
  const gone = saved?.filter((r) => !folders.has(r)) ?? [];
  // --ask needs someone to answer: without a terminal it is said, and the scan goes on.
  const unasked = flags.kind === 'ask' && !ask ? 'not asked: no terminal; ' : '';
  const fromSaved = () => {
    say(kept!, `${unasked}saved${goneNote(gone)}; ${HOW}`);
    return kept!;
  };
  if (kept !== null && flags.kind !== 'ask') return fromSaved();
  const guess = guessRoot(files);
  const answer = ask && (guess !== null || flags.kind === 'ask') ? await prompt(guess, folders, out, ask) : null;
  if (answer !== null) {
    saveRoots(dir(), answer);
    say(answer, `saved; ${HOW}`);
    return answer;
  }
  if (kept !== null) return fromSaved();
  // Nothing saved and nothing answered: never saved here, so a hook, CI or an agent can't answer for the human (#73).
  const confirm = ask ? 'confirm with `commet scan --ask`' : 'confirm with `commet scan --ask` in a terminal';
  const unsaved = `not saved: ${confirm}, or pass --root <dir> or --no-root`;
  const last = await lastRoots(dir(), repoId);
  // Kept roots that all left HEAD say so and fall through to the guess; a layout recorded as none stays none.
  let goneAll = '';
  if (last !== null && 'roots' in last) {
    const roots = last.roots.filter((r) => folders.has(r));
    if (roots.length > 0 || last.roots.length === 0) {
      say(roots, `${unasked}kept from the last scan${goneNote(last.roots.filter((r) => !folders.has(r)))}; ${unsaved}`);
      return roots;
    }
    goneAll = `; ${list(last.roots)} no longer a folder at HEAD`;
  }
  const unusable = goneAll || (last === null || 'roots' in last ? '' : `; ${last.unusable}`);
  if (guess === null) {
    say([], `${unasked}no main folder to suggest${unusable}; set one with --root <dir>`);
    return [];
  }
  say([guess.root], `${unasked}guessed: ${share(guess)}${unusable}; ${unsaved}`);
  return [guess.root];
}

/**
 * C2: `Use src as the system root? [Y/n/other]`. Enter or y takes the guess, n means none (#18's
 * mapping), and "other" (or folder paths typed straight away) takes space-separated folders. A bad
 * answer is explained and asked again. Null at the end of input: nothing was answered.
 */
async function prompt(guess: RootGuess | null, folders: ReadonlySet<string>, out: (text: string) => void, ask: Ask): Promise<string[] | null> {
  const paths = 'Folders to use as system roots, space-separated, from the repo root (empty for none): ';
  if (guess) out(`${share(guess)}.\n`);
  for (let question = guess ? `Use ${printable(guess.root)} as the system root? [Y/n/other] ` : paths; ;) {
    const line = await ask(question);
    if (line === null) return null;
    const a = line.trim();
    if (guess && question !== paths) {
      if (/^(?:y|yes)?$/i.test(a)) return [guess.root];
      if (/^(?:n|no)$/i.test(a)) return [];
      if (/^(?:o|other)$/i.test(a)) {
        question = paths;
        continue;
      }
    }
    const parsed = parseRoots(a === '' ? [] : a.split(/\s+/), folders);
    if ('roots' in parsed) return parsed.roots;
    out(`${parsed.error}\n`);
  }
}

/**
 * `ask` for the real terminal: only when stdin and stdout are both TTYs, so a hook, CI or the agent
 * runner is never asked (C3). Ctrl-C at the question ends commet as it would anywhere else.
 */
export function terminalAsk(input: NodeJS.ReadableStream & { isTTY?: boolean }, output: NodeJS.WritableStream & { isTTY?: boolean }): Ask | undefined {
  if (input.isTTY !== true || output.isTTY !== true) return undefined;
  return (question) => new Promise((resolve) => {
    const rl = createInterface({ input, output, terminal: true });
    let answered = false;
    rl.on('SIGINT', () => {
      rl.close();
      process.kill(process.pid, 'SIGINT');
    });
    rl.on('close', () => {
      if (!answered) resolve(null);
    });
    rl.question(question, (line) => {
      answered = true;
      rl.close();
      resolve(line);
    });
  });
}
