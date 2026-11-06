// Issue #16: folders, birth partner, test moons, branches and debt markers. One describe per
// acceptance criterion; the fixture is test/fixtures/build/structure.ts.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/core/hash.js';
import type { Dir, FileEntry, SnapshotV02 } from '../src/core/snapshot/types.js';
import { buildLineage, debtCounted, dirsAtHead, matchTests } from '../src/core/structure.js';
import { formatSummary } from '../src/core/summary.js';
import { scan, type ScanOptions } from '../src/scan/index.js';
import { lineageLog } from '../src/scan/structure.js';
import { cli } from './fixtures/cli.js';
import { buildStructureRepo, DEBT_CANARY, type StructureRepo } from './fixtures/build/structure.js';
import { miniRepo } from './fixtures/mini.js';

const GOLDEN = join(import.meta.dirname, 'golden/structure.snapshot.json');
const NO_LOGS = mkdtempSync(join(tmpdir(), 'commet-structure-claude-'));
let repo: StructureRepo;
let snap: SnapshotV02;
let json: string;

const run = (o: Partial<ScanOptions> = {}) => scan({ repoDir: repo.dir, windowMonths: 24, ingest: false,
  claudeProjectsDir: join(NO_LOGS, 'projects'), keyFor: () => new Uint8Array(32).fill(7), ...o });
const dir = (path: string): Dir => {
  const d = snap.dirs.find((x) => x.path === path);
  if (!d) throw new Error(`no dir ${path}`);
  return d;
};
const file = (path: string): FileEntry => {
  const f = snap.files.find((x) => x.path === path);
  if (!f) throw new Error(`no file ${path}`);
  return f;
};
const birthId = (path: string, ordinal = 0) => `d_${sha256Hex(`${path}#${ordinal}`).slice(0, 12)}`;

/** Runs `fn` with a `git` shim first on PATH; `script` runs before the real git (`$@` = git args). */
async function withGitShim<T>(script: string, fn: () => Promise<T>): Promise<T> {
  const shim = mkdtempSync(join(tmpdir(), 'commet-git-shim-'));
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(shim, 'git'), `#!/bin/sh\n${script}\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const path = process.env['PATH'];
  process.env['PATH'] = `${shim}:${path ?? ''}`;
  try {
    return await fn();
  } finally {
    process.env['PATH'] = path;
  }
}

beforeAll(async () => {
  repo = buildStructureRepo();
  ({ snapshot: snap, json } = await run());
});

describe('#16 AC1: dirs[] for every folder at HEAD, with stable ids', () => {
  it('lists every folder holding a non-excluded file at HEAD, and nothing else', () => {
    expect(snap.dirs.map((d) => d.path)).toEqual(['api', 'api/__fixtures__', 'cli', 'core', 'core/sub', 'core/sub/x', 'half', 'kit',
      'lib', 'moved', 'new', 'test', 'tests', 'tests/fixtures', 'tests/golden', 'tools', 'ui', 'web', 'web/__snapshots__']);
  });

  it('records parent, depth, bornSeq and bornDate from the folder\'s first commit', () => {
    expect(dir('api')).toMatchObject({ id: birthId('api'), parent: null, depth: 1, bornSeq: 1, bornDate: '2026-06-01T10:00:00Z' });
    expect(dir('core/sub')).toMatchObject({ parent: dir('core').id, depth: 2, bornSeq: 0, bornDate: '2026-01-05T10:00:00Z' });
    expect(dir('core/sub/x')).toMatchObject({ parent: dir('core/sub').id, depth: 3 });
    expect(snap.commits.find((c) => c.sha === repo.sha['s1'])!.seq).toBe(1);
  });

  it('a folder renamed with ≥ 50% of its files keeps its id and birth; a smaller move is a new folder', () => {
    expect(dir('new')).toMatchObject({ id: birthId('old'), bornSeq: 0, bornDate: '2026-01-05T10:00:00Z' });
    expect(dir('half').id).toBe(birthId('half'));
    expect(dir('moved')).toMatchObject({ id: birthId('moved'), bornSeq: 25 });
  });

  it('ids and births do not depend on the scan window', async () => {
    const narrow = (await run({ windowMonths: 1 })).snapshot;
    expect(narrow.commits.length).toBeLessThan(snap.commits.length);
    expect(narrow.dirs).toEqual(snap.dirs);
    expect(narrow.commits.map((c) => c.seq)).toEqual(snap.commits.slice(-narrow.commits.length).map((c) => c.seq));
  });

  it('a repo with only root files has no folders', async () => {
    const flat = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# Flat', 'Only root files here.'] }]);
    const { snapshot } = await run({ repoDir: flat.dir });
    expect(snapshot.dirs).toEqual([]);
    expect(snapshot.branches).toEqual([]);
    expect(snapshot.files.map((f) => [f.path, f.isTest, f.testOf])).toEqual([['README.md', false, null]]);
    expect(formatSummary(snapshot, null)).toContain('0 folders (0 top-level');
  });
});

describe('#16 AC2: partner per the clear-link rule', () => {
  const partnerOf = (path: string) => {
    const p = dir(path).partner;
    return p === null ? null : snap.dirs.find((d) => d.id === p)!.path;
  };

  it('exactly 60% of the first 5 commits sets a partner; 40% does not', () => {
    expect(partnerOf('api')).toBe('core');
    expect(partnerOf('web')).toBeNull();
  });

  it('a folder with fewer than 5 commits uses the commits that exist', () => {
    expect(partnerOf('cli')).toBe('ui');
  });

  it('ties break by older bornSeq, then by id', () => {
    expect(dir('web').id < dir('api').id).toBe(true); // so the bornSeq rule, not the id, picks api
    expect(partnerOf('lib')).toBe('api');
    expect(dir('ui').id < dir('core').id).toBe(true);
    expect(partnerOf('kit')).toBe('ui');
  });

  it('folders born together have no older partner, and a test-only folder is never a partner', () => {
    for (const p of ['core', 'ui', 'half']) expect(partnerOf(p), p).toBeNull();
    expect(partnerOf('tools')).toBeNull();
  });

  it('only top-level folders carry a partner', () => {
    expect('partner' in dir('core/sub')).toBe(false);
    expect(snap.dirs.filter((d) => d.depth === 1).every((d) => 'partner' in d)).toBe(true);
  });
});

describe('#16 AC3: debt markers from HEAD blobs', () => {
  it('counts marker words per file; other words and excluded files never count', () => {
    expect(file('core/a.ts').debt).toEqual({ todo: 1, fixme: 1, hack: 2, xxx: 1 });
    expect(file('core/b.ts').debt).toEqual({ todo: 0, fixme: 0, hack: 0, xxx: 0 });
    expect(snap.files.some((f) => f.path.startsWith('node_modules/') || f.path.startsWith('core/dist/') || f.path.endsWith('.png'))).toBe(false);
    expect(snap.unreadable.files).toBe(0);
  });

  it('a dirty working tree does not change the snapshot', async () => {
    const a = join(repo.dir, 'core/a.ts');
    appendFileSync(a, '// TODO FIXME HACK XXX dirty edit\n');
    writeFileSync(join(repo.dir, 'core/untracked.ts'), '// TODO untracked\n');
    try {
      const dirty = await run();
      expect(dirty.snapshot.files.find((f) => f.path === 'core/a.ts')!.debt).toEqual({ todo: 1, fixme: 1, hack: 2, xxx: 1 });
      expect(dirty.json).toBe(json);
    } finally {
      execFileSync('git', ['checkout', '--', 'core/a.ts'], { cwd: repo.dir });
      rmSync(join(repo.dir, 'core/untracked.ts'));
    }
  });

  it('marker comment text never reaches the snapshot, stdout or stderr (privacy canary)', async () => {
    expect(readFileSync(join(repo.dir, 'core/a.ts'), 'utf8')).toContain(DEBT_CANARY);
    const out = join(mkdtempSync(join(tmpdir(), 'commet-structure-out-')), 'snap.json');
    const r = await cli(['scan', '--no-ingest', '--out', out], repo.dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(r.code).toBe(0);
    expect(r.out).toContain('debt markers: todo 1 · fixme 1 · hack 2 · xxx 1');
    for (const [name, text] of Object.entries({ snapshot: readFileSync(out, 'utf8'), stdout: r.out, stderr: r.err })) {
      expect(text.includes(DEBT_CANARY), name).toBe(false);
    }
  });
});

describe('#16 AC13: debt markers count in source code only', () => {
  it('a TODO in a test file, in test data or in a .md file counts 0; one in a .ts source counts', () => {
    const zero = { todo: 0, fixme: 0, hack: 0, xxx: 0 };
    for (const p of ['test/sub.test.ts', 'tests/fixtures/data.test.ts', 'core/README.md']) {
      expect(readFileSync(join(repo.dir, p), 'utf8'), p).toContain('TODO');
      expect(file(p).debt, p).toEqual(zero);
    }
    expect(file('core/a.ts').debt).toEqual({ todo: 1, fixme: 1, hack: 2, xxx: 1 });
  });

  it('docs (*.md, *.mdx, *.rst, *.txt, docs/**), tests and test data are not source (pure)', () => {
    const counted = (p: string) => debtCounted(p);
    expect(['README.md', 'a/b.mdx', 'notes.rst', 'x/y.txt', 'docs/api.ts', 'test/x.test.ts', 'test/helpers.ts', 'test/golden/g.json',
      'src/__snapshots__/s.snap'].filter(counted)).toEqual([]);
    expect(['src/a.ts', 'lib/docs.ts', 'src/docs/x.ts', 'Makefile'].filter(counted)).toEqual(['src/a.ts', 'lib/docs.ts', 'src/docs/x.ts', 'Makefile']);
  });
});

describe('#16 AC4: test files and what they test', () => {
  /** [isTest, the path testOf names (a folder path ends with '/')]. */
  const testOf = (path: string) => {
    const f = file(path);
    const target = f.testOf === null ? null : (snap.files.find((x) => x.id === f.testOf)?.path
      ?? `${snap.dirs.find((x) => x.id === f.testOf)!.path}/`);
    return [f.isTest, target];
  };

  it('matches by name (x.test.ts, test_x.py, x_test.go), picking the closest of two sources', () => {
    expect(testOf('core/a.test.ts')).toEqual([true, 'core/a.ts']);
    expect(testOf('tests/test_util.py')).toEqual([true, 'api/util.py']);
    expect(testOf('api/server_test.go')).toEqual([true, 'api/server.go']);
    expect(testOf('ui/v.test.ts')).toEqual([true, 'ui/v.ts']);
  });

  it('falls back to the strongest co-change partner, above the threshold', () => {
    expect(testOf('test/flow.test.ts')).toEqual([true, 'api/handler.ts']);
  });

  it('leaves a test without a match unmatched, and source files are not tests', () => {
    expect(testOf('test/lonely.test.ts')).toEqual([true, null]);
    expect(testOf('test/helpers.ts')).toEqual([true, null]);
    expect(testOf('core/a.ts')).toEqual([false, null]);
  });

  it('name matching prefers the closest path, then codepoint order', () => {
    const { targets: m } = matchTests(['a/x.ts', 'b/c/x.ts', 'b/d/x.ts', 'b/c/x.test.ts', 'z/x.test.ts', 'y/x.ts'], []);
    expect(m.get('b/c/x.test.ts')).toEqual({ path: 'b/c/x.ts', dir: false });
    expect(m.get('z/x.test.ts')).toEqual({ path: 'a/x.ts', dir: false });
  });
});

describe('#16 AC9: a test named after a folder tests that folder', () => {
  const target = (path: string) => {
    const f = file(path);
    return snap.files.find((x) => x.id === f.testOf)?.path ?? snap.dirs.find((x) => x.id === f.testOf)?.path ?? null;
  };

  it('matches a folder by name when no file has the name', () => {
    expect(file('test/sub.test.ts').testOf).toBe(dir('core/sub').id);
  });

  it('prefers a file-name match over a folder-name match', () => {
    expect(target('test/half.test.ts')).toBe('core/half.ts');
  });

  it('a folder match comes before co-change, and the closest folder wins (pure)', () => {
    const commits = [['t/scan.test.ts', 'src/other.ts'], ['t/scan.test.ts', 'src/other.ts']];
    const { targets: m } = matchTests(['src/scan/index.ts', 'lib/deep/scan/x.ts', 'src/other.ts', 't/scan.test.ts'], commits);
    expect(m.get('t/scan.test.ts')).toEqual({ path: 'src/scan', dir: true });
  });
});

describe('#16 AC10: fixture and golden data are not tests', () => {
  it('files under fixtures/, golden/, __fixtures__/ and __snapshots__/ are ordinary files', () => {
    for (const p of ['tests/fixtures/data.test.ts', 'tests/golden/out.json', 'web/__snapshots__/w.test.ts.snap', 'api/__fixtures__/f.test.ts']) {
      expect([p, file(p).isTest, file(p).testOf], p).toEqual([p, false, null]);
    }
  });

  it('test data is never what a test tests, by file name, folder name or co-change (pure)', () => {
    const paths = ['src/core/palette.ts', 'test/golden/palette.v1.json', 'test/palette.test.ts', 'test/fixtures/mini.ts',
      'test/fixtures/scan/x.ts', 'test/mini.test.ts', 'test/scan.test.ts', 'src/scan/index.ts'];
    const { targets: m } = matchTests(paths, [['test/mini.test.ts', 'test/fixtures/mini.ts'], ['test/mini.test.ts', 'test/fixtures/mini.ts']]);
    expect(m.get('test/palette.test.ts')).toEqual({ path: 'src/core/palette.ts', dir: false });
    expect(m.get('test/scan.test.ts')).toEqual({ path: 'src/scan', dir: true });
    expect(m.get('test/mini.test.ts')).toBeNull();
  });

  it('fixtures under a test folder are not tests (pure)', () => {
    const { targets: m } = matchTests(['test/fixtures/a.ts', 'test/x.test.ts', 'src/a.ts'], []);
    expect([...m.keys()]).toEqual(['test/x.test.ts']);
  });
});

describe('#16 AC11: a local branch and its remote copy are one entry', () => {
  it('folds origin/<name> into <name> (upstream or same name), using the most advanced tip', () => {
    expect(snap.branches.map((b) => [b.name, b.remote, b.alsoRemote, b.aheadCount])).toEqual([
      ['feature/ahead', false, false, 2],
      ['feature/remote', false, true, 2],
      ['old-fork', false, true, 1],
      ['origin/only-remote', true, false, 1],
    ]);
    const remote = snap.branches.find((b) => b.name === 'feature/remote')!;
    expect(remote.lastCommitDate).toBe('2026-06-29T10:00:00Z');
    expect(remote.dirIds).toEqual([dir('api').id, dir('ui').id].sort());
  });
});

describe('#16 AC5: unmerged branches', () => {
  it('lists unmerged local and remote-tracking branches, not HEAD\'s, a merged one or origin/HEAD', () => {
    expect(snap.branches.map((b) => [b.name, b.remote, b.aheadCount, b.lastCommitDate])).toEqual([
      ['feature/ahead', false, 2, '2026-06-27T10:00:00Z'],
      ['feature/remote', false, 2, '2026-06-29T10:00:00Z'],
      ['old-fork', false, 1, '2026-01-06T10:00:00Z'],
      ['origin/only-remote', true, 1, '2026-06-30T10:00:00Z'],
    ]);
  });

  it('records the top-level folders present at HEAD that the branch\'s own commits touch', () => {
    const dirs = (name: string) => snap.branches.find((b) => b.name === name)!.dirIds;
    expect(dirs('feature/ahead')).toEqual([dir('core').id, dir('ui').id].sort());
    expect(dirs('old-fork')).toEqual([dir('ui').id]);
    expect(dirs('origin/only-remote')).toEqual([dir('kit').id]);
  });

  it('keeps a branch whose merge-base is outside the scan window', async () => {
    const narrow = (await run({ windowMonths: 1 })).snapshot;
    expect(narrow.window.since > '2026-01-06').toBe(true);
    expect(narrow.branches.find((b) => b.name === 'old-fork')).toMatchObject({ aheadCount: 1, dirIds: [dir('ui').id] });
    expect(narrow.branches).toEqual(snap.branches);
  });

  it('makes no network call', async () => {
    const log = join(mkdtempSync(join(tmpdir(), 'commet-git-log-')), 'argv');
    await withGitShim(`echo "$@" >> '${log}'`, () => run());
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain('for-each-ref');
    expect(calls).not.toMatch(/ (fetch|ls-remote|pull|remote|push) /);
  });
});

describe('#16 AC6: same input, same output', () => {
  it('two scans are byte-identical, and the schema is versioned', async () => {
    expect((await run()).json).toBe(json);
    expect(snap.schemaVersion).toBe('0.2');
  });

  it('matches the structure golden (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', () => {
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});

describe('#16 AC7: what the scan cannot read is counted, never dropped', () => {
  it('a failed debt read gives debt null (not zero) and a summary line', async () => {
    const r = await withGitShim('for a in "$@"; do [ "$a" = grep ] && exit 128; done', () => run());
    // Source files are unknown; tests, test data and docs count 0 by rule (AC13), read or not.
    const source = r.snapshot.files.filter((f) => debtCounted(f.path));
    expect(source.length).toBeGreaterThan(10);
    expect(source.every((f) => f.debt === null)).toBe(true);
    expect(r.snapshot.files.filter((f) => !debtCounted(f.path)).every((f) => f.debt?.todo === 0)).toBe(true);
    expect(r.snapshot.unreadable.files).toBe(source.length);
    const summary = formatSummary(r.snapshot, null);
    expect(summary).toContain(`debt markers unreadable for ${source.length} file(s); their debt is unknown, not zero`);
    // The totals line must not show reassuring zeros it never read.
    expect(summary).toContain('debt markers: unknown');
    expect(summary).not.toContain('debt markers: todo 0');
  });

  it('a branch whose commits cannot be read is counted in the summary', async () => {
    const r = await withGitShim('for a in "$@"; do case "$a" in *..*) exit 128;; esac; done', () => run());
    expect(r.snapshot.branches).toEqual([]);
    expect(r.snapshot.unreadable.branches).toBe(4);
    expect(formatSummary(r.snapshot, null)).toContain('4 branch(es) could not be read and are left out of branches[]');
  });

  it('a HEAD folder with no lineage record falls back to HEAD and is counted', () => {
    const lineage = buildLineage([{ sha: 'a', dateMs: 0, changes: [{ status: 'A', path: 'x/f.ts' }] }], () => false);
    const { dirs, unreadable } = dirsAtHead(lineage, ['x/f.ts', 'y/g.ts']);
    expect(dirs.map((d) => [d.path, d.bornSeq])).toEqual([['x', 0], ['y', 0]]);
    expect(unreadable).toBe(1);
  });
});

describe('#16 lineage rules (pure)', () => {
  const A = (path: string) => ({ status: 'A' as const, path });
  const R = (from: string, path: string) => ({ status: 'R' as const, from, path });
  const D = (path: string) => ({ status: 'D' as const, path });

  it('a split that leaves as many files behind as it moves keeps the id where it was', () => {
    const lineage = buildLineage([
      { sha: 'a', dateMs: 0, changes: [A('p/1'), A('p/2'), A('p/3'), A('p/4')] },
      { sha: 'b', dateMs: 1000, changes: [R('p/1', 'q/1'), R('p/2', 'q/2')] },
    ], () => false);
    expect(lineage.dirs.get('p')!.id).toBe(birthId('p'));
    expect(lineage.dirs.get('q')).toMatchObject({ id: birthId('q'), bornSeq: 1 });
  });

  it('a folder deleted and recreated at the same path gets a new id (birth ordinal)', () => {
    const lineage = buildLineage([
      { sha: 'a', dateMs: 0, changes: [A('p/1')] },
      { sha: 'b', dateMs: 1000, changes: [D('p/1')] },
      { sha: 'c', dateMs: 2000, changes: [A('p/2')] },
    ], () => false);
    expect(lineage.dirs.get('p')).toMatchObject({ id: birthId('p', 1), bornSeq: 2 });
  });

  it('excluded paths never create or keep a folder', () => {
    const lineage = buildLineage([{ sha: 'a', dateMs: 0, changes: [A('node_modules/x/i.js'), A('src/a.ts')] }],
      (p) => p.startsWith('node_modules/'));
    expect([...lineage.dirs.keys()]).toEqual(['src']);
  });
});

describe('scan from a subdirectory', () => {
  it('gives the same snapshot as from the repo root (ls-tree lists the whole tree)', async () => {
    const sub = await run({ repoDir: join(repo.dir, 'core/sub') });
    expect(sub.snapshot.files.find((f) => f.path === 'core/a.ts')?.debt).toEqual({ todo: 1, fixme: 1, hack: 2, xxx: 1 });
    expect(sub.json).toBe(json);
  });
});

/** A throwaway repo whose commits run in order at fixed dates. */
function scratch() {
  const d = mkdtempSync(join(tmpdir(), 'commet-scratch-'));
  let n = 0;
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Ada Self', GIT_AUTHOR_EMAIL: 'self@example.com',
    GIT_COMMITTER_NAME: 'Ada Self', GIT_COMMITTER_EMAIL: 'self@example.com' };
  const git = (...args: string[]) => {
    const at = `2026-07-${String(++n).padStart(2, '0')}T10:00:00Z`;
    return execFileSync('git', args, { cwd: d, encoding: 'utf8', env: { ...env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } }).trim();
  };
  const write = (path: string, body: string | Buffer) => {
    execFileSync('mkdir', ['-p', join(d, path, '..')]);
    writeFileSync(join(d, path), body);
  };
  git('init', '-q', '-b', 'main');
  return { dir: d, git, write, scan: async () => (await run({ repoDir: d })).snapshot };
}

describe('local Qodo review (#16 r1)', () => {
  it('#1: a binary left behind does not stop a folder\'s only source file from carrying its id', async () => {
    const r = scratch();
    r.write('art/draw.ts', Array.from({ length: 6 }, (_, i) => `export const draw${i} = ${i};`).join('\n') + '\n');
    r.write('art/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2]));
    r.git('add', '-A');
    r.git('commit', '-qm', 'art');
    execFileSync('mkdir', [join(r.dir, 'paint')]);
    r.git('mv', 'art/draw.ts', 'paint/draw.ts');
    r.git('commit', '-qm', 'move the source');
    const s = await r.scan();
    expect(s.dirs.map((x) => [x.path, x.id, x.bornSeq])).toEqual([['paint', birthId('art'), 0]]);
  });

  it('#2: a change made only in a merge commit counts toward the branch\'s folders', async () => {
    const r = scratch();
    for (const p of ['api/a.ts', 'lib/l.ts', 'ui/u.ts']) r.write(p, `export const v = ${JSON.stringify(p)};\n`);
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    r.git('checkout', '-qb', 'side');
    r.write('api/a.ts', 'export const v = 2;\n');
    r.git('commit', '-qam', 'side');
    r.git('checkout', '-qb', 'feature', 'main');
    r.write('ui/u.ts', 'export const v = 3;\n');
    r.git('commit', '-qam', 'feature');
    r.git('merge', '-q', '--no-commit', 'side');
    r.write('lib/l.ts', 'export const v = 4; // changed only while merging\n');
    r.git('commit', '-qam', 'merge side');
    r.git('checkout', '-q', 'main');
    const s = await r.scan();
    const ids = new Map(s.dirs.map((x) => [x.id, x.path]));
    const feature = s.branches.find((b) => b.name === 'feature')!;
    expect([feature.aheadCount, feature.dirIds.map((i) => ids.get(i)).sort()]).toEqual([3, ['api', 'lib', 'ui']]);
  });

  it('#3: a top-level folder whose name starts with a newline still gets its branch ring', async () => {
    const r = scratch();
    r.write('\nnl/x.ts', 'export const x = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    r.git('checkout', '-qb', 'touch-nl');
    r.write('\nnl/x.ts', 'export const x = 2;\n');
    r.git('commit', '-qam', 'touch');
    r.git('checkout', '-q', 'main');
    const s = await r.scan();
    expect(s.dirs.map((x) => x.path)).toEqual(['\nnl']);
    expect(s.branches.map((b) => [b.name, b.dirIds])).toEqual([['touch-nl', [s.dirs[0]!.id]]]);
  });
});

describe('local Qodo review (#16 r2)', () => {
  it('#1: files new at the old path in the same commit do not keep the id from the moved files', () => {
    const lineage = buildLineage([
      { sha: 'a', dateMs: 0, changes: [{ status: 'A', path: 'p/1' }, { status: 'A', path: 'p/2' }] },
      { sha: 'b', dateMs: 1000, changes: [{ status: 'R', from: 'p/1', path: 'q/1' }, { status: 'R', from: 'p/2', path: 'q/2' },
        { status: 'A', path: 'p/3' }, { status: 'A', path: 'p/4' }, { status: 'A', path: 'p/5' }] },
    ], () => false);
    expect(lineage.dirs.get('q')).toMatchObject({ id: birthId('p'), bornSeq: 0 });
    expect(lineage.dirs.get('p')).toMatchObject({ id: birthId('p', 1), bornSeq: 1 });
  });

  it('#2: a U+0001 in a path does not split a commit in the lineage log', async () => {
    const r = scratch();
    r.write('d/a\u0001b.ts', 'export const a = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'one');
    r.git('commit', '-q', '--allow-empty', '-m', 'empty');
    r.write('e/x.ts', 'export const x = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'three');
    const s = await r.scan();
    expect(s.commits.map((c) => c.seq)).toEqual([0, 1, 2]);
    expect(s.dirs.map((x) => [x.path, x.bornSeq])).toEqual([['d', 0], ['e', 2]]);
  });
});

describe('local Qodo review (#16 r3)', () => {
  it('#1: a merge listed once per parent is still one commit, with its first-parent diff only', async () => {
    const [m, p] = ['m'.repeat(40), 'p'.repeat(40)];
    const stream = ['', p, '100', '\nA', 'a.ts', '', m, '200', '\nA', 's/s.ts', '', m, '200', '\nA', 'a.ts', 'A', 'm/m.ts', ''].join('\0');
    const commits = await lineageLog(async () => stream, 'HEAD');
    expect(commits.map((c) => [c.sha, c.changes.map((x) => x.path)])).toEqual([[p, ['a.ts']], [m, ['s/s.ts']]]);
  });

  it('#1: a merge on the first-parent chain takes one seq (real git)', async () => {
    const r = scratch();
    r.write('a.ts', 'export const a = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    r.git('checkout', '-qb', 'side');
    r.write('s/s.ts', 'export const s = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'side');
    r.git('checkout', '-q', 'main');
    r.write('m/m.ts', 'export const m = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'main');
    r.git('merge', '-q', '--no-edit', 'side');
    r.write('z/z.ts', 'export const z = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'after');
    const s = await r.scan();
    expect(s.commits.map((c) => c.seq)).toEqual([0, 1, 2, 3]);
    expect(s.dirs.map((x) => [x.path, x.bornSeq])).toEqual([['m', 1], ['s', 2], ['z', 3]]);
  });
});

describe('local Qodo review (#16 r4)', () => {
  it('#1: a binary moving with its folder neither counts at its old name nor blocks the move', async () => {
    const r = scratch();
    r.write('art/draw.ts', Array.from({ length: 6 }, (_, i) => `export const draw${i} = ${i};`).join('\n') + '\n');
    r.write('art/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2, 3, 4, 5, 6]));
    r.write('art/extra.ts', Array.from({ length: 6 }, (_, i) => `export const extra${i} = ${i};`).join('\n') + '\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'art');
    execFileSync('mkdir', [join(r.dir, 'paint')]);
    r.git('mv', 'art/draw.ts', 'paint/draw.ts');
    r.git('mv', 'art/logo.png', 'paint/logo.png');
    r.git('rm', '-q', 'art/extra.ts');
    r.git('commit', '-qm', 'move the source and the logo, drop the rest');
    const s = await r.scan();
    // Text files only: 1 of 2 moved and none stayed, so paint/ inherits art/'s id. Counting the
    // binary under its old name (3 files, 1 moved) blocked that.
    expect(s.dirs.map((x) => [x.path, x.id])).toEqual([['paint', birthId('art')]]);
  });

  it('#2: a U+0001 in a branch\'s path neither inflates aheadCount nor loses its folder', async () => {
    const r = scratch();
    r.write('d/a.ts', 'export const a = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    r.git('checkout', '-qb', 'odd');
    r.write('d/x\u0001y.ts', 'export const odd = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'odd path');
    r.git('checkout', '-q', 'main');
    const s = await r.scan();
    expect(s.branches.map((b) => [b.name, b.aheadCount, b.dirIds])).toEqual([['odd', 1, [s.dirs[0]!.id]]]);
  });

  it('#3: branch names are kept as git has them, so tmp/feature and tmp/bugfix stay distinct', async () => {
    const r = scratch();
    r.write('d/a.ts', 'export const a = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    for (const b of ['tmp/feature', 'tmp/bugfix']) {
      r.git('checkout', '-qb', b, 'main');
      r.write('d/a.ts', `export const a = ${JSON.stringify(b)};\n`);
      r.git('commit', '-qam', b);
    }
    r.git('checkout', '-q', 'main');
    expect((await r.scan()).branches.map((b) => b.name)).toEqual(['tmp/bugfix', 'tmp/feature']);
  });
});

describe('local Qodo review (#16 r5)', () => {
  it('#2: a local branch named like a remote-tracking one is not dropped', async () => {
    const r = scratch();
    r.write('d/a.ts', 'export const a = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    r.git('checkout', '-qb', 'origin/foo');
    r.write('d/a.ts', 'export const a = 2;\n');
    r.git('commit', '-qam', 'local');
    r.git('checkout', '-q', '--detach', 'main');
    r.write('d/a.ts', 'export const a = 3;\n');
    r.git('commit', '-qam', 'remote');
    r.git('update-ref', 'refs/remotes/origin/foo', 'HEAD');
    r.git('checkout', '-q', 'main');
    const s = await r.scan();
    expect(s.branches.map((b) => [b.name, b.remote, b.alsoRemote])).toEqual([['origin/foo', false, false], ['origin/foo', true, false]]);
    expect(s.unreadable.branches).toBe(0);
  });
});

describe('local Qodo review (#16 r6)', () => {
  it('#1: moving a folder\'s files into its own subfolder keeps the parent\'s id', () => {
    const lineage = buildLineage([
      { sha: 'a', dateMs: 0, changes: [{ status: 'A', path: 'p/1' }, { status: 'A', path: 'p/2' }] },
      { sha: 'b', dateMs: 1000, changes: [{ status: 'R', from: 'p/1', path: 'p/q/1' }, { status: 'R', from: 'p/2', path: 'p/q/2' }] },
    ], () => false);
    expect(lineage.dirs.get('p')).toMatchObject({ id: birthId('p'), bornSeq: 0 });
    expect(lineage.dirs.get('p/q')).toMatchObject({ id: birthId('p/q'), bornSeq: 1 });
  });
});

describe('PR #20 Qodo review r1', () => {
  it('#4: the lineage log is streamed, not buffered, and tokens split across chunks parse the same', async () => {
    const [m, p] = ['m'.repeat(40), 'p'.repeat(40)];
    const raw = ['', p, '100', '\nA', 'a.ts', 'R100', 'a.ts', 'd/é.ts', '', m, '200', '', m, '200', '\nA', 'm/m.ts', ''].join('\0');
    const buffered = Object.assign(async (): Promise<string> => {
      throw new Error('stdout maxBuffer length exceeded');
    }, { stream: async (_args: string[], onData: (chunk: string) => void) => {
      for (const ch of raw) onData(ch);
    } });
    const commits = await lineageLog(buffered, 'HEAD');
    expect(commits.map((c) => [c.sha, c.dateMs, c.changes])).toEqual([
      [p, 100_000, [{ status: 'A', path: 'a.ts' }, { status: 'R', from: 'a.ts', path: 'd/é.ts' }]],
      [m, 200_000, []],
    ]);
  });

  it('#5: bulk commits left out of test co-change are counted, and the summary says so', () => {
    const filler = Array.from({ length: 200 }, (_, i) => `gen/f${i}.ts`);
    const bulk = ['t/flow.test.ts', 'src/flow-impl.ts', ...filler];
    const paths = ['t/flow.test.ts', 'src/flow-impl.ts', 't/a.test.ts', 'src/a.ts', ...filler];
    // Twice in bulk commits only (so no link), once in a bulk commit with only a name-matched test (not counted).
    const { targets, bulkSkipped } = matchTests(paths, [bulk, bulk, ['t/a.test.ts', ...filler]]);
    expect(targets.get('t/flow.test.ts')).toBeNull();
    expect(targets.get('t/a.test.ts')).toEqual({ path: 'src/a.ts', dir: false });
    expect(bulkSkipped).toBe(2);
    const s2: SnapshotV02 = { ...snap, unreadable: { ...snap.unreadable, bulkCommits: 2 } };
    expect(formatSummary(s2, null)).toContain('2 commit(s) over 200 files were left out of test co-change matching; tests in them may show no source');
    expect(snap.unreadable.bulkCommits).toBe(0);
  });

  it('#2: a branch that only changes a binary under a folder gives that folder no ring', async () => {
    const r = scratch();
    r.write('d/a.ts', 'export const a = 1;\n');
    r.write('e/b.ts', 'export const b = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'root');
    r.git('checkout', '-qb', 'art');
    r.write('d/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2]));
    r.git('add', '-A');
    r.git('commit', '-qm', 'binary only');
    r.write('e/b.ts', 'export const b = 2;\n');
    r.git('commit', '-qam', 'text');
    r.git('checkout', '-q', 'main');
    const s = await r.scan();
    expect(s.branches.map((b) => [b.name, b.aheadCount, b.dirIds])).toEqual([['art', 2, [s.dirs.find((x) => x.path === 'e')!.id]]]);
  });

  it('#1: a file moved into a subfolder still stays in its folder when another moves to a sibling', () => {
    const lineage = buildLineage([
      { sha: 'a', dateMs: 0, changes: [{ status: 'A', path: 'p/1' }, { status: 'A', path: 'p/2' }] },
      { sha: 'b', dateMs: 1000, changes: [{ status: 'R', from: 'p/1', path: 'p/q/1' }, { status: 'R', from: 'p/2', path: 's/2' }] },
    ], () => false);
    expect(lineage.dirs.get('p')).toMatchObject({ id: birthId('p'), bornSeq: 0 });
    expect(lineage.dirs.get('s')).toMatchObject({ id: birthId('s'), bornSeq: 1 });
  });
});

describe('PR #20 Qodo review r2', () => {
  it('#1: an empty HEAD commit is a lineage commit (real git)', async () => {
    const r = scratch();
    r.write('d/a.ts', 'export const a = 1;\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'one');
    r.git('commit', '-q', '--allow-empty', '-m', 'empty head');
    const s = await r.scan();
    expect(s.commits.map((c) => c.seq)).toEqual([0, 1]);
    expect(s.dirs.map((x) => [x.path, x.bornSeq])).toEqual([['d', 0]]);
  });

  it('#1: a final header without its closing NUL is kept, streamed or buffered; a cut-off path record is refused', async () => {
    const [a, b] = ['a'.repeat(40), 'b'.repeat(40)];
    const raw = ['', a, '100', '\nA', 'd/a.ts', '', b, '200'].join('\0');
    const streamed = Object.assign(async (): Promise<string> => raw, { stream: async (_: string[], onData: (c: string) => void) => onData(raw) });
    for (const git of [streamed, async () => raw]) {
      expect((await lineageLog(git, 'HEAD')).map((c) => [c.sha, c.dateMs])).toEqual([[a, 100_000], [b, 200_000]]);
    }
    await expect(lineageLog(async () => ['', a, '100', '\nA', 'd/a.t'].join('\0'), 'HEAD')).rejects.toThrow(/incomplete/);
  });
});
