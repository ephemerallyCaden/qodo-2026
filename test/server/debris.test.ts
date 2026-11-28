// GET /api/debris (R13): behind the Host, origin and token gates, GET only, and nothing but the DebrisView, which
// names no branch, person or commit (Rules 2 and 6). GET /api/debris-detail: one piece's panel, same gates, exact
// query keys, 409 for another head, 404 for an id the snapshot lacks.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import { DEBRIS_WARNINGS, type DebrisDetail, type DebrisDetailQuery, type DebrisDetailResult, type DebrisView } from '../../src/core/contract/debris.js';
import type { DebrisId } from '../../src/core/snapshot/types.js';
import { newToken } from '../../src/server/guard.js';
import { startServer } from '../../src/server/server.js';
import { req } from '../fixtures/http.js';
import { realTempDir } from '../fixtures/tmp.js';

const HEAD = 'c'.repeat(40);
const ID = 'x_00000000000a' as DebrisId;
const view: DebrisView = {
  schemaVersion: 'debris.1', head: HEAD, total: 2, placed: 1, mass: 12, unreadable: 0, prs: 'not-read', needsRescan: false,
  pieces: [{ id: ID, cls: 'branch', home: 'd_00000000000a', ageStep: 1, lines: 12, seed: 7 }, { id: 'x_00000000000b', cls: 'merged', home: null, ageStep: 0, lines: 0, seed: 9 }],
};
const detail: DebrisDetail = {
  ok: true, schemaVersion: 'debris-detail.1', head: HEAD, id: ID, cls: 'branch', name: 'old-feature', remoteOnly: false, ageDays: 91,
  lastCommit: { sha: 'b'.repeat(40), short: 'bbbbbbb', subject: 'old-feature: new engine part', date: '2026-08-01T10:00:00Z' }, aheadCount: 1, lines: 12,
  creator: { displayName: 'Pip Okafor', captain: false, agent: false }, sessions: [], planets: ['d_00000000000a'], home: 'd_00000000000a', filesOutside: 1,
  worktree: null, rebased: false, cleanup: "git branch -d -- 'old-feature'", inspect: "git log --oneline HEAD..'refs/heads/old-feature' --", warning: DEBRIS_WARNINGS.unmerged,
};

async function serve(extra: { debris?: () => Promise<DebrisView>; debrisDetail?: (q: DebrisDetailQuery) => Promise<DebrisDetailResult> }) {
  const root = realTempDir('commet-debris-route-');
  const state = join(root, 'state');
  mkdirSync(state, { mode: 0o700 });
  writeFileSync(join(state, 'snapshot.json'), JSON.stringify({ schemaVersion: '0.2', repo: { repoId: 'r', head: HEAD } }));
  const token = newToken();
  const server = await startServer({ stateDir: state, webRoot: join(root, 'web'), port: 0, token, pollMs: 100, ...extra });
  return { server, token, auth: { [TOKEN_HEADER]: token }, close: async () => { await server.close(); rmSync(root, { recursive: true, force: true }); } };
}

describe('GET /api/debris', () => {
  let on: Awaited<ReturnType<typeof serve>>;
  let off: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => {
    on = await serve({ debris: async () => view });
    off = await serve({});
  });
  afterAll(async () => {
    await on.close();
    await off.close();
  });

  it('answers the DebrisView, with no name, creator, commit or path (Rules 2 and 6)', async () => {
    const r = await req(on.server.port, { path: API.debris, headers: on.auth });
    expect(r.status).toBe(200);
    expect(r.raw).toContain('application/json');
    expect(JSON.parse(r.body)).toEqual(view);
    expect(r.body).not.toMatch(/"(name|creator|displayName|subject|sha|ref|path|email|cleanup)"/);
    expect(r.raw).not.toContain(on.token);
  });

  it('refuses without the token, a foreign Host, a cross-origin request and every method but GET', async () => {
    const port = on.server.port;
    for (const path of [API.debris, `${API.debris}?t=${on.token}`]) expect((await req(port, { path })).status, path).toBe(401);
    expect((await req(port, { path: API.debris, host: `rebind.attacker.example:${port}`, headers: on.auth })).status).toBe(421);
    expect((await req(port, { path: API.debris, headers: { ...on.auth, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect((await req(port, { method, path: API.debris, headers: on.auth })).status, method).toBe(405);
    }
  });

  it('answers 501 when no debris source is wired', async () => {
    expect((await req(off.server.port, { path: API.debris, headers: off.auth })).status).toBe(501);
  });
});

describe('GET /api/debris-detail', () => {
  let on: Awaited<ReturnType<typeof serve>>;
  let off: Awaited<ReturnType<typeof serve>>;
  const asked: DebrisDetailQuery[] = [];
  const answer = async (q: DebrisDetailQuery): Promise<DebrisDetailResult> => {
    asked.push(q);
    if (q.at !== HEAD) return { ok: false, error: 'unknown-head', head: HEAD };
    return q.id === ID ? detail : { ok: false, error: 'no-such-item' };
  };
  const path = (id: string, at: string) => `${API.debrisDetail}?${new URLSearchParams({ id, at })}`;
  beforeAll(async () => {
    on = await serve({ debrisDetail: answer });
    off = await serve({});
  });
  afterAll(async () => {
    await on.close();
    await off.close();
  });

  it("answers the piece's panel for the current head, passing the id and head through", async () => {
    asked.length = 0;
    const r = await req(on.server.port, { path: path(ID, HEAD), headers: on.auth });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual(detail);
    expect(asked).toEqual([{ id: ID, at: HEAD }]);
  });

  it('409 with the current head for another head, 404 with fixed text for an id it lacks', async () => {
    const stale = await req(on.server.port, { path: path(ID, 'e'.repeat(40)), headers: on.auth });
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    const unknown = await req(on.server.port, { path: path('x_0123456789ab', HEAD), headers: on.auth });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toBe(JSON.stringify({ ok: false, error: 'no-such-item' }));
  });

  it('refuses a malformed query with 400 before asking for anything', async () => {
    asked.length = 0;
    const bad = [
      API.debrisDetail, `${API.debrisDetail}?id=${ID}`, `${API.debrisDetail}?at=${HEAD}`, `${path(ID, HEAD)}&id=${ID}`, `${path(ID, HEAD)}&ref=main`,
      path('x_', HEAD), path('x_0123456789abcd', HEAD), path('p_0123456789ab', HEAD), path('refs/heads/main', HEAD), path('-x;id', HEAD),
      path(ID.toUpperCase(), HEAD), path(ID, 'HEAD'), path(ID, HEAD.slice(1)), path(ID, `${HEAD}^`),
    ];
    for (const p of bad) {
      const r = await req(on.server.port, { path: p, headers: on.auth });
      expect(r.status, p).toBe(400);
      expect(r.body, p).not.toMatch(/refs|main|HEAD\^|;id/);
    }
    expect(asked).toEqual([]);
  });

  it('refuses without the token, a foreign Host, a cross-origin request and every method but GET', async () => {
    const port = on.server.port;
    expect((await req(port, { path: path(ID, HEAD) })).status).toBe(401);
    expect((await req(port, { path: path(ID, HEAD), host: `rebind.attacker.example:${port}`, headers: on.auth })).status).toBe(421);
    expect((await req(port, { path: path(ID, HEAD), headers: { ...on.auth, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect((await req(port, { method, path: path(ID, HEAD), headers: on.auth })).status, method).toBe(405);
    }
  });

  it('answers 501 when no panel source is wired', async () => {
    expect((await req(off.server.port, { path: path(ID, HEAD), headers: off.auth })).status).toBe(501);
  });
});
