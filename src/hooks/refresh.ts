// `commet hook refresh` (R7): what the git hooks run, detached. A rebase runs post-commit once per
// commit, so refreshes coalesce per worktree: one scan runs at a time and requests made meanwhile
// fold into one more scan after it, never a scan per commit.
import { lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** At most this many scans back to back, however many commits arrive while they run. */
const MAX_ROUNDS = 5;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Takes the lock (exclusive create, holding our pid); a lock whose process is gone is taken over. */
function tryLock(lock: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let pid = NaN;
    try {
      // Only a regular file is read: a planted FIFO would block.
      if (lstatSync(lock).isFile()) pid = Number(readFileSync(lock, 'utf8'));
    } catch {
      // Gone already, or not readable: try again or leave it.
    }
    if (Number.isSafeInteger(pid) && pid > 0 && alive(pid)) return false;
    rmSync(lock, { force: true });
  }
  return false;
}

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
  let code = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (!tryLock(lock)) return code;
    try {
      rmSync(pending, { force: true });
      code = await scan();
    } finally {
      rmSync(lock, { force: true });
    }
    if (!lstatSync(pending, { throwIfNoEntry: false })) return code;
  }
  return code;
}
