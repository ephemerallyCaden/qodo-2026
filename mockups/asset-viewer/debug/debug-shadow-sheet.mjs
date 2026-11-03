// Contact sheet for the phantom cloud shadow: per row (lush seed 7, ocean seed 5, t = 3 s),
// shipped as seen | shipped marked (green = legit shadow, magenta = phantom: no cloud between
// it and the light) | candidate fix (t > 0 guard, in memory) as seen | fix marked.
// Usage: node debug/debug-shadow-sheet.mjs -> debug/shadow-sheet.png
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openViewer } from './repro-hollow-clouds.mjs';
import { BASE, T_POSITIVE_FIX, classifyInPage } from './repro-cloud-shadow.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROWS = [{ biome: 'lush', seed: 7, time: 3 }, { biome: 'ocean', seed: 5, time: 3 }];
const tiles = [];
for (const [tag, patch] of [['shipped 9797b2f', undefined], ['fix: t > 0', T_POSITIVE_FIX]]) {
  const { browser, page } = await openViewer(patch ? { patch } : {});
  for (const f of ROWS) {
    const o = { ...BASE, ...f, pixelH: 360 };
    const r = await page.evaluate(classifyInPage, { o, mark: true });
    const raw = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
    tiles.push({ row: f.biome, label: `${tag} - ${f.biome}`, raw, marked: r.png, stat: `${r.phantom}/${r.shadowPx} phantom px` });
  }
  await browser.close();
}
const { browser, page } = await openViewer();
const png = await page.evaluate(async ({ tiles, rows }) => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const W = 640, H = 360, S = 2, pad = 24;
  const c = Object.assign(document.createElement('canvas'), { width: 4 * W * S / 2, height: rows.length * (H * S / 2 + pad) });
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.font = '14px monospace'; x.fillStyle = '#fff';
  for (const [ri, row] of rows.entries()) {
    const ts = tiles.filter((t) => t.row === row);
    let col = 0;
    for (const t of ts) for (const [kind, src] of [['as seen', t.raw], [`marked: ${t.stat}`, t.marked]]) {
      const img = await load(src), X = col * W, Y = ri * (H + pad);
      x.drawImage(img, X, Y + pad, W, H);
      x.fillText(`${t.label} | ${kind}`, X + 6, Y + 16);
      col++;
    }
  }
  return c.toDataURL('image/png');
}, { tiles, rows: ROWS.map((r) => r.biome) });
await browser.close();
await writeFile(path.join(OUT, 'shadow-sheet.png'), Buffer.from(png.split(',')[1], 'base64'));
console.log('debug/shadow-sheet.png');
