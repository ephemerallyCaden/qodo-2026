// Pure-JS checks: palettes (BLK 36 only, teal never at rest), the crew plan and overflow rule, seats,
// the 2 px rule at the near distance, determinism, the loop lock, the checks failing on empty output,
// and the server allowlist. No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { mapPalette } from '../../asset-viewer/palette-map.js';
import { LOSPEC } from '../../asset-viewer/palettes.js';
import { VARIANTS, specOf } from '../variants.js';
import { RAMPS, TEAL, BLK36, CAP_PALETTE, paletteHexes, tealThrust } from '../palette.js';
import { BUILDERS, CAP, SHIP_SCALE, CYCLE, CYCLES, SEATS_PER_DECK, MAX_DECKS, HELMET_Y, crewPlan, idleAt, flameAt, lightOn, hash01 } from '../ship-spec.js';
import { shipGlsl, SLOTS, MAX_LIGHTS } from '../ship-glsl.js';
import { tileProblems, seamProblems } from '../checks.mjs';
import { resolveFile } from '../routes.mjs';

const blk = mapPalette('blk-36');

test('BLK 36 here is the published palette', () => {
  assert.deepEqual(BLK36, LOSPEC['blk-36'].colors.map((c) => `#${c}`));
});

test('every ship colour is BLK 36 (art direction §4), and the teal is only in the option', () => {
  for (const v of VARIANTS) {
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
  for (const v of VARIANTS) for (let n = 1; n <= 24; n++) {
    const s = specOf(v.id, n);
    assert.equal(s.crew.length, Math.min(n, 16), `${v.id} n=${n}: seats`);
    assert.equal(s.plan.decks, n > 8 ? 2 : 1);
    assert.ok(s.lights.length <= MAX_LIGHTS);
  }
  // a second deck changes the ship (every direction grows one), a ninth crew member doesn't add a third
  for (const v of VARIANTS) {
    assert.notEqual(shipGlsl(specOf(v.id, 8)), shipGlsl(specOf(v.id, 9)), `${v.id}: no second deck`);
    assert.equal(shipGlsl(specOf(v.id, 16)), shipGlsl(specOf(v.id, 24)), `${v.id}: past 16 the ship stays the same`);
  }
});

test('the captain (the repo owner) is seat 0 of every ship, alone, in a seat of their own', () => {
  for (const v of VARIANTS) {
    assert.ok(v.captain && v.captain.length > 10, `${v.id}: no captain description`);
    for (let n = 1; n <= 24; n++) {
      const crew = specOf(v.id, n).crew;
      assert.equal(crew[0].captain, true, `${v.id} n=${n}: seat 0 isn't the captain`);
      assert.equal(crew.filter((c) => c.captain).length, 1, `${v.id} n=${n}: one captain`);
    }
    const s = specOf(v.id, 8), cap = s.crew[0], helmet = (c) => [c.p[0], c.p[1] + HELMET_Y, c.p[2]];
    if (v.id === 'A') {
      // the biggest porthole, gold-framed, above every teammate's
      const [w0, ...rest] = s.windows;
      assert.ok(rest.every((w) => w0.w > w.w && w0.y > w.y) && w0.frameSlot === 'gold', 'A: the captain\'s porthole');
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
  for (const v of VARIANTS) for (const n of [3, 8, 16]) {
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
    case 'torus': return 2 * p.r;
    case 'disc': return 2 * p.h;
    case 'box': return 2 * Math.min(...p.b);
    case 'fin': return 2 * (p.t + p.round);
    default: throw new Error(p.kind);
  }
};
test('every part, frame and light is at least 2 px across at the near distance (art direction §1)', () => {
  for (const v of VARIANTS) for (const n of [3, 12]) {
    const s = specOf(v.id, n);
    for (const p of s.parts) assert.ok(thinnest(p) * NEAR_PX_PER_UNIT >= 2, `${v.id} ${p.id}: ${(thinnest(p) * NEAR_PX_PER_UNIT).toFixed(2)} px`);
    for (const w of s.windows) assert.ok(w.frame * NEAR_PX_PER_UNIT >= 2, `${v.id}: a window frame is ${(w.frame * NEAR_PX_PER_UNIT).toFixed(2)} px`);
    for (const l of s.lights) assert.ok(2 * l.r * NEAR_PX_PER_UNIT >= 2, `${v.id}: a light is ${(2 * l.r * NEAR_PX_PER_UNIT).toFixed(2)} px`);
    for (const p of s.parts) assert.ok(SLOTS.includes(p.slot), `${v.id} ${p.id}: slot ${p.slot}`);
  }
});

test('deterministic: the same crew count gives the same ship, byte for byte', () => {
  for (const v of VARIANTS) for (const n of [1, 3, 8, 12, 20]) {
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
