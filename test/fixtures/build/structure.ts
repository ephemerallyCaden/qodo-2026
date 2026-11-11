// Scripted fixture for #16 (folders, birth partner, test moons, branches, debt markers). Fixed
// identities and dates, so SHAs, dir ids and the golden are reproducible.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { scan, type ScanOptions } from '../../../src/scan/index.js';
import { gitIn, SELF } from './basic.js';
import { realTempDir, tempDir } from '../tmp.js';

/** Marker comment text: only the counts may reach any output (privacy canary). */
export const DEBT_CANARY = 'CANARY_DEBT_COMMENT_TEXT';
/** core/a.ts at HEAD: TODO 1, FIXME 1, HACK 2, XXX 1; `todo`, `TODOS` and `XXXL` don't count. */
export const DEBT_LINES = [
  `// TODO: ${DEBT_CANARY} one`,
  `/* FIXME ${DEBT_CANARY} two */`,
  `// HACK HACK: ${DEBT_CANARY} three`,
  `// XXX ${DEBT_CANARY} four`,
  '// todo lowercase is not a marker',
  'export const TODOS = 1; // a longer word is not a marker',
  "export const size = 'XXXL';",
];

export interface StructureRepo { dir: string; sha: Record<string, string>; head: string }

const NO_LOGS = tempDir('commet-structure-claude-');

/** Scans the fixture without agent logs (every commit unknown), with a fixed key. */
export const scanStructure = (repo: StructureRepo, o: Partial<ScanOptions> = {}) => scan({ repoDir: repo.dir, windowMonths: 24,
  ingest: false, claudeProjectsDir: join(NO_LOGS, 'projects'), keyFor: () => new Uint8Array(32).fill(7), ...o });

export async function buildStructureRepo(): Promise<StructureRepo> {
  const dir = realTempDir('commet-structure-');
  const git = gitIn(dir);
  await git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    await git(['config', k!, v!]);
  }
  const versions = new Map<string, number>();
  const base = new Map<string, string[]>();
  /** Writes `path` again with one more version line, so every touch is a real change. */
  const touch = (path: string, lines?: string[]) => {
    if (lines) base.set(path, lines);
    const v = (versions.get(path) ?? 0) + 1;
    versions.set(path, v);
    const body = base.get(path) ?? [`export const origin = ${JSON.stringify(path)};`, `export const purpose = 'fixture file ${path}';`];
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), [...body, `export const version${v} = ${v};`].join('\n') + '\n');
  };
  const sha: Record<string, string> = {};
  let day = 0;
  const commit = async (id: string, paths: string[], at?: string) => {
    for (const p of paths) touch(p);
    await git(['add', '-A']);
    const date = at ?? `2026-06-${String(++day).padStart(2, '0')}T10:00:00Z`;
    await git(['commit', '-q', '--allow-empty', '-m', `test: ${id}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email });
    sha[id] = await git(['rev-parse', 'HEAD']);
  };

  // s0 (root, months before the rest): every folder born here is born together, so none has an
  // older partner. node_modules/, core/dist/ and the binary-only assets/ are excluded.
  touch('core/a.ts', ['export function a(): number {', '  return 1;', '}', ...DEBT_LINES]);
  touch('node_modules/pkg/index.js', [`// TODO ${DEBT_CANARY} excluded`]);
  touch('core/dist/out.js', [`// FIXME ${DEBT_CANARY} excluded`]);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, ...Buffer.from(' TODO FIXME ')]));
  for (let i = 1; i <= 4; i++) touch(`old/o${i}.ts`, Array.from({ length: 6 }, (_, j) => `export const old${i}line${j} = '${'o'.repeat(i)}${j}';`));
  for (let i = 1; i <= 3; i++) touch(`half/h${i}.ts`, Array.from({ length: 6 }, (_, j) => `export const half${i}line${j} = '${'h'.repeat(i)}${j}';`));
  await commit('s0', ['README.md', 'core/b.ts', 'ui/v.ts', 'core/sub/deep.ts', 'core/sub/x/y.ts'], '2026-01-05T10:00:00Z');

  // api/: 3 of its first 5 commits also touch core/ → exactly 60% → partner core.
  await commit('s1', ['api/util.py', 'core/b.ts']);
  await commit('s2', ['api/server.go', 'core/a.ts']);
  await commit('s3', ['api/handler.ts', 'core/b.ts']);
  await commit('s4', ['api/util.py']);
  await commit('s5', ['api/server.go']);
  // web/: 2 of 5 touch core/ → 40% → null. web/v.ts is a second name match for ui/v.test.ts.
  await commit('s6', ['web/w.ts', 'core/a.ts']);
  await commit('s7', ['web/w.ts', 'core/b.ts']);
  await commit('s8', ['web/v.ts']);
  await commit('s9', ['web/v.ts']);
  await commit('s10', ['web/w.ts']);
  // cli/: only 2 commits, both touching ui/ → 2/2 → partner ui (2/5 would be null).
  await commit('s11', ['cli/c.ts', 'ui/v.ts']);
  await commit('s12', ['cli/c.ts', 'ui/v.ts']);
  // lib/: always touches api/ (born s1) and web/ (born s6, lower id) → equal share, older bornSeq → api.
  await commit('s13', ['lib/l.ts', 'web/w.ts', 'api/handler.ts']);
  await commit('s14', ['lib/l.ts', 'web/x.ts', 'api/util.py']);
  await commit('s15', ['lib/l.ts', 'web/w.ts', 'api/handler.ts']);
  // kit/: always touches core/ and ui/ (both born s0) → equal share and bornSeq → lower id (ui/).
  await commit('s16', ['kit/k.ts', 'core/a.ts', 'ui/v.ts']);
  await commit('s17', ['kit/k.ts', 'core/b.ts', 'ui/v.ts']);
  // Tests by name: same-dir, closest of two (ui/v.ts over web/v.ts), Python and Go patterns.
  await commit('s18', ['core/a.test.ts', 'ui/v.test.ts', 'tests/test_util.py', 'api/server_test.go']);
  // Co-change fallback: test/flow.test.ts has no flow.* source but changes with api/handler.ts twice.
  await commit('s19', ['test/flow.test.ts', 'api/handler.ts']);
  await commit('s20', ['test/flow.test.ts', 'api/handler.ts']);
  // No match: one shared commit (with tools/t.ts below) is under the co-change threshold.
  await commit('s21', ['test/lonely.test.ts', 'test/helpers.ts']);
  // tools/: only ever co-touches the test-only test/, which isn't a planet → null.
  await commit('s22', ['tools/t.ts', 'test/lonely.test.ts']);
  await commit('s23', ['tools/t.ts', 'test/helpers.ts']);
  // old/ → new/ with 2 of its 4 files (the rest deleted): ≥ 50% → new/ keeps old/'s id.
  mkdirSync(join(dir, 'new'));
  await git(['mv', 'old/o1.ts', 'new/o1.ts']);
  await git(['mv', 'old/o2.ts', 'new/o2.ts']);
  await git(['rm', '-q', 'old/o3.ts', 'old/o4.ts']);
  await commit('s24', []);
  // half/ → moved/ with 1 of 3 files: < 50% → moved/ is a new folder; half/ keeps its id.
  mkdirSync(join(dir, 'moved'));
  await git(['mv', 'half/h1.ts', 'moved/h1.ts']);
  await commit('s25', []);
  // #16 AC9: sub.test.ts names only the folder core/sub/; half.test.ts names a file (core/half.ts)
  // and a folder (half/), and the file wins. AC10: fixture and golden data are not tests.
  // AC13: markers in a test, in test data and in docs count 0; only source code counts.
  touch('test/sub.test.ts', ['// TODO: a marker in a test file', '// FIXME HACK XXX also in the test']);
  touch('tests/fixtures/data.test.ts', ['// TODO: a marker in test data']);
  touch('core/README.md', ['# Core', 'TODO: a marker in docs. FIXME too.']);
  await commit('s26', ['test/sub.test.ts', 'test/half.test.ts', 'core/half.ts', 'tests/fixtures/data.test.ts', 'tests/golden/out.json',
    'web/__snapshots__/w.test.ts.snap', 'api/__fixtures__/f.test.ts', 'core/README.md']);
  // #18 AC8: one PR brings in pkg/, svc/ and ext/, all born in its merge (s27). The merge touches
  // core/ and api/ too, so without looking through it all three would share core/ as partner. The
  // branch's own commits give each its real one: pkg → core (2 of 3), svc → api, ext → pkg (older on
  // the branch).
  await git(['checkout', '-q', '-b', 'pr']);
  await commit('p1', ['pkg/p.ts', 'core/b.ts']);
  await commit('p2', ['pkg/p.ts', 'core/a.ts']);
  await commit('p3', ['svc/s.ts', 'api/handler.ts']);
  await commit('p4', ['ext/e.ts', 'pkg/p.ts']);
  await git(['checkout', '-q', 'main']);
  const mergeAt = '2026-06-30T12:00:00Z';
  await git(['merge', '-q', '--no-ff', '-m', 'test: s27 merge pr', 'pr'], { GIT_AUTHOR_DATE: mergeAt, GIT_COMMITTER_DATE: mergeAt,
    GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email });
  await git(['branch', '-q', '-d', 'pr']);
  sha['s27'] = await git(['rev-parse', 'HEAD']);
  const head = sha['s27']!;

  // Branches. merged: an ancestor of HEAD (absent). old-fork: forks at s0, outside a 1-month window.
  await git(['branch', 'merged', sha['s20']!]);
  await git(['checkout', '-q', '-b', 'old-fork', sha['s0']!]);
  await commit('b-old', ['ui/v.ts'], '2026-01-06T10:00:00Z');
  // AC11: a remote copy at the same tip and no upstream config still folds in by name.
  await git(['update-ref', 'refs/remotes/origin/old-fork', sha['b-old']!]);
  await git(['checkout', '-q', '-b', 'feature/ahead', head]);
  await commit('b-ahead1', ['core/a.ts', 'README.md'], '2026-06-26T10:00:00Z');
  // brandnew/ isn't a folder at HEAD, so it adds no dirId.
  await commit('b-ahead2', ['ui/v.ts', 'brandnew/z.ts'], '2026-06-27T10:00:00Z');
  // Remote-tracking branches written straight into refs (no network), plus a symbolic origin/HEAD.
  // AC11: local feature/remote (tracking origin) is one commit behind its remote copy, so the entry
  // uses the remote tip. origin/only-remote has no local branch.
  await git(['checkout', '-q', '--detach', head]);
  await commit('b-remote1', ['ui/v.ts'], '2026-06-28T10:00:00Z');
  await git(['branch', 'feature/remote']);
  await git(['config', 'branch.feature/remote.remote', 'origin']);
  await git(['config', 'branch.feature/remote.merge', 'refs/heads/feature/remote']);
  await commit('b-remote2', ['api/util.py', 'node_modules/pkg/index.js'], '2026-06-29T10:00:00Z');
  await git(['update-ref', 'refs/remotes/origin/feature/remote', sha['b-remote2']!]);
  await git(['checkout', '-q', '--detach', head]);
  await commit('b-only', ['kit/k.ts'], '2026-06-30T10:00:00Z');
  await git(['update-ref', 'refs/remotes/origin/only-remote', sha['b-only']!]);
  await git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feature/remote']);
  await git(['checkout', '-q', 'main']);
  return { dir, sha, head };
}
