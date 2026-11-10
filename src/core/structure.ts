// Folder lineage, birth partners and test matching (#16, design §5.1.3). Pure: git output is
// parsed in src/scan/structure.ts and passed in.
import { byCodepoint } from './canonical-json.js';
import { sha256Hex } from './hash.js';
import type { PathHistory } from './renames.js';
import type { DebtCounts, Dir, DirId } from './snapshot/types.js';
import { isoUtc } from './time.js';

/** One `--name-status` row. `from` is the old path of a rename (R) or copy (C). */
export interface Change { status: 'A' | 'C' | 'D' | 'M' | 'R' | 'T'; path: string; from?: string }
/** A first-parent commit, oldest first; its index in the list is its seq. */
export interface LineageCommit { sha: string; dateMs: number; changes: Change[] }

interface DirBirth { id: DirId; bornSeq: number; bornMs: number }

/**
 * A file arriving, moving or leaving (#18): a superset of #33's rename `{ seq, from, to }`. `key` is
 * the file's identity across renames, numbered in birth order, so a lower key is an older file.
 * `from` is null for a birth and `to` for a delete; `from === to` when only its folder ids changed
 * (its folder was reborn, or handed its id on). `top` and `sub` are the ids of its top-level and
 * second-level folders after the commit (null when it has none). `unsure`: a birth that may
 * continue an older file git couldn't follow (#33's `pathHistory`), so it was placed as new.
 */
export interface FileEvent {
  seq: number; key: number; from: string | null; to: string | null; top: DirId | null; sub: DirId | null; unsure?: true;
}

/** Every time an id became a top-level folder (born there, or moved up from deeper), including folders gone since. */
export interface TopBirth { id: DirId; seq: number }

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
  /** File arrivals, moves and departures, in replay order (#18). */
  events: FileEvent[];
  topBirths: TopBirth[];
  /** For each seq that gives birth to a top-level folder: every top-level folder's id after it, by path. */
  topsAt: Map<number, Map<string, DirId>>;
}

/**
 * A merge's merged-in side (#18 AC8): the merged branch's own commits (not merges), oldest first,
 * each as the top-level folder names it touches. Keyed by the merge's first-parent seq.
 */
export type MergeSides = Map<number, Set<string>[]>;

/** How a top-level folder was born: `order` ranks folders born in one merge by the branch commit that made them. */
export interface TopBirthInfo { order: number; side: Set<DirId>[] }

/** The structural history `layout()` replays (#18), so placement is decided once and never moves. */
export interface StructureHistory {
  events: FileEvent[];
  births: { id: DirId; seq: number; order: number; first: Set<DirId>[] }[];
}

/** Clear link: at least 3 of every 5 (60%) of a folder's first commits also touched the partner. */
const PARTNER_WINDOW = 5;
const linked = (hits: number, of: number) => hits * 5 >= of * 3;
/** Co-change fallback for tests: at least this many shared commits (design §5.1.7: bulk excluded). */
const TEST_COCHANGE_MIN = 2;
const BULK_FILES = 200;

/** Debt marker kinds, in summary order; each counts the upper-case form of its key as a word. */
export const DEBT_KEYS = ['todo', 'fixme', 'hack', 'xxx'] as const;
export const zeroDebt = (): DebtCounts => ({ todo: 0, fixme: 0, hack: 0, xxx: 0 });

const dirId = (path: string, ordinal: number): DirId => `d_${sha256Hex(`${path}#${ordinal}`).slice(0, 12)}`;

/** `a/b/c.ts` → `['a', 'a/b']`. */
export function ancestors(path: string): string[] {
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
  const keyOf = new Map<string, number>();
  let nextKey = 0;
  // Top- and second-level folder ids, which place files on planets and continents (#18).
  const near = new Map<string, DirId>();
  const tops = new Map<string, DirId>();
  const wasTop = new Set<DirId>();
  const lineage: Lineage = { seqOf: new Map(), dirs, touches: [], paths: [], headMs: commits.at(-1)?.dateMs ?? 0,
    events: [], topBirths: [], topsAt: new Map() };

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
    // Only folders holding a removed or added path can change id in this commit.
    const shallow = new Set([...removed, ...added].flatMap((p) => ancestors(p).slice(0, 2)));

    // Where each folder's files went: tally[source][destination] = files moved.
    const tally = new Map<string, Map<string, number>>();
    for (const [from, to] of moves) {
      for (const d of ancestors(from)) {
        const rel = from.slice(d.length);
        if (!to.endsWith(rel) || to.length === rel.length) continue;
        const dest = to.slice(0, to.length - rel.length);
        // Moving into its own subfolder isn't a move of the folder: its files are still inside it
        // (Qodo local r6 #1).
        if (dest === d || dest.startsWith(`${d}/`)) continue;
        const t = tally.get(d) ?? new Map<string, number>();
        tally.set(d, t.set(dest, (t.get(dest) ?? 0) + 1));
      }
    }
    const before = new Map([...tally.keys()].map((d) => [d, count.get(d) ?? 0]));
    // Files each folder lost this commit (moved out or deleted); files new to it don't count as
    // staying, and a file moved into one of its own subfolders never left it (PR #20 Qodo r1 #1).
    const movedTo = new Map(moves);
    const lost = new Map<string, number>();
    for (const p of removed) {
      const to = movedTo.get(p);
      for (const d of ancestors(p)) if (to === undefined || !to.startsWith(`${d}/`)) lost.set(d, (lost.get(d) ?? 0) + 1);
    }
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
    recordFiles(seq, removed, added, moves, shallow);
  });
  return lineage;

  /**
   * Layout's view of the commit (#18): a rename carries its key and a delete or an overwrite ends
   * one; any top- or second-level folder whose id changed regroups the files that stayed in it; an
   * id new to the top level is a top-level birth.
   */
  function recordFiles(seq: number, removed: string[], added: string[], moves: [string, string][], shallow: Set<string>): void {
    const ids = (p: string) => {
      const [top, sub] = ancestors(p);
      return { top: top === undefined ? null : dirs.get(top)!.id, sub: sub === undefined ? null : dirs.get(sub)!.id };
    };
    // keyOf holds only live paths, and every live rename source is in `removed`.
    const carried = new Map<string, [string, number]>();
    for (const [from, to] of moves) {
      const k = keyOf.get(from);
      if (k !== undefined) carried.set(to, [from, k]);
    }
    const carriedKeys = new Set([...carried.values()].map(([, k]) => k));
    const end = (k: number, from: string) => lineage.events.push({ seq, key: k, from, to: null, top: null, sub: null });
    for (const p of removed) {
      const k = keyOf.get(p)!;
      keyOf.delete(p);
      if (!carriedKeys.has(k)) end(k, p);
    }
    const evented = new Set<string>();
    for (const p of added) {
      if (evented.has(p)) continue;
      // Copied or renamed onto a live path: the file that was there is gone.
      const over = keyOf.get(p);
      if (over !== undefined) end(over, p);
      const [from, k] = carried.get(p) ?? [null, nextKey++];
      keyOf.set(p, k);
      lineage.events.push({ seq, key: k, from, to: p, ...ids(p) });
      evented.add(p);
    }
    const regrouped: string[] = [];
    let topBorn = false;
    for (const d of shallow) {
      const was = near.get(d);
      const id = dirs.get(d)?.id;
      if (id === was) continue;
      if (id === undefined) near.delete(d);
      else near.set(d, id);
      if (!d.includes('/')) {
        if (id === undefined) tops.delete(d);
        else tops.set(d, id);
        if (id !== undefined && !wasTop.has(id)) {
          wasTop.add(id);
          lineage.topBirths.push({ id, seq });
          topBorn = true;
        }
      }
      if (was !== undefined && id !== undefined) regrouped.push(`${d}/`);
    }
    if (topBorn) lineage.topsAt.set(seq, new Map(tops));
    if (regrouped.length === 0) return;
    for (const p of live) {
      if (!evented.has(p) && regrouped.some((prefix) => p.startsWith(prefix))) {
        lineage.events.push({ seq, key: keyOf.get(p)!, from: p, to: p, ...ids(p) });
      }
    }
  }
}

/**
 * dirs[] for the folders holding `headPaths` (non-excluded files at HEAD), sorted by path. A
 * folder the lineage doesn't know (it shouldn't happen) is born at HEAD and counted in
 * `unreadable`, never dropped. A top-level folder holding only tests or test data isn't a planet,
 * so it's never a partner (#18 AC9). `info` says how each top-level folder was born (merge
 * look-through, #18 AC8).
 */
export function dirsAtHead(lineage: Lineage, headPaths: string[], info: Map<DirId, TopBirthInfo>): { dirs: Dir[]; unreadable: number } {
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
  const sourceTops = new Set(headPaths.filter(isSurfacePath).map((p) => p.slice(0, p.indexOf('/'))));
  const tops = [...births].filter(([p]) => !p.includes('/')).map(([p, b]) => ({ ...b, planet: sourceTops.has(p) }));
  const partner = partners(tops, lineage.touches, info);
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
 * How each top-level folder was born (#18 AC8). One born in a merge commit is looked through to
 * the merged branch's own commits: `side` holds those that touch it (as folder ids at the merge)
 * and `order` is the first of them, so the folders one PR brings in keep their real birth order. A
 * folder no branch commit touched (made in the merge itself) ranks after the others in that merge.
 */
export function topBirthInfo(lineage: Lineage, sides: MergeSides): Map<DirId, TopBirthInfo> {
  const out = new Map<DirId, TopBirthInfo>();
  const mapped = new Map<number, Set<DirId>[]>();
  for (const b of lineage.topBirths) {
    const side = sides.get(b.seq);
    if (!side) {
      out.set(b.id, { order: 0, side: [] });
      continue;
    }
    let commits = mapped.get(b.seq);
    if (!commits) {
      const at = lineage.topsAt.get(b.seq)!;
      commits = side.map((names) => new Set([...names].flatMap((n) => at.get(n) ?? [])));
      mapped.set(b.seq, commits);
    }
    const first = commits.findIndex((s) => s.has(b.id));
    out.set(b.id, { order: first < 0 ? side.length : first, side: commits.filter((s) => s.has(b.id)) });
  }
  return out;
}

/** A top-level folder's birth, for ordering: older means an earlier seq, or the same merge and an earlier branch commit. */
export interface BirthRank { id: DirId; seq: number; order: number }
export const olderThan = (x: BirthRank, t: BirthRank) => x.seq < t.seq || (x.seq === t.seq && x.order < t.order);
/** Oldest first; folders born together by id. */
export const byBirth = (a: BirthRank, b: BirthRank) => a.seq - b.seq || a.order - b.order || byCodepoint(a.id, b.id);

/**
 * The clear-link rule (#16): ≥ 60% of a folder's `first` commits also touched the candidate.
 * Candidates must be older planets. Ties: higher share, then the older birth, then id.
 */
export function clearLink(first: Set<DirId>[], candidates: BirthRank[]): DirId | null {
  const best = candidates.map((x) => ({ x, hits: first.filter((s) => s.has(x.id)).length }))
    .filter(({ hits }) => hits > 0 && linked(hits, first.length))
    .sort((a, b) => b.hits - a.hits || byBirth(a.x, b.x))[0];
  return best?.x.id ?? null;
}

/**
 * Partners at HEAD (#16 AC2): the clear-link rule over a top-level folder's first 5 commits (from
 * its birth; fewer if that's all there are), against older top-level planets. A folder born in a
 * merge counts the merged branch's commits first, then first-parent commits after the merge (#18 AC8).
 */
function partners(tops: (DirBirth & { planet: boolean })[], touches: Set<DirId>[], info: Map<DirId, TopBirthInfo>): Map<DirId, DirId> {
  const out = new Map<DirId, DirId>();
  const rank = (t: DirBirth): BirthRank => ({ id: t.id, seq: t.bornSeq, order: info.get(t.id)?.order ?? 0 });
  const planets = tops.filter((x) => x.planet).map(rank);
  for (const t of tops) {
    const { side } = info.get(t.id) ?? { side: [] };
    const first = side.slice(0, PARTNER_WINDOW);
    for (let seq = t.bornSeq + (side.length > 0 ? 1 : 0); seq < touches.length && first.length < PARTNER_WINDOW; seq++) {
      if (touches[seq]!.has(t.id)) first.push(touches[seq]!);
    }
    const me = rank(t);
    const partner = clearLink(first, planets.filter((x) => olderThan(x, me)));
    if (partner) out.set(t.id, partner);
  }
  return out;
}

/**
 * What `layout()` replays (#18). A top-level folder's birth partner uses only the commits known at
 * its birth (its birth commit, or the merged branch's own commits), so its slot is decided once.
 * `paths` (#33's pathHistory over the same log, from seq 0) marks the unsure births.
 */
export function structureHistory(lineage: Lineage, info: Map<DirId, TopBirthInfo>, paths: PathHistory): StructureHistory {
  const unsure = new Set(paths.births.filter((b) => b.unsure).map((b) => `${b.seq}\0${b.path}`));
  return {
    events: lineage.events.map((e) => (e.from === null && unsure.has(`${e.seq}\0${e.to}`) ? { ...e, unsure: true } : e)),
    births: lineage.topBirths.map((b) => {
      const { order, side } = info.get(b.id) ?? { order: 0, side: [] };
      return { id: b.id, seq: b.seq, order, first: side.length > 0 ? side.slice(0, PARTNER_WINDOW) : [lineage.touches[b.seq] ?? new Set()] };
    }),
  };
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

/**
 * Test data (#16 AC10): under `__fixtures__/` or `__snapshots__/`, or `fixtures/` or `golden/` in a
 * test folder. Never a test (`FileEntry.isTest` is false) or a test target; it rides with the tests (#23).
 */
export function isTestData(path: string): boolean {
  return inTestData(path.split('/').slice(0, -1));
}

/**
 * A planet's surface file: in a top-level folder, and neither a test nor test data. A top-level
 * folder is a planet exactly when it holds one, so `test/` never is (#23).
 */
export function isSurfacePath(path: string): boolean {
  return path.includes('/') && !isTestPath(path) && !isTestData(path);
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
 * each commit's changed paths. Commits over BULK_FILES files are left out of co-change; those that
 * held a test still waiting for co-change evidence are counted in `bulkSkipped` (Rule 1).
 */
export function matchTests(headPaths: string[], commitPaths: string[][]): { targets: Map<string, TestTarget | null>; bulkSkipped: number } {
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
  let bulkSkipped = 0;
  for (const paths of commitPaths) {
    if (paths.length > BULK_FILES) {
      if (paths.some((p) => unmatched.has(p))) bulkSkipped++;
      continue;
    }
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
  return { targets: out, bulkSkipped };
}
const DOC_FILE = /\.(?:md|mdx|rst|txt)$/i;

/**
 * Whether debt markers in this file count (#16 AC13: source code only). Tests, test data and
 * docs (`*.md`, `*.mdx`, `*.rst`, `*.txt`, the top-level `docs/`) count 0.
 */
export function debtCounted(path: string): boolean {
  if (DOC_FILE.test(path) || path.startsWith('docs/')) return false;
  return !isTestPath(path) && !inTestData(path.split('/').slice(0, -1));
}
