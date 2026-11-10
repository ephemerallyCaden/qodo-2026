// Renders through the asset library (headless Chromium + SwiftShader, no network) and checks the
// measurements the report rests on: renders are not empty, the mask is the disc, renders are
// deterministic, the emissive sentinel touches lava only, and the committed measurements.csv
// still matches a fresh render (so REPORT.md describes the current viewer and palette).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch, openLibrary, render } from '../harness.mjs';
import { condition, stateFor, geometryFor, SENTINEL, WARM_HUE, EMISSIVE_LOOKS } from '../lab.mjs';
import { measure, DISC_REACH } from '../metrics.mjs';
import { parseCsv, csvCell } from '../report.mjs';

let browser, page;
before(async () => {
  browser = await launch();
  page = await openLibrary(browser);
});
after(() => browser?.close());

const grab = (biome, seed, key, opts) => render(page, stateFor({ biome, seed }, condition(key), opts));
function colours({ data }) {
  const s = new Set();
  for (let i = 0; i < data.length; i += 4) s.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return s.size;
}
const sameBytes = (a, b) => a.data.length === b.data.length && a.data.every((x, i) => x === b.data[i]);

test('renders are not empty, and the mask is the planet disc', { timeout: 600000 }, async () => {
  for (const key of ['hero', 'full']) {
    const g = geometryFor(condition(key));
    const empty = await grab('lush', 1, key, { empty: true });
    assert.equal(measure(empty, empty, g, { warmHue: WARM_HUE }).n, 0);
    for (const biome of ['lush', 'desert', 'ice']) {
      const m = measure(await grab(biome, 1, key), empty, g, { warmHue: WARM_HUE });
      const disc = Math.PI * g.r ** 2;
      assert.ok(m.n >= 0.85 * disc && m.n <= Math.PI * (DISC_REACH * g.r + 1) ** 2, `${key} ${biome}: ${m.n} px vs a ${disc.toFixed(0)} px disc`);
    }
  }
  assert.ok(colours(await grab('lush', 1, 'hero')) > 50, 'a hero planet has many colours');
});

test('the same state renders the same pixels after other work', { timeout: 600000 }, async () => {
  const a = await grab('toxic', 5, 'hero');
  await grab('ice', 9, 'full');
  await grab('lava', 2, 'overlays');
  assert.ok(sameBytes(a, await grab('toxic', 5, 'hero')));
});

test('the emissive sentinel repaints lava glow and nothing else', { timeout: 600000 }, async () => {
  const g = geometryFor(condition('hero'));
  const empty = await grab('lush', 1, 'hero', { empty: true });
  for (const biome of ['lava', 'lush', 'toxic']) {
    const shipped = await grab(biome, 1, 'hero'), sentinel = await grab(biome, 1, 'hero', { palette: SENTINEL });
    if (!EMISSIVE_LOOKS.has(biome)) { assert.ok(sameBytes(shipped, sentinel), `${biome} ignores the glow ramp`); continue; }
    const m = measure(shipped, empty, g, { warmHue: WARM_HUE, emissive: sentinel });
    assert.ok(m.emissive > 0.1 && m.glow > 0.1, `${biome} glows: ${m.glow}`);
  }
});

test('measurements.csv matches a fresh render (REPORT.md is current)', { timeout: 600000 }, async () => {
  const rows = parseCsv(await readFile(new URL('../measurements.csv', import.meta.url), 'utf8'));
  const row = (cond, vision, look, seed) => {
    const r = rows.find((q) => q.cond === cond && q.vision === vision && q.look === look && q.seed === seed);
    assert.ok(r, `a row for ${cond} ${vision} ${look} ${seed}`);
    return r;
  };
  for (const [key, biome, look, seed, vision] of [['hero', 'lava', 'lava', 1, 'normal'], ['hero', 'ice', 'ice', 3, 'tritanopia'], ['full', 'desert', 'desert', 2, 'deuteranopia']]) {
    const g = geometryFor(condition(key));
    const empty = await grab('lush', 1, key, { empty: true });
    const shipped = await grab(biome, seed, key);
    const emissive = EMISSIVE_LOOKS.has(look) ? await grab(biome, seed, key, { palette: SENTINEL }) : null;
    const m = measure(shipped, empty, g, { vision, warmHue: WARM_HUE, emissive });
    const want = row(key, vision, look, seed);
    for (const k of ['n', 'L', 'warm', 'glow', 'C', 'Lsd', 'edge']) assert.equal(csvCell(m[k]), csvCell(want[k]), `${key} ${look} ${seed} ${vision} ${k}`);
  }
});
