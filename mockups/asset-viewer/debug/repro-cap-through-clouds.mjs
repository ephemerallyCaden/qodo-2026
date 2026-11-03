// Repro: are the "holes" in the clouds actually the polar ice cap showing between puffs?
// For each orbit frame renders: prod | cap tinted magenta (in-memory uniform swap) |
// clouds hidden. Writes debug/cap-vs-clouds-sheet.png.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const D = Math.hypot(1.3, 0.75, 3.9);
const pos = (az, el, d = D) => { const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180; return [d * Math.cos(e) * Math.sin(a), d * Math.sin(e), d * Math.cos(e) * Math.cos(a)]; };
const FRAMES = { 'az90-el45': pos(90, 45), 'az18-el80': pos(18, 80), 'az18-el10': pos(18, 10), 'az40-el55-close': pos(40, 55, 2.2) };
const MODES = ['prod', 'capMagenta', 'noClouds'];
const { browser, page } = await openViewer();
const tiles = [];
for (const mode of MODES) {
  for (const [name, p] of Object.entries(FRAMES)) {
    await page.evaluate(({ mode, camera }) => {
      window.viewer.set({ view: 'planet', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 180, depth: true, spin: true, time: 3, ui: false, palette: 'final', camera });
      const hero = window.__dbg.planets[0];
      const surface = hero.group.children[0];
      const pivot = hero.group.children.find((c) => c.children?.[0]?.isInstancedMesh);
      pivot.visible = mode !== 'noClouds';
      if (mode === 'capMagenta') surface.material.uniforms.uC.value.forEach((c) => c.setRGB(1, 0, 1));
      window.__dbg.renderer.render(window.__dbg.scene, window.__dbg.camera);
    }, { mode, camera: { pos: p, target: [0, 0, 0] } });
    tiles.push({ mode, name, url: await page.evaluate(() => document.getElementById('view').toDataURL()) });
    await page.locator('#view').screenshot({ path: path.join(OUT, `cap-${mode}-${name}.png`) });
  }
}
const url = await page.evaluate(async ({ tiles, modes }) => {
  const TW = 640, TH = 360, LAB = 18, GAP = 6, names = [...new Set(tiles.map((t) => t.name))];
  const c = document.createElement('canvas');
  c.width = GAP + modes.length * (TW + GAP); c.height = GAP + names.length * (TH + LAB + GAP);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '13px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#eee';
  for (const t of tiles) {
    const img = new Image(); img.src = t.url; await img.decode();
    const x = GAP + modes.indexOf(t.mode) * (TW + GAP), y = GAP + names.indexOf(t.name) * (TH + LAB + GAP);
    ctx.fillText(`${t.name} · ${t.mode}`, x, y + 2); ctx.drawImage(img, x, y + LAB, TW, TH);
  }
  return c.toDataURL();
}, { tiles, modes: MODES });
await writeFile(path.join(OUT, 'cap-vs-clouds-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
console.log('debug/cap-vs-clouds-sheet.png');
await browser.close();
