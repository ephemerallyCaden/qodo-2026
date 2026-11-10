// Qodo PR #47 r1: every failure to listen is exit 6, "server bind failure" (system design §8), with
// a message for the user; anything else stays an internal error (exit 1).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/core/errors.js';
import { cli } from '../fixtures/cli.js';
import { miniRepo, type MiniRepo } from '../fixtures/mini.js';

const fail = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock('../../src/server/server.js', () => ({ startServer: async () => Promise.reject(fail.error) }));

const env = { ...process.env, CLAUDE_CONFIG_DIR: join(tmpdir(), 'commet-no-claude') };
let repo: MiniRepo;
const listenError = (code: string) => Object.assign(new Error(`listen ${code}: 127.0.0.1:80`), { code, syscall: 'listen' });

beforeAll(async () => {
  repo = miniRepo([{ id: 'c1', at: '2026-10-01T09:00:00Z', path: 'src/a.ts', lines: ['export const a = 1;'] }]);
  expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
});

it.each([
  ['EADDRINUSE', 'port 80 is already in use: pick another --port, or leave it out for a free one'],
  ['EACCES', 'not allowed to listen on port 80: pick a port above 1023, or leave --port out'],
  ['EADDRNOTAVAIL', "couldn't listen on 127.0.0.1:80 (EADDRNOTAVAIL)"],
])('a listen failure %s exits 6 with a clear message', async (code, message) => {
  fail.error = listenError(code);
  const r = await cli(['open', '--no-open', '--port', '80'], repo.dir, env);
  expect([r.code, r.err]).toEqual([EXIT.bind, `commet: ${message}\n`]);
});

it('any other startup failure stays an internal error', async () => {
  fail.error = new Error('something else');
  const r = await cli(['open', '--no-open'], repo.dir, env);
  expect([r.code, r.err]).toEqual([EXIT.internal, 'commet: internal error (set COMMET_DEBUG=1 for details)\n']);
});
