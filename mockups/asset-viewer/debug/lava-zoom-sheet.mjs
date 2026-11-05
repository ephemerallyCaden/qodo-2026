// Contact sheet for the lava / ice zoom fix: the same planet (seed, time, camera direction) at three
// camera distances, before (viewer.js at 9377adf, loaded in memory) and after (the working tree).
// Each tile is cropped around the disc and scaled (nearest) so the planet is the same size in every
// tile: if the rock is fixed on the planet, each row shows one formation, only sharper or blockier.
// Ash is off (cover 0) so the crust is unobstructed; depth off, 180p.
// Usage: node debug/lava-zoom-sheet.mjs [before-ref]   -> screenshots/lava-ice-zoom-before-after.png
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openViewer } from './repro-hollow-clouds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.argv[2] ?? '9377adf';
const PLANETS = [['lava', 11], ['ice', 8]];
const DISTS = [12, 7, 4];
const TILE = 216, LAB = 18, GAP = 8;

// One tile per planet x distance: the disc cropped and scaled to TILE px.
const renderTiles = (page) => page.evaluate(async ({ PLANETS, DISTS, TILE }) => {
  const { cameraAt, planets, radiusPx } = window.__dbg;
  const out = [];
  for (const [biome, seed] of PLANETS) for (const dist of DISTS) {
    window.viewer.set({ view: 'studio', biome, seed, size: 1, time: 3, pixelH: 180, ringMode: 'off', moons: false, depth: false, palette: 'final', spin: true, ui: false, artefacts: false, lavaMode: 'layered', lavaTime: null, cover: 0, regions: false, camera: cameraAt('studio', dist) });
    const src = document.getElementById('view');
    const r = radiusPx(planets[0].group), side = Math.ceil(r * 2.2);
    const c = Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, Math.round(src.width / 2 - side / 2), Math.round(src.height / 2 - side / 2), side, side, 0, 0, TILE, TILE);
    out.push({ dist, radiusPx: r, url: c.toDataURL('image/png') });
  }
  return out;
}, { PLANETS, DISTS, TILE });

// Rows of tiles with a label column (rows: [{ label: [line, ...], items: [{ dist, radiusPx, url }] }]).
const compose = (page, rows) => page.evaluate(async ({ rows, TILE, LAB, GAP }) => {
  const LEFT = 130, cols = rows[0].items.length;
  const c = Object.assign(document.createElement('canvas'), { width: LEFT + cols * (TILE + GAP) + GAP, height: GAP + rows.length * (TILE + LAB + GAP) });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e6e0ee';
  for (const [j, row] of rows.entries()) {
    const y = GAP + j * (TILE + LAB + GAP);
    row.label.forEach((t, k) => ctx.fillText(t, 8, y + TILE / 2 - 14 + k * 16));
    for (const [i, it] of row.items.entries()) {
      const img = new Image();
      img.src = it.url;
      await img.decode();
      const x = LEFT + GAP + i * (TILE + GAP);
      ctx.drawImage(img, x, y);
      ctx.fillText(`distance ${it.dist} · radius ${it.radiusPx} px`, x + 2, y + TILE + 3);
    }
  }
  return c.toDataURL('image/png');
}, { rows, TILE, LAB, GAP });

async function withViewer(patch, fn) {
  const { browser, page } = await openViewer({ patch });
  try { return await fn(page); } finally { await browser.close(); }
}

const oldSrc = execFileSync('git', ['show', `${REF}:mockups/asset-viewer/viewer.js`], { cwd: ROOT, encoding: 'utf8' });
const before = await withViewer(() => oldSrc, renderTiles);
const url = await withViewer(undefined, async (page) => {
  const after = await renderTiles(page);
  const pick = (set, i) => set.slice(i * DISTS.length, (i + 1) * DISTS.length);
  const rows = PLANETS.flatMap(([biome, seed], i) => [
    { label: [`${biome}/${seed}`, `before (${REF})`], items: pick(before, i) },
    { label: [`${biome}/${seed}`, 'after'], items: pick(after, i) },
  ]);
  return compose(page, rows);
});
const file = path.join(ROOT, 'screenshots', 'lava-ice-zoom-before-after.png');
await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
console.log(path.relative(ROOT, file));
