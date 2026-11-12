// Lock files holding their owner's pid, taken over once the owner is gone, so a killed `commet`
// never leaves one stuck. A lock is a series of slots, `<lock>.<n>`, each created exclusively: the
// holder is the highest slot. Taking over a dead holder's lock creates the next slot rather than
// deleting the dead one by name, so no check can be overtaken between judging a file and removing
// it: two contenders for the same slot can't both create it, and one that lands below a newer slot
// backs off. Slot numbers never go down: releasing marks the slot released rather than deleting it,
// and only a higher holder clears the slots below it, so a number is never handed out twice while
// someone may still claim it (PR #105 r4). The last released slot stays, as one file.
import { lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** A slot whose pid isn't readable yet is its owner's for this long: it may still be writing it. */
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

/** What a released slot holds. */
const RELEASED = 'released';

/** Whether a slot is free to pass: released, or its owner gone (a slot with no pid yet is its owner's for FRESH_MS). */
function stale(file: string): boolean {
  let text = '';
  let mtimeMs: number;
  try {
    const st = lstatSync(file);
    mtimeMs = st.mtimeMs;
    // Only a regular file is read: a planted FIFO would block.
    if (st.isFile()) text = readFileSync(file, 'utf8');
  } catch {
    return true; // gone
  }
  if (text === RELEASED) return true;
  const pid = Number(text);
  return text !== '' && Number.isSafeInteger(pid) && pid > 0 ? !alive(pid) : Date.now() - mtimeMs >= FRESH_MS;
}

/** The lock's slot numbers, ascending. */
function slots(lock: string): number[] {
  const prefix = `${basename(lock)}.`;
  return readdirSync(dirname(lock)).filter((n) => n.startsWith(prefix) && /^[1-9]\d{0,15}$/.test(n.slice(prefix.length)))
    .map((n) => Number(n.slice(prefix.length))).sort((a, b) => a - b);
}

/**
 * Creates slot `n` and keeps it only if no higher slot exists then; slots below it are released or
 * dead holders' and are cleared. Returns the release, which marks the slot released (it stays, so
 * its number is never reused), or null. Exported for tests.
 */
export function claim(lock: string, n: number): (() => void) | null {
  const mine = `${lock}.${n}`;
  try {
    writeFileSync(mine, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    return null;
  }
  const all = slots(lock);
  if (all.some((m) => m > n)) {
    rmSync(mine, { force: true });
    return null;
  }
  for (const m of all) {
    if (m >= n) continue;
    try {
      rmSync(`${lock}.${m}`, { force: true });
    } catch {
      // Not a file (planted): it only ever sits below the holder, so it's harmless where it is.
    }
  }
  return () => writeFileSync(mine, RELEASED);
}

/** Takes the lock, returning its release, or null while a live process holds it. */
export function tryLock(lock: string): (() => void) | null {
  const top = slots(lock).at(-1);
  if (top !== undefined && !stale(`${lock}.${top}`)) return null;
  return claim(lock, (top ?? 0) + 1);
}

/**
 * Runs `fn` holding the lock, waiting up to `tries` × `waitMs` for another holder to finish. Null
 * when it never came free (the caller says what that means).
 */
export async function withLock<T>(lock: string, fn: () => T, tries = 250, waitMs = 20): Promise<{ value: T } | null> {
  let release: (() => void) | null;
  for (let i = 0; !(release = tryLock(lock)); i++) {
    if (i >= tries) return null;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  try {
    return { value: fn() };
  } finally {
    release();
  }
}
