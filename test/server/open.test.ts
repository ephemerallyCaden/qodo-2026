// `commet open` end to end (#32): exit codes, the printed URL, the token's single appearance, and a
// live push after a real `commet scan`, all on a real 127.0.0.1 socket.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runOpen } from '../../src/cli/open.js';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import type { FogView } from '../../src/core/contract/fog.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { EXIT } from '../../src/core/errors.js';
import { writeAtomic } from '../../src/state/io.js';
import { cli } from '../fixtures/cli.js';
import { liveEvents, openStream, req, waitFor } from '../fixtures/http.js';
import { miniRepo } from '../fixtures/mini.js';
import { realTempDir } from '../fixtures/tmp.js';

const env = { ...process.env, CLAUDE_CONFIG_DIR: join(tmpdir(), 'commet-no-claude') };
const URL_LINE = /^Commet is open at http:\/\/127\.0\.0\.1:(\d+)\/#t=([A-Za-z0-9_-]{43})$/m;

const oneCommitRepo = () => miniRepo([{ id: 'c1', at: '2026-10-01T09:00:00Z', path: 'src/a.ts', lines: ['export const a = 1;'] }]);

/** Starts `commet open` in-process and resolves once it has printed its URL. */
async function launch(cwd: string, args: string[], webRoot: string, launchEnv: NodeJS.ProcessEnv = env) {
  let out = '';
  let err = '';
  const ac = new AbortController();
  const done = runOpen(args, { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd, env: launchEnv }, { signal: ac.signal, webRoot, pollMs: 100 });
  let code: number | undefined;
  void done.then((c) => (code = c));
  await waitFor(() => URL_LINE.test(out) || code !== undefined, 20_000, 'the URL');
  const m = URL_LINE.exec(out);
  return { port: Number(m?.[1]), token: m?.[2] ?? '', out: () => out, err: () => err, stop: async () => (ac.abort(), done), code: () => code };
}

describe('commet open', () => {
  it('outside a repository exits 4', async () => {
    const dir = realTempDir('commet-norepo-');
    const r = await cli(['open', '--no-open'], dir, { ...env, GIT_CEILING_DIRECTORIES: tmpdir() });
    expect(r.code).toBe(EXIT.noRepo);
    expect(r.err).toContain('not inside a git repository');
  });

  it('before any scan says to run commet scan first, exits 5, and creates no state', async () => {
    const repo = oneCommitRepo();
    const r = await cli(['open', '--no-open'], repo.dir, env);
    expect(r.code).toBe(EXIT.state);
    expect(r.err).toBe('commet: no snapshot yet: run `commet scan` first\n');
    expect(existsSync(join(repo.dir, '.git', 'commet'))).toBe(false);
    // State dir present (e.g. from an older run) but no snapshot: same answer.
    mkdirSync(join(repo.dir, '.git', 'commet'), { mode: 0o700 });
    expect((await cli(['open', '--no-open'], repo.dir, env)).err).toContain('run `commet scan` first');
  });

  it('only reads state: never creates, chmods or follows .git/commet (Qodo #32 r1)', async () => {
    const repo = oneCommitRepo();
    expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
    const state = join(repo.dir, '.git', 'commet');
    chmodSync(state, 0o750);
    const s = await launch(repo.dir, ['--no-open'], join(repo.dir, 'no-web'));
    expect(await s.stop()).toBe(0);
    expect(statSync(state).mode & 0o777).toBe(0o750);
    // A planted link or a file in its place is a state error, never followed.
    const moved = join(repo.dir, 'moved-state');
    renameSync(state, moved);
    symlinkSync(moved, state);
    const link = await cli(['open', '--no-open'], repo.dir, env);
    expect([link.code, link.err]).toEqual([EXIT.state, 'commet: state error: .git/commet is a symlink; refusing to read through it\n']);
    rmSync(state);
    writeFileSync(state, 'not a dir');
    expect((await cli(['open', '--no-open'], repo.dir, env)).err).toContain('.git/commet is not a directory');
  });

  it('shows a failed request on stderr only with COMMET_DEBUG (Qodo PR #47 r1)', async () => {
    const repo = oneCommitRepo();
    expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
    const snap = join(repo.dir, '.git', 'commet', 'snapshot.json');
    const web = realTempDir('commet-web-');
    writeFileSync(join(web, 'index.html'), '<!doctype html>');
    for (const debug of [false, true]) {
      const s = await launch(repo.dir, ['--no-open'], web, debug ? { ...env, COMMET_DEBUG: '1' } : env);
      renameSync(snap, `${snap}.real`);
      symlinkSync(`${snap}.real`, snap);
      // The token rides in the header and, for good measure, the query string: neither may reach stderr.
      expect((await req(s.port, { path: `${API.snapshot}?t=${s.token}`, headers: { [TOKEN_HEADER]: s.token } })).status).toBe(500);
      expect(await s.stop()).toBe(0);
      rmSync(snap);
      renameSync(`${snap}.real`, snap);
      if (!debug) expect(s.err()).toBe('');
      else {
        expect(s.err()).toContain('commet: a request to /api/snapshot failed\n');
        expect(s.err()).toContain('is or sits behind a symlink');
        expect(s.err()).not.toContain(s.token);
        expect(s.err()).not.toContain('?t=');
      }
    }
  });

  it('rejects bad options with exit 2', async () => {
    const repo = oneCommitRepo();
    for (const args of [['--port'], ['--port', '0'], ['--port', '70000'], ['--port', 'abc'], ['--host', '0.0.0.0'], ['--bind', '0.0.0.0']]) {
      const r = await cli(['open', ...args], repo.dir, env);
      expect(r.code, args.join(' ')).toBe(EXIT.usage);
      expect(r.err).toContain('usage: commet open [--port <n>] [--no-open (keeps the token out of process lists)]');
    }
  });

  it('serves the scanned repo, prints the token only in the URL, pushes a rescan live, and stops cleanly', async () => {
    const repo = oneCommitRepo();
    expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
    // What the server reads is private: state dir 0700, snapshot 0600 (system design §9, check 10).
    expect(statSync(join(repo.dir, '.git', 'commet')).mode & 0o777).toBe(0o700);
    expect(statSync(join(repo.dir, '.git', 'commet', 'snapshot.json')).mode & 0o777).toBe(0o600);
    const web = realTempDir('commet-web-');
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>commet view</title>');
    const s = await launch(repo.dir, ['--no-open'], web);
    try {
      expect(s.code()).toBeUndefined();
      expect(s.out()).toContain('Serving on 127.0.0.1 only');
      const auth = { [TOKEN_HEADER]: s.token };
      const snap = await req(s.port, { path: API.snapshot, headers: auth });
      expect(snap.status).toBe(200);
      expect(snap.body).toBe(readFileSync(join(repo.dir, '.git', 'commet', 'snapshot.json'), 'utf8'));
      expect((await req(s.port, { path: '/' })).body).toContain('commet view');

      // A real rescan after a new commit reaches a connected view without a reload.
      const stream = openStream(s.port, API.events, auth);
      expect(await stream.status).toBe(200);
      await waitFor(() => stream.text().includes(': commet live updates'), 10_000, 'stream open');
      writeFileSync(join(repo.dir, 'src', 'b.ts'), 'export const b = 2;\n');
      execFileSync('git', ['add', '-A'], { cwd: repo.dir });
      execFileSync('git', ['commit', '-q', '-m', 'feat: b'], { cwd: repo.dir, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-02T09:00:00Z',
        GIT_COMMITTER_DATE: '2026-10-02T09:00:00Z' } });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.dir, encoding: 'utf8' }).trim();
      expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
      await waitFor(() => liveEvents(stream.text()).some((e) => (e as { type: string }).type === 'snapshot'), 15_000, 'snapshot event');
      expect(liveEvents(stream.text())).toContainEqual({ type: 'snapshot', head });
      stream.close();

      // Failed requests never echo or log the token.
      await req(s.port, { path: API.snapshot, headers: { [TOKEN_HEADER]: 'wrong' } });
      await req(s.port, { path: API.snapshot, host: `evil.example:${s.port}`, headers: auth });
      await req(s.port, { path: '/../../etc/passwd' });
    } finally {
      expect(await s.stop()).toBe(0);
    }
    const printed = s.out() + s.err();
    expect(printed.split(s.token).length - 1).toBe(1);
    expect(s.err()).toBe('');
    // Stopped means stopped: the port no longer answers.
    await expect(req(s.port, { path: '/' })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('serves real fog and takes chart writes through R5, with live fog events from any writer (#32 AC 8)', async () => {
    const repo = oneCommitRepo();
    expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
    const web = realTempDir('commet-web-');
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>commet view</title>');
    const s = await launch(repo.dir, ['--no-open'], web);
    const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.dir, encoding: 'utf8' }).trim();
    const fileId = fileIdOf('src/a.ts');
    try {
      const auth = { [TOKEN_HEADER]: s.token };
      const json = { ...auth, 'content-type': 'application/json' };
      const fogNow = async () => JSON.parse((await req(s.port, { path: API.fog, headers: auth })).body) as FogView;
      const first = await fogNow();
      const h1 = head();
      expect(first).toMatchObject({ schemaVersion: 'fog.1', head: h1, baseline: null });
      expect(first.files.find((f) => f.fileId === fileId)).toMatchObject({ state: 'fogged', reasons: ['unknown'] });

      const stream = openStream(s.port, API.events, auth);
      expect(await stream.status).toBe(200);
      await waitFor(() => stream.text().includes(': commet live updates'), 10_000, 'stream open');
      const fogEvents = () => liveEvents(stream.text()).filter((e) => (e as { type: string }).type === 'fog').length;
      const post = (body: object, headers: Record<string, string> = json) =>
        req(s.port, { method: 'POST', path: API.chart, headers, body: JSON.stringify(body) });

      // The gates come first: no token, a foreign Origin, a body that isn't exactly a ChartAction.
      expect((await post({ kind: 'chart', fileId, at: h1 }, { 'content-type': 'application/json' })).status).toBe(401);
      expect((await post({ kind: 'chart', fileId, at: h1 }, { ...json, origin: 'http://evil.example' })).status).toBe(403);
      expect((await post({ kind: 'chart', fileId })).status).toBe(400);
      // An `at` the snapshot doesn't know: 409 with the head to refetch at, and nothing written.
      const unknown = await post({ kind: 'chart', fileId, at: 'c'.repeat(40) });
      expect([unknown.status, JSON.parse(unknown.body)]).toEqual([409, { ok: false, error: 'unknown-head', head: h1 }]);
      expect(existsSync(join(repo.dir, '.git/commet/chart.json'))).toBe(false);

      // A good write: 200 with the new fog, and one fog event for every open view.
      const ok = await post({ kind: 'chart', fileId, at: h1 });
      expect(ok.status).toBe(200);
      const okBody = JSON.parse(ok.body) as { ok: true; fog: FogView };
      expect(okBody.ok).toBe(true);
      expect(okBody.fog.files.find((f) => f.fileId === fileId)!.state).toBe('charted');
      await waitFor(() => fogEvents() >= 1, 10_000, 'fog event after the write');
      expect((await fogNow()).files.find((f) => f.fileId === fileId)!.state).toBe('charted');
      const status = await cli(['chart', 'status'], repo.dir, env);
      expect(status.out).toMatch(/^src\s+1\s+0\s+1\s+0$/m);

      // `commet chart` run while the view is open: the view hears about it too.
      const before = fogEvents();
      expect((await cli(['chart', 'baseline'], repo.dir, env)).code).toBe(0);
      await waitFor(() => fogEvents() > before, 10_000, 'fog event after commet chart');
      expect((await fogNow()).baseline).toBe(h1);

      // Chart state deleted while the view is open: fog changed back, so the view hears (Qodo #32 local r1).
      const chartJson = join(repo.dir, '.git/commet/chart.json');
      const saved = readFileSync(chartJson);
      const beforeDelete = fogEvents();
      rmSync(join(repo.dir, '.git/commet/chart.json'));
      await waitFor(() => fogEvents() > beforeDelete, 10_000, 'fog event after chart.json is deleted');
      expect((await fogNow()).baseline).toBeNull();
      const afterDelete = fogEvents();
      writeFileSync(join(repo.dir, '.git/commet/chart.json'), saved, { mode: 0o600 });
      await waitFor(() => fogEvents() > afterDelete, 10_000, 'fog event after chart.json is back');
      expect((await fogNow()).baseline).toBe(h1);

      // Chart state turned invalid, then a symlink, while the view is open: the view still hears, and
      // its refetch shows the state error (Qodo PR70 r1).
      for (const plant of [() => writeFileSync(chartJson, '{"not":"chart state"}'), () => {
        rmSync(chartJson);
        symlinkSync(join(repo.dir, 'README.md'), chartJson);
      }]) {
        const n = fogEvents();
        plant();
        await waitFor(() => fogEvents() > n, 10_000, 'fog event for bad chart state');
        const bad = await req(s.port, { path: API.fog, headers: auth });
        expect(bad.status).toBe(500);
        expect(JSON.parse(bad.body).error).toMatch(/^state error: \.git\/commet\/chart\.json /);
      }
      rmSync(chartJson);
      writeFileSync(chartJson, saved, { mode: 0o600 });
      expect((await fogNow()).baseline).toBe(h1);

      // A rescan after a new commit: the chart at h1 still stands and the new change is fogged.
      writeFileSync(join(repo.dir, 'src', 'a.ts'), 'export const a = 2;\n');
      execFileSync('git', ['commit', '-qam', 'feat: a2'], { cwd: repo.dir, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-02T09:00:00Z',
        GIT_COMMITTER_DATE: '2026-10-02T09:00:00Z' } });
      const h2 = head();
      expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
      await waitFor(() => liveEvents(stream.text()).some((e) => JSON.stringify(e) === JSON.stringify({ type: 'fog', head: h2 })), 15_000, 'fog event after rescan');
      expect((await fogNow()).files.find((f) => f.fileId === fileId)).toMatchObject({ state: 'fogged', since: h2 });
      // A view still showing h1 charts at h1: recorded there, so the unseen change stays fogged (#58).
      const late = JSON.parse((await post({ kind: 'chart', fileId, at: h1 })).body) as { ok: true; fog: FogView };
      expect(late.fog.files.find((f) => f.fileId === fileId)).toMatchObject({ state: 'fogged', since: h2 });
      stream.close();
    } finally {
      expect(await s.stop()).toBe(0);
    }
    expect(s.out().split(s.token).length - 1).toBe(1);
    expect(s.err()).toBe('');
  });

  it('refuses fog and chart writes over a snapshot and a layout from different scans, and still serves and announces both (#64)', async () => {
    // The Day 6 probe's state: the snapshot of a scan without roots beside the layout of a later scan with `src` as a root.
    const repo = miniRepo([{ id: 'a', at: '2026-10-01T09:00:00Z', path: 'src/core/a.ts', lines: ['export const a = 1;'] },
      { id: 'b', at: '2026-10-01T10:00:00Z', path: 'docs/guide.md', lines: ['# Guide'] }]);
    const state = join(repo.dir, '.git', 'commet');
    const read = (name: string) => readFileSync(join(state, name), 'utf8');
    expect((await cli(['scan', '--no-ingest', '--no-root'], repo.dir, env)).code).toBe(0);
    const [snapA, layoutA, headA] = [read('snapshot.json'), read('layout.json'), repo.sha['b']!];
    mkdirSync(join(repo.dir, 'src', 'cli'));
    writeFileSync(join(repo.dir, 'src', 'cli', 'b.ts'), 'export const b = 2;\n');
    execFileSync('git', ['add', '-A'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-q', '-m', 'feat: b'], { cwd: repo.dir, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-02T09:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-02T09:00:00Z' } });
    const headB = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.dir, encoding: 'utf8' }).trim();
    expect((await cli(['scan', '--no-ingest', '--root', 'src'], repo.dir, env)).code).toBe(0);
    const [snapB, layoutB] = [read('snapshot.json'), read('layout.json')];
    writeAtomic(join(state, 'snapshot.json'), snapA);

    const web = realTempDir('commet-web-');
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>commet view</title>');
    const s = await launch(repo.dir, ['--no-open'], web);
    try {
      const auth = { [TOKEN_HEADER]: s.token };
      const get = (path: string) => req(s.port, { path, headers: auth });
      const refused = (r: { status: number; headers: Record<string, string>; body: string }, snap: string, layout: string) => {
        expect(r.status).toBe(500);
        const error = (JSON.parse(r.body) as { error: string }).error;
        expect(error).toMatch(new RegExp(`^state error: .*snapshot \\(of ${snap.slice(0, 7)}\\).*layout \\(of ${layout.slice(0, 7)}\\).*different scans.*run \`commet scan\``));
        expect(r.body).not.toContain(repo.dir);
        expect(r.body).not.toContain(snap);
        expect(r.body).not.toContain(s.token);
        expect(r.headers['content-security-policy']).toContain("default-src 'self'");
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
      };
      refused(await get(API.fog), headA, headB);
      const post = await req(s.port, { method: 'POST', path: API.chart, headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'chart', fileId: fileIdOf('src/core/a.ts'), at: headA }) });
      refused(post, headA, headB);
      expect(existsSync(join(state, 'chart.json'))).toBe(false);
      // Both files are still served as they are, so the view can draw the layout and say why there's no fog.
      expect([(await get(API.layout)).body, (await get(API.snapshot)).body]).toEqual([layoutB, snapA]);
      // The gates come before the refusal.
      expect((await req(s.port, { path: API.fog })).status).toBe(401);

      // Every file change is still announced at that file's head, and the fog follows the pair.
      const stream = openStream(s.port, API.events, auth);
      expect(await stream.status).toBe(200);
      await waitFor(() => stream.text().includes(': commet live updates'), 10_000, 'stream open');
      const events = () => liveEvents(stream.text());
      writeAtomic(join(state, 'snapshot.json'), snapB);
      await waitFor(() => events().length >= 2, 10_000, 'snapshot B events');
      expect((JSON.parse((await get(API.fog)).body) as FogView).head).toBe(headB);
      writeAtomic(join(state, 'snapshot.json'), snapA);
      await waitFor(() => events().length >= 4, 10_000, 'snapshot A events');
      refused(await get(API.fog), headA, headB);
      writeAtomic(join(state, 'layout.json'), layoutA);
      await waitFor(() => events().length >= 5, 10_000, 'layout A event');
      expect(events()).toEqual([{ type: 'snapshot', head: headB }, { type: 'fog', head: headB }, { type: 'snapshot', head: headA },
        { type: 'fog', head: headA }, { type: 'layout', head: headA }]);
      const fog = await get(API.fog);
      expect([fog.status, (JSON.parse(fog.body) as FogView).head]).toEqual([200, headA]);
      stream.close();
    } finally {
      expect(await s.stop()).toBe(0);
    }
    expect(s.err()).toBe('');
  });

  it('uses --port when given, and gives each launch a fresh token', async () => {
    const repo = oneCommitRepo();
    expect((await cli(['scan', '--no-ingest'], repo.dir, env)).code).toBe(0);
    const port = await freePort();
    const a = await launch(repo.dir, ['--no-open', '--port', String(port)], join(repo.dir, 'no-web'));
    const tokenA = a.token;
    expect(a.port).toBe(port);
    expect(a.err()).toContain('dist/web is missing');
    expect((await req(port, { path: '/' })).status).toBe(503);
    // The port is now taken: a second launch on it fails clearly with exit 6 (server bind failure).
    const clash = await cli(['open', '--no-open', '--port', String(port)], repo.dir, env);
    expect(clash.code).toBe(EXIT.bind);
    expect(clash.err).toContain(`port ${port} is already in use`);
    expect(await a.stop()).toBe(0);
    const b = await launch(repo.dir, ['--no-open', '--port', String(port)], join(repo.dir, 'no-web'));
    expect(b.token).not.toBe(tokenA);
    expect((await req(port, { path: API.snapshot, headers: { [TOKEN_HEADER]: tokenA } })).status).toBe(401);
    expect(await b.stop()).toBe(0);
  });
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer().listen({ host: '127.0.0.1', port: 0 }, () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}
