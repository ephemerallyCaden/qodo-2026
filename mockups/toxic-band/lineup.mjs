// The health-band lineup for #19: lava -> toxic -> ash desert -> lush, worst to best. Row 1 is
// toxic as it was at a git revision (planet-ramps.js there, applied as palette edits, so the
// other three planets stay the shipped colours); row 2 is the shipped toxic. Each planet is at
// the internal resolution (pixel h 180), cropped square and upscaled x4 nearest-neighbour,
// rendered by the asset library in headless Chromium + SwiftShader through its test harness
// (no socket, no network).
// Usage: node lineup.mjs [before-rev]  ->  out/lineup.png  (default rev: a5d8bf6, before #19;
// needs npm ci in ../asset-library: playwright, three).
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLibrary } from '../asset-library/test/harness.mjs';

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

const TOXIC_ROLES = ['sludge', 'toxic', 'fungus', 'spore'];
/** Palette edits that restore toxic's ramps and haze as planet-ramps.js had them at `rev`. */
async function toxicAt(rev) {
  const src = execFileSync('git', ['show', `${rev}:mockups/asset-viewer/planet-ramps.js`], { cwd: HERE, encoding: 'utf8' });
  const { V2_PLANET_RAMPS: old } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  const edits = { 'haze.toxic': old.haze.toxic };
  for (const role of TOXIC_ROLES) old[role].forEach((hex, i) => (edits[`${role}.${i}`] = hex));
  return edits;
}
const before = process.argv[2] ?? 'a5d8bf6';
const rows = [
  { look: `before (${before})`, title: `before: ${before}`, edits: await toxicAt(before) },
  { look: 'shipped', title: 'after: rust-ember', edits: {} },
];

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
