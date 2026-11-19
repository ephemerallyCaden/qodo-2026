// GET /api/drones (#80 AC 3): behind the Host, origin and token gates, GET only, and nothing but the DroneView.
// GET /api/drone-detail (#148 AC 2): one session's detail, same gates, exact query keys, 409 for another head.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import { DETAIL_BUCKETS, type DroneDetail, type DroneDetailQuery, type DroneDetailResult } from '../../src/core/contract/drones.js';
import type { SessionKey } from '../../src/core/snapshot/types.js';
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
    // Rules 2 and 6: no path, subject or count fields, and the token is never echoed. The list never
    // carries a session's edit counts either: they are only in its own detail (#148).
    expect(r.body).not.toMatch(/"(path|paths|subject|files|filesTouched|filesOutside|linesAdded|linesRemoved|commits|fileEdits|editsOutside|editBuckets|edits|buckets|otherFiles|otherEdits)"/);
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

describe('GET /api/drone-detail', () => {
  let root: string;
  let withRoute: CommetServer;
  let without: CommetServer;
  const token = newToken();
  const auth = { [TOKEN_HEADER]: token };
  const HEAD = miniDrones.head;
  const KEY = miniDrones.sessions[0]!.key;
  const asked: DroneDetailQuery[] = [];
  const detail: DroneDetail = {
    ok: true, schemaVersion: 'drone-detail.1', head: HEAD, key: KEY, startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T10:00:00Z',
    files: [{ fileId: 'f_000000000001', path: 'src/a.ts', edits: 2 }], otherFiles: 1, otherEdits: 1,
    buckets: [2, ...new Array<number>(DETAIL_BUCKETS - 2).fill(0), 1], spanMs: 3_600_000, needsRescan: false,
  };
  const answer = async (q: DroneDetailQuery): Promise<DroneDetailResult> => {
    asked.push(q);
    if (q.at !== HEAD) return { ok: false, error: 'unknown-head', head: HEAD };
    return q.key === KEY ? detail : { ok: false, error: 'no-such-session' };
  };
  const path = (key: string, at: string) => `${API.droneDetail}?${new URLSearchParams({ key, at })}`;

  beforeAll(async () => {
    root = realTempDir('commet-drone-detail-');
    const state = join(root, 'state');
    mkdirSync(state, { mode: 0o700 });
    writeFileSync(join(state, 'snapshot.json'), JSON.stringify({ schemaVersion: '0.2', repo: { repoId: 'r', head: HEAD } }));
    const base = { stateDir: state, webRoot: join(root, 'web'), port: 0, token, pollMs: 100 };
    withRoute = await startServer({ ...base, droneDetail: answer });
    without = await startServer(base);
  });
  afterAll(async () => {
    await withRoute.close();
    await without.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('answers the session\'s detail for the current head, passing the key and head through', async () => {
    asked.length = 0;
    const r = await req(withRoute.port, { path: path(KEY, HEAD), headers: auth });
    expect(r.status).toBe(200);
    expect(r.raw).toContain('application/json');
    expect(JSON.parse(r.body)).toEqual(detail);
    expect(asked).toEqual([{ key: KEY, at: HEAD }]);
    expect(r.raw).not.toContain(token);
  });

  it('409 with the current head for another head, 404 for an unknown session', async () => {
    const stale = await req(withRoute.port, { path: path(KEY, 'e'.repeat(40)), headers: auth });
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    const unknown = await req(withRoute.port, { path: path('s_0123456789abcd', HEAD), headers: auth });
    expect(unknown.status).toBe(404);
    // A fixed error: it names neither the key nor a path.
    expect(unknown.body).toBe(JSON.stringify({ ok: false, error: 'no-such-session' }));
  });

  it('refuses a malformed query with 400 before asking for anything', async () => {
    asked.length = 0;
    const bad = [
      API.droneDetail, `${API.droneDetail}?key=${KEY}`, `${API.droneDetail}?at=${HEAD}`,
      `${path(KEY, HEAD)}&key=${KEY}`, `${path(KEY, HEAD)}&at=${HEAD}`, `${path(KEY, HEAD)}&path=src/a.ts`,
      path('s_', HEAD), path('f_000000000001', HEAD), path('s_../../etc', HEAD), path(`s_${'0'.repeat(65)}`, HEAD),
      path(KEY, 'HEAD'), path(KEY, HEAD.slice(1)), path(KEY, `${HEAD}^`), path(KEY.toUpperCase() as SessionKey, HEAD),
    ];
    for (const p of bad) {
      const r = await req(withRoute.port, { path: p, headers: auth });
      expect(r.status, p).toBe(400);
      expect(r.body, p).not.toMatch(/etc|src\/a|HEAD\^/);
    }
    expect(asked).toEqual([]);
  });

  it('refuses without the token, a foreign Host, a cross-origin request and every method but GET', async () => {
    expect((await req(withRoute.port, { path: path(KEY, HEAD) })).status).toBe(401);
    expect((await req(withRoute.port, { path: `${path(KEY, HEAD)}&t=${token}` })).status).toBe(401);
    expect((await req(withRoute.port, { path: path(KEY, HEAD), host: `rebind.attacker.example:${withRoute.port}`, headers: auth })).status).toBe(421);
    expect((await req(withRoute.port, { path: path(KEY, HEAD), headers: { ...auth, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect((await req(withRoute.port, { method, path: path(KEY, HEAD), headers: auth })).status, method).toBe(405);
    }
  });

  it('answers 501 when no detail source is wired', async () => {
    expect((await req(without.port, { path: path(KEY, HEAD), headers: auth })).status).toBe(501);
  });
});
