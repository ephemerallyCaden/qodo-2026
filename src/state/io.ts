import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises';
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
 * Atomic write (tmp + rename) with mode 0600 (or `mode`). Any stale entry at the temp path is
 * unlinked (a symlink itself, not its target) and the temp file is created exclusively (`wx`), so
 * a planted file or symlink is never written through.
 */
export function writeAtomic(file: string, data: string | Uint8Array, mode = 0o600): void {
  const tmp = `${file}.tmp-${process.pid}`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, data, { mode, flag: 'wx' });
  chmodSync(tmp, mode);
  renameSync(tmp, file);
}

/**
 * Appends lines (`text` ends in a newline) to `<state dir>/<name>` (created 0600) in one write, so
 * concurrent appenders never interleave a record. A file left ending mid-line (a write cut short)
 * gets a newline first, so the fragment stays one bad line and never swallows the next record. A
 * link planted at the file is refused by O_NOFOLLOW (the state dir itself is checked by stateDir),
 * and anything but a regular file is refused before writing (exit 5).
 */
export function appendStateLines(dir: string, name: string, text: string): void {
  const flags = constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  let fd: number;
  try {
    fd = openSync(join(dir, name), flags, 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ELOOP') throw symlinked(name);
    throw e;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw notFile(name);
    const last = Buffer.alloc(1);
    const cut = st.size > 0 && readSync(fd, last, 0, 1, st.size - 1) === 1 && last[0] !== 0x0a;
    const bytes = Buffer.from(cut ? `\n${text}` : text, 'utf8');
    // A short write (a full disk) leaves a cut-off line, which the reader counts as dropped.
    if (writeSync(fd, bytes) !== bytes.length) throw new CommetError(`state error: .git/commet/${name}: short write`, EXIT.state);
  } finally {
    closeSync(fd);
  }
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

/**
 * A failed open or realpath: absent is null, a link is a state error, anything else is rethrown.
 * realpath also says ENOENT for a dangling symlink, so `present` (whether anything is at the path
 * itself) tells that apart from an absent file (Qodo #32 local r1).
 */
function openFailed(name: string, e: unknown, present: boolean): null {
  if (e instanceof CommetError) throw e;
  const code = (e as NodeJS.ErrnoException).code;
  if (code === 'ENOENT' && !present) return null;
  if (code === 'ENOENT' || code === 'ELOOP') throw symlinked(name);
  throw e;
}

function checkOpened(name: string, st: { isFile(): boolean; size: number }): void {
  if (!st.isFile()) throw notFile(name);
  if (st.size > MAX_STATE_BYTES) throw tooBig(name);
}

/**
 * Reads `<state dir>/<name>`, or null when it's absent: the one state reader (Rule 2, #54), async so
 * the server isn't blocked by a large snapshot. `dir` is canonical (stateDir and `commet open` build
 * it from a real path), so a file whose real path isn't itself sits behind a symlink, the file or a
 * folder swapped for one, and is refused; so is a dangling link, anything but a regular file, or one
 * over MAX_STATE_BYTES (exit 5). Messages name the file, never its absolute path.
 */
export async function readStateBytes(dir: string, name: string): Promise<Buffer | null> {
  const file = join(dir, name);
  let handle: FileHandle;
  try {
    if ((await realpath(file)) !== file) throw symlinked(name);
    handle = await open(file, openFlags());
  } catch (e) {
    return openFailed(name, e, await lstat(file).then(() => true, () => false));
  }
  try {
    checkOpened(name, await handle.stat());
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
