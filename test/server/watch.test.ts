// Qodo #32 r1: a state file whose read fails once (a transient I/O error) must be read again on the
// next check, not skipped because its metadata hasn't changed since. #32 AC 8: one unreadable at the
// start is unknown, so its first good read is announced, exactly once.
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { writeAtomic } from '../../src/state/io.js';
import { waitFor } from '../fixtures/http.js';

const failing = vi.hoisted(() => ({ reads: 0 }));
vi.mock('../../src/state/io.js', async (orig) => {
  const io = await orig<typeof import('../../src/state/io.js')>();
  return {
    ...io,
    readStateBytes: async (dir: string, name: string) => {
      if (failing.reads > 0) {
        failing.reads--;
        throw Object.assign(new Error('transient read failure'), { code: 'EIO' });
      }
      return io.readStateBytes(dir, name);
    },
  };
});

it('retries a state file whose read failed, and reports its new content', async () => {
  const { watchState } = await import('../../src/server/watch.js');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-watch-')));
  writeFileSync(join(dir, 'snapshot.json'), 'v1');
  const seen: string[] = [];
  const w = await watchState(dir, ['snapshot.json'], (_name, body, change) => seen.push(`${change}:${String(body)}`), 50);
  try {
    failing.reads = 1;
    writeAtomic(join(dir, 'snapshot.json'), 'v2');
    await waitFor(() => failing.reads === 0, 5_000, 'the failed read');
    await waitFor(() => seen.length > 1, 5_000, 'the retried read');
    expect(seen).toEqual(['unreadable:null', 'changed:v2']);
  } finally {
    w.close();
  }
});

it('announces a file unreadable at the start once it reads, exactly once, even with the same bytes (#32 AC 8)', async () => {
  const { watchState } = await import('../../src/server/watch.js');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-watch-')));
  writeFileSync(join(dir, 'snapshot.json'), 'same bytes');
  const seen: string[] = [];
  failing.reads = 1;
  const w = await watchState(dir, ['snapshot.json'], (_name, body, change) => seen.push(`${change}:${String(body)}`), 50);
  try {
    expect(failing.reads).toBe(0);
    await waitFor(() => seen.length > 0, 5_000, 'the first good read');
    // Several more polls with nothing new: still one.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(seen).toEqual(['changed:same bytes']);
  } finally {
    w.close();
  }
});

it('reports a file that turns unreadable once, then that it reads again unchanged, never as new content', async () => {
  const { watchState } = await import('../../src/server/watch.js');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-watch-')));
  writeFileSync(join(dir, 'snapshot.json'), 'v1');
  const seen: string[] = [];
  const w = await watchState(dir, ['snapshot.json'], (_name, body, change) => seen.push(`${change}:${String(body)}`), 50);
  try {
    failing.reads = 3;
    // Same bytes, new inode: the watcher re-reads it, fails three times, then reads v1 again.
    writeAtomic(join(dir, 'snapshot.json'), 'v1');
    await waitFor(() => failing.reads === 0 && seen.length >= 2, 5_000, 'the failed reads and the recovery');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(seen).toEqual(['unreadable:null', 'readable:v1']);
  } finally {
    w.close();
  }
});
