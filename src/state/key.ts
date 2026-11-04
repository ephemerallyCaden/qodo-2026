import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CommetError, EXIT } from '../core/errors.js';

/**
 * The per-repo HMAC key for line hashes: 32 random bytes in `.git/commet/key` (0600). This is
 * the only randomness Commet uses, and it is an input: snapshots never depend on it.
 */
export function loadOrCreateKey(dir: string): Uint8Array {
  const file = join(dir, 'key');
  try {
    writeFileSync(file, randomBytes(32), { mode: 0o600, flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  const key = readFileSync(file);
  if (key.length !== 32) throw new CommetError('state error: .git/commet/key is not a 32-byte key', EXIT.state);
  return new Uint8Array(key);
}
