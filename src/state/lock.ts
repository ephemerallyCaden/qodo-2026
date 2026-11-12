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

/** Whether the lock may be taken over: its owner is gone (a lock with no pid yet is its owner's for FRESH_MS). */
function stale(lock: string): boolean {
  let st: BigIntStats;
  let pid = NaN;
  try {
    st = lstatSync(lock, { bigint: true });
    // Only a regular file is read: a planted FIFO would block.
    if (st.isFile()) pid = Number(readFileSync(lock, 'utf8'));
  } catch {
    return false;
  }
  return Number.isSafeInteger(pid) && pid > 0 ? !alive(pid) : Date.now() - Number(st.mtimeMs) >= FRESH_MS;
}

/** Creates `file` holding our pid, exclusively; false when it exists. */
function create(file: string): boolean {
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    return false;
  }
}

/**
 * Removes the lock if its owner is gone. Only the process holding `<lock>.reap` may judge and remove
 * it, and while the stale lock is there nobody can create a new one, so the file removed is always
 * the one judged: two contenders can never both take over. True when the lock is gone.
 */
function reapStale(lock: string): boolean {
  const guard = `${lock}.reap`;
  if (!create(guard)) {
    // A reaper that died inside this short step leaves its guard: once it's stale too, it's cleared
    // for the next try (renamed aside and checked, so a live reaper's guard is never the one removed).
    if (stale(guard)) clearGuard(guard);
    return false;
  }
  try {
    if (!lstatSync(lock, { throwIfNoEntry: false })) return true;
    if (!stale(lock)) return false;
    rmSync(lock, { force: true });
    return true;
  } finally {
    rmSync(guard, { force: true });
  }
}

/** Moves a stale guard aside to a name of our own and deletes it only if it's still stale, else puts it back. Exported for tests. */
export function clearGuard(guard: string): void {
  const mine = `${guard}-${process.pid}`;
  try {
    renameSync(guard, mine);
  } catch {
    return; // cleared already
  }
  try {
    if (!stale(mine)) linkSync(mine, guard);
  } catch {
    // A newer guard is there already: that one stands.
  } finally {
    rmSync(mine, { force: true });
  }
}

/** Takes the lock, or returns false while another live process holds it (or is judging a stale one). */
export function tryLock(lock: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (create(lock)) return true;
    if (!reapStale(lock)) return false;
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
