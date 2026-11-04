// Lava fissures and ice crevasses must read through the pixel filter at 180p: for lava and
// ice at S/M/L (studio view, depth off), the median width of the line pixels must be
// >= 2 px, and lines must not break up into isolated pixels. Fails on empty output.
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
  } finally {
    await browser.close();
  }
});
