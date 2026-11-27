// The view's pure scene model (#30): layout → bodies, loop-locked motion, the slow orbits (#60), the info text.
import { describe, expect, it } from 'vitest';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { infoLines, masteryLine, planetLines, summaryText, systemLines } from '../../web/src/model/describe.js';
import { startPose, project } from '../../web/src/camera/pose.js';
import { MIN_FLY_SPEED } from '../../web/src/camera/rig.js';
import { FPS, LOOP_FRAMES, LOOP_SECONDS, ORBIT_FRAMES, ORBIT_SECONDS, REDUCED_MOTION_FRAME, TURNS, effectiveFrame, loopPhase, orbitAngle, turnAngle } from '../../web/src/model/motion.js';
import { clampPixelHeight, frameWidth, upscaleFactor } from '../../web/src/model/pixels.js';
import { mulberry32 } from '../../web/src/model/prng.js';
import { HEALTHY_LOOKS, MOON_RADIUS, MILLI_PER_RENDER_UNIT, lookOf, moonOffset, moonletPosition, planetCentre, planetReach, systemModel } from '../../web/src/model/system.js';
import { miniFog, miniLayout } from '../fixtures/contract/mini.js';
import { selfLike, selfLikeRoots } from '../fixtures/overview.js';

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

  it('places planets at their frame-0 angle (phaseMilliturn)', () => {
    const [x, , z] = planetCentre(m.planets[1]!, 0); // web: 250 milliturns, a quarter turn
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-5.4, 9);
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
  it('runs 48 s at 30 fps and closes the loop exactly (#174: twice the old 24 s loop)', () => {
    expect(LOOP_SECONDS).toBe(48);
    expect(LOOP_FRAMES).toBe(1440);
    expect(loopPhase(0)).toBe(0);
    expect(loopPhase(LOOP_FRAMES)).toBe(0);
    expect(loopPhase(-1)).toBeCloseTo(1439 / 1440, 12);
    for (const turns of Object.values(TURNS)) expect(Number.isInteger(turns)).toBe(true);
  });

  it('keeps every layer\'s whole turns per loop, so each runs at half its old rate: the surface turns every 24 s, clouds every 16 s, moons every 24 s, the star every 48 s (#174)', () => {
    expect(TURNS).toEqual({ surface: 2, clouds: 3, moons: 2, lava: 2, starSpin: 1, starChurn: 1 }); // unchanged, and so every ratio
    const period = (turns: number) => LOOP_SECONDS / turns; // seconds per turn
    expect([TURNS.surface, TURNS.clouds, TURNS.moons, TURNS.lava, TURNS.starSpin, TURNS.starChurn].map(period)).toEqual([24, 16, 24, 24, 48, 48]);
    // One surface turn is 24 s of frames: half a turn after 12 s, where the 24 s loop had a whole one.
    expect(turnAngle(12 * FPS, TURNS.surface)).toBeCloseTo(Math.PI, 12);
    expect(turnAngle(24 * FPS - 1, TURNS.surface)).toBeLessThan(2 * Math.PI);
    expect(turnAngle(24 * FPS, TURNS.surface)).toBeCloseTo(2 * Math.PI, 12);
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

describe('slow orbits (#60)', () => {
  const m = systemModel(miniLayout);
  /** A planet's angle round the star (counter-clockwise from +x seen from above, like phaseMilliturn). */
  const angleOf = (c: readonly number[]) => Math.atan2(-c[2]!, c[0]!);
  const turn = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  it('turns once every ORBIT_SECONDS (12 minutes, #174), a whole number of loops, so it is the only motion off the loop', () => {
    expect(ORBIT_SECONDS).toBe(720);
    expect(ORBIT_FRAMES).toBe(21_600);
    expect(ORBIT_FRAMES / LOOP_FRAMES).toBe(15); // 15 loops: every 21 600 frames the whole scene is frame 0 again
    expect(loopPhase(ORBIT_FRAMES)).toBe(0); // so every loop-locked layer is back at its start too
    expect(orbitAngle(0)).toBe(0);
    expect(orbitAngle(ORBIT_FRAMES)).toBe(0);
    expect(orbitAngle(-1)).toBeCloseTo(2 * Math.PI * (1 - 1 / ORBIT_FRAMES), 12);
    expect(orbitAngle(LOOP_FRAMES)).toBeCloseTo((2 * Math.PI) / 15, 12); // not loop-locked: one loop is 1/15 of a turn
    for (const p of m.planets) {
      expect(planetCentre(p, ORBIT_FRAMES)).toEqual(planetCentre(p, 0));
      expect(planetCentre(p, LOOP_FRAMES)).not.toEqual(planetCentre(p, 0));
      for (const moon of p.moons) expect(moonOffset(moon, ORBIT_FRAMES)).toEqual(moonOffset(moon, 0));
    }
  });

  it('is a pure function of the frame number: the same frame gives the same centre, in any order, and a fraction of a frame is the frame', () => {
    const p = m.planets[2]!;
    const a = [5400, 7, 5400].map((f) => planetCentre(p, f));
    expect(a[0]).toEqual(a[2]);
    expect(planetCentre(p, 7.9)).toEqual(a[1]);
    expect(planetCentre(systemModel(clone()).planets[2]!, 5400)).toEqual(a[0]);
  });

  it('moves every planet at one constant rate, on its own orbit, never easing', () => {
    for (const p of m.planets) {
      const at = [0, 1, 2, 3, 9000, 9001].map((f) => planetCentre(p, f));
      for (const c of at) {
        expect(Math.hypot(c[0], c[2])).toBeCloseTo(p.orbit, 9); // stays on its slot's orbit
        expect(c[1]).toBe(0);
      }
      const step = (i: number) => turn(angleOf(at[i + 1]!) - angleOf(at[i]!));
      for (const i of [1, 2, 4]) expect(step(i)).toBeCloseTo(step(0), 12);
      expect(step(0)).toBeCloseTo((2 * Math.PI) / ORBIT_FRAMES, 12); // the same angle per frame for every planet
      expect(turn(angleOf(at[0]!))).toBeCloseTo(turn(p.phase * 2 * Math.PI), 9);
    }
  });

  it('keeps every planet where it was relative to the others: the system turns as one', () => {
    const gaps = (f: number) => m.planets.slice(1).map((p) => turn(angleOf(planetCentre(p, f)) - angleOf(planetCentre(m.planets[0]!, f))));
    for (const f of [1234, 9000, ORBIT_FRAMES - 1]) gaps(f).forEach((g, i) => expect(g).toBeCloseTo(gaps(0)[i]!, 9));
  });

  it('is slow enough not to fight free flight: from the start pose no planet crosses more than 1.5% of the frame a second, and the fastest moves under the slowest flight', () => {
    for (const [name, layout] of [['mini', miniLayout], ['selfLike', selfLike], ['selfLikeRoots', selfLikeRoots]] as const) {
      const sys = systemModel(layout), start = startPose(sys);
      let share = 0, speed = 0;
      for (let f = 0; f < ORBIT_FRAMES; f += 600) {
        for (const p of sys.planets) {
          const c0 = planetCentre(p, f), c1 = planetCentre(p, f + FPS);
          speed = Math.max(speed, Math.hypot(c1[0] - c0[0], c1[2] - c0[2]));
          const a = project(start, c0), b = project(start, c1);
          if (a && b) share = Math.max(share, Math.hypot((b.x - a.x) / 2, (b.y - a.y) / 2)); // NDC spans 2 each way
        }
      }
      expect(share, `${name}: share of the frame crossed per second`).toBeLessThan(0.015);
      expect(share, `${name}: still moving`).toBeGreaterThan(0.005);
      expect(speed, `${name}: render units per second`).toBeLessThan(MIN_FLY_SPEED);
    }
  });

  it('freezes with every other layer under reduced motion', () => {
    for (const f of [537, 9000]) expect(planetCentre(m.planets[1]!, effectiveFrame(f, true))).toEqual(planetCentre(m.planets[1]!, 0));
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
    expect(planetLines(m.planets[1]!, miniFog)).toContain('uncharted: 1 of 25 files; 0 misted (read), 24 clear (understood)');
    expect(systemLines(m, miniFog)).toContain('uncharted: 2 of 37 files; 2 misted (read), 33 clear (understood)');
    expect(planetLines(m.planets[1]!)).toContain('uncharted: unknown, so every file is drawn uncharted');
    expect(infoLines(m, 1, miniFog)).toEqual(planetLines(m.planets[1]!, miniFog));
    expect(summaryText(m, null, miniFog)).toContain('uncharted: 2 of 37 files');
  });

  it('#201 (U3): a planet\'s panel shows its mastery, cleared files over its files by count, rounded down, as its fog counts them', () => {
    const docs = m.planets.find((p) => p.path === 'docs')!;
    expect(planetLines(docs, miniFog)).toContain('mastery: 66% (2 of 3 files understood)'); // 2/3, never rounded up
    expect(planetLines(m.planets.find((p) => p.path === 'src')!, miniFog)).toContain('mastery: 100% (4 of 4 files understood)');
    const none = { ...miniFog, planets: miniFog.planets.map((p) => ({ ...p, haze: p.haze + p.clear, clear: 0 })) };
    expect(planetLines(docs, none)).toContain('mastery: 0% (0 of 3 files understood)');
    expect(planetLines(docs)).toContain('mastery: unknown, so every file is drawn uncharted');
    expect(masteryLine({ fogged: 0, haze: 1, clear: 199, total: 200 })).toBe('mastery: 99% (199 of 200 files understood)');
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
