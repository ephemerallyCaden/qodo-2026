// Issue #18 through the scan: `commet scan` writes layout.json, the golden on the structure fixture
// (test/fixtures/build/structure.ts), and AC3, AC8 and AC9 on real git history.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { lineageLog } from '../src/scan/structure.js';
import { SELF } from './fixtures/build/basic.js';
import { buildStructureRepo, scanStructure, type StructureRepo } from './fixtures/build/structure.js';
import { cli } from './fixtures/cli.js';
import { planetAt } from './fixtures/layout.js';
import { miniRepo } from './fixtures/mini.js';

const GOLDEN = join(import.meta.dirname, 'golden/structure.layout.json');
const NO_LOGS = mkdtempSync(join(tmpdir(), 'commet-layout-claude-'));
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
  repo = buildStructureRepo();
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
    const out = join(mkdtempSync(join(tmpdir(), 'commet-layout-out-')), 'snap.json');
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
    expect(readdirSync(state).filter((f) => f.endsWith('.next'))).toEqual([]);
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
    expect(readdirSync(state).filter((f) => f.endsWith('.next'))).toEqual([]);
  });
});

describe('#18 edge cases through the scan', () => {
  it('a repo whose HEAD holds no files has a star and nothing else', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-layout-empty-')));
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
