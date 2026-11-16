// #95: `commet open` rescans when HEAD or a branch moves, with no git hooks. Each rescan is a child
// `commet scan` of the worktree `open` serves: spawned without a shell from an argv array, with no
// terminal (so it never asks, and keeps or reads the saved roots without writing them, #71/#73), and
// coalesced through the same lock and request as `commet hook refresh`, so one scan runs at a time.
import { spawn, type ChildProcess } from 'node:child_process';
import { EXIT } from '../core/errors.js';
import { coalescedRefresh } from '../hooks/refresh.js';

/** How to run the CLI: `node` with `argv` before `scan` (this package's dist/cli.js; a stand-in in tests). */
export interface RescanCommand { node: string; argv: string[] }

/** A rescan that failed, with the child's own stderr (what `commet scan` would print), or the first good one after it. */
export type RescanResult = { ok: true } | { ok: false; exitCode: number; detail: string };

export interface RescanOptions {
  /** The worktree `open` serves, where the scan runs. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** `<git-common-dir>/commet`, where the refresh lock and request live. */
  stateDir: string;
  /** The worktree's refresh key (refreshKey), the one `commet hook refresh` uses. */
  key: string;
  command: RescanCommand;
  /** Quiet time after the last change before a rescan starts (a rebase moves HEAD once per commit). */
  settleMs: number;
  /** Longest a burst of changes holds a rescan back. */
  maxWaitMs: number;
  /** Told of each failed rescan, and of the first that succeeds after one. Never of a rescan stopped by close(). */
  report: (r: RescanResult) => void;
}

export interface Rescans {
  /** A ref moved: rescan once things settle. */
  request(): void;
  /** Stops for good: no new rescans, the running child (only ever this process's own) is killed and waited for. */
  close(): Promise<void>;
}

/** Most of a failed scan's stderr kept for the report. */
const MAX_DETAIL = 4096;
/** How long a child gets to exit after SIGTERM at shutdown before SIGKILL. */
const KILL_GRACE_MS = 2000;

export function startRescans(o: RescanOptions): Rescans {
  let closed = false;
  let failed = false;
  let timer: NodeJS.Timeout | undefined;
  let burstStart: number | undefined;
  let child: ChildProcess | undefined;
  const rounds = new Set<Promise<unknown>>();

  /** Reports a failure, and the first success after one; nothing once closed (a scan close() stopped isn't a failure). */
  const outcome = (exitCode: number, detail: string) => {
    if (closed) return;
    if (exitCode !== 0) o.report({ ok: false, exitCode, detail });
    else if (failed) o.report({ ok: true });
    failed = exitCode !== 0;
  };
  // Only an error's code is ever kept: its message carries the absolute path of what couldn't run.
  const codeOf = (e: unknown) => (e as NodeJS.ErrnoException | null)?.code ?? 'error';

  /** One child scan; its exit code goes back to coalescedRefresh. */
  const scanOnce = (): Promise<number> => new Promise((resolve) => {
    if (closed) return resolve(0);
    let stderr = '';
    let spawnError: string | undefined;
    let c: ChildProcess;
    try {
      c = spawn(o.command.node, [...o.command.argv, 'scan'], { cwd: o.cwd, env: o.env, stdio: ['ignore', 'ignore', 'pipe'], shell: false,
        windowsHide: true });
    } catch (e) {
      outcome(EXIT.internal, `the scan couldn't start (${codeOf(e)})`);
      return resolve(EXIT.internal);
    }
    child = c;
    c.stderr?.setEncoding('utf8');
    c.stderr?.on('data', (d: string) => {
      if (stderr.length < MAX_DETAIL) stderr += d.slice(0, MAX_DETAIL - stderr.length);
    });
    c.on('error', (e) => (spawnError = codeOf(e)));
    c.on('close', (code, signal) => {
      child = undefined;
      // A child that never started closes with a negative errno, not an exit code; a signal leaves none.
      const exitCode = spawnError || code === null ? EXIT.internal : code;
      outcome(exitCode, spawnError ? `the scan couldn't start (${spawnError})` : signal ? `the scan was stopped (${signal})` : stderr.trim());
      resolve(exitCode);
    });
  });

  const fire = () => {
    timer = undefined;
    burstStart = undefined;
    if (closed) return;
    // A throw means the request or lock couldn't be written: the state dir went away or turned unwritable.
    const round = coalescedRefresh(o.stateDir, o.key, scanOnce, () => !closed)
      .catch((e: unknown) => outcome(EXIT.state, `state error: the rescan couldn't take its lock in .git/commet (${codeOf(e)})`));
    rounds.add(round);
    void round.finally(() => rounds.delete(round));
  };

  return {
    request() {
      if (closed) return;
      const now = Date.now();
      burstStart ??= now;
      clearTimeout(timer);
      timer = setTimeout(fire, Math.max(0, Math.min(o.settleMs, burstStart + o.maxWaitMs - now)));
    },
    async close() {
      closed = true;
      clearTimeout(timer);
      // child.kill only signals a child that hasn't exited yet, so it can never reach a reused pid.
      child?.kill('SIGTERM');
      const hard = setTimeout(() => child?.kill('SIGKILL'), KILL_GRACE_MS);
      await Promise.allSettled([...rounds]);
      clearTimeout(hard);
    },
  };
}
