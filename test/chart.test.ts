// `commet chart` and chart state on disk (#33, R5), end to end on a real git repo: charting, refog,
// a rename, baseline and undo, re-scans, and the state I/O guarantees (AC 4–6).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileIdOf } from '../src/core/fog/index.js';
import { relativeRepoPath } from '../src/cli/chart.js';
import { applyChart, readFog } from '../src/state/chart.js';
import { SELF, TEAMMATE } from './fixtures/build/basic.js';
import { cli } from './fixtures/cli.js';
import { miniClaude, session } from './fixtures/mini.js';

const DAY = '2026-10-10';
/** Temp dirs this file made, removed at the end so repeated runs don't fill the disk. */
const made: string[] = [];
const tempDir = (prefix: string) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A repo whose self commits are human: an idle session covers the whole day and logs no edit. */
function repo() {
  const dir = tempDir('commet-chart-');
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    git(['config', k!, v!]);
  }
  const s = session('56565656-5656-4565-8565-565656565656', dir);
  const claude = dirname(miniClaude({ idle: [s.user('i1', `${DAY}T08:00:00.000Z`), s.user('i2', `${DAY}T18:00:00.000Z`)] }));
  made.push(claude);
  let n = 0;
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  /** Commits at the next hour; `who` is the author (the committer is always self). */
  const commit = (who: { name: string; email: string }, change: () => void) => {
    change();
    git(['add', '-A']);
    const at = `${DAY}T${String(9 + n++).padStart(2, '0')}:00:00Z`;
    git(['commit', '-q', '-m', `test: ${n}`], { GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: at,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_COMMITTER_DATE: at });
    return git(['rev-parse', 'HEAD']);
  };
  const env = { CLAUDE_CONFIG_DIR: claude };
  const run = (...args: string[]) => cli(args, dir, env);
  const chartJson = () => join(dir, '.git/commet/chart.json');
  return { dir, git, write, commit, run, chartJson };
}

const lines = (tag: string) => [1, 2, 3].map((i) => `export const ${tag}Line${i} = ${i};`).join('\n') + '\n';

describe('commet chart on a real repo', () => {
  let r: ReturnType<typeof repo>;
  const status = async () => (await r.run('chart', 'status')).out;
  const row = (out: string, name: string) => out.split('\n').find((l) => l.startsWith(`${name} `))!.trim().split(/\s+/).slice(1).map(Number);

  beforeAll(async () => {
    r = repo();
    r.commit(SELF, () => {
      r.write('src/a.ts', lines('alpha'));
      r.write('src/b.ts', lines('beta'));
      r.write('README.md', '# Chart fixture\nA root file on the star.\n');
    });
    r.commit(TEAMMATE, () => r.write('src/a.ts', lines('alpha') + lines('mate')));
    expect((await r.run('scan')).code).toBe(0);
  });

  it('status prints fogged and charted counts per planet', async () => {
    const out = await status();
    expect(out).toContain('baseline none');
    // files, fogged, charted, clear
    expect(row(out, 'src')).toEqual([2, 1, 0, 1]);
    expect(row(out, 'star')).toEqual([1, 0, 0, 1]);
    expect(out).toContain('0 of 1 planets clear');
  });

  it('charting a file records its id and commit (ids and SHAs only, 0600) and clears the planet', async () => {
    const res = await r.run('chart', 'src/a.ts');
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Charted src\/a\.ts at [0-9a-f]{7}\. It was fogged \(unknown\) since [0-9a-f]{7}\.\nsrc: 0 of 2 files fogged\n$/);
    const text = readFileSync(r.chartJson(), 'utf8');
    expect(JSON.parse(text)).toEqual({ schemaVersion: 'chart.1', charts: [{ fileId: fileIdOf('src/a.ts'), at: r.git(['rev-parse', 'HEAD']) }], baselines: [] });
    expect(text).not.toMatch(/src|\//);
    expect(statSync(r.chartJson()).mode & 0o777).toBe(0o600);
    expect(row(await status(), 'src')).toEqual([2, 0, 1, 1]);
    expect(await status()).toContain('1 of 1 planets clear');
  });

  it('a rename keeps charted state across a re-scan; a later change that isn\'t yours refogs it', async () => {
    r.commit(SELF, () => r.git(['mv', 'src/a.ts', 'src/moved.ts']));
    expect((await r.run('scan')).code).toBe(0);
    let fog = await readFog(r.dir);
    expect(fog.files.find((f) => f.fileId === fileIdOf('src/moved.ts'))).toMatchObject({ state: 'charted' });
    const mate = r.commit(TEAMMATE, () => r.write('src/moved.ts', lines('alpha') + lines('mate') + lines('again')));
    expect((await r.run('scan')).code).toBe(0);
    fog = await readFog(r.dir);
    expect(fog.files.find((f) => f.fileId === fileIdOf('src/moved.ts'))).toEqual({ fileId: fileIdOf('src/moved.ts'), state: 'fogged',
      reasons: ['unknown'], since: mate });
  });

  it('baseline charts everything up to HEAD and says how many; --undo restores the state exactly', async () => {
    const before = readFileSync(r.chartJson(), 'utf8');
    const set = await r.run('chart', 'baseline');
    expect(set.code).toBe(0);
    expect(set.out).toContain('charting 1 fogged files, every change up to this commit');
    expect(set.out).toContain('Now: 0 fogged, 1 charted, 2 clear (3 files)');
    expect(row(await status(), 'src')).toEqual([2, 0, 1, 1]);
    const undo = await r.run('chart', 'baseline', '--undo');
    expect(undo.code).toBe(0);
    expect(undo.out).toContain('1 files are fogged again. Baseline now: none.');
    expect(readFileSync(r.chartJson(), 'utf8')).toBe(before);
    const again = await r.run('chart', 'baseline', '--undo');
    expect([again.code, again.err]).toEqual([5, 'commet: no baseline to undo\n']);
  });

  it('the server entry point validates its untrusted body', async () => {
    const at = (await readFog(r.dir)).head;
    expect(await applyChart(r.dir, { kind: 'chart', fileId: fileIdOf('src/moved.ts'), at, extra: 1 })).toEqual({ ok: false, error: 'not a chart action' });
    expect(await applyChart(r.dir, { kind: 'chart', fileId: fileIdOf('src/moved.ts') })).toEqual({ ok: false, error: 'not a chart action' });
    expect(await applyChart(r.dir, { kind: 'chart', fileId: fileIdOf('nope.ts'), at })).toEqual({ ok: false, error: 'no such file in the latest snapshot' });
    const ok = await applyChart(r.dir, { kind: 'chart', fileId: fileIdOf('src/moved.ts'), at });
    expect(ok.ok && ok.fog.files.find((f) => f.fileId === fileIdOf('src/moved.ts'))!.state).toBe('charted');
    // The chart that the new one covers is dropped.
    expect(JSON.parse(readFileSync(r.chartJson(), 'utf8')).charts).toHaveLength(1);
  });

  it('snapshot file ids are the path ids fog follows renames with', async () => {
    const snap = JSON.parse(readFileSync(join(r.dir, '.git/commet/snapshot.json'), 'utf8')) as { files: { id: string; path: string }[] };
    for (const f of snap.files) expect(f.id).toBe(fileIdOf(f.path));
  });

  it('charts a file by its absolute path even after it was deleted from the working tree (Qodo local r3)', async () => {
    rmSync(join(r.dir, 'README.md'));
    const res = await r.run('chart', join(r.dir, 'README.md'));
    r.git(['checkout', '--', 'README.md']);
    expect([res.code, res.err]).toEqual([0, '']);
    expect(res.out).toMatch(/^Charted README\.md at/);
  });

  it('refuses an absolute path through a dangling symlink (Qodo PR50 r2)', async () => {
    const outside = join(tempDir('commet-chart-outside-'), 'gone');
    renameSync(join(r.dir, 'src'), join(r.dir, 'src.moved'));
    symlinkSync(outside, join(r.dir, 'src'));
    try {
      const res = await r.run('chart', join(r.dir, 'src/b.ts'));
      expect([res.code, res.err]).toEqual([2, 'commet: that path is not a file in this repository\n']);
    } finally {
      rmSync(join(r.dir, 'src'));
      renameSync(join(r.dir, 'src.moved'), join(r.dir, 'src'));
    }
  });

  it('resolves paths from a subfolder and refuses folders, unknown files, outside paths and bad usage', async () => {
    const sub = await cli(['chart', 'b.ts'], join(r.dir, 'src'), { CLAUDE_CONFIG_DIR: '/nonexistent' });
    expect(sub.code).toBe(0);
    expect(sub.out).toMatch(/^Charted src\/b\.ts at/);
    const cases: [string[], number, RegExp][] = [
      [['chart', 'src'], 2, /src is a folder/],
      [['chart', 'src/nope.ts'], 2, /src\/nope\.ts isn't in the latest snapshot/],
      [['chart', '../outside.ts'], 2, /is not a file in this repository/],
      [['chart', join(tmpdir(), 'x.ts')], 2, /^commet: that path is not a file in this repository\n$/],
      [['chart'], 2, /chart needs/],
      [['chart', 'a.ts', 'b.ts'], 2, /one file at a time/],
      [['chart', 'baseline', '--force'], 2, /unknown option/],
      [['chart', '--', 'status'], 2, /status isn't in the latest snapshot/],
    ];
    for (const [args, code, err] of cases) {
      const res = await r.run(...args);
      expect([args, res.code], res.err).toEqual([args, code]);
      expect(res.err).toMatch(err);
      expect(res.err).not.toContain(r.dir);
    }
  });
});

describe('a scan between the fog read and the chart write (#58)', () => {
  it('refuses the write as stale, writes nothing, and the unseen change stays fogged', async () => {
    const r = repo();
    r.commit(SELF, () => r.write('src/a.ts', lines('alpha')));
    r.commit(TEAMMATE, () => r.write('src/a.ts', lines('alpha') + lines('mate')));
    expect((await r.run('scan')).code).toBe(0);
    // The view fetches fog and shows src/a.ts fogged at this head.
    const shown = await readFog(r.dir);
    expect(shown.files.find((f) => f.fileId === fileIdOf('src/a.ts'))!.state).toBe('fogged');
    expect((await r.run('chart', 'baseline')).code).toBe(0);
    const before = readFileSync(r.chartJson(), 'utf8');
    // A new change nobody has seen lands and is scanned before the click.
    const unseen = r.commit(TEAMMATE, () => r.write('src/a.ts', lines('alpha') + lines('mate') + lines('unseen')));
    expect((await r.run('scan')).code).toBe(0);
    for (const body of [{ kind: 'chart', fileId: fileIdOf('src/a.ts'), at: shown.head }, { kind: 'baseline', at: shown.head },
      { kind: 'baseline-undo', at: shown.head }]) {
      expect(await applyChart(r.dir, body)).toEqual({ ok: false, error: 'stale', head: unseen });
    }
    expect(readFileSync(r.chartJson(), 'utf8')).toBe(before);
    const now = await readFog(r.dir);
    expect(now.files.find((f) => f.fileId === fileIdOf('src/a.ts'))).toMatchObject({ state: 'fogged', since: unseen });
    // After refetching, the same action at the head now shown goes through.
    const ok = await applyChart(r.dir, { kind: 'chart', fileId: fileIdOf('src/a.ts'), at: now.head });
    expect(ok.ok && ok.fog.files.find((f) => f.fileId === fileIdOf('src/a.ts'))!.state).toBe('charted');
  });
});

describe('changes the snapshot has no row for', () => {
  it('a binary-era change to a file that is text at HEAD still fogs it (Qodo local r1)', async () => {
    const r = repo();
    r.commit(TEAMMATE, () => r.write('src/data.ts', 'binary\0blob\0from a teammate\n'));
    const convert = r.commit(SELF, () => r.write('src/data.ts', lines('data')));
    r.commit(SELF, () => r.write('src/data.ts', lines('data') + lines('more')));
    expect((await r.run('scan')).code).toBe(0);
    const snap = JSON.parse(readFileSync(join(r.dir, '.git/commet/snapshot.json'), 'utf8')) as { commits: { sha: string; files: unknown[] }[] };
    // The binary rows are excluded from the snapshot, so only the lineage log sees those changes.
    expect(snap.commits.find((c) => c.sha === convert)!.files).toEqual([]);
    const fog = await readFog(r.dir);
    expect(fog.files.find((f) => f.fileId === fileIdOf('src/data.ts'))).toMatchObject({ state: 'fogged', reasons: ['unknown'] });
  });

  it('a charted file someone else turns binary and back refogs from that change (Qodo PR50 r2)', async () => {
    const r = repo();
    r.commit(SELF, () => r.write('src/data.ts', lines('data')));
    expect((await r.run('scan')).code).toBe(0);
    expect((await r.run('chart', 'src/data.ts')).code).toBe(0);
    const binary = r.commit(TEAMMATE, () => r.write('src/data.ts', 'binary\0blob\0from a teammate\n'));
    r.commit(SELF, () => r.write('src/data.ts', lines('data') + lines('back')));
    // git's own numstat row for the binary change is `-\t-`, which the scan excludes rather than keeping as 0/0.
    expect(r.git(['show', '--numstat', '--format=', binary])).toBe('-\t-\tsrc/data.ts');
    expect((await r.run('scan')).code).toBe(0);
    const snap = JSON.parse(readFileSync(join(r.dir, '.git/commet/snapshot.json'), 'utf8')) as { commits: { sha: string; files: unknown[] }[] };
    expect(snap.commits.find((c) => c.sha === binary)!.files).toEqual([]);
    const fog = await readFog(r.dir);
    expect(fog.files.find((f) => f.fileId === fileIdOf('src/data.ts'))).toMatchObject({ state: 'fogged', since: binary });
  });
});

describe('chart state I/O refusals (exit 5)', () => {
  const scanned = async () => {
    const r = repo();
    r.commit(SELF, () => r.write('src/a.ts', lines('alpha')));
    expect((await r.run('scan')).code).toBe(0);
    return r;
  };

  it('no snapshot yet', async () => {
    const r = repo();
    r.commit(SELF, () => r.write('src/a.ts', lines('alpha')));
    expect(await r.run('chart', 'status')).toMatchObject({ code: 5, err: 'commet: no snapshot yet: run `commet scan` first\n' });
  });

  it('a symlinked chart.json is never read or written through', async () => {
    const r = await scanned();
    const target = join(tempDir('commet-chart-target-'), 'victim.json');
    writeFileSync(target, 'untouched');
    symlinkSync(target, r.chartJson());
    for (const args of [['chart', 'status'], ['chart', 'baseline']]) {
      const res = await r.run(...args);
      expect(res.code).toBe(5);
      expect(res.err).toContain('.git/commet/chart.json is a symlink');
    }
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  });

  it('a damaged chart.json is refused, not reset', async () => {
    const r = await scanned();
    writeFileSync(r.chartJson(), '{"schemaVersion":"chart.1","charts":[{"fileId":"src/a.ts","at":"x"}],"baselines":[]}');
    const res = await r.run('chart', 'baseline');
    expect(res.code).toBe(5);
    expect(res.err).toContain('chart.json is unreadable (bad chart entry)');
    expect(res.err).not.toContain('src/a.ts');
    expect(readFileSync(r.chartJson(), 'utf8')).toContain('src/a.ts');
  });

  it('a damaged snapshot is refused as a state error, every time', async () => {
    const r = await scanned();
    const file = join(r.dir, '.git/commet/snapshot.json');
    const snap = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const canary = join(tempDir('commet-chart-canary-'), 'written-by-git');
    const repo = snap['repo'] as Record<string, unknown>;
    const commits = snap['commits'] as Record<string, unknown>[];
    // A head that git would read as an option must never reach git (Qodo local r3).
    const asOption = { ...snap, repo: { ...repo, head: `--output=${canary}` }, commits: commits.map((c) => ({ ...c, sha: `--output=${canary}` })) };
    for (const damaged of [{ ...snap, commits: [null] }, { ...snap, files: [{ id: 1 }] }, { ...snap, dirs: 'x' }, asOption,
      { ...snap, commits: commits.map((c) => ({ ...c, sha: 'HEAD~1' })) }]) {
      writeFileSync(file, JSON.stringify(damaged));
      for (let k = 0; k < 2; k++) {
        expect(await r.run('chart', 'status')).toMatchObject({ code: 5,
          err: 'commet: state error: .git/commet/snapshot.json is damaged or from another commet version; run `commet scan`\n' });
      }
    }
    expect(existsSync(canary)).toBe(false);
    expect((await r.run('scan')).code).toBe(0);
    expect((await r.run('chart', 'status')).code).toBe(0);
  });

  it('a held lock makes a write wait, then refuse', async () => {
    const r = await scanned();
    const lock = join(r.dir, '.git/commet/chart.lock');
    writeFileSync(lock, '');
    const res = await r.run('chart', 'baseline');
    expect(res.code).toBe(5);
    expect(res.err).toContain('another commet is writing chart state');
    rmSync(lock);
    expect((await r.run('chart', 'baseline')).code).toBe(0);
  });
});

describe('relativeRepoPath', () => {
  it('joins the prefix, normalises, and converts Windows separators only on Windows (Qodo PR50 r2)', () => {
    expect(relativeRepoPath('src/', 'b.ts', '/')).toBe('src/b.ts');
    expect(relativeRepoPath('', './src/x/../b.ts/', '/')).toBe('src/b.ts');
    expect(relativeRepoPath('src/', '../../x.ts', '/')).toBeNull();
    expect(relativeRepoPath('', 'src\\b.ts', '\\')).toBe('src/b.ts');
    expect(relativeRepoPath('src/', '..\\README.md', '\\')).toBe('README.md');
    // A backslash is an ordinary filename byte elsewhere.
    expect(relativeRepoPath('', 'odd\\name.ts', '/')).toBe('odd\\name.ts');
  });
});
