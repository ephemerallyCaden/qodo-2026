// Fog of war as cloud (art-direction §9; #224, in the planets' own weather since #228): where the cloud and
// the mist sit for a planet's files at rest and through their fronts, and that they are the asset viewer's
// weather puffs. Pure (web/src/model/fog-cloud.ts); the drawing is test/render's.
import { describe, expect, it } from 'vitest';
import { cellCover, CLOUD, CloudPlan, FOG_SKY_TOP, layerTop, MIST, SKY_SITES, type FogSky, type Puff } from '../../web/src/model/fog-cloud.js';
import { fileFogAt, levelBy, surfacePlan, type FileFogAt, type Level } from '../../web/src/model/fog.js';
import { centresOf, neighbours } from '../../web/src/model/territory.js';

/** A 256-cell planet (every scanned planet's grid) with 48 files spread like #18's continents. */
const settlements = Array.from({ length: 48 }, (_, k) => ({ fileId: `f_${String(k).padStart(3, '0')}`, cell: (k * 37 + Math.floor(k / 5) * 3) % 256 }));
const plan = surfacePlan({ cells: 256, settlements });
const sky = new CloudPlan(plan, 1234567);
const rest = (level: (k: number) => Level): FileFogAt[] => plan.fileIds.map((_, k) => fileFogAt(level(k), undefined, 0));
type LayerName = 'cloud' | 'mist';

/** Each layer's sites per file, counted here from the sites' own nearest cells (not the plan's owners). */
const nearestCell = (d: readonly number[], cells = 256) => {
  const c = centresOf(cells), l = Math.hypot(d[0]!, d[1]!, d[2]!);
  let best = -2, at = -1;
  for (let i = 0; i < cells; i++) { const v = (d[0]! * c[3 * i]! + d[1]! * c[3 * i + 1]! + d[2]! * c[3 * i + 2]!) / l; if (v > best) { best = v; at = i; } }
  return at;
};
const sitesPerFile = (layer: LayerName) => {
  const n = sky.sites(layer), c = centresOf(n), count = plan.fileIds.map(() => 0);
  for (let i = 0; i < n; i++) count[plan.territory.owner[nearestCell([c[3 * i]!, c[3 * i + 1]!, c[3 * i + 2]!])]!]!++;
  return count;
};
const PER_FILE = { cloud: sitesPerFile('cloud'), mist: sitesPerFile('mist') };
/** The share of a layer's sites the given files own. */
const siteShare = (layer: LayerName, files: (k: number) => boolean) => PER_FILE[layer].reduce((n, s, k) => n + (files(k) ? s : 0), 0) / sky.sites(layer);
const all = (s: FogSky) => [...s.cloud, ...s.teal, ...s.mist];
/** A puff's farthest reach from the planet's centre, approximately (its centre's rise plus its half height). */
const top = (p: Puff) => 1 + p.float + p.size * p.flat * (1.75 + p.lift * 0.5);

describe('the cloud over fogged files (the weather\'s cream, cover proportional, none at 100% reviewed)', () => {
  it('covers the weather\'s share of a fully fogged planet: its density, plus the files\' floors (about 0.45 on 48 files, accepted by the human)', () => {
    const s = sky.at(rest(() => 2));
    expect(s.cloudCover).toBeGreaterThanOrEqual(CLOUD.density - 1 / SKY_SITES);
    expect(s.cloudCover).toBeLessThan(CLOUD.density + 0.15);
    expect(s.mist).toEqual([]);
    expect(s.teal).toEqual([]);
  });

  it('adds up file by file: a site\'s cloud depends on its own file alone, so cover is the sum of each fogged file\'s', () => {
    const one = (k: number) => sky.at(rest((j) => (j === k ? 2 : 0))).cloudCover;
    const each = plan.fileIds.map((_, k) => one(k));
    for (const pick of [(k: number) => k < 24, (k: number) => k % 3 === 0, (k: number) => k % 7 === 2]) {
      const sum = each.reduce((t, c, k) => t + (pick(k) ? c : 0), 0);
      expect(sky.at(rest((k) => (pick(k) ? 2 : 0))).cloudCover).toBeCloseTo(sum, 10);
    }
  });

  it('never leaves a fogged file in clear sky (Rule 1): each covers at least the density of its own sites', () => {
    for (let k = 0; k < plan.fileIds.length; k++) {
      const s = sky.covers(rest((j) => (j === k ? 2 : 0)), 'cloud');
      const own = [...sky.owners('cloud')].filter((o) => o === k).length;
      const covered = s.filter((c) => c.cloud > 0).length;
      expect(covered / own, `file ${k}`).toBeGreaterThanOrEqual(CLOUD.density - 1e-9);
    }
  });

  // The human, 2026-11-25 (#228): fogged always reads cloudier than misted, so every fogged file covers at
  // least the cloud's density of its own sites and no misted file more than that of its own, on the
  // fog-levels scene's geometry (3 files on a scanned planet's 256 cells) and on many-file planets.
  it.each([[3, 256], [3, 64], [12, 256], [48, 256]] as const)('covers every fogged file at least as heavily as any misted one: at least the cloud\'s density of its own sites, %i files on %i cells', (files, cells) => {
    const own = surfacePlan({ cells, settlements: Array.from({ length: files }, (_, k) => ({ fileId: `f_${k}`, cell: (k * 37 + Math.floor(k / 5) * 3) % cells })) });
    for (const seed of [1234567, 42, 7, 99, 2024]) {
      const p = new CloudPlan(own, seed);
      const share = (layer: LayerName, k: number, level: Level) => {
        const owner = p.owners(layer), c = p.covers(own.fileIds.map((_, j) => fileFogAt(j === k ? level : 0, undefined, 0)), layer);
        const mine = [...owner].filter((o) => o === k).length;
        return { mine, covered: c.filter((x, i) => owner[i] === k && (layer === 'cloud' ? x.cloud : x.mist) > 0).length };
      };
      for (let k = 0; k < files; k++) {
        const fogged = share('cloud', k, 2), misted = share('mist', k, 1);
        expect(fogged.covered / fogged.mine, `seed ${seed}, file ${k} fogged`).toBeGreaterThanOrEqual(CLOUD.density - 1e-9);
        expect(misted.covered / misted.mine, `seed ${seed}, file ${k} misted`).toBeLessThanOrEqual(CLOUD.density + 1e-9);
      }
    }
  });

  it.each([12, 24, 36])('tracks the fogged share of the sites and of the cells with %i of 48 files fogged', (fogged) => {
    const cellShare = (files: (k: number) => boolean) => [...plan.territory.owner].filter((k) => files(k)).length / 256;
    for (const pick of [(k: number) => k < fogged, (k: number) => (k * 7) % 48 < fogged]) {
      const s = sky.at(rest((k) => (pick(k) ? 2 : 0)));
      // at least the density of every fogged file's own sites (the floor), and the weather's peaks above it
      expect(s.cloudCover / siteShare('cloud', pick)).toBeGreaterThanOrEqual(CLOUD.density - 1e-9);
      expect(s.cloudCover / cellShare(pick)).toBeGreaterThan(CLOUD.density * 0.9);
      for (const share of [siteShare('cloud', pick), cellShare(pick)]) expect(s.cloudCover / share).toBeLessThan(CLOUD.density * 1.8);
    }
  });

  it('falls as files are reviewed, and a fully reviewed planet has no cloud at all', () => {
    const covers = [48, 36, 24, 12, 0].map((n) => sky.at(rest((k) => (k < n ? 2 : 0))).cloudCover);
    for (let i = 1; i < covers.length; i++) expect(covers[i]!).toBeLessThan(covers[i - 1]!);
    expect(all(sky.at(rest(() => 0)))).toEqual([]);
  });

  it('draws every file fogged with no usable fog view (Rule 1), exactly as when all are fogged', () => {
    const none = levelBy(null);
    expect(sky.at(plan.fileIds.map((id) => fileFogAt(none(id), undefined, 0)))).toEqual(sky.at(rest(() => 2)));
  });

  it('sits over its own files, locked to the ground: the puffs lie over fogged files\' cells', () => {
    const fogged = (k: number) => k % 3 === 0;
    const s = sky.at(rest((k) => (fogged(k) ? 2 : 0)));
    const onFogged = s.cloud.filter((p) => fogged(plan.territory.owner[nearestCell(p.dir)]!)).length;
    expect(onFogged / s.cloud.length, 'puffs over fogged ground (satellites may lean over an edge; every third file is fogged, so edges are everywhere)').toBeGreaterThan(0.85);
  });

  it('is the viewer\'s cream weather: its small puffs (0.058–0.108 R leads), float, squash and dome heights, with lumpy edges and domed cores', () => {
    const s = sky.at(rest(() => 2));
    for (const p of s.cloud) {
      expect(p.float).toBe(0.055);
      expect(p.flat).toBe(0.6);
      expect(p.stretch).toBe(1);
      expect(p.size).toBeGreaterThanOrEqual(0.058 * 0.5 - 1e-9); // the smallest satellite of the smallest lead
      expect(p.size).toBeLessThanOrEqual(0.108 + 1e-9);
    }
    const lifts = s.cloud.map((p) => p.lift);
    expect(Math.max(...lifts), 'a mass\'s core domes (viewer.js: lift 0.2 at an edge, up to 1.1 at a full core)').toBeGreaterThan(0.75);
    expect(lifts.filter((l) => l < 0.3).length, 'its edges are low, small puffs').toBeGreaterThan(0);
    // satellites: more puffs than covered sites, an edge site's lead carrying 2–3 and a core's 1
    const sites = s.cloudCover * sky.sites('cloud');
    expect(s.cloud.length / sites).toBeGreaterThan(2);
    expect(s.cloud.length / sites).toBeLessThan(4);
  });

  it('gathers each file\'s gap into clear sky between masses, not scattered holes: a gap site\'s neighbours are mostly gap too', () => {
    const n = sky.sites('cloud'), nb = neighbours(n);
    const open = sky.covers(rest(() => 2), 'cloud').map((c) => c.cloud <= 0);
    const gaps = open.flatMap((o, i) => (o ? [i] : []));
    const together = gaps.reduce((t, i) => t + nb[i]!.filter((q) => open[q]).length / nb[i]!.length, 0) / gaps.length;
    expect(together, 'random gaps would give about the open share, 1 - cover').toBeGreaterThan(gaps.length / n + 0.1);
  });

  it('shades each mass as one dome, and a heavy cover as several masses, not one dome round the planet', () => {
    const s = sky.at(rest(() => 2));
    for (const p of s.cloud) {
      expect(p.anchor).not.toBeNull();
      expect(Math.hypot(...p.anchor!)).toBeLessThan(1 + CLOUD.float);
    }
    expect(new Set(s.cloud.map((p) => p.anchor!.join())).size).toBeGreaterThan(4);
  });

  it('is deterministic, and seeded by the planet: another seed moves the weather, and its cover still tracks the fogged share', () => {
    const at = rest((k) => (k % 2 ? 2 : 1));
    expect(new CloudPlan(plan, 1234567).at(at)).toEqual(sky.at(at));
    const other = new CloudPlan(plan, 42).at(at);
    expect(other.cloud.map((p) => p.dir)).not.toEqual(sky.at(at).cloud.map((p) => p.dir));
    const share = siteShare('cloud', (k) => k % 2 === 1);
    for (const s of [other, sky.at(at)]) {
      expect(s.cloudCover / share).toBeGreaterThan(CLOUD.density * 0.6);
      expect(s.cloudCover / share).toBeLessThan(CLOUD.density * 1.6);
    }
  });

  it('reaches no farther than FOG_SKY_TOP, the drones\' clearance (drones/place.ts)', () => {
    expect(FOG_SKY_TOP).toBe(Math.max(layerTop(CLOUD), layerTop(MIST)));
    expect(Math.max(...sky.at(rest(() => 2)).cloud.map(top))).toBeLessThanOrEqual(FOG_SKY_TOP + 0.01);
  });
});

describe('the mist over misted files (stored haze: read, not yet tested): the thin weather', () => {
  it('is the viewer\'s thin weather on its own finer grid: smaller, lower puffs, thinner cover than the cloud, never dark', () => {
    expect(sky.sites('cloud')).toBe(SKY_SITES);
    expect(sky.sites('mist')).toBe(Math.round(SKY_SITES / MIST.size ** 2)); // viewer.js rebuild: 1500 / size²
    const misted = sky.at(rest(() => 1)), fogged = sky.at(rest(() => 2));
    expect(misted.cloud).toEqual([]);
    expect(misted.teal).toEqual([]);
    // the weather's cut at the mist's density, less what the ceiling trims off misted files on a noise peak
    expect(misted.mistCover).toBeLessThanOrEqual(MIST.density + 1 / sky.sites('mist'));
    expect(misted.mistCover).toBeGreaterThan(MIST.density * 0.8);
    expect(misted.mistCover).toBeLessThan(fogged.cloudCover);
    expect(Math.max(...misted.mist.map((p) => p.size)), 'the thin weather\'s leads: 0.7 × 0.058–0.108 R').toBeLessThanOrEqual(0.108 * MIST.size + 1e-9);
    expect(Math.min(...misted.mist.map((p) => p.size))).toBeGreaterThanOrEqual(0.058 * MIST.size * 0.5 - 1e-9);
    expect(Math.max(...misted.mist.map(top))).toBeLessThan(Math.max(...fogged.cloud.map(top)));
    for (const p of misted.mist) expect(p.float).toBe(MIST.float);
  });

  it('lies only over misted files, beside the cloud over fogged ones', () => {
    const s = sky.at(rest((k) => (k < 24 ? 2 : 1)));
    expect(s.cloudCover).toBeCloseTo(sky.at(rest((k) => (k < 24 ? 2 : 0))).cloudCover, 10);
    expect(s.mistCover).toBeCloseTo(sky.at(rest((k) => (k < 24 ? 0 : 1))).mistCover, 10);
    const owner = sky.owners('mist'), covers = sky.covers(rest((k) => (k < 24 ? 2 : 1)), 'mist');
    expect(covers.every((c, i) => c.mist <= 0 || owner[i]! >= 24)).toBe(true);
  });
});

describe('fronts (F5 clear, F6 refog), between any two levels', () => {
  const one = 7; // the file whose fog changes
  const others = (k: number): Level => (k === one ? 0 : k % 2 ? 2 : 0);
  const during = (from: Level, level: Level, kind: 1 | 2, progress: number) =>
    sky.at(plan.fileIds.map((_, k) => (k === one ? { level, from, kind, progress } : fileFogAt(others(k), undefined, 0))));
  const count = (s: FogSky, layer: 'cloud' | 'teal' | 'mist') => s[layer].length;

  it('a chart (fogged → misted): the file\'s cloud turns teal and shrinks away out from its anchor, leaving mist behind', () => {
    const steps = [0, 0.25, 0.5, 0.75, 0.99].map((u) => during(2, 1, 1, u));
    const base = sky.at(rest(others));
    expect(count(steps[0]!, 'teal')).toBeGreaterThan(0);
    expect(steps[0]!.cloud.length, 'at the start, the rest of the cloud is untouched').toBe(base.cloud.length);
    const tealSites = (s: number) => sky.covers(plan.fileIds.map((_, k) => (k === one ? { level: 1, from: 2, kind: 1, progress: s } : fileFogAt(others(k), undefined, 0))), 'cloud').filter((c) => c.teal).length;
    for (let i = 1; i < steps.length; i++) expect(tealSites([0, 0.25, 0.5, 0.75, 0.99][i]!)).toBeLessThanOrEqual(tealSites([0, 0.25, 0.5, 0.75, 0.99][i - 1]!));
    expect(count(steps.at(-1)!, 'teal')).toBe(0);
    expect(count(steps.at(-1)!, 'mist')).toBe(sky.at(plan.fileIds.map((_, k) => fileFogAt(k === one ? 1 : others(k), undefined, 0))).mist.length);
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
    const n = sky.sites('cloud'), c = centresOf(n), ca = centresOf(256), a = plan.territory.anchor[one]!, owner = sky.owners('cloud');
    const fromAnchor = (i: number) => Math.acos(Math.min(1, c[3 * i]! * ca[3 * a]! + c[3 * i + 1]! * ca[3 * a + 1]! + c[3 * i + 2]! * ca[3 * a + 2]!));
    const sites = [...owner].map((k, i) => (k === one ? i : -1)).filter((i) => i >= 0);
    const coveredAt = (u: number) => sky.covers(plan.fileIds.map((_, k) => (k === one ? { level: 2, from: 0, kind: 2, progress: u } : fileFogAt(0, undefined, 0))), 'cloud');
    const early = coveredAt(0.4), late = coveredAt(0.9);
    const inEarly = sites.filter((i) => early[i]!.cloud > 0), inLate = sites.filter((i) => late[i]!.cloud > 0);
    expect(inEarly.length).toBeGreaterThan(0);
    expect(inLate.length).toBeGreaterThan(inEarly.length);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + fromAnchor(x), 0) / xs.length;
    expect(mean(inEarly), 'the first cloud in is far from the anchor').toBeGreaterThan(mean(sites));
  });

  it('mist clearing (a quiz passed) fades site by site: the file\'s mist only thins, and is gone at the end', () => {
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((u) => during(1, 0, 1, u).mist.length);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThanOrEqual(steps[i - 1]! + 3); // a thinning site can lose its edge and gain satellites
    expect(steps[0]!).toBeGreaterThan(steps.at(-1)!);
    expect(steps.at(-1)!).toBe(sky.at(rest(others)).mist.length);
  });

  it('starts every front exactly at the level it came from and ends it exactly at the new one: no jump at either end (Qodo 0d9f4eaa)', () => {
    const weights = (at: FileFogAt[]) => (['cloud', 'mist'] as const).map((l) => sky.covers(at, l).map((c) => [c.cloud, c.mist]));
    const restAt = (l: Level) => weights(plan.fileIds.map((_, k) => fileFogAt(k === one ? l : others(k), undefined, 0)));
    const at = (from: Level, level: Level, kind: 1 | 2, progress: number) =>
      weights(plan.fileIds.map((_, k) => (k === one ? { level, from, kind, progress } : fileFogAt(others(k), undefined, 0))));
    for (const [from, level, kind] of [[2, 1, 1], [2, 0, 1], [1, 0, 1], [0, 1, 2], [0, 2, 2], [1, 2, 2]] as const) {
      expect(at(from, level, kind, 0), `${from} → ${level}: the first frame is the old level`).toEqual(restAt(from));
      expect(at(from, level, kind, 1), `${from} → ${level}: the last is the new one`).toEqual(restAt(level));
    }
  });

  it('cellCover: a front between two levels keeps the level it came from ahead of it and the new one behind', () => {
    const clear = { level: 1, from: 2, kind: 1, progress: 0.5 } as const;
    expect(cellCover(clear, 0.01, 1, 0)).toEqual({ cloud: 0, mist: 1, teal: false }); // behind the front: mist
    expect(cellCover(clear, 0.99, 1, 0)).toEqual({ cloud: 1, mist: 0, teal: true }); // ahead: the cloud, in teal
    const refog = { level: 2, from: 0, kind: 2, progress: 0.5 } as const;
    expect(cellCover(refog, 0.99, 1, 0)).toEqual({ cloud: 1, mist: 0, teal: false }); // the far edge: rolled in
    expect(cellCover(refog, 0.01, 1, 0)).toEqual({ cloud: 0, mist: 0, teal: false }); // the anchor: still clear
    expect(cellCover({ level: 0, from: 0, kind: 0, progress: 0 }, 0.5, 1, 0.5)).toEqual({ cloud: 0, mist: 0, teal: false });
  });
});

describe('grids', () => {
  it('covers a coarser grid\'s cells too: a test fixture\'s 2, 16 or 64 cells share the same sites and puffs as 256', () => {
    for (const cells of [2, 16, 64]) {
      const coarse = surfacePlan({ cells, settlements: [{ fileId: 'f_1', cell: 0 }, { fileId: 'f_2', cell: cells - 1 }] });
      const p = new CloudPlan(coarse, 1);
      expect(p.sites('cloud')).toBe(SKY_SITES);
      const both = p.at([fileFogAt(2, undefined, 0), fileFogAt(2, undefined, 0)]);
      expect(both.cloudCover, `${cells} cells, both fogged: the density, plus the files' floors`).toBeGreaterThanOrEqual(CLOUD.density - 1 / SKY_SITES);
      expect(both.cloudCover, `${cells} cells, both fogged`).toBeLessThan(CLOUD.density + 0.15);
      const one = p.at([fileFogAt(2, undefined, 0), fileFogAt(0, undefined, 0)]);
      expect(one.cloudCover / CLOUD.density, `${cells} cells, one fogged: about its share`).toBeGreaterThan(0.25);
      expect(one.cloudCover / CLOUD.density, `${cells} cells, one fogged`).toBeLessThan(0.75);
      expect(Math.max(...both.cloud.map((x) => x.size)), 'the same puff sizes as on 256 cells').toBeLessThanOrEqual(0.108 + 1e-9);
    }
  });

  it('draws a planet whose settlements are all off its grid at its foggiest file\'s level (Rule 1)', () => {
    const off = surfacePlan({ cells: 64, settlements: [{ fileId: 'f_1', cell: 99_999 }, { fileId: 'f_2', cell: -3 }] });
    const p = new CloudPlan(off, 1);
    expect(p.at([fileFogAt(2, undefined, 0), fileFogAt(2, undefined, 0)]).cloudCover).toBeCloseTo(CLOUD.density, 2);
    expect(p.at([fileFogAt(0, undefined, 0), fileFogAt(1, undefined, 0)]).cloud).toEqual([]);
    expect(p.at([fileFogAt(0, undefined, 0), fileFogAt(1, undefined, 0)]).mistCover).toBeGreaterThan(0);
    expect(all(p.at([fileFogAt(0, undefined, 0), fileFogAt(0, undefined, 0)]))).toEqual([]);
  });
});
