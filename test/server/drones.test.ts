// GET /api/drones (#80 AC 3): behind the Host, origin and token gates, GET only, and nothing but the DroneView.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { miniDrones } from '../fixtures/contract/mini.js';
import { req } from '../fixtures/http.js';
import { realTempDir } from '../fixtures/tmp.js';

describe('GET /api/drones', () => {
  let root: string;
  let withRoute: CommetServer;
  let without: CommetServer;
  const token = newToken();
  const auth = { [TOKEN_HEADER]: token };

  beforeAll(async () => {
    root = realTempDir('commet-drones-');
    const state = join(root, 'state');
    mkdirSync(state, { mode: 0o700 });
    writeFileSync(join(state, 'snapshot.json'), JSON.stringify({ schemaVersion: '0.2', repo: { repoId: 'r', head: miniDrones.head } }));
    const base = { stateDir: state, webRoot: join(root, 'web'), port: 0, token, pollMs: 100 };
    withRoute = await startServer({ ...base, drones: async () => miniDrones });
    without = await startServer(base);
  });
  afterAll(async () => {
    await withRoute.close();
    await without.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('answers the DroneView, with nothing else', async () => {
    const r = await req(withRoute.port, { path: API.drones, headers: auth });
    expect(r.status).toBe(200);
    expect(r.raw).toContain('application/json');
    expect(JSON.parse(r.body)).toEqual(miniDrones);
    // Rules 2 and 6: no path, subject or count fields, and the token is never echoed.
    expect(r.body).not.toMatch(/"(path|paths|subject|files|filesTouched|filesOutside|linesAdded|linesRemoved|commits)"/);
    expect(r.raw).not.toContain(token);
  });

  it('refuses without the token, with a wrong one, and with the token in the URL', async () => {
    for (const path of [API.drones, `${API.drones}?t=${token}`]) {
      expect((await req(withRoute.port, { path })).status, path).toBe(401);
    }
    expect((await req(withRoute.port, { path: API.drones, headers: { [TOKEN_HEADER]: 'x' } })).status).toBe(401);
  });

  it('refuses a foreign Host and a cross-origin request', async () => {
    expect((await req(withRoute.port, { path: API.drones, host: `rebind.attacker.example:${withRoute.port}`, headers: auth })).status).toBe(421);
    expect((await req(withRoute.port, { path: API.drones, headers: { ...auth, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
  });

  it('refuses every method but GET', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect((await req(withRoute.port, { method, path: API.drones, headers: auth })).status, method).toBe(405);
    }
  });

  it('answers 501 when no drone source is wired', async () => {
    expect((await req(without.port, { path: API.drones, headers: auth })).status).toBe(501);
  });
});
