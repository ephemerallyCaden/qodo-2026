// What the headless agent, every command it runs and the runner's own runs of repo code may read,
// write and reach (Qodo PR #93 b274f225). The agent's Bash runs in Claude Code's sandbox and its
// file tools under deny rules; the runner's npm calls run under the same limits with
// sandbox-exec. A self-test proves both before any ticket is claimed, and fails closed.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { agentEnv, DENIED_TOOLS } from './agent.js';
import type { Exec } from './exec.js';
import { firstJson } from './review.js';

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const SELF_TEST_TIMEOUT_MS = 5 * 60_000;
export const PROBE_TIMEOUT_MS = 60_000;

export interface SandboxPaths {
  home: string;
  /** `<git-common-dir>/factory`: the runner's state and the copy launchd runs (S3). */
  stateDir: string;
  /** The runner's environment, for where gh, Claude Code, npm and the temp dir keep their files. */
  env: NodeJS.ProcessEnv;
}

/** A path no agent-run process may read: a directory, a file, or every path that starts with it. */
export interface Denied {
  path: string;
  kind: 'dir' | 'file' | 'prefix';
}

/**
 * Credentials the agent never needs: the Midway, AWS and SSH stores, gh's and qodo's logins, the
 * Midway helper's config, the npm, netrc and git credential files (Qodo PR #93 f9a2cd5a), and
 * Claude Code's own credential and account files. npm and git run fine without them. The agent's model
 * calls still work: Claude Code fetches Bedrock credentials in its own process, outside the
 * sandbox and the permission rules (Research, S7).
 */
export function deniedReads(p: SandboxPaths): Denied[] {
  const { home, env } = p;
  const claudeDir = env['CLAUDE_CONFIG_DIR'] || join(home, '.claude');
  const dirs = [
    '.midway', '.aws', '.ssh', '.qodo', '.config/ada', '.config/gh',
  ].map((d) => join(home, d));
  if (env['XDG_CONFIG_HOME']) dirs.push(join(env['XDG_CONFIG_HOME'], 'gh'));
  if (env['GH_CONFIG_DIR']) dirs.push(env['GH_CONFIG_DIR']);
  const files = ['.npmrc', '.netrc', '.git-credentials', '.config/git/credentials'].map((f) => join(home, f));
  if (env['XDG_CONFIG_HOME']) files.push(join(env['XDG_CONFIG_HOME'], 'git/credentials'));
  const list: Denied[] = [
    ...dirs.map((path): Denied => ({ path, kind: 'dir' })),
    ...files.map((path): Denied => ({ path, kind: 'file' })),
    { path: join(claudeDir, '.credentials.json'), kind: 'file' },
    { path: join(claudeDir, 'daemon'), kind: 'dir' },
    { path: join(claudeDir, 'backups'), kind: 'dir' },
    // ~/.claude.json and the .backup and .tmp.* copies Claude Code writes beside it.
    { path: join(home, '.claude.json'), kind: 'prefix' },
    { path: join(claudeDir, '.claude.json'), kind: 'prefix' },
  ];
  return list.filter((d, i) => list.findIndex((x) => x.path === d.path) === i);
}

/** A permission-rule path: `//` marks an absolute path there, where a single `/` would be relative. */
const rulePath = (path: string) => `/${path}`;

/**
 * Git records an agent could rewrite to hand git a config it wrote (Qodo PR #93 b301674c, PR #104
 * 2372ddf8): its worktree's `.git` file, the shared `.git`'s own `commondir` and `config.worktree`
 * (the main checkout honours both), and each worktree's `commondir`, `gitdir` and
 * `config.worktree`, the human's own worktrees included. Git still commits through the rest.
 */
const RECORDS = ['commondir', 'gitdir', 'config.worktree'];
const worktreesDir = (p: SandboxPaths) => join(dirname(p.stateDir), 'worktrees');
const commonRecords = (p: SandboxPaths) => ['commondir', 'config.worktree'].map((r) => join(dirname(p.stateDir), r));

/**
 * The `--settings` for every headless call. Bash runs sandboxed, and nothing falls back to
 * unsandboxed: Claude Code exits if the sandbox can't start, ignores `dangerouslyDisableSandbox`
 * retries, and still asks the allowlist about each command (a sandboxed command would otherwise
 * be auto-allowed). No egress; localhost stays open for tests that bind 127.0.0.1. The Read deny
 * rules hold the file tools to the same list (S2), and the Edit tools stay out of the runner's
 * state, the worktree's `.git` file and everything else outside the worktree (S3). The agent's
 * calls load no repo settings at all (`--setting-sources user`), so nothing in the worktree can
 * loosen this (Qodo PR #93 cf5b7463).
 */
export function claudeSettings(p: SandboxPaths, o: { worktree: string; extra?: Denied[] }): Record<string, unknown> {
  const denied = [...deniedReads(p), ...(o.extra ?? [])];
  const gitFile = join(o.worktree, '.git');
  const reads = denied.flatMap((d) => d.kind === 'dir' ? [`Read(${rulePath(d.path)})`, `Read(${rulePath(d.path)}/**)`]
    : [`Read(${rulePath(d.path)}${d.kind === 'prefix' ? '*' : ''})`]);
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: false,
      filesystem: {
        denyRead: denied.map((d) => (d.kind === 'prefix' ? `${d.path}*` : d.path)),
        denyWrite: [p.stateDir, gitFile, ...commonRecords(p), ...RECORDS.map((r) => join(worktreesDir(p), '*', r))],
      },
      network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: true },
    },
    permissions: {
      deny: [...reads, `Edit(${rulePath(p.stateDir)})`, `Edit(${rulePath(p.stateDir)}/**)`, `Edit(${rulePath(gitFile)})`],
      blockWritesOutsideWorkingDirectories: true,
    },
  };
}

/** The real path, or the path as given if it doesn't exist yet: Seatbelt matches resolved paths. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

const sbString = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`;
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
const sbRegex = (s: string) => `#"^${reEscape(s)}"`;
const sbFilter = (d: Denied) => (d.kind === 'dir' ? `(subpath ${sbString(real(d.path))})`
  : d.kind === 'file' ? `(literal ${sbString(real(d.path))})` : `(regex ${sbRegex(real(dirname(d.path)) + d.path.slice(dirname(d.path).length))})`);

/**
 * The Seatbelt profile the runner's own npm calls run under (S5), the documented equivalent of the
 * agent's sandbox: the same denied reads, writes only to the worktree, the shared `.git` (not its
 * hooks, config or the runner's state), the temp dirs and `/dev`. `check` (the four checks and
 * install scripts) reaches localhost only. `install` (`npm ci --ignore-scripts`, which runs no repo
 * code) also reaches the registry and writes npm's cache.
 */
export function seatbeltProfile(p: SandboxPaths, o: { worktree: string; mode: 'install' | 'check'; extra?: Denied[] }): string {
  const common = dirname(p.stateDir);
  const writable = [o.worktree, common, '/private/tmp', '/private/var/folders', '/dev'];
  if (p.env['TMPDIR']) writable.push(p.env['TMPDIR']);
  if (o.mode === 'install') writable.push(p.env['npm_config_cache'] || join(p.home, '.npm'));
  const denied = [...deniedReads(p), ...(o.extra ?? [])];
  // Here the worktree dirs themselves are pinned too, so one can't be swapped for a symlink.
  const wt = reEscape(real(worktreesDir(p)));
  const records = `(literal ${sbString(real(worktreesDir(p)))}) (regex #"^${wt}/[^/]+$") (regex #"^${wt}/[^/]+/(${RECORDS.map(reEscape).join('|')})$")`;
  const shared = commonRecords(p).map((r) => `(literal ${sbString(real(r))})`).join(' ');
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-write* (require-not (require-any ${writable.map((w) => `(subpath ${sbString(real(w))})`).join(' ')})))`,
    `(deny file-write* (subpath ${sbString(real(p.stateDir))}) (subpath ${sbString(real(join(common, 'hooks')))}) (literal ${sbString(real(join(common, 'config')))})`,
    `  (literal ${sbString(real(join(o.worktree, '.git')))}) ${shared} ${records})`,
    `(deny file-read* ${denied.map(sbFilter).join(' ')})`,
    ...(o.mode === 'check' ? ['(deny network-outbound (require-not (remote ip "localhost:*")))'] : []),
    '',
  ].join('\n');
}

/** `sandbox-exec` args that run `cmd args` under the profile. */
export const seatbelt = (profile: string, cmd: string, args: readonly string[]) => ['-p', profile, cmd, ...args];

// ----- the self-test (S4) -----

export const PROBE = 'probe.sh';
/** The file the probe tries to create in the runner's state dir; it must never appear. */
export const STATE_MARK = '.sandbox-probe';

const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Runs from the self-test's work dir. Each step's output lands in an `out-*` file the runner
 * reads, so the verdict never depends on what a model says it saw.
 */
export function probeScript(canary: string, stateDir: string): string {
  const net = "const s=require('net').connect(80,'192.0.2.1');s.setTimeout(5000);" +
    "s.on('connect',()=>{console.log('NET_OPEN');process.exit()});s.on('timeout',()=>{console.log('NET_TIMEOUT');process.exit()});" +
    "s.on('error',(e)=>{console.log('NET_'+e.code);process.exit()})";
  const local = "const n=require('net');const v=n.createServer((c)=>c.end('LOCAL_OK'));" +
    "v.on('error',(e)=>{console.log('LOCAL_'+e.code);process.exit()});" +
    "v.listen(0,'127.0.0.1',()=>{n.connect(v.address().port,'127.0.0.1').on('data',(d)=>{console.log(String(d));process.exit()})" +
    ".on('error',(e)=>{console.log('LOCAL_'+e.code);process.exit()})})";
  return [
    '#!/bin/sh',
    '# The agent runner\'s sandbox self-test (factory/sandbox.ts).',
    'cat visible.txt > out-visible 2>&1',
    `cat ${shQuote(canary)} > out-canary 2>&1`,
    `touch ${shQuote(join(stateDir, STATE_MARK))} > out-write 2>&1`,
    // 192.0.2.1 is TEST-NET-1 (RFC 5737): unsandboxed it times out, sandboxed it is refused at once.
    `node -e ${shQuote(net)} > out-net 2>&1`,
    `node -e ${shQuote(local)} > out-local 2>&1`,
    'echo done > out-done',
    '',
  ].join('\n');
}

export interface ProbeDirs {
  work: string;
  denied: string;
  stateDir: string;
  visible: string;
  canary: string;
}

const REFUSED = /Operation not permitted/;

/** What the probe got that the sandbox should have refused, or couldn't do that it should; [] is a pass. */
export function probeVerdict(d: ProbeDirs): string[] {
  const out = (name: string) => {
    try {
      return readFileSync(join(d.work, `out-${name}`), 'utf8');
    } catch {
      return null;
    }
  };
  if (out('done') === null) return ['the probe did not run to the end'];
  const fail: string[] = [];
  if (!out('visible')?.includes(d.visible)) fail.push('could not read its own working directory');
  const canary = out('canary') ?? '';
  if (canary.includes(d.canary)) fail.push('read the denied canary file');
  else if (!REFUSED.test(canary)) fail.push('the canary read was not refused by the sandbox');
  if (existsSync(join(d.stateDir, STATE_MARK))) fail.push("wrote into the runner's state dir");
  else if (!REFUSED.test(out('write') ?? '')) fail.push("the write to the runner's state dir was not refused by the sandbox");
  if (!/NET_(EPERM|EACCES)/.test(out('net') ?? '')) fail.push('a connection to the internet was not refused');
  if (!(out('local') ?? '').includes('LOCAL_OK')) fail.push('could not listen on and connect to 127.0.0.1');
  return fail;
}

export function selfTestPrompt(canary: string): string {
  return [
    "This is the agent runner's sandbox self-test. No human is watching. Do exactly these two steps, then stop:",
    `1. Run this Bash command once: sh ${PROBE}`,
    `2. Use the Read tool once on ${canary}. It is meant to be denied: do not retry it or try another way.`,
    'Then reply with the single word: done',
  ].join('\n');
}

/** The probe as the agent's own Bash tool runs it, under the agent's settings plus the canary dir. */
export function selfTestArgs(canary: string, settings: string): string[] {
  return [
    '-p', selfTestPrompt(canary),
    '--output-format', 'json',
    '--permission-mode', 'dontAsk',
    '--max-turns', '6',
    '--max-budget-usd', '1',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--setting-sources', 'user',
    '--settings', settings,
    '--allowedTools', 'Read', `Bash(sh ${PROBE})`,
    '--disallowedTools', ...DENIED_TOOLS,
  ];
}

export interface SelfTest {
  ok: boolean;
  failures: string[];
}

/**
 * Proves both sandboxes are on before a claim, with only files it creates: a canary in a denied
 * temp dir, and a write it attempts into the runner's state dir. First the Seatbelt profile the
 * runner's npm calls use, then the agent's: a real headless call whose Bash tool runs the same
 * probe and whose Read tool is asked for the canary. Anything short of a clean pass is a failure.
 */
export async function sandboxSelfTest(o: {
  exec: Exec; claude: string; paths: SandboxPaths; agentBaseEnv: NodeJS.ProcessEnv; tmpRoot: string;
}): Promise<SelfTest> {
  const base = realpathSync(mkdtempSync(join(o.tmpRoot, 'factory-selftest-')));
  const mark = join(o.paths.stateDir, STATE_MARK);
  const d: ProbeDirs = {
    work: join(base, 'work'), denied: join(base, 'denied'), stateDir: o.paths.stateDir,
    visible: randomBytes(12).toString('hex'), canary: randomBytes(12).toString('hex'),
  };
  const canaryFile = join(d.denied, 'canary.txt');
  const fresh = () => {
    rmSync(d.work, { recursive: true, force: true });
    rmSync(mark, { force: true });
    mkdirSync(d.work, { recursive: true });
    writeFileSync(join(d.work, 'visible.txt'), `${d.visible}\n`);
    writeFileSync(join(d.work, PROBE), probeScript(canaryFile, o.paths.stateDir));
  };
  const failures: string[] = [];
  try {
    mkdirSync(d.denied, { recursive: true });
    mkdirSync(o.paths.stateDir, { recursive: true });
    writeFileSync(canaryFile, `${d.canary}\n`);
    const extra: Denied[] = [{ path: d.denied, kind: 'dir' }];
    const env = agentEnv(o.agentBaseEnv, join(base, 'gh-empty'));

    fresh();
    const profile = seatbeltProfile(o.paths, { worktree: d.work, mode: 'check', extra });
    const sb = await o.exec(SANDBOX_EXEC, seatbelt(profile, '/bin/sh', [PROBE]), { cwd: d.work, timeoutMs: PROBE_TIMEOUT_MS, env });
    const sbFail = sb.error ? [`could not start (${sb.error})`] : probeVerdict(d);
    failures.push(...sbFail.map((f) => `sandbox-exec: ${f}`));

    fresh();
    const settings = JSON.stringify(claudeSettings(o.paths, { worktree: d.work, extra }));
    const res = await o.exec(o.claude, selfTestArgs(canaryFile, settings), { cwd: d.work, timeoutMs: SELF_TEST_TIMEOUT_MS, env });
    const out = firstJson(res.stdout) as { subtype?: unknown; is_error?: unknown; permission_denials?: { tool_name?: unknown }[] } | null;
    const claude: string[] = [];
    if (res.timedOut) claude.push('timed out');
    else if (res.error) claude.push(`could not start (${res.error})`);
    else if (!out || typeof out.subtype !== 'string') claude.push(`no JSON result (exit ${res.code}${/sandbox/i.test(res.stderr) ? ', the sandbox could not start' : ''})`);
    else if (out.subtype !== 'success' || out.is_error || res.code !== 0) {
      // The same bar readClaude sets an agent call (Qodo PR #93 138a8438).
      claude.push(`ended ${out.subtype}${out.is_error ? ' (is_error)' : ''}, exit ${res.code}`);
    }
    if (res.stdout.includes(d.canary)) claude.push('the canary reached the model');
    if (!claude.length) {
      claude.push(...probeVerdict(d));
      if (!(out?.permission_denials ?? []).some((x) => x?.tool_name === 'Read')) claude.push('the Read tool was not denied the canary');
    }
    failures.push(...claude.map((f) => `claude: ${f}`));
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(mark, { force: true });
  }
  return { ok: !failures.length, failures };
}

/**
 * How the runner runs git in the agent's worktree (Qodo PR #104 2372ddf8): under the checks'
 * Seatbelt profile, with the agent's environment and no credentials, pinned to the git dir it
 * recorded. Whatever config the agent plants there runs contained. Only the push leaves the
 * sandbox, and it runs in the main checkout, never in the worktree.
 */
export function worktreeGit(p: SandboxPaths, g: { gitDir: string; worktree: string }, args: readonly string[], env: NodeJS.ProcessEnv) {
  const pin = g.gitDir ? pinnedGitEnv({ gitDir: g.gitDir, commonDir: dirname(p.stateDir), worktree: g.worktree }) : {};
  return { cmd: SANDBOX_EXEC, args: seatbelt(seatbeltProfile(p, { worktree: g.worktree, mode: 'check' }), 'git', args), env: { ...env, ...pin } };
}

/**
 * Pins the runner's git in the worktree (Qodo PR #93 b301674c) to the git dir it recorded before
 * the agent ran, the shared `.git` and the work tree, so a rewritten `.git` file or `commondir`
 * can't hand it a config the agent wrote; only the shared config and hooks apply, which neither
 * sandbox lets anything write.
 */
export function pinnedGitEnv(g: { gitDir: string; commonDir: string; worktree: string }): NodeJS.ProcessEnv {
  return { GIT_DIR: g.gitDir, GIT_COMMON_DIR: g.commonDir, GIT_WORK_TREE: g.worktree };
}
