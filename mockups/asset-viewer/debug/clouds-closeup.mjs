// Probe: a cloud close-up (lush seed 7, the clouds-zoom framing, 360p, depth off) for
// before/after comparisons. Usage: node debug/clouds-closeup.mjs out.png [time]
import { openViewer } from './repro-hollow-clouds.mjs';
import { writeFile } from 'node:fs/promises';

const [out = '/tmp/clouds-closeup.png', time = '3'] = process.argv.slice(2);
const { browser, page } = await openViewer();
const url = await page.evaluate((o) => { window.viewer.set(o); return document.getElementById('view').toDataURL('image/png'); },
  { view: 'planet', biome: 'lush', seed: 7, size: 1, ringMode: 'off', moons: false, depth: false, pixelH: 360, palette: 'final', spin: true, ui: false, time: +time, camera: { pos: [0.95, 0.55, 3.3], target: [0, -0.1, 0] } });
await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(out);
await browser.close();
