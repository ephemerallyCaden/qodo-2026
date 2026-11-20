// #53: the suite removes every temp dir it makes, pass or fail, and a run fails if one outlives its
// file. The first case runs the suite's own wiring (vitest.config.ts) on test/fixtures/temp/.
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { byPrefix, MANIFEST, removeLeftovers, RUN_PREFIX, strays, sweepDeadRuns } from './setup/temp-check.js';
import { realTempDir, removeTempDirs, removeTree, tempDir } from './fixtures/tmp.js';

const ROOT = join(import.meta.dirname, '..');
const run = promisify(execFile);

describe('#53 temp dirs', () => {
  it('a failing file\'s fixture dirs are gone once its run ends, removed by the file itself', async () => {
    const out = join(tempDir('commet-temp-out-'), 'made');
    // CI is cleared: the strict CI check would also count this run's in-flight dirs from other files.
    const r = await run(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'test/fixtures/temp/vitest.config.ts'],
      { cwd: ROOT, env: { ...process.env, CI: '', COMMET_TEMP_CASE_OUT: out } })
      .then((x) => ({ code: 0, text: x.stdout + x.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, text: e.stdout + e.stderr }));
    // Preconditions: the case ran, made what it says, and failed, so nothing passes vacuously.
    const made = readFileSync(out, 'utf8').split('\n');
    expect(byPrefix(made)).toBe('commet-mini-* ×1, commet-mini-claude-* ×1, commet-temp-case-* ×1');
    expect(r.text).toContain('failing on purpose');
    expect(r.code).toBe(1);
    for (const d of made) expect(existsSync(d), d).toBe(false);
    expect(r.text).not.toContain('outlived their test file');
  }, 120_000);

  it('the run check removes a dir that outlived its file and reports its prefix', () => {
    const left = tempDir('commet-temp-left-');
    const gone = tempDir('commet-temp-gone-');
    removeTree(gone);
    expect(removeLeftovers([left, gone, left])).toBe('1 temp dir(s) outlived their test file and were removed now (#53): commet-temp-left-* ×1');
    expect(existsSync(left)).toBe(false);
    expect(removeLeftovers([left, gone])).toBeUndefined();
  });

  it('a copy of the helper loaded again after vi.resetModules() feeds the same cleanup', async () => {
    vi.resetModules();
    const again = await import('./fixtures/tmp.js');
    expect(again.tempDir).not.toBe(tempDir);
    const dir = again.tempDir('commet-temp-again-');
    removeTempDirs();
    expect(existsSync(dir)).toBe(false);
  });

  it('removes a tree a test locked (a mode-000 folder holding a file)', () => {
    const dir = tempDir('commet-temp-locked-');
    mkdirSync(join(dir, 'locked'));
    writeFileSync(join(dir, 'locked', 'f'), 'x');
    chmodSync(join(dir, 'locked'), 0);
    removeTree(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it('a killed run\'s leftovers go at the next run: only what its manifest lists, directly in the temp dir', async () => {
    const dead = (await run(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'])).stdout;
    const runDir = tempDir(`${RUN_PREFIX}${dead}-`);
    const orphan = tempDir('commet-temp-orphan-');
    const deeper = join(tempDir('commet-temp-keep-'), 'deeper');
    mkdirSync(deeper);
    const live = tempDir(`${RUN_PREFIX}${process.pid}-`);
    const kept = tempDir('commet-temp-live-');
    writeFileSync(join(runDir, MANIFEST), `${orphan}\n${deeper}\n`);
    writeFileSync(join(live, MANIFEST), `${kept}\n`);
    sweepDeadRuns();
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(runDir)).toBe(false);
    expect(existsSync(deeper)).toBe(true);
    // This process is alive: its run's dirs stay.
    expect(existsSync(kept)).toBe(true);
    expect(existsSync(live)).toBe(true);
  });

  it('a dead run of another user is left alone (Qodo local r1)', async () => {
    const dead = (await run(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'])).stdout;
    const runDir = tempDir(`${RUN_PREFIX}${dead}-`);
    const theirs = tempDir('commet-temp-theirs-');
    writeFileSync(join(runDir, MANIFEST), `${theirs}\n`);
    sweepDeadRuns(process.getuid!() + 1);
    expect(existsSync(theirs)).toBe(true);
    expect(existsSync(runDir)).toBe(true);
  });

  it('a dead run that vanishes mid-sweep (another run swept it first) is skipped (Qodo local r2)', async () => {
    const dead = (await run(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'])).stdout;
    // A dangling entry: listed, then nothing a sweep can read.
    const vanished = join(tmpdir(), `${RUN_PREFIX}${dead}-vanished`);
    symlinkSync(join(tempDir('commet-temp-target-'), 'gone'), vanished);
    try {
      expect(() => sweepDeadRuns()).not.toThrow();
    } finally {
      rmSync(vanished, { force: true });
    }
  });

  it('a link named like a dead run, pointing at a live run\'s dir, sweeps nothing (Qodo PR98 r1)', async () => {
    const dead = (await run(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'])).stdout;
    const live = tempDir(`${RUN_PREFIX}${process.pid}-`);
    const inUse = tempDir('commet-temp-inuse-');
    writeFileSync(join(live, MANIFEST), `${inUse}\n`);
    const link = join(tmpdir(), `${RUN_PREFIX}${dead}-link`);
    symlinkSync(live, link);
    try {
      sweepDeadRuns();
      expect(existsSync(inUse)).toBe(true);
      expect(existsSync(join(live, MANIFEST))).toBe(true);
    } finally {
      rmSync(link, { force: true });
    }
  });

  it('a stray is a new commet-* dir no run lists; a concurrent run\'s in-flight dir is not one (Qodo local r1)', () => {
    const before = new Set(readdirSync(tmpdir()));
    const other = tempDir(`${RUN_PREFIX}${process.pid}-`);
    const inFlight = realTempDir('commet-temp-inflight-');
    writeFileSync(join(other, MANIFEST), `${inFlight}\n`);
    // Unlisted: made the way an old suite did, by hand (rmSync'd below; tempDir() can't make it).
    const unlisted = join(tmpdir(), 'commet-temp-unlisted-x');
    mkdirSync(unlisted);
    try {
      const found = strays(before);
      expect(found).toContain('commet-temp-unlisted-x');
      expect(found).not.toContain(inFlight.split('/').pop());
    } finally {
      rmSync(unlisted, { recursive: true, force: true });
    }
  });
});
