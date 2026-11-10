import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CommetError, EXIT } from '../core/errors.js';
import { sha256Hex } from '../core/hash.js';
import { formatSummary } from '../core/summary.js';
import { scan } from '../scan/index.js';
import { QODO_CACHE_FILE } from '../scan/qodo.js';
import { loadOrCreateKey } from '../state/key.js';
import { stateDir, writeAtomic } from '../state/io.js';
import { runOpen } from './open.js';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const USAGE = 'usage: commet scan [--window <months>] [--no-ingest] [--with-qodo] [--out <file>]\n'
  + '       commet open [--port <n>] [--no-open (keeps the token out of process lists)]\n'
  + '  --with-qodo  opt in to reading this repo\'s Qodo review findings (read-only, over the network via gh and qodo)\n';

interface ScanArgs { window: number; ingest: boolean; withQodo: boolean; out?: string }

function parseScanArgs(args: string[]): ScanArgs | string {
  const o: ScanArgs = { window: 24, ingest: true, withQodo: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-ingest') o.ingest = false;
    else if (a === '--with-qodo') o.withQodo = true;
    else if (a === '--window') {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 240) return '--window takes a whole number of months (1–240)';
      o.window = n;
    } else if (a === '--out') {
      const out = args[++i];
      if (!out) return '--out takes a file path';
      o.out = out;
    } else return `unknown option ${JSON.stringify(a)}`;
  }
  return o;
}

/** Saves the counts-only Qodo cache; a failure is reported, not fatal: the snapshot already has the counts. */
function saveQodoCache(commonDir: string, text: string): boolean {
  try {
    writeAtomic(join(stateDir(commonDir), QODO_CACHE_FILE), text);
    return true;
  } catch {
    return false;
  }
}

/** Runs the CLI and returns the exit code (design §8; see EXIT). */
export async function main(argv: string[], io: Io): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    io.stdout(USAGE);
    return 0;
  }
  if (cmd === 'open') return runOpen(rest, io);
  if (cmd !== 'scan') {
    io.stderr(`commet: ${cmd ? `unknown command ${JSON.stringify(cmd)}` : 'missing command'}\n${USAGE}`);
    return EXIT.usage;
  }
  const args = parseScanArgs(rest);
  if (typeof args === 'string') {
    io.stderr(`commet: ${args}\n${USAGE}`);
    return EXIT.usage;
  }
  try {
    const claudeDir = io.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude');
    const { snapshot, json, commonDir, logs, qodoCache } = await scan({
      repoDir: io.cwd, windowMonths: args.window, ingest: args.ingest,
      claudeProjectsDir: join(claudeDir, 'projects'), keyFor: (dir) => loadOrCreateKey(stateDir(dir)),
      qodo: { fetch: args.withQodo, stateDir },
    });
    writeAtomic(args.out ? resolve(io.cwd, args.out) : join(stateDir(commonDir), 'snapshot.json'), json);
    io.stdout(formatSummary(snapshot, logs, !args.withQodo));
    if (qodoCache !== null && !saveQodoCache(commonDir, qodoCache)) {
      io.stdout('qodo findings cache could not be written; a scan without --with-qodo will not see these counts\n');
    }
    const where = args.out ? 'the --out file' : '<git-common-dir>/commet/snapshot.json';
    io.stdout(`snapshot written to ${where} (${Buffer.byteLength(json)} bytes, sha256 ${sha256Hex(json).slice(0, 16)})\n`);
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
