// Debris layout and motion: stale items -> pieces near a planet, and each piece's pose at a loop
// phase. Pure (no three.js), so placement, loop lock and determinism are testable in Node.
//
// An item is one stale thing touching the planet (R13):
//   { id, cls: 'pr' | 'branch' | 'merged' | 'agent', diff: changed lines, age: days since activity }
// A piece's placement comes from a PRNG seeded by (planet seed, item id), so adding or removing an
// item never moves the others in the orbit arrangements (heaps and the wake re-pack by count).
import { KITS, extent, fragIds, fragCentre } from './kits.js';

export const LOOP = 24; // s: the scene loop (art direction §7); every motion makes whole cycles per loop

// Age steps (D2): days since the item's last activity. Thresholds are one documented constant.
export const AGE_STEPS = [60, 180]; // intact < 60 <= rusted < 180 <= broken
export const AGE_LABEL = ['intact', 'rusted', 'broken'];
export const PAINT_AGE_LABEL = ['intact', 'weathered', 'broken']; // paint-aged kits (A2)
const RUST_SHARE = [0, 0.62, 0.86]; // share of rust cells per step
// Paint-aged kits (A2): share of paint cells chipped to the dull mauves, and of metal cells scorched.
const DULL_SHARE = [0, 0.45, 0.75]; // even broken junk keeps some red, so old debris stays noticeable
const SCORCH_SHARE = [0, 0.3, 0.5]; // scorch darkens toward navy; kept moderate so old pieces don't vanish into space
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

const TAU = Math.PI * 2;
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const randomAxis = (rnd) => {
  const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
  return [Math.cos(a) * s, u, Math.sin(a) * s];
};
const signed = (rnd, n) => (1 + Math.floor(rnd() * n)) * (rnd() < 0.5 ? -1 : 1); // a whole number of turns, 1..n, either way

/** A point on an inclined, slightly eccentric orbit (uniform angle: speed changes only through projection). */
function orbitPoint(o, phase) {
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
const orbit = (rnd, { radius, size }) => {
  const e = 0.12 * rnd();
  const floor = (radius * 1.27 + size * 0.5) / (1 - e);
  const r = Math.max(floor, radius * (1.42 + 0.5 * rnd()) + size * 0.5);
  return { kind: 'orbit', r, e, incl: rnd() * ((75 * Math.PI) / 180), node: rnd() * TAU, peri: rnd() * TAU, dir: rnd() < 0.3 ? -1 : 1, turns: 1, off: rnd() };
};
export const ARRANGEMENTS = {
  // Each piece on its own loose orbit: random plane, about a third retrograde, one orbit per loop.
  orbits: { place: orbit },
  // Near-polar orbits, all one way: the planes stand across the equator (and any ring).
  polar: { place: (rnd, ctx) => ({ ...orbit(rnd, ctx), dir: 1, incl: ((72 + 18 * rnd()) * Math.PI) / 180 }) },
  // Two parked heaps beside the planet (leading and trailing side), each piece circling inside
  // its heap. Sides alternate by rank so both fill; a heap grows with the pieces in it. The heaps
  // never sit in front of the disc in the hero view.
  heaps: {
    prepare: (built) => built.map((_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      return { side, radius: 0.14 + 0.07 * Math.sqrt(side < 0 ? Math.ceil(built.length / 2) : Math.floor(built.length / 2)) };
    }),
    place: (rnd, { radius, slot }) => {
      const c = [slot.side * (radius * 1.32 + slot.radius + 0.04), radius * 0.12, -radius * 0.12];
      const o = { r: slot.radius * (0.3 + 0.7 * Math.sqrt(rnd())), e: 0, incl: rnd() * Math.PI, node: rnd() * TAU, peri: 0, dir: rnd() < 0.5 ? -1 : 1, turns: 1, off: rnd() };
      return { kind: 'heap', centre: c, orbit: o };
    },
  },
  // A comet-like wake trailing off one side: youngest nearest the planet, oldest at the tail end;
  // spacing shrinks so the tail stays about 2.6 R long. Each piece circles its slot; the circles
  // widen down the tail.
  wake: {
    prepare: (built, radius) => {
      const byAge = built.map((_, i) => i).sort((a, b) => built[a].it.age - built[b].it.age || (built[a].it.id < built[b].it.id ? -1 : 1));
      const natural = byAge.map((i) => built[i].size * 0.95 + 0.05);
      const squeeze = Math.min(1, (2.6 * Math.max(radius, 0.8)) / Math.max(1e-6, natural.reduce((s, x) => s + x, 0)));
      const slots = [];
      let d = 0;
      byAge.forEach((i, k) => {
        d += (natural[k] * squeeze) / 2;
        slots[i] = { d, k };
        d += (natural[k] * squeeze) / 2;
      });
      return slots;
    },
    place: (rnd, { radius, slot }) => {
      const axis = norm([1, -0.32, -0.3]);
      const u = norm(cross(axis, [0, 1, 0]));
      const v = cross(u, axis);
      return { kind: 'wake', axis, u, v, d: radius * 1.3 + slot.d, w: 0.03 + 0.022 * slot.k, off: rnd(), dir: rnd() < 0.5 ? -1 : 1 };
    },
  },
  // Close-ups: every piece at the origin, held still in the 3/4 view.
  display: { place: () => ({ kind: 'fixed', tumble: DISPLAY_TUMBLE, still: true }) },
  // Measurement: every piece at the origin, tumbling as it would in orbit.
  turntable: { place: () => ({ kind: 'fixed' }) },
};
/** True when removing an item moves the other pieces (the arrangement packs them). */
export const repacks = (arrangement) => !!ARRANGEMENTS[arrangement].prepare;

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
    const tumble = motion.tumble ?? { axis: randomAxis(rnd), turns: signed(rnd, 2), off: rnd() };
    const { lo, hi } = extent(b.parts);
    const mid = lo.map((l, k) => (l + hi[k]) / 2);
    const frags = fragIds(b.parts).map((f) => {
      const c = fragCentre(b.parts, f);
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
    return {
      id: it.id, cls: it.cls, step, parts: b.parts, scale: b.scale, cell: b.cell, size: b.size,
      rust: b.age === 'paint' ? 0 : RUST_SHARE[step], dull: b.age === 'paint' ? DULL_SHARE[step] : 0, scorch: b.age === 'paint' ? SCORCH_SHARE[step] : 0,
      hashOff: Math.floor(rnd() * 997), motion, tumble, frags,
    };
  });
  return { kit: variant.kit, pieces, overflow: order.length - shown.length, mass: items.reduce((s, it) => s + it.diff, 0) };
}

/** The loop phase [0, 1) of time t (s). */
export const phaseAt = (t) => (((t / LOOP) % 1) + 1) % 1;

const CENTRE = {
  orbit: (m, phase) => orbitPoint(m, phase),
  heap: (m, phase) => orbitPoint(m.orbit, phase).map((x, i) => x + m.centre[i]),
  fixed: () => [0, 0, 0],
  wake: (m, phase) => {
    const a = TAU * (m.dir * phase + m.off);
    return [0, 1, 2].map((i) => m.axis[i] * m.d + m.u[i] * m.w * Math.cos(a) + m.v[i] * m.w * Math.sin(a));
  },
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
