// #75 (R5): charting from the view, end to end on a real repo and a real 127.0.0.1 socket. The
// unseen list and the diff come from the server's own fog; a chart posted at the viewed head clears
// it; diffs are never written anywhere; and the gates hold for the new routes.
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, TOKEN_HEADER, type DiffResult, type DiffView, type UnseenList } from '../../src/core/contract/api.js';
import type { FogView } from '../../src/core/contract/fog.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer, type ServerOptions } from '../../src/server/server.js';
import { applyChart, readFog } from '../../src/state/chart.js';
import { readDiff, readUnseen } from '../../src/state/diff.js';
import { cli } from '../fixtures/cli.js';
import { req, waitFor } from '../fixtures/http.js';

const made: string[] = [];
const tempDir = (prefix: string) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
// No session logs: every commit's attribution is unknown, so every change fogs (Rule 1).
const env = { ...process.env, CLAUDE_CONFIG_DIR: join(tmpdir(), 'commet-no-claude-75') };

/** Canary text in a file's content: it may be served in a diff, and must never land on disk or in a log. */
const CANARY = 'diff-content-canary-7f3a';

function repo() {
  const dir = tempDir('commet-diff75-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git('config', k!, v!);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  let n = 0;
  const commit = () => {
    git('add', '-A');
    const at = `2026-10-10T${String(9 + n++).padStart(2, '0')}:00:00Z`;
    execFileSync('git', ['commit', '-q', '-m', `c${n}`], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, write, commit };
}

const scan = async (dir: string) => expect((await cli(['scan', '--no-ingest', '--no-root'], dir, env)).code).toBe(0);

interface Served { server: CommetServer; port: number; token: string; errors: unknown[] }

async function serve(dir: string, extra: Partial<ServerOptions> = {}): Promise<Served> {
  const token = newToken();
  const errors: unknown[] = [];
  const server = await startServer({
    stateDir: join(dir, '.git', 'commet'), webRoot: join(dir, 'no-web'), port: 0, token, pollMs: 100,
    fog: () => readFog(dir), chart: (a) => applyChart(dir, a), unseen: (q) => readUnseen(dir, q), diff: (q, s) => readDiff(dir, q, s),
    onError: (e) => errors.push(e), ...extra,
  });
  return { server, port: server.port, token, errors };
}

describe('#75 charting from the view, on a real repo', () => {
  const r = repo();
  let s: Served;
  const shas: string[] = [];
  const api = (path: string, extra: Record<string, string> = {}, method = 'GET', body?: string) =>
    req(s.port, { method, path, headers: { [TOKEN_HEADER]: s.token, ...extra }, ...(body === undefined ? {} : { body }) });
  const json = async <T>(path: string) => {
    const res = await api(path);
    return { status: res.status, body: JSON.parse(res.body) as T, raw: res.raw };
  };
  const fog = async () => (await json<FogView>(API.fog)).body;
  const diffOf = (path: string, at: string) => json<DiffResult>(`${API.diff}?fileId=${fileIdOf(path)}&at=${at}`);

  beforeAll(async () => {
    r.write('src/a.ts', 'one\ntwo\nthree\nfour\nfive\nsix\n');
    r.write('src/b.ts', 'bee\n');
    r.write('README.md', '# readme\n');
    shas.push(r.commit());
    r.write('src/a.ts', `one\ntwo\nthree\nfour\nfive\nsix\n// ${CANARY}\n`);
    r.write('src/[x].ts', 'brackets\n');
    shas.push(r.commit());
    await scan(r.dir);
    s = await serve(r.dir);
  });
  afterAll(async () => s.server.close());

  it('lists a planet\'s and the star\'s fogged files with paths; refuses an unknown planet and a stale head', async () => {
    const f = await fog();
    const src = f.planets[0]!.dirId;
    const list = await json<UnseenList>(`${API.unseen}?home=${src}&at=${f.head}`);
    expect(list.status).toBe(200);
    expect(list.body.files.map((x) => x.path)).toEqual(['src/[x].ts', 'src/a.ts', 'src/b.ts']);
    expect(list.body.files.find((x) => x.path === 'src/a.ts')).toEqual({ fileId: fileIdOf('src/a.ts'), path: 'src/a.ts', since: shas[0], reasons: ['unknown'] });
    expect((await json<UnseenList>(`${API.unseen}?home=star&at=${f.head}`)).body.files.map((x) => x.path)).toEqual(['README.md']);
    const none = await json(`${API.unseen}?home=d_0123456789ab&at=${f.head}`);
    expect([none.status, none.body]).toEqual([404, { ok: false, error: 'no-such-home' }]);
    const stale = await json(`${API.unseen}?home=star&at=${'c'.repeat(40)}`);
    expect([stale.status, stale.body]).toEqual([409, { ok: false, error: 'unknown-head', head: f.head }]);
  });

  it('serves the unseen diff from the root (the empty tree), with every unseen line', async () => {
    const f = await fog();
    const d = await diffOf('src/a.ts', f.head);
    expect(d.status).toBe(200);
    const v = d.body as DiffView;
    expect(v).toMatchObject({ ok: true, fileId: fileIdOf('src/a.ts'), at: f.head, since: shas[0], base: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', truncated: false });
    expect(v.sections).toEqual([{ status: 'added', path: 'src/a.ts', oldPath: null, binary: false,
      hunks: [{ header: '@@ -0,0 +1,7 @@', lines: ['+one', '+two', '+three', '+four', '+five', '+six', `+// ${CANARY}`] }] }]);
    expect(v.shownLines).toBe(7);
    // A glob-like name is just a name.
    expect(((await diffOf('src/[x].ts', f.head)).body as DiffView).sections.map((x) => x.path)).toEqual(['src/[x].ts']);
  });

  it('refuses an unknown file and a stale head without echoing either', async () => {
    const f = await fog();
    const unknown = await json(`${API.diff}?fileId=f_0123456789ab&at=${f.head}`);
    expect([unknown.status, unknown.body]).toEqual([404, { ok: false, error: 'no-such-file' }]);
    expect(unknown.raw).not.toContain('f_0123456789ab');
    const stale = await diffOf('src/a.ts', shas[0]!);
    expect([stale.status, stale.body]).toEqual([409, { ok: false, error: 'unknown-head', head: f.head }]);
    expect(stale.raw).not.toContain('src/a.ts');
  });

  it('charting at the viewed head clears the file; a later change refogs it and the diff starts after the chart', async () => {
    const f = await fog();
    const res = await api(API.chart, { 'content-type': 'application/json' }, 'POST', JSON.stringify({ kind: 'chart', fileId: fileIdOf('src/a.ts'), at: f.head }));
    expect(res.status).toBe(200);
    const after = await fog();
    expect(after.files.find((x) => x.fileId === fileIdOf('src/a.ts'))!.state).toBe('charted');
    expect(((await diffOf('src/a.ts', after.head)).body as DiffView)).toMatchObject({ since: null, base: null, sections: [], truncated: false, shownLines: 0 });

    r.git('mv', 'src/a.ts', 'src/renamed.ts');
    r.write('src/renamed.ts', `one\ntwo\nTHREE\nfour\nfive\nsix\n// ${CANARY}\n`);
    shas.push(r.commit());
    await scan(r.dir);
    const moved = await fog();
    expect(moved.head).toBe(shas[2]);
    const d = (await diffOf('src/renamed.ts', moved.head)).body as DiffView;
    // Starts after the chart (at shas[1]) and follows the rename back to src/a.ts.
    expect(d).toMatchObject({ since: shas[2], base: shas[1] });
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0]).toMatchObject({ status: 'renamed', path: 'src/renamed.ts', oldPath: 'src/a.ts' });
    expect(d.sections[0]!.hunks[0]!.lines).toContain('+THREE');
  });

  it('a chart at an older head the view saw still records there (#58), and the newer change stays fogged', async () => {
    const before = await fog();
    r.write('src/b.ts', 'bee\nmore\n');
    shas.push(r.commit());
    await scan(r.dir);
    // The view still shows `before.head`: its diff is refused (409), its chart is recorded at that head.
    expect((await diffOf('src/b.ts', before.head)).status).toBe(409);
    const res = await api(API.chart, { 'content-type': 'application/json' }, 'POST', JSON.stringify({ kind: 'chart', fileId: fileIdOf('src/b.ts'), at: before.head }));
    expect(res.status).toBe(200);
    const now = await fog();
    expect(now.files.find((x) => x.fileId === fileIdOf('src/b.ts'))).toMatchObject({ state: 'fogged', since: shas[3] });
  });

  it('never writes a diff to disk, logs nothing, and keeps state to ids and SHAs', async () => {
    const f = await fog();
    const state = join(r.dir, '.git', 'commet');
    const before = Object.fromEntries(readdirSync(state).map((n) => [n, readFileSync(join(state, n), 'utf8')]));
    for (let i = 0; i < 3; i++) expect((await diffOf('src/renamed.ts', f.head)).status).toBe(200);
    const after = Object.fromEntries(readdirSync(state).map((n) => [n, readFileSync(join(state, n), 'utf8')]));
    expect(after).toEqual(before);
    for (const text of Object.values(after)) expect(text).not.toContain(CANARY);
    expect(s.errors).toEqual([]);
  });
});

describe('#75 diff limits on the server', () => {
  const view = (fileId: string): DiffView => ({ ok: true, fileId: fileId as `f_${string}`, at: 'a'.repeat(40), since: null, base: null, sections: [], truncated: false, shownLines: 0 });
  const AT = 'a'.repeat(40);
  const path = `${API.diff}?fileId=f_000000000001&at=${AT}`;

  it('runs at most 4 diffs at once, stops a slow one with 503, and stops git when the client goes away', async () => {
    const r = repo();
    r.write('a.ts', 'a\n');
    r.commit();
    await scan(r.dir);
    const signals: AbortSignal[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const s = await serve(r.dir, {
      diffTimeoutMs: 60_000,
      diff: async (q, signal) => {
        signals.push(signal);
        await Promise.race([gate, new Promise((resolve) => signal.addEventListener('abort', resolve))]);
        if (signal.aborted) throw signal.reason;
        return view(q.fileId);
      },
    });
    const get = () => req(s.port, { path, headers: { [TOKEN_HEADER]: s.token } });
    const running = [get(), get(), get(), get()];
    await waitFor(() => signals.length === 4, 5000, 'four diffs');
    const fifth = await get();
    expect([fifth.status, JSON.parse(fifth.body)]).toEqual([503, { ok: false, error: 'too many diffs at once; try again' }]);
    release();
    for (const res of await Promise.all(running)) expect(res.status).toBe(200);
    expect(signals.every((x) => !x.aborted)).toBe(true);
    await s.server.close();

    // The client goes away mid-diff: the diff's signal aborts, so git stops.
    let seen: AbortSignal | null = null;
    const hang = await serve(r.dir, { diff: (_q, signal) => { seen = signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))); } });
    const client = request({ host: '127.0.0.1', port: hang.port, path, headers: { host: `127.0.0.1:${hang.port}`, [TOKEN_HEADER]: hang.token } });
    client.on('error', () => {});
    client.end();
    await waitFor(() => seen !== null, 5000, 'the diff to start');
    client.destroy();
    await waitFor(() => seen!.aborted, 5000, 'the abort');
    await hang.server.close();

    // A diff past its time is stopped and answered 503.
    const slow = await serve(r.dir, { diffTimeoutMs: 50, diff: (_q, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))) });
    const late = await req(slow.port, { path, headers: { [TOKEN_HEADER]: slow.token } });
    expect([late.status, JSON.parse(late.body)]).toEqual([503, { ok: false, error: 'the diff took too long' }]);
    expect(slow.errors).toEqual([]);
    await slow.server.close();

    // Real git, real timeout: the abort reaches git and the answer is still 503, never a partial diff.
    const real = await serve(r.dir, { diffTimeoutMs: 1 });
    const f = (await req(real.port, { path: API.fog, headers: { [TOKEN_HEADER]: real.token } }));
    const head = (JSON.parse(f.body) as FogView).head;
    const res = await req(real.port, { path: `${API.diff}?fileId=${fileIdOf('a.ts')}&at=${head}`, headers: { [TOKEN_HEADER]: real.token } });
    expect(res.status).toBe(503);
    await real.server.close();
  });
});
