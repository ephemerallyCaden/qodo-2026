// The crew's ship (#207 C2): R2-4 "Round lander", the human's pick from the ship lab (feature/ship-lab,
// mockups/ship-lab/ship-spec.js and ship-r2.js, R2-4c-final at 383cf22), as a builder: a crew count in, a ship spec out
// (hull parts as signed-distance primitives, which ship-glsl.ts compiles to GLSL, paint bands, see-through
// round windows, the beacon light, the thruster flame and the seats the astronauts ride in). Plus the idle
// motion, as functions of time only. Pure: no three.js, no DOM, no clock, no random (AGENTS.md Rule 3).
//
// Units are the lab's design units: an astronaut is the asset viewer's figure at scale 1 (0.95 tall, its boot
// sole at y 0.03, its helmet centre at y 0.709, facing +z). The whole ship, crew included, is drawn at
// SHIP_SCALE. y is up, the ship's front faces +z, and a yaw is atan(x, z) (0 = the front).
//
// The window layout (where the portholes sit, their size and rim colours, and the belly band) is its own part
// of the spec, WINDOWS, so a revised layout swaps in without touching the hull. It holds R2-4c-final, the
// human's pick (2026-11-25; ship lab R24C with R2-4's band, 383cf22): every porthole alike, grey-rimmed, in
// three straight columns under the captain's top porthole, on R2-4's red belly band.

export type Vec = readonly [number, number, number];
/** The hull's paint slots, in the shader's order (ship-glsl.ts SLOTS). */
export type Slot = 'shell' | 'trim' | 'metal' | 'gold';

/** World units per design unit: the crew aboard rides at 0.6 of the asset viewer's figure (ship lab, approved). */
export const SHIP_SCALE = 0.6;
/** The overflow rule (approved): 8 aboard on one deck, 9–16 on two, then "+N". */
export const SEATS_PER_DECK = 8;
export const MAX_DECKS = 2;
export const MAX_ABOARD = SEATS_PER_DECK * MAX_DECKS;
/** The helmet centre above an astronaut's origin, and its radius (astronaut.ts layout, SCALE 0.95, LIFT 0.03). */
export const HELMET_Y = 0.709;
export const HELMET_R = 0.27;

// ---------------------------------------------------------------- idle motion (loop-locked)
/**
 * The crew's idle cycle, 12 s (the asset viewer's cycle()): every ship layer completes a whole number of
 * cycles in it, so it loops on the scene's 48 s too (art-direction §7). Character animation, like the
 * drones' 12 s idle, so it kept its rate when the loop doubled (#174).
 */
export const CYCLE = 12;
export const CYCLES = { bob: 2, sway: 1, flame: 3, flicker: 48, blink: 6 } as const;

const wrap = (t: number) => ((t % CYCLE) + CYCLE) % CYCLE;
/** An integer hash in [0, 1): deterministic, no Math.random. */
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The ship's idle pose at time t (s): bob (design units), roll and pitch (rad). */
export function idleAt(t: number): { bob: number; roll: number; pitch: number } {
  const u = (wrap(t) / CYCLE) * Math.PI * 2;
  return { bob: 0.07 * Math.sin(u * CYCLES.bob), roll: 0.035 * Math.sin(u * CYCLES.sway + 0.8), pitch: 0.02 * Math.sin(u * CYCLES.sway + 2.3) };
}

/**
 * Flame j's length scale and tip wobble at time t: a slow breath (3 per cycle) plus a hashed flicker that
 * steps 48 times per cycle, keyed on the step within the cycle, so one cycle later is the same flame.
 */
export function flameAt(t: number, j = 0): { len: number; dx: number; dz: number } {
  const w = wrap(t);
  const u = (w / CYCLE) * Math.PI * 2;
  const k = Math.floor((w / CYCLE) * CYCLES.flicker) % CYCLES.flicker;
  return {
    len: 1 + 0.12 * Math.sin(u * CYCLES.flame + j) + 0.22 * (hash01(k, 11 + j) - 0.5),
    dx: 0.07 * (hash01(k, 29 + j) - 0.5),
    dz: 0.07 * (hash01(k, 47 + j) - 0.5),
  };
}

export interface Light { c: Vec; r: number; phase: number }
/** Whether a blinking light is lit at time t: 6 blinks per cycle. */
export const lightOn = (light: Light, t: number): boolean => ((wrap(t) / CYCLE) * CYCLES.blink + light.phase) % 1 < 0.5;

// ---------------------------------------------------------------- parts
interface PartBase { id: string; slot: Slot; /** Smooth-union radius with what came before (0: a hard union). */ k: number }
export type Part = PartBase & (
  | { kind: 'cone'; a: Vec; b: Vec; r1: number; r2: number }
  | { kind: 'capcone'; c: Vec; h: number; r1: number; r2: number; round: number }
  | { kind: 'sphere'; c: Vec; r: number }
  | { kind: 'ellipsoid'; c: Vec; r: Vec }
  /** A torus about the unit axis n: a raised window rim. */
  | { kind: 'ring'; c: Vec; n: Vec; R: number; r: number }
  /** n fins evenly spaced from yaw0, each a quad in its (radial, y) plane: root top, root bottom, tip bottom, tip top. */
  | { kind: 'fin'; n: number; yaw0: number; pts: readonly (readonly [number, number])[]; t: number; round: number }
);
export const cone = (id: string, a: Vec, b: Vec, r1: number, r2: number, slot: Slot, k = 0): Part => ({ id, kind: 'cone', a, b, r1, r2, slot, k });
export const capcone = (id: string, c: Vec, h: number, r1: number, r2: number, slot: Slot, k = 0, round = 0.02): Part => ({ id, kind: 'capcone', c, h, r1, r2, round, slot, k });
export const sphere = (id: string, c: Vec, r: number, slot: Slot, k = 0): Part => ({ id, kind: 'sphere', c, r, slot, k });
export const ellipsoid = (id: string, c: Vec, r: Vec, slot: Slot, k = 0): Part => ({ id, kind: 'ellipsoid', c, r, slot, k });
export const polar = (rho: number, yaw: number, y: number): Vec => [rho * Math.sin(yaw), y, rho * Math.cos(yaw)];

/** Paint over a part (or every part, '*') between two heights. */
export interface Band { part: string; y0: number; y1: number; slot: Slot }
/**
 * A round window: a cap on its local sphere (centre c, axis n, angular radius `angle`), its rim's outer
 * edge `frame` further out, painted `frameSlot`; it cuts only the `hosts` parts (never its own rim).
 */
export interface Window { c: Vec; n: Vec; angle: number; frame: number; frameSlot: Slot; hosts: readonly string[] }
export interface Flame { a: Vec; r: number; len: number }
/** Where an astronaut rides: its origin (boot sole minus LIFT) and yaw; the captain's seat wears the cap. */
export interface Seat { p: Vec; yaw: number; captain: boolean }

/** How many ride, on how many decks, and how many the overflow leaves out ("+N"). */
export interface CrewPlan { n: number; drawn: number; decks: 1 | 2; extra: number }

export interface ShipSpec {
  parts: readonly Part[];
  bands: readonly Band[];
  windows: readonly Window[];
  lights: readonly Light[];
  flames: readonly Flame[];
  /** Seat i holds the i-th astronaut aboard; seat 0 is the captain's. */
  seats: readonly Seat[];
  plan: CrewPlan;
  /** Each window's rim, in design units: what an astronaut's picking circle is (`seats[i]` sits behind `rims[i]`). */
  rims: readonly { c: Vec; n: Vec; R: number }[];
}

/** n aboard: at most MAX_ABOARD drawn, one deck for up to 8, two for 9–16. */
export function crewPlan(n: number): CrewPlan {
  const drawn = Math.max(0, Math.min(n, MAX_ABOARD));
  return { n, drawn, decks: drawn > SEATS_PER_DECK ? 2 : 1, extra: Math.max(0, n - drawn) };
}

// ---------------------------------------------------------------- the captain's cap
/**
 * The captain's cap (worn in seat 0): a flared gold crown over a navy hat band, with a navy peak over the
 * visor, sized up from life so it reads at 320×180. In the astronaut's own body frame (figure units: helmet
 * centre y 0.715, radius 0.285, facing +z), so it bobs and sways with the figure. Its own palette
 * (palette.ship.cap): shell is the navy, gold the crown.
 */
export const CAP: ShipSpec & { tilt: number } = {
  parts: [
    capcone('crown', [0, 0.995, -0.01], 0.07, 0.17, 0.215, 'gold', 0, 0.025), // flared: wider at the top, like a captain's hat
    ellipsoid('peak', [0, 0.94, 0.17], [0.17, 0.03, 0.11], 'shell', 0.015),
  ],
  bands: [{ part: 'crown', y0: 0.9, y1: 0.955, slot: 'shell' }], // the hat band
  windows: [], lights: [], flames: [], seats: [], rims: [], plan: crewPlan(0),
  tilt: -0.12, // the peak tipped up a little
};

// ---------------------------------------------------------------- R2-4 "Round lander"
/** A helmet's centre this far inside the hull behind its window (the lab's round-1 A). */
const SEAT_DEPTH = 0.31;
/** The lowest porthole sits this far above the lower sphere's equator, so its astronaut's boots stay inside. */
export const LIFT = 0.08;
const dir = (yaw: number, pitch: number): Vec => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
const along = (a: Vec, b: Vec, k: number): Vec => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

/**
 * A round window of radius rw on the round body, centred at height y and facing yaw: the see-through cap on
 * its local sphere (centre c on the axis, radius rs), its raised rim (a torus where the cap meets the sphere,
 * just outside the opening, so a chunky rim never shrinks the window), and the seat straight back from it,
 * so from the front the visor sits in the middle of the window (`low` drops it, so the captain's cap shows).
 */
function porthole(id: string, c: Vec, rs: number, yaw: number, y: number, rw: number, tube: number, slot: Slot, low: number, captain: boolean) {
  const pitch = Math.asin(Math.max(-0.95, Math.min(0.95, (y - c[1]) / rs)));
  const n = dir(yaw, pitch), angle = Math.asin(rw / rs);
  const ra = Math.asin(Math.min(0.98, (rw + 0.8 * tube) / rs));
  const window: Window = { c, n, angle, frame: ra - angle + tube / rs, frameSlot: slot, hosts: ['body'] };
  const rimC = along(c, n, rs * Math.cos(ra)), R = rs * Math.sin(ra);
  const rim: Part = { id, kind: 'ring', c: rimC, n, R, r: tube, slot, k: 0.025 };
  const h = along(along(c, n, rs), [Math.sin(yaw), 0, Math.cos(yaw)], -SEAT_DEPTH);
  const seat: Seat = { p: [h[0], h[1] - low - HELMET_Y, h[2]], yaw, captain };
  return { window, rim, seat, circle: { c: rimC, n, R: R + tube } };
}

/** The body the windows are laid out on: a capsule of radius R from its lower sphere's centre cy up to top. */
export interface Body { R: number; cy: number; top: number }

/**
 * The swappable window layout: how long the capsule must be for its decks, where each seat's porthole goes,
 * its size, its rim's colour, and any paint the layout brings (the belly band).
 */
export interface WindowLayout {
  /** The capsule length (top − cy) the windows need on `decks` decks. */
  stretch(decks: 1 | 2): number;
  /** Seat i's porthole for this plan: its height, yaw, radius and rim (tube, slot), and how far its astronaut sits low. */
  port(i: number, plan: CrewPlan, b: Body): { y: number; yaw: number; rw: number; tube: number; slot: Slot; low: number };
  bands(b: Body): Band[];
}

/**
 * R2-4c-final (the human's pick, 2026-11-25; ship lab R24C with `band`, 383cf22): every porthole alike (radius
 * 0.24, one grey rim, the captain's too), the captain alone at the top on the axis, the teammates below in rows
 * of three, in person-id order left to right, each column a straight vertical line (`col`: the side columns'
 * yaw, 31°). A short last row stays on the columns, centred: 1 in the middle, 2 on the sides. A second deck
 * adds three more rows. R2-4's red belly band, exactly (the ship lab's final numbers): trim paint on the body
 * from cy − 0.3 to top + 0.12, under the captain's porthole.
 */
export const R24C = { rw: 0.24, tube: 0.05, pitch: 0.66, above: 0.42, low: 0.17, col: 0.54 } as const;
/** The teammates' rows on `decks` decks: enough rows of three for every seat but the captain's. */
const rowsFor = (decks: 1 | 2) => Math.ceil((SEATS_PER_DECK * decks - 1) / 3);
const ROW_YAWS: Readonly<Record<number, readonly number[]>> = { 1: [0], 2: [-R24C.col, R24C.col], 3: [-R24C.col, 0, R24C.col] };
export const WINDOWS: WindowLayout = {
  stretch: (decks) => rowsFor(decks) * R24C.pitch - R24C.above + LIFT,
  port: (i, plan, b) => {
    const alike = { rw: R24C.rw, tube: R24C.tube, slot: 'metal' as const };
    if (i === 0) return { ...alike, y: b.top + R24C.above, yaw: 0, low: R24C.low };
    const row = Math.floor((i - 1) / 3), first = 1 + 3 * row, k = Math.min(3, plan.drawn - first);
    return { ...alike, y: b.top + R24C.above - (row + 1) * R24C.pitch, yaw: ROW_YAWS[k]![i - first]!, low: 0 };
  },
  bands: (b) => [{ part: 'body', y0: b.cy - 0.3, y1: b.top + 0.12, slot: 'trim' }],
};

/** R2-4's hull: the body, the blunt dome nose with its mast and blinking beacon, four splayed fins with ball feet, the nozzle and the flame. */
export const HULL = { R: 1.28, cy: 1.45, stance: 1.22 } as const;

/**
 * The ship for a crew of n (seat 0: the captain's): R2-4's round lander (ship-r2.js `base` with a dome nose
 * and four fins) carrying `layout`'s portholes, one per astronaut drawn. Its capsule is sized for its decks,
 * never its crew, so the ship keeps its shape as people join.
 */
export function buildShip(n: number, layout: WindowLayout = WINDOWS): ShipSpec {
  const plan = crewPlan(n);
  const { R, cy, stance } = HULL;
  const top = cy + layout.stretch(plan.decks);
  const b: Body = { R, cy, top };
  const parts: Part[] = [
    capcone('nozzle', [0, cy - R + 0.05, 0], 0.24, 0.5, 0.36, 'metal', 0, 0.06), // tucked up into the round bottom
    cone('body', [0, cy, 0], [0, top, 0], R, R, 'shell', 0),
    { id: 'fins', kind: 'fin', n: 4, yaw0: Math.PI / 4, pts: [[0.85, cy - 0.15], [0.6, cy - 0.95], [1.75 * stance, cy - 1.62], [1.65 * stance, cy - 1.0]], t: 0.11, round: 0.06, slot: 'trim', k: 0.03 },
    cone('nose', [0, top + 0.85, 0], [0, top + 1.2, 0], 0.82, 0.5, 'shell', 0.2),
    cone('mast', [0, top + 1.5, 0], [0, top + 1.72, 0], 0.075, 0.055, 'metal', 0.03),
  ];
  const lights: Light[] = [{ c: [0, top + 1.8, 0], r: 0.15, phase: 0 }];
  parts.push(sphere('beacon', lights[0]!.c, lights[0]!.r, 'trim', 0.02));
  for (let i = 0; i < 4; i++) parts.push(sphere(`foot${i}`, polar(1.72 * stance, Math.PI / 4 + (i * Math.PI) / 2, cy - 1.58), 0.15, 'metal', 0.04)); // ball feet on the wide stance
  // the nose band by height ('*'), so its paint shows no part-tie speckles at the joint
  const bands: Band[] = [{ part: '*', y0: top + 1.02, y1: top + 1.62, slot: 'trim' }, ...layout.bands(b)];
  const windows: Window[] = [], seats: Seat[] = [], rims: ShipSpec['rims'][number][] = [];
  for (let i = 0; i < plan.drawn; i++) {
    const w = layout.port(i, plan, b);
    const p = porthole(`port${i}`, [0, Math.min(Math.max(w.y, cy), top), 0], R, w.yaw, w.y, w.rw, w.tube, w.slot, w.low, i === 0);
    parts.push(p.rim); windows.push(p.window); seats.push(p.seat); rims.push(p.circle);
  }
  return { parts, bands, windows, lights, flames: [{ a: [0, cy - R - 0.2, 0], r: 0.4, len: 0.52 }], seats, plan, rims };
}
