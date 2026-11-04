// Zoom must not change the rock (bug report 2026-11-04: "on a lava planet, when I zoom in and out
// the actual rock formation changes"). The same lava / ice planet (same seed and time, same camera
// direction) is rendered in the regions debug view at several camera distances and pixel heights,
// and every pixel is mapped back to the planet's own sphere and labelled with the CPU port of the
// crack network (debug/repro-lava-zoom.mjs). Each framing is compared with the most detailed one
// (distance 4, 180p, planet radius ~71 px) on a fixed 28-degree surface cap that all of them see:
//   1. topology: the cracks run along the same plate edges (length-weighted edge match >= 0.9), and
//      pools / open water are exactly the CPU's plates (no miss more than 2 px from a cell edge).
//   2. width: crack area share on the cap stays within 0.8-1.25x, and at most 10% of fixed surface
//      points switch between crack and crust. This one encodes "the rock only gets bigger or smaller",
//      which conflicts with the art-direction rule "width is set in screen pixels"; see the bug
//      report's design options before changing either.
// Both must not pass on empty output: the reference must draw cracks and the cap must be sampled.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { renderCap, analyse, edgeMatch, flips } from '../debug/repro-lava-zoom.mjs';

const PLANETS = [['lava', 11], ['lava', 58], ['lava', 12], ['ice', 8], ['ice', 19]];
const FRAMINGS = [{ dist: 12, pixelH: 180 }, { dist: 7, pixelH: 180 }, { dist: 7, pixelH: 120 }]; // radius ~24, ~41, ~27 px
const REF = { dist: 4, pixelH: 180 }; // radius ~71 px: above the small-planet ramp (68 px)

let viewer, rows; // one browser and one set of renders for both tests
before(async () => {
  viewer = await openViewer();
  rows = [];
  for (const [biome, seed] of PLANETS) {
    const ref = analyse(await renderCap(viewer.page, { biome, seed, capDeg: 28, ...REF }), biome);
    for (const f of FRAMINGS) {
      const r = analyse(await renderCap(viewer.page, { biome, seed, capDeg: 28, ...f }), biome);
      const fl = flips(r.samples, ref.samples);
      rows.push({
        planet: `${biome}/${seed}`, framing: `d${f.dist} ${f.pixelH}p`, radiusPx: r.radiusPx,
        edges: `${r.crackEdges.size}/${ref.crackEdges.size}`, edgeMatch: edgeMatch(r, ref), openMiss: r.openMiss,
        crackShare: +(r.crack / Math.max(1e-3, ref.crack)).toFixed(2), crackFlip: fl.crackFlip,
        plates: `${r.plates}/${ref.plates}`, refCrackPx: ref.crackKeys.length, samples: fl.samples,
      });
    }
  }
  console.table(rows);
});
after(() => viewer?.browser.close());

test('zoom keeps the rock: cracks run along the same plate edges at every distance and pixel height, pools exact, not empty', () => {
  const empty = rows.filter((r) => r.refCrackPx < 100 || r.samples < 500);
  assert.deepEqual(empty.map((r) => `${r.planet} ${r.framing}: ${r.refCrackPx} reference crack px, ${r.samples} samples`), []);
  const pools = rows.filter((r) => !r.openMiss.startsWith('0/') || r.openMiss === '0/0');
  assert.deepEqual(pools.map((r) => `${r.planet} ${r.framing}: pool misses ${r.openMiss}`), []);
  const moved = rows.filter((r) => r.edgeMatch < 0.9);
  assert.deepEqual(moved.map((r) => `${r.planet} ${r.framing} (radius ${r.radiusPx} px): crack edge match ${r.edgeMatch}, edges ${r.edges}`), []);
});

test('zoom keeps the rock: crack width scales with the planet (design-dependent, see header)', () => {
  const resized = rows.filter((r) => r.crackShare < 0.8 || r.crackShare > 1.25 || r.crackFlip > 0.1);
  assert.deepEqual(resized.map((r) => `${r.planet} ${r.framing} (radius ${r.radiusPx} px): crack share ${r.crackShare}x, ${r.crackFlip} of points flip crack/crust`), []);
});
