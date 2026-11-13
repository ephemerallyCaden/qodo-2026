// Content roots (#71): which folders' subfolders become the content planets. Pure: the CLI reads
// and saves the answer (src/state/config.ts) and asks the question (src/cli/roots.ts). Roots are
// repo-relative folder paths, never absolute (Rule 2), and the planet rule itself is planetHome in
// structure.ts, shared by layout() and fog.
import { byCodepoint } from './canonical-json.js';
import { ancestors, isSourcePath, planetHome } from './structure.js';

/** A root as typed (a flag or the prompt) made canonical, or why it can't be one. Never echoes an absolute path. */
export function normalizeRoot(input: string): { root: string } | { error: string } {
  // A leading ./ and trailing slashes are only spelling: `./src/` is `src`.
  const root = input.replace(/^(?:\.\/+)+/, '').replace(/\/+$/, '');
  if (/^(?:[A-Za-z]:)?[\\/]/.test(input) || input.startsWith('~')) return { error: 'a root is a folder path from the repo root, not an absolute path' };
  if (root === '' || root === '.') return { error: 'the repo root itself is the star; name a folder inside it' };
  if (root.split('/').some((s) => s === '' || s === '.' || s === '..')) return { error: 'a root is a plain folder path from the repo root (no "..", "." or "//")' };
  return { root };
}

/** A root already in canonical form (as saved or recorded in layout.json). */
export function isCanonicalRoot(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const n = normalizeRoot(v);
  return 'root' in n && n.root === v;
}

/**
 * Roots as given (flags, the prompt, or saved) checked against the folders at HEAD: each one
 * normalised and an existing folder, none inside another. Sorted by codepoint, without repeats.
 */
export function parseRoots(inputs: readonly string[], folders: ReadonlySet<string>): { roots: string[] } | { error: string } {
  const out = new Set<string>();
  for (const input of inputs) {
    const n = normalizeRoot(input);
    if ('error' in n) return n;
    if (!folders.has(n.root)) return { error: `no folder ${JSON.stringify(n.root)} at HEAD` };
    out.add(n.root);
  }
  const roots = [...out].sort(byCodepoint);
  for (const r of roots) {
    const outer = roots.find((x) => r.startsWith(`${x}/`));
    if (outer !== undefined) return { error: `roots can't nest: ${JSON.stringify(r)} is inside ${JSON.stringify(outer)}` };
  }
  return { roots };
}

/** Every folder holding a file at HEAD, by path. */
export const foldersOf = (paths: readonly string[]): Set<string> => new Set(paths.flatMap(ancestors));

/** The suggested root: a top-level folder, and its share of the code (whole percent, rounded down). */
export interface RootGuess { root: string; sharePct: number }

/** Subfolders a root needs before it is worth suggesting (C1): with fewer, #18's mapping is fine. */
const GUESS_MIN_PLANETS = 2;

/**
 * C1: the top-level folder holding the largest share of the code at HEAD (LOC of files that are
 * neither tests nor test data; ties go to codepoint order), suggested only when it would make at
 * least two content planets. Null when there is no code or that folder wouldn't.
 */
export function guessRoot(files: readonly { path: string; loc: number }[]): RootGuess | null {
  const code = files.filter((f) => isSourcePath(f.path));
  const total = code.reduce((n, f) => n + f.loc, 0);
  if (total === 0) return null;
  const byTop = new Map<string, number>();
  for (const f of code) {
    const slash = f.path.indexOf('/');
    if (slash >= 0) byTop.set(f.path.slice(0, slash), (byTop.get(f.path.slice(0, slash)) ?? 0) + f.loc);
  }
  const best = [...byTop].sort((a, b) => b[1] - a[1] || byCodepoint(a[0], b[0]))[0];
  if (!best || best[1] === 0) return null;
  const [root, loc] = best;
  const planets = new Set(code.flatMap((f) => {
    const home = planetHome(f.path, [root]);
    return home?.zone === 'content' ? [home.path] : [];
  }));
  if (planets.size < GUESS_MIN_PLANETS) return null;
  return { root, sharePct: Math.floor((loc * 100) / total) };
}
