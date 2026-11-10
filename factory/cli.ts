import { mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { configError, defaults, machinePaths, slugFromRemote, ticksFile, type Config } from './config.js';
import type { Exec } from './exec.js';
import { guarded } from './guard.js';
import { install, setupLabels, uninstall } from './launchd.js';
import { redact, RunLog, type Clock } from './log.js';
import { runTick, type Outcome } from './runner.js';

export const USAGE = `usage: agent-runner <command> [options]

commands:
  tick | --once     one tick: take at most one ready-for-agent ticket (the launchd job runs this)
  install           copy the runner to <git-common-dir>/factory/bin and load the LaunchAgent
  uninstall         unload the LaunchAgent and remove it (run logs stay)
  labels            create or update the four agent-* labels (idempotent)

options:
  --dry-run         print each decision; no labels, comments, worktrees, agent, pushes or PRs
  --issue <N>       with tick --dry-run: preview issue N as if the owner had just labelled it
  --repo <path>     any checkout of the repo (default: the current directory)
  --base <branch>   session branch the PR targets (default: session/week1; never main)
  --github <o/r>    GitHub repo (default: from the origin remote)
  --interval <s>    install: seconds between ticks (default: 300)
`;

/** lockf's "lock is held" exit code (EX_TEMPFAIL with -t 0). */
const LOCK_BUSY = 75;
const LOCKED_ENV = 'COMMET_FACTORY_LOCKED';
/**
 * Outer cap on a whole locked run, above the sum of the inner timers (agent 45 min, three
 * verifies of up to 60 min, two 30 min fix rounds, three 30 min waits, npm ci: about 7 h). A run
 * killed here is swept to agent-needs-help by the next tick.
 */
const RUN_CAP_MS = 8 * 60 * 60_000;

export interface CliDeps {
  exec: Exec;
  clock: Clock;
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  uid: number;
  user: string;
  /** Node binary running this process, and the script it runs (re-run under the lock). */
  node: string;
  script: string;
  print: (text: string) => void;
  printErr: (text: string) => void;
}

interface Args {
  command: string;
  dryRun: boolean;
  issue: number | null;
  repo: string | null;
  base: string | null;
  github: string | null;
  interval: number;
}

function parse(argv: readonly string[]): Args | string {
  const a: Args = { command: '', dryRun: false, issue: null, repo: null, base: null, github: null, interval: 300 };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${x} needs a value`);
      return v;
    };
    try {
      if (x === '--dry-run') a.dryRun = true;
      else if (x === '--once') a.command ||= 'tick';
      else if (x === '--issue') {
        a.issue = Number(value());
        if (!Number.isInteger(a.issue) || a.issue < 1) return '--issue takes an issue number';
      } else if (x === '--repo') a.repo = value();
      else if (x === '--base') a.base = value();
      else if (x === '--github') a.github = value();
      else if (x === '--interval') {
        a.interval = Number(value());
        if (!Number.isInteger(a.interval) || a.interval < 60) return '--interval takes whole seconds, at least 60';
      } else if (!x.startsWith('-') && !a.command) a.command = x;
      else return `unknown argument ${JSON.stringify(x)}`;
    } catch (e) {
      return (e as Error).message;
    }
  }
  return a;
}

async function resolveConfig(a: Args, d: CliDeps, exec: Exec): Promise<Config | string> {
  const start = resolve(d.cwd, a.repo ?? '.');
  const git = (args: string[]) => exec('git', args, { cwd: start, timeoutMs: 30_000, env: d.env });
  const common = await git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.code !== 0) return `${a.repo ? '--repo' : 'the current directory'} is not inside a git checkout`;
  const commonDir = common.stdout.trim();
  if (basename(commonDir) !== '.git') return 'the git common dir is not a .git directory (a bare repo?)';
  let slug = a.github;
  if (!slug) {
    const url = await git(['remote', 'get-url', 'origin']);
    slug = url.code === 0 ? slugFromRemote(url.stdout) : null;
    if (!slug) return 'origin is not a GitHub remote; pass --github <owner/repo>';
  }
  const cfg = defaults(d.home, dirname(commonDir), commonDir, slug);
  if (a.base) cfg.base = a.base;
  cfg.dryRun = a.dryRun;
  cfg.previewIssue = a.issue;
  return configError(cfg) ?? cfg;
}

const exitCode = (o: Outcome) => (o.state === 'error' || o.state === 'preflight-failed' ? 1 : 0);

export async function main(argv: readonly string[], raw: CliDeps): Promise<number> {
  // No absolute machine paths in anything the CLI prints (AGENTS.md Rule 2): HOME shows as ~,
  // and the repo as . once it's known.
  let paths: [string, string][] = [[raw.home, '~']];
  const d: CliDeps = { ...raw, print: (t) => raw.print(redact(t, paths)), printErr: (t) => raw.printErr(redact(t, paths)) };
  const a = parse(argv);
  if (typeof a === 'string') {
    d.printErr(`agent-runner: ${a}\n${USAGE}`);
    return 2;
  }
  if (!a.command || a.command === 'help') {
    (a.command ? d.print : d.printErr)(USAGE);
    return a.command ? 0 : 2;
  }
  if (!['tick', 'install', 'uninstall', 'labels'].includes(a.command)) {
    d.printErr(`agent-runner: unknown command ${JSON.stringify(a.command)}\n${USAGE}`);
    return 2;
  }
  // The same runtime guardrails as a tick (R8); runTick applies its own.
  const exec = guarded(d.exec);
  const cfg = await resolveConfig(a, d, exec);
  if (typeof cfg === 'string') {
    d.printErr(`agent-runner: ${cfg}\n`);
    return 2;
  }
  paths = machinePaths(cfg);
  const inst = { exec, print: d.print, printErr: d.printErr, uid: d.uid, user: d.user, node: d.node, distDir: dirname(d.script) };
  if (a.command === 'install') return install(cfg, inst, a.interval);
  if (a.command === 'uninstall') return uninstall(cfg, inst);
  if (a.command === 'labels') return setupLabels(cfg, inst);

  // One run at a time (R1): re-run this tick under lockf, which the kernel releases if we crash.
  if (!cfg.dryRun && d.env[LOCKED_ENV] !== '1') {
    mkdirSync(cfg.stateDir, { recursive: true });
    const res = await d.exec('/usr/bin/lockf', ['-s', '-t', '0', join(cfg.stateDir, 'lock'), d.node, d.script, ...argv],
      { inherit: true, timeoutMs: RUN_CAP_MS, env: { ...d.env, [LOCKED_ENV]: '1' } });
    if (res.code === LOCK_BUSY) {
      new RunLog(ticksFile(cfg), d.clock, d.print, machinePaths(cfg)).event('busy', { lock: 'held by another tick' });
      return 0;
    }
    return res.code ?? 1;
  }
  const outcome = await runTick(cfg, { exec: d.exec, clock: d.clock, env: d.env, print: d.print });
  return exitCode(outcome);
}
