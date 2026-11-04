// Depth colour budgets (DEPTH_LEVELS in viewer.js): the further away, the fewer colours.
// Renders each object of the depth scene ALONE (everything else hidden, a sentinel clear
// colour) and counts its unique colours. For lush and lava heroes with ring, moons and
// artefacts on, it asserts:
//   (a) every object stays within its level's cap (DEPTH_LEVELS[level].maxColours)
//   (b) colour counts never increase with distance (planet copies; astronauts)
//   (c) not vacuous: every object draws pixels, and every level is present for both families
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

const BASE = { view: 'depth', seed: 7, size: 1, ringMode: 'thin', moons: true, artefacts: true, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, time: 2, period: 24, surfaceTurns: 2, cloudTurns: 3, halo: false };

test('depth colour budgets: per-object caps, monotonic with distance, non-empty', async () => {
  const { browser, page } = await openViewer();
  try {
    const rows = [];
    for (const biome of ['lush', 'lava']) {
      rows.push(...(await page.evaluate((o) => {
        const { planets, crew, solos, scene, renderer, camera, DEPTH_LEVELS, THREE } = window.__dbg;
        window.viewer.set(o);
        const objs = [...planets.map((p, i) => ({ name: `planet${i}`, family: 'planet', group: p.group })), ...[...crew, ...solos].map((a, i) => ({ name: `astro${i}`, family: 'crew', group: a.group }))];
        const shown = scene.children.filter((c) => c.visible);
        const c = Object.assign(document.createElement('canvas'), { width: renderer.domElement.width, height: renderer.domElement.height });
        const x = c.getContext('2d');
        renderer.setClearColor(0xff00ff);
        const out = objs.map(({ name, family, group }) => {
          shown.forEach((s) => (s.visible = s === group));
          renderer.render(scene, camera);
          x.clearRect(0, 0, c.width, c.height);
          x.drawImage(renderer.domElement, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          const set = new Set();
          let px = 0;
          for (let i = 0; i < d.length; i += 4) {
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            if (k !== 0xff00ff) { set.add(k); px++; }
          }
          const level = group.userData.depthLevel;
          return { name, family, level: DEPTH_LEVELS[level].name, li: level, px, colours: set.size, cap: DEPTH_LEVELS[level].maxColours[family] };
        });
        shown.forEach((s) => (s.visible = true));
        window.viewer.set({}); // restore the clear colour
        return out.map((r) => ({ biome: o.biome, ...r }));
      }, { ...BASE, biome })));
    }
    console.table(rows);
    const problems = [];
    for (const r of rows) {
      if (r.px < 20) problems.push(`${r.biome}/${r.name}: empty render (${r.px} px)`);
      if (r.colours > r.cap) problems.push(`${r.biome}/${r.name} (${r.level}): ${r.colours} colours > cap ${r.cap}`);
    }
    for (const biome of ['lush', 'lava']) for (const family of ['planet', 'crew']) {
      const set = rows.filter((r) => r.biome === biome && r.family === family);
      const byLevel = [0, 1, 2, 3].map((li) => set.filter((r) => r.li === li));
      byLevel.forEach((g, li) => { if (!g.length) problems.push(`${biome}/${family}: no object at level ${li}`); });
      const max = byLevel.map((g) => Math.max(0, ...g.map((r) => r.colours)));
      for (let li = 1; li < 4; li++) if (max[li] > Math.min(...byLevel[li - 1].map((r) => r.colours))) problems.push(`${biome}/${family}: level ${li} uses ${max[li]} colours, more than level ${li - 1}`);
    }
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
