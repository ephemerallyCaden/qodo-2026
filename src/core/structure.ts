// Folder lineage, birth partners and test matching (#16, design §5.1.3). Pure: git output is
// parsed in src/scan/structure.ts and passed in.
import { byCodepoint } from './canonical-json.js';
import { sha256Hex } from './hash.js';
import type { DebtCounts, Dir, DirId } from './snapshot/types.js';
import { isoUtc } from './time.js';

/** One `--name-status` row. `from` is the old path of a rename (R) or copy (C). */
export interface Change { status: 'A' | 'C' | 'D' | 'M' | 'R' | 'T'; path: string; from?: string }
/** A first-parent commit, oldest first; its index in the list is its seq. */
export interface LineageCommit { sha: string; dateMs: number; changes: Change[] }

interface DirBirth { id: DirId; bornSeq: number; bornMs: number }

export interface Lineage {
  /** First-parent ordinal from the root (0) for every commit on HEAD's first-parent chain. */
  seqOf: Map<string, number>;
  /** Folders alive at the last commit, by path. */
  dirs: Map<string, DirBirth>;
  /** Per seq: ids of every folder the commit touched (all ancestors of every changed path). */
  touches: Set<DirId>[];
  /** Per seq: the non-excluded paths the commit added or changed (new paths of renames). */
  paths: string[][];
  headMs: number;
}

/** Clear link: at least 3 of every 5 (60%) of a folder's first commits also touched the partner. */
const PARTNER_WINDOW = 5;
const linked = (hits: number, of: number) => hits * 5 >= of * 3;
/** Co-change fallback for tests: at least this many shared commits (design §5.1.7: bulk excluded). */
const TEST_COCHANGE_MIN = 2;
const BULK_FILES = 200;

/** Debt marker kinds, in summary order; each counts its upper-case word (`todo` → TODO). */
export const DEBT_KEYS = ['todo', 'fixme', 'hack', 'xxx'] as const;
export const zeroDebt = (): DebtCounts => ({ todo: 0, fixme: 0, hack: 0, xxx: 0 });

const dirId = (path: string, ordinal: number): DirId => `d_${sha256Hex(`${path}#${ordinal}`).slice(0, 12)}`;

/** `a/b/c.ts` → `['a', 'a/b']`. */
function ancestors(path: string): string[] {
  const out: string[] = [];
  for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) out.push(path.slice(0, i));
  return out;
}

/**
 * Names that hold a binary that is still binary at HEAD: `headBinary`, plus every earlier name a
 * rename or copy carried into one. The name-status log has no binary flag, so a binary deleted
 * before HEAD under a name never seen at HEAD isn't known and still counts toward its folder.
 */
export function binaryNames(commits: LineageCommit[], headBinary: Iterable<string>): Set<string> {
  const names = new Set(headBinary);
  for (let i = commits.length - 1; i >= 0; i--) {
    for (const ch of commits[i]!.changes) if (ch.from !== undefined && names.has(ch.path)) names.add(ch.from);
  }
  return names;
}

/**
 * Replays first-parent history to give every folder an id fixed at its birth. A folder whose
 * files mostly move to a new folder in one commit hands that folder its id: ≥ 50% of its files
 * must move there, and fewer of its files must stay behind than moved (on an even split the id
 * stays put). Files new to the old path in that commit make a new folder there.
 * Excluded paths never create, keep or move a folder.
 */
export function buildLineage(commits: LineageCommit[], excluded: (path: string) => boolean): Lineage {
  const live = new Set<string>();
  const count = new Map<string, number>();
  const dirs = new Map<string, DirBirth>();
  const births = new Map<string, number>();
  const lineage: Lineage = { seqOf: new Map(), dirs, touches: [], paths: [], headMs: commits.at(-1)?.dateMs ?? 0 };

  commits.forEach((c, seq) => {
    lineage.seqOf.set(c.sha, seq);
    const removed: string[] = [];
    const added: string[] = [];
    const changed: string[] = [];
    const moves: [string, string][] = [];
    for (const ch of c.changes) {
      const gone = ch.status === 'D' ? ch.path : ch.status === 'R' ? ch.from : undefined;
      if (gone !== undefined && !excluded(gone) && live.has(gone)) removed.push(gone);
      if (ch.status === 'D' || excluded(ch.path)) continue;
      if (live.has(ch.path) && ch.status !== 'R' && ch.status !== 'C') changed.push(ch.path);
      else added.push(ch.path);
      if (ch.status === 'R' && ch.from !== undefined && !excluded(ch.from)) moves.push([ch.from, ch.path]);
    }

    // Where each folder's files went: tally[source][destination] = files moved.
    const tally = new Map<string, Map<string, number>>();
    for (const [from, to] of moves) {
      for (const d of ancestors(from)) {
        const rel = from.slice(d.length);
        if (!to.endsWith(rel) || to.length === rel.length) continue;
        const dest = to.slice(0, to.length - rel.length);
        if (dest === d) continue;
        const t = tally.get(d) ?? new Map<string, number>();
        tally.set(d, t.set(dest, (t.get(dest) ?? 0) + 1));
      }
    }
    const before = new Map([...tally.keys()].map((d) => [d, count.get(d) ?? 0]));
    // Files each folder lost this commit (moved or deleted); files new to it don't count as staying.
    const lost = new Map<string, number>();
    for (const p of removed) for (const d of ancestors(p)) lost.set(d, (lost.get(d) ?? 0) + 1);
    const touched = new Set<DirId>();
    for (const p of [...removed, ...changed]) for (const d of ancestors(p)) touched.add(dirs.get(d)!.id);

    const bump = (p: string, by: number) => {
      for (const d of ancestors(p)) count.set(d, (count.get(d) ?? 0) + by);
    };
    for (const p of removed) {
      live.delete(p);
      bump(p, -1);
    }
    for (const p of added) {
      if (!live.has(p)) {
        live.add(p);
        bump(p, 1);
      }
    }
    // Only folders that lost a file can have died.
    const dead = new Map<string, DirBirth>();
    for (const d of new Set(removed.flatMap(ancestors))) {
      if ((count.get(d) ?? 0) > 0) continue;
      dead.set(d, dirs.get(d)!);
      dirs.delete(d);
    }
    const born = (d: string) => {
      const ordinal = births.get(d) ?? 0;
      births.set(d, ordinal + 1);
      dirs.set(d, { id: dirId(d, ordinal), bornSeq: seq, bornMs: c.dateMs });
    };

    // Hand ids to destination folders, biggest move first, then by source path.
    const offers = [...tally].map(([src, t]) => {
      const [dest, moved] = [...t].sort((a, b) => b[1] - a[1] || byCodepoint(a[0], b[0]))[0]!;
      return { src, dest, moved };
    }).sort((a, b) => b.moved - a.moved || byCodepoint(a.src, b.src));
    const claimed = new Set<string>();
    for (const { src, dest, moved } of offers) {
      const stayed = before.get(src)! - (lost.get(src) ?? 0);
      const birth = dirs.get(src) ?? dead.get(src);
      // dirs and dead hold every folder that existed before this commit (nothing is born yet).
      if (!birth || claimed.has(dest) || dirs.has(dest) || dead.has(dest) || moved * 2 < before.get(src)! || stayed >= moved) continue;
      claimed.add(dest);
      dirs.set(dest, birth);
      // Whatever is still at the old path (files left behind or new ones) is a new folder.
      if ((count.get(src) ?? 0) > 0) born(src);
    }
    for (const p of added) for (const d of ancestors(p)) if (!dirs.has(d)) born(d);
    for (const p of [...added, ...changed]) for (const d of ancestors(p)) touched.add(dirs.get(d)!.id);
    lineage.touches.push(touched);
    lineage.paths.push([...added, ...changed]);
  });
  return lineage;
}

/**
 * dirs[] for the folders holding `headPaths` (non-excluded files at HEAD), sorted by path. A
 * folder the lineage doesn't know (it shouldn't happen) is born at HEAD and counted in
 * `unreadable`, never dropped. A top-level folder holding only tests isn't a planet, so it's
 * never a partner.
 */
export function dirsAtHead(lineage: Lineage, headPaths: string[]): { dirs: Dir[]; unreadable: number } {
  const paths = new Set(headPaths.flatMap(ancestors));
  const headSeq = Math.max(0, lineage.touches.length - 1);
  let unreadable = 0;
  const birthOf = (p: string): DirBirth => {
    const b = lineage.dirs.get(p);
    if (b) return b;
    unreadable++;
    return { id: dirId(p, -1), bornSeq: headSeq, bornMs: lineage.headMs };
  };
  const births = new Map([...paths].sort(byCodepoint).map((p) => [p, birthOf(p)]));
  const sourceTops = new Set(headPaths.filter((p) => p.includes('/') && !isTestPath(p)).map((p) => p.slice(0, p.indexOf('/'))));
  const tops = [...births].filter(([p]) => !p.includes('/')).map(([p, b]) => ({ ...b, planet: sourceTops.has(p) }));
  const partner = partners(tops, lineage.touches);
  const dirs = [...births].map(([path, b]): Dir => {
    const slash = path.lastIndexOf('/');
    const parent = slash < 0 ? null : births.get(path.slice(0, slash))!.id;
    const d: Dir = { id: b.id, path, parent, depth: path.split('/').length, bornSeq: b.bornSeq, bornDate: isoUtc(b.bornMs) };
    if (parent === null) d.partner = partner.get(b.id) ?? null;
    return d;
  });
  return { dirs, unreadable };
}

/**
 * The clear-link rule (#16): of a top-level folder's first 5 commits (from its birth; fewer if
 * that's all there are), ≥ 60% also touched one older top-level planet. Ties: higher share, then
 * older bornSeq, then id.
 */
function partners(tops: (DirBirth & { planet: boolean })[], touches: Set<DirId>[]): Map<DirId, DirId> {
  const out = new Map<DirId, DirId>();
  for (const t of tops) {
    const first: Set<DirId>[] = [];
    for (let seq = t.bornSeq; seq < touches.length && first.length < PARTNER_WINDOW; seq++) {
      if (touches[seq]!.has(t.id)) first.push(touches[seq]!);
    }
    const best = tops.filter((x) => x.planet && x.bornSeq < t.bornSeq)
      .map((x) => ({ x, hits: first.filter((s) => s.has(x.id)).length }))
      .filter(({ hits }) => hits > 0 && linked(hits, first.length))
      .sort((a, b) => b.hits - a.hits || a.x.bornSeq - b.x.bornSeq || byCodepoint(a.x.id, b.x.id))[0];
    if (best) out.set(t.id, best.x.id);
  }
  return out;
}

const TEST_NAME = [/^(.+)\.(?:test|spec)\.[^.]+$/, /^test_(.+)\.py$/, /^(.+)_test\.go$/];
const TEST_DIRS = new Set(['test', 'tests', '__tests__']);
/** Test data, not tests (#16 AC10): `__fixtures__/`, `__snapshots__/`, and fixtures/ or golden/ in a test folder. */
const DATA_DIRS = new Set(['__fixtures__', '__snapshots__']);
const TEST_DATA_DIRS = new Set(['fixtures', 'golden']);
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** The `x` a test file is named after (`x.test.ts`, `x.spec.ts`, `test_x.py`, `x_test.go`), or null. */
function testStem(path: string): string | null {
  for (const re of TEST_NAME) {
    const m = re.exec(base(path));
    if (m) return m[1]!;
  }
  return null;
}

/** Inside test data: fixtures, goldens or snapshots. */
function inTestData(segs: string[]): boolean {
  return segs.some((s, i) => DATA_DIRS.has(s) || (TEST_DIRS.has(s) && TEST_DATA_DIRS.has(segs[i + 1] ?? '')));
}

/** A test file: named like one, or under a `test/`, `tests/` or `__tests__/` folder, but never test data. */
function isTestPath(path: string): boolean {
  const segs = path.split('/').slice(0, -1);
  if (inTestData(segs)) return false;
  return testStem(path) !== null || segs.some((s) => TEST_DIRS.has(s));
}

/** Folder steps between two files (up to the common ancestor, then down). */
function distance(a: string, b: string): number {
  const [x, y] = [a.split('/').slice(0, -1), b.split('/').slice(0, -1)];
  let common = 0;
  while (common < x.length && common < y.length && x[common] === y[common]) common++;
  return x.length + y.length - 2 * common;
}

/** What a test tests: a file path, or a folder path (`dir: true`). */
export interface TestTarget { path: string; dir: boolean }

/**
 * Maps each test file in `headPaths` to what it tests, or null (#16 AC4, AC9). In order: a source
 * file named `x.*`; a source folder named `x` (outside test folders); the source it shares the
 * most non-bulk commits with, if at least TEST_COCHANGE_MIN. Ties go to the closest path, then
 * codepoint order. Test data (fixtures, goldens, snapshots) is never a target. `commitPaths` holds
 * each commit's changed paths.
 */
export function matchTests(headPaths: string[], commitPaths: string[][]): Map<string, TestTarget | null> {
  const tests = headPaths.filter(isTestPath).sort(byCodepoint);
  const testSet = new Set(tests);
  // Test data is neither a test nor what a test tests (it would win on path distance).
  const sources = headPaths.filter((p) => !testSet.has(p) && !inTestData(p.split('/').slice(0, -1)));
  const add = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  // `x.*` candidates by every dot-prefix of the basename (`a.b.ts` is under `a` and `a.b`).
  const byPrefix = new Map<string, string[]>();
  for (const src of sources) {
    const b = base(src);
    for (let i = b.indexOf('.'); i > 0; i = b.indexOf('.', i + 1)) add(byPrefix, b.slice(0, i), src);
  }
  // Folder candidates by their own name; a folder is compared as if it were a file inside it.
  const byFolder = new Map<string, string[]>();
  for (const d of new Set(sources.flatMap(ancestors))) {
    if (!d.split('/').some((s) => TEST_DIRS.has(s) || DATA_DIRS.has(s))) add(byFolder, base(d), d);
  }
  const closest = (t: string, inside = '') => (a: string, b: string) =>
    distance(t, a + inside) - distance(t, b + inside) || byCodepoint(a, b);

  const out = new Map<string, TestTarget | null>();
  const unmatched = new Map<string, Map<string, number>>();
  for (const t of tests) {
    const stem = testStem(t);
    const byName = stem === null ? undefined : byPrefix.get(stem);
    const folder = stem === null ? undefined : byFolder.get(stem);
    if (byName) out.set(t, { path: [...byName].sort(closest(t))[0]!, dir: false });
    else if (folder) out.set(t, { path: [...folder].sort(closest(t, '/x'))[0]!, dir: true });
    else unmatched.set(t, new Map());
  }
  const sourceSet = new Set(sources);
  for (const paths of commitPaths) {
    if (paths.length > BULK_FILES) continue;
    const inCommit = paths.filter((p) => sourceSet.has(p));
    for (const t of paths) {
      const m = unmatched.get(t);
      if (m) for (const src of inCommit) m.set(src, (m.get(src) ?? 0) + 1);
    }
  }
  for (const [t, shared] of unmatched) {
    const counts = [...shared].filter(([, n]) => n >= TEST_COCHANGE_MIN);
    const top = Math.max(0, ...counts.map(([, n]) => n));
    const src = counts.filter(([, n]) => n === top).map(([p]) => p).sort(closest(t))[0];
    out.set(t, src === undefined ? null : { path: src, dir: false });
  }
  return out;
}
