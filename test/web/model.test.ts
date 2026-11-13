// The view's pure scene model (#30): layout → bodies, loop-locked motion, the info text.
import { describe, expect, it } from 'vitest';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { infoLines, planetLines, summaryText, systemLines } from '../../web/src/model/describe.js';
import { LOOP_FRAMES, REDUCED_MOTION_FRAME, TURNS, effectiveFrame, loopPhase, turnAngle } from '../../web/src/model/motion.js';
import { clampPixelHeight, frameWidth, upscaleFactor } from '../../web/src/model/pixels.js';
import { mulberry32 } from '../../web/src/model/prng.js';
import { HEALTHY_LOOKS, MOON_RADIUS, MILLI_PER_RENDER_UNIT, lookOf, moonOffset, moonletPosition, planetCentre, planetReach, systemModel } from '../../web/src/model/system.js';
import { miniFog, miniLayout } from '../fixtures/contract/mini.js';

const clone = (): LayoutV1 => structuredClone(miniLayout);
const longitude = (v: [number, number, number]) => Math.atan2(v[2], v[0]);

describe('systemModel', () => {
  const m = systemModel(miniLayout);

  it('keeps every planet, in layout order, sized and placed from the layout', () => {
    expect(m.planets.map((p) => p.path)).toEqual(['src', 'web', 'docs']);
    expect(m.planets.map((p) => p.radius)).toEqual([1, 0.7, 0.5]);
    expect(m.planets.map((p) => p.orbit)).toEqual([3, 5.4, 7.8]);
    expect(miniLayout.constants.maxPlanetRadiusMilli / MILLI_PER_RENDER_UNIT).toBe(1.2);
  });

  it('shows each health band as its look (ash is the desert look)', () => {
    expect(m.planets.map((p) => p.band)).toEqual(['healthy', 'toxic', 'ash']);
    expect(m.planets.slice(1).map((p) => p.look)).toEqual(['toxic', 'desert']);
    expect(lookOf('lava', 7)).toBe('lava');
  });

  it('draws a healthy planet as lush, ocean or ice, by biomeSeed only (seeded variety, one meaning)', () => {
    expect(HEALTHY_LOOKS).toEqual(['lush', 'ocean', 'ice']);
    expect([0, 1, 2, 3].map((seed) => lookOf('healthy', seed))).toEqual(['lush', 'ocean', 'ice', 'lush']);
    expect(lookOf('healthy', -1)).toBe(HEALTHY_LOOKS[(2 ** 32 - 1) % 3]); // negative seeds read as uint32
    expect(HEALTHY_LOOKS).toContain(m.planets[0]!.look);
    for (const band of ['lava', 'toxic', 'ash'] as const) {
      expect(new Set([0, 1, 2, 3, 4, 5].map((seed) => lookOf(band, seed))).size).toBe(1); // seeds never cross a band
    }
  });

  it('counts every overflow instead of dropping it (Rule 1)', () => {
    const [src, web, docs] = m.planets;
    expect(src!.counts).toMatchObject({ moons: 1, moonOverflow: 0, settlements: 3 });
    expect(web!.counts).toMatchObject({ moons: 24, moonOverflow: 2 });
    expect(docs!.counts).toMatchObject({ surfaceOverflow: 1, debtUnknownFiles: 1, qodoUnknown: true });
    expect(m.star).toMatchObject({ moonletOverflow: 0, testData: 2 });
    expect(m.star.moonlets).toHaveLength(3);
  });

  it('is deterministic', () => {
    expect(systemModel(miniLayout)).toEqual(m);
  });

  it('keeps the star and its moonlets clear of the innermost planet', () => {
    const inner = m.planets[0]!;
    expect(m.star.radius).toBeGreaterThan(0);
    const moonlet = m.star.moonlets[0]!.orbit;
    expect(moonlet).toBeGreaterThan(m.star.radius);
    expect(moonlet).toBeLessThan(inner.orbit - 1.2); // inside any planet that could fill slot 0
  });

  it('puts every moon outside its planet and spreads them round it', () => {
    for (const p of m.planets) for (const moon of p.moons) expect(moon.orbit - MOON_RADIUS).toBeGreaterThan(p.radius);
    const lons = m.planets[1]!.moons.map((moon) => longitude(moonOffset(moon, 0))).sort((a, b) => a - b);
    const gaps = lons.slice(1).map((x, i) => x - lons[i]!);
    expect(Math.max(...gaps)).toBeLessThan(Math.PI / 2); // no quarter of the sky empty, no single stack
    expect(new Set(lons.map((x) => x.toFixed(3))).size).toBe(24);
  });

  it('appending a moon or a moonlet never moves the others (append-only slots)', () => {
    const more = clone();
    more.planets[0]!.moons.push({ fileId: 'f_0000000000ff', testOf: 'f_00000000000a', slot: 1 });
    more.star.moonlets.push({ fileId: 'f_0000000000fe', kind: 'root-file', slot: 3 });
    const m2 = systemModel(more);
    expect(m2.planets[0]!.moons[0]).toEqual(m.planets[0]!.moons[0]);
    expect(m2.star.moonlets.slice(0, 3)).toEqual(m.star.moonlets);
    expect(m2.planets[1]).toEqual(m.planets[1]);
  });

  it('places planets at their frame-0 angle (phaseMilliturn) and keeps them there', () => {
    const [x, , z] = planetCentre(m.planets[1]!, 0); // web: 250 milliturns, a quarter turn
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-5.4, 9);
    expect(TURNS.orbits).toBe(0);
    expect(planetCentre(m.planets[1]!, 360)).toEqual(planetCentre(m.planets[1]!, 0));
  });

  it("reaches as far as a planet's moons, or its cloud tops", () => {
    expect(planetReach(m.planets[2]!)).toBeCloseTo(0.5 * 1.15, 12); // docs: no moons
    expect(planetReach(m.planets[1]!)).toBeGreaterThan(0.7 * 2.4);
    expect(m.extent).toBeGreaterThanOrEqual(7.8 + 0.5);
  });

  it('draws the star alone for an empty system', () => {
    const empty = systemModel({ ...clone(), planets: [], star: { ...miniLayout.star, moonlets: [] } });
    expect(empty.planets).toEqual([]);
    expect(empty.star.radius).toBeGreaterThan(0);
    expect(empty.extent).toBe(empty.star.radius);
  });
});

describe('loop-locked motion', () => {
  it('runs 24 s at 30 fps and closes the loop exactly', () => {
    expect(LOOP_FRAMES).toBe(720);
    expect(loopPhase(0)).toBe(0);
    expect(loopPhase(LOOP_FRAMES)).toBe(0);
    expect(loopPhase(-1)).toBeCloseTo(719 / 720, 12);
    for (const turns of Object.values(TURNS)) expect(Number.isInteger(turns)).toBe(true);
  });

  it('turns at a constant rate (no easing)', () => {
    const steps = [0, 1, 2, 3, 100, 101].map((f) => turnAngle(f, TURNS.surface));
    expect(steps[1]! - steps[0]!).toBeCloseTo(steps[3]! - steps[2]!, 12);
    expect(steps[5]! - steps[4]!).toBeCloseTo(steps[1]! - steps[0]!, 12);
  });

  it('puts every moon and moonlet back where it started after one loop', () => {
    const m = systemModel(miniLayout);
    const moon = m.planets[1]!.moons[5]!;
    expect(moonOffset(moon, LOOP_FRAMES)).toEqual(moonOffset(moon, 0));
    expect(moonletPosition(m.star.moonlets[2]!, LOOP_FRAMES)).toEqual(moonletPosition(m.star.moonlets[2]!, 0));
    expect(moonOffset(moon, 90)).not.toEqual(moonOffset(moon, 0));
  });

  it('freezes on one frame under reduced motion', () => {
    expect(effectiveFrame(537, true)).toBe(REDUCED_MOTION_FRAME);
    expect(effectiveFrame(537, false)).toBe(537);
    expect(effectiveFrame(5.7, false)).toBe(5);
  });
});

describe('pixel sizing', () => {
  it('clamps the internal height to 120..480 and keeps 16:9', () => {
    expect(clampPixelHeight(undefined)).toBe(180);
    expect(clampPixelHeight(Number.NaN)).toBe(180);
    expect(clampPixelHeight(50)).toBe(120);
    expect(clampPixelHeight(9999)).toBe(480);
    expect(clampPixelHeight(240.4)).toBe(240);
    expect(frameWidth(180)).toBe(320);
    expect(frameWidth(240)).toBe(426);
  });

  it('upscales by the largest whole factor that fits, at least 1', () => {
    expect(upscaleFactor(320, 180, 1280, 720)).toBe(4);
    expect(upscaleFactor(320, 180, 1279, 720)).toBe(3);
    expect(upscaleFactor(320, 180, 100, 100)).toBe(1);
    expect(upscaleFactor(426, 240, 2560, 1440)).toBe(6);
  });
});

describe('seeded PRNG', () => {
  it('repeats per seed and differs across seeds', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const seq = (g: () => number) => Array.from({ length: 5 }, g);
    const sa = seq(a);
    expect(seq(b)).toEqual(sa);
    expect(seq(c)).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe('info text', () => {
  const m = systemModel(miniLayout);

  it('shows every capped count as not drawn', () => {
    expect(planetLines(m.planets[1]!)).toContain('24 test moons (+2 not drawn)');
    expect(planetLines(m.planets[1]!)).toContain('toxic: 9 debt markers per 1k lines');
    expect(planetLines(m.planets[2]!)).toContain('2 files on the surface (+1 unplaced)');
  });

  it('says what is unknown instead of implying zero (Rule 1)', () => {
    expect(planetLines(m.planets[2]!)).toContain('debt unknown in 1 file');
    expect(planetLines(m.planets[0]!)).toContain('qodo findings unknown');
  });

  it('describes the system when nothing is focused, and the star alone when empty', () => {
    expect(infoLines(m, null)).toEqual(systemLines(m));
    expect(infoLines(m, 0)[0]).toBe('src');
    expect(systemLines(m)[0]).toBe('3 planets');
    expect(systemLines(m)).toContain('2 test data files (ride with the tests, not drawn)');
    const empty = systemModel({ ...clone(), planets: [], star: { ...miniLayout.star, moonlets: [], testData: 0 } });
    expect(systemLines(empty)).toEqual(['no planets yet: just the star', 'uncharted: unknown, so every file is drawn uncharted']);
  });

  it('counts uncharted files from the fog view, unplaced files and moons included, and says when it is unknown (F2, Rule 1)', () => {
    expect(planetLines(m.planets[1]!, miniFog)).toContain('uncharted: 1 of 25 files');
    expect(systemLines(m, miniFog)).toContain('uncharted: 2 of 37 files');
    expect(planetLines(m.planets[1]!)).toContain('uncharted: unknown, so every file is drawn uncharted');
    expect(infoLines(m, 1, miniFog)).toEqual(planetLines(m.planets[1]!, miniFog));
    expect(summaryText(m, null, miniFog)).toContain('uncharted: 2 of 37 files');
  });

  it('gives screen readers everything the canvas shows: the info panel and every planet name', () => {
    expect(summaryText(m, null)).toBe(`${systemLines(m).join('. ')}. planets: src, web, docs`);
    expect(summaryText(m, 1)).toContain('24 test moons (+2 not drawn)');
  });

  it('never shows a per-person figure or a score (Rule 6)', () => {
    const text = [...systemLines(m, miniFog), ...m.planets.flatMap((p) => planetLines(p, miniFog))].join('\n');
    expect(text).not.toMatch(/score|points|xp|streak|rank|level/i);
  });
});
