// `commet open` (R14): serves the web view and the repo's state on 127.0.0.1 until Ctrl+C.
import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { CommetError, EXIT } from '../core/errors.js';
import { refreshKey } from '../hooks/refresh.js';
import { gitRunner, tryGit, type Git } from '../scan/git.js';
import { NO_SNAPSHOT, packageWebRoot, STATE_FILES } from '../server/files.js';
import { newToken } from '../server/guard.js';
import { watchRefs } from '../server/refs.js';
import { startServer, type CommetServer, type ServerOptions } from '../server/server.js';
import { applyBeacon, readBeacons } from '../state/beacons.js';
import { readCoChange } from '../state/cochange.js';
import { applyChart, readDroneDetail, readDrones, readFog } from '../state/chart.js';
import { readCrew, readCrewDetail } from '../state/crew.js';
import { readDebrisDetail, readDebrisView } from '../state/debris.js';
import { readDiff, readUnseen } from '../state/diff.js';
import { readStateBytes } from '../state/io.js';
import { defaultPaths } from './hook.js';
import type { Io } from './main.js';
import { startRescans, type RescanCommand, type RescanResult } from './rescan.js';

export const OPEN_USAGE = 'usage: commet open [--port <n>] [--no-open (keeps the token out of process lists)]\n';

interface OpenArgs { port: number; open: boolean }

/** Test seams. Without them, `open` runs until SIGINT/SIGTERM, serves the package's own bundle and rescans with its own CLI. */
export interface OpenControl {
  signal?: AbortSignal;
  webRoot?: string;
  pollMs?: number;
  /** What runs each rescan (#95); null: none (tests that scan by hand). */
  rescan?: RescanCommand | null;
  /** Quiet time after a ref change before the rescan (default RESCAN_SETTLE_MS). */
  settleMs?: number;
}

/** A rebase moves HEAD once per commit: the rescan waits for this much quiet, but never longer than RESCAN_MAX_WAIT_MS. */
const RESCAN_SETTLE_MS = 500;
const RESCAN_MAX_WAIT_MS = 5000;

function parseOpenArgs(args: string[]): OpenArgs | string {
  const o: OpenArgs = { port: 0, open: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-open') o.open = false;
    else if (a === '--port') {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return '--port takes a port number (1–65535)';
      o.port = n;
    } else return `unknown option ${JSON.stringify(a)}`;
  }
  return o;
}

/** Runs `commet open` and returns its exit code once the server has stopped. */
export async function runOpen(argv: string[], io: Io, ctl: OpenControl = {}): Promise<number> {
  const args = parseOpenArgs(argv);
  if (typeof args === 'string') {
    io.stderr(`commet: ${args}\n${OPEN_USAGE}`);
    return EXIT.usage;
  }
  try {
    const git = gitRunner(io.cwd);
    const { dir, commonDir } = await scannedStateDir(git);
    const opts: ServerOptions = { stateDir: dir, webRoot: ctl.webRoot ?? packageWebRoot(), port: args.port, token: newToken(),
      // R5 (#33, #58): the fog view and chart writes, through the same module `commet chart` uses.
      fog: () => readFog(io.cwd), chart: (action) => applyChart(io.cwd, action),
      // #80: the drone view, from the same pair as the fog; #148: one session's own files and timeline.
      drones: () => readDrones(io.cwd), droneDetail: (q) => readDroneDetail(io.cwd, q),
      // #79 (R10): beacons, in .git/commet/beacons.json, through the module `commet beacon` uses.
      beacons: () => readBeacons(io.cwd), beacon: (action) => applyBeacon(io.cwd, action),
      // #211 (R9): co-change pairs and the missing-pair flags still standing after the chart state.
      cochange: () => readCoChange(io.cwd),
      // #207: the crew (human authors in the window) and one member's own panel.
      crew: () => readCrew(io.cwd), crewDetail: (q) => readCrewDetail(io.cwd, q),
      // R13: the stale work and one piece's own panel.
      debris: () => readDebrisView(io.cwd), debrisDetail: (q) => readDebrisDetail(io.cwd, q),
      // #75: reviewing from the view. Diffs come from local git on demand and are never stored.
      unseen: (q) => readUnseen(io.cwd, q), diff: (q, signal) => readDiff(io.cwd, q, signal) };
    if (ctl.pollMs !== undefined) opts.pollMs = ctl.pollMs;
    // Like startup errors, a failed request's details (which can hold absolute paths) only show on
    // request: the route, the error's message, code and stack. Nothing from the request itself.
    if (io.env['COMMET_DEBUG']) opts.onError = (e, route) => io.stderr(`commet: a request to ${route} failed\n${debugText(e)}\n`);
    const server = await startServer(opts).catch((e: unknown) => {
      throw bindError(e as NodeJS.ErrnoException, args.port);
    });
    try {
      // Watching starts before the URL is out, so no ref change made once the view can be opened is missed.
      const live = ctl.rescan === null ? null : await liveRescans(server, io, git, dir, commonDir, ctl);
      // The only place the token is ever written: the one URL the user opens.
      io.stdout(`Commet is open at ${server.url}\n`);
      if (server.webMissing) {
        io.stderr("commet: the web view isn't built yet (dist/web is missing), so the page shows a notice; the data API is running.\n");
      }
      if (args.open) openBrowser(server.url, io);
      if (live) io.stdout('Watching HEAD and branches: a commit, checkout, merge, rebase or fetch rescans, and the view follows.\n');
      io.stdout('Serving on 127.0.0.1 only. Press Ctrl+C to stop.\n');
      await stopped(ctl.signal);
      await live?.close();
    } finally {
      await server.close();
    }
    return 0;
  } catch (e) {
    if (e instanceof CommetError) {
      io.stderr(`commet: ${e.message}\n`);
      return e.exitCode;
    }
    // Error text can carry absolute paths (git stderr, fs errors), so it's shown only on request.
    io.stderr(`commet: internal error${io.env['COMMET_DEBUG'] ? `\n${(e as Error).stack}` : ' (set COMMET_DEBUG=1 for details)'}\n`);
    return EXIT.internal;
  }
}

/**
 * #95: rescans the worktree `open` serves whenever HEAD or a branch moves, with no git hooks. The
 * watch only reads git's files; each rescan is a child `commet scan` (see rescan.ts), and its new
 * snapshot reaches the view through the server's state watcher like any other scan. A failure is
 * said on stderr, with the scan's own message, and to the view as a `rescan` event.
 */
async function liveRescans(server: CommetServer, io: Io, git: Git, dir: string, commonDir: string, ctl: OpenControl): Promise<{ close(): Promise<void> }> {
  const top = await tryGit(git, ['rev-parse', '--path-format=absolute', '--show-toplevel']);
  const report = (r: RescanResult) => {
    if (r.ok) io.stdout('commet: the automatic rescan works again; the view is up to date\n');
    else {
      const detail = r.detail ? `:\n${r.detail.split('\n').map((l) => `  ${l}`).join('\n')}` : '';
      io.stderr(`commet: the automatic rescan after a git change failed (exit ${r.exitCode}); the view keeps the last scan${detail}\n`);
    }
    server.announce({ type: 'rescan', ok: r.ok, exitCode: r.ok ? 0 : r.exitCode });
  };
  const paths = defaultPaths();
  const rescans = startRescans({ cwd: io.cwd, env: io.env, stateDir: dir, key: refreshKey(top ? realpathSync.native(lineOf(top)) : null, commonDir),
    command: ctl.rescan ?? { node: paths.node, argv: [paths.cli] }, settleMs: ctl.settleMs ?? RESCAN_SETTLE_MS, maxWaitMs: RESCAN_MAX_WAIT_MS, report });
  // This worktree's own git dir, for its HEAD (a linked worktree's is <common>/worktrees/<id>).
  const gitDir = await tryGit(git, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const refs = await watchRefs(commonDir, () => rescans.request(), ctl.pollMs, gitDir ? realpathSync.native(lineOf(gitDir)) : commonDir);
  return {
    async close() {
      refs.close();
      await rescans.close();
    },
  };
}

/** A path git printed on one line: only its newline goes, never a space that belongs to the path (Qodo local 59080452). */
const lineOf = (out: string) => out.replace(/\n$/, '');

/** Message, code and stack of an error; nothing at all of a thrown non-Error, which could be anything. */
function debugText(e: unknown): string {
  if (!(e instanceof Error)) return 'a non-Error value was thrown';
  const code = (e as NodeJS.ErrnoException).code;
  return `${code ? `[${code}] ` : ''}${e.stack ?? e.message}`;
}

/** Any failure to listen is exit 6, "server bind failure" (system design §8); anything else passes through. */
function bindError(e: NodeJS.ErrnoException, port: number): unknown {
  if (e?.syscall !== 'listen') return e;
  if (e.code === 'EADDRINUSE') return new CommetError(`port ${port} is already in use: pick another --port, or leave it out for a free one`, EXIT.bind);
  if (e.code === 'EACCES') return new CommetError(`not allowed to listen on port ${port}: pick a port above 1023, or leave --port out`, EXIT.bind);
  return new CommetError(`couldn't listen on 127.0.0.1:${port} (${e.code ?? 'unknown error'})`, EXIT.bind);
}

/**
 * `<git-common-dir>/commet`, but only once `commet scan` has written a snapshot there. `open` only
 * reads state, so it checks the dir itself rather than through `stateDir()`, which creates and
 * chmods (Qodo #32 r1): a missing dir means no scan yet, and a symlink or non-dir there is refused
 * like `stateDir()` refuses it. The snapshot goes through the server's own no-follow reader.
 */
async function scannedStateDir(git: Git): Promise<{ dir: string; commonDir: string }> {
  const out = await tryGit(git, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (out === null) throw new CommetError('not inside a git repository', EXIT.noRepo);
  const commonDir = realpathSync.native(lineOf(out));
  const dir = join(commonDir, 'commet');
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new CommetError(NO_SNAPSHOT, EXIT.state);
    throw e;
  }
  if (st.isSymbolicLink()) throw new CommetError('state error: .git/commet is a symlink; refusing to read through it', EXIT.state);
  if (!st.isDirectory()) throw new CommetError('state error: .git/commet is not a directory', EXIT.state);
  if ((await readStateBytes(dir, STATE_FILES.snapshot)) === null) throw new CommetError(NO_SNAPSHOT, EXIT.state);
  return { dir, commonDir };
}

/**
 * Hands the URL to the platform's opener, without a shell. The opener sees the URL (and so the
 * token) in its arguments for as long as it runs; `--no-open` avoids that, and the token dies with
 * this server either way. Failure only costs the convenience: the URL is already printed.
 */
function openBrowser(url: string, io: Io): void {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : ['xdg-open', [url]];
  const failed = () => io.stderr("commet: couldn't open a browser; open the URL above yourself\n");
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', failed);
  child.on('exit', (code) => {
    if (code !== 0) failed();
  });
  child.unref();
}

/** Resolves on the abort signal when given, else on the first SIGINT or SIGTERM. */
function stopped(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal) {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
      return;
    }
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}
