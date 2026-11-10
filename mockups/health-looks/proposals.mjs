// Measures the fix proposals the main run points to, without changing any shipped file:
//   A. fade:  a weaker depth fade at full distance. At d >= 44 the shader's fade is uniform over a
//             planet (pixel-smooth clamps at level 3): out = mix(c, #17172f, 0.88), lava glow at half
//             strength, in encoded sRGB (ColorManagement is off). So the lab renders each planet with
//             the fade off and applies the fade itself; the emulation is checked byte-for-byte against
//             the shipped full-fade render at 0.88 before any other strength is trusted.
//   B. ash:   the ash band's look changed: the desert's sand and rock ramps at a chroma factor k and an
//             OKLab lightness shift dL (hue kept), applied through the library's palette edits (real
//             renders at every condition).
//   A+B:      each ash variant under the weaker fades.
// Reads the main run's measurements.csv for every look a proposal leaves alone; writes PROPOSALS.md.
// Usage: node proposals.mjs [--seeds 24] [--workers 2] [--fades 0.88,0.8,0.72,0.6,0.5] [--ash 0.7:0,0.6:-0.1]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V2_PLANET_RAMPS } from '../asset-viewer/planet-ramps.js';
import { arg, render, runPool } from './harness.mjs';
import { LOOKS, LOOK_NAMES, ASH, CONDITIONS, SEEDS, SENTINEL, EMISSIVE_LOOKS, WARM_HUE, FULL, stateFor, geometryFor, condition } from './lab.mjs';
import { measure, same, VISIONS, hexToOklab, oklabToHex, hexToRgb } from './metrics.mjs';
import { describeH1, describeH2 } from './analyse.mjs';
import { parseCsv, checkAll, f, sgn, num, table } from './report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const seeds = SEEDS.slice(0, Number(arg('seeds', SEEDS.length)));
const fades = arg('fades', '0.88,0.8,0.72,0.6,0.5').split(',').map(Number);
const variants = arg('ash', '0.7:0,0.6:-0.1').split(',').map((v) => { const [k, dL] = v.split(':').map(Number); return { k, dL, id: `C×${k} L${dL >= 0 ? '+' : ''}${dL}` }; });
const main = parseCsv(await readFile(path.join(HERE, 'measurements.csv'), 'utf8')).filter((r) => seeds.includes(r.seed));
const CONDS = CONDITIONS.filter((c) => main.some((r) => r.cond === c.key)); // B compares against the main run's conditions

// ---------------------------------------------------------------- A: the fade, emulated
const FULL_TINT = hexToRgb('#17172f'); // PALETTES.final.depth[3][0], the tint at d >= 44
/** The shader's depthFade at a uniform strength s on a depth-off render: mix in encoded sRGB, lava glow at s/2. */
function fadeEmulated(flat, empty, emissive, s) {
  const out = Uint8ClampedArray.from(flat.data);
  for (let i = 0; i < out.length; i += 4) {
    if (same(flat.data, empty.data, i)) continue; // space and stars don't fade
    const k = emissive && !same(emissive.data, flat.data, i) ? 0.5 : 1;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(255 * (flat.data[i + c] / 255 + (FULL_TINT[c] / 255 - flat.data[i + c] / 255) * s * k));
  }
  return { ...flat, data: out };
}

// ---------------------------------------------------------------- B: the ash band's ramps
const ASH_ROLES = ['sand', 'rock']; // BIOMES.desert's ramps (its third, cap, never shows on a desert)
const ashPalette = ({ k, dL }) => Object.fromEntries(ASH_ROLES.flatMap((role) => V2_PLANET_RAMPS[role].map((hex, i) => { const [L, a, b] = hexToOklab(hex); return [`${role}.${i}`, oklabToHex(L + dL, a * k, b * k)]; })));

// ---------------------------------------------------------------- render
const full = condition(FULL);
const noDepth = (st) => ({ ...st, render: { ...st.render, depth: false } });
const jobs = [
  ...LOOKS.flatMap((L) => seeds.map((seed) => ({ kind: 'fade', L, seed, variant: null }))),
  ...variants.flatMap((variant) => seeds.map((seed) => ({ kind: 'fade', L: ASH, seed, variant }))),
  ...variants.flatMap((variant) => CONDS.map((cond) => ({ kind: 'ash', variant, cond }))),
];
const fadeRecords = [], ashRecords = [], checks = [];
const empties = new Map(); // the empty frame has no look and no palette, so one per condition and depth serves every page
const emptyFrame = (page, cond, depth) => {
  const key = `${cond.key}|${depth}`, st = stateFor(LOOKS[0], cond, { empty: true });
  if (!empties.has(key)) empties.set(key, render(page, depth ? st : noDepth(st)));
  return empties.get(key);
};

async function runFade(page, { L, seed, variant }) {
  const g = geometryFor(full), e = await emptyFrame(page, full, false);
  const flat = await render(page, noDepth(stateFor({ biome: L.biome, seed }, full, { palette: variant ? ashPalette(variant) : {} })));
  const emissive = EMISSIVE_LOOKS.has(L.look) ? await render(page, noDepth(stateFor({ biome: L.biome, seed }, full, { palette: SENTINEL }))) : null;
  if (!variant && seed <= 2) { // check the emulation against the shipped render at the shipped strength
    const shipped = await render(page, stateFor({ biome: L.biome, seed }, full));
    const emu = fadeEmulated(flat, e, emissive, 0.88);
    let diff = 0, max = 0;
    for (let i = 0; i < emu.data.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(emu.data[i] - shipped.data[i]); if (d) diff++; max = Math.max(max, d); }
    checks.push({ look: L.look, seed, diff, max });
  }
  for (const s of fades) {
    const faded = fadeEmulated(flat, e, emissive, s);
    const fadedEmissive = emissive && fadeEmulated(emissive, e, null, s); // only which pixels differ matters
    for (const vision of VISIONS) fadeRecords.push({ fade: s, variant: variant?.id ?? null, vision, look: L.look, band: L.band, seed, ...measure(faded, e, g, { vision, warmHue: WARM_HUE, emissive: fadedEmissive }) });
  }
}
async function runAsh(page, { variant, cond }) {
  const g = geometryFor(cond), e = await emptyFrame(page, cond, true);
  for (const seed of seeds) {
    const grab = await render(page, stateFor({ biome: ASH.biome, seed }, cond, { palette: ashPalette(variant) }));
    for (const vision of VISIONS) ashRecords.push({ cond: cond.key, variant: variant.id, vision, look: ASH.look, band: ASH.band, seed, ...measure(grab, e, g, { vision, warmHue: WARM_HUE }) });
  }
  console.log(`ash ${variant.id} ${cond.key} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
const t0 = performance.now();
await runPool(Number(arg('workers', 2)), jobs, (page, job) => (job.kind === 'fade' ? runFade(page, job) : runAsh(page, job)));

// ---------------------------------------------------------------- analyse + write
function verdicts(rs) {
  const { h1, h2, h5 } = checkAll(rs);
  return [describeH1(h1), describeH2(h2, num), `${h5.pass ? 'pass' : 'FAIL'} (${h5.misread.length} misread, ${h5.confusable.length} within a glance; closest ${f(h5.closest.dOther)})`];
}
const means = (rs, look) => { const xs = rs.filter((r) => r.look === look && r.vision === 'normal'); const m = (k) => xs.reduce((a, r) => a + r[k], 0) / xs.length; return `${f(m('L'))} / ${sgn(m('warm'))} / ${f(m('C'))}`; };
// one scenario's records: the shipped looks, with the ash look swapped for a variant's
const withAsh = (base, variantRecs) => [...base.filter((r) => r.look !== ASH.look), ...variantRecs];
const fadeSet = (s, variant = null) => withAsh(fadeRecords.filter((r) => r.fade === s && r.variant === null), fadeRecords.filter((r) => r.fade === s && r.variant === variant && r.look === ASH.look));
const ashSet = (v, cond, vision) => withAsh(main.filter((r) => r.cond === cond && r.vision === vision), ashRecords.filter((r) => r.variant === v.id && r.cond === cond && r.vision === vision));
const heroMain = main.filter((r) => r.cond === 'hero');

function sectionA() {
  return [
    '## A. A weaker fade at full distance', '',
    `The emulation against the shipped full-fade render (fade 0.88), ${checks.length} renders: ${checks.filter((c) => c.diff === 0).length} byte-identical, largest channel difference ${Math.max(...checks.map((c) => c.max))}. The "${FULL}" condition: a size-${full.size} planet at d ${full.d}, a 10 px disc.`, '',
    table(['fade at d ≥ 44', 'vision', 'H1', 'H2', 'H5'], fades.flatMap((s) => VISIONS.map((v) => [s === 0.88 ? `${s} (shipped)` : String(s), v, ...verdicts(fadeSet(s).filter((r) => r.vision === v))]))), '',
    'Look means, normal vision (L / warmth / chroma):', '',
    table(['fade', ...LOOK_NAMES], fades.map((s) => [String(s), ...LOOK_NAMES.map((l) => means(fadeSet(s), l))])), '',
  ];
}
function sectionB() {
  const ramps = (p) => ASH_ROLES.map((r) => V2_PLANET_RAMPS[r].map((h, i) => `\`${p ? p[`${r}.${i}`] : h}\``).join(' '));
  const others = LOOK_NAMES.filter((l) => l !== ASH.look);
  return [
    '## B. A different ash look', '',
    `The ${ASH.look} look's \`${ASH_ROLES.join('` and `')}\` ramps with OKLab chroma × k and lightness + dL (hue kept); every other look is shipped. The ramps:`, '',
    table(['variant', ...ASH_ROLES], [['shipped', ...ramps(null)], ...variants.map((v) => [v.id, ...ramps(ashPalette(v))])]), '',
    'Look means at hero, normal vision (L / warmth / chroma):', '',
    table(['', `${ASH.look} (ash)`, ...others], [['shipped', means(heroMain, ASH.look), ...others.map((l) => means(heroMain, l))], ...variants.map((v) => [v.id, means(ashRecords.filter((r) => r.variant === v.id && r.cond === 'hero'), ASH.look), ...others.map((l) => means(heroMain, l))])]), '',
    table(['variant', 'condition', 'vision', 'H1', 'H2', 'H5'], variants.flatMap((v) => CONDS.flatMap((c) => VISIONS.map((vision) => [v.id, c.key, vision, ...verdicts(ashSet(v, c.key, vision))])))), '',
  ];
}
function sectionAB() {
  return [
    `## A + B: each ash variant under the weaker fades (${FULL} condition)`, '',
    table(['variant', 'fade', 'vision', 'H1', 'H2', 'H5'], variants.flatMap((v) => fades.filter((s) => s < 0.88).flatMap((s) => VISIONS.map((vision) => [v.id, String(s), vision, ...verdicts(fadeSet(s, v.id).filter((r) => r.vision === vision))])))), '',
  ];
}
const intro = ['# Health looks: proposals, measured', '', 'Generated by `node proposals.mjs` from renders through the asset library, plus the main run\'s `measurements.csv` for every look a proposal leaves alone. Nothing shipped is changed: A emulates the shader\'s fade on depth-off renders, B is palette edits. Read with README.md, "Findings and proposals".', ''];
await writeFile(path.join(HERE, 'PROPOSALS.md'), [...intro, ...sectionA(), ...sectionB(), ...sectionAB()].join('\n'));
console.log(`PROPOSALS.md: fade emulation ${checks.filter((c) => c.diff === 0).length}/${checks.length} byte-identical (max diff ${Math.max(...checks.map((c) => c.max))})`);
