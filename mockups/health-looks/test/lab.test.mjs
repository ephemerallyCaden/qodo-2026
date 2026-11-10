// The lab's inputs: the constants copied from the viewer still match it, and every library state
// the lab sends passes the library's own validation unchanged (Node, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';
import { normalise } from '../../asset-library/state.js';
import { VIEWER, CONDITIONS, LOOKS, SEEDS, SENTINEL, WARM_HUE, BASE, FULL, EMISSIVE_LOOKS, fadeAt, stateFor, geometryFor, condition } from '../lab.mjs';
import { hexToRgb } from '../metrics.mjs';

const viewer = await readFile(new URL('../../asset-viewer/viewer.js', import.meta.url), 'utf8');

test('the constants match viewer.js', () => {
  assert.match(viewer, new RegExp(`new THREE\\.PerspectiveCamera\\(${VIEWER.fov},`));
  assert.match(viewer, new RegExp(`planet: \\{ pos: \\[${VIEWER.hero.join(', ')}\\], target: \\[0, 0, 0\\]`));
  assert.match(viewer, new RegExp(`const SMOOTH = \\{ near: ${VIEWER.smooth.near}, far: ${VIEWER.smooth.far} \\}`));
  const depth = /depth: \[\['#1b1f4a', ([\d.]+)\], \['#1b1f4a', ([\d.]+)\], \['#1b1f4a', ([\d.]+)\], \['#17172f', ([\d.]+)\]\]/.exec(viewer);
  assert.ok(depth, 'the final palette depth line');
  assert.deepEqual(depth.slice(1).map(Number), VIEWER.depth);
  assert.match(viewer, /bool glow = uBiome == 4 &&/, 'only the lava branch reads the emissive ramp');
  assert.match(viewer, /lava: \{ id: 4,/, 'biome 4 is lava');
  assert.deepEqual([...EMISSIVE_LOOKS], ['lava']);
});

test('the depth fade: none near, full at 44 and beyond', () => {
  assert.equal(fadeAt(5), 0);
  assert.equal(fadeAt(44), 0.88);
  assert.equal(fadeAt(80), 0.88);
  assert.ok(Math.abs(fadeAt(21.3) - 0.72) < 0.005, 'far is depth level 2');
  for (let i = 1; i < CONDITIONS.length; i++) assert.ok(Number.isFinite(fadeAt(CONDITIONS[i].d)));
});

test('the conditions cover the art direction worst cases', () => {
  const disc = (k) => 2 * geometryFor(condition(k)).r;
  assert.ok(condition(BASE) && condition(FULL), 'the named baseline and full-fade conditions exist');
  assert.ok(Math.abs(disc(FULL) - 10) < 1, 'about 10 px at full fade');
  assert.equal(fadeAt(condition(FULL).d), 0.88);
  assert.ok(Math.abs(disc('small-far') - 10) < 1, 'the smallest size as a 10 px disc');
  assert.equal(Math.min(...CONDITIONS.map((c) => c.size)), 0.25, "the library's smallest planet");
  assert.ok(SEEDS.length >= 20, 'H5: 20+ seeds');
  assert.deepEqual(LOOKS.map((l) => l.band), ['lava', 'toxic', 'ash', 'healthy', 'healthy', 'healthy']);
});

test('the emissive sentinels differ from every glow colour in every channel', () => {
  for (const s of Object.values(SENTINEL)) for (const g of V2_PLANET_RAMPS.glow) hexToRgb(s).forEach((c, i) => assert.notEqual(c, hexToRgb(g)[i]));
  assert.ok(Math.abs(WARM_HUE - 47.3) < 0.1, 'the warm pole is the glow body hue');
});

test('every library state the lab sends survives normalise() unchanged', () => {
  for (const cond of CONDITIONS) {
    for (const opts of [{}, { empty: true }, { palette: SENTINEL }]) {
      const s = stateFor({ biome: 'lava', seed: 24 }, cond, opts);
      const n = normalise(s);
      assert.deepEqual(n.camera, s.camera, `${cond.key} camera`);
      for (const k of Object.keys(s.asset)) assert.deepEqual(n.asset[k], s.asset[k], `${cond.key} asset.${k}`);
      for (const k of Object.keys(s.render)) assert.deepEqual(n.render[k], s.render[k], `${cond.key} render.${k}`);
      assert.deepEqual(n.palette, s.palette, `${cond.key} palette`);
    }
  }
});
