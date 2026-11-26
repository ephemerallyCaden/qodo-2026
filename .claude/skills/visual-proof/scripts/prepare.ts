// visual-proof: the two builds and the one data clone. A commit is exported with `git archive` (no
// worktree, nothing written to the shared .git); the working tree is copied file by file (tracked and
// untracked, not ignored). Each tree gets this checkout's node_modules (same lockfile only) and its own
// `npm run build`. The data is one clone at a pinned commit, scanned once with --no-ingest and an empty
// CLAUDE_CONFIG_DIR (R12): never this repo's own .git/commet.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync, type Stats } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { deniedReads, type Denied } from '../../../../factory/sandbox.js';
import { tokenRuns } from './privacy.js';
import { Stop, type Bundle } from './rules.js';
import type { FixtureCommit } from './scene.js';

const byCodepoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
}

/** A side of the comparison: a commit, or the working tree on top of HEAD. */
export interface Rev { sha: string; short: string; subject: string; worktree: boolean; diffHash?: string }

export function resolveRev(cwd: string, ref: string): Rev {
  let sha: string;
  try {
    sha = git(cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`).trim();
  } catch {
    throw new Stop('bad-input', `${ref} is not a commit here`);
  }
  return { sha, short: sha.slice(0, 7), subject: git(cwd, 'log', '-1', '--format=%s', sha).trim(), worktree: false };
}

/** The working tree as the head: HEAD plus its uncommitted changes, named by a hash of them. */
export function worktreeRev(cwd: string): Rev {
  const head = resolveRev(cwd, 'HEAD');
  const status = git(cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=all');
  if (!status) throw new Stop('bad-input', 'the working tree has no uncommitted changes: name a head commit instead');
  const diff = git(cwd, 'diff', '--binary', 'HEAD');
  const untracked = git(cwd, 'ls-files', '-z', '-o', '--exclude-standard').split('\0').filter(Boolean).sort(byCodepoint);
  const h = createHash('sha256').update(diff);
  // A nested repo is listed as `dir/`, and a symlink may dangle: hash what each entry is, never read through it (PR #199 aaa13fc5)
  for (const f of untracked) {
    h.update(`\0${f}\0`);
    const st = lstatSync(join(cwd, f), { throwIfNoEntry: false });
    if (!st) h.update('missing');
    else if (st.isSymbolicLink()) h.update(`symlink\0${readlinkSync(join(cwd, f))}`);
    else if (st.isFile()) h.update(readFileSync(join(cwd, f)));
    else h.update(st.isDirectory() ? 'dir' : 'other');
  }
  const diffHash = h.digest('hex');
  const n = status.split('\0').filter(Boolean).length;
  return { sha: head.sha, short: `wt${diffHash.slice(0, 5)}`, subject: `uncommitted changes on ${head.short} (${n} file${n === 1 ? '' : 's'})`, worktree: true, diffHash };
}

/** Repo paths that differ between `base` and the head (`-z`: any byte but NUL can be in a path). */
export function changedFiles(cwd: string, base: Rev, head: Rev): string[] {
  const z = (s: string) => s.split('\0').filter(Boolean);
  if (!head.worktree) return z(git(cwd, 'diff', '--name-only', '-z', base.sha, head.sha));
  return [...new Set([...z(git(cwd, 'diff', '--name-only', '-z', base.sha)), ...z(git(cwd, 'ls-files', '-z', '-o', '--exclude-standard'))])].sort(byCodepoint);
}

/** Writes the tree of `rev` into `dest` (empty or missing). Returns the commands it ran. */
export function exportTree(cwd: string, rev: Rev, dest: string, tarPath: string): string[] {
  mkdirSync(dest, { recursive: true });
  if (!rev.worktree) {
    git(cwd, 'archive', '--format=tar', '-o', tarPath, rev.sha);
    execFileSync('tar', ['-xf', tarPath, '-C', dest]);
    return [`git archive --format=tar -o ${tarPath} ${rev.sha}`, `tar -xf ${tarPath} -C ${dest}`];
  }
  const files = git(cwd, 'ls-files', '-z', '-c', '-o', '--exclude-standard').split('\0').filter(Boolean);
  let n = 0;
  for (const f of files) {
    const src = join(cwd, f);
    let st;
    try { st = lstatSync(src); } catch { continue; } // tracked but deleted in the working tree: not part of it
    if (st.isDirectory()) continue; // a submodule or nested checkout: not this repo's file
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    cpSync(src, join(dest, f), { verbatimSymlinks: true });
    n++;
  }
  return [`git ls-files -z -c -o --exclude-standard (${files.length} paths), ${n} files copied into ${dest}`];
}

const kindOf = (st: Stats) => (st.isSymbolicLink() ? 'a symlink' : st.isDirectory() ? 'a directory' : st.isFile() ? 'a file' : 'a special file');

/**
 * This checkout's node_modules into `dest`, which must have the same lockfile (else the build could differ)
 * and no node_modules of its own: the copy runs outside the sandbox, so it never goes over one, or
 * through a link wherever that points (Qodo d8fc556d).
 */
export function addNodeModules(top: string, dest: string): string[] {
  const side = relative(dirname(dest), dest);
  const mine = readFileSync(join(top, 'package-lock.json')), theirs = readFileSync(join(dest, 'package-lock.json'));
  if (!mine.equals(theirs)) {
    throw new Stop('build-failed', `the ${side} tree's package-lock.json differs from this checkout's, so this checkout's node_modules isn't its dependencies; it would need its own npm ci, which needs the network`);
  }
  const own = lstatSync(join(dest, 'node_modules'), { throwIfNoEntry: false });
  if (own) {
    throw new Stop('build-failed', `the ${side} tree has its own node_modules (${kindOf(own)}), tracked or in the working tree; the run copies this checkout's node_modules in outside the sandbox, and never over or through one`);
  }
  // APFS clones the tree in seconds (CLAUDE.md); elsewhere a plain copy
  const args = process.platform === 'darwin' ? ['-cR'] : ['-R'];
  execFileSync('cp', [...args, join(top, 'node_modules'), join(dest, 'node_modules')]);
  return [`cp ${args.join(' ')} <this checkout>/node_modules ${dest}/node_modules`];
}

/** `npm run build` in `dest`, its output in `log`. Throws a build-failed Stop with the output's tail. */
export function buildTree(dest: string, log: string, side: string, profile: string): { ms: number } {
  const t0 = Date.now();
  const c = contained('npm', ['run', 'build'], profile);
  const r = spawnSync(c.cmd, c.args, { cwd: dest, encoding: 'utf8', maxBuffer: 1 << 26, env: revisionEnv(process.env, { NO_COLOR: '1' }) });
  writeFileSync(log, `${r.stdout ?? ''}${r.stderr ?? ''}`);
  if (r.status !== 0) {
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd().split('\n').slice(-15);
    throw new Stop('build-failed', `the ${side} build failed (npm run build, exit ${r.status ?? r.signal})`, tail);
  }
  return { ms: Date.now() - t0 };
}

/**
 * dist/web, every file's path and bytes digested in codepoint order of path. Files and folders only: this
 * process reads them outside the sandbox (the digest, the privacy scan), so a link the build made to a
 * file the sandbox denies is never read through.
 */
export function bundleOf(dest: string): Bundle {
  const root = join(dest, 'dist', 'web');
  const top = lstatSync(root, { throwIfNoEntry: false });
  if (!top) throw new Stop('build-failed', 'the build wrote no dist/web');
  if (!top.isDirectory()) throw new Stop('build-failed', `the build's dist/web is ${kindOf(top)}, not a folder`);
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(relative(root, p).split('\\').join('/'));
      else throw new Stop('build-failed', `the build wrote ${e.isSymbolicLink() ? 'a symlink' : 'a special file'} into dist/web; it may hold files and folders only`);
    }
  };
  walk(root);
  files.sort(byCodepoint);
  const h = createHash('sha256');
  for (const f of files) h.update(`${f}\0`).update(readFileSync(join(root, f))).update('\0');
  return { digest: h.digest('hex'), files };
}

/** Each dist/web file's path and its bytes as text, for the privacy scan before anything is served (Qodo 648df95e). */
export function bundleFiles(dest: string, bundle: Bundle): { path: string; text: string }[] {
  return bundle.files.map((path) => ({ path, text: readFileSync(join(dest, 'dist', 'web', path), 'utf8') }));
}

/**
 * The token-like runs in this checkout's own three.js build: library text, not secrets. The view bundles
 * three, whose WebGL names (`COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR`) have a token's shape, and both sides
 * build from this checkout's node_modules (the same lockfile), which no revision can write. The bundle
 * scan skips these runs, and nothing else (Qodo 648df95e).
 */
export function libraryRuns(top: string): Set<string> {
  const dir = join(top, 'node_modules', 'three', 'build');
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort(byCodepoint)) for (const r of tokenRuns(readFileSync(join(dir, f), 'utf8'))) out.add(r);
  return out;
}

/** One clone of the main checkout at `sha` (objects shared read-only, so it takes a second). Its git dir is its own. */
export function makeClone(main: string, sha: string, dest: string): string[] {
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', main, dest]);
  git(dest, 'checkout', '--quiet', '--detach', sha);
  const common = realpathSync(join(dest, git(dest, 'rev-parse', '--git-common-dir').trim()));
  if (common !== realpathSync(join(dest, '.git'))) throw new Error(`the clone's git dir is ${common}, not its own .git`);
  return [`git clone --quiet --shared --no-checkout <main checkout> ${dest}`, `git -C ${dest} checkout --quiet --detach ${sha}`];
}

/**
 * A scene's own repo: the `earlier` commits, oldest first, then these files in one commit at `at`, each
 * commit by a fixed author at its own date, so the same files always give the same SHA. Its git dir is
 * its own, like the clone's.
 */
export function makeFixtureRepo(files: Readonly<Record<string, string>>, at: string, dest: string, earlier: readonly FixtureCommit[] = []): string[] {
  mkdirSync(dest, { recursive: true });
  git(dest, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']] as const) git(dest, 'config', k, v);
  const commits = [...earlier, { files, at }];
  for (const c of commits) {
    for (const path of Object.keys(c.files).sort(byCodepoint)) {
      mkdirSync(dirname(join(dest, path)), { recursive: true });
      writeFileSync(join(dest, path), c.files[path]!);
    }
    git(dest, 'add', '-A');
    execFileSync('git', ['commit', '-q', '-m', c.at], { cwd: dest, env: { ...process.env, GIT_AUTHOR_DATE: c.at, GIT_COMMITTER_DATE: c.at } });
  }
  const each = commits.map((c) => `${Object.keys(c.files).length} files at ${c.at} (${Object.keys(c.files).sort(byCodepoint).join(', ')})`);
  return [`git init in ${dest}; ${commits.length === 1 ? `one commit: ${each[0]}` : `${commits.length} commits, oldest first: ${each.join('; ')}`}; by Mate <mate@example.com>`];
}

/** `commet scan --no-ingest` in the clone with the base build's CLI and an empty CLAUDE_CONFIG_DIR. */
export function scanClone(cli: string, clone: string, roots: readonly string[], claudeDir: string, profile: string): string[] {
  const args = [cli, 'scan', '--no-ingest', ...(roots.length ? roots.flatMap((r) => ['--root', r]) : ['--no-root'])];
  const c = contained(process.execPath, args, profile);
  const r = spawnSync(c.cmd, c.args, { cwd: clone, encoding: 'utf8', env: revisionEnv(process.env, { CLAUDE_CONFIG_DIR: claudeDir }) });
  if (r.status !== 0) throw new Stop('build-failed', `commet scan in the data clone failed (exit ${r.status ?? r.signal})`, `${r.stdout}${r.stderr}`.trimEnd().split('\n').slice(-10));
  return [`CLAUDE_CONFIG_DIR=${claudeDir} sandbox-exec node ${args.join(' ')}`, ...`${r.stdout}`.trimEnd().split('\n').map((l) => `  ${l}`)];
}

/** The snapshot's session count: 0 after --no-ingest, else agent logs were read (R12). */
export function snapshotSessions(state: string): number {
  const s = JSON.parse(readFileSync(join(state, 'snapshot.json'), 'utf8')) as { sessions?: unknown[] };
  return s.sessions?.length ?? 0;
}

/** sha256 of each file in a state dir, for the record (which state every take started from). */
export function stateDigest(state: string): string[] {
  return readdirSync(state).filter((f) => lstatSync(join(state, f)).isFile()).sort(byCodepoint)
    .map((f) => `${createHash('sha256').update(readFileSync(join(state, f))).digest('hex').slice(0, 16)}  ${f}`);
}

/** The run's scratch dir, readable by this user only (0700): its raw takes hold page text and API bodies (PR #199 868113ad). */
export function makeScratch(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

/** The environment a revision's code gets: these names only, so no token or key reaches a build, a scan or a take (PR #199 6683b8a2). */
const ENV_ALLOW = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'NO_COLOR', 'PLAYWRIGHT_BROWSERS_PATH'];

export function revisionEnv(env: NodeJS.ProcessEnv, extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of ENV_ALLOW) if (env[k] !== undefined) out[k] = env[k];
  return { ...out, ...extra };
}

/** sandbox-exec, which contains every process that runs a revision's code (macOS; elsewhere the run stops: tool-missing). */
export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
const sbString = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`;
const sbFilter = (d: Denied) => (d.kind === 'dir' ? `(subpath ${sbString(real(d.path))})` : d.kind === 'file' ? `(literal ${sbString(real(d.path))})`
  : `(regex #"^${(real(dirname(d.path)) + d.path.slice(dirname(d.path).length)).replace(/[.*+?^${}()|[\]\\"]/g, '\\$&')}")`);

/**
 * The Seatbelt profile for a revision's code (PR #199 6683b8a2): the credential stores the factory's runner
 * denies (factory/sandbox.ts deniedReads) can't be read, nothing outside `writable` (and /dev) written,
 * and nothing reached but localhost. A build, the data scan, the scene's CLI steps and each take run under it.
 */
export function sandboxProfile(o: { home: string; env: NodeJS.ProcessEnv; writable: readonly string[] }): string {
  const writable = [...o.writable, '/dev'].map((w) => `(subpath ${sbString(real(w))})`).join(' ');
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-read* ${deniedReads({ home: o.home, env: o.env, stateDir: join(o.home, '.visual-proof-none') }).map(sbFilter).join(' ')})`,
    `(deny file-write* (require-not (require-any ${writable})))`,
    '(deny network-outbound (require-not (remote ip "localhost:*")))',
    '',
  ].join('\n');
}

/** `cmd args`, run under `profile`. */
export const contained = (cmd: string, args: readonly string[], profile: string): { cmd: string; args: string[] } => ({ cmd: SANDBOX_EXEC, args: ['-p', profile, cmd, ...args] });

/** Seatbelt can't nest: inside another sandbox (the agent runner's checks, Claude Code's sandboxed Bash) sandbox_apply is refused and nothing runs. */
export const NESTED_SANDBOX = "sandbox-exec can't nest: already sandboxed";

/** Whether a sandbox can start here: `nested` only on the refusal a sandboxed process gets, anything else that fails is `unavailable`. */
export function sandboxState(r: { status: number | null; stderr?: string | null }): 'ok' | 'nested' | 'unavailable' {
  if (r.status === 0) return 'ok';
  return /sandbox_apply: Operation not permitted/.test(r.stderr ?? '') ? 'nested' : 'unavailable';
}

/** Starts the smallest sandbox (it allows everything) and says whether it could. */
export function probeSandbox(): 'ok' | 'nested' | 'unavailable' {
  return sandboxState(spawnSync(SANDBOX_EXEC, ['-p', '(version 1)(allow default)', '/usr/bin/true'], { encoding: 'utf8' }));
}
