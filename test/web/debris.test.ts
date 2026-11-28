// Space debris in the view (R13, space-debris.md D1–D8), the parts that need no GPU, ported from the debris lab's pure
// checks (feature/asset-library, mockups/debris-lab/test/pure.test.mjs): the palette and its two debris-only
// exceptions, the 2 px rule, size, the four shapes, A3's three age steps, the cap, stability when an item goes, the
// loop lock, the shell every piece stays in (clear of moons, the fog sky and the corona, inside the drones' lanes,
// framed by the start pose; only on a body drawing debris)
// and the sweep. The pixels are test/render/debris.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEBRIS_AGE_STEPS, debrisAgeStep } from '../../src/core/contract/debris.js';
import { palette } from '../../src/core/palette.js';
import { DRONE_LANE_OUT, DRONE_PICK_RADIUS, homeBase, homeBody, placeDrone } from '../../web/src/drones/place.js';
import { placeShip, SHIP_FOOTPRINT, shipCorners } from '../../web/src/crew/place.js';
import { project, startPose } from '../../web/src/camera/pose.js';
import { buildShip } from '../../web/src/render/ship-spec.js';
import {
  BLINK, DEBRIS_CAP, debrisBody, fragPoses, lightOn, orbitPoint, placePiece, planDebris, qmul, quat, ranked, rotate, shellPoints, SWEEP, sweepAt, withDebrisHomes,
  type Drawable, type Piece,
} from '../../web/src/debris/place.js';
import { debrisShell } from '../../web/src/debris/shell.js';
import { debrisEntries, runningSweeps, sweepsAfter, SWEEP_FRAMES } from '../../web/src/debris/sweep.js';
import { FOG_SKY_TOP } from '../../web/src/model/fog-cloud.js';
import { FPS, LOOP_FRAMES } from '../../web/src/model/motion.js';
import { CORONA } from '../../web/src/model/star.js';
import { MOON_RADIUS, planetCentre, planetReach, systemModel } from '../../web/src/model/system.js';
import type { Vec3 } from '../../web/src/model/vec.js';
import { buildKit, CLASSES, dims, extent, FOCUS_PX, isSolid, MAX_BOUND, MIN_FEATURE_PX, sizeNorm, type SolidPart } from '../../web/src/render/debris-kits.js';
import { miniLayout } from '../fixtures/contract/mini.js';
import { selfLike, selfLikeRoots } from '../fixtures/overview.js';

const BLK_36: string[] = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/blk-36.published.json'), 'utf8')).colors;
const LINES = [1, 10, 300, 10000];
const model = systemModel(selfLikeRoots);
const mini = systemModel(miniLayout);

/** n deterministic items round `home`: classes cycle, the age steps cycle at another rate, sizes spread over the range. */
function itemsAt(home: string, n: number, prefix = home): Drawable[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `x_${prefix}-${String(i).padStart(3, '0')}`, cls: CLASSES[i % 4]!, home, lines: [12, 60, 240, 900, 3000, 9000][(i * 7 + 3) % 6]!,
    ageStep: ([0, 1, 2] as const)[(i + Math.floor(i / 4)) % 3]!, seed: (i * 2654435761 + home.length * 40503) >>> 0,
  }));
}
const one = (over: Partial<Drawable> = {}): Drawable => ({ id: 'x_one', cls: 'pr', home: mini.planets[0]!.dirId, lines: 500, ageStep: 0, seed: 7, ...over });

/** OKLab of an sRGB hex. */
function oklab(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const hexes = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(hexes) : typeof v === 'object' && v !== null ? Object.values(v).flatMap(hexes) : []);

/** The corners of a solid part's box in the piece's frame, kit units. */
function corners(p: SolidPart): Vec3[] {
  const e = extent([p]);
  const out: Vec3[] = [];
  for (const x of [e.lo[0], e.hi[0]]) for (const y of [e.lo[1], e.hi[1]]) for (const z of [e.lo[2], e.hi[2]]) out.push([x, y, z]);
  return out;
}
/** Every corner of every part's box, as drawn at loop phase `phase` (render/debris.ts's transform), relative to the home's centre. */
function drawnCorners(p: Piece, phase: number): Vec3[] {
  const poses = fragPoses(p, phase);
  return p.frags.flatMap((f, k) => {
    const pose = poses[k]!, q = qmul(quat(...pose.tumble), quat(...pose.spin));
    return p.parts.filter((part) => part.frag === f.id).flatMap(corners).map((c) => {
      const v = rotate(q, [(c[0] - f.centre[0]) * p.scale, (c[1] - f.centre[1]) * p.scale, (c[2] - f.centre[2]) * p.scale]);
      return [pose.centre[0] + v[0], pose.centre[1] + v[1], pose.centre[2] + v[2]] as Vec3;
    });
  });
}

describe('debris colours (D8, art-direction §6)', () => {
  it('takes its reds from BLK 36; only the metal greys are off it, the human\'s debris-only exception', () => {
    const all = hexes(palette.debris);
    const off = all.filter((h) => !BLK_36.includes(h));
    expect(off.sort()).toEqual([...palette.debris.metal].sort());
    expect(palette.debris.outline.bright).toBe('#d83843'); // the human kept the bright red
    expect(hexes(palette.accent.teal).some((t) => all.includes(t))).toBe(false); // teal is an event, never a piece at rest
  });

  it('keeps the grey metal at least 0.045 (OKLab) from every planet, moon and cloud colour, so a piece never melts into a planet', () => {
    const world = Object.entries(palette.world).filter(([k]) => !['space', 'stars', 'depth', 'starDisc', 'starCorona', 'gasA', 'gasB', 'halo'].includes(k)).flatMap(([, v]) => hexes(v));
    for (const g of palette.debris.metal) {
      const near = Math.min(...world.map((w) => Math.hypot(...oklab(g).map((x, i) => x - oklab(w)[i]!))));
      expect(near, g).toBeGreaterThanOrEqual(0.045);
    }
  });
});

describe('debris kits (D1, D2, D7)', () => {
  it('keeps every part at least 2 px across at the focus framing, on a body of any size', () => {
    expect(FOCUS_PX).toBeCloseTo(0.0247, 4); // the asset viewer's hero framing
    for (const cls of CLASSES) for (const lines of LINES) {
      const { parts, scale } = buildKit(cls, lines);
      for (const p of parts.filter(isSolid)) expect((dims(p)[1] * scale) / FOCUS_PX, `${cls} ${lines}`).toBeGreaterThanOrEqual(MIN_FEATURE_PX);
      // a piece's world scale is its kit scale times its home's radius, so at that home's focus it is the same px
      for (const radius of [0.15, 0.6, 1.2]) expect(placePiece(one({ cls, lines }), { radius, inner: 1, outer: 9 }).scale).toBeCloseTo(scale * radius, 12);
    }
  });

  it('draws solar panels with 2 px grid lines and cells of at least 2 px, or as plain plates', () => {
    for (const cls of CLASSES) for (const lines of LINES) {
      const { parts, scale } = buildKit(cls, lines);
      for (const p of parts) {
        if (p.shape !== 'box' || !p.panel) continue;
        const [nx, ny, lx, ly] = p.grid!;
        for (const [n, lw, len] of [[nx, lx, p.size[0]], [ny, ly, p.size[1]]] as const) {
          const px = (len * scale) / FOCUS_PX;
          expect(lw * px).toBeCloseTo(2, 9);
          if (n > 0) expect((px - (n + 1) * 2) / n).toBeGreaterThanOrEqual(2 - 1e-9);
        }
      }
    }
    expect(buildKit('agent', 10000).parts.some((p) => p.shape === 'box' && p.panel && p.grid![1] >= 1)).toBe(true);
    expect(buildKit('pr', 10000).parts.some((p) => p.shape === 'box' && p.panel && p.grid![0] >= 1)).toBe(true);
  });

  it('sizes a piece by its changed lines (D2): monotonic, over a real range', () => {
    expect([sizeNorm(0), sizeNorm(1), sizeNorm(10000), sizeNorm(1e6)]).toEqual([0, 0, 1, 1]);
    for (const cls of CLASSES) {
      const sizes = LINES.map((n) => { const b = buildKit(cls, n); return Math.max(...extent(b.parts).size) * b.scale; });
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThanOrEqual(sizes[i - 1]!);
      expect(sizes.at(-1)! / sizes[0]!).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('gives the four classes four different shapes (D1)', () => {
    const sig = CLASSES.map((c) => JSON.stringify(buildKit(c, 2000).parts.map((p) => [p.shape, p.pos, p.shape === 'box' ? p.size : p.shape === 'cyl' ? [p.r, p.r2, p.len] : []])));
    expect(new Set(sig).size).toBe(4);
  });
});

describe('ageing (D2, A3)', () => {
  it('steps at 60 and 180 days since the last commit (the contract\'s debrisAgeStep, the lab\'s AGE_STEPS)', () => {
    expect(DEBRIS_AGE_STEPS).toEqual([60, 180]);
    expect([0, 59, 60, 179, 180, 900].map(debrisAgeStep)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('reads in three steps: a bright outline and two lights, then a dim one, one light and scorch, then fragments', () => {
    const [a, b, c] = ([0, 1, 2] as const).map((ageStep) => placePiece(one({ ageStep }), debrisBody(mini, one().home)!));
    expect([a!.outline, a!.lights.filter((l) => l.alive).length, a!.scorch]).toEqual(['bright', 2, 0]);
    expect([b!.outline, b!.lights.filter((l) => l.alive).length, b!.scorch]).toEqual(['dim', 1, 0.3]);
    expect([c!.outline, c!.lights.filter((l) => l.alive).length, c!.scorch]).toEqual(['dim', 0, 0.5]);
    expect(a!.frags.every((f) => f.spread === 0 && f.spin.turns === 0) && b!.frags.every((f) => f.spread === 0)).toBe(true);
    expect(c!.frags.length).toBeGreaterThan(1);
    expect(c!.frags.every((f) => f.spread > 0 && f.spin.turns !== 0)).toBe(true);
    expect([a!.outlineFrags.length, c!.outlineFrags.length]).toEqual([a!.frags.length, 1]); // broken: the biggest fragment only
  });

  it('blinks its lights a whole number of times a loop, each piece on its own phase', () => {
    expect(Number.isInteger(BLINK.perLoop)).toBe(true);
    const lights = (['x_a', 'x_b', 'x_c', 'x_d'] as const).flatMap((id, k) => placePiece(one({ id, seed: 100 + k }), debrisBody(mini, one().home)!).lights);
    for (const l of lights) for (let k = 0; k < 96; k++) expect(lightOn(l, k / 96)).toBe(lightOn(l, k / 96 + 1));
    expect(new Set(lights.map((l) => l.off.toFixed(4))).size).toBe(lights.length);
    expect(lights.some((l) => Array.from({ length: 96 }, (_, k) => lightOn(l, k / 96)).some((on, k, all) => on !== all[0]))).toBe(true); // they do blink
  });
});

describe('the plan (D5)', () => {
  it('is deterministic, draws each body\'s 12 biggest first and counts the rest, and counts items with no body here', () => {
    const items = [...itemsAt(model.planets[0]!.dirId, 30), ...itemsAt('star', 3), ...itemsAt('d_ffffffffffff', 2)];
    const plan = planDebris(model, items);
    expect(planDebris(model, items)).toEqual(plan);
    const first = plan.pieces.filter((p) => p.home === model.planets[0]!.dirId);
    expect(first.map((p) => p.id)).toEqual(ranked(items.filter((it) => it.home === model.planets[0]!.dirId)).slice(0, DEBRIS_CAP).map((it) => it.id));
    expect(plan.overflow.get(model.planets[0]!.dirId)).toBe(30 - DEBRIS_CAP);
    expect(plan.pieces.filter((p) => p.home === 'star')).toHaveLength(3);
    expect(plan.unplaced).toBe(2);
    expect(planDebris(model, []).pieces).toEqual([]);
  });

  it('never moves a piece when another item comes or goes', () => {
    const items = itemsAt(model.planets[2]!.dirId, 8);
    const all = planDebris(model, items).pieces;
    const fewer = planDebris(model, items.filter((it) => it.id !== items[2]!.id)).pieces;
    expect(fewer).toHaveLength(7);
    for (const p of fewer) expect(p).toEqual(all.find((q) => q.id === p.id));
  });

  it('is loop-locked: whole turns, and one loop on is frame 0 (D7)', () => {
    for (const p of planDebris(model, itemsAt(model.planets[1]!.dirId, 12)).pieces) {
      expect(Number.isInteger(p.tumble.turns) && p.tumble.turns !== 0).toBe(true);
      for (const f of p.frags) expect(Number.isInteger(f.spin.turns)).toBe(true);
      const a = fragPoses(p, 0), b = fragPoses(p, LOOP_FRAMES / LOOP_FRAMES);
      a.forEach((x, i) => {
        x.centre.forEach((n, j) => expect(n).toBeCloseTo(b[i]!.centre[j]!, 9));
        for (const k of ['tumble', 'spin'] as const) {
          const d = Math.abs((x[k][1] - b[i]![k][1]) / (2 * Math.PI)) % 1;
          expect(Math.min(d, 1 - d)).toBeLessThan(1e-9);
        }
      });
    }
  });
});

describe('the debris shell (R13: clear of moons, the fog sky and the corona; inside the drones\' lanes)', () => {
  const bodies = [...model.planets.map((p) => p.dirId), 'star', ...mini.planets.map((p) => p.dirId)];
  const modelOf = (home: string) => (mini.planets.some((p) => p.dirId === home) ? mini : model);

  it('starts past everything a body draws: its moons, its fog sky\'s top, the star\'s moonlets and corona', () => {
    for (const home of bodies) {
      const m = modelOf(home), base = homeBase(m, home, 0)!, shell = debrisBody(m, home)!;
      expect(shell.inner).toBeGreaterThan(base.reach);
      if (home === 'star') expect(shell.inner).toBeGreaterThan(m.star.radius * CORONA.reach);
      else {
        const p = m.planets.find((x) => x.dirId === home)!;
        expect(shell.inner).toBeGreaterThan(p.radius * FOG_SKY_TOP);
        for (const moon of p.moons) expect(shell.inner).toBeGreaterThan(moon.orbit + MOON_RADIUS);
      }
    }
  });

  it('holds every corner of every piece, whole or broken, of every size and class, on every body, all loop long', () => {
    for (const home of bodies) {
      const m = modelOf(home), shell = debrisBody(m, home)!;
      const items = [...itemsAt(home, 6), ...CLASSES.map((cls, k) => ({ ...one({ id: `x_big-${cls}`, cls, home, lines: 1e5, ageStep: 2, seed: 900 + k }) }))];
      for (const it of items) {
        const p = placePiece(it, shell);
        for (let k = 0; k < 24; k++) for (const c of drawnCorners(p, k / 24)) {
          const d = Math.hypot(...c);
          expect(d, `${home} ${it.id}`).toBeGreaterThanOrEqual(shell.inner - 1e-9);
          expect(d, `${home} ${it.id}`).toBeLessThanOrEqual(shell.outer + 1e-9);
        }
      }
    }
  });

  it("is sized for the biggest piece, and only a body drawing debris has one: its drones and the ship clear it", () => {
    expect(MAX_BOUND).toBeGreaterThan(0.3);
    expect(MAX_BOUND).toBeLessThan(0.6);
    for (const home of bodies) {
      const m0 = modelOf(home), base = homeBase(m0, home, 0)!;
      expect(homeBody(m0, home, 0)!.reach, `${home}: no debris, no shell`).toBe(base.reach);
      const m = withDebrisHomes(m0, [home]);
      expect(homeBody(m, home, 0)!.reach).toBe(debrisShell(base.reach, base.radius).outer);
      for (const seed of [1, 77, 4242, 0xdeadbeef]) for (const f of [0, 300, 900]) {
        const at = placeDrone(m, home, seed, f)!, c = homeBase(m, home, f)!.centre;
        expect(Math.hypot(at.centre[0] - c[0], at.centre[1] - c[1], at.centre[2] - c[2]) - DRONE_PICK_RADIUS).toBeGreaterThan(debrisBody(m, home)!.outer);
      }
    }
    // the ship stays clear of every shell drawn (crew/place.ts reads homeBody)
    for (const m0 of [model, mini]) {
      const m = withDebrisHomes(m0, ['star', ...m0.planets.map((p) => p.dirId)]), ship = placeShip(m, 0).centre;
      for (const home of m.debrisHomes!) {
        const c = home === 'star' ? [0, 0, 0] : planetCentre(m.planets.find((p) => p.dirId === home)!, 0);
        expect(Math.hypot(ship[0] - c[0]!, ship[1] - c[1]!, ship[2] - c[2]!) - SHIP_FOOTPRINT).toBeGreaterThan(debrisBody(m, home)!.outer);
      }
    }
    expect(withDebrisHomes(mini, [])).toBe(mini); // nothing drawn: the layout's own model
    expect(withDebrisHomes(mini, ['star', 'star', 'd_00000000000a']).debrisHomes).toEqual(['d_00000000000a', 'star']);
  });

  it("with debris on every body, no planet's drone lane reaches another planet or its moons (the planets orbit as one, so their gaps hold)", () => {
    for (const m0 of [model, mini, systemModel(selfLike)]) {
      const m = withDebrisHomes(m0, m0.planets.map((p) => p.dirId));
      for (const p of m.planets) {
        const lane = homeBody(m, p.dirId, 0)!.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS, c = planetCentre(p, 0);
        for (const q of m.planets) {
          if (q === p) continue;
          const d = Math.hypot(...[0, 1, 2].map((i) => c[i]! - planetCentre(q, 0)[i]!));
          expect(d - lane - planetReach(q), `${p.path}'s drones and ${q.path}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('frames every shell from the start pose (Home), with a crew or not, and is the layout\'s own pose without debris', () => {
    for (const m0 of [model, mini, systemModel(selfLike)]) {
      const m = withDebrisHomes(m0, ['star', ...m0.planets.map((p) => p.dirId)]);
      for (const spec of [null, buildShip(6)]) {
        const pose = startPose(m, [...shipCorners(m, spec), ...shellPoints(m)]);
        for (const pt of shellPoints(m)) {
          const q = project(pose, pt)!;
          expect(Math.max(Math.abs(q.x), Math.abs(q.y))).toBeLessThanOrEqual(1);
        }
      }
      expect(shellPoints(m0)).toEqual([]);
    }
  });

  it('keeps a piece on a crooked orbit of a whole turn a loop', () => {
    const p = placePiece(one(), debrisBody(mini, one().home)!);
    const at = Array.from({ length: 8 }, (_, k) => orbitPoint(p.orbit, k / 8));
    expect(new Set(at.map((v) => v[1].toFixed(6))).size).toBeGreaterThan(1); // inclined
    orbitPoint(p.orbit, 1).forEach((n, i) => expect(n).toBeCloseTo(orbitPoint(p.orbit, 0)[i]!, 9));
  });
});

describe('the sweep (D6)', () => {
  it('flashes teal, bursts and shrinks on its own clock, and is gone at 1.2 s', () => {
    expect(sweepAt(null)).toBeNull();
    expect(sweepAt(-0.1)).toBeNull();
    expect(sweepAt(0)).toMatchObject({ gone: false, flash: 1, scale: 1 });
    expect(sweepAt(SWEEP.fade)).toMatchObject({ gone: false, flash: 0 });
    expect(sweepAt(SWEEP.end)).toEqual({ gone: true });
    let last = 1;
    for (let s = 0; s < SWEEP.end; s += 0.05) {
      const x = sweepAt(s);
      if (!x || x.gone) throw new Error(`no sweep at ${s}`);
      expect(x.scale).toBeLessThanOrEqual(last + 1e-12);
      last = x.scale;
    }
    const end = sweepAt(SWEEP.end - 0.01);
    expect(end && !end.gone && end.scale).toBeLessThan(0.05);
    expect(SWEEP_FRAMES).toBe(Math.ceil(SWEEP.end * FPS));
  });

  it('sweeps a drawn item that\'s gone on the next load, where it was; keeps one running; drops it at its end; and brings one back whole', () => {
    const home = mini.planets[0]!.dirId, items = itemsAt(home, 4);
    const gone = items[1]!, next = items.filter((it) => it !== gone);
    const sweeps = sweepsAfter(mini, items, next, [], 100);
    expect(sweeps).toEqual([{ item: gone, start: 100 }]);
    const { entries } = debrisEntries(mini, next, sweeps);
    const swept = entries.find((e) => e.sweep !== null)!;
    expect(swept).toEqual({ piece: planDebris(mini, items).pieces.find((p) => p.id === gone.id), sweep: 100 }); // where it was
    expect(entries.filter((e) => e.sweep === null).map((e) => e.piece)).toEqual(planDebris(mini, next).pieces);
    expect(sweepsAfter(mini, next, next, sweeps, 110)).toEqual(sweeps); // still running
    expect(runningSweeps(sweeps, 100 + SWEEP_FRAMES)).toEqual([]); // ended: no trace
    expect(sweepsAfter(mini, next, items, sweeps, 110)).toEqual([]); // it's back
  });

  it('never sweeps an item that wasn\'t drawn: one past its body\'s cap, or with no body here', () => {
    const home = mini.planets[0]!.dirId, items = [...itemsAt(home, DEBRIS_CAP + 2), ...itemsAt('d_ffffffffffff', 1)];
    const hidden = ranked(items.filter((it) => it.home === home)).slice(DEBRIS_CAP);
    const next = items.filter((it) => !hidden.includes(it) && it.home === home);
    expect(sweepsAfter(mini, items, next, [], 5)).toEqual([]);
  });
});
