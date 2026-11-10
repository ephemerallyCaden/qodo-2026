// `commet open` end to end (#32): exit codes, the printed URL, the token's single appearance, and a
// live push after a real `commet scan`, all on a real 127.0.0.1 socket.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runOpen } from '../../src/cli/open.js';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import { EXIT } from '../../src/core/errors.js';
import { cli } from '../fixtures/cli.js';
import { liveEvents, openStream, req, waitFor } from '../fixtures/http.js';
import { miniRepo } from '../fixtures/mini.js';

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
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-norepo-')));
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
    const web = realpathSync(mkdtempSync(join(tmpdir(), 'commet-web-')));
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
    const web = realpathSync(mkdtempSync(join(tmpdir(), 'commet-web-')));
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
