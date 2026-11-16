// #95: notices when HEAD or a branch moves, so `commet open` can rescan without git hooks (a
// machine-wide core.hooksPath, such as a security tool's, rules them out). Read-only: it only lists
// and lstats git's own files in the common dir, never reads their contents, and writes nothing.
import { watch, type FSWatcher } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { signature } from './watch.js';

export interface RefWatcher { close(): void }

/**
 * Everything a commit, checkout, merge or rebase rewrites: the main worktree's HEAD, every linked
 * worktree's HEAD, each loose branch ref under refs/heads, packed-refs, and the reftable stack's
 * list (git's other ref store). Git replaces each by renaming a lock file over it, so a new inode
 * or new times mark a change. Symlinks are listed, never followed, and nothing is opened.
 */
export async function refsSignature(commonDir: string): Promise<string> {
  const parts: string[] = [];
  const add = async (rel: string) => parts.push(`${rel}\0${await signature(join(commonDir, rel))}`);
  await add('HEAD');
  await add('packed-refs');
  await add('reftable/tables.list');
  for (const name of await names(join(commonDir, 'worktrees'))) await add(`worktrees/${name}/HEAD`);
  const walk = async (rel: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(join(commonDir, rel), { withFileTypes: true });
    } catch (e) {
      parts.push(`${rel}/\0${(e as NodeJS.ErrnoException).code ?? 'error'}`);
      return;
    }
    // Codepoint order, so the same refs always give the same signature.
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (e.isDirectory()) await walk(`${rel}/${e.name}`);
      else await add(`${rel}/${e.name}`);
    }
  };
  // Only a real folder is walked: a refs/heads that is a symlink is listed, not followed.
  if ((await lstat(join(commonDir, 'refs', 'heads')).catch(() => null))?.isDirectory()) await walk('refs/heads');
  else await add('refs/heads');
  return parts.join('\n');
}

/** A folder's entry names, codepoint-sorted; none when it can't be listed (a repo with no linked worktrees). */
async function names(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

/**
 * Calls `onChange()` whenever the refs signature changes, starting from the one read before this
 * resolves (so the refs as they are at start are no change). fs.watch on the common dir and on
 * refs/heads only hints that a check is due; a poll every `pollMs` is the guarantee, for linked
 * worktrees' HEADs and wherever watch events are lost or unsupported. One check at a time.
 */
export async function watchRefs(commonDir: string, onChange: () => void, pollMs = 1000): Promise<RefWatcher> {
  let last = await refsSignature(commonDir);
  let closed = false;
  let chain = Promise.resolve();
  const check = (): Promise<void> => (chain = chain.then(async () => {
    const now = await refsSignature(commonDir);
    if (now === last || closed) return;
    last = now;
    onChange();
  }).catch(() => {}));

  let soon: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearTimeout(soon);
    soon = setTimeout(() => void check(), 25);
  };
  const watchers: FSWatcher[] = [];
  for (const [dir, recursive] of [[commonDir, false], [join(commonDir, 'refs', 'heads'), true]] as const) {
    try {
      const w = watch(dir, { persistent: false, recursive }, schedule);
      w.on('error', () => w.close());
      watchers.push(w);
    } catch {
      // No fs.watch here (some network and virtual filesystems, or no recursive watch): the poll still notices.
    }
  }
  const poll = setInterval(() => void check(), pollMs);
  poll.unref();
  return {
    close() {
      closed = true;
      clearTimeout(soon);
      clearInterval(poll);
      for (const w of watchers) w.close();
    },
  };
}
