// Issue #18 through the scan: `commet scan` writes layout.json, the golden on the structure fixture
// (test/fixtures/build/structure.ts), and AC3, AC8 and AC9 on real git history.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import type { LayoutV1 } from '../src/core/contract/layout.js';
import { pathHistory } from '../src/core/renames.js';
import type { SnapshotV02 } from '../src/core/snapshot/types.js';
import { binaryNames, buildLineage } from '../src/core/structure.js';
import type { LayoutNotes } from '../src/core/layout/index.js';
import type { ScanOptions } from '../src/scan/index.js';
import { exclusionOf } from '../src/scan/exclusions.js';
import { gitRunner } from '../src/scan/git.js';
import { lineageLog, mergeSides } from '../src/scan/structure.js';
import { SELF } from './fixtures/build/basic.js';
import { buildStructureRepo, scanStructure, type StructureRepo } from './fixtures/build/structure.js';
import { cli } from './fixtures/cli.js';
import { planetAt } from './fixtures/layout.js';
import { miniRepo } from './fixtures/mini.js';
import { realTempDir, tempDir } from './fixtures/tmp.js';

const GOLDEN = join(import.meta.dirname, 'golden/structure.layout.json');
const NO_LOGS = tempDir('commet-layout-claude-');
let repo: StructureRepo;
let snap: SnapshotV02;
let lay: LayoutV1;
let layoutJson: string;
let notes: LayoutNotes;

const run = (o: Partial<ScanOptions> = {}) => scanStructure(repo, o);
const planet = (path: string) => planetAt(lay, path);
const fileId = (path: string) => snap.files.find((f) => f.path === path)!.id;
const dirPath = (id: string | null | undefined) => snap.dirs.find((d) => d.id === id)?.path ?? null;

beforeAll(async () => {
  repo = await buildStructureRepo();
  ({ snapshot: snap, layout: lay, layoutJson, layoutNotes: notes } = await run());
});

describe('#18 AC6: commet scan writes layout.json', () => {
  it('writes <git-common-dir>/commet/layout.json (0600) as canonical JSON, matching scan()', async () => {
    const r = await cli(['scan', '--no-ingest'], repo.dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(r).toMatchObject({ code: 0, err: '' });
    const file = join(repo.dir, '.git/commet/layout.json');
    const text = readFileSync(file, 'utf8');
    expect(text).toBe(layoutJson);
    expect(canonicalJson(JSON.parse(text))).toBe(text);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(r.out).toContain('layout: 14 planet(s), 3 moonlet(s) around the star, 4 test-data file(s) riding with the tests');
    expect(r.out).toContain('layout written to <git-common-dir>/commet/layout.json');
  });

  it('with --out, writes the layout beside the snapshot', async () => {
    const out = join(tempDir('commet-layout-out-'), 'snap.json');
    const r = await cli(['scan', '--no-ingest', '--out', out], repo.dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(r.code).toBe(0);
    expect(readFileSync(join(dirname(out), 'snap.layout.json'), 'utf8')).toBe(layoutJson);
    expect(r.out).toContain('layout written to snap.layout.json beside it');
  });

  it('matches the layout golden (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', () => {
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, layoutJson);
    expect(layoutJson).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});

describe('#18 AC1: same repo, same layout', () => {
  it('two scans give byte-identical layouts, and the window does not change it', async () => {
    expect((await run()).layoutJson).toBe(layoutJson);
    expect((await run({ windowMonths: 1 })).layoutJson).toBe(layoutJson);
  });
});

describe('#18 AC3 and AC9 on the fixture', () => {
  it('test/ (tests only) and tests/ (tests and test data) are not planets; test data is counted on the star', () => {
    expect(lay.planets.map((p) => p.path).sort()).toEqual(['api', 'cli', 'core', 'ext', 'half', 'kit', 'lib', 'moved', 'new', 'pkg', 'svc',
      'tools', 'ui', 'web']);
    expect(lay.star.testData).toBe(4);
  });

  it('matched tests are moons of the right planet; unmatched tests and root files are moonlets', () => {
    const moons = (path: string) => planet(path).moons.map((m) => m.fileId).sort();
    expect(moons('core')).toEqual(['core/a.test.ts', 'test/half.test.ts', 'test/sub.test.ts'].map(fileId).sort());
    expect(moons('ui')).toEqual([fileId('ui/v.test.ts')]);
    expect(moons('api')).toEqual(['api/server_test.go', 'test/flow.test.ts', 'tests/test_util.py'].map(fileId).sort());
    expect(lay.star.moonlets.map((m) => [m.fileId, m.kind])).toEqual([
      [fileId('README.md'), 'root-file'],
      // Born in one commit (s21): git lists them in path order.
      [fileId('test/helpers.ts'), 'unmatched-test'],
      [fileId('test/lonely.test.ts'), 'unmatched-test'],
    ]);
  });
});

describe('#18 with #33: one lineage on real git', () => {
  it('the history ends exactly at HEAD, and every move is one of pathHistory\'s renames', async () => {
    expect(notes).toEqual({ unsure: 0, unmatched: 0 });
    const log = await lineageLog(gitRunner(repo.dir), repo.head);
    const binary = binaryNames(log, ['assets/logo.png']);
    const excluded = (p: string) => binary.has(p) || exclusionOf(p) !== null;
    const moves = buildLineage(log, excluded).events.filter((e) => e.from !== null && e.to !== null && e.from !== e.to)
      .map(({ seq, from, to }) => ({ seq, from, to }));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves).toEqual(pathHistory(log, 0, excluded).renames);
  });
});

describe('#18 AC8: partners look through a merge (real git)', () => {
  it('the three folders one PR brings in each get their real partner, in the snapshot and the layout', () => {
    const partners = Object.fromEntries(['pkg', 'svc', 'ext'].map((p) => [p, dirPath(snap.dirs.find((d) => d.path === p)!.partner)]));
    expect(partners).toEqual({ pkg: 'core', svc: 'api', ext: 'pkg' });
    expect(['pkg', 'svc', 'ext'].map((p) => dirPath(planet(p).partner))).toEqual(['core', 'api', 'pkg']);
    expect(['pkg', 'svc', 'ext'].map((p) => planet(p).bornSeq)).toEqual([27, 27, 27]);
  });
});

describe('local Qodo review (#18 r1)', () => {
  it('#2: a failed layout write leaves the last snapshot and layout as they were', async () => {
    const r = miniRepo([{ id: 'one', at: '2026-10-01T10:00:00Z', path: 'src/a.ts', lines: ['export const a = 1;'] }]);
    const state = join(r.dir, '.git/commet');
    expect((await cli(['scan', '--no-ingest'], r.dir, { CLAUDE_CONFIG_DIR: NO_LOGS })).code).toBe(0);
    const before = readFileSync(join(state, 'snapshot.json'), 'utf8');
    writeFileSync(join(r.dir, 'src/b.ts'), 'export const b = 2;\n');
    execFileSync('git', ['add', '-A'], { cwd: r.dir });
    execFileSync('git', ['commit', '-qm', 'two'], { cwd: r.dir, env: { ...process.env, GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_AUTHOR_DATE: '2026-10-02T10:00:00Z', GIT_COMMITTER_DATE: '2026-10-02T10:00:00Z' } });
    // A layout.json that can't be replaced (a folder holding a file).
    rmSync(join(state, 'layout.json'));
    mkdirSync(join(state, 'layout.json', 'x'), { recursive: true });
    const failed = await cli(['scan', '--no-ingest'], r.dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(failed.code).toBe(1);
    expect(readFileSync(join(state, 'snapshot.json'), 'utf8')).toBe(before);
    expect(readdirSync(state).filter((f) => f.includes('.next'))).toEqual([]);
  });
});

describe('local Qodo review (#18 r3)', () => {
  it('#1: a snapshot that can\'t be replaced after the layout was puts the last layout back', async () => {
    const r = miniRepo([{ id: 'one', at: '2026-10-01T10:00:00Z', path: 'src/a.ts', lines: ['export const a = 1;'] }]);
    const state = join(r.dir, '.git/commet');
    expect((await cli(['scan', '--no-ingest'], r.dir, { CLAUDE_CONFIG_DIR: NO_LOGS })).code).toBe(0);
    const before = readFileSync(join(state, 'layout.json'), 'utf8');
    writeFileSync(join(r.dir, 'src/b.ts'), 'export const b = 2;\n');
    execFileSync('git', ['add', '-A'], { cwd: r.dir });
    execFileSync('git', ['commit', '-qm', 'two'], { cwd: r.dir, env: { ...process.env, GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_AUTHOR_DATE: '2026-10-02T10:00:00Z', GIT_COMMITTER_DATE: '2026-10-02T10:00:00Z' } });
    // The layout goes in first; the snapshot then can't replace a folder holding a file.
    rmSync(join(state, 'snapshot.json'));
    mkdirSync(join(state, 'snapshot.json', 'x'), { recursive: true });
    const failed = await cli(['scan', '--no-ingest'], r.dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(failed.code).toBe(1);
    expect(readFileSync(join(state, 'layout.json'), 'utf8')).toBe(before);
    expect(readdirSync(state).filter((f) => f.includes('.next'))).toEqual([]);
  });
});

describe('Qodo PR51 r1', () => {
  const twoCommits = async () => {
    const r = miniRepo([{ id: 'one', at: '2026-10-01T10:00:00Z', path: 'src/a.ts', lines: ['export const a = 1;'] }]);
    expect((await cli(['scan', '--no-ingest'], r.dir, { CLAUDE_CONFIG_DIR: NO_LOGS })).code).toBe(0);
    writeFileSync(join(r.dir, 'src/b.ts'), 'export const b = 2;\n');
    execFileSync('git', ['add', '-A'], { cwd: r.dir });
    execFileSync('git', ['commit', '-qm', 'two'], { cwd: r.dir, env: { ...process.env, GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_AUTHOR_DATE: '2026-10-02T10:00:00Z', GIT_COMMITTER_DATE: '2026-10-02T10:00:00Z' } });
    return { dir: r.dir, state: join(r.dir, '.git/commet') };
  };

  it('8e924d0b: another scan\'s staged files are neither reused nor removed', async () => {
    const { dir, state } = await twoCommits();
    writeFileSync(join(state, 'layout.json.next'), 'another scan\'s layout');
    const r = await cli(['scan', '--no-ingest'], dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(r.code).toBe(0);
    expect(readFileSync(join(state, 'layout.json.next'), 'utf8')).toBe('another scan\'s layout');
    expect((JSON.parse(readFileSync(join(state, 'layout.json'), 'utf8')) as LayoutV1).source.head)
      .toBe((JSON.parse(readFileSync(join(state, 'snapshot.json'), 'utf8')) as SnapshotV02).repo.head);
  });

  it('d0357f0b: a rollback never deletes a target that existed but could not be read', async () => {
    const { dir, state } = await twoCommits();
    chmodSync(join(state, 'layout.json'), 0);
    rmSync(join(state, 'snapshot.json'));
    mkdirSync(join(state, 'snapshot.json', 'x'), { recursive: true });
    try {
      expect((await cli(['scan', '--no-ingest'], dir, { CLAUDE_CONFIG_DIR: NO_LOGS })).code).toBe(1);
      expect(existsSync(join(state, 'layout.json'))).toBe(true);
    } finally {
      chmodSync(join(state, 'layout.json'), 0o600);
    }
  });
});

/**
 * A repo whose merged branch adds `<prefix><odd>/x.ts` alone, then touches `<prefix>core/` in another
 * commit, where `odd` holds U+0001, a newline and a tab. Read whole, the folder's own commit doesn't
 * touch core, so it has no partner; misread, it would fall back to the merge, which touches core.
 */
function oddMergeRepo(prefix: string): { dir: string; head: string; odd: string } {
  const odd = 'a\u0001b\nc\td';
  const dir = realTempDir('commet-layout-rule7-');
  let n = 0;
  const git = (...args: string[]) => {
    const at = `2026-10-${String(++n).padStart(2, '0')}T10:00:00Z`;
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: SELF.name,
      GIT_AUTHOR_EMAIL: SELF.email, GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
  };
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, prefix, 'core'), { recursive: true });
  writeFileSync(join(dir, prefix, 'core/a.ts'), 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'root');
  git('checkout', '-qb', 'pr');
  mkdirSync(join(dir, prefix, odd));
  writeFileSync(join(dir, prefix, odd, 'x.ts'), 'export const x = 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'odd folder');
  writeFileSync(join(dir, prefix, 'core/a.ts'), 'export const a = 2;\n');
  git('commit', '-qam', 'core');
  git('checkout', '-q', 'main');
  git('merge', '-q', '--no-ff', '-m', 'merge pr', 'pr');
  return { dir, head: git('rev-parse', 'HEAD').trim(), odd };
}

describe('#18 AC8 under Rule 7', () => {
  it('a merged branch\'s folder named with U+0001, a newline and a tab is read whole', async () => {
    const { dir, head, odd } = oddMergeRepo('');
    const log = await lineageLog(gitRunner(dir), head);
    const sides = (await mergeSides(gitRunner(dir), log, buildLineage(log, () => false), () => false)).tops;
    expect(sides.get(1)).toEqual([new Set([odd]), new Set(['core'])]);
    const s = await scanStructure({ dir, sha: {}, head });
    expect(s.snapshot.dirs.find((x) => x.path === odd)!.partner).toBeNull();
    expect(planetAt(s.layout, odd).partner).toBeNull();
  });
});

describe('#18 edge cases through the scan', () => {
  it('a repo whose HEAD holds no files has a star and nothing else', async () => {
    const dir = realTempDir('commet-layout-empty-');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_COMMITTER_NAME: SELF.name,
        GIT_COMMITTER_EMAIL: SELF.email, GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' } });
    git('init', '-q', '-b', 'main');
    git('config', 'commit.gpgsign', 'false');
    git('commit', '-q', '--allow-empty', '-m', 'empty');
    const r = await cli(['scan', '--no-ingest'], dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
    expect(r.code).toBe(0);
    const empty = JSON.parse(readFileSync(join(dir, '.git/commet/layout.json'), 'utf8')) as LayoutV1;
    expect(empty).toMatchObject({ planets: [], star: { moonlets: [], moonletOverflow: 0, testData: 0 } });
    expect(existsSync(join(dir, '.git/commet/snapshot.json'))).toBe(true);
  });
});

describe('#71 content roots through the scan', () => {
  it('the snapshot is the same for any roots; only layout.json changes, and records them', async () => {
    const plain = await run();
    const zoned = await run({ roots: async () => ['pkg'] });
    expect(zoned.json).toBe(plain.json);
    expect(plain.layoutJson).toBe(layoutJson);
    expect(zoned.layout.source.roots).toEqual(['pkg']);
    expect(zoned.layout.planets.some((p) => p.path === 'pkg')).toBe(false);
  });

  // Qodo PR #93 r1 905eeef7: dirsAtHead (structure.ts:328-330) counts the root `src` as a top-level
  // planet, so an outer folder's snapshot partner can be `src`. The snapshot is roots-independent
  // by design (#18's mapping, as the test above pins), and the layout picks its own partners per
  // zone (layout/index.ts:178), so what's drawn never names a root.
  it("an outer folder's snapshot partner may be a root; its layout partner never is (Qodo PR #93 905eeef7)", async () => {
    const day = (d: number) => `2026-10-0${d}T10:00:00Z`;
    const r = miniRepo([{ id: 'c1', at: day(1), path: 'src/core/a.ts', lines: ['export const a = 1;'] }]);
    try {
      // tools is born in a commit that also touches src, and so is every tools commit after it.
      const git = (args: string[]) => execFileSync('git', args, { cwd: r.dir, encoding: 'utf8' }).trim();
      mkdirSync(join(r.dir, 'tools'));
      for (const v of [2, 3, 4]) {
        writeFileSync(join(r.dir, 'src/core/a.ts'), `export const a = ${v};\n`);
        writeFileSync(join(r.dir, 'tools/x.ts'), `export const x = ${v};\n`);
        git(['add', '-A']);
        execFileSync('git', ['commit', '-q', '-m', `test: pair ${v}`], { cwd: r.dir, env: { ...process.env, GIT_AUTHOR_DATE: day(v), GIT_COMMITTER_DATE: day(v) } });
      }
      const head = git(['rev-parse', 'HEAD']);
      const plain = await scanStructure({ dir: r.dir, sha: {}, head });
      const zoned = await scanStructure({ dir: r.dir, sha: {}, head }, { roots: async () => ['src'] });
      const dirOf = (s: SnapshotV02, p: string) => s.dirs.find((d) => d.path === p)!;
      expect(zoned.json).toBe(plain.json); // roots never change the snapshot
      expect(dirOf(zoned.snapshot, 'tools').partner).toBe(dirOf(zoned.snapshot, 'src').id); // names the root
      expect(planetAt(plain.layout, 'tools').partner).toBe(dirOf(plain.snapshot, 'src').id); // #18: src is a planet
      expect(zoned.layout.planets.map((p) => [p.path, p.zone])).toEqual([['src/core', 'content'], ['tools', 'outer']]);
      expect(planetAt(zoned.layout, 'tools').partner).toBeNull(); // no older outer planet
    } finally {
      rmSync(r.dir, { recursive: true, force: true });
    }
  });

  it('a content planet born in a merge looks through to the branch, its odd name (U+0001, newline, tab) read whole', async () => {
    const { dir, head, odd } = oddMergeRepo('src/');
    try {
      const log = await lineageLog(gitRunner(dir), head);
      const sides = await mergeSides(gitRunner(dir), log, buildLineage(log, () => false, ['src']), () => false);
      expect(sides.children.get(1)).toEqual([new Set([`src/${odd}`]), new Set(['src/core'])]);
      const s = await scanStructure({ dir, sha: {}, head }, { roots: async () => ['src'] });
      // Misread, it would fall back to the merge, which touches src/core.
      expect(planetAt(s.layout, `src/${odd}`)).toMatchObject({ zone: 'content', partner: null });
      expect(planetAt(s.layout, 'src/core').zone).toBe('content');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
