// Qodo #32 r1: a state file whose read fails once (a transient I/O error) must be read again on the
// next check, not skipped because its metadata hasn't changed since.
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { writeAtomic } from '../../src/state/io.js';
import { waitFor } from '../fixtures/http.js';

const failing = vi.hoisted(() => ({ reads: 0 }));
vi.mock('../../src/server/files.js', async (orig) => {
  const files = await orig<typeof import('../../src/server/files.js')>();
  return {
    ...files,
    readStateFile: async (dir: string, name: string) => {
      if (failing.reads > 0) {
        failing.reads--;
        throw Object.assign(new Error('transient read failure'), { code: 'EIO' });
      }
      return files.readStateFile(dir, name);
    },
  };
});

it('retries a state file whose read failed, and reports its new content', async () => {
  const { watchState } = await import('../../src/server/watch.js');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-watch-')));
  writeFileSync(join(dir, 'snapshot.json'), 'v1');
  const seen: string[] = [];
  const w = await watchState(dir, ['snapshot.json'], (_name, body) => seen.push(body.toString()), 50);
  try {
    failing.reads = 1;
    writeAtomic(join(dir, 'snapshot.json'), 'v2');
    await waitFor(() => failing.reads === 0, 5_000, 'the failed read');
    await waitFor(() => seen.length > 0, 5_000, 'the retried read');
    expect(seen).toEqual(['v2']);
  } finally {
    w.close();
  }
});
