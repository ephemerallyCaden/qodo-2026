// Fixtures for `commet hook` (R7): throwaway repos with git's own config isolated (no system or
// global config, so a machine-wide core.hooksPath such as a security tool's never applies, and no
// global ignore file), and a fake CLI that logs how the hooks called it. Temp dirs come from
// tmp.ts, which removes them when the test file ends.
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { hookCommand, type HookPaths } from '../../src/cli/hook.js';
import { main, type Io } from '../../src/cli/main.js';
import type { Ask } from '../../src/cli/roots.js';
import { SELF } from './build/basic.js';
import { realTempDir } from './tmp.js';

/** A real temp dir, removed when the test file ends (#53). */
export const tempDir = realTempDir;

const sandbox = tempDir('commet-hooks-env-');
/** Git config for every git this suite runs, the CLI's included: none but the repo's own. */
export const GIT_ENV = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(sandbox, 'gitconfig'), XDG_CONFIG_HOME: join(sandbox, 'xdg') };
writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');
Object.assign(process.env, GIT_ENV);
// The suite may run inside a Claude Code session: its project dir must never route events to a real repo.
delete process.env['CLAUDE_PROJECT_DIR'];

export const git = (cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).trim();

/** A repo with one commit, its config isolated. */
export function hookRepo(): string {
  const dir = tempDir('commet-hooks-');
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false']]) git(dir, ['config', k!, v!]);
  writeFileSync(join(dir, 'README.md'), '# hooks fixture\n');
  git(dir, ['add', 'README.md']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

/**
 * A stand-in CLI: appends `{ args, cwd, index }` (GIT_INDEX_FILE, null when unset) to $FAKE_LOG,
 * after $FAKE_DELAY_MS, so a test can tell what the hook ran, where, and whether git waited.
 */
export function fakeCli(): HookPaths & { log: string } {
  const dir = tempDir('commet-hooks-cli-');
  const cli = join(dir, 'fake-cli.cjs');
  writeFileSync(cli, `const { appendFileSync } = require('node:fs');
setTimeout(() => appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(),
  index: process.env.GIT_INDEX_FILE ?? null }) + '\\n'), Number(process.env.FAKE_DELAY_MS || 0));
`);
  return { node: process.execPath, cli, log: join(dir, 'calls.jsonl') };
}

export interface FakeCall { args: string[]; cwd: string; index: string | null }

/** The fake CLI's calls so far, waiting up to `ms` for at least `n`. */
export async function calls(log: string, n = 1, ms = 10_000): Promise<FakeCall[]> {
  for (const until = Date.now() + ms; ;) {
    let lines: FakeCall[] = [];
    try {
      lines = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as FakeCall);
    } catch {
      // Not written yet.
    }
    if (lines.length >= n || Date.now() > until) return lines;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Every entry under `dir` with its kind, mode and bytes (a link's target), to show a command changed nothing. */
export function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const mode = (lstatSync(p).mode & 0o7777).toString(8);
      if (e.isDirectory()) {
        out[p.slice(dir.length)] = `dir ${mode}`;
        walk(p);
      } else if (e.isSymbolicLink()) out[p.slice(dir.length)] = `link ${readlinkSync(p)}`;
      else out[p.slice(dir.length)] = `file ${mode} ${readFileSync(p).toString('base64')}`;
    }
  };
  if (lstatSync(dir, { throwIfNoEntry: false })) walk(dir);
  return out;
}

export interface HookRun { code: number; out: string; err: string }

/** Runs `commet hook <args>` in-process. `stdin` feeds `hook event`; `ask` stands in for a terminal. */
export async function hook(args: string[], cwd: string, o: { paths?: HookPaths; ask?: Ask; stdin?: Readable; env?: NodeJS.ProcessEnv;
  now?: () => number } = {}): Promise<HookRun> {
  let out = '';
  let err = '';
  const io: Io = { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd, env: { ...process.env, ...o.env }, ask: o.ask, stdin: o.stdin };
  const code = await hookCommand(args, io, (quiet) => main(['scan'], quiet), { ...(o.paths ? { paths: o.paths } : {}), ...(o.now ? { now: o.now } : {}) });
  return { code, out, err };
}

export const mkdirp = (p: string) => mkdirSync(p, { recursive: true });
