// Fog of war on the hero planet (fog.js, D2d · dark veil; fog-layout.js):
//  1. off is off: fog toggled on and off leaves no trace, and a fully charted planet is the planet itself
//  2. on every biome, fogged pixels are only the veil's own colours (VEIL: cool blue-plum darks, never
//     a band or lava-crust colour) and the halo colour on the fogged limb; the lit-limb haze (ocean,
//     ice, toxic) is gone over fogged land, so nothing band-coloured rims a fogged planet; no teal at
//     rest; the render fails on empty output (fog must change the disc)
//  3. teal appears only during an event: "chart all" shows it while the fronts run, then none, and
//     the planet ends as the fully charted planet
//  4. deterministic and loop-locked with fog on
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { ACCENTS, V2_PLANET_RAMPS } from '../planet-ramps.js';
import { VEIL } from '../fog.js';
import { demoLayout, stateAt, allFogged, EVENT } from '../fog-layout.js';

const BASE = { view: 'planet', biome: 'lush', seed: 7, size: 1, ringMode: 'off', moons: true, cover: null, depth: false, pixelH: 180, palette: 'final', spin: true, ui: false, halo: false, artefacts: false, period: 24, surfaceTurns: 2, cloudTurns: 3, time: 3, debris: false, fog: false, fogCharted: 0.5, fogEvents: [], fogMoonEvents: [] };
// the biomes fog is checked on
const RAMPS = { lush: ['ocean', 'land', 'cap', 'glow'], ocean: ['water', 'land', 'cap', 'glow'], ice: ['ice', 'crevasse', 'water', 'glow'], desert: ['sand', 'rock', 'cap', 'glow'], lava: ['crust', 'crust', 'ash', 'glow'], toxic: ['sludge', 'toxic', 'fungus', 'glow'] };
const HALO = '#30285a';
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const TEAL = ACCENTS.reveal.map(rgb);

/** Renders `o` and returns the frame as [r, g, b] per pixel (internal resolution). */
const frame = (page, o) => page.evaluate((opts) => {
  window.viewer.set(opts);
  const { d } = window.__dbg.readView();
  const out = [];
  for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
  return out;
}, o);
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const diffs = (a, b) => a.filter((p, i) => !same(p, b[i])).length;
const isTeal = (p) => TEAL.some((t) => same(p, t));

/** Every colour fog may draw at rest, on any biome: the veil's five and the halo (within 1 per channel: GPU rounding). */
const allowed = () => [...Object.values(VEIL), HALO].map(rgb);
const near = (p, list) => list.some((q) => Math.abs(p[0] - q[0]) <= 1.01 && Math.abs(p[1] - q[1]) <= 1.01 && Math.abs(p[2] - q[2]) <= 1.01);

test('fog: off leaves no trace; fogged pixels are only the veil and the halo limb; teal only on events; deterministic', { timeout: 900000 }, async () => {
  const { browser, page } = await openViewer();
  try {
    const never = await frame(page, BASE);
    await frame(page, { ...BASE, fog: true, fogCharted: 0 });
    const again = await frame(page, BASE);
    assert.equal(diffs(again, never), 0, 'fog left a trace after it was turned off');
    assert.equal(diffs(await frame(page, { ...BASE, fog: true, fogCharted: 1 }), never), 0, 'a fully charted planet differs from fog off');

    for (const biome of Object.keys(RAMPS)) {
      const ok = allowed(biome);
      const off = await frame(page, { ...BASE, biome });
      assert.equal(diffs(await frame(page, { ...BASE, biome, fog: true, fogCharted: 1 }), off), 0, `${biome}: a fully charted planet (haze included) differs from fog off`);
      for (const fogCharted of [0, 0.5]) {
        const on = await frame(page, { ...BASE, biome, fog: true, fogCharted });
        const changed = on.filter((p, i) => !same(p, off[i]));
        assert.ok(changed.length > (fogCharted === 0 ? 1500 : 300), `${biome} ${fogCharted}: fog changed only ${changed.length} px`);
        // where the haze was, fog shows what's behind it (the fogged limb, space, a star)
        const haze = V2_PLANET_RAMPS.haze[biome] && rgb(V2_PLANET_RAMPS.haze[biome]);
        const stray = on.filter((p, i) => !same(p, off[i]) && !(haze && same(off[i], haze))).filter((p) => !near(p, ok));
        if (haze && fogCharted === 0) {
          const hazy = (f) => f.filter((p) => same(p, haze)).length;
          assert.ok(hazy(off) > 40 && hazy(on) <= 0.05 * hazy(off), `${biome}: the haze shows over a fully fogged planet (${hazy(on)} of ${hazy(off)} px)`);
        }
        assert.equal(stray.length, 0, `${biome} ${fogCharted}: ${stray.length} fog px outside the veil and the halo, e.g. ${JSON.stringify(stray.slice(0, 3))}`);
        assert.equal(on.filter(isTeal).length, 0, `${biome} ${fogCharted}: teal at rest`);
        // the fogged limb is the halo colour (the clear planet's clouds have it too: their shadow tone)
        const halo = (f) => f.filter((p) => same(p, rgb(HALO))).length;
        if (fogCharted === 0) assert.ok(halo(on) > halo(off) + 40, `${biome}: the fogged limb isn't the halo colour (${halo(on)} vs ${halo(off)} px)`);
      }
    }

    // chart all from 0%: every fogged file clears 0.12 s apart, then the pulse
    const { planet } = demoLayout('src', BASE.seed);
    const files = allFogged(planet, stateAt(planet, { coverage: 0 }));
    const fogEvents = files.map((f, k) => ({ file: f.id, kind: 'clear', at: 3 + k * 0.12 }));
    const all = { ...BASE, fog: true, fogCharted: 0, fogEvents, fogMoonEvents: [0, 1].map((moon) => ({ moon, kind: 'clear', at: 3 })) };
    let teal = 0;
    for (const time of [3.3, 4, 5, 6]) {
      const f = await frame(page, { ...all, time });
      const n = f.filter(isTeal).length;
      assert.ok(n < 0.1 * f.length, `teal over 10% of the frame at ${time} s`);
      teal += n;
    }
    assert.ok(teal > 0, 'no teal during the clear');
    const end = 3 + files.length * 0.12 + EVENT.clear + EVENT.pulse + 0.5;
    const done = await frame(page, { ...all, time: end });
    assert.equal(done.filter(isTeal).length, 0, 'teal after the events');
    assert.equal(diffs(done, await frame(page, { ...BASE, time: end })), 0, 'after "chart all" the planet isn\'t the fully charted planet');

    const a = await frame(page, { ...BASE, fog: true, time: 5.5 });
    assert.equal(diffs(a, await frame(page, { ...BASE, fog: true, time: 5.5 })), 0, 'the same state rendered different pixels');
    assert.equal(diffs(a, await frame(page, { ...BASE, fog: true, time: 5.5 + 24 })), 0, 'a loop later is a different frame');
  } finally {
    await browser.close();
  }
});
