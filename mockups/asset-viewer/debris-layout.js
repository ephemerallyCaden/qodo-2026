// Debris layout and motion: stale items -> pieces near a planet, and each piece's pose at a loop
// phase. Pure (no three.js), so placement, loop lock and determinism are testable in Node.
//
// An item is one stale thing touching the planet (R13):
//   { id, cls: 'pr' | 'branch' | 'merged' | 'agent', diff: changed lines, age: days since activity }
// A piece's placement comes from a PRNG seeded by (planet seed, item id), so adding or removing an
// item never moves the others in the orbit arrangements.
// The viewer's arrangement is `orbits` (A3); `display` and `turntable` hold pieces still or tumbling
// at the origin for close-ups and measures. The debris lab registers its explorations (polar orbits,
// heaps, the wake) into ARRANGEMENTS and CENTRE.
import { KITS, CLASSES, extent, fragIds, fragCentre, isSolid } from './debris-kits.js';

export const LOOP = 24; // s: the scene loop (art direction §7); every motion makes whole cycles per loop

// Age steps (D2): days since the item's last activity. Thresholds are one documented constant.
export const AGE_STEPS = [60, 180]; // intact < 60 <= rusted < 180 <= broken
export const AGE_LABEL = ['intact', 'rusted', 'broken'];
export const PAINT_AGE_LABEL = ['intact', 'weathered', 'broken']; // paint-aged kits (A2)
const RUST_SHARE = [0, 0.62, 0.86]; // share of rust cells per step
// Paint-aged kits (A2): share of paint cells chipped to the dull mauves, and of metal cells scorched.
const DULL_SHARE = [0, 0.45, 0.75]; // even broken junk keeps some red, so old debris stays noticeable
const SCORCH_SHARE = [0, 0.3, 0.5]; // scorch darkens toward navy; kept moderate so old pieces don't vanish into space
// Outline-aged kits (A3): red is a 1 px outline and blinking nav lights. Intact: bright outline, every
// light blinking. Weathered: the outline dims, one light is dead, 30% scorch. Broken: fragments, the
// lights dead, a dim outline on the biggest fragment only, 50% scorch.
export const BLINK = { perLoop: 8, duty: 0.22 }; // whole blinks per 24 s loop (one every 3 s), share of each blink lit
export const ageStep = (days) => (days < AGE_STEPS[0] ? 0 : days < AGE_STEPS[1] ? 1 : 2);

// The sweep (D6): a one-shot on its own clock (seconds since the scan that found the item gone),
// outside the loop lock. Flash teal, crack, burst and shrink, then nothing.
export const SWEEP = { flash: 0.2, fade: 0.5, shrink: 0.45, end: 1.2 };

const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** FNV-1a, 32-bit. */
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export const TAU = Math.PI * 2;
export const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const randomAxis = (rnd) => {
  const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
  return [Math.cos(a) * s, u, Math.sin(a) * s];
};
const signed = (rnd, n) => (1 + Math.floor(rnd() * n)) * (rnd() < 0.5 ? -1 : 1); // a whole number of turns, 1..n, either way

/** A point on an inclined, slightly eccentric orbit (uniform angle: speed changes only through projection). */
export function orbitPoint(o, phase) {
  const a = TAU * (o.dir * o.turns * phase + o.off);
  const r = (o.r * (1 - o.e * o.e)) / (1 + o.e * Math.cos(a - o.peri));
  const x = Math.cos(a) * r, z0 = Math.sin(a) * r;
  const y = -z0 * Math.sin(o.incl), z = z0 * Math.cos(o.incl);
  const cn = Math.cos(o.node), sn = Math.sin(o.node);
  return [x * cn + z * sn, y, -x * sn + z * cn];
}
/** The orbit's plane normal (for the ring comparison). */
export function orbitNormal(o) {
  const p0 = orbitPoint({ ...o, e: 0, off: 0, dir: 1, turns: 1 }, 0);
  const p1 = orbitPoint({ ...o, e: 0, off: 0, dir: 1, turns: 1 }, 0.25);
  return norm(cross(p0, p1));
}

// Close-ups hold every piece in one 3/4 view: turned 35 degrees about y, then tipped 20 degrees about x.
const DISPLAY_TUMBLE = (() => {
  const [cy, sy, cx, sx] = [Math.cos(0.3054), Math.sin(0.3054), Math.cos(0.1745), Math.sin(0.1745)]; // half angles
  const w = cx * cy, v = [sx * cy, cx * sy, sx * sy]; // qx * qy
  return { axis: norm(v), turns: 0, off: (2 * Math.acos(w)) / TAU };
})();

// Arrangements: where pieces sit and how they move. `place(rnd, ctx)` returns a piece's motion
// record (plain data; centreAt reads it by kind). `prepare(built, radius)`, where present, packs the
// pieces against each other (heaps by count, the wake by age) and gives each piece its slot in
// ctx.slot, so removing an item re-packs the rest; without it, every piece is placed on its own.
// A motion record may carry a fixed `tumble` and `still: true` (no fragment spin).
export const orbitPlace = (rnd, { radius, size }) => {
  const e = 0.12 * rnd();
  const floor = (radius * 1.27 + size * 0.5) / (1 - e);
  const r = Math.max(floor, radius * (1.42 + 0.5 * rnd()) + size * 0.5);
  return { kind: 'orbit', r, e, incl: rnd() * ((75 * Math.PI) / 180), node: rnd() * TAU, peri: rnd() * TAU, dir: rnd() < 0.3 ? -1 : 1, turns: 1, off: rnd() };
};
export const ARRANGEMENTS = {
  // Each piece on its own loose orbit: random plane, about a third retrograde, one orbit per loop.
  orbits: { place: orbitPlace },
  // Close-ups: every piece at the origin, held still in the 3/4 view.
  display: { place: () => ({ kind: 'fixed', tumble: DISPLAY_TUMBLE, still: true }) },
  // Measurement: every piece at the origin, tumbling as it would in orbit.
  turntable: { place: () => ({ kind: 'fixed' }) },
};
/** True when removing an item moves the other pieces (the arrangement packs them). */
export const repacks = (arrangement) => !!ARRANGEMENTS[arrangement].prepare;

// Demo stale items (the viewer's debris controls, and the lab's samples): ages (days) and diffs
// (lines) that land on each age step and across the size range.
export const AGES = [21, 110, 400]; // intact, weathered, broken (AGE_STEPS 60, 180)
const DIFFS = [12, 60, 240, 900, 3000, 9000];
export const AGE_MIXES = ['mixed', 'fresh', 'weathered', 'old'];
/**
 * n deterministic stale items. Classes cycle pr, branch, merged, agent; with mix 'mixed' the age
 * steps cycle intact, weathered, broken at a different rate, so 12 items cover all 12 class x age
 * pairs; 'fresh', 'weathered' and 'old' put every item on one step.
 */
export function demoItems(n, { mix = 'mixed', prefix = 'item' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    cls: CLASSES[i % 4],
    age: AGES[mix === 'mixed' ? (i + Math.floor(i / 4)) % 3 : AGE_MIXES.indexOf(mix) - 1] + (i % 5),
    diff: DIFFS[(i * 7 + 3) % DIFFS.length],
  }));
}

/** The order pieces are shown in, and which are counted instead (beyond the cap): biggest first. */
export function ranked(items) {
  return [...items].sort((a, b) => b.diff - a.diff || b.age - a.age || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Plans a planet's debris. variant: { kit, arrangement, cap }. radius: the planet's radius (its size).
 * Returns { kit, pieces, overflow (items counted, not drawn), mass (changed lines in all items) }.
 */
export function plan(items, variant, { seed = 1, radius = 1 } = {}) {
  const order = ranked(items);
  const shown = order.slice(0, variant.cap);
  const arrangement = ARRANGEMENTS[variant.arrangement];
  const built = shown.map((it) => {
    const b = KITS[variant.kit].build(it.cls, it.diff);
    return { it, ...b, size: Math.max(...extent(b.parts).size) * b.scale };
  });
  const slots = arrangement.prepare?.(built, radius) ?? [];

  const pieces = built.map((b, i) => {
    const { it } = b;
    const rnd = mulberry32(hashStr(`${seed}:${it.id}`));
    const step = ageStep(it.age);
    const motion = arrangement.place(rnd, { radius, size: b.size, slot: slots[i] });
    const solid = b.parts.filter(isSolid);
    const tumble = motion.tumble ?? { axis: randomAxis(rnd), turns: signed(rnd, 2), off: rnd() };
    const { lo, hi } = extent(b.parts);
    const mid = lo.map((l, k) => (l + hi[k]) / 2);
    const frags = fragIds(solid).map((f) => {
      const c = fragCentre(solid, f);
      const rel = c.map((x, k) => x - mid[k]); // from the piece's middle (blocks are centred to whole blocks)
      const out = Math.hypot(...rel) > 1e-3 ? norm(rel) : randomAxis(rnd);
      const dir = norm(out.map((x) => x + (rnd() - 0.5) * 0.6));
      return {
        id: f, centre: c, dir,
        spread: step === 2 ? (0.32 + 0.22 * rnd()) * b.spread : 0, // kit units: broken pieces drift apart
        spin: { axis: randomAxis(rnd), turns: step === 2 && !motion.still ? signed(rnd, 2) : 0, off: step === 2 ? rnd() : 0 },
        burst: { speed: (0.9 + 0.6 * rnd()) * b.spread, spin: signed(rnd, 2) }, // the sweep's fling
      };
    });
    const aged = b.age === 'paint' || b.age === 'outline';
    const piece = {
      id: it.id, cls: it.cls, step, parts: solid, scale: b.scale, cell: b.cell, size: b.size,
      rust: aged ? 0 : RUST_SHARE[step], dull: b.age === 'paint' ? DULL_SHARE[step] : 0, scorch: aged ? SCORCH_SHARE[step] : 0,
      hashOff: Math.floor(rnd() * 997), motion, tumble, frags,
    };
    if (b.age === 'outline') {
      const lights = b.parts.filter((p) => !isSolid(p));
      piece.outline = step === 0 ? 'bright' : 'dim';
      piece.outlineFrags = step === 2 ? [biggestFrag(solid)] : frags.map((f) => f.id);
      piece.lights = lights.map((l, k) => ({ pos: l.pos, frag: l.frag, alive: step === 0 || (step === 1 && k < lights.length - 1), off: rnd() }));
    }
    return piece;
  });
  return { kit: variant.kit, pieces, overflow: order.length - shown.length, mass: items.reduce((s, it) => s + it.diff, 0) };
}

const volume = (p) => (p.shape === 'box' ? p.size[0] * p.size[1] * p.size[2] : Math.PI * Math.max(p.r, p.r2 ?? p.r) ** 2 * p.len);
/** The fragment with the most volume (the one that keeps its outline when a piece breaks). */
function biggestFrag(parts) {
  const v = new Map();
  for (const p of parts) v.set(p.frag, (v.get(p.frag) ?? 0) + volume(p));
  return [...v.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** Whether nav light `l` is lit at loop phase [0, 1): BLINK.perLoop whole blinks per loop, staggered by its seed. */
export const lightOn = (l, phase) => l.alive && ((phase * BLINK.perLoop + l.off) % 1 + 1) % 1 < BLINK.duty;

/** The loop phase [0, 1) of time t (s). */
export const phaseAt = (t) => (((t / LOOP) % 1) + 1) % 1;

/** Where each motion kind puts a piece's centre at a phase (the lab adds its kinds). */
export const CENTRE = {
  orbit: (m, phase) => orbitPoint(m, phase),
  fixed: () => [0, 0, 0],
};
/** Centre of a piece (world units, relative to the planet centre) at loop phase [0, 1). */
export const centreAt = (piece, phase) => CENTRE[piece.motion.kind](piece.motion, phase);

/** The piece's tumble at phase: [axis, angle]. Whole turns per loop. */
const tumbleAt = (piece, phase) => [piece.tumble.axis, TAU * (piece.tumble.turns * phase + piece.tumble.off)];

/**
 * The sweep's state s seconds after it starts (null before; { gone } after the end):
 * flash 0..1 (1 = every band teal, 1/3 = only the lit band), burst (extra spread, kit units),
 * spin (extra turns) and scale (1 -> 0).
 */
export function sweepAt(s) {
  if (s == null || s < 0) return null;
  if (s >= SWEEP.end) return { gone: true };
  const flash = s < SWEEP.flash ? 1 : s < SWEEP.fade ? 1 - (s - SWEEP.flash) / (SWEEP.fade - SWEEP.flash) : 0;
  const k = Math.min(1, s / SWEEP.end);
  const ease = 1 - (1 - k) ** 2;
  const shrink = s < SWEEP.shrink ? 1 : 1 - (s - SWEEP.shrink) / (SWEEP.end - SWEEP.shrink);
  return { gone: false, flash, burst: 1.1 * ease, spin: 0.6 * ease, scale: Math.max(0, shrink) };
}

/**
 * Every fragment's pose: [{ frag, pos (world, relative to the planet), axis, angle, extra: [axis, angle], scale }].
 * Fragments sit at their place in the piece, pushed out along `dir` by their spread (broken) and the
 * sweep's burst, and spin about their own centre. Positions are in world units.
 */
export function fragPoses(piece, phase, sweep = null) {
  const c = centreAt(piece, phase);
  const [axis, angle] = tumbleAt(piece, phase);
  return piece.frags.map((f) => {
    const push = f.spread + (sweep ? sweep.burst * f.burst.speed : 0);
    const local = f.centre.map((x, i) => (x + f.dir[i] * push) * piece.scale);
    const spinTurns = f.spin.turns * phase + f.spin.off + (sweep ? sweep.spin * f.burst.spin : 0);
    return { frag: f.id, centre: c, local, axis, angle, extra: [f.spin.axis, TAU * spinTurns], scale: sweep ? sweep.scale : 1 };
  });
}
