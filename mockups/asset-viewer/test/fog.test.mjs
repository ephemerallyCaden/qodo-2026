// Fog of war on the hero planet: cloud fog (fog-cloud.js, the white storm front, the human's pick
// 2026-11-16). White storm cloud covers the undiscovered share of the planet's surface; a fully
// discovered planet has no clouds; the cream weather (lush, ocean) goes while fog is on, and
// lava's ash and toxic's rust smoke stay (health-band cues, not clouds).
//  1. off is off: fog toggled on and off leaves no trace
//  2. fully discovered: no fog cloud on any biome; no cream weather on lush/ocean; desert, ice, lava and
//     toxic are exactly the fog-off planet
//  3. the cloud grows as the discovered share falls (desert: no weather of its own, so every cloud
//     pixel is fog), and fails on empty output
//  4. no teal at rest; "chart all" ends with a cloudless planet
//  5. deterministic and loop-locked with fog on
// (The dark veil, fog.js D2d, the previous pick, is tested by the fog lab and the asset library.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { ACCENTS, V2_PLANET_RAMPS } from '../planet-ramps.js';
import { demoLayout, stateAt, allFogged, EVENT } from '../fog-layout.js';

const BASE = { view: 'planet', biome: 'desert', seed: 7, size: 1, ringMode: 'off', moons: false, cover: null, depth: false, pixelH: 180, palette: 'final', spin: true, ui: false, halo: false, artefacts: false, time: 3, fog: false, fogCharted: 0.5, fogEvents: [] }; // set() merges: every fog field is explicit
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const TEAL = ACCENTS.reveal.map(rgb);
const CREAM = V2_PLANET_RAMPS.cloud.slice(1).map(rgb); // the cloud's lit tones (its darkest is the halo colour)

const frame = (page, o) => page.evaluate((opts) => {
  window.viewer.set(opts);
  const { d } = window.__dbg.readView();
  const out = [];
  for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
  return out;
}, o);
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const diffs = (a, b) => a.filter((p, i) => !same(p, b[i])).length;
const count = (f, list) => f.filter((p) => list.some((q) => same(p, q))).length;

test('cloud fog: off is off; none at 100%; cover grows as the discovered share falls; no teal at rest; deterministic', { timeout: 900000 }, async () => {
  const { browser, page } = await openViewer();
  try {
    // 1. off is off
    const never = await frame(page, { ...BASE, biome: 'lush' });
    await frame(page, { ...BASE, biome: 'lush', fog: true, fogCharted: 0 });
    assert.equal(diffs(await frame(page, { ...BASE, biome: 'lush' }), never), 0, 'fog left a trace after it was turned off');

    // 2. fully discovered
    for (const biome of ['desert', 'ice', 'lava', 'toxic']) { // no cream weather of their own
      assert.equal(diffs(await frame(page, { ...BASE, biome, fog: true, fogCharted: 1 }), await frame(page, { ...BASE, biome })), 0, `${biome}: a fully discovered planet differs from fog off`);
    }
    for (const biome of ['lush', 'ocean']) { // their cream weather goes while fog is on
      const off = await frame(page, { ...BASE, biome });
      const on = await frame(page, { ...BASE, biome, fog: true, fogCharted: 1 });
      assert.ok(count(off, CREAM) > 100, `${biome}: no cream weather to remove (${count(off, CREAM)} px)`);
      assert.equal(count(on, CREAM), 0, `${biome}: a fully discovered planet still has ${count(on, CREAM)} cream cloud px`);
    }

    // 3. cover grows as the discovered share falls (desert: every cream pixel is fog cloud)
    const cream = [];
    for (const fogCharted of [0, 0.5, 1]) cream.push(count(await frame(page, { ...BASE, fog: true, fogCharted }), CREAM));
    assert.ok(cream[0] > 3000, `0% discovered: only ${cream[0]} cloud px`);
    assert.ok(cream[0] > cream[1] && cream[1] > cream[2] && cream[2] === 0, `cloud px not falling with discovery: ${cream.join(' > ')}`);
    const ratio = cream[1] / cream[0];
    assert.ok(ratio > 0.15 && ratio < 0.75, `50% discovered shows ${(ratio * 100).toFixed(0)}% of the 0% cloud`);

    // 4. no teal at rest, on any biome; chart all ends cloudless
    for (const biome of ['lush', 'ocean', 'ice', 'desert', 'lava', 'toxic']) {
      for (const fogCharted of [0, 0.5]) {
        const f = await frame(page, { ...BASE, biome, fog: true, fogCharted });
        assert.equal(count(f, TEAL), 0, `${biome} ${fogCharted}: teal at rest`);
      }
    }
    const { planet } = demoLayout('src', BASE.seed);
    const files = allFogged(planet, stateAt(planet, { coverage: 0 }));
    const fogEvents = files.map((f, k) => ({ file: f.id, kind: 'clear', at: 3 + k * 0.12 }));
    const end = 3 + files.length * 0.12 + EVENT.clear + 0.5;
    const mid = await frame(page, { ...BASE, fog: true, fogCharted: 0, fogEvents, time: 3 + (files.length * 0.12) / 2 });
    const mc = count(mid, CREAM);
    assert.ok(mc > 0 && mc < cream[0], `mid "chart all": ${mc} cloud px (0%: ${cream[0]})`);
    assert.equal(diffs(await frame(page, { ...BASE, fog: true, fogCharted: 0, fogEvents, time: end }), await frame(page, { ...BASE, fog: true, fogCharted: 1, time: end })), 0, 'after "chart all" the planet isn\'t the fully discovered planet');

    // 5. deterministic, loop-locked
    const a = await frame(page, { ...BASE, fog: true, fogCharted: 0.5, time: 5.5 });
    assert.equal(diffs(a, await frame(page, { ...BASE, fog: true, fogCharted: 0.5, time: 5.5 })), 0, 'the same state rendered different pixels');
    assert.equal(diffs(a, await frame(page, { ...BASE, fog: true, fogCharted: 0.5, time: 5.5 + 24 })), 0, 'a loop later is a different frame');
  } finally {
    await browser.close();
  }
});
