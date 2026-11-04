// Animated lava (LAVA_MODES): layered (default), static-painted (the 3b6a482 flow) and full-warp must
// animate the lava, loop seamlessly over the 24 s period (last -> first frame diff no bigger than a
// typical 15 fps step), keep yellow an accent (5-15% of glow pixels), not shimmer (1 px isolated glow
// pixels under 9%; layered at most 3 points above itself with the field frozen at t = 0), and draw glow at
// all (fails on empty output). Layered is two layers: with the planet held still and only the molten
// field running, the crack gaps and pools must change colour over the loop (they show the moving
// layer) while no crust plate pixel changes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { measureLava, measureLayers } from '../debug/measure-lava-flow.mjs';

let viewer; // one browser for both tests (each launch recompiles every shader in SwiftShader)
before(async () => { viewer = await openViewer(); });
after(() => viewer?.browser.close());

test('animated lava: layered / static-painted / full-warp loop seamlessly, keep yellow an accent, no shimmer, not empty', async () => {
  const { page } = viewer;
  const frozen = await measureLava(page, 'layered', { lavaTime: 0, seamFrames: 0 });
  const rows = [frozen];
  for (const m of ['layered', 'static-painted', 'full-warp']) rows.push(await measureLava(page, m, { seamFrames: 8, cost: false }));
  console.table(rows);
  // at the same frame: layered moves (differs from its frozen field), and the three modes all differ
  const urls = await page.evaluate(() => {
    const grab = (lavaMode, lavaTime = null) => { window.viewer.set({ view: 'planet', biome: 'lava', seed: 11, size: 1, ringMode: 'off', moons: false, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, artefacts: false, cover: null, regions: false, time: 5, lavaMode, lavaTime }); return document.getElementById('view').toDataURL(); };
    return [grab('layered', 0), grab('layered'), grab('static-painted'), grab('full-warp')];
  });
  assert.equal(new Set(urls).size, 4, 'layered does not move, or two lava modes render alike');
  for (const r of rows.slice(1)) {
    assert.ok(r.glowPx > 500, `${r.lavaMode}: ${r.glowPx} glow px (empty)`);
    assert.ok(r.yellow >= 0.05 && r.yellow <= 0.15, `${r.lavaMode}: yellow ${r.yellow} of glow`);
    // motion adds no shimmer to layered; static-painted and full-warp are unchanged from 3b6a482 (6.6%, 7.0%)
    const limit = r.lavaMode === 'layered' ? Math.min(0.09, frozen.isolated + 0.03) : 0.09;
    assert.ok(r.isolated < limit, `${r.lavaMode}: ${r.isolated} isolated glow px (limit ${limit}; frozen layered ${frozen.isolated})`);
    assert.ok(r.medianStep > 0 && r.seam <= r.medianStep * 1.5, `${r.lavaMode}: seam ${r.seam} px vs median step ${r.medianStep} px`);
  }
});

test('layered lava: crack gaps and pools show the moving layer, crust plates stay still, not empty', async () => {
  const rows = [];
  for (const [seed, size] of [[11, 1], [12, 0.7], [58, 1.3]]) rows.push(await measureLayers(viewer.page, { seed, size }));
  console.table(rows);
  for (const r of rows) {
    const tag = `seed ${r.seed}`;
    assert.ok(r.platePx > 500 && r.gapPx > 50 && r.poolPx > 200, `${tag}: ${r.platePx} plate / ${r.gapPx} gap / ${r.poolPx} pool px (empty)`);
    assert.equal(r.plateMoved, 0, `${tag}: ${r.plateMoved} crust plate px change with the molten field`);
    assert.ok(r.gapMoved >= 0.3, `${tag}: only ${r.gapMoved} of crack-gap px change over the loop`);
    assert.ok(r.poolMoved >= 0.3, `${tag}: only ${r.poolMoved} of pool px change over the loop`);
  }
});
