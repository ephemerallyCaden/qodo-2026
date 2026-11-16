// `commet hook refresh` (R7): what the git hooks run, detached. A rebase runs post-commit once per
// commit, so refreshes coalesce per worktree: one scan runs at a time and requests made meanwhile
// fold into one more scan after it, never a scan per commit. `commet open`'s own rescans (#95) go
// through the same lock and request, so a hook's refresh and the open view's never scan side by side.
import { lstatSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '../core/hash.js';
import { tryLock } from '../state/lock.js';

/** A worktree's refresh key: its top level's real path, or the git common dir's in a bare repo. */
export const refreshKey = (top: string | null, commonDir: string): string => sha256Hex(top ?? commonDir).slice(0, 12);

/**
 * Runs `scan` unless one is already running for this worktree (`key`), in which case it leaves a
 * request the running one picks up when it finishes. The request is made before trying the lock and
 * checked after releasing it, so a request is never lost between the two. Returns the last scan's
 * exit code (0 when another process scans). Before each round `more()` is asked: false stops before
 * taking the lock, so a request still waiting stays for the next refresh (#95: a server shutting down).
 */
export async function coalescedRefresh(dir: string, key: string, scan: () => Promise<number>, more: () => boolean = () => true): Promise<number> {
  const lock = join(dir, `refresh-${key}.lock`);
  const pending = join(dir, `refresh-${key}.pending`);
  try {
    writeFileSync(pending, '', { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  // One more round only when a request came in during the last scan, so this ends once commits stop.
  let code = 0;
  for (;;) {
    if (!more()) return code;
    const release = tryLock(lock);
    if (!release) return code;
    try {
      rmSync(pending, { force: true });
      code = await scan();
    } finally {
      release();
    }
    if (!lstatSync(pending, { throwIfNoEntry: false })) return code;
  }
}
