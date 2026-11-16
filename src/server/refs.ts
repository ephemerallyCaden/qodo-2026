// #95: notices when HEAD or a branch moves, so `commet open` can rescan without git hooks (a
// machine-wide core.hooksPath, such as a security tool's, rules them out). Read-only: it only lists
// and lstats git's own files in the common dir, never reads their contents, and writes nothing.
import { watch, type FSWatcher } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { signature } from './watch.js';

export interface RefWatcher { close(): void }

/**
 * Everything a commit, checkout, merge, rebase or fetch rewrites for the worktree whose git dir is
 * `gitDir`: its own HEAD, each loose branch ref under refs/heads and remote-tracking ref under
 * refs/remotes (a scan lists both), packed-refs, and the reftable stack's list (git's other ref
 * store). Other worktrees' HEADs are left out: they move no branch this worktree's scan shows (Qodo
 * PR #158 7d21ad85). Git replaces each by renaming a lock file over it, so a new inode or new times
 * mark a change. Symlinks are listed, never followed, and nothing is opened.
 */
export async function refsSignature(commonDir: string, gitDir = commonDir): Promise<string> {
  const parts: string[] = [];
  const add = async (rel: string) => parts.push(`${rel}\0${await signature(join(commonDir, rel))}`);
  parts.push(`HEAD\0${await signature(join(gitDir, 'HEAD'))}`);
  await add('packed-refs');
  await add('reftable/tables.list');
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
  for (const rel of ['refs/heads', 'refs/remotes']) {
    // Only a real folder is walked: one that is a symlink is listed, not followed.
    if ((await lstat(join(commonDir, rel)).catch(() => null))?.isDirectory()) await walk(rel);
    else await add(rel);
  }
  return parts.join('\n');
}

/**
 * Calls `onChange()` whenever the refs signature of the worktree whose git dir is `gitDir` changes,
 * starting from the one read before this resolves (so the refs as they are at start are no change).
 * fs.watch on the common dir, the git dir, refs/heads and refs/remotes only hints that a check is
 * due; a poll every `pollMs` is the guarantee, wherever watch events are lost or unsupported.
 */
export async function watchRefs(commonDir: string, onChange: () => void, pollMs = 1000, gitDir = commonDir): Promise<RefWatcher> {
  let last = await refsSignature(commonDir, gitDir);
  let closed = false;
  // One check at a time, and at most one more asked for meanwhile, so checks slower than the poll
  // (a huge refs tree) never pile up behind each other (Qodo local 8137f492).
  let running = false;
  let again = false;
  const check = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      try {
        const now = await refsSignature(commonDir, gitDir);
        if (now !== last && !closed) {
          last = now;
          onChange();
        }
      } catch {
        // refsSignature records its own I/O errors; anything else waits for the next check.
      }
    } while (again && !closed);
    running = false;
  };

  let soon: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearTimeout(soon);
    soon = setTimeout(() => void check(), 25);
  };
  const watchers: FSWatcher[] = [];
  const dirs: [string, boolean][] = [[commonDir, false], [join(commonDir, 'refs', 'heads'), true], [join(commonDir, 'refs', 'remotes'), true]];
  if (gitDir !== commonDir) dirs.push([gitDir, false]);
  for (const [dir, recursive] of dirs) {
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
