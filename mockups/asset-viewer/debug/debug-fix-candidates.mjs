// Probe: same orbit angles, live default 180p, shipped cloud shading vs two candidate
// shadings (in-memory shader swaps only). Writes debug/fix-candidates-sheet.png.
//   prod   - shipped: normalize(0.55*N + 0.8*R), then band()
//   scalar - blend the two Lambert terms instead of the vectors (no renormalisation)
//   puffN  - geometric puff normal only
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const PROD = /gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/;
const MODES = {
  prod: null,
  scalar: 'vec3 g = normalize(vNormalW); float s = (0.55 * dot(g, uLight) + 0.8 * dot(normalize(vPosW - uCenter), uLight)) / 1.35; gl_FragColor = vec4(uRamp[s > uBands.z ? 3 : s > uBands.y ? 2 : s > uBands.x ? 1 : 0], 1.0);',
  puffN: 'gl_FragColor = vec4(uRamp[band(normalize(vNormalW))], 1.0);',
};
const orbit = (az, el, d, target = [0, 0, 0]) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return { pos: [target[0] + d * Math.cos(e) * Math.sin(a), target[1] + d * Math.sin(e), target[2] + d * Math.cos(e) * Math.cos(a)], target };
};
const ORBITS = {
  'az60-el35-close': orbit(60, 35, 1.7),
  'az120-el30-close': orbit(120, 30, 1.7),
  'top-down-close': orbit(20, 80, 1.6),
  'limb-north-grazing': orbit(0, 62, 1.5, [0, 0.9, 0]),
};
const { browser, page } = await openViewer();
const base = { view: 'studio', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 180, depth: false, spin: false, time: 0, ui: false, palette: 'final' };
const tiles = [];
for (const [mode, body] of Object.entries(MODES)) {
  await page.evaluate(({ src, body }) => {
    const mat = window.__dbg.planets[0].group.children.find((c) => c.children?.[0]?.isInstancedMesh).children[0].material;
    mat.userData.orig ??= mat.fragmentShader;
    mat.fragmentShader = body ? mat.userData.orig.replace(new RegExp(src), body) : mat.userData.orig;
    mat.needsUpdate = true;
  }, { src: PROD.source, body });
  for (const [name, camera] of Object.entries(ORBITS)) {
    await page.evaluate(({ o, camera }) => window.viewer.set({ ...o, camera }), { o: base, camera });
    await page.locator('#view').screenshot({ path: path.join(OUT, `fix-${mode}-${name}.png`) });
    tiles.push({ mode, name, url: await page.evaluate(() => document.getElementById('view').toDataURL()) });
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
    const col = modes.indexOf(t.mode), row = names.indexOf(t.name);
    const img = new Image(); img.src = t.url; await img.decode();
    const x = GAP + col * (TW + GAP), y = GAP + row * (TH + LAB + GAP);
    ctx.fillText(`${t.name} · ${t.mode}`, x, y + 2);
    ctx.drawImage(img, x, y + LAB, TW, TH);
  }
  return c.toDataURL();
}, { tiles, modes: Object.keys(MODES) });
await writeFile(path.join(OUT, 'fix-candidates-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
console.log('debug/fix-candidates-sheet.png');
await browser.close();
