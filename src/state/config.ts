// The saved content-roots answer (#71 C5): `<git-common-dir>/commet/config.json`, local to this
// clone like all state, canonical JSON, mode 0600, through the state I/O. It holds `{ roots }` and
// nothing else: repo-relative folder paths, never absolute ones (Rule 2).
import { join } from 'node:path';
import { canonicalJson } from '../core/canonical-json.js';
import { CommetError, EXIT } from '../core/errors.js';
import { isCanonicalRoot, parseRoots } from '../core/roots.js';
import { readStateBytes, writeAtomic } from './io.js';

export const CONFIG_FILE = 'config.json';

// --root and --no-root replace the file without reading it, so they are the way out (PR #72 r1 #3);
// --ask still reads it, as the saved answer is what an unanswered question falls back to.
const damaged = (why: string) => new CommetError(`state error: .git/commet/${CONFIG_FILE} is unreadable (${why}); `
  + 'fix or delete it, or choose again with `commet scan --root <dir>` or `--no-root`', EXIT.state);

/** The saved roots, or null when nothing is saved yet. A damaged or symlinked file is refused (exit 5), never reset. */
export async function readSavedRoots(dir: string): Promise<string[] | null> {
  const text = (await readStateBytes(dir, CONFIG_FILE))?.toString('utf8') ?? null;
  if (text === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw damaged('not JSON');
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.keys(v).join() !== 'roots') throw damaged('expected { "roots": [...] }');
  const roots = (v as { roots: unknown }).roots;
  if (!Array.isArray(roots) || !roots.every(isCanonicalRoot)) throw damaged('roots must be folder paths from the repo root');
  // Order and repeats are only spelling; roots that nest can't be a saved answer (Qodo local r1 #2).
  const set = parseRoots(roots, new Set(roots));
  if ('error' in set) throw damaged(set.error);
  return set.roots;
}

/** Saves the answer (atomic, 0600). `roots` are canonical (parseRoots). */
export function saveRoots(dir: string, roots: readonly string[]): void {
  writeAtomic(join(dir, CONFIG_FILE), canonicalJson({ roots: [...roots] }));
}
