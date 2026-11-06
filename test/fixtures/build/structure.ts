// Scripted fixture for #16 (folders, birth partner, test moons, branches, debt markers). Fixed
// identities and dates, so SHAs, dir ids and the golden are reproducible.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SELF } from './basic.js';

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

export interface StructureRepo { dir: string; sha: Record<string, string> }

export function buildStructureRepo(): StructureRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-structure-')));
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    git(['config', k!, v!]);
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
  const commit = (id: string, paths: string[], at?: string) => {
    for (const p of paths) touch(p);
    git(['add', '-A']);
    const date = at ?? `2026-06-${String(++day).padStart(2, '0')}T10:00:00Z`;
    git(['commit', '-q', '--allow-empty', '-m', `test: ${id}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email });
    sha[id] = git(['rev-parse', 'HEAD']);
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
  commit('s0', ['README.md', 'core/b.ts', 'ui/v.ts', 'core/sub/deep.ts', 'core/sub/x/y.ts'], '2026-01-05T10:00:00Z');

  // api/: 3 of its first 5 commits also touch core/ → exactly 60% → partner core.
  commit('s1', ['api/util.py', 'core/b.ts']);
  commit('s2', ['api/server.go', 'core/a.ts']);
  commit('s3', ['api/handler.ts', 'core/b.ts']);
  commit('s4', ['api/util.py']);
  commit('s5', ['api/server.go']);
  // web/: 2 of 5 touch core/ → 40% → null. web/v.ts is a second name match for ui/v.test.ts.
  commit('s6', ['web/w.ts', 'core/a.ts']);
  commit('s7', ['web/w.ts', 'core/b.ts']);
  commit('s8', ['web/v.ts']);
  commit('s9', ['web/v.ts']);
  commit('s10', ['web/w.ts']);
  // cli/: only 2 commits, both touching ui/ → 2/2 → partner ui (2/5 would be null).
  commit('s11', ['cli/c.ts', 'ui/v.ts']);
  commit('s12', ['cli/c.ts', 'ui/v.ts']);
  // lib/: always touches api/ (born s1) and web/ (born s6, lower id) → equal share, older bornSeq → api.
  commit('s13', ['lib/l.ts', 'web/w.ts', 'api/handler.ts']);
  commit('s14', ['lib/l.ts', 'web/x.ts', 'api/util.py']);
  commit('s15', ['lib/l.ts', 'web/w.ts', 'api/handler.ts']);
  // kit/: always touches core/ and ui/ (both born s0) → equal share and bornSeq → lower id (ui/).
  commit('s16', ['kit/k.ts', 'core/a.ts', 'ui/v.ts']);
  commit('s17', ['kit/k.ts', 'core/b.ts', 'ui/v.ts']);
  // Tests by name: same-dir, closest of two (ui/v.ts over web/v.ts), Python and Go patterns.
  commit('s18', ['core/a.test.ts', 'ui/v.test.ts', 'tests/test_util.py', 'api/server_test.go']);
  // Co-change fallback: test/flow.test.ts has no flow.* source but changes with api/handler.ts twice.
  commit('s19', ['test/flow.test.ts', 'api/handler.ts']);
  commit('s20', ['test/flow.test.ts', 'api/handler.ts']);
  // No match: one shared commit (with tools/t.ts below) is under the co-change threshold.
  commit('s21', ['test/lonely.test.ts', 'test/helpers.ts']);
  // tools/: only ever co-touches the test-only test/, which isn't a planet → null.
  commit('s22', ['tools/t.ts', 'test/lonely.test.ts']);
  commit('s23', ['tools/t.ts', 'test/helpers.ts']);
  // old/ → new/ with 2 of its 4 files (the rest deleted): ≥ 50% → new/ keeps old/'s id.
  mkdirSync(join(dir, 'new'));
  git(['mv', 'old/o1.ts', 'new/o1.ts']);
  git(['mv', 'old/o2.ts', 'new/o2.ts']);
  git(['rm', '-q', 'old/o3.ts', 'old/o4.ts']);
  commit('s24', []);
  // half/ → moved/ with 1 of 3 files: < 50% → moved/ is a new folder; half/ keeps its id.
  mkdirSync(join(dir, 'moved'));
  git(['mv', 'half/h1.ts', 'moved/h1.ts']);
  commit('s25', []);
  // #16 AC9: sub.test.ts names only the folder core/sub/; half.test.ts names a file (core/half.ts)
  // and a folder (half/), and the file wins. AC10: fixture and golden data are not tests.
  // AC13: markers in a test, in test data and in docs count 0; only source code counts.
  touch('test/sub.test.ts', ['// TODO: a marker in a test file', '// FIXME HACK XXX also in the test']);
  touch('tests/fixtures/data.test.ts', ['// TODO: a marker in test data']);
  touch('core/README.md', ['# Core', 'TODO: a marker in docs. FIXME too.']);
  commit('s26', ['test/sub.test.ts', 'test/half.test.ts', 'core/half.ts', 'tests/fixtures/data.test.ts', 'tests/golden/out.json',
    'web/__snapshots__/w.test.ts.snap', 'api/__fixtures__/f.test.ts', 'core/README.md']);
  const head = sha['s26']!;

  // Branches. merged: an ancestor of HEAD (absent). old-fork: forks at s0, outside a 1-month window.
  git(['branch', 'merged', sha['s20']!]);
  git(['checkout', '-q', '-b', 'old-fork', sha['s0']!]);
  commit('b-old', ['ui/v.ts'], '2026-01-06T10:00:00Z');
  // AC11: a remote copy at the same tip and no upstream config still folds in by name.
  git(['update-ref', 'refs/remotes/origin/old-fork', sha['b-old']!]);
  git(['checkout', '-q', '-b', 'feature/ahead', head]);
  commit('b-ahead1', ['core/a.ts', 'README.md'], '2026-06-26T10:00:00Z');
  // brandnew/ isn't a folder at HEAD, so it adds no dirId.
  commit('b-ahead2', ['ui/v.ts', 'brandnew/z.ts'], '2026-06-27T10:00:00Z');
  // Remote-tracking branches written straight into refs (no network), plus a symbolic origin/HEAD.
  // AC11: local feature/remote (tracking origin) is one commit behind its remote copy, so the entry
  // uses the remote tip. origin/only-remote has no local branch.
  git(['checkout', '-q', '--detach', head]);
  commit('b-remote1', ['ui/v.ts'], '2026-06-28T10:00:00Z');
  git(['branch', 'feature/remote']);
  git(['config', 'branch.feature/remote.remote', 'origin']);
  git(['config', 'branch.feature/remote.merge', 'refs/heads/feature/remote']);
  commit('b-remote2', ['api/util.py', 'node_modules/pkg/index.js'], '2026-06-29T10:00:00Z');
  git(['update-ref', 'refs/remotes/origin/feature/remote', sha['b-remote2']!]);
  git(['checkout', '-q', '--detach', head]);
  commit('b-only', ['kit/k.ts'], '2026-06-30T10:00:00Z');
  git(['update-ref', 'refs/remotes/origin/only-remote', sha['b-only']!]);
  git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feature/remote']);
  git(['checkout', '-q', 'main']);
  return { dir, sha };
}
