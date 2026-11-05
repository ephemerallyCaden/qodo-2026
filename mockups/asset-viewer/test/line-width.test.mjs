// Lava fissures and ice crevasses must read through the pixel filter at 180p: for lava and
// ice at S/M/L (studio view, depth off), the median width of the crack pixels must be
// >= 2 px, and lines must not break up into isolated pixels. Each planet must also show a
// clear mix of solid ground, cracks and open plates (lava pools, ice water). Pixels are
// classified by the shader's regions debug view; on layered lava (the default) a crack is the gap
// between two crust plates, so this is the gap width. Fails on empty output.
// Cracks are world-space with a 1 px half-width screen floor (art-direction §6 Scale), so the
// width rule is also swept over size x camera distance (projected radius ~17-109 px), not only at
// hero size: far and small planets rely on the floor, close ones on the world width.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { LINE_SET, measureLines } from '../debug/measure-line-width.mjs';

const SWEEP_DISTS = [12, 3.4]; // far and close camera distances (studio = 7)
const lineBad = (rows) => rows.filter((r) => r.linePx < 50 || r.median < 2 || r.isolated > 0.05)
  .map((r) => `${r.biome}/${r.seed} size ${r.size} radius ${r.radiusPx} px: ${r.linePx} px, median ${r.median}, isolated ${r.isolated}`);

let viewer;
before(async () => { viewer = await openViewer(); });
after(() => viewer?.browser.close());

test('lava fissures and ice crevasses: median width >= 2 px at 180p, no speckle, not empty', async () => {
  const rows = [];
  for (const [biome, seed, size] of LINE_SET) rows.push(await measureLines(viewer.page, biome, seed, size));
  console.table(rows);
  assert.deepEqual(lineBad(rows), []);
  // the mix: ground stays the majority, cracks still show, and open pools / water are a real share
  const unmixed = rows.filter((r) => r.ground < 0.4 || r.crack < 0.03 || r.open < 0.1 || r.open > 0.55);
  assert.deepEqual(unmixed.map((r) => `${r.biome}/${r.seed}: ground ${r.ground}, crack ${r.crack}, open ${r.open}`), []);
});

test('crack width holds over size x distance: median >= 2 px, no speckle, from ~17 to ~109 px radius', async () => {
  const rows = [];
  for (const [biome, seed, size] of LINE_SET) for (const dist of SWEEP_DISTS) rows.push({ dist, ...(await measureLines(viewer.page, biome, seed, size, { dist })) });
  console.table(rows);
  const radii = rows.map((r) => r.radiusPx);
  assert.ok(Math.min(...radii) <= 18 && Math.max(...radii) >= 100, `sweep must reach both extremes: radius ${Math.min(...radii)}-${Math.max(...radii)} px`);
  assert.deepEqual(lineBad(rows), []);
});
