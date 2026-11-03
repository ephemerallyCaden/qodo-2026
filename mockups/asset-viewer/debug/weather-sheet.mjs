// Probe: a review sheet of every weather biome (3 seeds x 2 loop phases), studio view.
// Usage: node debug/weather-sheet.mjs [out.png]
import { openViewer } from './repro-hollow-clouds.mjs';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const out = process.argv[2] ?? path.join(os.tmpdir(), 'weather-sheet.png');
const SET = [['lush', 7], ['lush', 42], ['lush', 311], ['ocean', 5], ['ocean', 23], ['toxic', 13], ['toxic', 81], ['lava', 11], ['lava', 58]];
const { browser, page } = await openViewer();
const files = [];
for (const [biome, seed] of SET) for (const time of [3, 9]) {
  await page.evaluate((o) => window.viewer.set(o), { view: 'studio', biome, seed, time, size: 1, ringMode: 'off', moons: false, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, period: 12, halo: false });
  const f = path.join(os.tmpdir(), `ws-${biome}-${seed}-${time}.png`);
  await writeFile(f, Buffer.from((await page.evaluate(() => document.getElementById('view').toDataURL('image/png'))).split(',')[1], 'base64'));
  files.push(f);
}
await browser.close();
// crop each 320x180 frame to the planet (~160x120) and tile 6 per row
const FF = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex',
  `${files.map((_, i) => `[${i}]crop=150:120:85:30,scale=300:240:flags=neighbor[c${i}]`).join(';')};${files.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${files.length}:grid=6x${Math.ceil(files.length / 6)}`, out]);
console.log(out);
