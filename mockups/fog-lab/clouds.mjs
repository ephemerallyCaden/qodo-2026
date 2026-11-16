// The fog-as-clouds variants C1-C5 (asset-viewer/fog-cloud.js), rendered beside D2d, the final fog.
//   node clouds.mjs [names...]   names: compare lineups close events measures (no names = all)
// One headless Chromium (SwiftShader), served by request interception from routes.mjs: no socket, no network.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, decode } from './harness.mjs';
import { LOOKS } from './variants.js';
import { COVERAGES } from './mock.js';
import { CLOUD_FOGS } from '../asset-viewer/fog-cloud.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const names = process.argv.slice(2);
const want = (n) => !names.length || names.includes(n);
const CROP = { disc: [108, 38, 104, 104] };
const T = 2; // the lineups' moment: the src planet's fogged half faces the camera at 50%
const IDS = Object.keys(CLOUD_FOGS);
const pct = (x) => `${Math.round(x * 100)}%`;

let page;
async function sheet(spec, file) {
  const r = await page.evaluate((s) => window.lab.sheet(s), spec);
  await writeFile(path.join(OUT, file), Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(`  out/${file}`);
}
const frame = async (cell, mode = 'final', t = cell.t ?? T) => decode((await page.evaluate(([c, tt, m]) => window.lab.frames(c, [tt], [m]), [cell, t, 'final']))[0].final);
const tile = (cell, crop = CROP.disc) => ({ t: T, moons: false, ...cell, crop });
const label = (id) => (id === 'D2d' ? 'D2d · dark veil (final)' : `${id} · ${CLOUD_FOGS[id].name}`);

async function compare() {
  const cols = [...LOOKS.map((l) => [`${l.look} 50%`, { biome: l.biome, seed: l.seed, coverage: 0.5 }]), ['lush 0%', { biome: 'lush', seed: 7, coverage: 0 }], ['lava 0%', { biome: 'lava', seed: 11, coverage: 0 }], ['desert 0%', { biome: 'desert', seed: 7, coverage: 0 }]];
  await sheet({
    title: 'Fog as clouds (C1-C5) against D2d, the final fog',
    note: 'The src planet at t = 2 s. Clouds sit over the uncharted territory and are locked to the ground; charting a file clears the cloud over it.\nC1, C3, C4 and C5 replace the planet\'s own weather; C2 keeps it and adds a storm layer above.',
    colLabels: cols.map((c) => c[0]),
    scale: 3,
    rows: [
      { label: 'clear (100%)', cells: cols.map(([, c]) => tile({ ...c, coverage: 1 })) },
      ...['D2d', ...IDS].map((id) => ({ label: label(id), pick: id === 'D2d', cells: cols.map(([, c]) => tile({ ...c, dir: id })) })),
    ],
  }, 'clouds-compare.png');
}

async function lineups() {
  for (const id of ['D2d', ...IDS]) {
    await sheet({
      title: `${label(id)}: every look at 0 / 25 / 50 / 75 / 100% charted`,
      note: id === 'D2d' ? 'The final fog, for reference.' : CLOUD_FOGS[id].idea,
      colLabels: COVERAGES.map((v) => `${pct(v)} charted`),
      scale: 2,
      rows: LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: COVERAGES.map((cov) => tile({ dir: id, biome: l.biome, seed: l.seed, coverage: cov, moons: true }, [84, 26, 152, 128])) })),
    }, `clouds-lineup-${id}.png`);
  }
}

async function close() {
  const looks = ['lush', 'lava', 'desert'].map((n) => LOOKS.find((l) => l.look === n));
  await sheet({
    title: 'Close-ups at 50% charted: the cloud layer, its shadow on the ground and its edge',
    colLabels: looks.map((l) => l.look),
    scale: 2,
    rows: ['D2d', ...IDS].map((id) => ({ label: label(id), pick: id === 'D2d', cells: looks.map((l) => ({ dir: id, biome: l.biome, seed: l.seed, coverage: 0.5, t: T, cam: 'close', moons: false, crop: [70, 20, 180, 140] })) })),
  }, 'clouds-closeups.png');
}

async function final() {
  await sheet({
    title: 'C6 · white storm front, the fog (the human\'s pick): every look at 0 / 25 / 50 / 75 / 100% discovered',
    note: 'White storm cloud over the undiscovered share (0.9 of it: the storm front\'s gaps), locked to the ground; none at 100%.\nThe cream weather (lush, ocean) is gone; lava\'s ash and toxic\'s rust smoke stay. Moons are test files.',
    colLabels: COVERAGES.map((v) => `${pct(v)} discovered`),
    scale: 2,
    rows: LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: COVERAGES.map((cov) => tile({ dir: 'C6', biome: l.biome, seed: l.seed, coverage: cov, moons: true }, [84, 26, 152, 128])) })),
  }, 'clouds-final-C6.png');
  await sheet({
    title: 'Before and after: the dark veil (D2d, the previous pick) and the white storm front (C6) at 50% discovered',
    colLabels: LOOKS.map((l) => l.look),
    scale: 3,
    rows: [['clear', { coverage: 1 }], ['D2d · dark veil (before)', { dir: 'D2d' }], ['C6 · white storm front (now)', { dir: 'C6' }]].map(([lab, extra]) => ({ label: lab, pick: lab.startsWith('C6'), cells: LOOKS.map((l) => tile({ biome: l.biome, seed: l.seed, coverage: 0.5, ...extra })) })),
  }, 'clouds-before-after.png');
}

const launched = await launch();
try {
  await mkdir(OUT, { recursive: true });
  page = await openLab(launched);
  if (want('compare')) await compare();
  if (want('lineups')) await lineups();
  if (want('close')) await close();
  if (want('final')) await final();
} finally {
  await launched.close();
}
