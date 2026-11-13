// Temp dirs for tests (#53). Every dir a test makes under the OS temp dir comes from tempDir(),
// which records it: test/setup/temp-cleanup.ts removes the file's dirs once its tests and hooks are
// done, pass or fail, and test/setup/temp-check.ts fails the run if any outlived its file (and
// removes what a killed run left). ESLint bans mkdtemp anywhere else under test/.
import { appendFileSync, chmodSync, lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where the run's global setup collects every dir made, one path per line (temp-check.ts). */
export const MANIFEST_ENV = 'COMMET_TEST_TEMP_MANIFEST';

/**
 * The dirs this process made and hasn't removed. Kept on globalThis, so a copy of this module loaded
 * again after vi.resetModules() adds to the same set the setup file empties.
 */
const made = ((globalThis as unknown as Record<symbol, Set<string> | undefined>)[Symbol.for('commet.test.tempDirs')] ??= new Set<string>());

/** `mkdtempSync(join(tmpdir(), prefix))`, removed when the test file ends. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.add(dir);
  const manifest = process.env[MANIFEST_ENV];
  if (manifest) appendFileSync(manifest, `${dir}\n`);
  return dir;
}

/** tempDir(), with symlinks resolved (on macOS, `/var/…` → `/private/var/…`). */
export const realTempDir = (prefix: string): string => realpathSync(tempDir(prefix));

/** Removes `dir` and everything in it, first opening up any folder a test locked (mode 000). Throws if it can't. */
export function removeTree(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    openUp(dir);
    rmSync(dir, { recursive: true, force: true });
  }
}

function openUp(path: string): void {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) openUp(join(path, name));
}

/** Removes every dir tempDir() made in this process so far. */
export function removeTempDirs(): void {
  for (const dir of made) {
    removeTree(dir);
    made.delete(dir);
  }
}
