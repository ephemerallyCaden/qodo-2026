// R14 server security suite (#32): every case is a real round trip on a 127.0.0.1 socket.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER, type ChartResult } from '../../src/core/contract/api.js';
import type { ChartAction } from '../../src/core/contract/fog.js';
import { hostAllowed, newToken, parseChartAction, sameOrigin, tokenMatches } from '../../src/server/guard.js';
import { bundleKey, loadBundle, MAX_FILE_BYTES } from '../../src/server/files.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { writeAtomic } from '../../src/state/io.js';
import { miniFog } from '../fixtures/contract/mini.js';
import { liveEvents, openStream, rawHttp, req, waitFor } from '../fixtures/http.js';

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const SECRET = 'TOP-SECRET-CANARY-outside-the-bundle';
const snapshotJson = (head: string) => JSON.stringify({ schemaVersion: '0.2', repo: { head } });

interface Fixture { root: string; state: string; web: string; token: string; server: CommetServer; port: number }

async function fixture(opts: { web?: boolean; chart?: (a: ChartAction) => Promise<ChartResult>; fog?: boolean } = {}): Promise<Fixture> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'commet-server-')));
  const state = join(root, 'state');
  const web = join(root, 'web');
  mkdirSync(state, { mode: 0o700 });
  writeFileSync(join(state, 'snapshot.json'), snapshotJson(HEAD_A));
  writeFileSync(join(root, 'secret.txt'), SECRET);
  if (opts.web !== false) {
    mkdirSync(join(web, 'assets'), { recursive: true });
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>commet view</title>');
    writeFileSync(join(web, 'assets', 'app.js'), "console.log('view');");
    writeFileSync(join(web, 'my file.js'), "console.log('spaced');");
    writeFileSync(join(web, '.hidden'), SECRET);
    mkdirSync(join(web, '.private'));
    writeFileSync(join(web, '.private', 'key.txt'), SECRET);
    symlinkSync(join(root, 'secret.txt'), join(web, 'leak.txt'));
    symlinkSync(root, join(web, 'linkdir'));
    symlinkSync(join(web, 'assets', 'app.js'), join(web, 'inner.js'));
  }
  const token = newToken();
  const server = await startServer({
    stateDir: state, webRoot: web, port: 0, token, pollMs: 100,
    ...(opts.chart ? { chart: opts.chart } : {}),
    ...(opts.fog ? { fog: async () => miniFog } : {}),
  });
  return { root, state, web, token, server, port: server.port };
}

async function teardown(f: Fixture) {
  await f.server.close();
  rmSync(f.root, { recursive: true, force: true });
}

describe('guards (unit)', () => {
  it('accepts only the two loopback Host spellings with our port', () => {
    expect(hostAllowed('127.0.0.1:4100', 4100)).toBe(true);
    expect(hostAllowed('localhost:4100', 4100)).toBe(true);
    expect(hostAllowed('LOCALHOST:4100', 4100)).toBe(true);
    for (const h of [undefined, '', '127.0.0.1', 'localhost', '127.0.0.1:4101', 'evil.example:4100', 'localhost.evil.example:4100',
      '127.0.0.1:4100.evil.example', '127.0.0.1:4100@evil.example', '[::1]:4100', '0.0.0.0:4100', '127.0.0.2:4100', ' 127.0.0.1:4100']) {
      expect(hostAllowed(h, 4100), String(h)).toBe(false);
    }
  });

  it('refuses any foreign Origin or cross-site fetch', () => {
    expect(sameOrigin(undefined, undefined, 4100)).toBe(true);
    expect(sameOrigin('http://127.0.0.1:4100', 'same-origin', 4100)).toBe(true);
    expect(sameOrigin('http://localhost:4100', undefined, 4100)).toBe(true);
    for (const [o, s] of [['null', undefined], ['http://evil.example', undefined], ['http://127.0.0.1:5173', undefined],
      ['https://127.0.0.1:4100', undefined], [undefined, 'cross-site'], [undefined, 'same-site'], ['http://127.0.0.1:4100', 'cross-site']] as const) {
      expect(sameOrigin(o, s, 4100), `${o} ${s}`).toBe(false);
    }
  });

  it('compares tokens exactly', () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(t);
    expect(tokenMatches(t, t)).toBe(true);
    for (const g of [undefined, '', t.slice(1), `${t}x`, `${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`, [t, t], `${t}, ${t}`]) {
      expect(tokenMatches(g, t)).toBe(false);
    }
  });

  it('accepts exactly the contract chart actions', () => {
    expect(parseChartAction({ kind: 'chart', fileId: 'f_000000000001' })).toEqual({ kind: 'chart', fileId: 'f_000000000001' });
    expect(parseChartAction({ kind: 'baseline' })).toEqual({ kind: 'baseline' });
    expect(parseChartAction({ kind: 'baseline-undo' })).toEqual({ kind: 'baseline-undo' });
    for (const v of [null, [], 'chart', { kind: 'chart' }, { kind: 'chart', fileId: '../x' }, { kind: 'chart', fileId: 'f_1' }, { kind: 'chart', fileId: 'f_000000000001\n' },
      { kind: 'chart', fileId: 'f_000000000001', extra: 1 }, { kind: 'baseline', fileId: 'f_000000000001' }, { kind: 'beacon' },
      { kind: 'unchart', fileId: 'f_000000000001' }]) {
      expect(parseChartAction(v), JSON.stringify(v)).toBeNull();
    }
  });

  it('allowlists only regular, non-dot files under the bundle, and never joins a request path', async () => {
    const f = await fixture();
    try {
      expect([...(await loadBundle(f.web))!.keys()].sort()).toEqual(['/assets/app.js', '/index.html', '/my file.js']);
      expect(await loadBundle(join(f.root, 'missing'))).toBeNull();
    } finally {
      await teardown(f);
    }
    expect(bundleKey('/')).toBe('/index.html');
    expect(bundleKey('/my%20file.js')).toBe('/my file.js');
    expect(bundleKey('/%2e%2e/secret.txt')).toBe('/../secret.txt');
    expect(bundleKey('/%zz')).toBeNull();
  });
});

describe('R14 server on a real socket', () => {
  let f: Fixture;
  const api = (path: string, extra: Record<string, string> = {}, method = 'GET', body?: string) =>
    req(f.port, { method, path, headers: { [TOKEN_HEADER]: f.token, ...extra }, ...(body === undefined ? {} : { body }) });

  beforeAll(async () => {
    f = await fixture();
  });
  afterAll(async () => teardown(f));

  describe('AC 1: binds 127.0.0.1 only', () => {
    it('answers on 127.0.0.1', async () => {
      expect((await req(f.port, { path: '/' })).status).toBe(200);
    });

    it('refuses connections on ::1 and on every non-loopback interface', async () => {
      const refused = (host: string) => new Promise<string>((resolve) => {
        const s = connect(f.port, host);
        s.setTimeout(2000, () => {
          s.destroy();
          resolve('timeout');
        });
        s.on('connect', () => {
          s.destroy();
          resolve('connected');
        });
        s.on('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
      });
      // Link-local IPv6 needs its interface as the scope, or the connect just times out.
      const external = Object.entries(networkInterfaces()).flatMap(([name, list]) => (list ?? []).filter((i) => !i.internal)
        .map((i) => (i.address.startsWith('fe80:') ? `${i.address}%${name}` : i.address)));
      const hosts = ['::1', ...external];
      const results = await Promise.all(hosts.map(refused));
      hosts.forEach((host, i) => expect(results[i], host).not.toBe('connected'));
    });
  });

  describe('AC 2: Host check (DNS rebinding)', () => {
    it('serves both loopback spellings', async () => {
      expect((await req(f.port, { host: `localhost:${f.port}` })).status).toBe(200);
      expect((await api(API.snapshot, {})).status).toBe(200);
    });

    it('refuses a rebinding hostname even with a valid token, on static and data routes', async () => {
      for (const path of ['/', API.snapshot, API.events]) {
        const r = await req(f.port, { path, host: `rebind.attacker.example:${f.port}`, headers: { [TOKEN_HEADER]: f.token } });
        expect(r.status, path).toBe(421);
        expect(r.body).not.toContain(HEAD_A);
        expect(r.body).not.toContain('commet view');
      }
    });

    it('refuses a wrong port, a bare host, and no Host at all', async () => {
      for (const host of [`127.0.0.1:${f.port + 1}`, '127.0.0.1', 'localhost', `127.0.0.1:${f.port}.evil.example`]) {
        expect((await req(f.port, { host })).status, host).toBe(421);
      }
      expect((await rawHttp(f.port, 'GET / HTTP/1.0\r\n\r\n')).status).toBe(421);
      expect((await req(f.port, { host: null })).status).toBe(400);
    });

    it('refuses absolute-form targets that name another host', async () => {
      const r = await req(f.port, { path: 'http://evil.example/', headers: {} });
      expect(r.status).toBe(400);
    });
  });

  describe('AC 3: token on every data and write route', () => {
    it('refuses a missing, wrong, or URL-borne token on every API route', async () => {
      const wrong = `${f.token.slice(0, -1)}${f.token.endsWith('A') ? 'B' : 'A'}`;
      const routes: [string, string][] = [[API.snapshot, 'GET'], [API.layout, 'GET'], [API.fog, 'GET'], [API.events, 'GET'],
        [API.chart, 'POST'], [API.beacon, 'POST'], ['/api/nope', 'GET']];
      for (const [path, method] of routes) {
        for (const headers of [{}, { [TOKEN_HEADER]: wrong }, { [TOKEN_HEADER]: '' }, { [TOKEN_HEADER]: 'x' }]) {
          const r = await req(f.port, { method, path, headers });
          expect(r.status, `${method} ${path}`).toBe(401);
          expect(r.raw).not.toContain(f.token);
          expect(r.raw).not.toContain(wrong);
        }
        // The token belongs in the header; the query string never counts.
        expect((await req(f.port, { method, path: `${path}?t=${f.token}` })).status).toBe(401);
      }
    });

    it('does not echo the token in responses', async () => {
      for (const path of [API.snapshot, API.fog, API.layout, '/api/nope']) expect((await api(path)).raw).not.toContain(f.token);
    });
  });

  describe('AC 4: no CORS, no cross-origin writes, only the contract routes', () => {
    it('sends no Access-Control header on any response, preflight included', async () => {
      const rs = await Promise.all([
        req(f.port, { method: 'OPTIONS', path: API.chart, headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST',
          'access-control-request-headers': TOKEN_HEADER } }),
        api(API.snapshot), api(API.snapshot, { origin: 'http://evil.example' }), req(f.port, { path: '/' }), api('/api/nope'),
      ]);
      for (const r of rs) expect(Object.keys(r.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
      expect(rs[0]!.status).not.toBe(204);
      expect(rs[0]!.status).toBeGreaterThanOrEqual(400);
    });

    it('refuses cross-origin writes and reads even with the token', async () => {
      const body = JSON.stringify({ kind: 'baseline' });
      for (const headers of [{ origin: 'http://evil.example' }, { origin: 'null' }, { origin: `http://127.0.0.1:${f.port + 1}` },
        { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
        expect((await api(API.chart, { ...headers, 'content-type': 'application/json' }, 'POST', body)).status).toBe(403);
        expect((await api(API.beacon, headers, 'POST', '{}')).status).toBe(403);
        expect((await api(API.snapshot, headers)).status).toBe(403);
      }
      // Our own origin reaches the route (501 until R5 is wired).
      expect((await api(API.chart, { origin: `http://127.0.0.1:${f.port}`, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
        'POST', body)).status).toBe(501);
    });

    it('refuses every other method on every route', async () => {
      const cases: [string, string, number][] = [
        ['POST', API.snapshot, 405], ['PUT', API.layout, 405], ['DELETE', API.fog, 405], ['GET', API.chart, 405], ['PUT', API.chart, 405],
        ['GET', API.beacon, 405], ['POST', API.events, 405], ['PATCH', API.snapshot, 405], ['HEAD', API.snapshot, 405],
        ['OPTIONS', API.snapshot, 405], ['GET', '/api', 404], ['GET', '/api/state', 404], ['GET', '/api/snapshot/', 404],
      ];
      for (const [method, path, status] of cases) expect((await api(path, {}, method)).status, `${method} ${path}`).toBe(status);
      for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']) {
        expect((await req(f.port, { method, path: '/' })).status, method).toBe(405);
      }
    });

    it('refuses tunnels and upgrades', async () => {
      const tunnel = await rawHttp(f.port, `CONNECT evil.example:443 HTTP/1.1\r\nHost: 127.0.0.1:${f.port}\r\n\r\n`);
      expect(tunnel.status).toBe(0);
      const ws = await req(f.port, { path: '/', headers: { upgrade: 'websocket', connection: 'Upgrade' } });
      expect(ws.status).not.toBe(101);
    });

    it('answers 501 for beacons until R10', async () => {
      const r = await api(API.beacon, {}, 'POST', '{}');
      expect(r.status).toBe(501);
      expect(JSON.parse(r.body)).toEqual({ ok: false, error: 'beacons are not implemented yet (R10)' });
    });

    it('validates chart bodies, then reports not implemented until R5', async () => {
      const json = { 'content-type': 'application/json' };
      expect((await api(API.chart, { 'content-type': 'text/plain' }, 'POST', '{"kind":"baseline"}')).status).toBe(415);
      expect((await api(API.chart, {}, 'POST', '{"kind":"baseline"}')).status).toBe(415);
      expect((await api(API.chart, json, 'POST', '{nope')).status).toBe(400);
      expect((await api(API.chart, json, 'POST', '{"kind":"chart","fileId":"../../etc"}')).status).toBe(400);
      expect((await api(API.chart, json, 'POST', JSON.stringify({ kind: 'baseline', pad: 'x'.repeat(5000) }))).status).toBe(413);
      const r = await api(API.chart, { 'content-type': 'application/json; charset=utf-8' }, 'POST', '{"kind":"chart","fileId":"f_000000000001"}');
      expect(r.status).toBe(501);
      expect(JSON.parse(r.body)).toEqual({ ok: false, error: 'chart writes are not implemented yet (R5)' });
    });
  });

  describe('AC 5: read routes and the bundle', () => {
    it('serves the snapshot bytes', async () => {
      const r = await api(API.snapshot);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(r.body).toBe(snapshotJson(HEAD_A));
    });

    it('says layout and fog are not available yet when absent', async () => {
      const layout = await api(API.layout);
      expect(layout.status).toBe(404);
      expect(JSON.parse(layout.body).error).toContain('not available yet');
      const fog = await api(API.fog);
      expect(fog.status).toBe(501);
      expect(JSON.parse(fog.body).error).toContain('not available yet');
    });

    it('serves the bundle without a token, with safe headers', async () => {
      const index = await req(f.port, { path: '/' });
      expect(index.status).toBe(200);
      expect(index.body).toContain('commet view');
      expect(index.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(index.headers['x-content-type-options']).toBe('nosniff');
      expect(index.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(index.headers['content-security-policy']).toContain("connect-src 'self'");
      const js = await req(f.port, { path: '/assets/app.js?test=1' });
      expect(js.status).toBe(200);
      expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
      expect((await req(f.port, { path: '/?test=1' })).body).toContain('commet view');
      expect((await req(f.port, { path: '/my%20file.js' })).body).toContain('spaced');
    });

    it('never lists a directory or serves a dotfile', async () => {
      for (const path of ['/assets', '/assets/', '/.hidden', '/.private/key.txt', '/%2eprivate/key.txt', '/missing.js', '/index.html/']) {
        const r = await req(f.port, { path });
        expect(r.status, path).toBe(404);
        expect(r.body).not.toContain('app.js');
        expect(r.body).not.toContain(SECRET);
      }
    });

    it('blocks traversal: plain, percent-encoded, backslashed and NUL', async () => {
      const paths = ['/../secret.txt', '/assets/../../secret.txt', '/%2e%2e/secret.txt', '/%2E%2E%2Fsecret.txt', '/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
        '/..%5csecret.txt', '/..%2f..%2fsecret.txt', '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/index.html%00.js', '//secret.txt'];
      for (const path of paths) {
        const r = await req(f.port, { path });
        expect([400, 404], path).toContain(r.status);
        expect(r.body).not.toContain(SECRET);
        expect(r.body).not.toContain('root:');
      }
      expect((await req(f.port, { path: '/%zz' })).status).toBe(400);
    });

    it('never follows a symlink, outward or inward', async () => {
      for (const path of ['/leak.txt', '/linkdir/secret.txt', '/linkdir/web/index.html', '/inner.js']) {
        const r = await req(f.port, { path });
        expect(r.status, path).toBe(404);
        expect(r.body).not.toContain(SECRET);
      }
    });
  });

  describe('AC 6: live updates', () => {
    it('pushes snapshot and layout events when their files change, and nothing for identical bytes', async () => {
      const stream = openStream(f.port, API.events, { [TOKEN_HEADER]: f.token });
      try {
        expect(await stream.status).toBe(200);
        await waitFor(() => stream.text().includes(': commet live updates'), 10_000, 'stream open');
        writeAtomic(join(f.state, 'snapshot.json'), snapshotJson(HEAD_B));
        await waitFor(() => liveEvents(stream.text()).length >= 1, 10_000, 'snapshot event');
        expect(liveEvents(stream.text())).toEqual([{ type: 'snapshot', head: HEAD_B }]);
        writeAtomic(join(f.state, 'layout.json'), JSON.stringify({ schemaVersion: 'layout.1', source: { repoId: 'r', head: HEAD_B } }));
        await waitFor(() => liveEvents(stream.text()).length >= 2, 10_000, 'layout event');
        expect(liveEvents(stream.text())[1]).toEqual({ type: 'layout', head: HEAD_B });
        // The layout now exists, so its route serves it.
        expect(JSON.parse((await api(API.layout)).body).source.head).toBe(HEAD_B);
        // Same bytes again (a new inode): no event. Every check reads snapshot before layout, so a
        // spurious snapshot event would arrive before the sentinel layout change that follows.
        writeAtomic(join(f.state, 'snapshot.json'), snapshotJson(HEAD_B));
        writeAtomic(join(f.state, 'layout.json'), JSON.stringify({ schemaVersion: 'layout.1', source: { repoId: 'r', head: HEAD_A } }));
        await waitFor(() => liveEvents(stream.text()).length >= 3, 10_000, 'sentinel layout event');
        expect(liveEvents(stream.text())).toEqual([{ type: 'snapshot', head: HEAD_B }, { type: 'layout', head: HEAD_B }, { type: 'layout', head: HEAD_A }]);
      } finally {
        stream.close();
      }
    });

    it('never follows a directory swapped for a symlink after startup (Qodo #32 r2)', async () => {
      const g = await fixture();
      try {
        const outside = join(g.root, 'outside');
        mkdirSync(outside);
        writeFileSync(join(outside, 'app.js'), SECRET);
        writeFileSync(join(outside, 'snapshot.json'), JSON.stringify({ leaked: SECRET }));
        rmSync(join(g.web, 'assets'), { recursive: true });
        symlinkSync(outside, join(g.web, 'assets'));
        const asset = await req(g.port, { path: '/assets/app.js' });
        expect(asset.status).toBe(404);
        expect(asset.body).not.toContain(SECRET);
        rmSync(g.state, { recursive: true });
        symlinkSync(outside, g.state);
        const snap = await req(g.port, { path: API.snapshot, headers: { [TOKEN_HEADER]: g.token } });
        expect(snap.status).toBe(500);
        expect(snap.body).toContain('symlink');
        expect(snap.body).not.toContain(SECRET);
      } finally {
        await teardown(g);
      }
    });

    it('refuses a state file too large to hold in memory (Qodo #32 r2)', async () => {
      const g = await fixture();
      try {
        // Sparse: no disk is used, but the size is past the cap.
        truncateSync(join(g.state, 'snapshot.json'), MAX_FILE_BYTES + 1);
        const r = await req(g.port, { path: API.snapshot, headers: { [TOKEN_HEADER]: g.token } });
        expect(r.status).toBe(500);
        expect(JSON.parse(r.body).error).toBe('state error: .git/commet/snapshot.json is larger than 256 MiB');
      } finally {
        await teardown(g);
      }
    });

    it('refuses a symlinked state file instead of following it', async () => {
      const g = await fixture();
      try {
        rmSync(join(g.state, 'snapshot.json'));
        symlinkSync(join(g.root, 'secret.txt'), join(g.state, 'snapshot.json'));
        const r = await req(g.port, { path: API.snapshot, headers: { [TOKEN_HEADER]: g.token } });
        expect(r.status).toBe(500);
        expect(r.body).toContain('symlink');
        expect(r.body).not.toContain(SECRET);
        expect(r.body).not.toContain(g.root);
      } finally {
        await teardown(g);
      }
    });
  });
});

describe('R14 server: missing bundle, missing snapshot, and the R5 seams', () => {
  it('says the view is not built when the bundle is missing, and keeps the API up', async () => {
    const f = await fixture({ web: false });
    try {
      const r = await req(f.port, { path: '/' });
      expect(r.status).toBe(503);
      expect(r.body).toContain('dist/web is missing');
      expect((await req(f.port, { path: API.snapshot, headers: { [TOKEN_HEADER]: f.token } })).status).toBe(200);
    } finally {
      await teardown(f);
    }
  });

  it('tells the view to run commet scan when the snapshot disappears', async () => {
    const f = await fixture();
    try {
      rmSync(join(f.state, 'snapshot.json'));
      const r = await req(f.port, { path: API.snapshot, headers: { [TOKEN_HEADER]: f.token } });
      expect(r.status).toBe(404);
      expect(JSON.parse(r.body).error).toBe('no snapshot yet: run `commet scan` first');
    } finally {
      await teardown(f);
    }
  });

  it('delegates validated chart actions and pushes a fog event on success', async () => {
    const seen: ChartAction[] = [];
    const f = await fixture({ fog: true, chart: async (a) => (seen.push(a), { ok: true, fog: miniFog }) });
    const stream = openStream(f.port, API.events, { [TOKEN_HEADER]: f.token });
    try {
      expect(await stream.status).toBe(200);
      const r = await req(f.port, { method: 'POST', path: API.chart, headers: { [TOKEN_HEADER]: f.token, 'content-type': 'application/json' },
        body: '{"kind":"chart","fileId":"f_000000000001"}' });
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body)).toEqual({ ok: true, fog: miniFog });
      expect(seen).toEqual([{ kind: 'chart', fileId: 'f_000000000001' }]);
      await waitFor(() => liveEvents(stream.text()).length >= 1, 10_000, 'fog event');
      expect(liveEvents(stream.text())).toEqual([{ type: 'fog', head: miniFog.head }]);
      const fog = await req(f.port, { path: API.fog, headers: { [TOKEN_HEADER]: f.token } });
      expect(JSON.parse(fog.body)).toEqual(miniFog);
    } finally {
      stream.close();
      await teardown(f);
    }
  });

  it('gives onError only the error and the route, never the request or its token (Qodo PR #47 r1)', async () => {
    const seen: unknown[][] = [];
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'commet-server-')));
    const token = newToken();
    const server = await startServer({ stateDir: root, webRoot: join(root, 'web'), port: 0, token, onError: (...a) => seen.push(a),
      fog: async () => Promise.reject(new Error('fog failed')),
      chart: async () => Promise.reject(Object.assign(new Error('chart failed'), { code: 'EIO' })) });
    try {
      const auth = { [TOKEN_HEADER]: token, 'content-type': 'application/json' };
      const fog = await req(server.port, { path: `${API.fog}?t=${token}`, headers: auth });
      const chart = await req(server.port, { method: 'POST', path: API.chart, headers: auth, body: '{"kind":"baseline"}' });
      for (const r of [fog, chart]) {
        expect(r.status).toBe(500);
        expect(JSON.parse(r.body)).toEqual({ error: 'internal error' });
      }
      expect(seen.map(([e, route]) => [(e as Error).message, route])).toEqual([['fog failed', API.fog], ['chart failed', API.chart]]);
      expect(seen.every((a) => a.length === 2)).toBe(true);
      expect(JSON.stringify(seen.map(([e, route]) => [(e as Error).stack, route]))).not.toContain(token);
    } finally {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses more than a bounded number of event streams', async () => {
    const f = await fixture();
    const streams = Array.from({ length: 32 }, () => openStream(f.port, API.events, { [TOKEN_HEADER]: f.token }));
    try {
      expect(await Promise.all(streams.map((s) => s.status))).toEqual(Array(32).fill(200));
      expect((await req(f.port, { path: API.events, headers: { [TOKEN_HEADER]: f.token } })).status).toBe(503);
    } finally {
      for (const s of streams) s.close();
      await teardown(f);
    }
  });
});
