// state.js (Node, no browser): normalise() is the boundary for pasted JSON and hand-edited URLs,
// and the URL / JSON encodings round-trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../state.js';
import { showcaseScene, crewScene, ITEMS } from '../catalogue.js';

test('defaults: an empty or junk input gives the default state', () => {
  const d = S.defaultState();
  for (const junk of [undefined, null, 42, 'x', [], { asset: 'nope', render: [], palette: 7, scene: { items: 'x' } }]) assert.deepEqual(S.normalise(junk), d);
  assert.equal(d.asset.kind, 'planet');
  assert.equal(d.render.play, false, 'a URL renders a still frame unless it says play');
});

test('normalise clamps ranges, checks enums and colours', () => {
  const s = S.normalise({
    asset: { kind: 'planet', biome: 'volcano', seed: -5, size: 99, ringWidth: 0.001, cover: 2, float: null, moonOrbits: [{ size: 9 }, 'x'], layers: { surface: 'yes', ring: false }, pos: [1e9, 'a', 2] },
    render: { pixelH: 9999, t: -1, depthMode: 'fancy', surfaceTurns: 2.6, period: Infinity },
    palette: { 'land.2': '#ABCDEF', 'land.3': 'red', '__proto__.x': '#000001', 'a.b.c.d': '#000001', space: '#0d0b16' },
  });
  assert.equal(s.asset.biome, 'lush');
  assert.equal(s.asset.seed, 1);
  assert.equal(s.asset.size, 2.2);
  assert.equal(s.asset.ringWidth, 0.03);
  assert.equal(s.asset.cover, 0.45);
  assert.equal(s.asset.float, null);
  assert.equal(s.asset.moonOrbits[0].size, 0.4);
  assert.deepEqual(s.asset.moonOrbits[1], S.MOON_DEFAULTS[1]);
  assert.deepEqual(s.asset.layers, { surface: true, haze: true, clouds: true, ring: false });
  assert.deepEqual(s.asset.pos, [60, 0, 2]);
  assert.equal(s.render.pixelH, 480);
  assert.equal(s.render.t, 0);
  assert.equal(s.render.depthMode, 'pixel-smooth');
  assert.equal(s.render.surfaceTurns, 3);
  assert.equal(s.render.period, 24);
  assert.deepEqual(s.palette, { 'land.2': '#abcdef', space: '#0d0b16' }, 'only well-formed paths and hex colours survive');
});

test('astronaut colours: presets, any hex, or the default', () => {
  const a = (color, eyeGlow) => S.normaliseAstronaut({ color, eyeGlow });
  assert.equal(a('mint').color, 'mint');
  assert.equal(a('#E0A020').color, '#e0a020');
  assert.equal(a('#e0a0').color, 'coral');
  assert.equal(a('javascript:alert(1)').color, 'coral');
  assert.equal(a('coral', '#00FFD5').eyeGlow, '#00ffd5');
  assert.equal(a('coral', 'teal').eyeGlow, null);
  assert.equal(S.normaliseAstronaut({ eyes: 12 }).eyes, 9);
  assert.equal(S.normaliseAstronaut({ eyes: 'auto' }).eyes, 'auto');
  assert.equal(S.normaliseAstronaut({ handle: 'x'.repeat(100) }).handle.length, 40);
});

test('scenes: items are planets, astronauts, drones or stars only, capped, selection in range', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ kind: ['lab', 'astronaut', 'planet', 'drone', 'star'][i % 5] }));
  const s = S.normalise({ mode: 'scene', scene: { items, selected: 99 } });
  assert.equal(s.scene.items.length, S.MAX_ITEMS);
  assert.ok(s.scene.items.every((it) => ['planet', 'astronaut', 'drone', 'star'].includes(it.kind)));
  assert.ok(s.scene.items.some((it) => it.kind === 'star'), 'the star joins scenes');
  assert.ok(s.scene.items.some((it) => it.kind === 'drone'), 'drones join scenes beside the crew');
  assert.equal(s.scene.selected, S.MAX_ITEMS - 1);
});

test('URL hash and JSON round-trip every catalogue entry and both scene presets', () => {
  const states = [
    ...ITEMS.filter((it) => it.state).map((it) => S.normalise({ ...it.state, palette: { 'land.2': '#c16a7d' } })),
    S.normalise({ mode: 'scene', scene: showcaseScene() }),
    S.normalise({ mode: 'scene', scene: crewScene(), render: { t: 7.25, play: true } }),
  ];
  assert.ok(states.length > 40);
  for (const s of states) {
    const hash = S.encodeHash(s);
    assert.match(hash, /^#s=[A-Za-z0-9_-]+$/);
    assert.deepEqual(S.decodeHash(hash), s);
    assert.deepEqual(S.fromJSON(S.toJSON(s)), s);
  }
});

test('bad hashes and bad JSON are rejected, not half-applied', () => {
  for (const h of ['', '#', '#s=', '#s=!!!', '#s=bm90IGpzb24', '#x=e30']) assert.equal(S.decodeHash(h), null, h);
  assert.throws(() => S.fromJSON('{not json'), /not valid JSON/);
  assert.throws(() => S.fromJSON('[1,2]'), /JSON object/);
  assert.deepEqual(S.fromJSON('{}'), S.defaultState());
});
