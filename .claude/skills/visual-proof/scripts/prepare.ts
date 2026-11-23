// visual-proof: the two builds and the one data clone. A commit is exported with `git archive` (no
// worktree, nothing written to the shared .git); the working tree is copied file by file (tracked and
// untracked, not ignored). Each tree gets this checkout's node_modules (same lockfile only) and its own
// `npm run build`. The data is one clone at a pinned commit, scanned once with --no-ingest and an empty
// CLAUDE_CONFIG_DIR (R12): never this repo's own .git/commet.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { Stop, type Bundle } from './rules.js';

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
  for (const f of untracked) h.update(`\0${f}\0`).update(readFileSync(join(cwd, f)));
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

/** This checkout's node_modules into `dest`, which must have the same lockfile (else the build could differ). */
export function addNodeModules(top: string, dest: string): string[] {
  const mine = readFileSync(join(top, 'package-lock.json')), theirs = readFileSync(join(dest, 'package-lock.json'));
  if (!mine.equals(theirs)) throw new Stop('build-failed', `${relative(dirname(dest), dest)}'s package-lock.json differs from this checkout's: its dependencies would need their own npm ci`);
  // APFS clones the tree in seconds (CLAUDE.md); elsewhere a plain copy
  const args = process.platform === 'darwin' ? ['-cR'] : ['-R'];
  execFileSync('cp', [...args, join(top, 'node_modules'), join(dest, 'node_modules')]);
  return [`cp ${args.join(' ')} <this checkout>/node_modules ${dest}/node_modules`];
}

/** `npm run build` in `dest`, its output in `log`. Throws a build-failed Stop with the output's tail. */
export function buildTree(dest: string, log: string, side: string): { ms: number } {
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', 'build'], { cwd: dest, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, NO_COLOR: '1' } });
  writeFileSync(log, `${r.stdout ?? ''}${r.stderr ?? ''}`);
  if (r.status !== 0) {
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd().split('\n').slice(-15);
    throw new Stop('build-failed', `the ${side} build failed (npm run build, exit ${r.status ?? r.signal})`, tail);
  }
  return { ms: Date.now() - t0 };
}

/** dist/web, every file's path and bytes digested in codepoint order of path. */
export function bundleOf(dest: string): Bundle {
  const root = join(dest, 'dist', 'web');
  if (!existsSync(root)) throw new Stop('build-failed', 'the build wrote no dist/web');
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(root);
  files.sort(byCodepoint);
  const h = createHash('sha256');
  for (const f of files) h.update(`${f}\0`).update(readFileSync(join(root, f))).update('\0');
  return { digest: h.digest('hex'), files };
}

/** One clone of the main checkout at `sha` (objects shared read-only, so it takes a second). Its git dir is its own. */
export function makeClone(main: string, sha: string, dest: string): string[] {
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', main, dest]);
  git(dest, 'checkout', '--quiet', '--detach', sha);
  const common = realpathSync(join(dest, git(dest, 'rev-parse', '--git-common-dir').trim()));
  if (common !== realpathSync(join(dest, '.git'))) throw new Error(`the clone's git dir is ${common}, not its own .git`);
  return [`git clone --quiet --shared --no-checkout <main checkout> ${dest}`, `git -C ${dest} checkout --quiet --detach ${sha}`];
}

/** `commet scan --no-ingest` in the clone with the base build's CLI and an empty CLAUDE_CONFIG_DIR. */
export function scanClone(cli: string, clone: string, roots: readonly string[], claudeDir: string): string[] {
  const args = [cli, 'scan', '--no-ingest', ...(roots.length ? roots.flatMap((r) => ['--root', r]) : ['--no-root'])];
  const r = spawnSync(process.execPath, args, { cwd: clone, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDir } });
  if (r.status !== 0) throw new Stop('build-failed', `commet scan in the data clone failed (exit ${r.status ?? r.signal})`, `${r.stdout}${r.stderr}`.trimEnd().split('\n').slice(-10));
  return [`CLAUDE_CONFIG_DIR=${claudeDir} node ${args.join(' ')}`, ...`${r.stdout}`.trimEnd().split('\n').map((l) => `  ${l}`)];
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
