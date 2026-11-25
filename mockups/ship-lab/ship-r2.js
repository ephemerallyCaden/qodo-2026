// Round 2 (human, 2026-11-25): "like the finned classic but shorter, fatter and rounder, and the window
// has a chunkier rim and is a bit chunkier in general". Five variations R2-1..R2-5 of one base: a round
// body (a sphere, or a capsule of two once a second deck stretches it), a chunky bullet or dome nose,
// chunky fins and nozzle, and windows that are exact circles on the body with a raised torus rim (a
// thick ring, lit like the hull). Same rules as round 1: seat 0 is the captain (the cap plus a seat of
// their own), crew order is by person id, 8 a deck, a second deck for 9-16, "+N" past 16. Pure.
import { cone, capcone, sphere, disc, box, fins, polar, spread, seat, helmetSeat, captainSeat, crewPlan, SEATS_PER_DECK } from './ship-spec.js';

const TUBE = 0.058; // a teammate's rim tube radius: 0.116 thick, about 3.3 px at the near distance
const SEAT_DEPTH = 0.31; // a helmet's centre this far inside the hull behind its window (round 1's A)
const dir = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
const add = (a, b, k = 1) => a.map((x, i) => x + k * b[i]);

/**
 * A round window of radius rw on the round body, centred at height y and facing yaw: the see-through cap
 * on its local sphere (centre c on the axis, radius rs), its raised rim (a torus on the circle where the
 * cap meets the sphere), and the helmet seat straight back from it, so from the front the visor sits in
 * the middle of the window (`low` drops it a little, for the captain's cap to show).
 */
function porthole(id, c, rs, yaw, y, rw, { tube = TUBE, slot = 'metal', hosts = ['body'], low = 0 } = {}) {
  const pitch = Math.asin(Math.max(-0.95, Math.min(0.95, (y - c[1]) / rs)));
  const n = dir(yaw, pitch), angle = Math.asin(rw / rs);
  // the rim rides just outside the opening, so a chunky rim doesn't shrink the window
  const ra = Math.asin(Math.min(0.98, (rw + 0.8 * tube) / rs));
  const window = { kind: 'cap', c, n, angle, frame: ra - angle + tube / rs, frameSlot: slot, hosts };
  const rim = { id, kind: 'ring', c: add(c, n, rs * Math.cos(ra)), n, R: rs * Math.sin(ra), r: tube, slot, k: 0.025 };
  const surface = add(c, n, rs), back = [Math.sin(yaw), 0, Math.cos(yaw)];
  const h = add(surface, back, -SEAT_DEPTH);
  return { window, rim, seat: helmetSeat(h[0], h[1] - low, h[2], yaw) };
}

/**
 * The shared base: a round body of radius R, a short capsule from its lower sphere centre cy up to
 * top = cy + stretch (a second deck stretches it further); a nose ('point': a chunky bullet; 'dome':
 * blunt, with a blinking antenna ball; 'none': for a glass nose); n chunky fins; a chunky bell nozzle;
 * the red nose band. Windows sit at or above each sphere's equator, so a standing astronaut behind
 * one stays inside the hull to the boots.
 */
function base({ R, cy, stretch = 0, nose = 'point', nFins = 3, stance = 1, cut }) {
  const top = cy + stretch;
  const body = stretch ? cone('body', [0, cy, 0], [0, top, 0], R, R, 'shell', 0) : sphere('body', [0, cy, 0], R, 'shell');
  if (cut !== undefined) body.cutY = top + cut;
  const parts = [
    capcone('nozzle', [0, cy - R + 0.05, 0], 0.24, 0.5, 0.36, 'metal', 0, 0.06), // tucked up into the round bottom
    body,
    fins('fins', nFins, nFins === 4 ? Math.PI / 4 : Math.PI / 3, [[0.85, cy - 0.15], [0.6, cy - 0.95], [1.75 * stance, cy - 1.62], [1.65 * stance, cy - 1.0]], 0.11, 'trim', 0.03, 0.06),
  ];
  const bands = [];
  const lights = [];
  if (nose === 'point') {
    parts.push(cone('nose', [0, top + 0.95, 0], [0, top + 1.68, 0], 0.66, 0.26, 'shell', 0.2)); // short and chunky, with a round tip
    bands.push({ part: '*', y0: top + 1.05, y1: top + 9, slot: 'trim' });
  } else if (nose === 'dome') {
    parts.push(cone('nose', [0, top + 0.85, 0], [0, top + 1.2, 0], 0.82, 0.5, 'shell', 0.2), cone('mast', [0, top + 1.5, 0], [0, top + 1.72, 0], 0.075, 0.055, 'metal', 0.03));
    bands.push({ part: '*', y0: top + 1.02, y1: top + 1.62, slot: 'trim' });
    lights.push({ c: [0, top + 1.8, 0], r: 0.15, mode: 'blink', phase: 0, ball: true });
    parts.push(sphere('beacon', lights[0].c, lights[0].r, 'trim', 0.02));
  }
  if (nFins === 4) for (let i = 0; i < 4; i++) parts.push(sphere(`foot${i}`, polar(1.72 * stance, Math.PI / 4 + (i * Math.PI) / 2, cy - 1.58), 0.15, 'metal', 0.04)); // ball feet on the wide stance
  return { parts, bands, lights, top, cy, R, flames: [{ a: [0, cy - R - 0.2, 0], r: 0.4, len: 0.52 }] };
}

/** Rows of portholes on the capsule: [{ y, yaws }] -> windows, rims, seats, filled in order. */
function portholeRows(b, rows, k, rw = 0.23) {
  const out = { windows: [], rims: [], seats: [] };
  let i = 0;
  for (const row of rows) for (const yaw of row.yaws) {
    if (i >= k) return out;
    const p = porthole(`port${i}`, [0, Math.min(Math.max(row.y, b.cy), b.top), 0], b.R, yaw, row.y, rw);
    out.windows.push(p.window); out.rims.push(p.rim); out.seats.push(p.seat);
    i++;
  }
  return out;
}
// Honeycomb rows below the captain, from the top down: 2, 3, 2 on deck 1 and 3, 2, 3 on deck 2, 0.5
// apart, never turned more than 0.62 rad (36°) from the front: past that, a helmet behind its window
// hides in the hull's depth from the front. HEX_SPAN is the capsule length the rows need.
const HEX = [[-0.31, 0.31], [0, -0.62, 0.62], [-0.31, 0.31], [0, -0.62, 0.62], [-0.31, 0.31], [0, -0.62, 0.62]];
const HEX_PITCH = 0.5;
const hexRows = (from, decks, start = 0) => HEX.slice(start, start + (decks === 2 ? 6 : 3)).map((yaws, i) => ({ y: from - i * HEX_PITCH, yaws }));
const LIFT = 0.08; // the lowest row sits this far above the lower sphere's equator, so its boots stay inside
const hexSpan = (decks) => (decks === 2 ? 5 : 2) * HEX_PITCH + LIFT;
const STRETCH = 1.25; // what a second deck adds to R2-3's capsule
/** Deck 2's rows on a stretched straight section: 3, 2, 3. */
const deck2Rows = (b, from) => HEX.slice(3).map((yaws, i) => ({ y: from - i * HEX_PITCH, yaws }));

const assemble = (b, extra) => ({ parts: [...b.parts, ...(extra.parts ?? [])], bands: b.bands, windows: extra.windows ?? [], crew: extra.crew, glass: extra.glass ?? [], lights: b.lights, flames: b.flames, plan: extra.plan });

// ---------------------------------------------------------------- R2-1: a porthole each
// Every astronaut looks out of a round porthole of their own with a thick grey rim, in honeycomb
// rows; the captain's is bigger, gold-rimmed, at the top under the nose.
function buildR21(n) {
  const plan = crewPlan(n), R = 1.2, top0 = 0.12;
  const b = base({ R, cy: 1.5, stretch: top0 + hexSpan(plan.decks) });
  const capt = porthole('captain', [0, b.top, 0], R, 0, b.top + 0.56, 0.3, { tube: 0.085, slot: 'gold', low: 0.14 });
  const r = portholeRows(b, hexRows(b.top - top0, plan.decks), plan.drawn - 1, 0.2);
  return assemble(b, { parts: [capt.rim, ...r.rims], windows: [capt.window, ...r.windows], crew: [captainSeat(capt.seat), ...r.seats], plan });
}

// ---------------------------------------------------------------- R2-2: one big window
// One big round window with a thick rim holds the crew together: the captain at the front, low and in
// the middle, with rows of four and three raised behind. A second deck adds a second, lower bulb with
// its own big window (a double bubble).
function buildR22(n) {
  const plan = crewPlan(n), R = 1.15, two = plan.decks === 2;
  const cy = 1.5, top = two ? cy + 1.75 : cy + 0.3;
  const b = base({ R, cy: two ? top : cy, stretch: two ? 0 : 0.3 }); // deck 1's bulb carries the nose
  if (two) {
    // the lower bulb (deck 2) carries the fins and nozzle; the upper is joined to it
    b.parts = b.parts.filter((q) => q.id !== 'fins' && q.id !== 'nozzle');
    const low = base({ R, cy, nose: 'none' });
    b.parts.push(...low.parts.filter((q) => q.id !== 'body'), { ...sphere('bulb', [0, cy, 0], R, 'shell'), k: 0.3 });
    b.flames = low.flames;
  }
  const big = porthole('window', [0, top, 0], R, 0, top + 0.06, 0.74, { tube: 0.12, hosts: ['body', ...(two ? ['bulb'] : [])] });
  const crew = [captainSeat(helmetSeat(0, top - 0.25, 0.62, 0))];
  const face = (x) => Math.atan2(x, 2.2);
  const k1 = plan.perDeck[0] - 1, r2 = Math.min(k1, 4), r3 = k1 - r2;
  for (const x of spread(r2, 0.21 * (r2 - 1))) crew.push(helmetSeat(x, top + 0.08, 0.3, face(x)));
  for (const x of spread(r3, 0.21 * (r3 - 1))) crew.push(helmetSeat(x, top + 0.4, 0.0, face(x)));
  const windows = [big.window], parts = [big.rim];
  if (two) {
    const lower = porthole('window2', [0, cy, 0], R, 0, cy + 0.16, 0.66, { tube: 0.12, hosts: ['body', 'bulb'] });
    windows.push(lower.window); parts.push(lower.rim);
    const k2 = plan.perDeck[1], f = Math.min(k2, 4), bk = k2 - f;
    for (const x of spread(f, 0.19 * (f - 1))) crew.push(helmetSeat(x, cy + 0.06, 0.36, face(x)));
    for (const x of spread(bk, 0.18 * (bk - 1))) crew.push(helmetSeat(x, cy + 0.5, 0.0, face(x))); // raised so the visors clear the front row's helmets
  }
  return assemble(b, { parts, windows, crew, plan });
}

// ---------------------------------------------------------------- R2-3: glass nose
// The nose is a clear dome on a chunky red collar: the crew stands inside it in full view, the captain
// front and centre on a gold pedestal. A second deck stretches the body below with two rows of portholes.
function buildR23(n) {
  const plan = crewPlan(n), R = 1.1, cy = 1.35, stretch = plan.decks === 2 ? STRETCH : 0;
  const CUT = 0.72;
  const b = base({ R, cy, stretch, nose: 'none', cut: CUT });
  const f = b.top + CUT; // the floor
  const DOME = 1.1;
  const parts = [
    { id: 'collar', kind: 'torus', c: [0, f, 0], R: Math.sqrt(R * R - CUT * CUT), r: 0.17, slot: 'trim', k: 0.04 },
    disc('floor', [0, f + 0.02, 0], 0, Math.sqrt(R * R - CUT * CUT) - 0.02, 0.05, 'metal', 0.02),
    disc('pedestal', [0, f + 0.1, 0.42], 0, 0.22, 0.06, 'gold', 0.02),
  ];
  const glass = [{ c: [0, f + DOME - 0.48, 0], r: DOME }];
  const crew = [captainSeat(seat(0, f + 0.16, 0.42, 0))];
  const face = (x) => Math.atan2(x, 2.4);
  const k1 = plan.perDeck[0] - 1, r2 = Math.min(k1, 4), r3 = k1 - r2;
  for (const x of [-0.38, 0.38, -0.76, 0.76].slice(0, r2).sort((p, q) => p - q)) crew.push(seat(x, f + 0.07, 0.02 - 0.12 * Math.abs(x), face(x)));
  if (r3 > 0) parts.push(box('riser', [0, f + 0.22, -0.4], [0.6, 0.22, 0.18], 'metal', 0.02));
  for (const x of [-0.46, 0.46, 0].slice(0, r3).sort((p, q) => p - q)) crew.push(seat(x, f + 0.46, -0.4, face(x)));
  const r = stretch ? portholeRows(b, deck2Rows(b, b.top + 0.1), plan.perDeck[1], 0.2) : { windows: [], rims: [], seats: [] };
  return assemble(b, { parts: [...parts, ...r.rims], windows: r.windows, crew: [...crew, ...r.seats], glass, plan });
}

// ---------------------------------------------------------------- R2-4: round lander
// The fattest of the five: a wider round body on four wide-splayed fins with ball feet, a blunt dome nose
// with a blinking antenna ball, and a red belly band holding the honeycomb of portholes; the captain's
// big gold porthole sits above the band.
function buildR24(n) {
  const plan = crewPlan(n), R = 1.28, top0 = 0.12;
  const b = base({ R, cy: 1.45, stretch: top0 + hexSpan(plan.decks), nose: 'dome', nFins: 4, stance: 1.22 });
  b.bands.push({ part: 'body', y0: b.cy - 0.3, y1: b.top + 0.12, slot: 'trim' }); // the belly band, under the captain's porthole
  const capt = porthole('captain', [0, b.top, 0], R, 0, b.top + 0.58, 0.3, { tube: 0.085, slot: 'gold', low: 0.14 });
  const r = portholeRows(b, hexRows(b.top - top0, plan.decks), plan.drawn - 1, 0.2);
  return assemble(b, { parts: [capt.rim, ...r.rims], windows: [capt.window, ...r.windows], crew: [captainSeat(capt.seat), ...r.seats], plan });
}

// ---------------------------------------------------------------- R2-5: bridge window
// A big round gold-rimmed bridge window up front holds the captain and two teammates; the other five
// look out of small portholes in honeycomb rows beneath it.
function buildR25(n) {
  const plan = crewPlan(n), R = 1.15, top0 = 0.74;
  const b = base({ R, cy: 1.45, stretch: top0 + (plan.decks === 2 ? 4 : 1) * HEX_PITCH + LIFT + 0.04 }); // a smaller body: a little more lift
  const bridge = porthole('bridge', [0, b.top, 0], R, 0, b.top + 0.3, 0.5, { tube: 0.11, slot: 'gold' });
  const crew = [captainSeat(helmetSeat(0, b.top + 0.1, 0.6, 0))];
  const k1 = plan.perDeck[0] - 1, inBridge = Math.min(k1, 2);
  for (const x of spread(inBridge, 0.34 * (inBridge - 1)).map((x) => (inBridge === 1 ? -0.34 : x))) crew.push(helmetSeat(x, b.top + 0.42, 0.3, Math.atan2(x, 2.2)));
  const rows = HEX.slice(1, plan.decks === 2 ? 6 : 3).map((yaws, i) => ({ y: b.top - top0 - i * HEX_PITCH, yaws })); // 3, 2 under the bridge; then 3, 2, 3
  const r = portholeRows(b, rows, plan.drawn - 1 - inBridge, 0.2);
  return assemble(b, { parts: [bridge.rim, ...r.rims], windows: [bridge.window, ...r.windows], crew: [...crew, ...r.seats], plan });
}

// ---------------------------------------------------------------- R2-4b: one column, one colour
// The human, 2026-11-25, on R2-4: "the windows are different colours, they should all be the same colour
// and also stack them vertically in a line instead of being stacked randomly". So R2-4's round lander
// (body, splayed fins with ball feet, dome nose and blinking antenna) with no belly band, and every
// porthole alike: one size, one grey rim, in a single column down the front, the captain at the top
// (seat 0, in the cap), the teammates below in person-id order. The capsule is as long as eight
// portholes need. A second deck (9-16) adds a second column beside the first, on the same rows, so the
// ship gets no taller; both columns then sit either side of the front.
export const R24B = { R: 1.28, rw: 0.24, tube: 0.05, pitch: 0.66, above: 0.3, low: 0.17, cols: [[0], [-0.24, 0.24]] };
function buildR24b(n) {
  const plan = crewPlan(n), { R, rw, tube, pitch, above, low } = R24B;
  const b = base({ R, cy: 1.45, stretch: (SEATS_PER_COLUMN - 1) * pitch + LIFT - above, nose: 'dome', nFins: 4, stance: 1.22 });
  const yaws = R24B.cols[plan.decks - 1];
  const parts = [], windows = [], crew = [];
  for (let i = 0; i < plan.drawn; i++) {
    const col = Math.floor(i / SEATS_PER_COLUMN), row = i % SEATS_PER_COLUMN, y = b.top + above - row * pitch;
    const p = porthole(`port${i}`, [0, Math.min(Math.max(y, b.cy), b.top), 0], R, yaws[col], y, rw, { tube, low: i === 0 ? low : 0 });
    parts.push(p.rim); windows.push(p.window); crew.push(i === 0 ? captainSeat(p.seat) : p.seat);
  }
  return assemble(b, { parts, windows, crew, plan });
}
const SEATS_PER_COLUMN = 8;

// ---------------------------------------------------------------- R2-4c: straight columns (an alternative)
// One reading of "stack them vertically in a line": straight columns instead of R2-4's staggered
// honeycomb. The captain on top in the middle, the teammates in rows of three below, each column a
// straight vertical line, every porthole alike. It keeps R2-4's round, fat proportions (one column of
// eight can't: R2-4b). A second deck adds three more rows. The human's pick (2026-11-25) is R2-4c with
// R2-4's red belly band back: R2-4c-final.
export const R24C = { R: 1.28, rw: 0.24, tube: 0.05, pitch: 0.66, above: 0.42, low: 0.17, col: 0.54 }; // col: the side columns' yaw (31°)
function buildR24c(n, { band = false } = {}) {
  const plan = crewPlan(n), { R, rw, tube, pitch, above, low, col } = R24C;
  const rows = Math.ceil((SEATS_PER_DECK * plan.decks - 1) / 3); // rows of teammates the decks need
  const b = base({ R, cy: 1.45, stretch: rows * pitch - above + LIFT, nose: 'dome', nFins: 4, stance: 1.22 });
  if (band) b.bands.push({ part: 'body', y0: b.cy - 0.3, y1: b.top + 0.12, slot: 'trim' }); // R2-4's red belly band, exactly
  const parts = [], windows = [], crew = [];
  const add = (i, yaw, y) => {
    const p = porthole(`port${i}`, [0, Math.min(Math.max(y, b.cy), b.top), 0], R, yaw, y, rw, { tube, low: i === 0 ? low : 0 });
    parts.push(p.rim); windows.push(p.window); crew.push(i === 0 ? captainSeat(p.seat) : p.seat);
  };
  add(0, 0, b.top + above);
  // rows of three in person-id order, left to right; a short last row stays on the columns, centred (1: middle, 2: the sides)
  const ROW = { 1: [0], 2: [-col, col], 3: [-col, 0, col] };
  for (let i = 1, row = 1; i < plan.drawn; row++) {
    const k = Math.min(3, plan.drawn - i);
    for (const yaw of ROW[k]) add(i++, yaw, b.top + above - row * pitch);
  }
  return assemble(b, { parts, windows, crew, plan });
}

export const R2_BUILDERS = { 'R2-1': buildR21, 'R2-2': buildR22, 'R2-3': buildR23, 'R2-4': buildR24, 'R2-5': buildR25, 'R2-4b': buildR24b, 'R2-4c': (n) => buildR24c(n), 'R2-4c-final': (n) => buildR24c(n, { band: true }) };
