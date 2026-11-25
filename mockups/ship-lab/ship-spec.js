// The crew's spaceship (#207, C2): four cartoon-rocket directions A-D, each a builder that turns a
// crew count into a ship spec: hull parts (SDF primitives, compiled to GLSL by ship-glsl.js), paint
// bands, see-through windows, glass domes, nav lights, thruster flames and seats (where each
// astronaut rides). Plus the idle motion, as functions of time only. Pure: no three.js, no DOM.
//
// Units: design units, where an astronaut is the viewer's figure at scale 1 (0.95 tall, boot sole at
// y 0.03, helmet centre at y 0.709, facing +z). The whole ship, crew included, is drawn at SHIP_SCALE.
// y is up, the ship's front faces +z, and a yaw is measured as atan(x, z) (0 = front).

export const SHIP_SCALE = 0.6; // world units per design unit: the crew aboard rides at 0.6 of the viewer's crew close-up figure
export const SEATS_PER_DECK = 8;
export const MAX_DECKS = 2; // the overflow rule: up to 8 aboard on one deck, 9-16 on two, then "+N"
export const HELMET_Y = 0.709; // the helmet centre above an astronaut's origin (astronaut.js layout, SCALE 0.95, LIFT 0.03)
export const HELMET_R = 0.27;

// ---------------------------------------------------------------- idle motion (loop-locked)
// The crew's idle cycle: the asset viewer's cycle() = LOOP.period / surfaceTurns = 24 / 2 = 12 s, over
// which the astronaut's bob runs twice and its sway and blink once. Every ship layer completes a whole
// number of cycles per 12 s, so it also loops on the viewer's 24 s and the product's 48 s (art direction §7).
export const CYCLE = 12;
export const CYCLES = { bob: 2, sway: 1, flame: 3, flicker: 48, chase: 48, blink: 6 };

const wrap = (t) => ((t % CYCLE) + CYCLE) % CYCLE;
/** An integer hash in [0, 1): deterministic, no Math.random. */
export function hash01(a, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The ship's idle pose at time t (s): bob (design units), roll and pitch (rad). */
export function idleAt(t) {
  const u = (wrap(t) / CYCLE) * Math.PI * 2;
  return {
    bob: 0.07 * Math.sin(u * CYCLES.bob),
    roll: 0.035 * Math.sin(u * CYCLES.sway + 0.8),
    pitch: 0.02 * Math.sin(u * CYCLES.sway + 2.3),
  };
}

/**
 * Flame j's length scale and tip wobble at time t: a slow breath (3 per cycle) plus a hashed
 * flicker that steps 48 times per cycle (4 per second), keyed on the step within the cycle.
 */
export function flameAt(t, j = 0) {
  const w = wrap(t);
  const u = (w / CYCLE) * Math.PI * 2;
  const k = Math.floor((w / CYCLE) * CYCLES.flicker) % CYCLES.flicker;
  const f = hash01(k, 11 + j);
  return {
    len: 1 + 0.12 * Math.sin(u * CYCLES.flame + j) + 0.22 * (f - 0.5),
    dx: 0.07 * (hash01(k, 29 + j) - 0.5),
    dz: 0.07 * (hash01(k, 47 + j) - 0.5),
  };
}

/** Whether light i is lit at time t: a marquee chase (ring lights) or a steady blink (beacons). */
export function lightOn(light, i, t) {
  const w = wrap(t) / CYCLE;
  if (light.mode === 'chase') return (Math.floor(w * CYCLES.chase) + i) % 3 === 0;
  return ((w * CYCLES.blink + light.phase) % 1) < 0.5;
}

// ---------------------------------------------------------------- parts
const cone = (id, a, b, r1, r2, slot, k = 0) => ({ id, kind: 'cone', a, b, r1, r2, slot, k });
const capcone = (id, c, h, r1, r2, slot, k = 0, round = 0.02) => ({ id, kind: 'capcone', c, h, r1, r2, round, slot, k });
const sphere = (id, c, r, slot, k = 0) => ({ id, kind: 'sphere', c, r, slot, k });
const ellipsoid = (id, c, r, slot, k = 0) => ({ id, kind: 'ellipsoid', c, r, slot, k });
const torus = (id, c, R, r, slot, k = 0) => ({ id, kind: 'torus', c, R, r, slot, k });
const disc = (id, c, r0, r1, h, slot, k = 0, round = 0.03) => ({ id, kind: 'disc', c, r0, r1, h, round, slot, k });
const box = (id, c, b, slot, k = 0, round = 0.04) => ({ id, kind: 'box', c, b, round, slot, k });
// n fins evenly spaced from yaw0, each a quad in its (radial, y) plane: [root top, root bottom, tip bottom, tip top].
const fins = (id, n, yaw0, pts, t, slot, k = 0, round = 0.035) => ({ id, kind: 'fin', n, yaw0, pts, t, round, slot, k });
const polar = (rho, yaw, y) => [rho * Math.sin(yaw), y, rho * Math.cos(yaw)];

/** Spread k seats over [-span, span], centred (k = 1 sits in the middle). */
const spread = (k, span) => Array.from({ length: k }, (_, i) => (k === 1 ? 0 : -span + (2 * span * i) / (k - 1)));
const seat = (x, y, z, yaw = 0) => ({ p: [x, y, z], yaw });
/** A seat whose helmet sits at (x, hy, z), facing yaw. */
const helmetSeat = (x, hy, z, yaw = 0) => seat(x, hy - HELMET_Y, z, yaw);

/**
 * How a crew of n rides: decks used, astronauts drawn, and the "+N" left over. The crew is the repo
 * owner (the captain, always seat 0) and the teammates in person-id order, never by activity: the
 * captain and the first 15 teammates ride, the rest is "+N".
 */
export function crewPlan(n) {
  const drawn = Math.min(n, SEATS_PER_DECK * MAX_DECKS);
  return { n, drawn, decks: drawn > SEATS_PER_DECK ? 2 : 1, extra: n - drawn, perDeck: [Math.min(drawn, SEATS_PER_DECK), Math.max(0, drawn - SEATS_PER_DECK)] };
}
const captainSeat = (s) => ({ ...s, captain: true });

// The captain's cap (worn by seat 0 in every ship): a gold crown over a navy hat band, with a navy peak
// over the visor, sized up from life so it reads at 320x180. In the astronaut's own body frame (figure
// units: helmet centre y 0.715, radius 0.285, facing +z), so it bobs and sways with the figure.
export const CAP = {
  parts: [
    capcone('crown', [0, 0.995, -0.01], 0.07, 0.17, 0.215, 'gold', 0, 0.025), // flared: wider at the top, like a captain's hat
    ellipsoid('peak', [0, 0.94, 0.17], [0.17, 0.03, 0.11], 'shell', 0.015),
  ],
  bands: [{ part: 'crown', y0: 0.9, y1: 0.955, slot: 'shell' }], // the hat band
  windows: [], glass: [], lights: [], flames: [], crew: [],
  tilt: -0.12, // the peak tipped up a little
};

// ---------------------------------------------------------------- A: finned classic
// A tall bullet rocket: white body, red ogive nose and three swept fins, a bell nozzle. The captain
// looks out of a big gold-framed porthole under the nose; each teammate has a porthole of their own
// below it, in two staggered columns. A second deck stretches the body by eight more portholes.
function buildA(n) {
  const plan = crewPlan(n);
  const R = 0.8, PITCH = 0.36, PORT = 0.25, FRAME = 0.08, CAPT = 0.38, CAPT_FRAME = 0.1;
  const mates = plan.drawn - 1;
  const low = 1.5; // the lowest porthole row clears the fins
  const top = low + (SEATS_PER_DECK * plan.decks - 2) * PITCH; // the highest teammate porthole: the body is sized for its decks, not its crew
  const cy = top + 0.78; // the captain's porthole
  const bodyTop = cy + 0.8;
  const parts = [
    capcone('nozzle', [0, 0.12, 0], 0.27, 0.36, 0.2, 'metal', 0, 0.025),
    cone('body', [0, 0.62, 0], [0, bodyTop, 0], 0.64, R, 'shell', 0.06),
    cone('nose', [0, bodyTop, 0], [0, bodyTop + 1.3, 0], R, 0.06, 'shell', 0.02),
    fins('fins', 3, Math.PI / 3, [[0.5, 1.35], [0.45, 0.28], [1.38, -0.32], [1.32, 0.18]], 0.075, 'trim', 0.03),
  ];
  const bands = [
    { part: 'body', y0: low - 0.48, y1: low - 0.34, slot: 'trim' }, // a red ring above the fins
    { part: 'body', y0: bodyTop - 0.3, y1: bodyTop - 0.16, slot: 'trim' }, // and under the nose
    { part: '*', y0: bodyTop - 0.02, y1: bodyTop + 2, slot: 'trim' }, // the nose, by height: the body's cap and the nose's base coincide
  ];
  const windows = [{ host: 'body', yaw: 0, y: cy, w: CAPT, h: CAPT, n: 2, frame: CAPT_FRAME, frameSlot: 'gold' }];
  const crew = [captainSeat(helmetSeat(...polar(R - 0.31, 0, 0).map((x, i) => (i === 1 ? cy - 0.1 : x)), 0))]; // low in the porthole, so the cap shows inside it
  for (let i = 0; i < mates; i++) {
    const y = top - i * PITCH;
    const yaw = mates === 1 ? 0 : i % 2 ? 0.4 : -0.4;
    windows.push({ host: 'body', yaw, y, w: PORT, h: PORT, n: 2, frame: FRAME });
    const [x, , z] = polar(R - 0.31, yaw, 0); // the visor just behind the glass (the bob and sway keep it inside)
    crew.push(helmetSeat(x, y, z, yaw));
  }
  return { parts, bands, windows, crew, glass: [], lights: [], flames: [{ a: [0, -0.15, 0], r: 0.27, len: 0.8 }], plan };
}

// ---------------------------------------------------------------- B: chubby capsule
// A fat orange gumdrop on three stubby legs, with a white bumper ring and an antenna with a blinking
// ball. The crew sits behind one big wraparound window, like a bus windscreen: the captain alone at the
// front, in the middle, then rows of four and three raised behind. A second deck adds a second window
// band on a taller body.
function buildB(n) {
  const plan = crewPlan(n);
  const two = plan.decks === 2;
  const lift = two ? 1.2 : 0; // the second deck raises the top
  const parts = [
    capcone('nozzle', [0, -0.18, 0], 0.2, 0.42, 0.3, 'metal', 0, 0.03),
    cone('body', [0, 1.0, 0], [0, 1.95 + lift, 0], 1.14, two ? 0.9 : 0.74, 'shell', 0),
    torus('bumper', [0, 0.5, 0], 1.0, 0.13, 'trim', 0.03),
    ...[0, 1, 2].flatMap((i) => {
      const yaw = Math.PI / 3 + (i * 2 * Math.PI) / 3;
      return [
        cone(`leg${i}`, polar(0.7, yaw, 0.3), polar(1.18, yaw, -0.42), 0.12, 0.09, 'metal', 0.02),
        ellipsoid(`foot${i}`, polar(1.24, yaw, -0.48), [0.22, 0.09, 0.22], 'metal', 0.03),
      ];
    }),
    cone('mast', [0, 2.5 + lift, 0], [0, 3.0 + lift, 0], 0.06, 0.04, 'metal', 0.03),
  ];
  const lights = [{ c: [0, 3.08 + lift, 0], r: 0.13, mode: 'blink', phase: 0, ball: true }];
  parts.push(sphere('beacon', lights[0].c, lights[0].r, 'trim', 0.02));
  const windows = [{ host: 'body', yaw: 0, y: 1.41, w: 1.02, h: 0.6, n: 4, frame: 0.09 }];
  if (two) windows.push({ host: 'body', yaw: 0, y: 2.62, w: 0.9, h: 0.44, n: 4, frame: 0.09 });
  const face = (x) => Math.atan2(x, 2.2);
  const crew = [captainSeat(helmetSeat(0, 1.08, 0.66, 0))];
  // deck 1 behind the captain: a row of 4 raised over the captain's cap, then 3 more raised again
  const k1 = plan.perDeck[0] - 1;
  const r2 = Math.min(k1, 4), r3 = k1 - r2;
  for (const x of spread(r2, 0.22 * (r2 - 1))) crew.push(helmetSeat(x, 1.5, 0.3, face(x)));
  for (const x of spread(r3, 0.22 * (r3 - 1))) crew.push(helmetSeat(x, 1.76, 0.1, face(x)));
  if (two) {
    // deck 2: a front row of 4 and a back row of 4, set back so their legs hang behind deck 1
    const k2 = plan.perDeck[1], f = Math.min(k2, 4), b = k2 - f;
    for (const x of spread(f, 0.19 * (f - 1))) crew.push(helmetSeat(x, 2.48, -0.12, face(x)));
    for (const x of spread(b, 0.18 * (b - 1))) crew.push(helmetSeat(x, 2.84, -0.46, face(x)));
  }
  return { parts, bands: [], windows, crew, glass: [], lights, flames: [{ a: [0, -0.38, 0], r: 0.34, len: 0.62 }], plan };
}

// ---------------------------------------------------------------- C: bubble top
// A short mauve rocket with three fins, carrying a big glass dome on a collar: the crew stands inside
// on a floor, in full view. The captain stands front and centre on a gold pedestal, a row of four
// stands behind and three more on a bench at the back. A second deck stacks a second dome on top.
function buildC(n) {
  const plan = crewPlan(n);
  const DOME = 1.22, FLOOR = 1.52;
  const parts = [
    capcone('nozzle', [0, 0.0, 0], 0.24, 0.32, 0.2, 'metal', 0, 0.025),
    cone('body', [0, 0.55, 0], [0, 1.12, 0], 0.55, 0.68, 'shell', 0.04),
    fins('fins', 3, Math.PI / 3, [[0.45, 1.08], [0.42, 0.3], [1.08, -0.22], [1.02, 0.28]], 0.07, 'trim', 0.03),
    torus('collar', [0, 1.38, 0], 0.8, 0.15, 'trim', 0.05),
    disc('floor', [0, FLOOR, 0], 0, 0.84, 0.05, 'metal', 0.02),
    disc('pedestal', [0, FLOOR + 0.08, 0.44], 0, 0.24, 0.06, 'gold', 0.02),
  ];
  const glass = [{ c: [0, FLOOR + DOME - 0.38, 0], r: DOME }];
  const crew = [captainSeat(seat(0, FLOOR + 0.14, 0.44, 0))];
  const face = (x) => Math.atan2(x, 2.4);
  const bench = (floorY, idx, h = 0.12) => parts.push(box(`bench${idx}`, [0, floorY + h, -0.36], [0.62, h, 0.2], 'metal', 0.02));
  // deck 1 behind the captain: four on the floor either side of the captain's line, three on the bench
  const k1 = plan.perDeck[0] - 1, r2 = Math.min(k1, 4), r3 = k1 - r2;
  const row2 = [-0.4, 0.4, -0.82, 0.82].slice(0, r2).sort((a, b) => a - b);
  for (const x of row2) crew.push(seat(x, FLOOR + 0.05, 0.08 - 0.1 * Math.abs(x), face(x)));
  if (r3 > 0) bench(FLOOR, 0, 0.24); // a riser: its heads clear the captain's cap
  for (const x of spread(r3, 0.21 * (r3 - 1))) crew.push(seat(x, FLOOR + 0.53, -0.36, face(x)));
  if (plan.decks === 2) {
    const f2 = glass[0].c[1] + DOME - 0.18;
    parts.push(torus('collar2', [0, f2 - 0.1, 0], 0.74, 0.13, 'trim', 0.04), disc('floor2', [0, f2, 0], 0, 0.8, 0.05, 'metal', 0.02));
    glass.push({ c: [0, f2 + DOME - 0.38, 0], r: DOME });
    const k2 = plan.perDeck[1], f = Math.min(k2, 4), b = k2 - f;
    if (b > 0) bench(f2, 1);
    for (const x of spread(f, 0.21 * (f - 1))) crew.push(seat(x, f2 + 0.05, 0.3 - 0.12 * Math.abs(x), face(x)));
    for (const x of spread(b, 0.19 * (b - 1))) crew.push(seat(x, f2 + 0.29, -0.36, face(x)));
  }
  return { parts, bands: [{ part: 'body', y0: 0.82, y1: 0.94, slot: 'trim' }], windows: [], crew, glass, lights: [], flames: [{ a: [0, -0.24, 0], r: 0.24, len: 0.7 }], plan };
}

// ---------------------------------------------------------------- D: ringed retro
// A navy onion body with a white needle nose and antenna ball, on three thin legs, wearing a wide
// orange ring deck like a planet's ring. The crew stands on the ring, facing out: the captain at the
// front on a white podium, the teammates alternating either side round the front. The ring's edge
// carries a marquee of chasing lights. A second deck adds a second, smaller ring higher up.
function buildD(n) {
  const plan = crewPlan(n);
  const two = plan.decks === 2;
  const RING_Y = two ? [0.95, 2.45] : [1.25];
  const bodyC = two ? [0, 1.7, 0] : [0, 1.28, 0], bodyR = two ? [0.86, 1.6, 0.86] : [0.86, 0.98, 0.86];
  const noseY = bodyC[1] + bodyR[1] - 0.3;
  const parts = [
    capcone('nozzle', [0, 0.18, 0], 0.18, 0.26, 0.17, 'metal', 0, 0.02),
    ellipsoid('body', bodyC, bodyR, 'shell', 0),
    cone('nose', [0, noseY, 0], [0, noseY + 1.15, 0], 0.42, 0.05, 'trim', 0.08),
    ...[0, 1, 2].flatMap((i) => {
      const yaw = Math.PI / 3 + (i * 2 * Math.PI) / 3;
      return [
        cone(`leg${i}`, polar(0.42, yaw, 0.62), polar(1.0, yaw, -0.32), 0.085, 0.065, 'metal', 0.02),
        sphere(`foot${i}`, polar(1.02, yaw, -0.36), 0.13, 'metal', 0.02),
      ];
    }),
  ];
  const ballY = noseY + 1.15 + 0.12;
  parts.push(sphere('ball', [0, ballY, 0], 0.14, 'trim', 0.02));
  const lights = [], crew = [];
  // two decks stack like a wedding cake: the upper ring is smaller, so the lower deck's crew stays in
  // view from above, and the lower deck keeps to the front, out from under the upper ring
  const RING_R = [2.05, 1.8], SEAT_R = [1.42, 1.3], SPAN = [two ? 100 : 120, 88];
  RING_Y.forEach((y, d) => {
    parts.push(disc(`ring${d}`, [0, y, 0], 0.5, RING_R[d], 0.085, 'ring', 0.06, 0.05));
    for (let i = 0; i < 12; i++) lights.push({ c: polar(RING_R[d] + 0.01, (i * Math.PI * 2) / 12, y), r: 0.1, mode: 'chase' });
    const deckTop = y + 0.085 - 0.03;
    if (d === 0) {
      // the captain's podium at the front, and the teammates alternating either side of it
      parts.push(disc('podium', polar(SEAT_R[0], 0, deckTop + 0.06), 0, 0.24, 0.07, 'trim', 0.02));
      crew.push(captainSeat(seat(...polar(SEAT_R[0], 0, deckTop + 0.13), 0)));
      const k = plan.perDeck[0] - 1, step = k ? Math.min(34, SPAN[0] / Math.ceil(k / 2)) : 0;
      for (let i = 0; i < k; i++) { const yaw = ((i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2) * step * Math.PI) / 180; crew.push(seat(...polar(SEAT_R[0], yaw, deckTop), yaw)); }
    } else {
      const k = plan.perDeck[1];
      const span = k === 1 ? 0 : Math.min((SPAN[1] * Math.PI) / 180, ((k - 1) * 40 * Math.PI) / 180 / 2); // round the front: the back of the ring hides behind the body
      for (const yaw of spread(k, span)) crew.push(seat(...polar(SEAT_R[d], yaw, deckTop), yaw));
    }
  });
  return { parts, bands: [], windows: [], crew, glass: [], lights, flames: [{ a: [0, -0.02, 0], r: 0.17, len: 0.55 }], plan };
}

export const BUILDERS = { A: buildA, B: buildB, C: buildC, D: buildD };
