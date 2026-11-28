// Where each piece of debris is and how it moves (R13, space-debris.md D1–D7), as a pure function of (layout,
// items, frame): no clock, no random (AGENTS.md Rule 3), no three.js. Ported from the asset viewer's A3 layout
// (feature/asset-library, mockups/asset-viewer/debris-layout.js), on the product's 48 s loop at the lab's
// per-loop counts (#174): one orbit per loop, one or two tumbles, eight blinks.
//
// An item is one stale branch (or PR) with its home body. Each body draws its biggest DEBRIS_CAP items, biggest
// first, and counts the rest (D5, Rule 1). A piece's every choice (orbit, tumble, how a broken one falls apart, its
// lights' phases) comes from a PRNG seeded by the item's own served seed, so adding or removing an item never moves
// another piece. Pieces drift in their body's debris shell (shell.ts), outside its moons, fog sky and corona and
// inside its drones' lanes, scaled by its radius (a piece is the same size against any planet in focus).
import type { DebrisClass, DebrisPiece } from '../../../src/core/contract/debris.js';
import { biggestFrag, buildKit, extent, fragCentre, fragIds, isSolid, MAX_SPREAD, pieceBound, type LightPart, type SolidPart } from '../render/debris-kits.js';
import { homeBase } from '../drones/place.js';
import { loopPhase } from '../model/motion.js';
import { mulberry32 } from '../model/prng.js';
import type { SystemModel } from '../model/system.js';
import type { Vec3 } from '../model/vec.js';
import { DEBRIS_SHELL, debrisShell } from './shell.js';

/** How worn a piece looks (D2): 0 intact, 1 weathered, 2 broken (the contract's `debrisAgeStep`, 60 and 180 days). */
export type AgeStep = DebrisPiece['ageStep'];
export const AGE_LABEL: Readonly<Record<AgeStep, string>> = { 0: 'intact', 1: 'weathered', 2: 'broken' };

/** At most this many pieces round one body; the rest are a "+N" (art-direction §6, D5). */
export const DEBRIS_CAP = 12;
/** Nav lights: whole blinks per loop (one every 6 s), and the share of each blink lit. */
export const BLINK = { perLoop: 8, duty: 0.22 } as const;
/** The sweep (D6), seconds on its own clock: the teal flash, its fade down to the lit band, the shrink's start, the end. */
export const SWEEP = { flash: 0.2, fade: 0.5, shrink: 0.45, end: 1.2 } as const;
/** Whole turns per loop: each orbit, and at most this many tumbles or fragment spins either way. */
export const ORBIT_TURNS = 1;
const MAX_TURNS = 2;
/** Share of a piece's metal cells scorched, per age step (A3). */
const SCORCH: Readonly<Record<AgeStep, number>> = { 0: 0, 1: 0.3, 2: 0.5 };
/** The most an orbit plane tilts from the system's plane (75°, the lab's crooked orbits). */
const MAX_INCL = (75 * Math.PI) / 180;
/** Share of orbits that run the other way round (the lab's). */
const RETROGRADE = 0.3;
/** Mixed into every item's seed, so a piece's draws differ from anything else seeded by it. */
const SALT = 0x2545f491;

const TAU = Math.PI * 2;

/** A piece of the debris view the view can draw: one with a home body (a planet's DirId or 'star'). */
export type Drawable = Omit<DebrisPiece, 'home'> & { home: string };

/** An orbit round the home's centre: mean radius `a`, swinging `e` in and out (world units), its plane, direction and phase. */
export interface Orbit { a: number; e: number; incl: number; node: number; peri: number; dir: 1 | -1; off: number }
/** A whole number of turns per loop about an axis, from a phase. */
export interface Turn { axis: Vec3; turns: number; off: number }
export interface Fragment {
  id: number;
  /** Where it sits in the piece, kit units. */
  centre: Vec3;
  /** The way it drifts when the piece is broken, and flies when it's swept. */
  dir: Vec3;
  /** How far it has drifted out, kit units (broken pieces only). */
  spread: number;
  /** Its own spin (broken pieces only; whole ones turn as one). */
  spin: Turn;
  /** The sweep's fling: how fast it flies out, and how many extra turns it makes. */
  burst: { speed: number; spin: number };
}
export interface NavLight { pos: Vec3; frag: number; alive: boolean; off: number }

export interface Piece {
  id: string;
  cls: DebrisClass;
  home: string;
  ageStep: AgeStep;
  lines: number;
  /** Solid parts, kit units, centred on the piece. */
  parts: SolidPart[];
  /** World units per kit unit: the kit's scale × the home's radius. */
  scale: number;
  /** A sphere round its middle that holds it however it tumbles, world units (its fragments' drift included). */
  bound: number;
  /** Scorch: the cell size (kit units), the share scorched, and the cell hash's offset. */
  cell: number;
  scorch: number;
  hashOff: number;
  orbit: Orbit;
  tumble: Turn;
  frags: Fragment[];
  /** The outline's colour, and the fragments that keep one (a broken piece only its biggest). */
  outline: 'bright' | 'dim';
  outlineFrags: number[];
  lights: NavLight[];
}

/** The body a piece drifts round, as debris sees it: its radius and the shell it drifts in. */
export interface DebrisBody { radius: number; inner: number; outer: number }

/** The model with these bodies drawing debris (sorted, once each): the same object when they already are. */
export function withDebrisHomes(model: SystemModel, homes: Iterable<string>): SystemModel {
  const next = [...new Set(homes)].sort(byCodepoint);
  return next.join('\0') === (model.debrisHomes ?? []).join('\0') ? model : { ...model, debrisHomes: next };
}

/**
 * Points round every debris shell at frame 0 (six on each, as the start pose takes a planet's reach): what the start
 * pose fits in too while debris is drawn (camera/pose.ts startPose `extra`), so Home frames every piece. None without.
 */
export function shellPoints(model: SystemModel): Vec3[] {
  return (model.debrisHomes ?? []).flatMap((home) => {
    const b = homeBase(model, home, 0);
    if (!b) return [];
    const r = debrisShell(b.reach, b.radius).outer, [x, y, z] = b.centre;
    return [[x + r, y, z], [x - r, y, z], [x, y + r, z], [x, y - r, z], [x, y, z + r], [x, y, z - r]] as Vec3[];
  });
}

/** The body debris of `home` drifts round, or null when it isn't in this layout. */
export function debrisBody(model: SystemModel, home: string): DebrisBody | null {
  const b = homeBase(model, home, 0);
  return b ? { radius: b.radius, ...debrisShell(b.reach, b.radius) } : null;
}

const byCodepoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** The order a body's pieces are shown in, and which are counted instead past the cap: biggest first, then oldest, then by id. */
export const ranked = <T extends Pick<Drawable, 'id' | 'lines' | 'ageStep'>>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => b.lines - a.lines || b.ageStep - a.ageStep || byCodepoint(a.id, b.id));

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const randomAxis = (rnd: () => number): Vec3 => {
  const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
  return [Math.cos(a) * s, u, Math.sin(a) * s];
};
/** A whole number of turns, 1..n, either way. */
const signed = (rnd: () => number, n: number) => (1 + Math.floor(rnd() * n)) * (rnd() < 0.5 ? -1 : 1);

/** One item's piece round a body. Every draw comes from the item's own seed, in a fixed order. */
export function placePiece(it: Drawable, body: DebrisBody): Piece {
  const kit = buildKit(it.cls, it.lines);
  const rnd = mulberry32((it.seed ^ SALT) >>> 0);
  const scale = kit.scale * body.radius;
  const solid = kit.parts.filter(isSolid);
  const lights = kit.parts.filter((p): p is LightPart => !isSolid(p));
  const broken = it.ageStep === 2;
  // the fragments first: a broken piece's drift sets the sphere it fills, and so its orbit's room
  const { lo, hi } = extent(solid);
  const mid: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const frags: Fragment[] = fragIds(solid).map((f) => {
    const c = fragCentre(solid, f);
    const rel: Vec3 = [c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]];
    const out = Math.hypot(...rel) > 1e-3 ? norm(rel) : randomAxis(rnd);
    const dir = norm([out[0] + (rnd() - 0.5) * 0.6, out[1] + (rnd() - 0.5) * 0.6, out[2] + (rnd() - 0.5) * 0.6]);
    const spread = broken ? (0.32 + (MAX_SPREAD - 0.32) * rnd()) * kit.spread : 0;
    const spin: Turn = { axis: randomAxis(rnd), turns: broken ? signed(rnd, MAX_TURNS) : 0, off: broken ? rnd() : 0 };
    return { id: f, centre: c, dir, spread, spin, burst: { speed: (0.9 + 0.6 * rnd()) * kit.spread, spin: signed(rnd, MAX_TURNS) } };
  });
  const bound = (broken ? pieceBound(solid, Math.max(...frags.map((f) => f.spread))) : pieceBound(solid)) * scale;
  // the orbit: its mean radius keeps the whole piece inside the shell at its nearest and furthest
  const e = DEBRIS_SHELL.ecc * body.radius * rnd();
  const lowest = body.inner + bound + e, highest = body.outer - bound - e;
  const orbit: Orbit = {
    a: lowest + (highest - lowest) * rnd(), e,
    incl: rnd() * MAX_INCL, node: rnd() * TAU, peri: rnd() * TAU, dir: rnd() < RETROGRADE ? -1 : 1, off: rnd(),
  };
  const tumble: Turn = { axis: randomAxis(rnd), turns: signed(rnd, MAX_TURNS), off: rnd() };
  const hashOff = Math.floor(rnd() * 997);
  // A3 ages by outline and lights: intact, a bright outline and both lights; weathered, a dim one and one light
  // dead; broken, a dim outline on its biggest fragment only and every light dead
  const navs = lights.map((l, k) => ({ pos: l.pos, frag: l.frag, alive: it.ageStep === 0 || (it.ageStep === 1 && k < lights.length - 1), off: rnd() }));
  return {
    id: it.id, cls: it.cls, home: it.home, ageStep: it.ageStep, lines: it.lines, parts: solid, scale, bound,
    cell: kit.cell, scorch: SCORCH[it.ageStep], hashOff, orbit, tumble, frags,
    outline: it.ageStep === 0 ? 'bright' : 'dim', outlineFrags: broken ? [biggestFrag(solid)] : frags.map((f) => f.id), lights: navs,
  };
}

/** What the view draws: every body's pieces, and the items counted instead (past a body's cap, or with no body here). */
export interface DebrisPlan {
  pieces: Piece[];
  /** Items past the cap, by home. */
  overflow: Map<string, number>;
  /** Items whose home isn't in this layout (Rule 1: counted, never drawn). */
  unplaced: number;
}

/** Plans every body's debris: its DEBRIS_CAP biggest items as pieces, the rest counted. Pieces come out by home, then rank. */
export function planDebris(model: SystemModel, items: readonly Drawable[]): DebrisPlan {
  const byHome = new Map<string, Drawable[]>();
  for (const it of items) byHome.set(it.home, [...(byHome.get(it.home) ?? []), it]);
  const pieces: Piece[] = [], overflow = new Map<string, number>();
  let unplaced = 0;
  for (const home of [...byHome.keys()].sort(byCodepoint)) {
    const own = byHome.get(home)!, body = debrisBody(model, home);
    if (!body) { unplaced += own.length; continue; }
    const shown = ranked(own).slice(0, DEBRIS_CAP);
    pieces.push(...shown.map((it) => placePiece(it, body)));
    if (own.length > shown.length) overflow.set(home, own.length - shown.length);
  }
  return { pieces, overflow, unplaced };
}

/** A point of an orbit at loop phase [0, 1), relative to the home's centre: a uniform angle, so speed changes only through projection. */
export function orbitPoint(o: Orbit, phase: number): Vec3 {
  const a = TAU * (o.dir * ORBIT_TURNS * phase + o.off);
  const r = o.a + o.e * Math.cos(a - o.peri);
  const x = Math.cos(a) * r, z0 = Math.sin(a) * r;
  const y = -z0 * Math.sin(o.incl), z = z0 * Math.cos(o.incl);
  const cn = Math.cos(o.node), sn = Math.sin(o.node);
  return [x * cn + z * sn, y, -x * sn + z * cn];
}

/** A piece's centre at a frame, relative to its home's centre. */
export const pieceOffset = (p: Piece, frame: number): Vec3 => orbitPoint(p.orbit, loopPhase(frame));

/** The sweep's state `s` seconds in: null before it starts, `gone` after its end. */
export type SweepState = null | { gone: true } | { gone: false; flash: number; burst: number; spin: number; scale: number };

/**
 * The sweep (D6) `s` seconds after it starts, on its own clock outside the loop lock: flash 0..1 (1: every band
 * teal; it drains down to the lit band by SWEEP.fade), burst (extra drift, kit units), spin (extra turns) and scale
 * (1 → 0 from SWEEP.shrink). Gone at SWEEP.end, with no trace.
 */
export function sweepAt(s: number | null): SweepState {
  if (s === null || s < 0) return null;
  if (s >= SWEEP.end) return { gone: true };
  const flash = s < SWEEP.flash ? 1 : s < SWEEP.fade ? 1 - (s - SWEEP.flash) / (SWEEP.fade - SWEEP.flash) : 0;
  const ease = 1 - (1 - s / SWEEP.end) ** 2;
  const shrink = s < SWEEP.shrink ? 1 : 1 - (s - SWEEP.shrink) / (SWEEP.end - SWEEP.shrink);
  return { gone: false, flash, burst: 1.1 * ease, spin: 0.6 * ease, scale: Math.max(0, shrink) };
}

/** Whether a nav light is lit at loop phase [0, 1): BLINK.perLoop blinks per loop, staggered by its own phase. */
export const lightOn = (l: NavLight, phase: number): boolean => l.alive && ((((phase * BLINK.perLoop + l.off) % 1) + 1) % 1) < BLINK.duty;

/** One fragment's pose: where its middle is (world, relative to the home's centre), its turn (the piece's tumble, then its own spin) and its scale. */
export interface FragPose { frag: number; centre: Vec3; tumble: [Vec3, number]; spin: [Vec3, number]; scale: number }

/**
 * Every fragment's pose at loop phase [0, 1), with a sweep's state (or none). A fragment sits at its place in the
 * piece, pushed out along `dir` by its drift (broken) and the sweep's burst, turned with the whole piece's tumble,
 * and spins about its own middle.
 */
export function fragPoses(p: Piece, phase: number, sweep: Exclude<SweepState, { gone: true }> = null): FragPose[] {
  const c = orbitPoint(p.orbit, phase);
  const axis = p.tumble.axis, angle = TAU * (p.tumble.turns * phase + p.tumble.off);
  const [qx, qy, qz, qw] = quat(axis, angle);
  return p.frags.map((f) => {
    const push = f.spread + (sweep ? sweep.burst * f.burst.speed : 0);
    const local: Vec3 = [(f.centre[0] + f.dir[0] * push) * p.scale, (f.centre[1] + f.dir[1] * push) * p.scale, (f.centre[2] + f.dir[2] * push) * p.scale];
    const at = rotate([qx, qy, qz, qw], local);
    const spin = TAU * (f.spin.turns * phase + f.spin.off + (sweep ? sweep.spin * f.burst.spin : 0));
    return { frag: f.id, centre: [c[0] + at[0], c[1] + at[1], c[2] + at[2]], tumble: [axis, angle], spin: [f.spin.axis, spin], scale: sweep ? sweep.scale : 1 };
  });
}

/** A unit quaternion [x, y, z, w] for a turn of `angle` about a unit `axis`. */
export function quat(axis: Vec3, angle: number): [number, number, number, number] {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
/** a × b: b's turn, then a's. */
export function qmul(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = a as [number, number, number, number], [bx, by, bz, bw] = b as [number, number, number, number];
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
/** v turned by the unit quaternion q. */
export function rotate(q: readonly number[], v: Vec3): Vec3 {
  const [x, y, z, w] = q as [number, number, number, number];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
