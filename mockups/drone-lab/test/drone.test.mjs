// Pure-JS checks of the drone lab: parameter sets, attachment, size, loop lock, smoke,
// palettes and the dev server's allowlist. The pixel checks (palette-only, one connected body,
// non-empty, unclipped, seamless GIFs) run in lab.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS, PARAM_BY_KEY, DEFAULTS } from '../params.js';
import { VARIANTS, RECOMMENDED } from '../variants.js';
import { PALETTES, SLOTS, TEAL } from '../palette.js';
import { layout, extents, bodyAt, behaviour, smokeAt, LOOP, MOTION_LOOP, CYCLES, PUFF_PERIOD, MAX_PUFFS, MAX_SPARKS } from '../drone.js';
import { resolveFile } from '../serve.mjs';
import { CREW } from '../../explorations/astronaut-lab/crew.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const K_HEIGHT = 0.95; // a K astronaut
const sets = VARIANTS.map((v) => [v.id, { ...DEFAULTS, ...v.params }]);
// Every select option at least once, on the defaults, so unused parts are covered too.
for (const p of PARAMS.filter((q) => q.type === 'select')) p.options.forEach((_, i) => sets.push([`${p.key}=${i}`, { ...DEFAULTS, [p.key]: i }]));

test('five variants use known parameters inside their ranges, and none has arms', () => {
  assert.equal(VARIANTS.length, 5);
  assert.deepEqual(VARIANTS.map((v) => v.id), ['A', 'B', 'C', 'D', 'E']);
  assert.ok(VARIANTS.some((v) => v.id === RECOMMENDED));
  assert.ok(!PARAM_BY_KEY.arms, 'the brief says no arms');
  for (const v of VARIANTS) {
    assert.ok(v.leaning && v.name, v.id);
    for (const [k, val] of Object.entries(v.params)) {
      const p = PARAM_BY_KEY[k];
      assert.ok(p, `${v.id}: unknown parameter ${k}`);
      if (p.type === 'select') assert.ok(Number.isInteger(val) && val >= 0 && val < p.options.length, `${v.id}.${k}`);
      else assert.ok(val >= p.min && val <= p.max, `${v.id}.${k} = ${val} outside ${p.min}..${p.max}`);
    }
  }
  for (const p of PARAMS) if (p.type !== 'select') assert.ok(p.def >= p.min && p.def <= p.max, p.key);
});

test('the five variants really differ: head, screen, thrusters, smoke and eyes', () => {
  const P = VARIANTS.map((v) => ({ ...DEFAULTS, ...v.params }));
  for (const k of ['thrusters', 'eyes']) assert.equal(new Set(P.map((p) => p[k])).size, 5, `${k} repeats`);
  assert.equal(new Set(P.map((p) => p.smoke)).size, 3, 'all three smoke styles');
  const aspect = P.map((p) => `${Math.round((p.headH / p.headW) * 10)}:${Math.round((p.headD / p.headW) * 10)}:${Math.round(p.headRound * 2)}`);
  assert.equal(new Set(aspect).size, 5, `head silhouettes repeat: ${aspect}`);
});

test('every add-on is anchored on the head surface (one connected piece)', () => {
  for (const [id, P] of sets) {
    const L = layout(P);
    const onCore = (v, tol, what) => assert.ok(L.core(v) <= tol, `${id}: ${what} is ${L.core(v).toFixed(4)} off the head`);
    if (P.ears) L.ears.forEach((e) => onCore(e, P.earT, 'an ear'));
    if (P.rim) onCore(L.rim.c.clone().setX(L.rim.r[0]), P.rimT, 'the rim');
    if (P.topper === 1) L.gog.forEach((g) => onCore(g.c, 0.01, 'a goggle'));
    if (P.topper === 2) onCore(L.crest.c, 0, 'the crest');
    L.ant.forEach((a) => onCore(a.base, 0, 'an antenna base'));
    L.thr.forEach((n) => onCore(n.a, 0, 'a nozzle root'));
  }
});

test('drones are about half an astronaut tall', () => {
  for (const [id, P] of sets.slice(0, VARIANTS.length)) {
    const { top, bottom } = extents(layout(P));
    const share = (top - bottom) / K_HEIGHT;
    assert.ok(share > 0.42 && share < 0.58, `${id}: ${(share * 100).toFixed(0)}% of an astronaut`);
  }
});

test('motion is loop-locked: body, behaviour and smoke one loop later are the same', () => {
  for (const n of Object.values(CYCLES)) assert.ok(Number.isInteger(n) && n >= 1);
  assert.equal(24 % MOTION_LOOP, 0); assert.equal(24 % LOOP, 0);
  assert.equal(MOTION_LOOP % PUFF_PERIOD, 0); assert.equal(LOOP % PUFF_PERIOD, 0);
  const flat = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v));
  for (const [id, P] of sets) {
    const L = layout(P);
    for (const [motion, loop] of [[false, LOOP], [true, MOTION_LOOP]]) {
      for (const t of [0, 0.7, 4.3]) {
        assert.equal(flat(bodyAt(P, t + loop, motion)), flat(bodyAt(P, t, motion)), `${id} body at ${t}`);
        assert.equal(flat(behaviour(t + loop, motion)), flat(behaviour(t, motion)), `${id} behaviour at ${t}`);
        assert.equal(flat(smokeAt(L, t + loop, motion)), flat(smokeAt(L, t, motion)), `${id} smoke at ${t}`);
      }
    }
  }
});

test('the idle loop has every behaviour: glances both ways, blinks, works, banks toward its drift', () => {
  const ts = Array.from({ length: 240 }, (_, i) => (i / 240) * MOTION_LOOP);
  const b = ts.map((t) => behaviour(t, true));
  assert.ok(Math.min(...b.map((x) => x.glance)) <= -0.99 && Math.max(...b.map((x) => x.glance)) >= 0.99, 'looks both ways');
  assert.ok(b.some((x) => x.blink < 0.3), 'blinks');
  assert.ok(b.some((x) => x.work > 0.99) && b.some((x) => x.work === 0), 'works, then stops');
  const P = { ...DEFAULTS };
  // Banking: moving +x (t = 0, velocity peak) rolls the top toward +x (negative z rotation).
  const up = bodyAt(P, 0, true).m.elements.slice(4, 7); // the body's local +y in the root frame
  assert.ok(up[0] > 0.05, `top leans into the drift (up.x = ${up[0].toFixed(3)})`);
});

test('smoke: every variant puffs, within the shader limits, more when it works harder', () => {
  for (const [id, P] of sets) {
    const L = layout(P);
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const { puffs, sparks } = smokeAt(L, (i / 60) * MOTION_LOOP, true);
      assert.ok(puffs.length <= MAX_PUFFS && sparks.length <= MAX_SPARKS, id);
      for (const p of puffs) assert.ok(p.r >= 0 && Number.isFinite(p.c.x + p.c.y + p.c.z), id);
      total += puffs.length;
    }
    assert.ok(total > 30, `${id}: only ${total} puffs over the loop`);
  }
  const lazy = layout({ ...DEFAULTS, puffRate: 0.15 }), busy = layout({ ...DEFAULTS, puffRate: 1 });
  const count = (L) => Array.from({ length: 60 }, (_, i) => smokeAt(L, i / 5, true).puffs.length).reduce((a, b) => a + b);
  assert.ok(count(busy) > count(lazy) * 2);
});

test('palettes fill every slot with hex colours; the base is BLK 36 with teal glow', () => {
  for (const [key, pal] of Object.entries(PALETTES)) {
    for (const [slot, n] of Object.entries(SLOTS)) {
      assert.equal(pal[slot].length, n, `${key}.${slot}`);
      for (const h of pal[slot]) assert.match(h, /^#[0-9a-f]{6}$/, `${key}.${slot}`);
    }
  }
  const BLK36 = ['000000', '12173d', '293268', '464b8c', '6b74b2', '909edd', 'c1d9f2', 'ffffff', 'ffccd0', 'e5959f', 'c16a7d', '8c4b63', '66334b', '3f233c', '29174c', '412866', '643499', '8c51cc', 'b991f2', 'a5e6ff', '5ab9e5', '4185d8', '354ab2', '36277f', '0a2a33', '0f4a4c', '14665b', '22896e', '42bc7f', '8cff9b', 'ffe091', 'ff965f', 'cc5250', '872a38', 'd83843', 'ff6866'];
  for (const slot of ['shell', 'trim', 'screen', 'accent', 'smoke']) for (const h of PALETTES.base[slot]) assert.ok(BLK36.includes(h.slice(1)), `base.${slot} ${h} is not BLK 36`);
  // The shell must stay off the K suit ramp (a white-blue shell melts into the suits at 180p).
  for (const h of PALETTES.base.shell) assert.ok(!CREW.suit.includes(h), `base.shell ${h} is a suit colour`);
  assert.deepEqual(PALETTES.base.glow, TEAL);
  assert.deepEqual(TEAL, ['#004538', '#007c66', '#00bc9c', '#00ffd5']);
});

test('the dev server serves the lab and only the allowlisted shared modules', () => {
  assert.equal(resolveFile('/'), path.join(ROOT, 'index.html'));
  assert.equal(resolveFile('/asset-viewer/faces.js'), path.join(path.dirname(ROOT), 'asset-viewer', 'faces.js'));
  assert.equal(resolveFile('/explorations/astronaut-lab/astronaut.js'), path.join(path.dirname(ROOT), 'explorations', 'astronaut-lab', 'astronaut.js'));
  assert.equal(resolveFile('/../asset-viewer/viewer.js'), null);
  assert.equal(resolveFile('/%2e%2e/package.json'), null);
  assert.equal(resolveFile('/%E0%A4%A'), null);
  assert.ok(resolveFile('/asset-viewer/viewer.js').startsWith(ROOT + path.sep), 'non-allowlisted siblings resolve inside the lab (404), never outside');
});
