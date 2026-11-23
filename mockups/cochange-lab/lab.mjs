// The co-change lab's runner: renders every output in out/.
// node lab.mjs [names...]   names: stills gifs compare markers measures (no names = all)
// One headless Chromium (SwiftShader) page, served by request interception from routes.mjs: no
// socket, no network. GIFs need ffmpeg (FFMPEG=... or /opt/homebrew/bin/ffmpeg).
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, pngFrom, decode } from './harness.mjs';
import { OPTIONS, GIF } from './variants.js';
import { checkFrame } from './checks.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const ALL = ['stills', 'gifs', 'compare', 'markers', 'measures'];
const args = process.argv.slice(2);
const names = args.length ? args : ALL;

/** The stills' moment: loop time 4 s, everything drawn in. */
export const STILL = { t: 4, since: 3 };
export const FOCUS = { planet: { planet: 'src' }, file: { planet: 'src', file: 'src/core/fog.ts' } };

let page;
const png = async (file, dataUrl) => { await writeFile(path.join(OUT, file), pngFrom(dataUrl)); console.log(`  out/${file}`); };
const frames = async (cell, modes) => {
  const r = await page.evaluate(([c, m]) => window.lab.frames(c, m), [cell, modes]);
  for (const m of modes) r[m] = decode(r[m]);
  return r;
};
/** Every frame the runner writes is checked first (checks.mjs); a problem stops the run. */
async function checked(cell) {
  const r = await frames(cell, ['final', 'scene', 'ov', 'blocked']);
  const problems = checkFrame(r, cell);
  if (problems.length) throw new Error(`${JSON.stringify(cell)}: ${problems.join('; ')}`);
  return r;
}

async function stills() {
  for (const o of OPTIONS) {
    const cell = { option: o.id, focus: FOCUS.planet, ...STILL };
    await checked(cell);
    await png(`option-${o.id}.png`, await page.evaluate((c) => window.lab.still(c), cell));
    const fileCell = { option: o.id, focus: FOCUS.file, ...STILL };
    await checked(fileCell);
    await png(`option-${o.id}-file.png`, await page.evaluate((c) => window.lab.still(c), fileCell));
  }
}

/** RGBA frames -> a GIF at GIF.fps, no dithering (every colour is a palette colour already). */
async function gif(list, file) {
  const { w, h } = list[0];
  const vf = 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none';
  await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(GIF.fps), '-i', '-', '-vf', vf, '-loop', '0', path.join(OUT, file)]);
    ff.on('error', reject);
    ff.on('close', (code) => (code ? reject(new Error(`ffmpeg ${code}`)) : resolve()));
    for (const f of list) ff.stdin.write(Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength));
    ff.stdin.end();
  });
  console.log(`  out/${file}`);
}

async function gifs() {
  const n = GIF.seconds * GIF.fps;
  const per = OPTIONS.map(() => []);
  for (let k = 0; k < n; k++) {
    const fr = await page.evaluate((i) => window.lab.gifFrame(i), k);
    fr.forEach((f, j) => per[j].push(decode(f)));
  }
  for (const [j, o] of OPTIONS.entries()) await gif(per[j], `option-${o.id}.gif`);
}

async function compare() {
  const col = (focus, extra = {}) => OPTIONS.map((o) => ({ cell: { option: o.id, focus, ...STILL, ...extra }, caption: `${o.id} · ${o.name}` }));
  await png('compare.png', await page.evaluate((s) => window.lab.sheet(s), {
    title: 'co-change constellations (#211): three line styles, same system, same data',
    notes: [
      'A star chart: dotted, brighter and denser by strength · B signal: a dim rail, 1 / 2 / 3 beads by strength · C arcs: solid, bowed away from the star, 2 / 3 / 4 px by strength',
      'Lines show only for the focused item, in the starfield\'s own colours, and stop 1 px short of anything that isn\'t empty space (discs, clouds, rings, debris, the drone) and of every label.',
      'The teal pair glyph right of web is the missing-pair flag: the latest change touched src/core/fog.ts but not web/src/model/fog.ts (Jaccard 0.88). Each still is 640×360 (×2).',
    ],
    rows: [
      { label: 'planet focus\nsrc', cells: col(FOCUS.planet) },
      { label: 'file focus\nsrc/core/fog.ts', cells: col(FOCUS.file) },
      { label: 'drawing in\n0.35 s after\nfocusing src', cells: col(FOCUS.planet, { since: 0.35 }) },
    ],
  }));
}

/** The flag beside the other map signals, close up (×4 crops of one still). */
async function markers() {
  const cell = { option: 'A', focus: null, ...STILL };
  const crop = (x, y, caption) => ({ cell, crop: [x, y, 72, 48], scale: 4, caption });
  await png('markers.png', await page.evaluate((s) => window.lab.sheet(s), {
    title: 'the missing-pair flag beside the other map signals (nothing focused; ×4 crops of the same frame)',
    notes: ['The flag is a flat [OIII]-teal pair glyph: a filled dot linked to an empty ring, right of the left-out file\'s planet, at mid height.',
      'The beacon stands above its disc on a mast (BLK 36 blue-white); debris is grey 3D junk with a red outline and lights; fog is white storm cloud on the disc;',
      'the drone is a 3D BLK 36 figure with a screen; rings are planet-coloured bands round the disc.'],
    labelW: 10,
    rows: [{ label: '', cells: [crop(214, 43, 'flag beside fogged web'), crop(37, 40, 'beacon and ring on docs'), crop(32, 128, 'debris round scripts'), crop(176, 64, 'drone beside src')] }],
  }));
}

/** Text numbers for the README (Qodo can't see images): pixels and colours per option. */
async function measures() {
  const rows = [];
  for (const o of OPTIONS) for (const [k, focus] of Object.entries({ none: null, ...FOCUS })) {
    const r = await checked({ option: o.id, focus, ...STILL });
    const counts = {};
    for (let i = 0; i < r.ov.w * r.ov.h; i++) { const v = r.ov.data[4 * i]; if (v) counts[v] = (counts[v] ?? 0) + 1; }
    rows.push({ option: o.id, focus: k, lines: r.lines.map((l) => `${l.to}:${l.step}`).join(' '), stamps: r.stamps, counts });
  }
  await writeFile(path.join(OUT, 'measures.json'), `${JSON.stringify(rows, null, 1)}\n`);
  console.log('  out/measures.json');
  for (const r of rows) console.log(`  ${r.option} ${r.focus.padEnd(6)} ${JSON.stringify(r.counts)} ${r.lines}`);
}

await mkdir(OUT, { recursive: true });
const browser = await launch();
try {
  page = await openLab(browser);
  for (const name of names) {
    console.log(name);
    await { stills, gifs, compare, markers, measures }[name]();
  }
} finally {
  await browser.close();
}
