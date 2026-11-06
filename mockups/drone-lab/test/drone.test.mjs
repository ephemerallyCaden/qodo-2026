// Pure-JS checks of the drone lab: parameter sets, attachment, loop lock, palettes and the
// dev server's allowlist. The pixel checks (palette-only, pieces, empty, seams) run in lab.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS, PARAM_BY_KEY, DEFAULTS } from '../params.js';
import { VARIANTS, RECOMMENDED } from '../variants.js';
import { PALETTES, SLOTS, TEAL } from '../palette.js';
import { layout, pose, extents, intendedPieces, LOOP, MOTION } from '../drone.js';
import { resolveFile } from '../serve.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sets = VARIANTS.map((v) => [v.id, { ...DEFAULTS, ...v.params }]);
// Every select option at least once, on the defaults, so unused parts are covered too.
for (const p of PARAMS.filter((q) => q.type === 'select')) p.options.forEach((_, i) => sets.push([`${p.key}=${i}`, { ...DEFAULTS, [p.key]: i }]));
for (const n of [0, 1, 2]) sets.push([`rotors ${n}`, { ...DEFAULTS, prop: 0, rotorN: n }]);

test('directions use known parameters inside their ranges', () => {
  assert.ok(VARIANTS.length >= 4 && VARIANTS.length <= 6);
  assert.ok(VARIANTS.some((v) => v.id === RECOMMENDED));
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

test('every add-on is anchored on the shell surface (one connected piece)', () => {
  for (const [id, P] of sets) {
    const L = layout(P);
    const onCore = (v, tol, what) => assert.ok(L.core(v) <= tol, `${id}: ${what} is ${L.core(v).toFixed(4)} off the shell`);
    if (P.ears) L.ears.forEach((e) => onCore(e, P.earT, 'an ear'));
    if (P.topper === 1) L.gog.forEach((g) => onCore(g.c, 0.01, 'a goggle'));
    if (P.topper === 2) onCore(L.crest.c, 0, 'the crest');
    L.ant.forEach((a) => onCore(a.base, 0, 'an antenna base'));
    if (P.arms) onCore({ x: L.shoulderX, y: L.armY, z: 0, clone() { return this; } }, P.armR, 'a shoulder');
    if (P.prop === 0) L.rotors.forEach((r) => onCore(r.a, 0.016, 'a rotor arm'));
    if (P.prop === 1) onCore(L.ring.c.clone().setY(L.ring.c.y + 0.55 * P.ringT), 0.004, 'the ring core');
    if (P.prop === 2) onCore(L.lens.c.clone().setY(L.lens.c.y + L.lens.b.y), 0, 'the lens');
    if (P.prop === 3) onCore(L.noz.a, P.glowR, 'the nozzle');
  }
});

test('motion is loop-locked: the pose one loop later is the same', () => {
  for (const n of Object.values(MOTION)) assert.ok(Number.isInteger(n) && n >= 1);
  assert.equal(24 % LOOP, 0, 'the turntable loop divides the 24 s scene loop');
  const flat = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
  const mod = (x) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  for (const [id, P] of sets) {
    const L = layout(P);
    for (const t of [0, 0.7, 2.3]) {
      const a = pose(L, t), b = pose(L, t + LOOP);
      a.spin = mod(a.spin); b.spin = mod(b.spin);
      assert.equal(flat(b), flat(a), `${id} at t = ${t}`);
    }
  }
});

test('drones are no taller than a K astronaut (0.95) and have their intended pieces', () => {
  for (const [id, P] of sets) {
    const { top, bottom } = extents(layout(P));
    assert.ok(top > bottom, id);
    assert.ok(top - bottom <= 0.95, `${id}: ${(top - bottom).toFixed(3)} tall`);
    assert.equal(intendedPieces(P), P.prop === 2 ? 1 + P.halos : 1);
  }
});

test('palettes fill every slot with hex colours; the base glows [OIII] teal', () => {
  for (const [key, pal] of Object.entries(PALETTES)) {
    for (const [slot, n] of Object.entries(SLOTS)) {
      assert.equal(pal[slot].length, n, `${key}.${slot}`);
      for (const h of pal[slot]) assert.match(h, /^#[0-9a-f]{6}$/, `${key}.${slot}`);
    }
  }
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
