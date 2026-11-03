// Repro: what the user sees while orbiting in the default "planet" view (distance ~4.1,
// 180p, ring on). Sweeps azimuth/elevation and writes debug/orbit-sweep-sheet.png.
// Pass --shade=scalar|puffN to swap in a candidate cloud shading (in memory only).
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const shade = (process.argv.find((a) => a.startsWith('--shade=')) ?? '--shade=prod').slice(8);
const BODY = {
  scalar: 'vec3 g = normalize(vNormalW); float s = (0.55 * dot(g, uLight) + 0.8 * dot(normalize(vPosW - uCenter), uLight)) / 1.35; gl_FragColor = vec4(uRamp[s > uBands.z ? 3 : s > uBands.y ? 2 : s > uBands.x ? 1 : 0], 1.0);',
  puffN: 'gl_FragColor = vec4(uRamp[band(normalize(vNormalW))], 1.0);',
}[shade];
const D = Math.hypot(1.3, 0.75, 3.9);
const pos = (az, el) => { const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180; return [D * Math.cos(e) * Math.sin(a), D * Math.sin(e), D * Math.cos(e) * Math.cos(a)]; };
const shots = [];
for (const el of [10, 45, 80]) for (const az of [18, 90, 160, 250]) shots.push({ name: `az${az}-el${el}`, camera: { pos: pos(az, el), target: [0, 0, 0] } });
const { browser, page } = await openViewer();
if (BODY) await page.evaluate((body) => {
  const mat = window.__dbg.planets[0].group.children.find((c) => c.children?.[0]?.isInstancedMesh).children[0].material;
  mat.fragmentShader = mat.fragmentShader.replace(/gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/, body);
  mat.needsUpdate = true;
}, BODY);
const tiles = [];
for (const s of shots) {
  await page.evaluate(({ camera }) => window.viewer.set({ view: 'planet', seed: 7, biome: 'lush', ringMode: 'thin', pixelH: 180, depth: true, spin: true, time: 3, ui: false, palette: 'final', camera }), s);
  tiles.push({ name: s.name, url: await page.evaluate(() => document.getElementById('view').toDataURL()) });
}
const url = await page.evaluate(async (tiles) => {
  const TW = 640, TH = 360, LAB = 18, GAP = 6, cols = 4;
  const c = document.createElement('canvas');
  c.width = GAP + cols * (TW + GAP); c.height = GAP + Math.ceil(tiles.length / cols) * (TH + LAB + GAP);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '13px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#eee';
  for (const [i, t] of tiles.entries()) {
    const img = new Image(); img.src = t.url; await img.decode();
    const x = GAP + (i % cols) * (TW + GAP), y = GAP + Math.floor(i / cols) * (TH + LAB + GAP);
    ctx.fillText(t.name, x, y + 2); ctx.drawImage(img, x, y + LAB, TW, TH);
  }
  return c.toDataURL();
}, tiles);
const file = path.join(OUT, `orbit-sweep-${shade}.png`);
await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
console.log(file);
await browser.close();
