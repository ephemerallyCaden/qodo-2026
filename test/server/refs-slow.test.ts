// Qodo local 8137f492 (#95): a refs check slower than the poll must not pile up more checks behind
// it. At most one runs and one waits, so once the watcher is closed the work stops.
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { hookRepo } from '../fixtures/hooks.js';

const slow = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/server/watch.js', async (orig) => {
  const real = await orig<typeof import('../../src/server/watch.js')>();
  return {
    ...real,
    signature: async (file: string) => {
      slow.calls++;
      await new Promise((r) => setTimeout(r, 50));
      return real.signature(file);
    },
  };
});

it('a check slower than the poll interval never queues more than one more check', async () => {
  const { watchRefs } = await import('../../src/server/refs.js');
  const dir = hookRepo();
  const w = await watchRefs(join(dir, '.git'), () => undefined, 5);
  await new Promise((r) => setTimeout(r, 1000)); // ~200 polls while each check takes ~200 ms
  w.close();
  const atClose = slow.calls;
  await new Promise((r) => setTimeout(r, 1500));
  // At most the check running at close and the one waiting finish (4 lstats each): not a backlog of ~200.
  expect(slow.calls - atClose).toBeLessThanOrEqual(8);
});
