// GET /api/beacons and POST /api/beacon (#79, R10): behind the server's Host, origin and token gates,
// JSON bodies only, exact keys, a note refused (never rewritten) unless it's one plain line, and the
// text only ever answered as JSON data. The last block runs the real state module on a scanned repo.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import type { BeaconAction, BeaconResult, BeaconView } from '../../src/core/contract/beacons.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { newToken, parseBeaconAction } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { applyBeacon, BEACONS_FILE, readBeacons } from '../../src/state/beacons.js';
import { cli } from '../fixtures/cli.js';
import { liveEvents, openStream, req, waitFor } from '../fixtures/http.js';
import { realTempDir } from '../fixtures/tmp.js';

const AT = 'a'.repeat(40);
const FILE = 'f_000000000001';
const VIEW: BeaconView = { schemaVersion: 'beacons.1', head: AT, beacons: [{ fileId: FILE, path: 'src/a.ts', home: 'd_000000000002', at: AT, text: 'reads NUL-framed output' }], unplaced: 0 };
const json = { 'content-type': 'application/json' };
const body = (o: object) => JSON.stringify(o);

describe('parseBeaconAction', () => {
  it('takes exactly a file id, a full SHA and a string note', () => {
    expect(parseBeaconAction({ fileId: FILE, at: AT, text: 'x' })).toEqual({ fileId: FILE, at: AT, text: 'x' });
    expect(parseBeaconAction({ fileId: FILE, at: 'b'.repeat(64), text: 'x' })).not.toBeNull();
    for (const bad of [null, [], 'x', {}, { fileId: FILE, at: AT }, { fileId: FILE, at: AT, text: 'x', kind: 'set' },
      { fileId: '../../etc/passwd', at: AT, text: 'x' }, { fileId: '--output=x', at: AT, text: 'x' }, { fileId: FILE, at: 'HEAD', text: 'x' },
      { fileId: FILE, at: AT.slice(1), text: 'x' }, { fileId: FILE, at: AT, text: 5 }, { fileId: FILE, at: AT, text: ['x'] }, { fileId: FILE, at: AT, text: null }]) {
      expect(parseBeaconAction(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('the beacon routes', () => {
  let root: string;
  let state: string;
  let withRoutes: CommetServer;
  let without: CommetServer;
  const token = newToken();
  const auth = { [TOKEN_HEADER]: token };
  const seen: BeaconAction[] = [];
  const answers: BeaconResult[] = [];

  beforeAll(async () => {
    root = realTempDir('commet-beacon-routes-');
    state = join(root, 'state');
    mkdirSync(state, { mode: 0o700 });
    writeFileSync(join(state, 'snapshot.json'), JSON.stringify({ schemaVersion: '0.2', repo: { repoId: 'r', head: AT } }));
    const base = { stateDir: state, webRoot: join(root, 'web'), port: 0, token, pollMs: 100 };
    withRoutes = await startServer({ ...base, beacons: async () => VIEW,
      beacon: async (a) => { seen.push(a); return answers.shift() ?? { ok: true, beacons: VIEW }; } });
    without = await startServer(base);
  });
  afterAll(async () => {
    await withRoutes.close();
    await without.close();
    rmSync(root, { recursive: true, force: true });
  });

  const post = (text: string | Buffer, headers: Record<string, string> = { ...auth, ...json }, port = withRoutes.port) =>
    req(port, { method: 'POST', path: API.beacon, headers, body: text });

  it('GET answers the beacon view as JSON, never echoing the token; 501 when unwired', async () => {
    const r = await req(withRoutes.port, { path: API.beacons, headers: auth });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(JSON.parse(r.body)).toEqual(VIEW);
    expect(r.raw).not.toContain(token);
    expect((await req(without.port, { path: API.beacons, headers: auth })).status).toBe(501);
  });

  it('refuses without the token, with a wrong one, or with it in the URL, on both routes', async () => {
    for (const [method, path] of [['GET', API.beacons], ['POST', API.beacon]] as const) {
      for (const headers of [{}, { [TOKEN_HEADER]: 'x' }, { [TOKEN_HEADER]: '' }]) {
        expect((await req(withRoutes.port, { method, path, headers: { ...headers, ...json }, body: body({ fileId: FILE, at: AT, text: 'x' }) })).status, `${method} ${path}`).toBe(401);
      }
      expect((await req(withRoutes.port, { method, path: `${path}?t=${token}`, headers: json, body: '{}' })).status).toBe(401);
    }
    expect(seen).toEqual([]);
  });

  it('refuses a foreign Host and cross-origin writes, even with the token', async () => {
    const note = body({ fileId: FILE, at: AT, text: 'x' });
    expect((await req(withRoutes.port, { method: 'POST', path: API.beacon, host: `rebind.attacker.example:${withRoutes.port}`, headers: { ...auth, ...json }, body: note })).status).toBe(421);
    for (const h of [{ origin: 'http://evil.example' }, { origin: 'null' }, { origin: `http://127.0.0.1:${withRoutes.port + 1}` }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
      expect((await post(note, { ...auth, ...json, ...h })).status, JSON.stringify(h)).toBe(403);
    }
    expect(seen).toEqual([]);
  });

  it('takes POST only on /api/beacon and GET only on /api/beacons', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) expect((await req(withRoutes.port, { method, path: API.beacon, headers: auth })).status, method).toBe(405);
    for (const method of ['POST', 'PUT', 'DELETE']) expect((await req(withRoutes.port, { method, path: API.beacons, headers: auth })).status, method).toBe(405);
  });

  it('refuses a body that isn\'t JSON, is too big, or isn\'t exactly a BeaconAction, before the state is touched', async () => {
    const note = body({ fileId: FILE, at: AT, text: 'x' });
    expect((await post(note, { ...auth, 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(note, auth)).status).toBe(415);
    expect((await post('{nope')).status).toBe(400);
    expect((await post(body({ fileId: FILE, at: AT, text: 'x'.repeat(5000) }))).status).toBe(413);
    for (const bad of [{}, { fileId: FILE, at: AT }, { fileId: FILE, at: AT, text: 'x', path: 'src/a.ts' }, { fileId: '--output=/tmp/x', at: AT, text: 'x' }, { fileId: FILE, at: 'HEAD', text: 'x' }]) {
      const r = await post(body(bad));
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(JSON.parse(r.body)).toEqual({ ok: false, error: 'not a beacon' });
    }
    expect(seen).toEqual([]);
  });

  it('refuses a note that isn\'t one plain line of 1–120 characters, with fixed text that never quotes it', async () => {
    const cases: [string, string][] = [
      ['', 'the note is empty'], ['   ', 'the note is empty'], [' padded', 'the note must not start or end with spaces'],
      ['two\nlines', 'the note must be one line of plain text, without control characters'],
      ['tab\there', 'the note must be one line of plain text, without control characters'],
      ['nul\u0000x', 'the note must be one line of plain text, without control characters'],
      ['esc\u001b[31mred', 'the note must be one line of plain text, without control characters'],
      ['line\u2028sep', 'the note must be one line of plain text, without control characters'],
      ['bidi\u202eevil', 'the note must be one line of plain text, without control characters'],
      ['lone\ud800', 'the note must be one line of plain text, without control characters'],
      ['x'.repeat(121), 'the note is longer than 120 characters'],
    ];
    for (const [text, error] of cases) {
      const r = await post(body({ fileId: FILE, at: AT, text }));
      expect(r.status, JSON.stringify(text)).toBe(400);
      expect(JSON.parse(r.body), JSON.stringify(text)).toEqual({ ok: false, error });
    }
    expect(seen).toEqual([]);
  });

  it('hands a valid note to the state exactly as sent: HTML is data, 120 code points is the limit (not UTF-16 units)', async () => {
    const html = '<img src=x onerror=alert(1)> & <script>alert(2)</script>';
    const emoji = '\u{1F6F0}'.repeat(120); // 240 UTF-16 units, 120 characters
    for (const text of [html, emoji, 'naïve café: the ünïcode note']) {
      const r = await post(body({ fileId: FILE, at: AT, text }));
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(JSON.parse(r.body)).toEqual({ ok: true, beacons: VIEW });
    }
    expect(seen.map((a) => a.text)).toEqual([html, emoji, 'naïve café: the ünïcode note']);
    seen.length = 0;
  });

  it('refuses a body that isn\'t UTF-8 instead of storing U+FFFD in its place, before the state is touched (#184)', async () => {
    // A note's bytes as a non-browser client might send them: `text` is `caf` and then `bytes`.
    const note = (bytes: number[], prefix: number[] = []) => Buffer.concat([Buffer.from(prefix),
      Buffer.from(`{"fileId":"${FILE}","at":"${AT}","text":"caf`), Buffer.from(bytes), Buffer.from('"}')]);
    const malformed: [string, number[]][] = [
      ['Latin-1 é', [0xe9]], ['a cut-off sequence', [0xc3]], ['a surrogate encoded as CESU-8', [0xed, 0xa0, 0x80]],
      ['an overlong /', [0xc0, 0xaf]], ['a byte UTF-8 never uses', [0xff]],
    ];
    for (const [what, bytes] of malformed) {
      const r = await post(note(bytes));
      expect(r.status, what).toBe(400);
      expect(JSON.parse(r.body), what).toEqual({ ok: false, error: 'body is not UTF-8' });
    }
    expect(seen).toEqual([]);
    // A leading BOM is still refused by JSON.parse, as before.
    const bom = await post(note([0xc3, 0xa9], [0xef, 0xbb, 0xbf]));
    expect([bom.status, JSON.parse(bom.body)]).toEqual([400, { ok: false, error: 'body is not JSON' }]);
    expect(seen).toEqual([]);
    // The same note in UTF-8 reaches the state exactly as sent.
    expect((await post(note([0xc3, 0xa9]))).status).toBe(200);
    expect(seen.map((a) => a.text)).toEqual(['café']);
    seen.length = 0;
  });

  it('answers 409 for an unknown head and 400 for another refusal', async () => {
    answers.push({ ok: false, error: 'unknown-head', head: 'b'.repeat(40) }, { ok: false, error: 'no such file at that head' });
    const note = body({ fileId: FILE, at: AT, text: 'x' });
    const a = await post(note);
    expect(a.status).toBe(409);
    expect(JSON.parse(a.body)).toEqual({ ok: false, error: 'unknown-head', head: 'b'.repeat(40) });
    const b = await post(note);
    expect(b.status).toBe(400);
    expect(JSON.parse(b.body)).toEqual({ ok: false, error: 'no such file at that head' });
    seen.length = 0;
  });

  it('answers 501 for a valid note when no beacon writer is wired', async () => {
    const r = await post(body({ fileId: FILE, at: AT, text: 'x' }), { ...auth, ...json }, without.port);
    expect(r.status).toBe(501);
  });

  it('announces a beacons.json change to every open view with the beacon view\'s head', async () => {
    const stream = openStream(withRoutes.port, API.events, auth);
    try {
      expect(await stream.status).toBe(200);
      await waitFor(() => stream.text().includes(': commet live updates'), 10_000, 'stream open');
      writeFileSync(join(state, BEACONS_FILE), '{}');
      await waitFor(() => liveEvents(stream.text()).length >= 1, 10_000, 'beacons event');
      expect(liveEvents(stream.text())).toEqual([{ type: 'beacons', head: AT }]);
    } finally {
      stream.close();
    }
  });
});

describe('the beacon routes on a scanned repo', () => {
  let dir: string;
  let server: CommetServer;
  const token = newToken();
  const headers = { [TOKEN_HEADER]: token, ...json };

  beforeAll(async () => {
    dir = realTempDir('commet-beacon-e2e-');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
    for (const [path, text] of [['aa/one.ts', 'one\n'], ['README.md', '# r\n']]) {
      mkdirSync(dirname(join(dir, path!)), { recursive: true });
      writeFileSync(join(dir, path!), text!);
    }
    git('add', '-A');
    execFileSync('git', ['commit', '-q', '-m', 'one'], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-10T09:00:00Z', GIT_COMMITTER_DATE: '2026-10-10T09:00:00Z' } });
    expect((await cli(['scan', '--no-ingest', '--no-root'], dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') })).code).toBe(0);
    server = await startServer({ stateDir: join(dir, '.git', 'commet'), webRoot: join(dir, 'no-web'), port: 0, token, pollMs: 100,
      beacons: () => readBeacons(dir), beacon: (a) => applyBeacon(dir, a) });
  });
  afterAll(async () => {
    await server.close();
  });

  it('stores the note as ids, a SHA and the text only (0600), and serves it back as JSON data on its planet', async () => {
    const head = (await readBeacons(dir)).head;
    const text = '<b onmouseover=alert(1)>parser</b> keeps "quotes" & \\backslashes';
    const r = await req(server.port, { method: 'POST', path: API.beacon, headers, body: body({ fileId: fileIdOf('aa/one.ts'), at: head, text }) });
    expect(r.status).toBe(200);
    const answer = JSON.parse(r.body) as BeaconResult;
    expect(answer.ok).toBe(true);
    const file = join(dir, '.git', 'commet', BEACONS_FILE);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    expect(stored).toEqual({ schemaVersion: 'beacons.1', beacons: [{ fileId: fileIdOf('aa/one.ts'), at: head, text }] });
    expect(readFileSync(file, 'utf8')).not.toContain(dir); // no absolute path (Rule 2)
    const got = JSON.parse((await req(server.port, { path: API.beacons, headers })).body) as BeaconView;
    expect(got.beacons).toEqual([{ fileId: fileIdOf('aa/one.ts'), path: 'aa/one.ts', home: expect.stringMatching(/^d_/), at: head, text }]);
    expect(answer.ok && answer.beacons).toEqual(got);
  });

  it('refuses a file the snapshot doesn\'t have and an unknown head, and writes nothing', async () => {
    const file = join(dir, '.git', 'commet', BEACONS_FILE);
    const before = readFileSync(file, 'utf8');
    const head = (await readBeacons(dir)).head;
    const missing = await req(server.port, { method: 'POST', path: API.beacon, headers, body: body({ fileId: fileIdOf('aa/nope.ts'), at: head, text: 'x' }) });
    expect(missing.status).toBe(400);
    expect(JSON.parse(missing.body)).toEqual({ ok: false, error: 'no such file at that head' });
    const stale = await req(server.port, { method: 'POST', path: API.beacon, headers, body: body({ fileId: fileIdOf('aa/one.ts'), at: 'c'.repeat(40), text: 'x' }) });
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toEqual({ ok: false, error: 'unknown-head', head });
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
