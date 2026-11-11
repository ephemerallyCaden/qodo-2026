import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { CommetError, EXIT } from '../core/errors.js';

/**
 * `<git-common-dir>/commet`, mode 0700. Shared by every worktree of the repo. Created when absent;
 * a symlink or non-directory there is refused (exit 5), so state is never written or chmodded
 * through a planted link (Qodo PR8 #5).
 */
export function stateDir(commonDir: string): string {
  const dir = join(commonDir, 'commet');
  let st: ReturnType<typeof lstatSync> | undefined;
  try {
    st = lstatSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    try {
      mkdirSync(dir, { mode: 0o700 });
    } catch (e2) {
      // A parallel first scan made it in between (Qodo PR10 #3): check what it made.
      if ((e2 as NodeJS.ErrnoException).code !== 'EEXIST') throw e2;
      st = lstatSync(dir);
    }
  }
  if (st?.isSymbolicLink()) throw new CommetError('state error: .git/commet is a symlink; refusing to write through it', EXIT.state);
  if (st && !st.isDirectory()) throw new CommetError('state error: .git/commet is not a directory', EXIT.state);
  chmodSync(dir, 0o700);
  return dir;
}

/**
 * Atomic write (tmp + rename) with mode 0600. Any stale entry at the temp path is unlinked (a
 * symlink itself, not its target) and the temp file is created exclusively (`wx`), so a planted
 * file or symlink is never written through.
 */
export function writeAtomic(file: string, data: string | Uint8Array): void {
  const tmp = `${file}.tmp-${process.pid}`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, data, { mode: 0o600, flag: 'wx' });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

/** Largest state file read into memory (snapshot.json is the big one). */
export const MAX_STATE_BYTES = 256 * 1024 * 1024;

// O_NOFOLLOW refuses a link planted at the file itself, even after the realpath check (not on
// Windows, where the realpath check alone holds); O_NONBLOCK keeps a planted FIFO from hanging the
// open before fstat can refuse it.
const openFlags = () => constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const symlinked = (name: string) => new CommetError(`state error: .git/commet/${name} is or sits behind a symlink; refusing to read it`, EXIT.state);
const notFile = (name: string) => new CommetError(`state error: .git/commet/${name} is not a regular file`, EXIT.state);
const tooBig = (name: string) => new CommetError(`state error: .git/commet/${name} is larger than ${MAX_STATE_BYTES >> 20} MiB`, EXIT.state);

/** A failed open or realpath: absent is null, a link is a state error, anything else is rethrown. */
function openFailed(name: string, e: unknown): null {
  if (e instanceof CommetError) throw e;
  const code = (e as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return null;
  if (code === 'ELOOP') throw symlinked(name);
  throw e;
}

function checkOpened(name: string, st: { isFile(): boolean; size: number }): void {
  if (!st.isFile()) throw notFile(name);
  if (st.size > MAX_STATE_BYTES) throw tooBig(name);
}

/**
 * Reads `<state dir>/<name>`, or null when it's absent (the one set of rules for every state read,
 * Rule 2, #54). `dir` is canonical (stateDir and `commet open` build it from a real path), so a file
 * whose real path isn't itself sits behind a symlink, the file or a folder swapped for one, and is
 * refused. So is anything but a regular file, or one over MAX_STATE_BYTES (exit 5). Messages name the
 * file, never its absolute path.
 */
export function readStateFile(dir: string, name: string): string | null {
  const file = join(dir, name);
  let fd: number;
  try {
    if (realpathSync.native(file) !== file) throw symlinked(name);
    fd = openSync(file, openFlags());
  } catch (e) {
    return openFailed(name, e);
  }
  try {
    checkOpened(name, fstatSync(fd));
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/** readStateFile for the server: the same rules, async (a large snapshot doesn't block other requests) and as bytes. */
export async function readStateBytes(dir: string, name: string): Promise<Buffer | null> {
  const file = join(dir, name);
  let handle: FileHandle;
  try {
    if ((await realpath(file)) !== file) throw symlinked(name);
    handle = await open(file, openFlags());
  } catch (e) {
    return openFailed(name, e);
  }
  try {
    checkOpened(name, await handle.stat());
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
