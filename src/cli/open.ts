// `commet open` (R14): serves the web view and the repo's state on 127.0.0.1 until Ctrl+C.
import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { CommetError, EXIT } from '../core/errors.js';
import { gitRunner, tryGit } from '../scan/git.js';
import { NO_SNAPSHOT, packageWebRoot, readStateFile, STATE_FILES } from '../server/files.js';
import { newToken } from '../server/guard.js';
import { startServer, type ServerOptions } from '../server/server.js';
import type { Io } from './main.js';

export const OPEN_USAGE = 'usage: commet open [--port <n>] [--no-open (keeps the token out of process lists)]\n';

interface OpenArgs { port: number; open: boolean }

/** Test seams. Without them, `open` runs until SIGINT/SIGTERM and serves the package's own bundle. */
export interface OpenControl {
  signal?: AbortSignal;
  webRoot?: string;
  pollMs?: number;
}

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
    const dir = await scannedStateDir(io.cwd);
    const opts: ServerOptions = { stateDir: dir, webRoot: ctl.webRoot ?? packageWebRoot(), port: args.port, token: newToken() };
    if (ctl.pollMs !== undefined) opts.pollMs = ctl.pollMs;
    const server = await startServer(opts).catch((e: unknown) => {
      if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        throw new CommetError(`port ${args.port} is already in use: pick another --port, or leave it out for a free one`, EXIT.usage);
      }
      throw e;
    });
    // The only place the token is ever written: the one URL the user opens.
    io.stdout(`Commet is open at ${server.url}\n`);
    if (server.webMissing) {
      io.stderr("commet: the web view isn't built yet (dist/web is missing), so the page shows a notice; the data API is running.\n");
    }
    if (args.open) openBrowser(server.url, io);
    io.stdout('Serving on 127.0.0.1 only. Press Ctrl+C to stop.\n');
    await stopped(ctl.signal);
    await server.close();
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
 * `<git-common-dir>/commet`, but only once `commet scan` has written a snapshot there. `open` only
 * reads state, so it checks the dir itself rather than through `stateDir()`, which creates and
 * chmods (Qodo #32 r1): a missing dir means no scan yet, and a symlink or non-dir there is refused
 * like `stateDir()` refuses it. The snapshot goes through the server's own no-follow reader.
 */
async function scannedStateDir(cwd: string): Promise<string> {
  const out = await tryGit(gitRunner(cwd), ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (out === null) throw new CommetError('not inside a git repository', EXIT.noRepo);
  const commonDir = realpathSync.native(out.trim());
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
  if ((await readStateFile(dir, STATE_FILES.snapshot)) === null) throw new CommetError(NO_SNAPSHOT, EXIT.state);
  return dir;
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
