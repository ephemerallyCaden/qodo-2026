// Probe: orbits the camera around the hero planet and renders each angle with
//   prod     - the shipped CLOUD_FRAG (puff normal blended with the radial direction)
//   puffN    - the same puffs shaded by their own geometric normal only
//   inverted - prod colours, but magenta where the shading normal faces AWAY from the
//              puff's geometric normal (dot(n, N) < 0: the surface is lit like a bowl)
//   bandRing - prod, with each band drawn a flat debug colour to show band contours
// Builds a contact sheet debug/shading-ab-sheet.png. Shader swaps are in memory only.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const PROD = /gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/;
const MODES = {
  prod: null,
  puffN: 'vec3 g = normalize(vNormalW); gl_FragColor = vec4(uRamp[band(g)], 1.0);',
  inverted: 'vec3 g = normalize(vNormalW); gl_FragColor = dot(n, g) < 0.0 ? vec4(1.0, 0.0, 1.0, 1.0) : vec4(uRamp[band(n)], 1.0);',
};
// Orbit around the planet at distance d: azimuth (deg, 0 = default +z side), elevation (deg).
const orbit = (az, el, d = 2.2, target = [0, 0, 0]) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return { pos: [target[0] + d * Math.cos(e) * Math.sin(a), target[1] + d * Math.sin(e), target[2] + d * Math.cos(e) * Math.cos(a)], target };
};
export const ORBITS = {
  front: orbit(18, 10, 4.1),
  'az90-el20': orbit(90, 20),
  'az180-el20': orbit(180, 20),
  'top-down': orbit(20, 85),
  'grazing-north': orbit(10, 50, 1.45, [0, 0.85, 0.2]),
  'under': orbit(30, -40),
};
const { browser, page } = await openViewer();
const base = { view: 'studio', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 180, depth: false, spin: false, time: 0, ui: false, palette: 'final' };
const tiles = [];
for (const [mode, body] of Object.entries(MODES)) {
  await page.evaluate(({ src, body }) => {
    const puffs = window.__dbg.puffsOf(window.__dbg.planets[0]);
    const mat = puffs.material;
    mat.userData.orig ??= mat.fragmentShader;
    mat.fragmentShader = body ? mat.userData.orig.replace(new RegExp(src), body) : mat.userData.orig;
    mat.needsUpdate = true;
  }, { src: PROD.source, body });
  for (const [name, camera] of Object.entries(ORBITS)) {
    await page.evaluate(({ o, camera }) => window.viewer.set({ ...o, camera }), { o: base, camera });
    const file = path.join(OUT, `ab-${mode}-${name}.png`);
    await page.locator('#view').screenshot({ path: file });
    tiles.push({ mode, name, url: await page.evaluate(() => document.getElementById('view').toDataURL()) });
  }
}
// contact sheet: rows = orbit angle, cols = mode, each tile at internal res x2
const url = await page.evaluate(async ({ tiles, modes }) => {
  const TW = 640, TH = 360, LAB = 18, GAP = 6, names = [...new Set(tiles.map((t) => t.name))];
  const c = document.createElement('canvas');
  c.width = GAP + modes.length * (TW + GAP); c.height = GAP + names.length * (TH + LAB + GAP);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '13px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#eee';
  for (const t of tiles) {
    const col = modes.indexOf(t.mode), row = names.indexOf(t.name);
    const img = new Image(); img.src = t.url; await img.decode();
    const x = GAP + col * (TW + GAP), y = GAP + row * (TH + LAB + GAP);
    ctx.fillText(`${t.name} · ${t.mode}`, x, y + 2);
    ctx.drawImage(img, x, y + LAB, TW, TH);
  }
  return c.toDataURL();
}, { tiles, modes: Object.keys(MODES) });
await writeFile(path.join(OUT, 'shading-ab-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
console.log('debug/shading-ab-sheet.png');
await browser.close();
