// Choosing the content roots for `commet scan` (#71 C1–C5): flags, the saved answer, or a guess the
// user confirms at a terminal. Without one (hooks, CI, the agent runner) nothing is asked and the
// scan never blocks. Output names repo-relative folders only (C10).
import { createInterface } from 'node:readline';
import { CommetError, EXIT } from '../core/errors.js';
import { guessRoot, parseRoots, type RootGuess } from '../core/roots.js';
import { printable } from '../core/summary.js';
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

/**
 * The roots for this scan, from HEAD's files and folders. Prints exactly one `roots:` line saying which and
 * whether it was saved. A bad --root is a usage error (exit 2); a damaged config.json is a state
 * error (exit 5). `ask` is present only at a terminal.
 */
export async function chooseRoots(flags: RootFlags, { commonDir, files, folders }: HeadTree, out: (text: string) => void,
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
    const note = gone.length > 0 ? `; ${list(gone)} no longer a folder at HEAD, left out` : '';
    say(kept!, `${unasked}saved${note}; ${HOW}`);
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
  if (guess === null) {
    say([], `${unasked}no main folder to suggest; set one with --root <dir>`);
    return [];
  }
  const confirm = ask ? 'confirm with `commet scan --ask`' : 'confirm with `commet scan --ask` in a terminal';
  say([guess.root], `${unasked}guessed: ${share(guess)}; not saved: ${confirm}, or pass --root <dir> or --no-root`);
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
