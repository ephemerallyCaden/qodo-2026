// GET /api/crew (#207 C6): behind the Host, origin and token gates, GET only, and nothing but the CrewView,
// which carries no count of any kind per person (Rule 6). GET /api/crew-detail (#207 C5): one person's panel,
// same gates, exact query keys, 409 for another head, 404 for a stranger or a bot.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import type { CrewDetail, CrewDetailQuery, CrewDetailResult, CrewView } from '../../src/core/contract/crew.js';
import type { PersonId } from '../../src/core/snapshot/types.js';
import { newToken } from '../../src/server/guard.js';
import { startServer } from '../../src/server/server.js';
import { req } from '../fixtures/http.js';
import { realTempDir } from '../fixtures/tmp.js';

const HEAD = 'c'.repeat(40);
const ME = 'p_000000000001' as PersonId;
const MATE = 'p_000000000002' as PersonId;
const crew: CrewView = {
  schemaVersion: 'crew.1', head: HEAD, total: 2, bots: 1, needsRescan: false,
  members: [{ person: ME, displayName: 'Nova Reyes', seed: 7, captain: true }, { person: MATE, displayName: 'Ada Quill', seed: 9, captain: false }],
};
const detail: CrewDetail = {
  ok: true, schemaVersion: 'crew-detail.1', head: HEAD, person: MATE, displayName: 'Ada Quill', captain: false, lastActive: '2026-10-12T10:00:00Z',
  planets: [{ home: 'd_00000000000a', touches: 2 }], files: [{ fileId: 'f_000000000001', path: 'engine/core.ts', home: 'd_00000000000a', touches: 2 }],
  otherFiles: 0, needsRescan: false,
};

async function serve(extra: { crew?: () => Promise<CrewView>; crewDetail?: (q: CrewDetailQuery) => Promise<CrewDetailResult> }) {
  const root = realTempDir('commet-crew-route-');
  const state = join(root, 'state');
  mkdirSync(state, { mode: 0o700 });
  writeFileSync(join(state, 'snapshot.json'), JSON.stringify({ schemaVersion: '0.2', repo: { repoId: 'r', head: HEAD } }));
  const token = newToken();
  const server = await startServer({ stateDir: state, webRoot: join(root, 'web'), port: 0, token, pollMs: 100, ...extra });
  return { server, token, auth: { [TOKEN_HEADER]: token }, close: async () => { await server.close(); rmSync(root, { recursive: true, force: true }); } };
}

describe('GET /api/crew', () => {
  let on: Awaited<ReturnType<typeof serve>>;
  let off: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => {
    on = await serve({ crew: async () => crew });
    off = await serve({});
  });
  afterAll(async () => {
    await on.close();
    await off.close();
  });

  it('answers the CrewView, with no count, path or email per person (Rule 6, C7)', async () => {
    const r = await req(on.server.port, { path: API.crew, headers: on.auth });
    expect(r.status).toBe(200);
    expect(r.raw).toContain('application/json');
    expect(JSON.parse(r.body)).toEqual(crew);
    expect(r.body).not.toMatch(/"(touches|files|planets|commits|lastActive|otherFiles|lines|edits|path|email)"/);
    expect(r.body).not.toContain('@');
    expect(r.raw).not.toContain(on.token);
  });

  it('refuses without the token, a foreign Host, a cross-origin request and every method but GET', async () => {
    const port = on.server.port;
    for (const path of [API.crew, `${API.crew}?t=${on.token}`]) expect((await req(port, { path })).status, path).toBe(401);
    expect((await req(port, { path: API.crew, headers: { [TOKEN_HEADER]: 'x' } })).status).toBe(401);
    expect((await req(port, { path: API.crew, host: `rebind.attacker.example:${port}`, headers: on.auth })).status).toBe(421);
    expect((await req(port, { path: API.crew, headers: { ...on.auth, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect((await req(port, { method, path: API.crew, headers: on.auth })).status, method).toBe(405);
    }
  });

  it('answers 501 when no crew source is wired', async () => {
    expect((await req(off.server.port, { path: API.crew, headers: off.auth })).status).toBe(501);
  });
});

describe('GET /api/crew-detail', () => {
  let on: Awaited<ReturnType<typeof serve>>;
  let off: Awaited<ReturnType<typeof serve>>;
  const asked: CrewDetailQuery[] = [];
  const answer = async (q: CrewDetailQuery): Promise<CrewDetailResult> => {
    asked.push(q);
    if (q.at !== HEAD) return { ok: false, error: 'unknown-head', head: HEAD };
    return q.person === MATE ? detail : { ok: false, error: 'no-such-person' };
  };
  const path = (person: string, at: string) => `${API.crewDetail}?${new URLSearchParams({ person, at })}`;
  beforeAll(async () => {
    on = await serve({ crewDetail: answer });
    off = await serve({});
  });
  afterAll(async () => {
    await on.close();
    await off.close();
  });

  it("answers the person's panel for the current head, passing the person and head through", async () => {
    asked.length = 0;
    const r = await req(on.server.port, { path: path(MATE, HEAD), headers: on.auth });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual(detail);
    expect(asked).toEqual([{ person: MATE, at: HEAD }]);
    expect(r.raw).not.toContain(on.token);
  });

  it('409 with the current head for another head, 404 with fixed text for a stranger or a bot', async () => {
    const stale = await req(on.server.port, { path: path(MATE, 'e'.repeat(40)), headers: on.auth });
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    const unknown = await req(on.server.port, { path: path('p_0123456789ab', HEAD), headers: on.auth });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toBe(JSON.stringify({ ok: false, error: 'no-such-person' }));
  });

  it('refuses a malformed query with 400 before asking for anything', async () => {
    asked.length = 0;
    const bad = [
      API.crewDetail, `${API.crewDetail}?person=${MATE}`, `${API.crewDetail}?at=${HEAD}`,
      `${path(MATE, HEAD)}&person=${MATE}`, `${path(MATE, HEAD)}&at=${HEAD}`, `${path(MATE, HEAD)}&email=a@b.test`,
      path('p_', HEAD), path('s_000000000001', HEAD), path('p_../../etc', HEAD), path(`p_${'0'.repeat(65)}`, HEAD),
      path('ada@crew.test', HEAD), path(MATE.toUpperCase(), HEAD), path(MATE, 'HEAD'), path(MATE, HEAD.slice(1)), path(MATE, `${HEAD}^`),
    ];
    for (const p of bad) {
      const r = await req(on.server.port, { path: p, headers: on.auth });
      expect(r.status, p).toBe(400);
      expect(r.body, p).not.toMatch(/etc|@|HEAD\^/);
    }
    expect(asked).toEqual([]);
  });

  it('refuses without the token, a foreign Host, a cross-origin request and every method but GET', async () => {
    const port = on.server.port;
    expect((await req(port, { path: path(MATE, HEAD) })).status).toBe(401);
    expect((await req(port, { path: `${path(MATE, HEAD)}&t=${on.token}` })).status).toBe(401);
    expect((await req(port, { path: path(MATE, HEAD), host: `rebind.attacker.example:${port}`, headers: on.auth })).status).toBe(421);
    expect((await req(port, { path: path(MATE, HEAD), headers: { ...on.auth, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect((await req(port, { method, path: path(MATE, HEAD), headers: on.auth })).status, method).toBe(405);
    }
  });

  it('answers 501 when no panel source is wired', async () => {
    expect((await req(off.server.port, { path: path(MATE, HEAD), headers: off.auth })).status).toBe(501);
  });
});
