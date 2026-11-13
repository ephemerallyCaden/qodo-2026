// Global setup (#53): a run leaves no temp dirs behind. Every dir tempDir() makes is listed in the
// run's manifest. At the end of the run, any listed dir that still exists outlived its test file:
// it is removed, and the run fails, naming its prefix. In CI, where nothing else shares the temp
// dir, any other new `commet-*` entry no run lists fails the run too: a dir made without tempDir().
// A run that was killed before its end leaves its manifest: the next run removes what it lists.
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { byCodepoint } from '../../src/core/canonical-json.js';
import { MANIFEST_ENV, removeTree } from '../fixtures/tmp.js';

/** `commet-test-run-<pid>-XXXXXX`: a run's manifest dir, named for the Vitest process that owns it. */
export const RUN_PREFIX = 'commet-test-run-';
/** The manifest's file name inside its run dir. */
export const MANIFEST = 'made';

const listed = (manifest: string) => readFileSync(manifest, 'utf8').split('\n').filter(Boolean);
const commetEntries = () => readdirSync(tmpdir()).filter((n) => n.startsWith('commet-') && !n.startsWith(RUN_PREFIX));

/** `commet-mini-AbC123` → `commet-mini-*`, counted, so a report names the fixture that leaked. */
export function byPrefix(dirs: string[]): string {
  const counts = new Map<string, number>();
  for (const d of dirs) {
    const p = `${basename(d).replace(/[^-]*$/, '')}*`;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => byCodepoint(a, b)).map(([p, n]) => `${p} ×${n}`).join(', ');
}

/** Removes the listed dirs that still exist; returns the failure to report, if any. */
export function removeLeftovers(made: string[]): string | undefined {
  const left = [...new Set(made)].filter((d) => existsSync(d));
  for (const d of left) removeTree(d);
  return left.length > 0 ? `${left.length} temp dir(s) outlived their test file and were removed now (#53): ${byPrefix(left)}` : undefined;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const runDirs = () => readdirSync(tmpdir()).filter((n) => n.startsWith(RUN_PREFIX)).map((n) => join(tmpdir(), n));
/** Another run's manifest; one that run has removed meanwhile, or can't be read, lists nothing. */
const listedBy = (run: string) => {
  try {
    return listed(join(run, MANIFEST));
  } catch {
    return [];
  }
};

/**
 * Whether `path` is a real dir (not a link to one) of `uid`; false once it's gone (a concurrent run
 * swept it first). A link named like a dead run could point at a live run's dir (Qodo PR98 r1).
 */
const ownedBy = (path: string, uid: number | undefined) => {
  try {
    const st = lstatSync(path);
    return st.isDirectory() && (uid === undefined || st.uid === uid);
  } catch {
    return false;
  }
};

/**
 * For each run dir of this user whose Vitest process is gone: removes the dirs its manifest lists
 * (only direct children of the temp dir), then the run dir. Another user's run is never touched.
 */
export function sweepDeadRuns(uid = process.getuid?.()): void {
  for (const run of runDirs()) {
    const pid = Number(basename(run).slice(RUN_PREFIX.length).split('-')[0]);
    if (!Number.isInteger(pid) || pid <= 0 || alive(pid) || !ownedBy(run, uid)) continue;
    for (const d of listedBy(run)) if (dirname(d) === tmpdir()) removeTree(d);
    removeTree(run);
  }
}

/**
 * New `commet-*` entries since `before` that no run's manifest lists: made without tempDir(), or by
 * a process that isn't a Vitest run. A concurrent run's in-flight dirs are in its own manifest.
 */
export function strays(before: Set<string>): string[] {
  // Entries first, manifests second: a dir another run makes in between is new to neither.
  const entries = commetEntries();
  const listedByRuns = new Set(runDirs().flatMap((run) => listedBy(run).map((d) => basename(d))));
  return entries.filter((n) => !before.has(n) && !listedByRuns.has(n));
}

export default function setup() {
  sweepDeadRuns();
  const before = new Set(commetEntries());
  const run = mkdtempSync(join(tmpdir(), `${RUN_PREFIX}${process.pid}-`));
  const manifest = join(run, MANIFEST);
  writeFileSync(manifest, '');
  process.env[MANIFEST_ENV] = manifest;
  return () => {
    const made = listed(manifest);
    const errors: string[] = [];
    const left = removeLeftovers(made);
    if (left) errors.push(left);
    const stray = strays(before);
    removeTree(run);
    if (stray.length > 0) {
      const msg = `${stray.length} new temp dir(s) not made by tempDir(), or made by another process (#53): ${byPrefix(stray)}`;
      if (process.env['CI']) errors.push(msg);
      else console.warn(`commet tests: ${msg}`);
    }
    if (errors.length > 0) throw new Error(errors.join('\n'));
  };
}
