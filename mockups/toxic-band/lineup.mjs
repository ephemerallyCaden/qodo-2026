// The health-band lineup for #19: lava -> toxic -> ash desert -> lush, worst to best, one row
// per toxic look (TOXIC_LOOKS in planet-ramps.js: the pre-#19 'acid' look first, then the
// candidates), each planet at the internal resolution (pixel h 180), cropped square and
// upscaled x4 nearest-neighbour. Rendered by the asset library in headless Chromium +
// SwiftShader through its test harness (no socket, no network). A look is applied as
// palette edits over the base, so the other three planets are the shipped colours.
// Usage: node lineup.mjs  ->  out/lineup.png (needs npm ci in ../asset-library: playwright, three).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLibrary } from '../asset-library/test/harness.mjs';
import { TOXIC_LOOKS, TOXIC_LOOK, toxicLookEdits } from '../asset-viewer/planet-ramps.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const BANDS = [
  ['lava', 'lava', 11], ['toxic', 'toxic', 13], ['ash', 'desert', 3], ['lush', 'lush', 7],
];
const SCALE = 4;
const TILE = 180; // the internal height: a square crop around the planet

/** A paused, ring-free, moon-free planet in the inspector, at the default 320x180 frame. */
const planetState = (biome, seed, palette = {}) => ({
  mode: 'asset', focus: 'planet', framing: 'planet', camera: null, palette,
  asset: { kind: 'planet', biome, seed, ring: 'off', moons: false },
  render: { t: 3, play: false, pixelH: TILE },
});

const rows = Object.keys(TOXIC_LOOKS).map((look) => ({
  look, title: look === 'acid' ? 'before: acid' : `${look}${look === TOXIC_LOOK ? ' (shipped)' : ''}`, edits: toxicLookEdits(look),
}));

await mkdir(OUT, { recursive: true });
const browser = await launch();
try {
  const page = await openLibrary(browser);
  const grabs = [];
  for (const row of rows) {
    for (const [, biome, seed] of BANDS) {
      await page.evaluate((s) => window.library.set(s), planetState(biome, seed, row.edits));
      grabs.push(await page.evaluate((tile) => {
        const s = document.getElementById('view');
        const c = Object.assign(document.createElement('canvas'), { width: tile, height: tile });
        c.getContext('2d').drawImage(s, (s.width - tile) / 2, (s.height - tile) / 2, tile, tile, 0, 0, tile, tile);
        return c.toDataURL();
      }, TILE));
    }
  }
  // The sheet: tiles x4 nearest-neighbour, a label strip in the palette's star white on space.
  const png = await page.evaluate(async ({ grabs, rows, bands, tile, scale }) => {
    const pal = window.library.basePalette();
    const side = tile * scale, head = 64, foot = 48, gutter = 340;
    const c = Object.assign(document.createElement('canvas'), { width: gutter + bands.length * side, height: head + rows.length * side + foot });
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = pal.space;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = pal.stars[2];
    x.font = '28px monospace';
    x.textBaseline = 'middle';
    bands.forEach(([label, biome], i) => x.fillText(`${label}${label === biome ? '' : ` (${biome})`}`, gutter + i * side + 16, head / 2));
    for (let r = 0; r < rows.length; r++) {
      const y = head + r * side;
      x.fillText(rows[r].title, 16, y + side / 2);
      for (let i = 0; i < bands.length; i++) {
        const img = new Image();
        img.src = grabs[r * bands.length + i];
        await img.decode();
        x.drawImage(img, gutter + i * side, y, side, side);
      }
    }
    x.fillStyle = pal.stars[1];
    x.font = '20px monospace';
    x.fillText(`seeds ${bands.map((b) => b[2]).join(' / ')} · t 3 · no ring, no moons · ${tile} px crop, x${scale} nearest`, gutter + 16, c.height - foot / 2);
    return c.toDataURL('image/png');
  }, { grabs, rows: rows.map(({ title }) => ({ title })), bands: BANDS, tile: TILE, scale: SCALE });
  await writeFile(path.join(OUT, 'lineup.png'), Buffer.from(png.split(',')[1], 'base64'));
  if (page.errors.length) throw page.errors[0];
  console.log(`out/lineup.png: ${rows.map((r) => r.look).join(', ')} x ${BANDS.map((b) => b[0]).join(' -> ')}`);
} finally {
  await browser.close();
}
