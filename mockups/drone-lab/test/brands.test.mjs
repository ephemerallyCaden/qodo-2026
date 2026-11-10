// Pure-JS checks of the brand drones (phase 2): the approved provider list, BLK 36 palettes, the
// family rules (A3), attachment, size class, loop lock, per-session variety (A5) and the A4 report
// that `npm run lab` writes. The pixel checks (non-empty against a control, unclipped, seamless
// GIFs, the face probe, A–E / D-final pixel identity, A4 itself) run in lab.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, PARAM_BY_KEY, DEFAULTS, EYES, DRONE_EYE } from '../params.js';
import { FINAL } from '../variants.js';
import { BLK36, BRAND_PALETTES, OPTION_PALETTES, PALETTES, SLOTS, TEAL } from '../palette.js';
import { BRANDS, PROVIDERS, BRAND_BY_ID, BRAND_COLOURS, BRAND_OPTIONS, ACCESSORIES, FACE_KEYS, SAME_DRONE, SESSION_VARY, SESSION_SPARKLES, sessionLook } from '../brands.js';
import { layout, extents, bodyAt, behaviour, smokeAt, skirtAt, faceAt, LOOP, MOTION_LOOP, MAX_CROWN, MAX_SKIRT } from '../drone.js';
import { dist } from '../oklab.js';

const K_HEIGHT = 0.95;
const SEEDS = Array.from({ length: 40 }, (_, i) => `session-${i * 7919}`);

test('the approved providers, plus generic and unknown, each with a palette and a signature', () => {
  assert.deepEqual(PROVIDERS.map((b) => b.id), ['claude', 'cursor', 'copilot', 'codex', 'google', 'devin', 'kiro', 'opencode', 'qodo']);
  assert.deepEqual(BRANDS.map((b) => b.id), [...PROVIDERS.map((b) => b.id), 'generic', 'unknown']);
  for (const b of BRANDS) {
    assert.ok(b.name && b.covers && b.signature, b.id);
    assert.equal(b.palette, BRAND_PALETTES[b.id], `${b.id} has its own palette`);
  }
  assert.deepEqual(Object.keys(BRAND_PALETTES).sort(), BRANDS.map((b) => b.id).sort());
});

test('brand params are known, inside their ranges, and laid over D-final', () => {
  for (const b of BRANDS) {
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
  assert.deepEqual(BRAND_BY_ID.unknown.params, BRAND_BY_ID.generic.params);
  for (const slot of Object.keys(SLOTS)) assert.deepEqual(BRAND_PALETTES.unknown[slot], BRAND_PALETTES.generic[slot], `unknown.${slot}`);
  assert.deepEqual(BRAND_BY_ID.unknown.trims, BRAND_BY_ID.generic.trims);
  assert.deepEqual(BRAND_BY_ID.unknown.detail, BRAND_BY_ID.generic.detail);
  assert.deepEqual(SAME_DRONE, [['generic', 'unknown']]);
});

test("accessory drones are D-final's exact shape plus one accessory and a face", () => {
  const D = { ...DEFAULTS, ...FINAL.params };
  // Copilot wears goggles and Claude its legs; the options cover both of Copilot's colourings and both of Claude's accessories.
  assert.deepEqual(BRANDS.filter((b) => b.accessory).map((b) => [b.id, b.accessory]), [['claude', 'legs'], ['copilot', 'goggles']]);
  assert.deepEqual(BRAND_OPTIONS.map((o) => [o.id, o.accessory, o.palette]), [['copilot-a', 'goggles', 'copilot'], ['copilot-b', 'goggles', 'copilot-b'], ['claude-a', 'legs', 'claude'], ['claude-b', 'tentacles', 'claude']]);
  // An accessory only sets its own part's parameters (goggles or the skirt), never the head, screen, thrusters or motion.
  for (const [k, a] of Object.entries(ACCESSORIES)) {
    for (const key of Object.keys(a.params)) assert.match(key, /^(topper|gog|skirt)/, `${k} sets ${key}`);
    assert.ok(a.detail.key in a.params && a.detail.min < a.detail.max, `${k}: its seeded detail is one of its own parameters`);
  }
  for (const d of [...BRANDS.filter((b) => b.accessory), ...BRAND_OPTIONS]) {
    const own = new Set([...Object.keys(ACCESSORIES[d.accessory].params), ...FACE_KEYS]);
    for (const { key } of PARAMS) if (d.params[key] !== D[key]) assert.ok(own.has(key), `${d.id}: ${key} differs from D-final`);
  }
  // Option a of each is the brand drone; option b differs only in its accessory (Claude) or palette (Copilot).
  for (const o of BRAND_OPTIONS.filter((x) => x.id.endsWith('-a'))) assert.deepEqual(o.params, BRAND_BY_ID[o.brand].params, o.id);
  assert.notDeepEqual(BRAND_OPTIONS.find((o) => o.id === 'claude-b').params, BRAND_BY_ID.claude.params);
  assert.deepEqual(BRAND_OPTIONS.find((o) => o.id === 'copilot-b').params, BRAND_BY_ID.copilot.params);
  // Copilot b is the generic drone's palette with only the goggles (the accent) in Copilot's colours.
  const b = OPTION_PALETTES['copilot-b'];
  for (const slot of Object.keys(SLOTS)) {
    if (slot === 'accent') assert.deepEqual(b.accent, BRAND_PALETTES.copilot.accent);
    else assert.deepEqual(b[slot], PALETTES.base[slot], `copilot-b.${slot}`);
  }
  for (const [slot, n] of Object.entries(SLOTS)) for (const h of b[slot]) assert.ok(b[slot].length === n && (slot === 'glow' ? TEAL.includes(h) : BLK36.includes(h)), `copilot-b.${slot} ${h}`);
});

test('every brand palette is BLK 36 only, and the eyes glow [OIII] teal', () => {
  for (const [id, pal] of Object.entries(BRAND_PALETTES)) {
    for (const [slot, n] of Object.entries(SLOTS)) {
      assert.equal(pal[slot].length, n, `${id}.${slot}`);
      for (const h of pal[slot]) {
        if (slot === 'glow') assert.ok(TEAL.includes(h), `${id}.glow ${h} is not [OIII] teal`);
        else assert.ok(BLK36.includes(h), `${id}.${slot} ${h} is not BLK 36`);
      }
    }
    for (const trim of BRAND_BY_ID[id].trims) {
      assert.equal(trim.length, SLOTS.trim, `${id} seeded trim`);
      for (const h of trim) assert.ok(BLK36.includes(h), `${id} seeded trim ${h} is not BLK 36`);
    }
  }
  for (const c of BRAND_COLOURS) {
    assert.ok(BRAND_BY_ID[c.brand], c.brand);
    for (const h of c.chosen) {
      assert.ok(BLK36.includes(h), `${c.brand} ${c.part}: ${h} is not BLK 36`);
      assert.ok(Object.values(SLOTS).length && Object.keys(SLOTS).some((s) => BRAND_PALETTES[c.brand][s].includes(h)), `${c.brand} ${c.part}: ${h} is not in its palette`);
    }
    // A pick that isn't the nearest BLK 36 colour must say why.
    const nearest = BLK36.reduce((m, h) => (dist(c.hex, h) < dist(c.hex, m) ? h : m));
    if (!c.chosen.includes(nearest)) assert.ok(c.why.length > 20, `${c.brand} ${c.part}: chose ${c.chosen} over the nearest ${nearest} without a reason`);
  }
});

test('A3 one family: head-is-body, a thruster pack with smoke, a V2 screen face, no arms', () => {
  for (const b of BRANDS) {
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
  const own = BRANDS.filter((b) => b.params.eyes >= EYES.length);
  assert.deepEqual(own.map((b) => [b.id, b.params.eyes]), [['copilot', DRONE_EYE.pills], ['codex', DRONE_EYE.prompt]]);
  for (const b of own) assert.ok(Number.isInteger(b.v2Eyes) && b.v2Eyes < EYES.length, `${b.id}: a V2 fallback`);
  assert.deepEqual(BRANDS.filter((b) => b.v2Eyes != null).map((b) => b.id), ['copilot', 'codex']);
  assert.equal(PARAM_BY_KEY.eyes.options.length, 12, 'drones have the 10 V2 eyes plus two drone-only ones');
});

test('A3 size class: every drone is within D-final\'s size class', () => {
  const size = (P) => { const e = extents(layout(P)); return { h: (e.top - e.bottom) / K_HEIGHT, w: (2 * e.half) / K_HEIGHT }; };
  const ref = size({ ...DEFAULTS, ...FINAL.params });
  for (const b of BRANDS) {
    const s = size(b.params);
    const area = (s.h * s.w) / (ref.h * ref.w);
    assert.ok(area > 0.6 && area < 1.4, `${b.id}: ${(area * 100).toFixed(0)}% of D-final's area`);
    assert.ok(Math.max(s.h, s.w) > 0.34 && Math.max(s.h, s.w) < 0.52, `${b.id}: largest extent ${(Math.max(s.h, s.w) * 100).toFixed(0)}% of a K astronaut`);
    assert.ok(s.h > 0.26, `${b.id}: ${(s.h * 100).toFixed(0)}% tall`);
  }
});

test('brand parts attach to the head (one connected piece)', () => {
  for (const b of [...BRANDS, ...BRAND_OPTIONS]) {
    const P = b.params, L = layout(P);
    const on = (v, tol, what) => assert.ok(L.core(v) <= tol, `${b.id}: ${what} is ${L.core(v).toFixed(4)} off the head`);
    L.crown.forEach((c) => on(c, P.crownR, 'a crown puff'));
    L.skirt.forEach((k) => on(k.a, P.skirt === 3 ? P.skirtR : 0, P.skirt === 3 ? 'a hem scallop' : 'a leg or tentacle root'));
    if (L.snout) on(L.snout.a, 0, 'the snout root');
    if (P.ears) L.ears.forEach((e) => on(e, P.ears === 3 ? P.earR : P.earT, 'an ear'));
    L.ant.forEach((a) => on(a.base, 0, 'an antenna base'));
    L.thr.forEach((n) => on(n.a, 0, 'a nozzle root'));
    if (P.antenna === 3) assert.equal(L.hook.length, 4, `${b.id}: the question hook`);
    if (P.topper === 1) {
      // Each lens stands on its root on the head (lifted by less than its half-height), the bridge
      // runs from lens to lens over the head, and the strap hugs the head all the way round.
      L.gog.forEach((g) => { on(g.at, 0.001, 'a goggle root'); assert.ok(g.at.distanceTo(g.c) < P.gogH, `${b.id}: a lens floats off its root`); });
      if (P.gogBridge) {
        const { a, m, b: e, r } = L.bridge;
        on(m, r, 'the goggle bridge');
        [a, e].forEach((p, i) => assert.ok(p.distanceTo(L.gog[i].c) < P.gogW, `${b.id}: the bridge misses lens ${i}`));
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

test('brand motion is loop-locked: body, behaviour, smoke and skirt one loop later are the same', () => {
  const flat = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v));
  for (const b of BRANDS) {
    const P = b.params, L = layout(P);
    for (const [motion, loop] of [[false, LOOP], [true, MOTION_LOOP]]) {
      for (const t of [0, 0.7, 4.3, 8.1]) {
        assert.equal(flat(bodyAt(P, t + loop, motion)), flat(bodyAt(P, t, motion)), `${b.id} body at ${t}`);
        assert.equal(flat(behaviour(t + loop, motion)), flat(behaviour(t, motion)), `${b.id} behaviour at ${t}`);
        assert.equal(flat(smokeAt(L, t + loop, motion)), flat(smokeAt(L, t, motion)), `${b.id} smoke at ${t}`);
        assert.equal(flat(skirtAt(L, t + loop)), flat(skirtAt(L, t)), `${b.id} skirt at ${t}`);
      }
    }
  }
  // Qodo reviews: its head dips while it works, and nobody else's does.
  const Q = BRAND_BY_ID.qodo.params;
  assert.ok(Q.workNod > 0 && Q.glyphSet === 2);
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

test('A4: the last lab run found every pair distinct at the crew close-up and at system distance', () => {
  const a4 = JSON.parse(readFileSync(new URL('../out/brands-a4.json', import.meta.url), 'utf8'));
  assert.deepEqual(a4.thresholds, { shape: 0.25, colour: 0.06 });
  assert.deepEqual(a4.same, SAME_DRONE);
  const gated = a4.scales.filter((s) => s.gate);
  assert.deepEqual(gated.map((s) => s.name), ['crew close-up', 'system distance']);
  const n = BRANDS.length;
  for (const s of gated) {
    assert.equal(s.pairs.length, (n * (n - 1)) / 2, `${s.name}: every pair measured`);
    for (const p of s.pairs) {
      // Generic and unknown are the same drone by design: measured, flagged, not gated.
      const same = SAME_DRONE.some(([a, b]) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
      assert.equal(!!p.same, same, `${s.name}: ${p.a}–${p.b} same flag`);
      if (!same) assert.ok(p.score >= 1, `${s.name}: ${p.a}–${p.b} score ${p.score.toFixed(2)}`);
    }
    assert.ok(!s.closest.same && !s.minDE.same && !s.maxIoU.same, `${s.name}: the summary skips the same-drone pair`);
    // Every option is measured against the ten drones that aren't its own brand's.
    assert.deepEqual(s.options.map((o) => o.id), BRAND_OPTIONS.map((o) => o.id));
    for (const o of s.options) assert.equal(o.pairs.length, n - 1, `${s.name}: ${o.id}`);
  }
});
