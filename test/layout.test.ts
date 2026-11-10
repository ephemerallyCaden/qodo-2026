// Issue #18: layout(), pure. One describe per acceptance criterion; worlds come from
// test/fixtures/layout.ts. Scan-level checks (layout.json, the golden, AC8 on real git) are in
// test/layout-scan.test.ts.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import type { LayoutV1 } from '../src/core/contract/layout.js';
import { ASH_MAX_MILLI, HEALTHY_MAX_MILLI, MOON_CAP, MOONLET_CAP, TOXIC_MAX_MILLI } from '../src/core/layout/constants.js';
import { bandOf, health } from '../src/core/layout/health.js';
import { layout, layoutReport, log2Milli, planetRadiusMilli, settlementSize, type LayoutOptions } from '../src/core/layout/index.js';
import { pathHistory, RENAME_LIMIT } from '../src/core/renames.js';
import { buildLineage, zeroDebt, type Change } from '../src/core/structure.js';
import { mergeSides } from '../src/scan/structure.js';
import { A, C, D, fileId, lineageCommits, M, planetAt as planet, R, world, type World } from './fixtures/layout.js';

const run = (w: World, o?: LayoutOptions) => layout(w.snapshot, w.history, o);
const slotOf = (l: LayoutV1, path: string) => planet(l, path).slot.index;
const cellOf = (l: LayoutV1, path: string) => l.planets.flatMap((p) => p.surface.settlements).find((s) => s.fileId === fileId(path))?.cell;

describe('#18 AC1: pure and deterministic', () => {
  const commits = [[A('src/a.ts'), A('src/x/b.ts'), A('README.md')], [A('web/w.ts'), M('src/a.ts')], [A('test/a.test.ts')]];
  const w = world(commits);

  it('the same input gives byte-identical layout.json', () => {
    expect(canonicalJson(run(w))).toBe(canonicalJson(run(world(commits))));
  });

  it('does not depend on the order of the snapshot\'s lists', () => {
    const s = w.snapshot;
    const shuffled = { ...s, dirs: [...s.dirs].reverse(), files: [...s.files].reverse() };
    expect(canonicalJson(layout(shuffled, w.history))).toBe(canonicalJson(run(w)));
  });

  it('uses integer, platform-independent maths for sizes', () => {
    expect([1, 2, 3, 4, 1024, 1201].map(log2Milli)).toEqual([0, 1000, 1584, 2000, 10000, 10230]);
    expect(planetRadiusMilli(0)).toBe(1500);
    expect(planetRadiusMilli(1200)).toBe(7672);
    expect(planetRadiusMilli(10_000_000)).toBe(12000);
    expect([0, 50, 51, 200, 201, 500, 501].map(settlementSize)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
});

// A seeded PRNG (mulberry32): test worlds are random but reproducible.
function prng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPS = ['a', 'b', 'c', 'd', 'e'];
const SUBS = ['', 'x/', 'y/', 'x/deep/'];
const isSource = (p: string) => p.includes('/') && !p.startsWith('test/');

/** Random first-parent history: one change per commit, so no test gains co-change evidence by accident. */
class Gen {
  readonly live = new Set<string>();
  readonly commits: Change[][] = [];
  private n = 0;
  constructor(private readonly r: () => number) {}
  pick<T>(xs: T[]): T {
    return xs[Math.floor(this.r() * xs.length)]!;
  }
  sources = () => [...this.live].filter(isSource).sort();
  commit(changes: Change[]): Change[] {
    for (const c of changes) {
      if (c.status === 'D') this.live.delete(c.path);
      if (c.status === 'R') this.live.delete(c.from!);
      if (c.status !== 'D') this.live.add(c.path);
    }
    this.commits.push(changes);
    return changes;
  }
  /** Unique stems (n0, n1, …): a test named after one never matches another. */
  addSource = (top = this.pick(TOPS)) => this.commit([A(`${top}/${this.pick(SUBS)}n${this.n++}.ts`)]);
  addTest = () => {
    const src = this.sources();
    if (src.length === 0) return this.addSource();
    const stem = this.pick(src).replace(/^.*\//, '').replace(/\.ts$/, '');
    return this.live.has(`test/${stem}.test.ts`) ? this.modify() : this.commit([A(`test/${stem}.test.ts`)]);
  };
  /** An unmatched test, test data or a root file. */
  addOther = () => {
    const n = this.n++;
    return this.commit([A(this.pick([`test/u${n}.test.ts`, `test/fixtures/d${n}.json`, `r${n}.md`]))]);
  };
  modify = () => (this.live.size ? this.commit([M(this.pick([...this.live].sort()))]) : this.addSource());
  remove = () => (this.live.size ? this.commit([D(this.pick([...this.live].sort()))]) : this.addSource());
  rename = () => {
    const src = this.sources();
    if (src.length === 0) return this.addSource();
    const from = this.pick(src);
    const [top, base] = [from.slice(0, from.indexOf('/')), from.slice(from.lastIndexOf('/') + 1)];
    const to = `${top}/${this.pick(SUBS.filter((s) => `${top}/${s}${base}` !== from))}${base}`;
    return this.live.has(to) ? this.modify() : this.commit([R(from, to)]);
  };
  step(): Change[] {
    const x = this.r();
    return x < 0.35 ? this.addSource() : x < 0.55 ? this.addTest() : x < 0.65 ? this.addOther() : x < 0.75 ? this.modify()
      : x < 0.88 ? this.remove() : this.rename();
  }
}

function trial(seed: number) {
  const r = prng(seed);
  const g = new Gen(r);
  const steps = 20 + Math.floor(r() * 40);
  for (let i = 0; i < steps; i++) g.step();
  // Small grids in half the trials, so overflow is exercised too.
  const o: LayoutOptions = { surfaceCells: r() < 0.5 ? 6 : 256 };
  return { g, o, before: () => run(world(g.commits), o) };
}

/** Every placed body, keyed by what it is, valued by where it is. */
function bodies(l: LayoutV1, kinds = ['planet', 'seed', 'file', 'moon', 'moonlet']): Map<string, string> {
  const m = new Map<string, string>();
  const put = (kind: string, k: string, v: string) => kinds.includes(kind) && m.set(`${kind} ${k}`, v);
  for (const p of l.planets) {
    put('planet', p.dirId, `slot ${p.slot.index}`);
    for (const c of p.surface.continents) put('seed', `${p.dirId} ${c.dirId}`, `cell ${c.seedCell}`);
    for (const s of p.surface.settlements) put('file', s.fileId, `${p.dirId} cell ${s.cell}`);
    for (const x of p.moons) put('moon', x.fileId, `${p.dirId} slot ${x.slot}`);
  }
  for (const x of l.star.moonlets) put('moonlet', x.fileId, `slot ${x.slot}`);
  return m;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('#18 AC2: property tests (40 seeded random histories each)', () => {
  it('adding a file, a folder or a commit never changes any existing body\'s slot, cell or moon slot', () => {
    for (const seed of SEEDS) {
      const t = trial(seed);
      const before = t.before();
      const r = prng(seed * 7919);
      const add = [() => t.g.addSource(), () => t.g.addSource(`q${seed}`), () => t.g.addTest(), () => t.g.addOther(), () => t.g.modify()];
      add[Math.floor(r() * add.length)]!();
      const w = world(t.g.commits);
      const { layout: after, notes } = layoutReport(w.snapshot, w.history, t.o);
      // The lineage's own events end exactly at HEAD: nothing needed repairing.
      expect(notes.unmatched, `seed ${seed}`).toBe(0);
      const now = bodies(after);
      for (const [k, v] of bodies(before)) expect(now.get(k), `seed ${seed}: ${k}`).toBe(v);
      // Overflow is never reshuffled onto the grid, and never shrinks when something is added.
      for (const p of before.planets) expect(planet(after, p.path).surface.overflow).toBeGreaterThanOrEqual(p.surface.overflow);
    }
  });

  it('a rename keeps its cell, and moves nothing else', () => {
    let renamed = 0;
    for (const seed of SEEDS) {
      const t = trial(seed);
      const before = t.before();
      const [ch] = t.g.rename();
      if (ch!.status !== 'R') continue;
      renamed++;
      const after = run(world(t.g.commits), t.o);
      expect(cellOf(after, ch!.path), `seed ${seed}`).toBe(cellOf(before, ch!.from!));
      const now = bodies(after);
      for (const [k, v] of bodies(before)) if (k !== `file ${fileId(ch!.from!)}`) {
        // The renamed file's moons now name its new id but keep their place; an emptied continent may go.
        if (now.has(k) || !k.startsWith('seed')) expect(now.get(k), `seed ${seed}: ${k}`).toBe(v);
      }
    }
    expect(renamed).toBeGreaterThan(20);
  });

  it('a new planet with a partner lands in the free slot nearest it', () => {
    for (const seed of SEEDS) {
      const t = trial(seed);
      const before = t.before();
      if (before.planets.length === 0) continue;
      const partner = before.planets[Math.floor(prng(seed)() * before.planets.length)]!;
      const touch = t.g.sources().find((p) => p.startsWith(`${partner.path}/`))!;
      t.g.commit([A(`new${seed}/n.ts`), M(touch)]);
      const after = run(world(t.g.commits), t.o);
      const born = planet(after, `new${seed}`);
      expect(born.partner, `seed ${seed}`).toBe(partner.dirId);
      const taken = new Set(before.planets.map((p) => p.slot.index));
      const at = partner.slot.index;
      let want = -1;
      for (let d = 1; want < 0; d++) want = at - d >= 0 && !taken.has(at - d) ? at - d : !taken.has(at + d) ? at + d : -1;
      expect(born.slot.index, `seed ${seed}`).toBe(want);
    }
  });

  it('a new planet without a partner lands in the innermost free slot', () => {
    for (const seed of SEEDS) {
      const t = trial(seed);
      const before = t.before();
      t.g.addSource(`solo${seed}`);
      const born = planet(run(world(t.g.commits), t.o), `solo${seed}`);
      const taken = new Set(before.planets.map((p) => p.slot.index));
      let want = 0;
      while (taken.has(want)) want++;
      expect(born.partner).toBeNull();
      expect(born.slot.index, `seed ${seed}`).toBe(want);
    }
  });

  it('deleting a file moves no other planet or settlement (its place is free for later births)', () => {
    for (const seed of SEEDS) {
      const t = trial(seed);
      const before = t.before();
      const src = t.g.sources();
      if (src.length === 0) continue;
      const gone = t.g.pick(src);
      t.g.commit([D(gone)]);
      const now = bodies(run(world(t.g.commits), t.o), ['planet', 'file', 'seed']);
      for (const [k, v] of bodies(before, ['planet', 'file', 'seed'])) {
        if (k === `file ${fileId(gone)}`) expect(now.has(k)).toBe(false);
        else if (now.has(k) || k.startsWith('file')) expect(now.get(k), `seed ${seed}: ${k}`).toBe(v);
      }
    }
  });
});

describe('#18 AC2: placement examples', () => {
  it('a deleted planet\'s slot is reused, and a folder re-created with the same name is a new planet', () => {
    const l = run(world([[A('a/1.ts')], [A('b/2.ts')], [D('a/1.ts')], [A('a/3.ts')]]));
    expect(l.planets.map((p) => [p.path, p.slot.index, p.bornSeq])).toEqual([['a', 0, 3], ['b', 1, 1]]);
    expect(planet(l, 'a').dirId).not.toBe(planet(run(world([[A('a/1.ts')]])), 'a').dirId);
  });

  it('a top-level rename that carries the folder\'s id keeps its slot and its cells', () => {
    const before = run(world([[A('a/1.ts'), A('a/2.ts')], [A('b/3.ts')]]));
    const after = run(world([[A('a/1.ts'), A('a/2.ts')], [A('b/3.ts')], [R('a/1.ts', 'z/1.ts'), R('a/2.ts', 'z/2.ts')]]));
    expect(planet(after, 'z')).toMatchObject({ dirId: planet(before, 'a').dirId, slot: { index: 0 } });
    expect([cellOf(after, 'z/1.ts'), cellOf(after, 'z/2.ts')]).toEqual([cellOf(before, 'a/1.ts'), cellOf(before, 'a/2.ts')]);
  });

  it('a subfolder moved up to the top level is a new planet, placed when it arrives', () => {
    const l = run(world([[A('a/1.ts'), A('a/x/2.ts'), A('a/x/3.ts')], [A('b/4.ts')], [R('a/x/2.ts', 'x/2.ts'), R('a/x/3.ts', 'x/3.ts')]]));
    expect(l.planets.map((p) => [p.path, p.slot.index])).toEqual([['a', 0], ['b', 1], ['x', 2]]);
    expect(planet(l, 'x').surface.settlements.map((s) => s.fileId).sort()).toEqual([fileId('x/2.ts'), fileId('x/3.ts')].sort());
  });

  it('files left behind when their folder\'s id moves on regroup under the reborn folder', () => {
    // Two of a/'s three files move to z/, which takes a/'s id; a/ is reborn around the one left.
    const w = world([[A('a/1.ts'), A('a/2.ts'), A('a/3.ts')], [R('a/1.ts', 'z/1.ts'), R('a/2.ts', 'z/2.ts')]]);
    const { layout: l, notes } = layoutReport(w.snapshot, w.history);
    expect(notes.unmatched).toBe(0);
    expect(l.planets.map((p) => [p.path, p.surface.settlements.length])).toEqual([['z', 2], ['a', 1]]);
  });

  it('two planets born in one commit, each touching the other, are not each other\'s partner', () => {
    const l = run(world([[A('a/1.ts')], [A('b/2.ts'), A('c/3.ts')], [A('b/4.ts'), A('c/5.ts')]]));
    expect(slotOf(l, 'a')).toBe(0);
    expect([planet(l, 'b').partner, planet(l, 'c').partner]).toEqual([null, null]);
    expect(new Set([slotOf(l, 'b'), slotOf(l, 'c')])).toEqual(new Set([1, 2]));
  });

  it('a partner is decided at birth: later commits that dilute the link never move the planet', () => {
    // Slot 0 is free again when d/ is born next to e/ (slot 3), so the nearest free slot is 4, not 0.
    const born = [[A('a/1.ts')], [A('b/1.ts')], [A('c/1.ts')], [A('e/1.ts')], [D('a/1.ts')], [A('d/1.ts'), M('e/1.ts')]];
    const l = run(world(born));
    expect(planet(l, 'd')).toMatchObject({ partner: planet(l, 'e').dirId, slot: { index: 4 } });
    const diluted = world([...born, [M('d/1.ts')], [M('d/1.ts')], [M('d/1.ts')]]);
    // The 5-commit rule in the snapshot no longer links them (1 of 4); the planet stays where it was born.
    expect(diluted.snapshot.dirs.find((d) => d.path === 'd')!.partner).toBeNull();
    expect(planet(run(diluted), 'd')).toMatchObject({ partner: planet(l, 'e').dirId, slot: { index: 4 } });
  });
});

describe('#18 AC3 and AC9: test folders, moons and moonlets', () => {
  const w = world([
    [A('src/a.ts'), A('src/x/b.ts'), A('README.md'), A('package.json')],
    [A('test/a.test.ts'), A('test/lonely.test.ts'), A('test/helpers.ts'), A('src/b.test.ts')],
    [A('test/fixtures/data.json'), A('test/golden/out.json'), A('src/__snapshots__/a.snap'), A('fixtures-only/__fixtures__/f.json')],
    [A('package.test.ts')],
  ]);
  const l = run(w);

  it('test/ (tests and test data) is never a planet, nor is a folder holding only test data', () => {
    expect(l.planets.map((p) => p.path)).toEqual(['src']);
  });

  it('matched tests are moons of the planet holding their source', () => {
    expect(planet(l, 'src').moons.map((m) => [m.fileId, m.testOf])).toEqual([
      [fileId('test/a.test.ts'), fileId('src/a.ts')],
      [fileId('src/b.test.ts'), fileId('src/x/b.ts')],
    ]);
  });

  it('unmatched tests and root files are moonlets on the innermost orbit, oldest first', () => {
    expect(l.star.moonlets.map((m) => [m.fileId, m.kind, m.slot])).toEqual([
      [fileId('README.md'), 'root-file', 0],
      [fileId('package.json'), 'root-file', 1],
      [fileId('test/lonely.test.ts'), 'unmatched-test', 2],
      [fileId('test/helpers.ts'), 'unmatched-test', 3],
      // A root-level test of a root file stays a root file.
      [fileId('package.test.ts'), 'root-file', 4],
    ]);
  });

  it('test data is counted on the star, never on a surface (#23)', () => {
    expect(l.star.testData).toBe(4);
    const drawn = new Set([...l.star.moonlets.map((m) => m.fileId), ...l.planets.flatMap((p) => [...p.surface.settlements.map((s) => s.fileId),
      ...p.moons.map((m) => m.fileId)])]);
    for (const f of ['test/fixtures/data.json', 'test/golden/out.json', 'src/__snapshots__/a.snap']) expect(drawn.has(fileId(f))).toBe(false);
  });

  it('accounts for every file once: on a planet, around the star, or as test data', () => {
    const counted = l.planets.reduce((n, p) => n + p.surface.settlements.length + p.surface.overflow + p.moons.length + p.moonOverflow, 0)
      + l.star.moonlets.length + l.star.moonletOverflow + l.star.testData;
    expect(counted).toBe(w.snapshot.files.length);
  });
});

describe('#18 AC4: overflow is counted, never dropped (Rule 1)', () => {
  it('moons beyond the cap, oldest first', () => {
    const tests = Array.from({ length: MOON_CAP + 3 }, (_, i) => [A(`test/t${i}/a.test.ts`)]);
    const l = run(world([[A('a/n.ts')], ...tests]));
    const p = planet(l, 'a');
    expect([p.moons.length, p.moonOverflow]).toEqual([MOON_CAP, 3]);
    expect(p.moons.map((m) => m.fileId)).toEqual(tests.slice(0, MOON_CAP).map(([c]) => fileId(c!.path)));
    expect(p.moons.map((m) => m.slot)).toEqual(Array.from({ length: MOON_CAP }, (_, i) => i));
  });

  it('files beyond the surface grid', () => {
    const l = run(world([Array.from({ length: 6 }, (_, i) => A(`a/${i}.ts`))]), { surfaceCells: 4 });
    const p = planet(l, 'a');
    expect(p.surface.grid.cells).toBe(4);
    expect([p.surface.settlements.length, p.surface.overflow, p.loc]).toEqual([4, 2, 60]);
  });

  it('moonlets beyond the cap', () => {
    const l = run(world([Array.from({ length: MOONLET_CAP + 2 }, (_, i) => A(`r${String(i).padStart(2, '0')}.md`))]));
    expect([l.star.moonlets.length, l.star.moonletOverflow]).toEqual([MOONLET_CAP, 2]);
  });

  it('a planet whose files are all overflow is still a planet, with its LOC and health', () => {
    const l = run(world([[A('a/1.ts')], [A('a/2.ts'), A('a/3.ts')], [D('a/1.ts')]]), { surfaceCells: 1 });
    expect(planet(l, 'a')).toMatchObject({ loc: 20, surface: { settlements: [], overflow: 2 }, health: { band: 'healthy' } });
  });

  it('a freed cell goes to a later birth, never to a file already in overflow', () => {
    const l = run(world([[A('a/1.ts')], [A('a/2.ts')], [D('a/1.ts')], [A('a/3.ts')]]), { surfaceCells: 1 });
    expect(planet(l, 'a').surface).toMatchObject({ settlements: [{ fileId: fileId('a/3.ts'), cell: 0 }], overflow: 1 });
  });
});

describe('#18 AC5: health bands at their boundaries', () => {
  const debt = (n: number) => ({ ...zeroDebt(), todo: n });

  it('0 markers, exactly at each threshold and just above', () => {
    expect(bandOf(0)).toBe('healthy');
    expect([HEALTHY_MAX_MILLI, HEALTHY_MAX_MILLI + 1].map(bandOf)).toEqual(['healthy', 'ash']);
    expect([ASH_MAX_MILLI, ASH_MAX_MILLI + 1].map(bandOf)).toEqual(['ash', 'toxic']);
    expect([TOXIC_MAX_MILLI, TOXIC_MAX_MILLI + 1].map(bandOf)).toEqual(['toxic', 'lava']);
  });

  it('markers per kLOC from files: at and just above each threshold', () => {
    const h = (markers: number, loc: number) => health([{ loc, debt: debt(markers), qodoOpen: null }]);
    expect(h(0, 1000)).toEqual({ band: 'healthy', markersPerKlocMilli: 0, debtUnknownFiles: 0, qodoOpen: null, qodoUnknown: true });
    expect([h(2, 1000), h(2, 999)].map((x) => [x.band, x.markersPerKlocMilli])).toEqual([['healthy', 2000], ['ash', 2002]]);
    expect([h(5, 1000), h(5, 999)].map((x) => x.band)).toEqual(['ash', 'toxic']);
    expect([h(10, 1000), h(10, 999)].map((x) => x.band)).toEqual(['toxic', 'lava']);
  });

  it('open Qodo findings count when every file\'s are known; otherwise the band is markers-only and flagged', () => {
    const known = health([{ loc: 1000, debt: debt(1), qodoOpen: 1 }, { loc: 1000, debt: debt(0), qodoOpen: 1 }]);
    expect(known).toMatchObject({ band: 'ash', markersPerKlocMilli: 500, qodoOpen: 2, qodoUnknown: false });
    const partial = health([{ loc: 1000, debt: debt(1), qodoOpen: 1 }, { loc: 1000, debt: debt(0), qodoOpen: null }]);
    expect(partial).toMatchObject({ band: 'healthy', qodoOpen: null, qodoUnknown: true });
  });

  it('unread debt is counted, never 0, and a planet holding any is never healthy', () => {
    const h = health([{ loc: 100, debt: null, qodoOpen: null }, { loc: 100, debt: debt(0), qodoOpen: null }]);
    expect(h).toMatchObject({ band: 'ash', markersPerKlocMilli: 0, debtUnknownFiles: 1 });
    expect(health([{ loc: 100, debt: debt(5), qodoOpen: null }, { loc: 100, debt: null, qodoOpen: null }]).band).toBe('lava');
  });

  it('planets and settlements carry their own health, with files[].qodo when it is known', () => {
    const files = [[A('a/dirty.ts'), A('a/clean.ts')]];
    const opts = { loc: () => 100, debt: (p: string) => debt(p.includes('dirty') ? 1 : 0) };
    const band = (l: LayoutV1) => [planet(l, 'a').health.band, ...[fileId('a/clean.ts'), fileId('a/dirty.ts')]
      .map((id) => planet(l, 'a').surface.settlements.find((s) => s.fileId === id)!.health.band)];
    // Unknown findings (null): markers only. 1 marker in 200 LOC is 5/kLOC (ash); per file, 0 and 10/kLOC.
    const unknown = run(world(files, opts));
    expect(planet(unknown, 'a').health).toMatchObject({ markersPerKlocMilli: 5000, qodoOpen: null, qodoUnknown: true });
    expect(band(unknown)).toEqual(['ash', 'healthy', 'toxic']);
    // One open finding on clean.ts: 5/kLOC on the planet and 10/kLOC on the file, each weighing 2.
    const known = run(world(files, { ...opts, qodo: (p) => (p.includes('clean') ? 1 : 0) }));
    expect(planet(known, 'a').health).toMatchObject({ qodoOpen: 1, qodoUnknown: false });
    expect(band(known)).toEqual(['lava', 'lava', 'toxic']);
  });
});

describe('#18 AC8: partners look through a merge (pure)', () => {
  // c0 makes core/ and api/; c1 is a PR merge bringing in pkg/, svc/ and ext/ (and touching both).
  const commits = [[A('core/a.ts'), A('api/b.ts')], [A('pkg/p.ts'), A('svc/s.ts'), A('ext/e.ts'), M('core/a.ts'), M('api/b.ts')]];
  const side = new Map([[1, [new Set(['pkg', 'core']), new Set(['pkg', 'core']), new Set(['svc', 'api']), new Set(['ext', 'pkg'])]]]);
  const partners = (w: World) => Object.fromEntries(w.snapshot.dirs.map((d) => [d.path,
    w.snapshot.dirs.find((x) => x.id === d.partner)?.path ?? null]));

  it('without the branch\'s commits every folder the merge brings in shares one partner', () => {
    expect(partners(world(commits))).toMatchObject({ pkg: 'core', svc: 'core', ext: 'core' });
  });

  it('with them each gets its real partner, and the placement follows', () => {
    const w = world(commits, { sides: side });
    expect(partners(w)).toMatchObject({ pkg: 'core', svc: 'api', ext: 'pkg', core: null, api: null });
    const l = run(w);
    expect(Object.fromEntries(l.planets.map((p) => [p.path, l.planets.find((x) => x.dirId === p.partner)?.path ?? null])))
      .toEqual({ core: null, api: null, pkg: 'core', svc: 'api', ext: 'pkg' });
  });

  it('mergeSides reads the merged branch\'s own commits through the lineage parser, dropping excluded paths', async () => {
    const log = lineageCommits(commits);
    const merge = log[1]!.sha;
    const calls: string[][] = [];
    const git = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'rev-list') return `${merge} ${log[0]!.sha} ${'f'.repeat(40)}\n`;
      // Two commits: a rename counts both folders; a top-level folder can start with a newline; node_modules is excluded.
      return `\0${'b'.repeat(40)}\x00100\0\nR100\0pkg/p.ts\0lib/p.ts\0M\0core/a.ts\0`
        + `\0${'c'.repeat(40)}\x00200\0\nA\0\nodd/x.ts\0A\0node_modules/m/i.js\0`;
    };
    const sides = await mergeSides(git, log, buildLineage(log, () => false), (p) => p.startsWith('node_modules/'));
    expect(calls.map((c) => c[0])).toEqual(['rev-list', 'log']);
    expect(calls[1]).toContain(`${merge}^1..${merge}`);
    expect(sides).toEqual(new Map([[1, [new Set(['pkg', 'lib', 'core']), new Set(['\nodd'])]]]));
  });
});

describe('local Qodo review (#18 r1)', () => {
  it('#1: a folder renamed on the merged branch keeps the evidence of its commits under the old name', async () => {
    // The branch makes tmp/ with core/ twice, then renames tmp/ to pkg/ and merges: pkg/'s partner is core/ (2 of 3).
    const commits = [[A('core/a.ts')], [A('pkg/p.ts'), M('core/a.ts')]];
    const log = lineageCommits(commits);
    const git = async (args: string[]) => (args[0] === 'rev-list' ? `${log[1]!.sha} ${log[0]!.sha} ${'f'.repeat(40)}\n`
      : `\0${'b'.repeat(40)}\x00100\0\nA\0tmp/p.ts\0M\0core/a.ts\0`
        + `\0${'c'.repeat(40)}\x00200\0\nM\0tmp/p.ts\0M\0core/a.ts\0`
        + `\0${'d'.repeat(40)}\x00300\0\nR100\0tmp/p.ts\0pkg/p.ts\0`);
    const sides = await mergeSides(git, log, buildLineage(log, () => false), () => false);
    expect(sides.get(1)).toEqual([new Set(['pkg', 'core']), new Set(['pkg', 'core']), new Set(['tmp', 'pkg'])]);
    const w = world(commits, { sides });
    expect(w.snapshot.dirs.find((d) => d.path === 'pkg')!.partner).toBe(w.snapshot.dirs.find((d) => d.path === 'core')!.id);
    expect(planet(run(w), 'pkg').partner).toBe(planet(run(w), 'core').dirId);
  });
});

describe('local Qodo review (#18 r2)', () => {
  it('#2: a file moved out of a folder that stays is a split, not a rename of the folder', async () => {
    // lib/ is still there at the merge, so its earlier commit stays lib/'s, not pkg/'s.
    const commits = [[A('core/a.ts'), A('lib/l.ts'), A('lib/m.ts')], [R('lib/m.ts', 'pkg/m.ts'), M('lib/l.ts')]];
    const log = lineageCommits(commits);
    const git = async (args: string[]) => (args[0] === 'rev-list' ? `${log[1]!.sha} ${log[0]!.sha} ${'f'.repeat(40)}\n`
      : `\0${'b'.repeat(40)}\x00100\0\nM\0lib/l.ts\0M\0core/a.ts\0`
        + `\0${'c'.repeat(40)}\x00200\0\nR100\0lib/m.ts\0pkg/m.ts\0`);
    const sides = await mergeSides(git, log, buildLineage(log, () => false), () => false);
    expect(sides.get(1)).toEqual([new Set(['lib', 'core']), new Set(['lib', 'pkg'])]);
  });
});

describe('#18 edge cases', () => {
  it('an empty repo has a star and nothing else', () => {
    const l = run(world([[]]));
    expect(l).toMatchObject({ planets: [], star: { moonlets: [], moonletOverflow: 0, testData: 0 } });
  });

  it('a file the history lacks is still placed, last (nothing in the snapshot is dropped)', () => {
    const w = world([[A('a/1.ts')]]);
    const extra = { ...w.snapshot.files[0]!, id: fileId('a/2.ts'), path: 'a/2.ts' };
    const { layout: l, notes } = layoutReport({ ...w.snapshot, files: [...w.snapshot.files, extra] }, w.history);
    expect(planet(l, 'a').surface.settlements.map((s) => s.fileId).sort()).toEqual([fileId('a/1.ts'), fileId('a/2.ts')].sort());
    expect(cellOf(l, 'a/1.ts')).toBe(cellOf(run(w), 'a/1.ts'));
    // Counted (Rule 1): one file placed without history. A history file missing at HEAD isn't a placement (Qodo PR51 086107d0).
    expect(notes.unmatched).toBe(1);
    const gone = layoutReport({ ...w.snapshot, files: [] }, w.history);
    expect(gone.notes.unmatched).toBe(0);
  });

  it('continents: the top folder seeds at the pole, each subfolder apart from the others', () => {
    const l = run(world([[A('a/1.ts'), A('a/x/2.ts'), A('a/y/3.ts'), A('a/y/deep/4.ts')]]));
    const s = planet(l, 'a').surface;
    expect(s.continents[0]).toMatchObject({ parent: null, seedCell: 0 });
    expect(s.continents.slice(1).every((c) => c.parent === planet(l, 'a').dirId)).toBe(true);
    expect(new Set(s.continents.map((c) => c.seedCell)).size).toBe(3);
    // Deeper folders fold into their second-level continent.
    expect(s.settlements.find((x) => x.fileId === fileId('a/y/deep/4.ts'))!.dirId)
      .toBe(s.settlements.find((x) => x.fileId === fileId('a/y/3.ts'))!.dirId);
  });
});

describe('#18 with #33: renames and unsure births come from the same lineage', () => {
  it('the history\'s moves are exactly pathHistory\'s renames', () => {
    for (const seed of SEEDS) {
      const { g } = trial(seed);
      const w = world(g.commits);
      const moves = w.history.events.filter((e) => e.from !== null && e.to !== null && e.from !== e.to)
        .map(({ seq, from, to }) => ({ seq, from, to }));
      expect(moves, `seed ${seed}`).toEqual(pathHistory(w.commits).renames);
    }
  });

  it('a birth pathHistory calls unsure takes a fresh cell and is counted', () => {
    // A copy may continue its source's history, but git can't say: it is placed as a new file.
    const w = world([[A('a/1.ts')], [C('a/1.ts', 'a/2.ts')]]);
    const { layout: l, notes } = layoutReport(w.snapshot, w.history);
    expect(notes.unsure).toBe(1);
    expect(planet(l, 'a').surface.settlements).toHaveLength(2);
    // Past the rename limit git skips inexact detection, so every birth there is unsure.
    const big = Array.from({ length: RENAME_LIMIT + 1 }, (_, i) => i);
    const blind = world([big.map((i) => A(`a/${i}.ts`)), [...big.map((i) => D(`a/${i}.ts`)), ...big.map((i) => A(`b/${i}.ts`))]]);
    expect(layoutReport(blind.snapshot, blind.history).notes.unsure).toBe(RENAME_LIMIT + 1);
  });
});
