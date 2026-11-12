// A lock file in the state dir holding its owner's pid: taken by exclusive create, and taken over
// only once its owner is gone, so a killed `commet` never leaves it stuck.
import { linkSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync, type BigIntStats } from 'node:fs';

/** A lock whose pid isn't readable yet is its owner's for this long: it may still be writing it. */
const FRESH_MS = 10_000;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * The lock's inode when it may be taken over (its owner is gone), or null while it's held by a live
 * process, was made too recently to tell, or is gone already.
 */
function staleIno(lock: string): bigint | null {
  let st: BigIntStats;
  let pid = NaN;
  try {
    st = lstatSync(lock, { bigint: true });
    // Only a regular file is read: a planted FIFO would block.
    if (st.isFile()) pid = Number(readFileSync(lock, 'utf8'));
  } catch {
    return null;
  }
  const isHeld = Number.isSafeInteger(pid) && pid > 0 ? alive(pid) : Date.now() - Number(st.mtimeMs) < FRESH_MS;
  return isHeld ? null : st.ino;
}

/**
 * Removes the lock only if it is still the stale one inspected (inode `ino`): it's renamed to a
 * name of this process's own first, so the file removed is exactly the one checked. A fresh lock
 * another process took meanwhile is put back, unless a newer one is already there. Exported for tests.
 */
export function reap(lock: string, ino: bigint): void {
  const mine = `${lock}.reap-${process.pid}`;
  try {
    renameSync(lock, mine);
  } catch {
    return; // someone else reaped it
  }
  try {
    if (lstatSync(mine, { bigint: true }).ino !== ino) linkSync(mine, lock);
  } catch {
    // A newer lock is at the name already: that one stands.
  } finally {
    rmSync(mine, { force: true });
  }
}

/** Takes the lock, or returns false while another live process holds it. */
export function tryLock(lock: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    const ino = staleIno(lock);
    if (ino === null) {
      if (lstatSync(lock, { throwIfNoEntry: false })) return false;
      continue; // released meanwhile: try again
    }
    reap(lock, ino);
  }
  return false;
}

/**
 * Runs `fn` holding the lock, waiting up to `tries` × `waitMs` for another holder to finish. Null
 * when it never came free (the caller says what that means).
 */
export async function withLock<T>(lock: string, fn: () => T, tries = 250, waitMs = 20): Promise<{ value: T } | null> {
  for (let i = 0; !tryLock(lock); i++) {
    if (i >= tries) return null;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  try {
    return { value: fn() };
  } finally {
    rmSync(lock, { force: true });
  }
}
