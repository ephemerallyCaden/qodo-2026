// Pure-JS checks of the brand drones (phase 2): the approved provider list, BLK 36 palettes, the
// family rules (A3), attachment, size class, loop lock, per-session variety (A5) and the A4 report
// that `npm run lab` writes. The pixel checks (non-empty against a control, unclipped, seamless
// GIFs, the face probe, A–E / D-final pixel identity, A4 itself) run in lab.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, PARAM_BY_KEY, DEFAULTS, EYES, DRONE_EYE } from '../params.js';
import { FINAL } from '../variants.js';
import { BLK36, BRAND_PALETTES, OPTION_PALETTES, GEMINI_TINTS, PALETTES, SLOTS, TEAL } from '../palette.js';
import { BRANDS, DISTINCT, PROVIDERS, BRAND_BY_ID, BRAND_COLOURS, ACCESSORIES, FACE_KEYS, SESSION_VARY, SESSION_SPARKLES, GOOGLE_UNPICKED, sessionLook } from '../brands.js';
import { layout, extents, bodyAt, behaviour, smokeAt, skirtAt, starAt, faceAt, LOOP, MOTION_LOOP, MAX_CROWN, MAX_SKIRT } from '../drone.js';
import { dist } from '../oklab.js';

const K_HEIGHT = 0.95;
// The brand drones and the unpicked Google options (2026-11-11), for the family checks every drone passes.
const ALL = [...BRANDS, ...GOOGLE_UNPICKED];
const SEEDS = Array.from({ length: 40 }, (_, i) => `session-${i * 7919}`);

test('the approved providers, plus generic and unknown, each with a palette and a signature', () => {
  assert.deepEqual(PROVIDERS.map((b) => b.id), ['claude', 'cursor', 'copilot', 'codex', 'google', 'devin', 'kiro', 'opencode', 'qodo']);
  assert.deepEqual(BRANDS.map((b) => b.id), [...PROVIDERS.map((b) => b.id), 'generic', 'unknown']);
  for (const b of BRANDS) {
    assert.ok(b.name && b.covers && b.signature, b.id);
    assert.equal(b.palette, BRAND_PALETTES[b.sameAs ?? b.id], `${b.id} has its own palette (or its twin's)`);
  }
  assert.deepEqual(Object.keys(BRAND_PALETTES).sort(), BRANDS.map((b) => b.id).sort());
});

test('brand params are known, inside their ranges, and laid over D-final', () => {
  for (const b of ALL) {
    for (const [k, v] of Object.entries(b.params)) {
      const p = PARAM_BY_KEY[k];
      assert.ok(p, `${b.id}: unknown parameter ${k}`);
      if (p.type === 'select') assert.ok(Number.isInteger(v) && v >= 0 && v < p.options.length, `${b.id}.${k}`);
      else assert.ok(v >= p.min && v <= p.max, `${b.id}.${k} = ${v} outside ${p.min}..${p.max}`);
    }
  }
  // The generic drone is D-final exactly, and the unknown agent is the generic drone (human, 2026-11-10).
  assert.deepEqual(BRAND_BY_ID.generic.params, { ...DEFAULTS, ...FINAL.params });
  assert.equal(BRAND_PALETTES.generic.shell, PALETTES.base.shell);
  const u = BRAND_BY_ID.unknown, g = BRAND_BY_ID.generic;
  assert.equal(u.sameAs, 'generic');
  assert.deepEqual([u.params, u.detail, u.trims, u.palette], [g.params, g.detail, g.trims, g.palette]);
  for (const slot of Object.keys(SLOTS)) assert.deepEqual(BRAND_PALETTES.unknown[slot], g.palette[slot], `unknown.${slot}`);
  assert.deepEqual(DISTINCT.map((b) => b.id), BRANDS.map((b) => b.id).filter((id) => id !== 'unknown'));
});

test("accessory drones are D-final's exact shape plus one accessory and a face", () => {
  const D = { ...DEFAULTS, ...FINAL.params };
  // Copilot wears goggles and Claude its legs (the human's picks, 2026-11-10); the tentacles are an unused parameter set.
  assert.deepEqual(BRANDS.filter((b) => b.accessory).map((b) => [b.id, b.accessory]), [['claude', 'legs'], ['copilot', 'goggles']]);
  // An accessory only sets its own part's parameters (goggles or the skirt), never the head, screen, thrusters or motion.
  for (const [k, a] of Object.entries(ACCESSORIES)) {
    for (const key of Object.keys(a.params)) assert.match(key, /^(topper|gog|skirt|star)/, `${k} sets ${key}`);
    assert.ok(a.detail.key in a.params && a.detail.min < a.detail.max, `${k}: its seeded detail is one of its own parameters`);
  }
  for (const d of ALL.filter((b) => b.accessory)) {
    const own = new Set([...Object.keys(ACCESSORIES[d.accessory].params), ...FACE_KEYS]);
    for (const { key } of PARAMS) if (d.params[key] !== D[key]) assert.ok(own.has(key), `${d.id}: ${key} differs from D-final`);
  }
});

test('every brand (and unpicked Google option) palette is BLK 36 only, and the eyes glow [OIII] teal', () => {
  for (const [id, pal, trims] of [...Object.entries(BRAND_PALETTES).map(([id, pal]) => [id, pal, BRAND_BY_ID[id].trims]), ...GOOGLE_UNPICKED.map((o) => [o.id, o.palette, o.trims])]) {
    for (const [slot, n] of Object.entries(SLOTS)) {
      assert.equal(pal[slot].length, n, `${id}.${slot}`);
      for (const h of pal[slot]) {
        if (slot === 'glow') assert.ok(TEAL.includes(h), `${id}.glow ${h} is not [OIII] teal`);
        else assert.ok(BLK36.includes(h), `${id}.${slot} ${h} is not BLK 36`);
      }
    }
    for (const ramp of pal.tints ?? []) for (const h of ramp) assert.ok(BLK36.includes(h), `${id} tint ${h} is not BLK 36`);
    for (const trim of trims) {
      assert.equal(trim.length, SLOTS.trim, `${id} seeded trim`);
      for (const h of trim) assert.ok(BLK36.includes(h), `${id} seeded trim ${h} is not BLK 36`);
    }
  }
  for (const c of BRAND_COLOURS) {
    assert.ok(BRAND_BY_ID[c.brand], c.brand);
    for (const h of c.chosen) {
      assert.ok(BLK36.includes(h), `${c.brand} ${c.part}: ${h} is not BLK 36`);
      const pal = BRAND_PALETTES[c.brand];
      if (c.quad != null) assert.ok(pal.tints[c.quad].includes(h), `${c.brand} ${c.part}: ${h} is not in its quadrant's tint ramp`);
      else assert.ok(Object.keys(SLOTS).some((s) => pal[s].includes(h)), `${c.brand} ${c.part}: ${h} is not in its palette`);
    }
    // A pick that isn't the nearest BLK 36 colour must say why.
    const nearest = BLK36.reduce((m, h) => (dist(c.hex, h) < dist(c.hex, m) ? h : m));
    if (!c.chosen.includes(nearest)) assert.ok(c.why.length > 20, `${c.brand} ${c.part}: chose ${c.chosen} over the nearest ${nearest} without a reason`);
  }
});

test('A3 one family: head-is-body, a thruster pack with smoke, a V2 screen face, no arms', () => {
  for (const b of ALL) {
    const P = b.params, L = layout(P);
    assert.ok(!PARAM_BY_KEY.arms, 'no arms parameter exists');
    assert.ok(L.thr.length >= 1, `${b.id}: thrusters`);
    assert.ok(P.puffRate > 0 && P.puffSize > 0, `${b.id}: smoke`);
    if (b.v2Eyes == null) assert.ok(P.eyes < EYES.length, `${b.id}: eyes must be V2 (${P.eyes})`);
    assert.ok(P.screenW > 0 && P.screenH > 0, `${b.id}: screen face`);
    assert.ok(L.crown.length <= MAX_CROWN && L.skirt.length <= MAX_SKIRT, `${b.id}: within the shader limits`);
  }
  // The two drone-only eyes (approved 2026-11-10) are Copilot's and Codex's own, each with a V2 fallback;
  // every other drone uses a V2 eye. (They're not in faces.js: the crew set stays the 10 V2 designs.)
  const own = ALL.filter((b) => b.params.eyes >= EYES.length);
  assert.deepEqual(own.map((b) => [b.id, b.params.eyes]), [['copilot', DRONE_EYE.pills], ['codex', DRONE_EYE.prompt]]);
  for (const b of own) assert.ok(Number.isInteger(b.v2Eyes) && b.v2Eyes < EYES.length, `${b.id}: a V2 fallback`);
  assert.deepEqual(BRANDS.filter((b) => b.v2Eyes != null).map((b) => b.id), ['copilot', 'codex']);
  assert.equal(PARAM_BY_KEY.eyes.options.length, 12, 'drones have the 10 V2 eyes plus two drone-only ones');
});

test('A3 size class: every drone is within D-final\'s size class', () => {
  const size = (P) => { const e = extents(layout(P)); return { h: (e.top - e.bottom) / K_HEIGHT, w: (2 * e.half) / K_HEIGHT }; };
  const ref = size({ ...DEFAULTS, ...FINAL.params });
  for (const b of ALL) {
    const s = size(b.params);
    const area = (s.h * s.w) / (ref.h * ref.w);
    assert.ok(area > 0.6 && area < 1.4, `${b.id}: ${(area * 100).toFixed(0)}% of D-final's area`);
    assert.ok(Math.max(s.h, s.w) > 0.34 && Math.max(s.h, s.w) < 0.52, `${b.id}: largest extent ${(Math.max(s.h, s.w) * 100).toFixed(0)}% of a K astronaut`);
    assert.ok(s.h > 0.26, `${b.id}: ${(s.h * 100).toFixed(0)}% tall`);
  }
});

test('brand parts attach to the head (one connected piece)', () => {
  for (const b of ALL) {
    const P = b.params, L = layout(P);
    const on = (v, tol, what) => assert.ok(L.core(v) <= tol, `${b.id}: ${what} is ${L.core(v).toFixed(4)} off the head`);
    L.crown.forEach((c) => on(c, P.crownR, 'a crown puff'));
    L.skirt.forEach((k) => on(k.a, P.skirt === 3 ? P.skirtR : 0, P.skirt === 3 ? 'a hem scallop' : 'a leg or tentacle root'));
    if (L.snout) on(L.snout.a, 0, 'the snout root');
    if (P.ears) L.ears.forEach((e) => on(e, P.ears === 3 ? P.earR : P.earT, 'an ear'));
    L.ant.forEach((a) => on(a.base, 0, 'an antenna base'));
    L.thr.forEach((n) => on(n.a, 0, 'a nozzle root'));
    L.fins.forEach((f) => on(f.a, 0, 'a fin root'));
    // The antenna star sits on the stalk's end: its bottom tip reaches below it.
    if (P.starPart === 1) assert.ok(L.star && L.star.c.y - P.starR < L.ant[0].base.y + L.ant[0].dir.y * P.antL, `${b.id}: the antenna star floats off its stalk`);
    if (P.topper === 1) {
      // Each flat lens sits flush on the head, the bridge runs from lens to lens over the face, and
      // the strap hugs the head all the way round.
      L.gog.forEach((g) => on(g.c, 0.005, 'a goggle lens'));
      if (P.gogBridge) {
        // Its ends are inside the two lenses, and its middle stands clear of the head (not buried).
        const { a, m, b: e, r } = L.bridge;
        [a, e].forEach((p, i) => assert.ok(p.distanceTo(L.gog[i].c) < P.gogW, `${b.id}: the bridge misses lens ${i}`));
        assert.ok(L.headF(m) > 0 && m.z >= Math.min(a.z, e.z) - 1e-9, `${b.id}: the bridge sinks into the head (${L.headF(m).toFixed(4)})`);
        assert.ok(Math.abs(m.x) < 1e-9 && r >= 0.5 * P.gogFrame - 1e-9, `${b.id}: the bridge is centred and as thick as the frames`);
      }
      if (P.gogStrap) {
        const { c, n, r, t } = L.strap;
        const along = n.clone().set(0, -n.z, n.y);
        for (let i = 0; i < 24; i++) {
          const th = (i / 24) * Math.PI * 2;
          on(c.clone().add(along.clone().multiplyScalar(Math.cos(th) * (r[1] - 0.35 * t))).setX(Math.sin(th) * (r[0] - 0.35 * t)), t, `the goggle strap at ${i * 15}°`);
        }
      }
    }
  }
});

test('brand motion is loop-locked: body, behaviour, smoke, skirt and an orbiting star one loop later are the same', () => {
  const flat = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v));
  for (const b of ALL) {
    const P = b.params, L = layout(P);
    for (const [motion, loop] of [[false, LOOP], [true, MOTION_LOOP]]) {
      for (const t of [0, 0.7, 4.3, 8.1]) {
        assert.equal(flat(bodyAt(P, t + loop, motion)), flat(bodyAt(P, t, motion)), `${b.id} body at ${t}`);
        assert.equal(flat(behaviour(t + loop, motion)), flat(behaviour(t, motion)), `${b.id} behaviour at ${t}`);
        assert.equal(flat(smokeAt(L, t + loop, motion)), flat(smokeAt(L, t, motion)), `${b.id} smoke at ${t}`);
        assert.equal(flat(skirtAt(L, t + loop)), flat(skirtAt(L, t)), `${b.id} skirt at ${t}`);
        assert.equal(flat(starAt(L, t + loop)), flat(starAt(L, t)), `${b.id} star at ${t}`);
      }
    }
  }
  // The orbiting star really goes round (and stays clear of the head).
  const G5 = GOOGLE_UNPICKED.find((o) => o.params.starPart === 2), L5 = layout(G5.params);
  const at = [0, 1.5, 3, 4.5].map((t) => starAt(L5, t).c);
  assert.ok(at[0].distanceTo(at[2]) > 2 * G5.params.headW, 'the orbit crosses the head');
  for (let t = 0; t < LOOP; t += 0.25) assert.ok(L5.core(starAt(L5, t).c) > G5.params.starR, `the orbiting star hits the head at ${t} s`);
  // Qodo reviews: its head dips while it works, and nobody else's does.
  const Q = BRAND_BY_ID.qodo.params;
  assert.ok(Q.workNod > 0 && Q.glyphSet === 4);
  const pitch = (P, t) => bodyAt(P, t, true).m.elements[9]; // the body's z axis, y component
  assert.notEqual(pitch(Q, 8), pitch({ ...Q, workNod: 0 }, 8));
  assert.equal(faceAt(behaviour(8, true)).eyes, false);
});

test('A5 per-session variety stays inside a provider: only seeded details differ, within bounds', () => {
  const free = (b) => new Set([...Object.keys(SESSION_VARY), 'sparkles', b.detail.key]);
  for (const b of BRANDS) {
    const looks = SEEDS.map((sd) => sessionLook(b.id, sd));
    for (const [i, look] of looks.entries()) {
      assert.deepEqual(sessionLook(b.id, SEEDS[i]), look, `${b.id}: the same session gives the same look`);
      for (const [k, v] of Object.entries(look.params)) {
        if (!free(b).has(k)) { assert.equal(v, b.params[k], `${b.id}.${k} must not vary per session`); continue; }
        const p = PARAM_BY_KEY[k];
        assert.ok(v >= p.min && v <= p.max, `${b.id}.${k} = ${v} outside its range`);
        if (k === b.detail.key) assert.ok(v >= b.detail.min && v <= b.detail.max, `${b.id}.${k} detail out of bounds`);
        else if (k === 'sparkles') assert.ok(Math.abs(v - b.params.sparkles) <= SESSION_SPARKLES && Number.isInteger(v), `${b.id} sparkles`);
        else assert.ok(Math.abs(v - b.params[k]) <= SESSION_VARY[k] + 1e-9, `${b.id}.${k} varies too far`);
      }
      for (const slot of Object.keys(SLOTS)) {
        if (slot === 'trim') assert.ok(b.trims.some((t) => t === look.palette.trim), `${b.id}: trim is one of its seeded trims`);
        else assert.equal(look.palette[slot], b.palette[slot], `${b.id}.${slot} must not vary per session`);
      }
      assert.ok(look.phase >= 0 && look.phase < MOTION_LOOP, `${b.id} phase`);
    }
    const distinct = new Set(looks.map((l) => JSON.stringify([l.params[b.detail.key].toFixed(4), l.trim, l.params.sparkles])));
    assert.ok(distinct.size >= 10, `${b.id}: only ${distinct.size} distinct sessions in ${SEEDS.length}`);
  }
});

test('Qodo (human, 2026-11-11): a purple nose tip, no eyes, just the sunglasses; it reviews with a glint sweep', () => {
  const Q = BRAND_BY_ID.qodo;
  assert.ok(Q.params.snout === 1 && Q.params.snoutTip >= 0.2, 'a nose tip of its own');
  // The tip takes the accent slot: the booster purples.
  assert.deepEqual(Q.palette.accent, ['#412866', '#643499', '#8c51cc', '#b991f2']);
  assert.ok(Q.params.thrAccent === 1, 'the boosters share the purple');
  assert.ok(Q.params.screenShades === 1 && Q.params.noEyes === 1 && Q.params.glyphSet === 4, 'just the sunglasses, at rest and at work');
  assert.deepEqual(ALL.filter((b) => b.params.noEyes || b.params.snoutTip).map((b) => b.id), ['qodo'], 'only Qodo');
});

test('Google is the Gemini sparkle (the human\'s pick of five options, G1, 2026-11-11)', () => {
  const G = BRAND_BY_ID.google, P = G.params;
  // Head-is-body: the head is the sparkle, painted in four quadrant panels, a round screen seen straight on.
  assert.ok(P.headStar === 1 && P.quadTint === 1 && P.screenFlat === 2 && P.screenRound === 2, 'the sparkle head');
  assert.ok(P.skirt === 0 && P.rim === 0 && P.antenna === 0, 'no octopus tentacles, saucer rim or antenna');
  assert.deepEqual(G.palette.tints, GEMINI_TINTS, 'the four Gemini ramps');
  assert.deepEqual(G.palette.shell, GEMINI_TINTS[3], 'blue in the middle, like the sparkle');
  assert.ok(GEMINI_TINTS.length === 4 && GEMINI_TINTS.every((r) => r.length === 4), 'four ramps of four bands');
  // The green the human kept (#42bc7f), with its note about the event teal; one Gemini colour or more per quadrant.
  assert.ok(BRAND_COLOURS.some((c) => c.brand === 'google' && c.quad === 2 && c.chosen.includes('#42bc7f') && c.note), 'the green and its teal note');
  assert.deepEqual([...new Set(BRAND_COLOURS.filter((c) => c.brand === 'google').map((c) => c.quad))], [0, 1, 2, 3]);
  // The unpicked options stay as parameter sets only: not brand drones, and none of them is G1.
  assert.deepEqual(GOOGLE_UNPICKED.map((o) => o.id), ['g2', 'g3', 'g4', 'g5']);
  for (const o of GOOGLE_UNPICKED) assert.ok(o.brand === 'google' && !BRAND_BY_ID[o.id] && o.palette === OPTION_PALETTES[o.id], o.id);
});

test('A4: the last lab run found every pair distinct at the crew close-up and at system distance', () => {
  const a4 = JSON.parse(readFileSync(new URL('../out/brands-a4.json', import.meta.url), 'utf8'));
  assert.deepEqual(a4.thresholds, { shape: 0.25, colour: 0.06 });
  // The unknown agent is the generic drone (only the label differs), so A4 measures the ten distinct drones.
  assert.deepEqual(a4.sameAs, { unknown: 'generic' });
  const gated = a4.scales.filter((s) => s.gate);
  assert.deepEqual(gated.map((s) => s.name), ['crew close-up', 'system distance']);
  const n = DISTINCT.length;
  for (const s of gated) {
    assert.equal(s.pairs.length, (n * (n - 1)) / 2, `${s.name}: every pair measured`);
    for (const p of s.pairs) assert.ok(p.score >= 1, `${s.name}: ${p.a}–${p.b} score ${p.score.toFixed(2)}`);
  }
});
