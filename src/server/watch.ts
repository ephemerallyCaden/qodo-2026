// Live updates for `commet open` (R14 AC 6): notices when `commet scan` replaces a state file.
import { createHash } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readStateFile } from './files.js';

export interface StateWatcher { close(): void }

/**
 * Calls `onChange(name, body)` whenever one of `names` in `dir` gets new content. Resolves once the
 * current contents are recorded, so nothing that exists at start counts as a change. fs.watch on the
 * directory (writeAtomic renames, so a file watch would lose the inode) gives low latency; a stat
 * poll backs it up where watch events are lost or unsupported. Content hashes decide, so rewriting
 * identical bytes is not an update. A file that vanishes or can't be read sends nothing: its GET
 * route reports the problem when the view asks.
 */
export async function watchState(dir: string, names: readonly string[], onChange: (name: string, body: Buffer) => void,
  pollMs = 1000): Promise<StateWatcher> {
  const seen = new Map<string, { sig: string; hash: string }>();
  let closed = false;

  const scanOnce = async (): Promise<void> => {
    for (const name of names) {
      const sig = await signature(join(dir, name));
      const prev = seen.get(name);
      if (prev?.sig === sig) continue;
      const body = await readStateFile(dir, name).catch(() => null);
      const hash = body ? createHash('sha256').update(body).digest('hex') : '';
      seen.set(name, { sig, hash });
      if (prev && prev.hash !== hash && body && !closed) onChange(name, body);
    }
  };
  // One check at a time, in order. scanOnce catches its own I/O errors; the next poll retries anything else.
  let chain = Promise.resolve();
  const check = (): Promise<void> => (chain = chain.then(scanOnce).catch(() => {}));

  await check();
  let debounce: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void check(), 25);
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(dir, { persistent: false }, (_event, file) => {
      if (file === null || names.includes(String(file))) schedule();
    });
    watcher.on('error', () => watcher?.close());
  } catch {
    // No fs.watch here (some network and virtual filesystems): the poll below still delivers updates.
  }
  const poll = setInterval(() => void check(), pollMs);
  poll.unref();
  return {
    close() {
      closed = true;
      clearTimeout(debounce);
      clearInterval(poll);
      watcher?.close();
    },
  };
}

/** Identity plus size and times: a cheap prefilter, so an unchanged file is never re-read. */
async function signature(file: string): Promise<string> {
  try {
    const s = await lstat(file);
    return `${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code ?? 'error';
  }
}
