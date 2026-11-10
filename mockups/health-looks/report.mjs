// Turns measured records into the H1-H6 verdicts, REPORT.md and measurements.csv. Pure.
import { BANDS, LOOKS, LOOK_NAMES, HEALTHY, ASH, BASE, bandOf, CONDITIONS, fadeAt, geometryFor, WARM_HUE } from './lab.mjs';
import { VISIONS, LOOK_KEYS, DISC_REACH, GLOW_LIFT } from './metrics.mjs';
import { SCALE, REVERSAL_TOL, GLANCE, checkH1, checkH2, checkH5, summary, h1Problems, describeH1, describeH2, describeH5, groupSeeds } from './analyse.mjs';

// ---------------------------------------------------------------- formatting (shared with proposals.mjs)
export const f = (x, p = 3) => (Number.isFinite(x) ? x.toFixed(p) : '–');
export const sgn = (x, p = 3) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(p)}` : '–');
export const num = (x, signed = false) => (signed ? sgn(x) : f(x)); // the describe* formatter
export const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
export const SHEETS = ['lineup', 'lineup-cvd', 'seeds'];

/** All three checks for one set of records (one condition and vision). */
export const checkAll = (rs) => ({ h1: checkH1(rs, BANDS), h2: checkH2(rs, { healthy: HEALTHY, ash: ASH.look }), h5: checkH5(rs, LOOK_NAMES, bandOf) });

/**
 * Every check for every condition and vision, and the H1-H6 summary. The baseline (H1, H2, H5,
 * and H3's comparison) is BASE, which must be among conds. sheets: the sheet files present (H6).
 */
export function analyse(records, conds = CONDITIONS, { sheets = SHEETS } = {}) {
  if (!conds.some((c) => c.key === BASE)) throw new Error(`the conditions must include the baseline, ${BASE}`);
  const cells = conds.flatMap((cond) => VISIONS.map((vision) => ({ cond: cond.key, vision, ...checkAll(records.filter((r) => r.cond === cond.key && r.vision === vision)) })));
  const cell = (c, v) => cells.find((x) => x.cond === c && x.vision === v);
  // H3 and H4 compare check by check, so a failure already present at the baseline isn't counted
  // again: the components are each H1 step (separated, nothing reversed) and H2.
  const parts = (x) => ({ ...Object.fromEntries(x.h1.pairs.map((p) => [`H1 ${p.pair.join('→')}`, p.ok])), H2: x.h2.pass });
  const lost = (from, x) => { const b = parts(from), now = parts(x); return Object.keys(b).filter((k) => b[k] && !now[k]); };
  const hero = cell(BASE, 'normal');
  for (const x of cells) x.lost = lost(x.vision === 'normal' ? hero : cell(x.cond, 'normal'), x);
  const normal = cells.filter((x) => x.vision === 'normal' && x.cond !== BASE);
  const cvd = cells.filter((x) => x.vision !== 'normal');
  const already = Object.entries(parts(hero)).filter(([, ok]) => !ok).map(([k]) => k);
  const lostText = (xs, name) => xs.filter((x) => x.lost.length).map((x) => `${name(x)}: ${x.lost.join(', ')}`).join('; ') || 'none';
  const { h1, h2, h5 } = hero;
  const missing = SHEETS.filter((s) => !sheets.includes(s));
  const verdicts = [
    { id: 'H1', pass: h1.pass, text: h1.pass ? `ordered at ${BASE}` : `${BASE}: ${h1Problems(h1).join('; ')}` },
    { id: 'H2', pass: h2.pass, text: `${BASE}: healthy siblings ≤ ${f(h2.maxSib)}, nearest healthy→ash ${f(h2.minAsh)} (margin ${sgn(h2.margin)})${h2.looks.filter((l) => l.nearerAsh).map((l) => `; ${l.look} nearer ash`).join('')}` },
    { id: 'H3', pass: normal.every((x) => !x.lost.length), text: `${already.length ? `already failing at ${BASE}: ${already.join(', ')}. ` : ''}Lost beyond ${BASE}: ${lostText(normal, (x) => x.cond)}` },
    { id: 'H4', pass: cvd.every((x) => !x.lost.length), text: `Lost under a deficiency (vs normal vision at the same condition): ${lostText(cvd, (x) => `${x.vision} ${x.cond}`)}` },
    { id: 'H5', pass: h5.pass, text: `${BASE}: ${h5.misread.length} of ${h5.seeds.length} seeds misread, ${h5.confusable.length} within a glance of another band; worst margin ${sgn(h5.worst.margin)} (${h5.worst.look} seed ${h5.worst.seed} vs ${h5.worst.otherLook}), closest to another band ${f(h5.closest.dOther)} (${h5.closest.look} seed ${h5.closest.seed} to ${h5.closest.otherLook})` },
    { id: 'H6', pass: !missing.length, text: missing.length ? `missing: ${missing.map((s) => `sheets/${s}.png`).join(', ')}` : `${SHEETS.map((s) => `sheets/${s}.png`).join(', ')}; every number in REPORT.md and measurements.csv` },
  ];
  return { cells, cell, verdicts, records };
}
const label = (key) => SCALE.find((s) => s.key === key).label;

// ---------------------------------------------------------------- markdown
const range = (s) => `${f(s.mean)} [${f(s.min)}, ${f(s.max)}]`;
const mark = (ok) => (ok ? 'pass' : '**FAIL**');

function bandTable(rs) {
  const rows = [];
  for (const band of BANDS) {
    const looks = LOOKS.filter((l) => l.band === band);
    const groups = looks.length > 1 ? [[band, rs.filter((r) => r.band === band)], ...looks.map((l) => [`· ${l.look}`, rs.filter((r) => r.look === l.look)])] : [[`${band} (${looks[0].look})`, rs.filter((r) => r.band === band)]];
    for (const [name, g] of groups) {
      const s = (k) => summary(g.map((r) => r[k]));
      rows.push([name, range(s('L')), range(s('warm')), range(s('glow')), f(s('groundL').mean), f(s('C').mean), f(s('hue').mean, 0), f(s('Lsd').mean), f(s('edge').mean), f(s('n').mean, 0)]);
    }
  }
  return table(['band / look', 'lightness L', 'warmth', 'glow', 'ground L', 'chroma', 'hue°', 'L sd', 'edge', 'px'], rows);
}

function h1Table(h1) {
  const reads = (q) => (q.none ? 'tie (flat)' : q.reversed ? '**reversed**' : q.separates ? 'separates' : q.gap > 0 ? `apart, but under a glance (${GLANCE})` : 'overlaps');
  const rows = h1.pairs.flatMap((p) => p.per.map((q) => [p.pair.join(' → '), label(q.key), q.none ? 'none in either' : sgn(q.step), q.none ? '–' : sgn(q.gap), reads(q)]));
  return table(['step', 'statistic', 'mean step (+ = expected way)', 'gap (− = overlap)', 'reads'], rows);
}

function h2Table(h2) {
  const rows = [
    ...h2.siblings.map((s) => [s.pair.join(' – '), f(s.d), 'healthy sibling']),
    ...Object.entries(h2.toAsh).map(([l, d]) => [`${l} – ${ASH.look} (ash)`, f(d), h2.looks.find((x) => x.look === l).nearerAsh ? '**nearer ash than any sibling**' : 'farther than its nearest sibling']),
  ];
  return table(['pair (look centroids)', 'distance', ''], rows);
}

function h5Table(h5) {
  return table(['look', 'smallest margin (seed, vs)', 'nearest other band (seed, look)'], LOOK_NAMES.map((l) => {
    const own = h5.seeds.filter((q) => q.look === l);
    const w = [...own].sort((p, q) => p.margin - q.margin)[0], c = [...own].sort((p, q) => p.dOther - q.dOther)[0];
    return [l, `${sgn(w.margin)} (${w.seed}, ${w.otherLook})`, `${f(c.dOther)} (${c.seed}, ${c.otherLook})`];
  }));
}

/** REPORT.md: the verdicts, then every check for every condition and vision, with its numbers. */
export function reportMarkdown(results, { seeds, conds }) {
  const { cells, cell, verdicts, records } = results;
  const out = [];
  out.push('# Planet health looks: measurement report', '');
  out.push(`Generated by \`node measure.mjs\` in \`mockups/health-looks/\` (see README.md for the method, metrics and thresholds). ${LOOKS.length} looks × ${seeds.length} seeds (${seeds[0]}–${seeds[seeds.length - 1]}) × ${conds.length} conditions × ${VISIONS.length} visions = ${records.length} measurements, rendered through the asset library at 320×180, t = 3 s, paused. Raw numbers: \`measurements.csv\`.`, '');
  out.push('## Verdicts', '', table(['', 'result', 'numbers'], verdicts.map((s) => [s.id, mark(s.pass), s.text])), '');
  out.push('## Conditions', '', table(['condition', 'camera distance', 'size', 'disc (px)', 'depth fade', ''], conds.map((c) => [c.key, f(c.d, 2), f(c.size, 2), f(2 * geometryFor(c).r, 1), f(fadeAt(c.d), 2), c.note])), '');
  out.push('## Every condition and vision', '', 'H1 "ordered" is the reading used for the verdict; "strict" asks every statistic to separate every step (see README).', '');
  out.push(`"Lost" (H3, H4): the H1 steps and H2 that hold at the baseline but not here; normal-vision rows against ${BASE}, deficiency rows against normal vision at the same condition.`, '');
  out.push(table(['condition', 'vision', 'H1 ordered', 'H1 strict', 'H2', 'H5', 'lost'], cells.map((x) => [x.cond, x.vision, describeH1(x.h1), x.h1.strict ? 'pass' : 'fail', describeH2(x.h2, num), describeH5(x.h5), x.lost.join(', ') || '–'])), '');
  for (const c of conds) {
    out.push(`## ${c.key}: ${c.note}`, '');
    for (const vision of VISIONS) {
      const x = cell(c.key, vision);
      out.push(`### ${c.key} · ${vision}`, '');
      out.push('Band statistics, mean [min, max] over seeds (healthy: all three looks):', '', bandTable(records.filter((r) => r.cond === c.key && r.vision === vision)), '');
      out.push(`H1 ${mark(x.h1.pass)} (strict: ${x.h1.strict ? 'pass' : 'fail'}):`, '', h1Table(x.h1), '');
      out.push(`H2 ${mark(x.h2.pass)}: the largest sibling distance ${f(x.h2.maxSib)} vs the nearest healthy→ash ${f(x.h2.minAsh)} (margin ${sgn(x.h2.margin)}). Seed spread around each centroid: ${Object.entries(x.h2.spread).map(([l, s]) => `${l} ${f(s)}`).join(', ')}.`, '', h2Table(x.h2), '');
      out.push(`H5 ${mark(x.h5.pass)}: ${x.h5.misread.length} of ${x.h5.seeds.length} seeds misread${x.h5.misread.length ? ` (${groupSeeds(x.h5.misread, 'nearest')})` : ''}; ${x.h5.confusable.length} within ${GLANCE} of another band's look${x.h5.confusable.length ? ` (${groupSeeds(x.h5.confusable, 'otherLook')})` : ''}.`, '', h5Table(x.h5), '');
    }
  }
  out.push('## Constants', '', `Warm pole: OKLab hue ${f(WARM_HUE, 1)}° (the lava glow body, glow[1]). Disc reach ${DISC_REACH} R. Glow lift ${GLOW_LIFT} L. Reversal tolerance ${REVERSAL_TOL}. Glance floor ${GLANCE}. Look vector: ${LOOK_KEYS.join(', ')}.`, '');
  return out.join('\n');
}

// ---------------------------------------------------------------- measurements.csv
const CSV_COLS = ['cond', 'vision', 'look', 'band', 'seed', 'n', 'L', 'a', 'b', 'C', 'hue', 'warm', 'glow', 'emissive', 'groundL', 'Lsd', 'edge'];
const TEXT_COLS = new Set(['cond', 'vision', 'look', 'band']);
/** One CSV cell: integers as they are, other numbers to 4 decimals. */
export const csvCell = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(4) : String(v));
/** measurements.csv: one row per render and vision. */
export const measurementsCsv = (records) => [CSV_COLS.join(','), ...records.map((r) => CSV_COLS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
/** measurements.csv back into records. */
export function parseCsv(text) {
  const [head, ...rows] = text.trim().split('\n');
  const cols = head.split(',');
  return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], TEXT_COLS.has(cols[i]) ? v : Number(v)])));
}
