import { chmodSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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
    mkdirSync(dir, { mode: 0o700 });
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
