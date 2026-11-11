// `commet chart` (#33, R5): fog status, the first-run baseline and charting one file. Charting a
// file here stands in for opening its diff until the view (#30) exists.
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, relative, sep } from 'node:path';
import { byCodepoint } from '../core/canonical-json.js';
import type { FogView } from '../core/contract/fog.js';
import { CommetError, EXIT } from '../core/errors.js';
import { chartedFileId, fogFrom } from '../core/fog/index.js';
import type { FileId } from '../core/snapshot/types.js';
import { gitRunner, tryGit } from '../scan/git.js';
import { currentFog, openFogSource, writeChart, type FogSource } from '../state/chart.js';
import type { Io } from './main.js';

export const CHART_USAGE = '       commet chart status | commet chart baseline [--undo] | commet chart [--] <file>\n';

type Job = { kind: 'status' } | { kind: 'baseline'; undo: boolean } | { kind: 'file'; arg: string };

function parse(args: string[]): Job | string {
  const [sub, ...more] = args;
  if (sub === undefined) return 'chart needs `status`, `baseline` or a file';
  if (sub === 'status') return more.length === 0 ? { kind: 'status' } : `unknown option ${JSON.stringify(more[0])}`;
  if (sub === 'baseline') {
    if (more.length === 0) return { kind: 'baseline', undo: false };
    return more.length === 1 && more[0] === '--undo' ? { kind: 'baseline', undo: true } : `unknown option ${JSON.stringify(more.at(-1))}`;
  }
  const files = sub === '--' ? more : args;
  if (sub !== '--' && sub.startsWith('-')) return `unknown option ${JSON.stringify(sub)}`;
  if (files.length !== 1 || files[0] === '') return 'chart one file at a time';
  return { kind: 'file', arg: files[0]! };
}

const short = (sha: string) => sha.slice(0, 7);
/** A scan replaced the snapshot with one that doesn't know the head the command read: nothing was written. */
const unknownHead = (head: string) => new CommetError(`the snapshot changed while charting (now at ${short(head)}); nothing was written, run the command again`, EXIT.state);
/** Paths are shown as git has them; one holding control characters is quoted so it can't drive the terminal. */
const label = (path: string) => (/\p{Cc}/u.test(path) ? JSON.stringify(path) : path);

interface Row { name: string; files: number; fogged: number; charted: number; clear: number }
const row = (name: string): Row => ({ name, files: 0, fogged: 0, charted: 0, clear: 0 });

/** Per-planet, star and total counts by state, and the row each file is counted in. */
function tally(src: FogSource, fog: FogView) {
  const names = new Map(src.base.snapshot.dirs.map((d) => [d.id, d.path]));
  const planets = new Map(fog.planets.map((p) => [p.dirId, row(label(names.get(p.dirId) ?? p.dirId))]));
  const [star, total] = [row('star'), row('total')];
  const rowOf = new Map<FileId, Row>();
  for (const f of fog.files) {
    const id = src.base.home.get(f.fileId);
    const r = (id && planets.get(id)) || star;
    for (const x of [r, total]) {
      x.files++;
      x[f.state]++;
    }
    rowOf.set(f.fileId, r);
  }
  return { planets: [...planets.values()].sort((a, b) => byCodepoint(a.name, b.name)), star, total, rowOf };
}

const summary = (r: Row) => `${r.fogged} fogged, ${r.charted} charted, ${r.clear} clear (${r.files} files)`;

async function notes(src: FogSource, cwd: string): Promise<string> {
  let out = '';
  const head = (await tryGit(gitRunner(cwd), ['rev-parse', 'HEAD']))?.trim();
  const snapHead = src.base.snapshot.repo.head;
  if (head && head !== snapHead) out += `note: the snapshot is of ${short(snapHead)} but HEAD is ${short(head)}; run \`commet scan\` to chart newer changes\n`;
  if (src.base.degraded && src.base.snapshot.commits.length > 0) {
    out += 'note: rename history for the snapshot could not be read, so every changed file is fogged (lineage-unknown)\n';
  }
  return out;
}

async function status(src: FogSource, io: Io): Promise<number> {
  const fog = await currentFog(src);
  const { planets, star, total } = tally(src, fog);
  const width = Math.max(6, ...[...planets, star].map((r) => r.name.length));
  const line = (r: Row | Record<keyof Row, string>) =>
    `${String(r.name).padEnd(width)}  ${[r.files, r.fogged, r.charted, r.clear].map((v) => String(v).padStart(8)).join('')}\n`;
  const clear = planets.filter((p) => p.fogged === 0).length;
  io.stdout(`fog at ${short(fog.head)}, baseline ${fog.baseline ? short(fog.baseline) : 'none'}\n`
    + line({ name: 'planet', files: 'files', fogged: 'fogged', charted: 'charted', clear: 'clear' })
    + planets.map(line).join('') + line(star) + line(total)
    + `${clear} of ${planets.length} planets clear; the star holds root files, unmatched tests and test data\n`);
  return 0;
}

/**
 * A relative file argument as a repo path: `prefix` is the cwd's path from the top (`rev-parse
 * --show-prefix`). Windows separators become `/` only on Windows, since a backslash is an ordinary
 * filename byte elsewhere. Null when it leads outside the repository.
 */
export function relativeRepoPath(prefix: string, arg: string, separator = sep): string | null {
  const path = posix.normalize(prefix + (separator === '\\' ? arg.replaceAll('\\', '/') : arg)).replace(/\/+$/, '');
  return path === '..' || path.startsWith('../') ? null : path;
}

/**
 * The real path of `p`. A path that doesn't exist (a file deleted from the working tree) resolves
 * through its folder; anything else that can't be resolved, such as a dangling symlink, gives null.
 */
function realOrMissing(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return null;
  }
  try {
    lstatSync(p);
    return null; // it exists, so it's a link that leads nowhere
  } catch {
    // Absent: resolve its folder instead.
  }
  const parent = dirname(p);
  const up = parent === p ? null : realOrMissing(parent);
  return up === null ? null : join(up, basename(p));
}

/** The repo-relative path for a file argument, or null when it's outside the repository. */
async function repoPath(cwd: string, arg: string): Promise<string | null> {
  const git = gitRunner(cwd);
  if (isAbsolute(arg)) {
    const top = await tryGit(git, ['rev-parse', '--show-toplevel']);
    const [root, file] = [top === null ? null : realOrMissing(top.replace(/\n$/, '')), realOrMissing(arg)];
    if (root === null || file === null) return null;
    const rel = relative(root, file);
    return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : rel.split(sep).join('/');
  }
  const prefix = await tryGit(git, ['rev-parse', '--show-prefix']);
  return prefix === null ? null : relativeRepoPath(prefix.replace(/\n$/, ''), arg);
}

async function chartFile(src: FogSource, io: Io, arg: string): Promise<number> {
  const path = await repoPath(io.cwd, arg);
  if (path === null) {
    io.stderr(`commet: ${isAbsolute(arg) ? 'that path' : label(arg)} is not a file in this repository\n`);
    return EXIT.usage;
  }
  const files = src.base.snapshot.files;
  const file = files.find((f) => f.path === path);
  if (!file) {
    const folder = path === '.' || files.some((f) => f.path.startsWith(`${path}/`));
    io.stderr(folder ? `commet: ${label(path)} is a folder: chart its files one at a time, or set a baseline\n`
      : `commet: ${label(path)} isn't in the latest snapshot (excluded, uncommitted or newer than the scan: run \`commet scan\`)\n`);
    return EXIT.usage;
  }
  const at = src.base.snapshot.repo.head;
  const r = await writeChart(src, { kind: 'chart', fileId: file.id, at });
  if (!r.ok && r.head !== undefined) throw unknownHead(r.head);
  if (!r.ok) throw new CommetError(r.error, EXIT.internal);
  // A scan may have landed (and renamed the file) before the write: report the file by its id in the
  // base the write was applied on, and the chart at the head it was recorded at.
  const id = chartedFileId(r.base, { fileId: file.id, at }) ?? file.id;
  const after = fogFrom(r.base, r.chart);
  const was = fogFrom(r.base, r.prev).files.find((f) => f.fileId === id);
  const now = after.files.find((f) => f.fileId === id);
  if (!was || !now) throw new CommetError('charted file is missing from the fog view', EXIT.internal);
  const before = was.state === 'fogged' ? `It was fogged (${was.reasons.join(', ')}) since ${short(was.since!)}.`
    : was.state === 'charted' ? 'It was already charted.' : "It had no changes you didn't write.";
  const still = now.state === 'fogged' ? ` It is still fogged (${now.reasons.join(', ')}) since ${short(now.since!)}.` : '';
  io.stdout(`Charted ${label(path)} at ${short(at)}. ${before}${still}\n`);
  const where = tally({ ...src, base: r.base }, after).rowOf.get(id)!;
  io.stdout(`${where.name}: ${where.fogged} of ${where.files} files fogged\n`);
  return 0;
}

async function baseline(src: FogSource, io: Io, undo: boolean): Promise<number> {
  // The CLI has no older view: it acts at the head of the snapshot it just read (#58).
  const at = src.base.snapshot.repo.head;
  const r = await writeChart(src, { kind: undo ? 'baseline-undo' : 'baseline', at });
  if (!r.ok && r.head !== undefined) throw unknownHead(r.head);
  if (!r.ok) {
    io.stderr(`commet: ${r.error}\n`);
    return EXIT.state;
  }
  const [before, fog] = [fogFrom(r.base, r.prev), fogFrom(r.base, r.chart)];
  const changed = fog.files.filter((f, i) => (f.state === 'fogged') !== (before.files[i]!.state === 'fogged')).length;
  if (undo) {
    const removed = r.prev.baselines.at(-1)!;
    io.stdout(`Removed the baseline at ${short(removed)}; ${changed} files are fogged again. Baseline now: ${fog.baseline ? short(fog.baseline) : 'none'}.\n`);
  } else {
    io.stdout(`Baseline at ${short(at)}: charting ${changed} fogged files, every change up to this commit. `
      + 'Undo with `commet chart baseline --undo`.\n');
  }
  io.stdout(`Now: ${summary(tally({ ...src, base: r.base }, fog).total)}\n`);
  return 0;
}

/** Runs `commet chart …` and returns the exit code. */
export async function chartCommand(args: string[], io: Io): Promise<number> {
  const job = parse(args);
  if (typeof job === 'string') {
    io.stderr(`commet: ${job}\n${CHART_USAGE.replace(/^ {7}/, 'usage: ')}`);
    return EXIT.usage;
  }
  try {
    const src = await openFogSource(io.cwd);
    const code = job.kind === 'status' ? await status(src, io) : job.kind === 'baseline' ? await baseline(src, io, job.undo) : await chartFile(src, io, job.arg);
    io.stderr(await notes(src, io.cwd));
    return code;
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
