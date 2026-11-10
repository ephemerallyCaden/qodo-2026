import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Reads `<state dir>/<name>`, or null when it's absent. A symlink or anything but a regular file is
 * refused (exit 5). O_NOFOLLOW makes the open itself refuse a link planted after any check, and
 * O_NONBLOCK keeps a planted FIFO from hanging the open before fstat can refuse it.
 */
export function readStateFile(dir: string, name: string): string | null {
  let fd: number;
  try {
    fd = openSync(join(dir, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (code === 'ELOOP') throw new CommetError(`state error: .git/commet/${name} is a symlink; refusing to read through it`, EXIT.state);
    throw e;
  }
  try {
    if (!fstatSync(fd).isFile()) throw new CommetError(`state error: .git/commet/${name} is not a regular file`, EXIT.state);
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}
