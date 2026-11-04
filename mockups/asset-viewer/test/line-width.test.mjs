// Lava fissures and ice crevasses must read through the pixel filter at 180p: for lava and
// ice at S/M/L (studio view, depth off), the median width of the crack pixels must be
// >= 2 px, and lines must not break up into isolated pixels. Each planet must also show a
// clear mix of solid ground, cracks and open plates (lava pools, ice water). Pixels are
// classified by the shader's regions debug view; on layered lava (the default) a crack is the gap
// between two crust plates, so this is the gap width. Fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { LINE_SET, measureLines } from '../debug/measure-line-width.mjs';

test('lava fissures and ice crevasses: median width >= 2 px at 180p, no speckle, not empty', async () => {
  const { browser, page } = await openViewer();
  try {
    const rows = [];
    for (const [biome, seed, size] of LINE_SET) rows.push(await measureLines(page, biome, seed, size));
    console.table(rows);
    const bad = rows.filter((r) => r.linePx < 50 || r.median < 2 || r.isolated > 0.05);
    assert.deepEqual(bad.map((r) => `${r.biome}/${r.seed}: ${r.linePx} px, median ${r.median}, isolated ${r.isolated}`), []);
    // the mix: ground stays the majority, cracks still show, and open pools / water are a real share
    const unmixed = rows.filter((r) => r.ground < 0.4 || r.crack < 0.03 || r.open < 0.1 || r.open > 0.55);
    assert.deepEqual(unmixed.map((r) => `${r.biome}/${r.seed}: ground ${r.ground}, crack ${r.crack}, open ${r.open}`), []);
  } finally {
    await browser.close();
  }
});
