// A lock file in the state dir holding its owner's pid: taken by exclusive create, and taken over
// only once its owner is gone, so a killed `commet` never leaves it stuck.
import { lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

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

/** Whether the lock at `lock` is held by a live process (or was made too recently to tell). */
function held(lock: string): boolean {
  let st: ReturnType<typeof lstatSync> | undefined;
  let pid = NaN;
  try {
    st = lstatSync(lock);
    // Only a regular file is read: a planted FIFO would block.
    if (st.isFile()) pid = Number(readFileSync(lock, 'utf8'));
  } catch {
    return false; // gone already
  }
  if (Number.isSafeInteger(pid) && pid > 0) return alive(pid);
  return Date.now() - st.mtimeMs < FRESH_MS;
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
    if (held(lock)) return false;
    rmSync(lock, { force: true });
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
