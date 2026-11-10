// The health-looks lab: renders every look x seed x viewing condition through the asset library
// (headless Chromium + SwiftShader, no socket, no network, paused at a pinned time), measures each
// render under normal vision and three simulated colour-vision deficiencies, checks H1-H5, and
// writes the sheets (H6), the raw measurements and the report.
// Usage: node measure.mjs [--seeds 24] [--workers 3] [--conditions hero,full] [--no-sheets]
//        node measure.mjs --report   (REPORT.md again from measurements.csv; no renders)
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg, render, runPool, sheetPng } from './harness.mjs';
import { LOOKS, LOOK_NAMES, CONDITIONS, SEEDS, SENTINEL, EMISSIVE_LOOKS, WARM_HUE, stateFor, geometryFor, condition } from './lab.mjs';
import { measure, VISIONS } from './metrics.mjs';
import { analyse, reportMarkdown, measurementsCsv, parseCsv, SHEETS } from './report.mjs';
import { lineupSheet, cvdSheet, seedsSheet, cropSize } from './sheets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = { report: path.join(HERE, 'REPORT.md'), csv: path.join(HERE, 'measurements.csv'), sheet: (name) => path.join(HERE, 'sheets', `${name}.png`) };

/** The sheet files on disk (H6). */
const sheetsPresent = async () => (await Promise.all(SHEETS.map((s) => access(OUT.sheet(s)).then(() => s, () => null)))).filter(Boolean);
async function writeReport(records, conds) {
  const results = analyse(records, conds, { sheets: await sheetsPresent() });
  await writeFile(OUT.report, reportMarkdown(results, { seeds: [...new Set(records.map((r) => r.seed))], conds }));
  console.log(results.verdicts.map((x) => `${x.id} ${x.pass ? 'PASS' : 'FAIL'}: ${x.text}`).join('\n'));
  return results;
}

if (process.argv.includes('--report')) {
  const records = parseCsv(await readFile(OUT.csv, 'utf8'));
  const keys = new Set(records.map((r) => r.cond));
  await writeReport(records, CONDITIONS.filter((c) => keys.has(c.key)));
  process.exit(0);
}

const seeds = SEEDS.slice(0, Number(arg('seeds', SEEDS.length)));
const conds = arg('conditions', null)?.split(',').map(condition) ?? CONDITIONS;
const records = [];
const crops = new Map(); // `${cond}|${look}|${seed}` -> the internal-resolution crop around the disc (for the sheets)
const cropOf = ({ w, h, data }, c) => {
  const x0 = (w - c) / 2, y0 = (h - c) / 2, out = new Uint8ClampedArray(c * c * 4);
  for (let y = 0; y < c; y++) out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + c) * 4), y * c * 4);
  return { w: c, h: c, data: out };
};

/** One condition: every look and seed, the emissive sentinels, and all four visions. */
async function runCondition(page, cond) {
  const geom = geometryFor(cond);
  const empty = await render(page, stateFor(LOOKS[0], cond, { empty: true }));
  const held = [];
  for (const L of LOOKS) for (const seed of seeds) held.push({ ...L, seed, grab: await render(page, stateFor({ biome: L.biome, seed }, cond)) });
  // the sentinel palette last (a palette switch re-renders the library's thumbnails, so once per condition)
  for (const h of held) if (EMISSIVE_LOOKS.has(h.look)) h.emissive = await render(page, stateFor({ biome: h.biome, seed: h.seed }, cond, { palette: SENTINEL }));
  for (const { look, band, seed, grab, emissive } of held) {
    for (const vision of VISIONS) {
      const m = measure(grab, empty, geom, { vision, warmHue: WARM_HUE, emissive });
      if (!m.n) throw new Error(`empty render: ${cond.key} ${look} seed ${seed}`);
      records.push({ cond: cond.key, vision, look, band, seed, ...m });
    }
    crops.set(`${cond.key}|${look}|${seed}`, cropOf(grab, cropSize(cond, geom)));
  }
  console.log(`${cond.key}: ${LOOKS.length} looks x ${seeds.length} seeds (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}

const t0 = performance.now();
await runPool(Number(arg('workers', 3)), [...conds], runCondition);
const rank = (list) => new Map(list.map((x, i) => [x, i]));
const [cr, vr, lr] = [rank(conds.map((c) => c.key)), rank(VISIONS), rank(LOOK_NAMES)];
records.sort((p, q) => cr.get(p.cond) - cr.get(q.cond) || vr.get(p.vision) - vr.get(q.vision) || lr.get(p.look) - lr.get(q.look) || p.seed - q.seed);
await writeFile(OUT.csv, measurementsCsv(records));
if (!process.argv.includes('--no-sheets')) {
  const results = analyse(records, conds); // the sheets' captions need the checks
  await mkdir(path.dirname(OUT.sheet('x')), { recursive: true });
  const layouts = { lineup: lineupSheet(results, crops, conds), 'lineup-cvd': cvdSheet(results, crops, conds), seeds: seedsSheet(results, crops, seeds, conds) };
  await runPool(1, [null], async (page) => { for (const name of SHEETS) await writeFile(OUT.sheet(name), await sheetPng(page, layouts[name])); });
}
await writeReport(records, conds);
