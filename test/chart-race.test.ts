// A scan publishing a snapshot while a chart write is under way (#58). Scans don't take the chart
// lock, because a write is recorded at its own `at` and a later head can't change what it covers.
// Here the "scan" runs from inside writeAtomic, just after chart.json is written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { fileIdOf } from '../src/core/fog/index.js';
import { SELF } from './fixtures/build/basic.js';
import { cli } from './fixtures/cli.js';
import { realTempDir } from './fixtures/tmp.js';

it('a snapshot published during a chart write leaves the write at the head the user saw; the new change stays fogged', async () => {
  const dir = realTempDir('commet-chart-race-');
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
    const { openFogSource, readFog, writeChart } = await import('../src/state/chart.js');
    const src = await openFogSource(dir);
    expect(src.base.snapshot.repo.head).toBe(oldHead);
    armed = true;
    expect(await writeChart(src, { kind: 'chart', fileId: fileIdOf('src/a.ts'), at: oldHead })).toMatchObject({ ok: true });
    expect(armed).toBe(false); // the publication really happened mid-write
    expect(JSON.parse(readFileSync(join(dir, '.git/commet/chart.json'), 'utf8')).charts).toEqual([{ fileId: fileIdOf('src/a.ts'), at: oldHead }]);
    const fog = await readFog(dir);
    expect(fog.head).toBe(newHead);
    // Every change in this repo is unknown (--no-ingest), so the new one fogs the file again.
    expect(fog.files.find((f) => f.fileId === fileIdOf('src/a.ts'))).toMatchObject({ state: 'fogged', since: newHead });
  } finally {
    vi.doUnmock('../src/state/io.js');
    vi.resetModules();
  }
});

it('`commet chart` reports a file a scan renamed while it charted, at the head it read (Qodo PR66 r3)', async () => {
  const dir = realTempDir('commet-chart-race-');
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false']]) git(['config', k!, v!]);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'test: add']);
  const oldHead = git(['rev-parse', 'HEAD']);
  const env = { CLAUDE_CONFIG_DIR: join(dir, 'no-claude') };
  const snapshot = join(dir, '.git/commet/snapshot.json');
  expect((await cli(['scan', '--no-ingest'], dir, env)).code).toBe(0);
  const oldSnap = readFileSync(snapshot, 'utf8');
  git(['mv', 'src/a.ts', 'src/b.ts']);
  writeFileSync(join(dir, 'src/b.ts'), 'export const a = 1;\nexport const b = 2;\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'test: rename']);
  expect((await cli(['scan', '--no-ingest'], dir, env)).code).toBe(0);
  const newSnap = readFileSync(snapshot, 'utf8');
  git(['checkout', '-q', oldHead]);
  writeFileSync(snapshot, oldSnap);

  // The scan with the rename publishes just as the chart write takes its lock.
  let armed = true;
  vi.resetModules();
  vi.doMock('node:fs', async (orig) => {
    const fs = await orig<typeof import('node:fs')>();
    const writeFileSync = ((file: Parameters<typeof fs.writeFileSync>[0], ...rest: unknown[]) => {
      if (armed && String(file).endsWith('chart.lock')) {
        armed = false;
        fs.writeFileSync(snapshot, newSnap);
      }
      return (fs.writeFileSync as (...a: unknown[]) => void)(file, ...rest);
    }) as typeof fs.writeFileSync;
    return { ...fs, default: { ...fs, writeFileSync }, writeFileSync };
  });
  try {
    const { main } = await import('../src/cli/main.js');
    let out = '';
    let err = '';
    const code = await main(['chart', 'src/a.ts'], { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd: dir, env });
    expect(armed).toBe(false);
    expect([code, err.split('\n').filter((l) => !l.startsWith('note:') && l !== '')]).toEqual([0, []]);
    expect(out).toMatch(new RegExp(`^Charted src/a\\.ts at ${oldHead.slice(0, 7)}\\. It was fogged \\(unknown\\) since ${oldHead.slice(0, 7)}\\. It is still fogged`));
    expect(JSON.parse(readFileSync(join(dir, '.git/commet/chart.json'), 'utf8')).charts).toEqual([{ fileId: fileIdOf('src/a.ts'), at: oldHead }]);
  } finally {
    vi.doUnmock('node:fs');
    vi.resetModules();
  }
});
