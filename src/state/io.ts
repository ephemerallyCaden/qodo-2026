import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** `<git-common-dir>/commet`, mode 0700. Shared by every worktree of the repo. */
export function stateDir(commonDir: string): string {
  const dir = join(commonDir, 'commet');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

/** Atomic write (tmp + rename) with mode 0600. */
export function writeAtomic(file: string, data: string | Uint8Array): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}
