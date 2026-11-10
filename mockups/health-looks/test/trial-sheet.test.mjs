// The trial lineup sheet (Node, no browser): the trial's numbers come from PROPOSALS.md for the
// library's trial (the same variant and means), and the lineup gains exactly one column, the
// trial right after the shipped ash look, while the sheet without a trial is laid out as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { proposalNumbers, trialLines, TRIAL_KEY } from '../trial-sheet.mjs';
import { lineupSheet, typicalSeeds, cropSize } from '../sheets.mjs';
import { analyse, parseCsv } from '../report.mjs';
import { LOOKS, CONDITIONS, ASH } from '../lab.mjs';
import { TRIALS } from '../../asset-library/trials.js';

const md = await readFile(new URL('../PROPOSALS.md', import.meta.url), 'utf8');
const T = TRIALS[TRIAL_KEY];

test('the trial\'s numbers are PROPOSALS.md\'s for the library\'s trial variant', () => {
  const n = proposalNumbers(md, T.variant);
  assert.equal(n.means, T.measured.trial, 'the hero means the inspector quotes');
  assert.deepEqual(Object.keys(n.conds), CONDITIONS.map((c) => c.key), 'a verdict per condition');
  assert.deepEqual(trialLines(n, 'hero'), ['L 0.555 warm +0.048 C 0.051', 'H1 pass']);
  assert.deepEqual(trialLines(n, 'mid'), ['H2 pass +0.049 · H5 pass ≥0.069', 'H1 ✗ lava→tox']);
  assert.deepEqual(trialLines(n, 'far'), ['H2 pass +0.022 · H5 ✗ 29 near', 'H1 ✗ lava→tox tox→ash ash→hlth']);
  assert.deepEqual(proposalNumbers(md, 'C×9 L+9'), { means: null, conds: {} });
  for (const lines of Object.keys(n.conds).map((c) => trialLines(n, c))) for (const l of lines) assert.ok(l.length <= 32, `fits a tile: ${l}`);
});

test('the lineup gains one column, the trial right after the shipped ash look', async () => {
  const records = parseCsv(await readFile(new URL('../measurements.csv', import.meta.url), 'utf8'));
  const results = analyse(records, CONDITIONS);
  const seeds = typicalSeeds(records);
  const crops = new Map();
  for (const cond of CONDITIONS) {
    const c = cropSize(cond), blank = () => ({ w: c, h: c, data: new Uint8ClampedArray(c * c * 4) });
    for (const L of LOOKS) crops.set(`${cond.key}|${L.look}|${seeds[L.look]}`, blank());
    crops.set(`${cond.key}|trial`, blank());
  }
  const n = proposalNumbers(md, T.variant);
  const plain = lineupSheet(results, crops, CONDITIONS);
  const trial = lineupSheet(results, crops, CONDITIONS, { title: 'desert (trial)', band: ASH.band, after: ASH.look, cropKey: (k) => `${k}|trial`, lines: (k) => trialLines(n, k), footer: 'trial' });
  assert.equal(plain.blits.length, CONDITIONS.length * LOOKS.length);
  assert.equal(trial.blits.length, CONDITIONS.length * (LOOKS.length + 1));
  assert.equal(trial.w - plain.w, plain.blits[1].x - plain.blits[0].x, 'one column wider');
  const head = (s) => s.texts.filter((t) => t.y < 76).map((t) => t.text);
  assert.deepEqual(head(plain), ['lava', 'toxic', 'ash', 'healthy (3 looks, one band)', ...LOOKS.map((l) => l.look)]);
  assert.deepEqual(head(trial), ['lava', 'toxic', 'ash (shipped, trial)', 'healthy (3 looks, one band)', 'lava', 'toxic', 'desert', 'desert (trial)', 'lush', 'ocean', 'ice']);
  // the trial column sits where lush was, and every condition's tile has its two lines
  const col = (s, i) => s.blits[i].x;
  assert.equal(col(trial, 3), col(plain, 3));
  for (const k of CONDITIONS.map((c) => c.key)) for (const line of trialLines(n, k)) assert.ok(trial.texts.some((t) => t.text === line), `${k}: ${line}`);
  assert.ok(trial.texts.at(-1).text.endsWith('. trial'));
});
