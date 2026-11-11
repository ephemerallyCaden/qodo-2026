// A scan publishing a snapshot while a chart write is under way (#58). Scans don't take the chart
// lock, because a write is recorded at its own `at` and a later head can't change what it covers.
// Here the "scan" runs from inside writeAtomic, just after chart.json is written, or between the
// snapshot and layout reads (#64).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { fileIdOf } from '../src/core/fog/index.js';
import { SELF } from './fixtures/build/basic.js';
import { cli } from './fixtures/cli.js';
import { realTempDir } from './fixtures/tmp.js';

/**
 * A repo scanned twice, `change` committed between the scans, with the first scan's pair put back
 * as it was before the second published (#64: a snapshot is read only beside its own layout).
 * `publish` then publishes the second scan's pair as `commet scan` does, layout first.
 */
async function scannedTwice(change: (dir: string, git: (args: string[]) => string) => void) {
  const dir = realTempDir('commet-chart-race-');
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false']]) git(['config', k!, v!]);
  const commit = () => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'test: race']);
    return git(['rev-parse', 'HEAD']);
  };
  const env = { CLAUDE_CONFIG_DIR: join(dir, 'no-claude') };
  const [snapshot, layout] = [join(dir, '.git/commet/snapshot.json'), join(dir, '.git/commet/layout.json')];
  const scan = async () => {
    expect((await cli(['scan', '--no-ingest'], dir, env)).code).toBe(0);
    return [readFileSync(snapshot, 'utf8'), readFileSync(layout, 'utf8')] as const;
  };
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
  const oldHead = commit();
  const [oldSnap, oldLayout] = await scan();
  change(dir, git);
  const newHead = commit();
  const [newSnap, newLayout] = await scan();
  writeFileSync(snapshot, oldSnap);
  writeFileSync(layout, oldLayout);
  const publish = (write: (file: string, text: string) => void) => {
    write(layout, newLayout);
    write(snapshot, newSnap);
  };
  return { dir, git, env, oldHead, newHead, publish };
}

it('a snapshot published during a chart write leaves the write at the head the user saw; the new change stays fogged', async () => {
  const { dir, oldHead, newHead, publish } = await scannedTwice((d) => writeFileSync(join(d, 'src/a.ts'), 'export const a = 2;\nexport const b = 3;\n'));
  let armed = false;
  vi.resetModules();
  vi.doMock('../src/state/io.js', async (orig) => {
    const io = await orig<typeof import('../src/state/io.js')>();
    return { ...io, writeAtomic: (file: string, data: string | Uint8Array) => {
      io.writeAtomic(file, data);
      if (armed && file.endsWith('chart.json')) {
        armed = false;
        publish(io.writeAtomic); // the scan publishes
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
  const { dir, git, env, oldHead, publish } = await scannedTwice((d, g) => {
    g(['mv', 'src/a.ts', 'src/b.ts']);
    writeFileSync(join(d, 'src/b.ts'), 'export const a = 1;\nexport const b = 2;\n');
  });
  git(['checkout', '-q', oldHead]);

  // The scan with the rename publishes just as the chart write takes its lock.
  let armed = true;
  vi.resetModules();
  vi.doMock('node:fs', async (orig) => {
    const fs = await orig<typeof import('node:fs')>();
    const writeFileSync = ((file: Parameters<typeof fs.writeFileSync>[0], ...rest: unknown[]) => {
      if (armed && String(file).endsWith('chart.lock')) {
        armed = false;
        publish((f, text) => fs.writeFileSync(f, text));
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

it('a scan publishing between the snapshot and layout reads is read again, not refused as a mismatched pair (#64)', async () => {
  const { dir, newHead, publish } = await scannedTwice((d) => writeFileSync(join(d, 'src/a.ts'), 'export const a = 2;\n'));
  // The old snapshot is read, then a scan publishes its whole pair, then the (new) layout is read.
  let armed = true;
  vi.resetModules();
  vi.doMock('../src/state/io.js', async (orig) => {
    const io = await orig<typeof import('../src/state/io.js')>();
    return { ...io, readStateBytes: async (stateDir: string, name: string) => {
      if (armed && name === 'layout.json') {
        armed = false;
        publish(io.writeAtomic);
      }
      return io.readStateBytes(stateDir, name);
    } };
  });
  try {
    const { readFog } = await import('../src/state/chart.js');
    expect((await readFog(dir)).head).toBe(newHead);
    expect(armed).toBe(false); // the publication really happened mid-read
  } finally {
    vi.doUnmock('../src/state/io.js');
    vi.resetModules();
  }
});

it('a scan killed between its renames during a chart write: the reload refuses the mixed pair and nothing is written (#64)', async () => {
  const { dir, env, oldHead, publish } = await scannedTwice((d) => writeFileSync(join(d, 'src/a.ts'), 'export const a = 2;\n'));
  // The scan's layout lands just as the chart write takes its lock; its snapshot never does.
  let armed = true;
  vi.resetModules();
  vi.doMock('node:fs', async (orig) => {
    const fs = await orig<typeof import('node:fs')>();
    const writeFileSync = ((file: Parameters<typeof fs.writeFileSync>[0], ...rest: unknown[]) => {
      if (armed && String(file).endsWith('chart.lock')) {
        armed = false;
        publish((f, text) => { if (f.endsWith('layout.json')) fs.writeFileSync(f, text); });
      }
      return (fs.writeFileSync as (...a: unknown[]) => void)(file, ...rest);
    }) as typeof fs.writeFileSync;
    return { ...fs, default: { ...fs, writeFileSync }, writeFileSync };
  });
  try {
    const { main } = await import('../src/cli/main.js');
    let err = '';
    const code = await main(['chart', 'src/a.ts'], { stdout: () => {}, stderr: (t) => (err += t), cwd: dir, env });
    expect(armed).toBe(false);
    expect(code).toBe(5);
    expect(err).toMatch(new RegExp(`^commet: state error: the snapshot \\(of ${oldHead.slice(0, 7)}\\) and the layout \\(of [0-9a-f]{7}\\) come from different scans`));
    expect(existsSync(join(dir, '.git/commet/chart.json'))).toBe(false);
    expect(existsSync(join(dir, '.git/commet/chart.lock'))).toBe(false);
  } finally {
    vi.doUnmock('node:fs');
    vi.resetModules();
  }
});
