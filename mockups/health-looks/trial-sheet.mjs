// The lineup sheet with a trial ash look beside the shipped one: sheets/lineup-trial.png. The
// shipped looks are their typical seeds from measurements.csv (as in sheets/lineup.png); the trial
// is the asset library's dustier-ash trial look (../asset-library/trials.js, P2) on the desert's
// typical seed, rendered through the library's own trial path. Its numbers are the ones
// PROPOSALS.md measured for that variant (normal vision); nothing is measured or changed here.
// Usage: node trial-sheet.mjs   (reads measurements.csv and PROPOSALS.md; ~50 renders)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render, runPool, sheetPng } from './harness.mjs';
import { LOOKS, ASH, CONDITIONS, stateFor } from './lab.mjs';
import { analyse, parseCsv } from './report.mjs';
import { lineupSheet, typicalSeeds, cropSize } from './sheets.mjs';
import { TRIALS } from '../asset-library/trials.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TRIAL_KEY = 'dusty-ash';

/** The cells of the markdown table rows under `heading` whose first cells are `prefix`. */
function rows(md, heading, prefix) {
  const part = md.slice(md.indexOf(heading));
  const end = part.indexOf('\n## ', 1);
  return (end > 0 ? part.slice(0, end) : part).split('\n').filter((l) => l.startsWith('| ')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((cells) => prefix.every((p, i) => cells[i] === p));
}
const short = {
  // every failing step, abbreviated to fit a tile: lava→tox, tox→ash, ash→hlth
  h1: (cell) => (cell === 'pass' ? 'pass' : `✗ ${[...cell.matchAll(/(\w+→\w+):/g)].map((m) => m[1].replace('toxic', 'tox').replace('healthy', 'hlth')).join(' ')}`),
  h2: (cell) => `${cell.startsWith('pass') ? 'pass' : '✗'} ${/margin ([+-][\d.]+)/.exec(cell)?.[1] ?? ''}`,
  h5: (cell) => (cell.startsWith('pass') ? `pass ≥${/closest ([\d.]+)/.exec(cell)?.[1]}` : `✗ ${/(\d+) within/.exec(cell)?.[1]} near`),
};
/**
 * A variant's numbers from PROPOSALS.md ("B. A different ash look"), normal vision: the ash look's
 * hero means (L / warmth / chroma) and, per condition, the H1, H2 (margin) and H5 (closest) verdicts.
 */
export function proposalNumbers(md, variant) {
  const head = '## B. A different ash look';
  const [means] = rows(md, head, [variant]).filter((c) => c.length === 7); // the look-means table: variant + six looks
  const conds = Object.fromEntries(rows(md, head, [variant]).filter((c) => c.length === 6 && c[2] === 'normal').map(([, cond, , h1, h2, h5]) => [cond, { h1, h2, h5 }]));
  return { means: means?.[1] ?? null, conds };
}
/** The tile's two lines for a condition: its verdicts (and at hero, the measured means). */
export function trialLines({ means, conds }, condKey) {
  const c = conds[condKey];
  if (!c) return ['not measured here', ''];
  const [L, warm, C] = means?.split(' / ') ?? [];
  return [condKey === 'hero' && means ? `L ${L} warm ${warm} C ${C}` : `H2 ${short.h2(c.h2)} · H5 ${short.h5(c.h5)}`, `H1 ${short.h1(c.h1)}`];
}

const cropOf = ({ w, h, data }, c) => { // as measure.mjs's (left alone): the centre c x c
  const x0 = (w - c) / 2, y0 = (h - c) / 2, out = new Uint8ClampedArray(c * c * 4);
  for (let y = 0; y < c; y++) out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + c) * 4), y * c * 4);
  return { w: c, h: c, data: out };
};

async function main() {
  const t = TRIALS[TRIAL_KEY];
  const md = await readFile(path.join(HERE, 'PROPOSALS.md'), 'utf8');
  const numbers = proposalNumbers(md, t.variant);
  const records = parseCsv(await readFile(path.join(HERE, 'measurements.csv'), 'utf8'));
  const conds = CONDITIONS.filter((c) => records.some((r) => r.cond === c.key));
  const results = analyse(records, conds);
  const seeds = typicalSeeds(records);
  const crops = new Map();
  await runPool(1, [null], async (page) => {
    for (const cond of conds) {
      for (const L of LOOKS) crops.set(`${cond.key}|${L.look}|${seeds[L.look]}`, cropOf(await render(page, stateFor({ biome: L.biome, seed: seeds[L.look] }, cond)), cropSize(cond)));
      const s = stateFor({ biome: ASH.biome, seed: seeds[ASH.look] }, cond);
      const trial = await render(page, { ...s, asset: { ...s.asset, trial: TRIAL_KEY } });
      if (cond.key === 'hero') {
        // the library's trial look is the same pixels as the palette edits PROPOSALS.md measured
        const edits = Object.fromEntries(t.roles.flatMap((role) => t.palette.set[role].map((hex, i) => [`${role}.${i}`, hex])));
        const edited = await render(page, stateFor({ biome: ASH.biome, seed: seeds[ASH.look] }, cond, { palette: edits }));
        if (edited.data.some((x, i) => x !== trial.data[i])) throw new Error('the trial look and the PROPOSALS.md palette edits render differently');
      }
      crops.set(`${cond.key}|trial`, cropOf(trial, cropSize(cond)));
      console.log(`${cond.key}: ${LOOKS.length} looks + the trial`);
    }
    const sheet = lineupSheet(results, crops, conds, {
      title: `${ASH.look} (trial)`, band: ASH.band, after: ASH.look,
      cropKey: (condKey) => `${condKey}|trial`,
      lines: (condKey) => trialLines(numbers, condKey),
      footer: `${ASH.look} (trial): ${t.title}, ${t.proposal} (${t.variant}), seed ${seeds[ASH.look]}; its numbers from PROPOSALS.md, normal vision, with the trial as the ash look (✗ fails; H1: the failing steps; H2: its margin; H5: the closest look, or how many seeds are within a glance)`,
    });
    await writeFile(path.join(HERE, 'sheets', 'lineup-trial.png'), await sheetPng(page, sheet));
  });
  console.log('sheets/lineup-trial.png');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(); // (run, not imported)
