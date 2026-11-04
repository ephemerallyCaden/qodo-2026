// Animated lava (LAVA_MODES): flow (default) and full-warp must animate the lava, loop seamlessly
// over the 24 s period (last -> first frame diff no bigger than a typical 15 fps step), keep
// yellow an accent (5-15% of glow pixels), not shimmer (1 px isolated glow pixels at most 3 points
// above static and under 9%), and draw glow at all (fails on empty output).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { measureLava } from '../debug/measure-lava-flow.mjs';

test('animated lava: flow and full-warp loop seamlessly, keep yellow an accent, no shimmer, not empty', async () => {
  const { browser, page } = await openViewer();
  try {
    const rows = [];
    for (const m of ['static', 'flow', 'full-warp']) rows.push(await measureLava(page, m, { seamFrames: 8 }));
    console.table(rows);
    const [stat, ...anim] = rows;
    // the molten fill moves: flow and full-warp differ from static at the same frame
    const differs = await page.evaluate(() => {
      const grab = (lavaMode) => { window.viewer.set({ view: 'planet', biome: 'lava', seed: 11, size: 1, ringMode: 'off', moons: false, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, artefacts: false, cover: null, time: 5, lavaMode }); return document.getElementById('view').toDataURL(); };
      const s = grab('static');
      return [grab('flow') !== s, grab('full-warp') !== s];
    });
    assert.deepEqual(differs, [true, true], 'flow / full-warp render like static');
    for (const r of anim) {
      assert.ok(r.glowPx > 500, `${r.lavaMode}: ${r.glowPx} glow px (empty)`);
      assert.ok(r.yellow >= 0.05 && r.yellow <= 0.15, `${r.lavaMode}: yellow ${r.yellow} of glow`);
      assert.ok(r.isolated < 0.09 && r.isolated <= stat.isolated + 0.03, `${r.lavaMode}: ${r.isolated} isolated glow px (static ${stat.isolated})`);
      assert.ok(r.medianStep > 0 && r.seam <= r.medianStep * 1.5, `${r.lavaMode}: seam ${r.seam} px vs median step ${r.medianStep} px`);
    }
  } finally {
    await browser.close();
  }
});
