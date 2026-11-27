// The commands a tick and a findings sweep run, logged the same way: gh and qodo with the
// runner's timers, in an environment that never prompts, each call recorded without long
// arguments (a prompt or a post body never lands in a log).
import { basename } from 'node:path';
import type { Config } from './config.js';
import type { Exec, ExecResult } from './exec.js';
import type { Clock, RunLog } from './log.js';

/** The runner's own environment: no prompt from git or gh can hang a launchd job. */
export const runnerEnv = (base: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  ({ ...base, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' });

export interface ShOptions {
  cwd?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  input?: string;
}

export class Shell {
  readonly env: NodeJS.ProcessEnv;

  /** `log` is read on every call, since a tick moves to its run's own log once it claims a ticket. */
  constructor(private cfg: Config, private exec: Exec, private clock: Clock, private log: () => RunLog, base: NodeJS.ProcessEnv) {
    this.env = runnerEnv(base);
  }

  async sh(cmd: string, args: readonly string[], opts: ShOptions): Promise<ExecResult> {
    const t0 = this.clock.now();
    const res = await this.exec(cmd, args, { ...opts, env: opts.env ?? this.env });
    this.log().event('exec', {
      cmd: basename(cmd), args: args.map((a) => (a.length > 160 ? `<${a.length} chars>` : a)),
      ...(opts.cwd ? { cwd: opts.cwd } : {}), code: res.code, timedOut: res.timedOut, ms: this.clock.now() - t0,
    });
    return res;
  }

  gh(args: string[]): Promise<ExecResult> {
    return this.sh(this.cfg.gh, args, { cwd: this.cfg.repoDir, timeoutMs: this.cfg.timeouts.gh });
  }

  qodo(args: string[]): Promise<ExecResult> {
    return this.sh(this.cfg.qodo, args, { timeoutMs: this.cfg.timeouts.qodo });
  }
}
