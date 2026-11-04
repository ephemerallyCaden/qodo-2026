// Port check: the viewer's astronaut against the astronaut lab's variant K, rendered at the
// lab's framing (crops of the 180p crew close-up), front / 3/4 / side, idle (t = 0) and
// mid-bob (t = 1.5 s), at 1x and at the 2x close-up. Prints differing pixels per tile and
// writes debug/k-port-compare.png (rows: lab, viewer, differences in red), x3.
// Usage: node debug/compare-k.mjs   (needs ../explorations/astronaut-lab with npm install)
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCrewProbe, VIEWS } from './crew-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.resolve(HERE, '../../explorations/astronaut-lab');
const { resolveFile } = await import(path.join(LAB, 'serve.mjs'));

const SETS = [
  { zoom: 1, w: 100, h: 128 },
  { zoom: 2, w: 190, h: 236 },
];
const cellsFor = (zoom) => Object.entries(VIEWS).flatMap(([view, yaw]) => [0, 1.5].map((t) => ({ view, yaw, t, zoom })));

// Lab side: one row of native tiles (scale 1, no gaps or labels) from the lab's own page.
async function labRows() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = url.origin === 'http://lab.local' ? resolveFile(url.pathname) : null;
    if (!file) return route.abort();
    await route.fulfill({ body: await readFile(file), contentType: file.endsWith('.html') ? 'text/html' : 'text/javascript' });
  });
  await page.goto('http://lab.local/capture.html');
  await page.waitForFunction(() => window.lab?.ready);
  const out = [];
  for (const { zoom, w, h } of SETS) {
    const { png } = await page.evaluate((s) => window.lab.sheet(s), {
      w, h, scale: 1, gap: 0, rows: [{ cells: cellsFor(zoom).map((c) => ({ variant: 'K', yaw: c.yaw, t: c.t, zoom, sway: 1 })) }],
    });
    out.push(png);
  }
  await browser.close();
  return out;
}

const labPngs = await labRows();
const { browser, page, probe } = await openCrewProbe();
const results = [];
const sheets = [];
for (const [s, { zoom, w, h }] of SETS.entries()) {
  const cells = cellsFor(zoom);
  const tiles = (await probe(cells.map((c) => ({ yaw: c.yaw, t: c.t, zoom })), w, h)).map((d) => Array.from(d));
  const r = await page.evaluate(async ({ labPng, tiles, w, h, scale }) => {
    const img = new Image();
    img.src = labPng;
    await img.decode();
    const n = tiles.length;
    const lab = Object.assign(document.createElement('canvas'), { width: n * w, height: h }).getContext('2d');
    lab.drawImage(img, 0, 0);
    const out = Object.assign(document.createElement('canvas'), { width: n * w * scale, height: 3 * h * scale });
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = false;
    const tmp = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    const counts = [];
    for (let i = 0; i < n; i++) {
      const L = lab.getImageData(i * w, 0, w, h);
      const Vd = new ImageData(Uint8ClampedArray.from(tiles[i]), w, h);
      const D = new ImageData(w, h);
      let diff = 0, fig = 0;
      for (let k = 0; k < w * h * 4; k += 4) {
        const same = L.data[k] === Vd.data[k] && L.data[k + 1] === Vd.data[k + 1] && L.data[k + 2] === Vd.data[k + 2];
        const bg = L.data[k] === 0x0d && L.data[k + 1] === 0x0b && L.data[k + 2] === 0x16;
        if (!bg) fig++;
        if (!same) diff++;
        const v = same ? (bg ? 17 : 60) : 0;
        D.data.set(same ? [v, v, v + 10, 255] : [255, 40, 40, 255], k);
      }
      counts.push({ diff, fig });
      for (const [row, data] of [[0, L], [1, Vd], [2, D]]) {
        tmp.putImageData(data, 0, 0);
        o.drawImage(tmp.canvas, i * w * scale, row * h * scale, w * scale, h * scale);
      }
    }
    return { counts, png: out.toDataURL('image/png') };
  }, { labPng: labPngs[s], tiles, w, h, scale: zoom === 1 ? 3 : 2 });
  r.counts.forEach((c, i) => results.push({ zoom, view: cells[i].view, t: cells[i].t, ...c }));
  sheets.push(r.png);
}
await browser.close();
for (const r of results) console.log(`${r.zoom}x ${r.view.padEnd(5)} t=${r.t}: ${r.diff} differing px of ${r.fig} figure px`);
const total = results.reduce((a, r) => a + r.diff, 0);
console.log(`total differing px: ${total}`);
await writeFile(path.join(HERE, 'k-port-compare.png'), Buffer.from(sheets[0].split(',')[1], 'base64'));
await writeFile(path.join(HERE, 'k-port-compare-2x.png'), Buffer.from(sheets[1].split(',')[1], 'base64'));
console.log('debug/k-port-compare.png, debug/k-port-compare-2x.png');
