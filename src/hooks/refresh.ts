// `commet hook refresh` (R7): what the git hooks run, detached. A rebase runs post-commit once per
// commit, so refreshes coalesce per worktree: one scan runs at a time and requests made meanwhile
// fold into one more scan after it, never a scan per commit.
import { lstatSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tryLock } from '../state/lock.js';

/**
 * Runs `scan` unless one is already running for this worktree (`key`), in which case it leaves a
 * request the running one picks up when it finishes. The request is made before trying the lock and
 * checked after releasing it, so a request is never lost between the two. Returns the last scan's
 * exit code (0 when another process scans).
 */
export async function coalescedRefresh(dir: string, key: string, scan: () => Promise<number>): Promise<number> {
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
    if (!tryLock(lock)) return code;
    try {
      rmSync(pending, { force: true });
      code = await scan();
    } finally {
      rmSync(lock, { force: true });
    }
    if (!lstatSync(pending, { throwIfNoEntry: false })) return code;
  }
}
