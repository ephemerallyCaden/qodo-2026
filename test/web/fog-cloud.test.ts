// Fog of war as cloud (#224, art-direction §9 C6): where the storm cloud and the mist sit for a planet's
// files at rest and through their fronts. Pure (web/src/model/fog-cloud.ts); the drawing is test/render's.
import { describe, expect, it } from 'vitest';
import { cellCover, CloudPlan, MIST, SKY_SITES, STORM, type FogSky } from '../../web/src/model/fog-cloud.js';
import { fileFogAt, levelBy, surfacePlan, type FileFogAt, type Level } from '../../web/src/model/fog.js';
import { centresOf } from '../../web/src/model/territory.js';

/** A 256-cell planet (every scanned planet's grid) with 48 files spread like #18's continents. */
const settlements = Array.from({ length: 48 }, (_, k) => ({ fileId: `f_${String(k).padStart(3, '0')}`, cell: (k * 37 + Math.floor(k / 5) * 3) % 256 }));
const plan = surfacePlan({ cells: 256, settlements });
const sky = new CloudPlan(plan, 1234567);
const rest = (level: (k: number) => Level): FileFogAt[] => plan.fileIds.map((_, k) => fileFogAt(level(k), undefined, 0));
/** The share of the grid's cells the given files own. */
const cellShare = (files: (k: number) => boolean) => [...plan.territory.owner].filter((k) => files(k)).length / 256;
/** What one layer leaves covered of the given files' cells: their cells less each file's gap, exactly. */
const covered = (files: (k: number) => boolean, density: number) =>
  plan.fileIds.reduce((n, _, k) => n + (files(k) ? plan.territory.size[k]! - Math.round(plan.territory.size[k]! * (1 - density)) : 0), 0) / 256;
const all = (s: FogSky) => [...s.storm, ...s.teal, ...s.mist];

describe('the storm cloud over fogged files (C6: cover 0.9 of the fogged cells, none at 100% discovered)', () => {
  it.each([0, 12, 24, 36, 48])('covers 0.9 of the fogged share of the cells with %i of 48 files fogged, and no mist or teal at rest', (fogged) => {
    const isFogged = (k: number) => k < fogged;
    const s = sky.at(rest((k) => (isFogged(k) ? 2 : 0)));
    expect(s.stormCover).toBeCloseTo(covered(isFogged, STORM.density), 10);
    // within the territory rule's rounding: a 5-cell territory keeps 1 cell open, a 4-cell one none
    if (fogged > 0) expect(s.stormCover / cellShare(isFogged)).toBeGreaterThan(0.8);
    if (fogged > 0) expect(s.stormCover / cellShare(isFogged)).toBeLessThan(0.96);
    expect(s.storm.length > 0).toBe(fogged > 0);
    expect(s.mist).toEqual([]);
    expect(s.teal).toEqual([]);
  });

  it('falls as files are discovered, and a fully discovered planet has no cloud at all', () => {
    const covers = [48, 36, 24, 12, 0].map((n) => sky.at(rest((k) => (k < n ? 2 : 0))).stormCover);
    for (let i = 1; i < covers.length; i++) expect(covers[i]!).toBeLessThan(covers[i - 1]!);
    expect(all(sky.at(rest(() => 0)))).toEqual([]);
  });

  it('draws every file fogged with no usable fog view (Rule 1), exactly as when all are fogged', () => {
    const none = levelBy(null);
    expect(sky.at(plan.fileIds.map((id) => fileFogAt(none(id), undefined, 0)))).toEqual(sky.at(rest(() => 2)));
  });

  it('sits over its own cells, locked to the ground: every puff is near a covered cell of a fogged file', () => {
    const fogged = (k: number) => k % 3 === 0;
    const s = sky.at(rest((k) => (fogged(k) ? 2 : 0)));
    const c = centresOf(256);
    const near = (d: readonly number[]) => {
      const l = Math.hypot(d[0]!, d[1]!, d[2]!);
      let best = -1, at = -1;
      for (let i = 0; i < 256; i++) { const v = (d[0]! * c[3 * i]! + d[1]! * c[3 * i + 1]! + d[2]! * c[3 * i + 2]!) / l; if (v > best) { best = v; at = i; } }
      return at;
    };
    const owners = s.storm.map((p) => plan.territory.owner[near(p.dir)]!);
    const onFogged = owners.filter((k) => fogged(k)).length;
    expect(onFogged / owners.length, 'puffs over fogged ground (satellites may lean over an edge; every third file is fogged, so edges are everywhere)').toBeGreaterThan(0.75);
  });

  it('shades each connected mass as one dome: every puff carries its mass\'s anchor, below the cloud', () => {
    const s = sky.at(rest((k) => (k < 6 ? 2 : 0)));
    for (const p of s.storm) {
      expect(p.anchor).not.toBeNull();
      expect(Math.hypot(...p.anchor!)).toBeLessThan(1 + STORM.float);
    }
  });

  it('is deterministic, and seeded by the planet: another seed moves the puffs, not the cover', () => {
    const at = rest((k) => (k % 2 ? 2 : 1));
    expect(new CloudPlan(plan, 1234567).at(at)).toEqual(sky.at(at));
    const other = new CloudPlan(plan, 42).at(at);
    expect(other.stormCover).toBe(sky.at(at).stormCover);
    expect(other.storm.map((p) => p.dir)).not.toEqual(sky.at(at).storm.map((p) => p.dir));
  });
});

describe('the mist over misted files (stored haze: read, not yet tested)', () => {
  it('is thinner, smaller and lower than the storm, never dark, and leaves the ground showing', () => {
    const misted = sky.at(rest(() => 1)), fogged = sky.at(rest(() => 2));
    expect(misted.storm).toEqual([]);
    expect(misted.teal).toEqual([]);
    expect(misted.mistCover).toBeCloseTo(covered(() => true, MIST.density), 10);
    expect(misted.mistCover).toBeLessThan(fogged.stormCover * 0.7);
    const top = (ps: FogSky['storm']) => Math.max(...ps.map((p) => p.float + p.size * p.flat * (1.75 + p.lift * 0.5)));
    expect(Math.max(...misted.mist.map((p) => p.size))).toBeLessThan(Math.min(...fogged.storm.map((p) => p.size)) * 2);
    expect(Math.max(...misted.mist.map((p) => p.size))).toBeLessThan(Math.max(...fogged.storm.map((p) => p.size)) / 2);
    expect(top(misted.mist)).toBeLessThan(top(fogged.storm) / 2);
  });

  it('lies only over misted files, beside the storm over fogged ones', () => {
    const s = sky.at(rest((k) => (k < 24 ? 2 : 1)));
    expect(s.stormCover).toBeCloseTo(covered((k) => k < 24, STORM.density), 10);
    expect(s.mistCover).toBeCloseTo(covered((k) => k >= 24, MIST.density), 10);
  });
});

describe('fronts (F5 clear, F6 refog), between any two levels', () => {
  const one = 7; // the file whose fog changes
  const others = (k: number): Level => (k === one ? 0 : k % 2 ? 2 : 0);
  const during = (from: Level, level: Level, kind: 1 | 2, progress: number) =>
    sky.at(plan.fileIds.map((_, k) => (k === one ? { level, from, kind, progress } : fileFogAt(others(k), undefined, 0))));
  const ownCells = (s: FogSky, layer: 'storm' | 'teal' | 'mist') => s[layer].length;

  it('a chart (fogged → misted): the file\'s cloud turns teal and shrinks away out from its anchor, leaving mist behind', () => {
    const steps = [0, 0.25, 0.5, 0.75, 0.99].map((u) => during(2, 1, 1, u));
    const base = sky.at(rest(others));
    expect(ownCells(steps[0]!, 'teal')).toBeGreaterThan(0);
    expect(steps[0]!.storm.length, 'at the start, the rest of the storm is untouched').toBe(base.storm.length);
    for (let i = 1; i < steps.length; i++) expect(ownCells(steps[i]!, 'teal')).toBeLessThanOrEqual(ownCells(steps[i - 1]!, 'teal'));
    for (let i = 1; i < steps.length; i++) expect(ownCells(steps[i]!, 'mist')).toBeGreaterThanOrEqual(ownCells(steps[i - 1]!, 'mist'));
    expect(ownCells(steps.at(-1)!, 'teal')).toBe(0);
    expect(ownCells(steps.at(-1)!, 'mist')).toBe(sky.at(plan.fileIds.map((_, k) => fileFogAt(k === one ? 1 : others(k), undefined, 0))).mist.length);
    // teal is an event: at rest there is none, whatever the levels
    for (const l of [0, 1, 2] as const) expect(sky.at(rest(() => l)).teal).toEqual([]);
  });

  it('teal only while fogged cloud clears: never in a refog, never in mist fading', () => {
    for (const u of [0, 0.3, 0.6, 0.9]) {
      expect(during(0, 2, 2, u).teal, `refog clear → fogged at ${u}`).toEqual([]);
      expect(during(1, 2, 2, u).teal, `refog misted → fogged at ${u}`).toEqual([]);
      expect(during(0, 1, 2, u).teal, `refog clear → misted at ${u}`).toEqual([]);
      expect(during(1, 0, 1, u).teal, `quiz misted → clear at ${u}`).toEqual([]);
    }
  });

  it('a refog rolls cloud in from the territory\'s far edge, never from its anchor', () => {
    const t = plan.territory, c = centresOf(256), a = t.anchor[one]!;
    const fromAnchor = (i: number) => Math.acos(Math.min(1, c[3 * i]! * c[3 * a]! + c[3 * i + 1]! * c[3 * a + 1]! + c[3 * i + 2]! * c[3 * a + 2]!));
    const cells = [...t.owner].map((k, i) => (k === one ? i : -1)).filter((i) => i >= 0);
    const coveredAt = (u: number) => sky.covers(plan.fileIds.map((_, k) => (k === one ? { level: 2, from: 0, kind: 2, progress: u } : fileFogAt(0, undefined, 0))));
    const early = coveredAt(0.4), late = coveredAt(0.9);
    const isIn = (cover: ReturnType<typeof coveredAt>, i: number) => cover[i]!.storm > 0;
    const inEarly = cells.filter((i) => isIn(early, i)), inLate = cells.filter((i) => isIn(late, i));
    expect(inEarly.length).toBeGreaterThan(0);
    expect(inLate.length).toBeGreaterThan(inEarly.length);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + fromAnchor(x), 0) / xs.length;
    expect(mean(inEarly), 'the first cloud in is far from the anchor').toBeGreaterThan(mean(cells));
  });

  it('mist clearing (a quiz passed) fades cell by cell: the file\'s mist only thins, and is gone at the end', () => {
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((u) => during(1, 0, 1, u).mist.length);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThanOrEqual(steps[i - 1]!);
    expect(steps[0]!).toBeGreaterThan(steps.at(-1)!);
    expect(steps.at(-1)!).toBe(sky.at(rest(others)).mist.length);
  });

  it('cellCover: a front between two levels keeps the level it came from ahead of it and the new one behind', () => {
    const clear = { level: 1, from: 2, kind: 1, progress: 0.5 } as const;
    expect(cellCover(clear, 0.01, 1, 0)).toEqual({ storm: 0, mist: 1, teal: false }); // behind the front: mist
    expect(cellCover(clear, 0.99, 1, 0)).toEqual({ storm: 1, mist: 0, teal: true }); // ahead: the cloud, in teal
    const refog = { level: 2, from: 0, kind: 2, progress: 0.5 } as const;
    expect(cellCover(refog, 0.99, 1, 0)).toEqual({ storm: 1, mist: 0, teal: false }); // the far edge: rolled in
    expect(cellCover(refog, 0.01, 1, 0)).toEqual({ storm: 0, mist: 0, teal: false }); // the anchor: still clear
    expect(cellCover({ level: 0, from: 0, kind: 0, progress: 0 }, 0.5, 1, 0.5)).toEqual({ storm: 0, mist: 0, teal: false });
  });
});

describe('grids', () => {
  it('covers a coarser grid\'s cells too: a test fixture\'s 2, 16 or 64 cells get several sites each, in the same puffs as 256', () => {
    for (const cells of [2, 16, 64]) {
      const coarse = surfacePlan({ cells, settlements: [{ fileId: 'f_1', cell: 0 }, { fileId: 'f_2', cell: cells - 1 }] });
      const p = new CloudPlan(coarse, 1);
      const both = p.at([fileFogAt(2, undefined, 0), fileFogAt(2, undefined, 0)]);
      expect(both.stormCover, `${cells} cells, both fogged`).toBeCloseTo(STORM.density, 1);
      const one = p.at([fileFogAt(2, undefined, 0), fileFogAt(0, undefined, 0)]);
      expect(one.stormCover, `${cells} cells, one fogged: about its share`).toBeGreaterThan(0.25);
      expect(one.stormCover, `${cells} cells, one fogged`).toBeLessThan(0.65);
      expect(Math.max(...both.storm.map((x) => x.size)), 'the same puff sizes as on 256 cells').toBeLessThanOrEqual(STORM.size * 1.15);
    }
    expect(SKY_SITES).toBe(256);
  });

  it('draws a planet whose settlements are all off its grid at its foggiest file\'s level (Rule 1)', () => {
    const off = surfacePlan({ cells: 64, settlements: [{ fileId: 'f_1', cell: 99_999 }, { fileId: 'f_2', cell: -3 }] });
    const p = new CloudPlan(off, 1);
    expect(p.at([fileFogAt(2, undefined, 0), fileFogAt(2, undefined, 0)]).stormCover).toBeCloseTo(0.9, 1);
    expect(p.at([fileFogAt(0, undefined, 0), fileFogAt(1, undefined, 0)]).storm).toEqual([]);
    expect(p.at([fileFogAt(0, undefined, 0), fileFogAt(1, undefined, 0)]).mistCover).toBeGreaterThan(0);
    expect(all(p.at([fileFogAt(0, undefined, 0), fileFogAt(0, undefined, 0)]))).toEqual([]);
  });
});
