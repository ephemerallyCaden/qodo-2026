// Browser checks (headless Chromium + SwiftShader, no socket, no network): the fog renders, and it
// renders only what it should. Every check fails on empty output.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLab, decode } from '../harness.mjs';
import { discGeometry, discPixels, stages, tealCount, diffSet, fogVisibility } from '../stats.mjs';
import { checkFrame } from '../checks.mjs';
import { DIRECTIONS } from '../variants.js';
import { mockPlanet, stateAt, EVENT } from '../mock.js';

let browser, page;
before(async () => { browser = await launch(); page = await openLab(browser); }, { timeout: 300000 });
after(async () => { await browser?.close(); });

const frames = async (cell, times, modes) => (await page.evaluate(([c, t, m]) => window.lab.frames(c, t, m), [cell, times, modes])).map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)])));
const geom = discGeometry({ camPos: [1.92, 1.12, 6.69], radius: 1, w: 320, h: 180, fov: 35 });

test('every direction: 100% charted is the planet itself, 0% and 50% show fog, no teal at rest', { timeout: 600000 }, async () => {
  const [{ empty }] = await frames({ coverage: 1 }, [3], ['empty']);
  for (const d of DIRECTIONS) for (const biome of ['lush', 'lava']) {
    for (const coverage of [0, 0.5, 1]) {
      const [f] = await frames({ dir: d.id, biome, seed: 7, coverage, moons: false }, [3], ['final', 'nofog', 'mask', 'flat']);
      const st = stages(f.mask);
      const r = checkFrame({ final: f.final, nofog: f.nofog, empty, geom, st, coverage });
      assert.deepEqual(r.problems, [], `${d.id} ${biome} ${coverage}`);
      assert.equal(tealCount(f.flat).near, 0, `${d.id} ${biome} ${coverage}: teal at rest`);
      if (coverage === 0) assert.ok(r.visible > 0.2, `${d.id} ${biome}: a fully fogged planet shows fog on ${r.visible} of the disc`);
    }
  }
});

test('the shader\'s cells are #18\'s grid: no pixel on a wrong cell, owner or state away from the limb', { timeout: 300000 }, async () => {
  for (const cell of [{ coverage: 0.5, t: 3 }, { coverage: 0.25, t: 7, cam: 'close' }]) {
    const r = await page.evaluate((c) => window.lab.cellCheck(c), cell);
    assert.ok(r.n > 3000, `planet pixels ${r.n}`);
    assert.equal(r.wrong, 0, JSON.stringify(r));
    assert.equal(r.ownerWrong, 0);
    assert.equal(r.foggedWrong, 0);
  }
});

test('deterministic and loop-locked: the same frame twice, and a loop later', { timeout: 300000 }, async () => {
  for (const d of DIRECTIONS) {
    const fr = await frames({ dir: d.id, coverage: 0.5 }, [5, 5, 29], ['final']);
    assert.equal(diffSet(fr[0].final, fr[1].final).size, 0, `${d.id} deterministic`);
    assert.equal(diffSet(fr[0].final, fr[2].final).size, 0, `${d.id} loop-locked`);
  }
});

test('the clear: teal during the front only, then the planet is clear; the refog ends fogged, with no teal', { timeout: 300000 }, async () => {
  const p = mockPlanet('src', 1);
  const ids = p.files.filter((f) => f.folder === 'src/state').slice(0, 2).map((f) => f.id);
  const clear = { coverage: 1, fogged: ids, events: ids.map((file) => ({ file, kind: 'clear', at: 1 })), t: 3 };
  const fr = await frames({ dir: 'B', ...clear }, [0.5, 1.4, 1 + EVENT.clear + EVENT.pulse + 0.2], ['flat', 'mask']);
  const before = stages(fr[0].mask);
  assert.ok(before.some((s) => s === 2), 'fogged before');
  assert.equal(tealCount(fr[0].flat).near, 0);
  // the front may face away; the pulse runs over the whole planet, so some teal shows during it
  const pulse = await frames({ dir: 'B', ...clear }, [1 + EVENT.clear + 0.3], ['flat']);
  assert.ok(tealCount(pulse[0].flat).core > 0, 'the planet-clear pulse shows teal');
  assert.ok(tealCount(pulse[0].flat).share < 0.1, 'teal under 10% of the frame');
  assert.equal(tealCount(fr[2].flat).near, 0, 'no teal after');
  const [{ flat: clean }] = await frames({ dir: 'B', coverage: 1, fogged: [] }, [1 + EVENT.clear + EVENT.pulse + 0.2], ['flat']);
  assert.equal(diffSet(fr[2].flat, clean).size, 0, 'nothing left behind');
  const refog = { coverage: 1, fogged: [], events: ids.map((file) => ({ file, kind: 'refog', at: 1 })) };
  const rf = await frames({ dir: 'B', ...refog }, [1.8, 1 + EVENT.refog + 0.2], ['flat', 'mask']);
  assert.equal(tealCount(rf[0].flat).near, 0, 'no teal while refogging');
  const [{ mask: end }] = await frames({ dir: 'B', coverage: 1, fogged: ids }, [1 + EVENT.refog + 0.2], ['mask']);
  assert.equal(diffSet(rf[1].mask, end).size, 0, 'a refog ends as plain fog');
  assert.ok(stateAt(p, { coverage: 1, ...refog, t: 1 + EVENT.refog + 0.2 }).fogged.size === 2);
});

test('a fogged moon differs from a charted one; surface fog never draws past the disc', { timeout: 300000 }, async () => {
  const [a] = await frames({ dir: 'B', coverage: 0, moons: true }, [3], ['flat', 'nofog-flat', 'mask']);
  const [{ empty }] = await frames({ coverage: 1 }, [3], ['empty']);
  const disc = new Set(discPixels(a['nofog-flat'], empty, geom, 1.02));
  const st = stages(a.mask);
  const moonPx = [...diffSet(a.flat, a['nofog-flat'])].filter((p) => !st[p]); // changed, but not surface fog: the moons
  assert.ok(moonPx.length > 10, `the fogged moons change (${moonPx.length} px)`);
  for (let p = 0; p < st.length; p++) if (st[p]) assert.ok(disc.has(p), 'surface fog stays on the disc');
  assert.ok(fogVisibility(a.flat, a['nofog-flat'], [...disc], st).fogged > 0.5);
  const [b] = await frames({ dir: 'B', coverage: 1, moons: true }, [3], ['flat', 'nofog-flat']);
  assert.equal(diffSet(b.flat, b['nofog-flat']).size, 0, 'charted moons are untouched');
});
