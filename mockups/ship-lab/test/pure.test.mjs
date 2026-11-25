// Pure-JS checks: palettes (BLK 36 only, teal never at rest), the crew plan and overflow rule, seats,
// the 2 px rule at the near distance, determinism, the loop lock, the checks failing on empty output,
// and the server allowlist. No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { mapPalette } from '../../asset-viewer/palette-map.js';
import { LOSPEC } from '../../asset-viewer/palettes.js';
import { VARIANTS, R2_VARIANTS, R2B_VARIANTS, FINAL_VARIANTS, ALL_VARIANTS, specOf } from '../variants.js';
import { shipBounds } from '../ship-glsl.js';
import { RAMPS, TEAL, BLK36, CAP_PALETTE, paletteHexes, tealThrust } from '../palette.js';
import { BUILDERS, CAP, SHIP_SCALE, CYCLE, CYCLES, SEATS_PER_DECK, MAX_DECKS, HELMET_Y, crewPlan, idleAt, flameAt, flameLive, liveReach, LIVE, lightOn, hash01 } from '../ship-spec.js';
import { R24C } from '../ship-r2.js';
import { FLYBY, passAt, shipAt, middleAt, project, cameraFrame, timeAt } from '../flyby.js';
import { shipGlsl, SLOTS, MAX_LIGHTS } from '../ship-glsl.js';
import { tileProblems, seamProblems } from '../checks.mjs';
import { resolveFile } from '../routes.mjs';

const blk = mapPalette('blk-36');

test('BLK 36 here is the published palette', () => {
  assert.deepEqual(BLK36, LOSPEC['blk-36'].colors.map((c) => `#${c}`));
});

test('every ship colour is BLK 36 (art direction §4), and the teal is only in the option', () => {
  for (const v of ALL_VARIANTS) {
    for (const h of paletteHexes(v.palette)) assert.ok(BLK36.includes(h), `${v.id}: ${h} is not BLK 36`);
    for (const t of TEAL) assert.ok(!paletteHexes(v.palette).includes(t), `${v.id}: teal ${t} at rest`);
    const opt = tealThrust(v.palette);
    assert.deepEqual(opt.flame, TEAL);
    assert.deepEqual({ ...opt, flame: null }, { ...v.palette, flame: null }, 'the option changes the thrust only');
  }
  for (const [name, ramp] of Object.entries(RAMPS)) for (const h of ramp) assert.ok(BLK36.includes(h), `${name}: ${h}`);
  // the ship is the crew's kit: its metal is their gear ramp, its glass their visor's near-blacks
  assert.deepEqual(RAMPS.metal, blk.gear);
  assert.deepEqual(RAMPS.glass.slice(0, 2), blk.visor);
  assert.ok(!RAMPS.glass.includes('#0f4a4c') && !Object.values(RAMPS).flat().includes('#0f4a4c'), 'no teal slate (it reads as the event teal)');
});

test('the four directions are four builders with their own palettes and pitches', () => {
  assert.deepEqual(VARIANTS.map((v) => v.id), ['A', 'B', 'C', 'D']);
  assert.deepEqual(Object.keys(BUILDERS), ['A', 'B', 'C', 'D']);
  for (const v of VARIANTS) assert.ok(v.name && v.pitch.length > 40 && v.crewSeen, v.id);
  const looks = VARIANTS.map((v) => `${v.palette.shell}|${v.palette.trim}`);
  assert.equal(new Set(looks).size, 4, 'each direction has its own colours');
  // different silhouettes: different part kinds and counts, not just trim
  const sig = VARIANTS.map((v) => specOf(v.id, 3).parts.map((p) => p.kind).join(','));
  assert.equal(new Set(sig).size, 4);
});

test('overflow rule: 8 seats a deck, at most 2 decks, then +N', () => {
  assert.deepEqual(crewPlan(1), { n: 1, drawn: 1, decks: 1, extra: 0, perDeck: [1, 0] });
  assert.deepEqual(crewPlan(8), { n: 8, drawn: 8, decks: 1, extra: 0, perDeck: [8, 0] });
  assert.deepEqual(crewPlan(9), { n: 9, drawn: 9, decks: 2, extra: 0, perDeck: [8, 1] });
  assert.deepEqual(crewPlan(16), { n: 16, drawn: 16, decks: 2, extra: 0, perDeck: [8, 8] });
  assert.deepEqual(crewPlan(20), { n: 20, drawn: 16, decks: 2, extra: 4, perDeck: [8, 8] });
  assert.equal(SEATS_PER_DECK * MAX_DECKS, 16);
  for (const v of ALL_VARIANTS) for (let n = 1; n <= 24; n++) {
    const s = specOf(v.id, n);
    assert.equal(s.crew.length, Math.min(n, 16), `${v.id} n=${n}: seats`);
    assert.equal(s.plan.decks, n > 8 ? 2 : 1);
    assert.ok(s.lights.length <= MAX_LIGHTS);
  }
  // a second deck changes the ship (every direction grows one), a ninth crew member doesn't add a third
  for (const v of ALL_VARIANTS) {
    assert.notEqual(shipGlsl(specOf(v.id, 8)), shipGlsl(specOf(v.id, 9)), `${v.id}: no second deck`);
    assert.equal(shipGlsl(specOf(v.id, 16)), shipGlsl(specOf(v.id, 24)), `${v.id}: past 16 the ship stays the same`);
  }
});

test('the captain (the repo owner) is seat 0 of every ship, alone, in a seat of their own', () => {
  for (const v of ALL_VARIANTS) {
    assert.ok(v.captain && v.captain.length > 10, `${v.id}: no captain description`);
    for (let n = 1; n <= 24; n++) {
      const crew = specOf(v.id, n).crew;
      assert.equal(crew[0].captain, true, `${v.id} n=${n}: seat 0 isn't the captain`);
      assert.equal(crew.filter((c) => c.captain).length, 1, `${v.id} n=${n}: one captain`);
    }
    const s = specOf(v.id, 8), cap = s.crew[0], helmet = (c) => [c.p[0], c.p[1] + HELMET_Y, c.p[2]];
    const [w0, ...rest] = s.windows;
    if (v.id === 'A') {
      // the biggest porthole, gold-framed, above every teammate's
      assert.ok(rest.every((w) => w0.w > w.w && w0.y > w.y) && w0.frameSlot === 'gold', 'A: the captain\'s porthole');
    } else if (v.id === 'R2-4b' || v.id === 'R2-4c' || v.id === 'R2-4c-final') {
      // every porthole alike: the captain's seat is the top one, on the ship's axis
      const top = (w) => w.c[1] + w.n[1];
      assert.ok(Math.abs(w0.n[0]) < 1e-9 && rest.every((w) => top(w) < top(w0)), `${v.id}: the captain isn't in the top porthole on the axis`);
    } else if (w0?.kind === 'cap' && w0.frameSlot === 'gold') {
      // round 2's captain's porthole or bridge window: gold-rimmed, the biggest, above every teammate's porthole, with the captain behind it
      assert.ok(rest.every((w) => w0.angle > w.angle && w0.n[1] > w.n[1]), `${v.id}: the captain's window isn't the biggest and highest`);
      const h = helmet(cap), to = h.map((x, i) => x - w0.c[i]), len = Math.hypot(...to);
      assert.ok(to.reduce((d, x, i) => d + x * w0.n[i], 0) / len > Math.cos(w0.angle + 0.25), `${v.id}: the captain isn't behind the gold window`);
    } else {
      // front and centre: on the ship's axis and nearer the front than any teammate
      assert.ok(Math.abs(cap.p[0]) < 1e-9, `${v.id}: the captain is off centre`);
      assert.ok(s.crew.slice(1).every((c) => helmet(c)[2] < helmet(cap)[2]), `${v.id}: a teammate stands in front of the captain`);
    }
  }
});

test('the captain\'s cap: BLK 36, a gold crown over a navy band and peak', () => {
  for (const h of paletteHexes(CAP_PALETTE)) assert.ok(BLK36.includes(h), h);
  assert.deepEqual(CAP_PALETTE.gold, RAMPS.gold);
  assert.deepEqual(CAP.parts.map((p) => [p.id, p.slot]), [['crown', 'gold'], ['peak', 'shell']]);
  assert.deepEqual(CAP.bands.map((b) => b.slot), ['shell']);
  assert.ok(CAP.parts.every((p) => SLOTS.includes(p.slot)));
  assert.ok(shipGlsl(CAP).includes('float hull(vec3 p)'), 'the cap compiles to a distance field');
});

test('seats: helmets never stack on one another', () => {
  for (const v of ALL_VARIANTS) for (const n of [3, 8, 16]) {
    const helmets = specOf(v.id, n).crew.map((s) => [s.p[0], s.p[1] + HELMET_Y, s.p[2]]);
    for (let i = 0; i < helmets.length; i++) for (let j = i + 1; j < helmets.length; j++) {
      const d = Math.hypot(...helmets[i].map((x, k) => x - helmets[j][k]));
      assert.ok(d >= 0.35, `${v.id} n=${n}: helmets ${i + 1} and ${j + 1} only ${d.toFixed(2)} apart`);
    }
  }
});

// One internal pixel at the near distance (the drone lab's system distance, 5.98), in design units.
const NEAR_PX_PER_UNIT = (180 / (2 * Math.hypot(1.45, 1.5, 5.6) * Math.tan((17.5 * Math.PI) / 180))) * SHIP_SCALE;
const thinnest = (p) => {
  switch (p.kind) {
    case 'cone': case 'capcone': return 2 * Math.min(p.r1, p.r2);
    case 'sphere': return 2 * p.r;
    case 'ellipsoid': return 2 * Math.min(...p.r);
    case 'torus': case 'ring': return 2 * p.r;
    case 'disc': return 2 * p.h;
    case 'box': return 2 * Math.min(...p.b);
    case 'fin': return 2 * (p.t + p.round);
    default: throw new Error(p.kind);
  }
};
test('every part, frame and light is at least 2 px across at the near distance (art direction §1)', () => {
  for (const v of ALL_VARIANTS) for (const n of [3, 12]) {
    const s = specOf(v.id, n);
    for (const p of s.parts) assert.ok(thinnest(p) * NEAR_PX_PER_UNIT >= 2, `${v.id} ${p.id}: ${(thinnest(p) * NEAR_PX_PER_UNIT).toFixed(2)} px`);
    // a round window's frame is its rim, a part (checked above)
    for (const w of s.windows.filter((x) => x.kind !== 'cap')) assert.ok(w.frame * NEAR_PX_PER_UNIT >= 2, `${v.id}: a window frame is ${(w.frame * NEAR_PX_PER_UNIT).toFixed(2)} px`);
    for (const l of s.lights) assert.ok(2 * l.r * NEAR_PX_PER_UNIT >= 2, `${v.id}: a light is ${(2 * l.r * NEAR_PX_PER_UNIT).toFixed(2)} px`);
    for (const p of s.parts) assert.ok(SLOTS.includes(p.slot), `${v.id} ${p.id}: slot ${p.slot}`);
  }
});

// Inigo Quilez's round cone and a sphere, for the hull checks below.
function roundCone(p, a, b, r1, r2) {
  const ba = b.map((x, i) => x - a[i]), pa = p.map((x, i) => x - a[i]);
  const dot = (u, v) => u.reduce((d, x, i) => d + x * v[i], 0);
  const l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = dot(pa, ba), z = y - l2;
  const xv = pa.map((x, i) => x * l2 - ba[i] * y), x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
const bodyDist = (s, p) => Math.min(...s.parts.filter((q) => q.id === 'body' || q.id === 'bulb').map((q) => (q.kind === 'sphere' ? Math.hypot(...p.map((x, i) => x - q.c[i])) - q.r : roundCone(p, q.a, q.b, q.r1, q.r2))));
test('crew behind windows stays inside the hull, boots included (nothing pokes out below a window)', () => {
  for (const id of ['A', 'B', 'R2-1', 'R2-2', 'R2-4', 'R2-5', 'R2-4b', 'R2-4c', 'R2-4c-final']) for (const n of [1, 3, 8, 12, 16]) {
    const s = specOf(id, n);
    s.crew.forEach((c, i) => {
      // the boot sole (lifted 0.03), its toe (0.09 forward) and the helmet top, with room for the bob (0.05)
      const fwd = [Math.sin(c.yaw), 0, Math.cos(c.yaw)];
      const sole = [c.p[0], c.p[1] + 0.03 - 0.05, c.p[2]], toe = sole.map((x, k) => x + 0.09 * fwd[k]);
      for (const [what, p] of [['boot', sole], ['toe', toe]]) assert.ok(bodyDist(s, p) < -0.02, `${id} n=${n}: astronaut ${i + 1}'s ${what} pokes out (${bodyDist(s, p).toFixed(3)})`);
    });
  }
});

test('round 2: one-deck ships fit the near frame without pulling back; portholes turn at most 0.62 rad', () => {
  // lab.js: the near distance is 5.98 (DIST.near) unless the ship's height passes 86% (NEAR_FILL) of the frame there
  const fits = 0.86 * 2 * Math.tan((17.5 * Math.PI) / 180) * Math.hypot(0.1 + 1.35, 1.3 + 0.2, 10.2 - 4.6);
  for (const v of R2_VARIANTS) for (const n of [1, 3, 8]) {
    const s = specOf(v.id, n), { lo, hi } = shipBounds(s, 0);
    assert.ok((hi[1] - lo[1]) * SHIP_SCALE <= fits, `${v.id} n=${n}: ${((hi[1] - lo[1]) * SHIP_SCALE).toFixed(2)} tall, the near frame holds ${fits.toFixed(2)}`);
  }
  for (const v of [...R2_VARIANTS, ...R2B_VARIANTS, ...FINAL_VARIANTS]) for (const n of [8, 16]) for (const w of specOf(v.id, n).windows) assert.ok(Math.abs(Math.atan2(w.n[0], w.n[2])) <= 0.62 + 1e-9, `${v.id}: a porthole turns ${Math.atan2(w.n[0], w.n[2]).toFixed(2)} rad`);
});

test('deterministic: the same crew count gives the same ship, byte for byte', () => {
  for (const v of ALL_VARIANTS) for (const n of [1, 3, 8, 12, 20]) {
    assert.equal(JSON.stringify(specOf(v.id, n)), JSON.stringify(specOf(v.id, n)));
    assert.equal(shipGlsl(specOf(v.id, n)), shipGlsl(specOf(v.id, n)));
  }
  assert.equal(hash01(5, 11), hash01(5, 11));
  assert.notEqual(hash01(5, 11), hash01(6, 11));
});

test('no Math.random, Date.now, performance.now or new Date() in the lab\'s render code', async () => {
  const dir = new URL('../', import.meta.url);
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.js'))) {
    const src = (await readFile(new URL(f, dir), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // code only, not comments
    for (const banned of ['Math.random', 'Date.now', 'performance.now', 'new Date(']) assert.ok(!src.includes(banned), `${f} uses ${banned}`);
  }
});

test('the idle motion is locked to the crew\'s 12 s cycle: whole cycles, the same pose one cycle later', () => {
  assert.equal(CYCLE, 12);
  for (const [k, c] of Object.entries(CYCLES)) assert.ok(Number.isInteger(c) && c > 0, `${k}: ${c} cycles`);
  assert.equal(24 % CYCLE, 0, 'whole cycles on the viewer\'s 24 s loop');
  assert.equal(48 % CYCLE, 0, 'and on the product\'s 48 s loop');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  for (let k = 0; k < 96; k++) {
    const t = k * 0.1251 + 0.003;
    for (const shift of [CYCLE, 2 * CYCLE, -CYCLE]) {
      const a = idleAt(t), b = idleAt(t + shift);
      for (const key of ['bob', 'roll', 'pitch']) assert.ok(near(a[key], b[key]), `idle ${key} at ${t}`);
      for (const j of [0, 1]) { const f = flameAt(t, j), g = flameAt(t + shift, j); assert.ok(near(f.len, g.len) && near(f.dx, g.dx) && near(f.dz, g.dz), `flame at ${t}`); }
      for (const mode of ['chase', 'blink']) for (let i = 0; i < 12; i++) assert.equal(lightOn({ mode, phase: 0 }, i, t), lightOn({ mode, phase: 0 }, i, t + shift), `${mode} light ${i} at ${t}`);
    }
  }
  // it moves: the flame flickers and the ring lights chase
  const lens = new Set(Array.from({ length: 48 }, (_, k) => flameAt(k * 0.25 + 0.01).len.toFixed(4)));
  assert.ok(lens.size > 20, 'the flame flickers');
  assert.notEqual(lightOn({ mode: 'chase' }, 0, 0.01), lightOn({ mode: 'chase' }, 0, 0.26));
  assert.ok(Math.abs(idleAt(1.5).bob) > 0.05, 'the ship bobs');
});

const EMPTY = { cell: { v: 'A', n: 3, framing: 'close', view: 'front' }, plan: crewPlan(3), drawn: 0, px: 0, shipPx: 0, crewPx: 0, flamePx: 0, tealPx: 0, clipped: 0, pieces: 0, shipPieces: 0, hullPieces: 0, strays: [], shipStray: 0, crew: [], cap: { px: 0, block: 0 } };
test('round 2b: every porthole alike (one size, one grey rim, the captain\'s too); R2-4b one column per deck, R2-4c straight columns', () => {
  for (const id of ['R2-4b', 'R2-4c']) for (const n of [1, 3, 8, 12, 16]) {
    const s = specOf(id, n);
    assert.equal(new Set(s.windows.map((w) => `${w.angle.toFixed(6)}|${w.frameSlot}`)).size, 1, `${id} n=${n}: the windows differ`);
    assert.ok(s.windows.every((w) => w.frameSlot === 'metal'), `${id}: a rim isn't grey`);
    assert.ok(!s.bands.some((b) => b.part === 'body'), `${id}: a belly band`);
    assert.equal(s.windows.length, s.crew.length);
    // the captain is in the top porthole
    assert.ok(s.windows.slice(1).every((w) => w.n[1] <= s.windows[0].n[1] + 1e-9 || Math.abs(w.c[1] + w.n[1] - s.windows[0].c[1] - s.windows[0].n[1]) < 1e-9), `${id}: the captain isn't at the top`);
  }
  // R2-4b: one column on one deck, two on two (same rows); R2-4c: three columns
  const yawsOf = (id, n) => [...new Set(specOf(id, n).windows.map((w) => Math.atan2(w.n[0], w.n[2]).toFixed(4)))];
  assert.deepEqual(yawsOf('R2-4b', 8), ['0.0000']);
  assert.equal(yawsOf('R2-4b', 12).length, 2);
  assert.equal(yawsOf('R2-4c', 8).length, 3);
  const heights = (id, n) => specOf(id, n).windows.map((w) => +(w.c[1] + w.n[1] * 1.28).toFixed(3));
  assert.deepEqual(new Set(heights('R2-4b', 16)).size, 8, 'R2-4b two decks: the two columns share their rows');
});

test('the final pick: R2-4c\'s hull, portholes and seats, with R2-4\'s red belly band exactly', () => {
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  const bandOf = (id, n) => { const s = specOf(id, n), body = s.parts.find((p) => p.id === 'body'), b = s.bands.filter((x) => x.part === 'body'); return { b, cy: body.a[1], top: body.b[1] }; };
  for (const n of [1, 3, 8, 12, 16, 20]) {
    const f = specOf('R2-4c-final', n), c = specOf('R2-4c', n);
    assert.deepEqual(f.windows, c.windows, `n=${n}: the portholes moved`);
    assert.deepEqual(f.crew, c.crew, `n=${n}: the seats moved`);
    assert.deepEqual(f.parts, c.parts, `n=${n}: the hull changed`);
    const { b, cy, top } = bandOf('R2-4c-final', n);
    assert.ok(b.length === 1 && b[0].slot === 'trim' && near(b[0].y0, cy - 0.3) && near(b[0].y1, top + 0.12), `n=${n}: the band isn't cy - 0.3 to top + 0.12, red`);
  }
  const r = bandOf('R2-4', 8);
  assert.ok(near(r.b[0].y0 - r.cy, -0.3) && near(r.b[0].y1 - r.top, 0.12) && r.b[0].slot === 'trim', 'R2-4\'s band has the same offsets');
});

test('the fly-by v2 flies nose first, its front to the camera, entering and leaving off screen (flyby.js)', () => {
  const dot = (a, b) => a.reduce((acc, x, i) => acc + x * b[i], 0), unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cam = FLYBY.camera.at;
  let maxOff = 0;
  for (let k = 0; k < FLYBY.frames; k++) {
    const m = shipAt(k);
    if (passAt(k) === null) { assert.equal(m.visible, false, `frame ${k}: shown in the hold`); continue; }
    const { x, y, z } = m.axes;
    for (const [a, b] of [[x, y], [y, z], [z, x]]) assert.ok(Math.abs(dot(a, b)) < 1e-9, `frame ${k}: the axes aren't orthogonal`);
    assert.ok(Math.abs(dot(x, [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]]) - 1) < 1e-9, `frame ${k}: not a rotation`);
    const mid = m.p.map((c, i) => c + y[i] * FLYBY.mid * SHIP_SCALE);
    // the front faces the camera (the bank tips it at most FLYBY.bank)
    assert.ok(dot(z, unit(cam.map((c, i) => c - mid[i]))) > Math.cos(FLYBY.bank) - 1e-9, `frame ${k}: the portholes turn from the camera`);
    // on screen the nose axis (tail to nose) points along the middle's travel, nose leading
    const tail = project(mid), nose = project(mid.map((c, i) => c + y[i])), s = passAt(k);
    const a = middleAt(Math.max(-1, s - 1e-3)).screen, b = middleAt(Math.min(1, s + 1e-3)).screen;
    const axis = Math.atan2(tail[1] - nose[1], nose[0] - tail[0]), travel = Math.atan2(a[1] - b[1], b[0] - a[0]);
    maxOff = Math.max(maxOff, Math.abs(Math.atan2(Math.sin(axis - travel), Math.cos(axis - travel))));
    assert.ok(nose[0] > tail[0], `frame ${k}: the nose isn't to the right of the tail (it flies left to right)`);
    // the middle is where the track puts it on screen
    const at = project(mid), want = middleAt(s).screen;
    assert.ok(Math.hypot(at[0] - want[0], at[1] - want[1]) < 1e-6, `frame ${k}: the middle is off its track`);
  }
  assert.ok(maxOff < 1e-4, `the nose is ${maxOff} rad off its travel`);
  // left to right, a slight climb only, and slow through the middle (the glide)
  const [x0, y0] = middleAt(-1).screen, [x1, y1] = middleAt(1).screen, [xm] = middleAt(0).screen;
  assert.ok(x0 < -100 && x1 > FLYBY.w + 100 && Math.abs(xm - FLYBY.w / 2) < 1e-9);
  assert.ok(y1 < y0 && Math.atan2(y0 - y1, x1 - x0) < 0.15, 'a climb, but a slight one');
  assert.equal(timeAt(0), FLYBY.t0);
  assert.ok(Math.abs(dot(cameraFrame().up, cameraFrame().fw)) < 1e-12);
});

test('the lively flame: deterministic, loop-locked, a new look every fly-by frame, inside its box', () => {
  assert.equal(Number.isInteger(LIVE.hz * CYCLE) && Number.isInteger(CYCLE / LIVE.life) && Number.isInteger(LIVE.surge[1]), true, 'whole steps, lives and surges per cycle');
  const fl = specOf('R2-4c-final', 6).flames[0];
  let prev = null, unchanged = 0;
  for (let k = 0; k < 240; k++) {
    const t = FLYBY.t0 + k / FLYBY.fps, a = flameLive(t, 0, fl.len);
    assert.deepEqual(flameLive(t, 0, fl.len), a, 'deterministic');
    const b = flameLive(t + CYCLE, 0, fl.len);
    assert.ok(Math.abs(a.len - b.len) < 1e-9 && a.dx === b.dx && a.shift === b.shift && a.puffs.every((p, i) => Math.abs(p.r - b.puffs[i].r) < 1e-9 && p.band === b.puffs[i].band), `t=${t}: one cycle later differs`);
    if (prev && Math.abs(a.len - prev.len) < 0.05 && Math.abs(a.dx - prev.dx) < 0.02) unchanged++;
    assert.ok(a.len > 1.1 && fl.len * a.len + 0.1 < liveReach(fl.len), `t=${t}: the flame's length ${a.len}`);
    for (const p of a.puffs) {
      assert.ok([0, 1, 2, 3].includes(p.band), 'a puff is one step of the flame ramp');
      if (p.r > 0) assert.ok(-p.c[1] + p.r < liveReach(fl.len) && Math.hypot(p.c[0], p.c[2]) + p.r < fl.r + 0.1, `t=${t}: a puff leaves the proxy box`);
    }
    prev = a;
  }
  assert.ok(unchanged < 5, `the flame holds still for ${unchanged} of 240 steps`);
  // the core alternates step to step, and puffs cool as they age
  assert.ok(Math.sign(flameLive(8.0).shift - flameLive(8.05).shift) !== Math.sign(flameLive(8.05).shift - flameLive(8.1).shift));
  const live = Array.from({ length: 24 }, (_, i) => flameLive(8 + i / 20)).flatMap((f) => f.puffs).filter((p) => p.r > 0);
  assert.ok(live.some((p) => p.band === 3) && live.some((p) => p.band === 0), 'puffs from white to red');
  // the idle flame (every other shot) is untouched: its hashed wag still steps 4 times a second
  assert.ok(flameAt(8.0).dx === flameAt(8.2).dx && flameAt(8.2).dx !== flameAt(8.26).dx);
});

test('the lively flame and the seat pivots leave every default ship as it was', () => {
  for (const v of ALL_VARIANTS) for (const n of [1, 6, 12]) {
    const sp = specOf(v.id, n);
    assert.equal(shipGlsl(sp, { live: false }), shipGlsl(sp), `${v.id} n=${n}: the default source changed`);
    assert.ok(!shipGlsl(sp).includes('uPuff'), `${v.id}: puffs in the default flame`);
    if (sp.flames.length) assert.ok(shipGlsl(sp, { live: true }).includes('uPuff'));
  }
  const sp = specOf('R2-4c-final', 6), fl = sp.flames[0];
  const live = { ...sp, flames: [{ ...fl, reach: liveReach(fl.len) }] };
  assert.ok(shipBounds(live).lo[1] < shipBounds(sp).lo[1], 'the lively flame\'s box reaches back for its puffs');
  assert.deepEqual(shipBounds(live).hi, shipBounds(sp).hi);
  // a porthole seat's pivot is the helmet before the drop: the captain's is `low` above, the teammates' at the helmet
  const [captain, ...mates] = sp.crew;
  assert.ok(Math.abs(captain.pivot[1] - (captain.p[1] + HELMET_Y) - R24C.low) < 1e-9 && captain.pivot[0] === captain.p[0] && captain.pivot[2] === captain.p[2]);
  for (const m of mates) assert.ok(m.pivot.every((c, i) => Math.abs(c - (i === 1 ? m.p[1] + HELMET_Y : m.p[i])) < 1e-9));
});

test('the tile checks fail on empty output', () => {
  const p = tileProblems(EMPTY, 'empty');
  assert.ok(p.some((x) => x.includes('empty')), p.join('\n'));
  assert.ok(p.some((x) => x.includes('astronauts drawn')));
  assert.ok(p.some((x) => x.includes('hull is 0 pieces')));
  assert.ok(seamProblems({ same: 0, wrap: 0, maxStep: 0 }, 'frozen').some((x) => x.includes('nothing moves')));
  assert.ok(seamProblems({ same: 5, wrap: 1, maxStep: 9 }, 'seam').some((x) => x.includes('one cycle later')));
  // a hidden astronaut fails where crew is gated, and teal at rest fails
  const hidden = { ...EMPTY, shipPx: 900, pieces: 1, hullPieces: 1, flamePx: 20, drawn: 3, crew: [{ px: 300, block: 9 }, { px: 0, block: 0 }, { px: 250, block: 8 }] };
  assert.ok(tileProblems(hidden, 'hidden').some((x) => x.includes('astronaut 2 shows 0 px')));
  assert.ok(tileProblems(hidden, 'no cap').some((x) => x.includes("captain's cap shows 0 px")), 'a missing captain\'s cap fails');
  assert.ok(tileProblems({ ...hidden, crew: hidden.crew.map(() => ({ px: 300, block: 9 })), tealPx: 3 }, 'teal').some((x) => x.includes('teal')));
});

test('the lab server serves only its allowlist', () => {
  for (const ok of ['/ship-lab/', '/ship-lab/lab.js', '/ship-lab/ship.js', '/asset-viewer/viewer.js', '/drone-lab/drone.js', '/explorations/astronaut-lab/crew.js', '/ship-lab/node_modules/three/build/three.module.js', '/ship-lab/node_modules/three/examples/jsm/controls/OrbitControls.js']) assert.ok(resolveFile(ok), ok);
  for (const no of ['/ship-lab/lab.mjs', '/ship-lab/serve.mjs', '/ship-lab/out/report.json', '/ship-lab/test/pure.test.mjs', '/ship-lab/../../CLAUDE.md', '/ship-lab/%2e%2e/x.js', '/asset-viewer/test/crew.test.mjs', '/asset-viewer/serve.mjs', '/drone-lab/out/params.md', '/explorations/astronaut-lab/astronaut.js', '/ship-lab/node_modules/playwright/index.js', '/etc/passwd', '/ship-lab/%E0%A4%A']) assert.equal(resolveFile(no), null, no);
});
