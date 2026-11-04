import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** `<git-common-dir>/commet`, mode 0700. Shared by every worktree of the repo. */
export function stateDir(commonDir: string): string {
  const dir = join(commonDir, 'commet');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

/**
 * Atomic write (tmp + rename) with mode 0600. The temp file is created exclusively (`wx`), so a
 * pre-planted file or symlink at its path is never written through; a stale one is removed
 * (unlinking a symlink, not its target) and creation retried once.
 */
export function writeAtomic(file: string, data: string | Uint8Array): void {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, data, { mode: 0o600, flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    rmSync(tmp, { force: true });
    writeFileSync(tmp, data, { mode: 0o600, flag: 'wx' });
  }
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}
