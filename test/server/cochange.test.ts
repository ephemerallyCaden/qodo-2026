// GET /api/cochange (#211, R9): behind the server's Host, origin and token gates, GET only, 501 when
// unwired; and the real state module on a scanned fixture repo: the flag the latest change raised, and
// charting the flagged file dismisses it (counted), as the fog counts that chart.
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import type { CoChangeView } from '../../src/core/contract/cochange.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { applyChart } from '../../src/state/chart.js';
import { readCoChange } from '../../src/state/cochange.js';
import { buildCoChangeRepo, type CoChangeRepo } from '../fixtures/build/cochange.js';
import { cli } from '../fixtures/cli.js';
import { req } from '../fixtures/http.js';

describe('the co-change route on a scanned repo', () => {
  let repo: CoChangeRepo;
  let server: CommetServer;
  let without: CommetServer;
  const token = newToken();
  const auth = { [TOKEN_HEADER]: token };

  beforeAll(async () => {
    repo = await buildCoChangeRepo();
    expect((await cli(['scan', '--no-ingest', '--no-root'], repo.dir, { ...process.env, CLAUDE_CONFIG_DIR: join(repo.dir, 'no-claude') })).code).toBe(0);
    const base = { stateDir: join(repo.dir, '.git', 'commet'), webRoot: join(repo.dir, 'no-web'), port: 0, token, pollMs: 100 };
    server = await startServer({ ...base, cochange: () => readCoChange(repo.dir) });
    without = await startServer(base);
  });
  afterAll(async () => {
    await server.close();
    await without.close();
  });

  const get = async (): Promise<CoChangeView> => {
    const r = await req(server.port, { path: API.cochange, headers: auth });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.raw).not.toContain(token);
    return JSON.parse(r.body) as CoChangeView;
  };

  it('answers the links, the standing flag and the files they name, with repo-relative paths only', async () => {
    const v = await get();
    expect(v).toMatchObject({ schemaVersion: 'cochange.1', head: repo.head, needsRescan: false, dismissed: 0 });
    expect(v.flags.map((f) => [f.fileId, f.with])).toContainEqual([fileIdOf('web/model/fog-model.ts'), fileIdOf('src/core/fog.ts')]);
    expect(v.files.find((f) => f.fileId === fileIdOf('web/model/fog-model.ts'))).toMatchObject({ path: 'web/model/fog-model.ts', home: expect.stringMatching(/^d_/) });
    expect(v.files.find((f) => f.path === 'README.md')?.home).toBe('star');
    expect(JSON.stringify(v)).not.toContain(repo.dir); // no absolute path (Rule 2)
  });

  it('refuses without the token, or with another method; 501 when unwired', async () => {
    for (const headers of [{}, { [TOKEN_HEADER]: 'x' }]) expect((await req(server.port, { path: API.cochange, headers })).status).toBe(401);
    expect((await req(server.port, { path: `${API.cochange}?t=${token}` })).status).toBe(401);
    expect((await req(server.port, { method: 'POST', path: API.cochange, headers: auth, body: '{}' })).status).toBe(405);
    expect((await req(without.port, { path: API.cochange, headers: auth })).status).toBe(501);
  });

  it('dismisses the flag once its file is charted at the head the view saw, and counts it', async () => {
    const flagged = fileIdOf('web/model/fog-model.ts');
    const charted = await applyChart(repo.dir, { kind: 'chart', fileId: flagged, at: repo.head });
    expect(charted.ok).toBe(true);
    const v = await get();
    expect(v.flags.map((f) => f.fileId)).not.toContain(flagged);
    expect(v.dismissed).toBe(1);
    expect(v.links.length).toBeGreaterThan(0); // charting changes no pair
  });
});
