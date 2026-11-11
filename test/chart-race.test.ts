// A scan publishing a snapshot while a chart write is under way (#58, Qodo PR66 r2). Scans don't
// take the chart lock, so writeChart checks for a publication on both sides of its write. Here the
// "scan" runs from inside writeAtomic, just after chart.json is written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { fileIdOf } from '../src/core/fog/index.js';
import { SELF } from './fixtures/build/basic.js';
import { cli } from './fixtures/cli.js';

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

it('a snapshot published during a chart write puts the chart state back, and the stale action is refused', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-chart-race-')));
  made.push(dir);
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false']]) git(['config', k!, v!]);
  const commit = (body: string) => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/a.ts'), body);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'test: race']);
    return git(['rev-parse', 'HEAD']);
  };
  const env = { CLAUDE_CONFIG_DIR: join(dir, 'no-claude') };
  const snapshot = join(dir, '.git/commet/snapshot.json');
  const oldHead = commit('export const a = 1;\n');
  expect((await cli(['scan', '--no-ingest'], dir, env)).code).toBe(0);
  const oldSnap = readFileSync(snapshot, 'utf8');
  const newHead = commit('export const a = 2;\nexport const b = 3;\n');
  expect((await cli(['scan', '--no-ingest'], dir, env)).code).toBe(0);
  const newSnap = readFileSync(snapshot, 'utf8');
  writeFileSync(snapshot, oldSnap);

  let armed = false;
  vi.resetModules();
  vi.doMock('../src/state/io.js', async (orig) => {
    const io = await orig<typeof import('../src/state/io.js')>();
    return { ...io, writeAtomic: (file: string, data: string | Uint8Array) => {
      io.writeAtomic(file, data);
      if (armed && file.endsWith('chart.json')) {
        armed = false;
        io.writeAtomic(snapshot, newSnap); // the scan publishes
      }
    } };
  });
  try {
    const { openFogSource, writeChart } = await import('../src/state/chart.js');
    const src = await openFogSource(dir);
    expect(src.base.snapshot.repo.head).toBe(oldHead);
    expect(await writeChart(src, { kind: 'chart', fileId: fileIdOf('src/a.ts'), at: oldHead })).toMatchObject({ ok: true });
    const chartFile = join(dir, '.git/commet/chart.json');
    const before = readFileSync(chartFile, 'utf8');

    armed = true;
    expect(await writeChart(src, { kind: 'baseline', at: oldHead })).toEqual({ ok: false, error: 'stale', head: newHead });
    expect(armed).toBe(false); // the publication really happened mid-write
    expect(readFileSync(chartFile, 'utf8')).toBe(before);
    expect(readFileSync(snapshot, 'utf8')).toBe(newSnap);
  } finally {
    vi.doUnmock('../src/state/io.js');
    vi.resetModules();
  }
});
