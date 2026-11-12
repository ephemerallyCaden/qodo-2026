import { spawn } from 'node:child_process';

export interface ExecOptions {
  /** Wall-clock kill timer (R13). Required, so nothing the runner starts can hang the job. */
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Pass stdio straight through instead of capturing it (the lock wrapper). */
  inherit?: boolean;
  /** Written to the command's stdin, which is otherwise closed (a judge prompt too long for argv). */
  input?: string;
}

export interface ExecResult {
  /** Exit code, or null when the process was killed or never started. */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the process couldn't start (e.g. ENOENT). */
  error?: string;
}

/** Runs one command. The runner reaches gh, git, npm, claude, qodo and lockf only through this. */
export type Exec = (cmd: string, args: readonly string[], opts: ExecOptions) => Promise<ExecResult>;

/** Runs `fn` after `ms` and returns a cancel; tests pass their own to fire timers on cue. */
export type Schedule = (fn: () => void, ms: number) => () => void;

const realSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

const MAX_OUTPUT = 32 * 1024 * 1024;
const live = new Set<number>();

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group is already gone.
  }
}

/** Signals every process group still running, e.g. when launchd stops the runner mid-run. */
export function killAllChildren(signal: NodeJS.Signals): void {
  for (const pid of live) killGroup(pid, signal);
}

/**
 * Spawns each command in its own process group, so the kill timer also takes down anything it
 * started (a `mwinit` prompt under the claude wrapper, a test runner's workers). SIGTERM first,
 * SIGKILL after `killGraceMs`.
 */
export function realExec(killGraceMs = 5_000, schedule: Schedule = realSchedule): Exec {
  return (cmd, args, opts) => new Promise<ExecResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelHardKill: (() => void) | undefined;
    const child = spawn(cmd, args, {
      cwd: opts.cwd, env: opts.env ?? process.env, detached: true,
      stdio: opts.inherit ? 'inherit' : [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    if (opts.input !== undefined && child.stdin) {
      // A command that exits without reading all of it is reported by its exit code, not as EPIPE.
      child.stdin.on('error', () => {});
      child.stdin.end(opts.input);
    }
    const pid = child.pid;
    if (pid !== undefined) live.add(pid);
    const cancelTimer = schedule(() => {
      timedOut = true;
      if (pid === undefined) return;
      killGroup(pid, 'SIGTERM');
      cancelHardKill = schedule(() => killGroup(pid, 'SIGKILL'), killGraceMs);
    }, opts.timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (d: string) => { if (stdout.length < MAX_OUTPUT) stdout += d; });
    child.stderr?.setEncoding('utf8').on('data', (d: string) => { if (stderr.length < MAX_OUTPUT) stderr += d; });
    let done = false;
    const finish = (code: number | null, error?: string) => {
      if (done) return;
      done = true;
      cancelTimer();
      cancelHardKill?.();
      if (pid !== undefined) {
        // Reap anything the command left behind in its group.
        killGroup(pid, 'SIGKILL');
        live.delete(pid);
      }
      resolve(error === undefined ? { code, stdout, stderr, timedOut } : { code, stdout, stderr, timedOut, error });
    };
    child.on('error', (e) => finish(null, e.message));
    child.on('close', (code) => finish(timedOut ? null : code));
  });
}
