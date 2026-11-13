// The fog lab's runner: renders every output in out/ and the numbers in measures.json / measures.md.
// node lab.mjs [names...]   names: lineups compare d2 closeups reasons footprint coexist loops events
//                            dark final veil haze measures report (no names = all; report only
//                            rewrites measures.md).
// One headless Chromium (SwiftShader) page, served by request interception from routes.mjs: no
// socket, no network. GIFs need ffmpeg (FFMPEG=... or /opt/homebrew/bin/ffmpeg).
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, decode } from './harness.mjs';
import { DIRECTIONS, LOOKS, direction } from './variants.js';
import { COVERAGES, EVENT } from './mock.js';
import { CONDITIONS, camPos, geometryFor, SEEDS as HL_SEEDS, WARM_HUE, T as HL_T } from '../health-looks/lab.mjs';
import { measure as hlMeasure, hexToOklab } from '../health-looks/metrics.mjs';
import { checkH5 } from '../health-looks/analyse.mjs';
import { V2_PLANET_RAMPS } from '../asset-viewer/planet-ramps.js';
import {
  BIOME_RAMPS, labAt, dE,
  GLANCE, discGeometry, lookVector, centroid, mean, discPixels, stages, fogVisibility, tealCount, diffSet, iou,
  layerStats, flicker, readBand, pixelVote, collectColours,
} from './stats.mjs';
import { CheckError } from './checks.mjs';
import { writeReport } from './report.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const ALL = ['lineups', 'compare', 'd2', 'closeups', 'reasons', 'footprint', 'coexist', 'loops', 'events', 'dark', 'final', 'veil', 'haze', 'measures'];
// The first round (A-E and A2) keeps its lineups and comparison sheet; the human picked D, so the
// motion, close-ups and coexistence outputs are D and its refinements D2a-D2c; the events are D and the
// recommended D2c (EVENT_DIRS).
const FIRST = DIRECTIONS.filter((d) => !d.id.startsWith('D2'));
const PICKED = ['D', 'D2a', 'D2b', 'D2c'].map(direction);
const EVENT_DIRS = ['D', 'D2c'].map(direction);
// The human's darker pass on D2c: D2d and D2e, measured and shown beside D2c.
const DARK_DIRS = ['D2c', 'D2d', 'D2e'].map(direction);
// the cool veil's before/after: D2d as picked (warm: lava's neighbours read as crust) and as shipped
const VEIL_DIRS = [{ id: 'D2d-warm', name: 'dark veil, before (warm)' }, { ...direction('D2d'), name: 'dark veil, after (cool)' }];
// the fogged haze's before/after: D2d with the lit-limb haze drawn over fogged cells, and as shipped
const HAZE_DIRS = [{ id: 'D2d-haze', name: 'before: haze drawn' }, { id: 'D2d', name: 'after: haze fogged' }];
const HAZE_LOOKS = LOOKS.filter((l) => V2_PLANET_RAMPS.haze[l.biome]);
const args = process.argv.slice(2);
const wanted = args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--dirs');
const names = wanted.length ? wanted : ALL;
const QUICK = args.includes('--quick'); // a smoke run: a few phases, seeds and looks (numbers not for the report)
// --dirs D2c,D2d: re-measure only these directions and merge them into measures.json (the rest is kept)
const ONLY = args.includes('--dirs') ? args[args.indexOf('--dirs') + 1].split(',') : null;
const MEASURED = () => (ONLY ? DIRECTIONS.filter((d) => ONLY.includes(d.id)) : DIRECTIONS);

const LINEUP_T = 2;
const SPACE = '#0d0b16'; // the final palette's space colour (the dark veil's target) // the lineups' moment: the src planet's fogged half faces the camera at 50%
const CROP = { moons: [84, 26, 152, 128], disc: [108, 38, 104, 104] };
const pct = (x) => `${Math.round(x * 100)}%`;
const lookOf = (name) => LOOKS.find((l) => l.look === name);
const bandOf = (look) => lookOf(look).band;

// ---------------------------------------------------------------- page I/O
let page;
async function frames(cell, times, modes = ['final']) {
  const fr = await page.evaluate(([c, t, m]) => window.lab.frames(c, t, m), [cell, times, modes]);
  return fr.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)])));
}
const one = async (cell, mode = 'final', t = cell.t ?? 3) => (await frames(cell, [t], [mode]))[0][mode];
async function sheet(spec, file) {
  const r = await page.evaluate((s) => window.lab.sheet(s), spec);
  await writeFile(path.join(OUT, file), Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(`  out/${file}`);
}
/** Raw RGBA frames -> a GIF at fps, upscaled by `scale` with nearest neighbour, no dithering. */
async function gif(list, file, { fps = 15, scale = 2, crop = null } = {}) {
  const { w, h } = list[0];
  const vf = [crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}` : null, `scale=iw*${scale}:ih*${scale}:flags=neighbor`, 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none'].filter(Boolean).join(',');
  await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-', '-vf', vf, '-loop', '0', path.join(OUT, file)]);
    ff.on('error', reject);
    ff.on('close', (code) => (code ? reject(new Error(`ffmpeg ${code}`)) : resolve()));
    for (const f of list) ff.stdin.write(Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength));
    ff.stdin.end();
  });
  console.log(`  out/${file}`);
}
const times = (from, to, fps = 15) => Array.from({ length: Math.round((to - from) * fps) }, (_, k) => from + k / fps);

// ---------------------------------------------------------------- sheets
const tile = (cell, crop = CROP.moons) => ({ t: LINEUP_T, ...cell, crop });

async function lineups() {
  for (const d of FIRST) {
    await sheet({
      title: `${d.id} · ${d.name}: every band × coverage (the src planet, 48 files, territory footprint, t = ${LINEUP_T} s)`,
      note: `${d.idea}. Rest: ${d.rest}.\nColumns: the share of the planet's files you've charted. 100% charted is the planet itself (pixel-identical to fog off). Moons are test files: the big one is charted from 50%, the small one from 75%.`,
      colLabels: COVERAGES.map((c) => `${pct(c)} charted`),
      rows: LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: COVERAGES.map((coverage) => tile({ dir: d.id, biome: l.biome, seed: l.seed, coverage })) })),
    }, `lineup-${d.id}.png`);
  }
  await sheet({
    title: `D2: D and three strengths of "unseen", every band × coverage (the src planet, t = ${LINEUP_T} s)`,
    note: PICKED.map((d) => `${d.id} · ${d.name}: ${d.rest}.`).join('\n'),
    colLabels: COVERAGES.map((c) => `${pct(c)} charted`),
    rows: LOOKS.flatMap((l) => PICKED.map((d) => ({ label: `${l.look} (${l.band})\n${d.id} · ${d.name}`, pick: d.id === 'D', cells: COVERAGES.map((coverage) => tile({ dir: d.id, biome: l.biome, seed: l.seed, coverage, moons: false }, CROP.disc)) }))),
  }, 'lineup-D2.png');
}

/** D against D2a, D2b and D2c side by side: every look at 50% and fully fogged, and two close-ups. */
async function d2() {
  const cols = [...LOOKS.map((l) => [`${l.look} 50%`, { biome: l.biome, seed: l.seed, coverage: 0.5 }]), ['lush 0%', { biome: 'lush', seed: 7, coverage: 0 }], ['lava 0%', { biome: 'lava', seed: 11, coverage: 0 }]];
  await sheet({
    title: 'D against D2a (blank map), D2b (terra incognita) and D2c (veiled)',
    note: 'The src planet at t = 2 s. The parcel outlines are D\'s 2 px lines in the terrain\'s own ramp colours (the human\'s fog-only exception to §3); they go when a file is charted.',
    colLabels: [...cols.map((c) => c[0]), 'lush, close', 'lava, close'],
    scale: 3,
    rows: [{ label: 'clear', cells: [...cols.map(([, c]) => tile({ ...c, coverage: 1, moons: false }, CROP.disc)), ...['lush', 'lava'].map((b) => ({ biome: b, seed: b === 'lava' ? 11 : 7, coverage: 1, t: LINEUP_T, cam: 'close', moons: false, crop: [70, 20, 180, 140], scale: 2 }))] },
      ...PICKED.map((d) => ({ label: `${d.id} · ${d.name}`, pick: d.id === 'D2c', cells: [...cols.map(([, c]) => tile({ ...c, dir: d.id, moons: false }, CROP.disc)), ...['lush', 'lava'].map((b) => ({ dir: d.id, biome: b, seed: b === 'lava' ? 11 : 7, coverage: 0.5, t: LINEUP_T, cam: 'close', moons: false, crop: [70, 20, 180, 140], scale: 2 }))] }))],
  }, 'd2-compare.png');
}

async function compare() {
  const looks = LOOKS;
  const row = (label, cell, pick) => ({ label, pick, cells: [...looks.map((l) => tile({ ...cell, biome: l.biome, seed: l.seed, moons: false }, CROP.disc)),
    tile({ ...cell, biome: 'lush', seed: 7, size: 0.55, moons: false, cam: { d: 12 } }, [124, 54, 72, 72]), tile({ ...cell, biome: 'lava', seed: 11, moons: false, cam: { d: 21.3 } }, [130, 60, 60, 60])] });
  await sheet({
    title: 'All five directions at 50% charted, on every look (src planet, t = 2 s)',
    note: 'The last two columns: a small lush planet (size 0.55) at mid distance, and lava at depth level 2 (fade 0.72), the farthest the bands must read (§6 rule 3).',
    colLabels: [...looks.map((l) => `${l.look} (${l.band})`), 'small, mid', 'lava, far'],
    scale: 3,
    rows: [row('clear (100%)', { coverage: 1 }), ...FIRST.map((d) => row(`${d.id} · ${d.name}`, { dir: d.id, coverage: 0.5 }))],
  }, 'compare.png');
}

async function closeups() {
  const cols = [
    ['lush, close', { biome: 'lush', seed: 7, cam: 'close' }],
    ['lava, close', { biome: 'lava', seed: 11, cam: 'close' }],
    ['ice, close', { biome: 'ice', seed: 7, cam: 'close' }],
    ['lush, 360p', { biome: 'lush', seed: 7, w: 640, h: 360, scale: 1 }],
  ];
  await sheet({
    title: 'Close-ups at 50% charted: the camera 2.4x closer, and the hero at 360p',
    colLabels: cols.map((c) => c[0]),
    scale: 2,
    rows: PICKED.map((d) => ({ label: `${d.id} · ${d.name}`, cells: cols.map(([, c]) => ({ dir: d.id, coverage: 0.5, t: LINEUP_T, moons: false, ...c, crop: c.w ? [140, 40, 360, 280] : [70, 20, 180, 140] })) })),
  }, 'closeups.png');
}

async function reasons() {
  const cols = [['lush, 0%', 'lush', 0], ['lush, 50%', 'lush', 0.5], ['desert, 0%', 'desert', 0], ['lush, close', 'lush', 0.25, 'close']];
  await sheet({
    title: 'F4: uniform fog (the default) against A with the reason as the glyph',
    note: 'Reasons (#33): agent >   mixed =   self-committed-agent-written ◎   teammate ▢   unknown :   lineage-unknown \\.\nThe src planet\'s folders lean agent (src, src/core), self-committed-agent-written (src/cli), mixed (src/state) and unknown (src/web), one file in five something else.',
    colLabels: cols.map((c) => c[0]),
    scale: 2,
    rows: [false, true].map((r) => ({ label: r ? 'A · reasons' : 'A · uniform', pick: !r, cells: cols.map(([, biome, coverage, cam]) => ({ dir: 'A', reasons: r, biome, seed: 7, coverage, t: LINEUP_T, moons: false, cam: cam ?? 'hero', crop: cam ? [70, 20, 180, 140] : CROP.disc, scale: cam ? 2 : 3 })) })),
  }, 'reasons.png');
}

async function footprint() {
  await sheet({
    title: 'Footprint: a file\'s fog on its own grid cell only (strict F1), or on an equal share of the planet (territory, the lab\'s default)',
    note: 'D and D2b on lush, the src planet (48 files on 256 cells). With cell footprints most of the planet is wilderness with no file, so 0% charted still looks mostly clear.',
    colLabels: COVERAGES.map((c) => `${pct(c)} charted`),
    scale: 2,
    rows: ['territory', 'cell'].flatMap((f) => ['D', 'D2b'].map((dir) => ({ label: `${dir} · ${f}`, pick: f === 'territory', cells: COVERAGES.map((coverage) => tile({ dir, footprint: f, biome: 'lush', seed: 7, coverage, moons: false }, CROP.disc)) }))),
  }, 'footprint.png');
}

async function coexist() {
  const all = { biome: 'lush', seed: 7, coverage: 0.5, debris: 8, artefacts: true, drone: { pos: [1.25, 0.62, 1.6], yaw: -0.5 }, cam: 'scene', t: LINEUP_T };
  const crop = [70, 14, 210, 156];
  const look = (label, c) => ({ ...all, ...c, crop, caption: label });
  await sheet({
    title: 'F8: fog with everything else (lush, 50% charted): clouds, moons (the small one fogged), 8 debris pieces, artefacts at the auto count, a drone',
    note: 'Bottom row: what fog must not be mistaken for, with fog off: lush clouds, lava ash smoke, toxic smoke, artefact sectors.',
    scale: 2,
    rows: [
      { label: 'fog', cells: PICKED.map((d) => look(`${d.id} · ${d.name}`, { dir: d.id })) },
      { label: 'not fog', cells: [look('clouds (lush)', { fog: false, artefacts: false, debris: 0, drone: false }), look('ash smoke (lava)', { biome: 'lava', seed: 11, fog: false, artefacts: false, debris: 0, drone: false }), look('toxic smoke', { biome: 'toxic', fog: false, artefacts: false, debris: 0, drone: false }), look('artefacts (lush)', { fog: false, debris: 0, drone: false })] },
    ],
  }, 'coexist.png');
}

// ---------------------------------------------------------------- motion
const LOOP_CELL = { biome: 'lush', seed: 7, coverage: 0.5 };
async function loops() {
  const ts = times(0, 24);
  for (const d of PICKED) {
    const list = [];
    for (let k = 0; k < ts.length; k += 24) list.push(...(await frames({ ...LOOP_CELL, dir: d.id }, ts.slice(k, k + 24))).map((f) => f.final));
    await gif(list, `loop-${d.id}.gif`, { crop: CROP.moons, scale: 2 });
  }
}

/**
 * The event scenes on the src planet: charting the last three fogged files one after another (the
 * last ends in the planet-clear pulse), and refogging two charted files. Each scene's files are a
 * folder's largest territories (src/state, then src/cli), so the fronts have room to travel; start
 * times put them facing the camera (facingStart). `end`: the same cell drawn in the events' end state.
 */
async function eventScenes() {
  const info = await page.evaluate(() => window.lab.info({ coverage: 1 }));
  const biggest = (folder, n) => info.files.filter((f) => f.folder === folder).sort((a, b) => b.cells - a.cells || (a.id < b.id ? -1 : 1)).slice(0, n).map((f) => f.id);
  const fogged = biggest('src/state', 3), pick = biggest('src/cli', 2);
  const clearAt = (await page.evaluate(([c, ids]) => window.lab.facingStart(c, ids, 3.4), [{ coverage: 1 }, fogged])).t0;
  const refogAt = (await page.evaluate(([c, ids]) => window.lab.facingStart(c, ids, 3.8), [{ coverage: 1 }, pick])).t0;
  const clear = { coverage: 1, fogged, events: fogged.map((file, k) => ({ file, kind: 'clear', at: clearAt + 0.4 + k * 0.6 })), moonEvents: [{ moon: 0, kind: 'clear', at: clearAt + 0.7 }] };
  const refog = { coverage: 1, fogged: [], events: pick.map((file, k) => ({ file, kind: 'refog', at: refogAt + 0.4 + k * 0.8 })), moonEvents: [{ moon: 0, kind: 'refog', at: refogAt + 0.6 }] };
  return {
    clear: { cell: { ...LOOP_CELL, ...clear }, end: { ...LOOP_CELL, coverage: 1, fogged: [] }, from: clearAt, to: clearAt + 0.4 + 1.2 + EVENT.clear + EVENT.pulse + 0.5, files: fogged },
    refog: { cell: { ...LOOP_CELL, ...refog }, end: { ...LOOP_CELL, coverage: 1, fogged: pick, moonEvents: [{ moon: 0, kind: 'refog', at: -99 }] }, from: refogAt, to: refogAt + 0.4 + 0.8 + EVENT.refog + 0.5, files: pick },
  };
}

async function events() {
  const sc = await eventScenes();
  for (const d of EVENT_DIRS) {
    for (const kind of ['clear', 'refog']) {
      const s = sc[kind];
      const list = (await frames({ ...s.cell, dir: d.id }, times(s.from, s.to))).map((f) => f.final);
      await gif(list, `${kind}-${d.id}.gif`, { scale: 2, crop: CROP.moons });
    }
  }
  // strip: every 0.2 s of each event, per direction
  const strip = (kind) => {
    const s = sc[kind];
    const ts = Array.from({ length: Math.floor((s.to - s.from) / 0.2) }, (_, k) => s.from + k * 0.2);
    return EVENT_DIRS.map((d) => ({ label: `${d.id} · ${kind}`, cells: ts.map((t) => ({ ...s.cell, dir: d.id, t, crop: CROP.disc, caption: `${(t - s.from).toFixed(1)} s` })) }));
  };
  for (const kind of ['clear', 'refog']) {
    await sheet({ title: `${kind === 'clear' ? 'F5: charting the planet\'s last three files (1 s each, 0.6 s apart), then the planet-clear pulse' : 'F6: two files refog (2.4 s each, 0.8 s apart), rolling in from their far edge'}: every 0.2 s`, scale: 2, rows: strip(kind) }, `${kind}-strip.png`);
  }
}

/**
 * The dark pass: D2c against D2d and D2e on every look at 0% and 50% charted and fully fogged at far,
 * close-ups, a loop each for D2d and D2e, and D2e's clear and refog (GIFs and a strip).
 */
async function dark() {
  const cols = [0, 0.5].flatMap((coverage) => DARK_DIRS.map((d) => [`${d.id} ${pct(coverage)}`, { dir: d.id, coverage }]));
  const far = DARK_DIRS.map((d) => [`${d.id} 0%, far`, { dir: d.id, coverage: 0, cam: { d: 21.3 } }]);
  await sheet({
    title: 'The dark pass: D2c against D2d (dark veil) and D2e (dark veil + band edges)',
    note: `${DARK_DIRS.slice(1).map((d) => `${d.id} · ${d.name}: ${d.rest}.`).join('\n')}\nThe src planet at t = ${LINEUP_T} s. The last three columns are fully fogged at depth level 2 (fade 0.72), the farthest the bands must read.`,
    colLabels: [...cols, ...far].map((c) => c[0]),
    scale: 2,
    rows: LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: [...cols.map(([, c]) => tile({ ...c, biome: l.biome, seed: l.seed, moons: false }, CROP.disc)), ...far.map(([, c]) => tile({ ...c, biome: l.biome, seed: l.seed, moons: false }, [130, 60, 60, 60]))] })),
  }, 'dark-compare.png');
  const close = [['lush', 7], ['lava', 11], ['toxic', 7], ['desert', 7], ['ice', 7]];
  await sheet({
    title: 'The dark pass, 2.4x closer at 50% charted',
    colLabels: close.map((c) => c[0]),
    scale: 2,
    rows: DARK_DIRS.map((d) => ({ label: `${d.id} · ${d.name}`, cells: close.map(([biome, seed]) => ({ dir: d.id, biome, seed, coverage: 0.5, t: LINEUP_T, cam: 'close', moons: false, crop: [70, 20, 180, 140] })) })),
  }, 'dark-closeups.png');
  const ts = times(0, 24);
  for (const d of DARK_DIRS.slice(1)) {
    const list = [];
    for (let k = 0; k < ts.length; k += 24) list.push(...(await frames({ ...LOOP_CELL, dir: d.id }, ts.slice(k, k + 24))).map((f) => f.final));
    await gif(list, `loop-${d.id}.gif`, { crop: CROP.moons, scale: 2 });
  }
  const sc = await eventScenes();
  const rows = [];
  for (const kind of ['clear', 'refog']) {
    const s = sc[kind];
    await gif((await frames({ ...s.cell, dir: 'D2e' }, times(s.from, s.to))).map((f) => f.final), `${kind}-D2e.gif`, { scale: 2, crop: CROP.moons });
    const tt = Array.from({ length: Math.floor((s.to - s.from) / 0.2) }, (_, k) => s.from + k * 0.2);
    rows.push({ label: `D2e · ${kind}`, cells: tt.map((t) => ({ ...s.cell, dir: 'D2e', t, crop: CROP.disc, caption: `${(t - s.from).toFixed(1)} s` })) });
  }
  await sheet({ title: 'D2e: charting the planet\'s last three files then the pulse, and two files refogging: every 0.2 s', scale: 2, rows }, 'dark-events-strip.png');
}

/** The final look, D2d: every band at every coverage, and its clear and refog (GIFs and a strip). */
async function final() {
  const d = direction('D2d');
  await sheet({
    title: `D2d · dark veil, the final fog: every band × coverage (the src planet, t = ${LINEUP_T} s)`,
    note: `${d.rest}.\nHealth reads on charted land, not through the veil (the human's call). Moons are test files: the big one is charted from 50%, the small one from 75%.`,
    colLabels: COVERAGES.map((c) => `${pct(c)} charted`),
    rows: LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: COVERAGES.map((coverage) => tile({ dir: 'D2d', biome: l.biome, seed: l.seed, coverage })) })),
  }, 'lineup-D2d.png');
  const sc = await eventScenes();
  const rows = [];
  for (const kind of ['clear', 'refog']) {
    const s = sc[kind];
    await gif((await frames({ ...s.cell, dir: 'D2d' }, times(s.from, s.to))).map((f) => f.final), `${kind}-D2d.gif`, { scale: 2, crop: CROP.moons });
    const tt = Array.from({ length: Math.floor((s.to - s.from) / 0.2) }, (_, k) => s.from + k * 0.2);
    rows.push({ label: `D2d · ${kind}`, cells: tt.map((t) => ({ ...s.cell, dir: 'D2d', t, crop: CROP.disc, caption: `${(t - s.from).toFixed(1)} s` })) });
  }
  await sheet({ title: 'D2d: charting the planet\'s last three files then the pulse, and two files refogging: every 0.2 s', scale: 2, rows }, 'final-events-strip.png');
}

/**
 * The cool veil (art direction §9), before and after: D2d as the human picked it (each parcel its
 * ramp's darkest step mixed toward space: warm on lava's neighbours) against the cool veil it shipped
 * as, on every look at 0% and 50% charted and fully fogged at far, and 2.4x closer. Writes the dark
 * measures for both to out/veil-measures.json.
 */
async function veil() {
  const cols = [0, 0.5].flatMap((coverage) => VEIL_DIRS.map((d) => [`${d.id === 'D2d' ? 'cool' : 'warm'} ${pct(coverage)}`, { dir: d.id, coverage }]));
  const far = VEIL_DIRS.map((d) => [`${d.id === 'D2d' ? 'cool' : 'warm'} 0%, far`, { dir: d.id, coverage: 0, cam: { d: 21.3 } }]);
  await sheet({
    title: 'D2d before and after the cool veil: warm (as picked) against cool (as shipped)',
    note: `Warm: each parcel is its ramp's darkest step mixed toward space, so next to lava every fogged parcel read as lava's dark crust.\nCool: ${direction('D2d').rest}.\nThe src planet at t = ${LINEUP_T} s. The last two columns are fully fogged at depth level 2 (fade 0.72).`,
    colLabels: [...cols, ...far].map((c) => c[0]),
    scale: 2,
    rows: LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: [...cols.map(([, c]) => tile({ ...c, biome: l.biome, seed: l.seed, moons: false }, CROP.disc)), ...far.map(([, c]) => tile({ ...c, biome: l.biome, seed: l.seed, moons: false }, [130, 60, 60, 60]))] })),
  }, 'veil-before-after.png');
  const close = [['lava', 11], ['toxic', 7], ['lush', 7], ['ice', 7]];
  await sheet({
    title: 'D2d before and after the cool veil, 2.4x closer at 50% charted (moons on)',
    colLabels: close.map((c) => c[0]),
    scale: 2,
    rows: VEIL_DIRS.map((d) => ({ label: `${d.id} · ${d.name}`, cells: close.map(([biome, seed]) => ({ dir: d.id, biome, seed, coverage: 0.5, t: LINEUP_T, cam: 'close', crop: [70, 20, 180, 140] })) })),
  }, 'veil-closeups.png');
  const rows = await measureDark(VEIL_DIRS);
  await writeFile(path.join(OUT, 'veil-measures.json'), `${JSON.stringify(rows, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(5)) : v))}\n`);
  for (const ck of ['hero', 'far']) for (const d of VEIL_DIRS) {
    const mine = rows.filter((r) => r.cond === ck && r.dir === d.id);
    const worst = (key, keep) => Math.max(...mine.filter(keep).map((r) => r[key]));
    console.log(`\n  ${ck} ${d.id}: near crust (non-lava, worst) ${pct(worst('crust', (r) => r.look !== 'lava'))}, near space ${pct(worst('space', () => true))}, limb ring near space ${pct(worst('limbNearSpace', () => true))}`);
  }
}

/**
 * The fogged haze, before and after: the looks with a lit-limb haze (ocean, ice, toxic) under D2d with
 * the haze drawn over fogged cells (a band-coloured rim: a hint at health) and hidden there, at 0% and
 * 50% charted and fully fogged at far, and 2.4x closer. Writes the dark measures (the limb against
 * space) and the haze-coloured pixel counts for both to out/haze-measures.json.
 */
async function haze() {
  const tag = (d) => (d.id === 'D2d' ? 'after' : 'before');
  const cols = [0, 0.5].flatMap((coverage) => HAZE_DIRS.map((d) => [`${tag(d)} ${pct(coverage)}`, { dir: d.id, coverage }]));
  const far = HAZE_DIRS.map((d) => [`${tag(d)} 0%, far`, { dir: d.id, coverage: 0, cam: { d: 21.3 } }]);
  await sheet({
    title: 'D2d\'s lit-limb haze, before and after: drawn over fogged cells, and fogged with them',
    note: `Ocean, ice and toxic have a haze, a thin crescent of the band's own colour on the lit limb. Before, it showed over fogged land, so a fully fogged planet still said ocean, ice or toxic.\nAfter, the haze is hidden wherever the cell under it is fogged, and returns as each file is charted. The src planet at t = ${LINEUP_T} s. The last two columns are fully fogged at depth level 2 (fade 0.72).`,
    colLabels: [...cols, ...far].map((c) => c[0]),
    scale: 2,
    rows: HAZE_LOOKS.map((l) => ({ label: `${l.look}\n(${l.band})`, cells: [...cols.map(([, c]) => tile({ ...c, biome: l.biome, seed: l.seed, moons: false }, CROP.disc)), ...far.map(([, c]) => tile({ ...c, biome: l.biome, seed: l.seed, moons: false }, [130, 60, 60, 60]))] })),
  }, 'haze-before-after.png');
  await sheet({
    title: 'D2d\'s haze before and after, 2.4x closer, fully fogged and at 50% charted',
    colLabels: HAZE_LOOKS.flatMap((l) => [`${l.look} 0%`, `${l.look} 50%`]),
    scale: 2,
    rows: HAZE_DIRS.map((d) => ({ label: `${d.id}\n${d.name}`, cells: HAZE_LOOKS.flatMap((l) => [0, 0.5].map((coverage) => ({ dir: d.id, biome: l.biome, seed: l.seed, coverage, t: LINEUP_T, cam: 'close', moons: false, crop: [70, 20, 180, 140] }))) })),
  }, 'haze-closeups.png');
  const rows = (await measureDark(HAZE_DIRS)).filter((r) => HAZE_LOOKS.some((l) => l.look === r.look));
  // haze-coloured pixels anywhere in the frame (depth off), fully fogged and fully charted
  for (const r of rows) {
    const l = lookOf(r.look), h = hexToOklab(V2_PLANET_RAMPS.haze[l.biome]);
    const cam = heroCam(CONDITIONS.find((c) => c.key === r.cond));
    const count = async (coverage) => (await frames({ dir: r.dir, biome: l.biome, seed: l.seed, moons: false, coverage, cam }, [3, 9], ['flat'])).reduce((n, f) => {
      for (let p = 0; p < f.flat.data.length; p += 4) if (dE(labAt(f.flat.data, p), h) < 0.05) n++;
      return n;
    }, 0);
    r.hazePx = await count(0);
    r.hazePxCharted = await count(1);
  }
  await writeFile(path.join(OUT, 'haze-measures.json'), `${JSON.stringify(rows, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(5)) : v))}\n`);
  console.log('');
  for (const r of rows) console.log(`  ${r.cond} ${r.look} ${r.dir}: haze px ${r.hazePx} (charted ${r.hazePxCharted}), limb median dE from space ${r.limbFog.toFixed(3)} (clear ${r.limbClear.toFixed(3)}), ring near space ${pct(r.limbNearSpace)}`);
}

// ---------------------------------------------------------------- measures
const heroCam = (cond) => ({ pos: camPos(cond), target: [0, 0, 0] });

/** F1: the shader's cells against #18's grid, on four framings. */
async function measureF1() {
  const cases = [['hero', {}], ['close', { cam: 'close' }], ['360p', { w: 640, h: 360 }], ['small', { size: 0.4 }]];
  const out = {};
  for (const [name, c] of cases) out[name] = await page.evaluate((cell) => window.lab.cellCheck(cell), { coverage: 0.5, t: 3, ...c });
  return out;
}

/**
 * F2: fog area and visibility by coverage, over one surface turn (8 phases), per direction and look,
 * at the hero framing; and the dark pass (DARK_DIRS) again at depth level 2 (far).
 */
async function measureF2() {
  const rows = await measureF2At('hero', MEASURED());
  return rows.concat(await measureF2At('far', DARK_DIRS.filter((d) => MEASURED().includes(d))));
}
async function measureF2At(ck, dirs) {
  const phases = Array.from({ length: QUICK ? 2 : 8 }, (_, k) => k * (QUICK ? 6 : 1.5));
  const cond = CONDITIONS.find((c) => c.key === ck);
  const cam = heroCam(cond);
  const empty = (await frames({ coverage: 1, cam }, [0], ['empty']))[0].empty;
  const geom = geometryFor(cond);
  const rows = [];
  const masks = new Map(), opens = new Map();
  const getMask = async (footprint, coverage, k) => {
    const key = `${footprint}|${coverage}|${k}`;
    if (!masks.has(key)) masks.set(key, stages((await frames({ footprint, coverage, moons: false, cam }, [phases[k]], ['mask']))[0].mask));
    return masks.get(key);
  };
  for (const l of QUICK ? LOOKS.slice(0, 2) : LOOKS) {
    const base = await frames({ biome: l.biome, seed: l.seed, moons: false, coverage: 1, cam }, phases, ['nofog']);
    for (const d of dirs) for (const footprint of ck === 'hero' && (d.id === 'D' || d.id === 'D2b') ? ['territory', 'cell'] : ['territory']) {
      for (const coverage of COVERAGES) {
        const fr = await frames({ dir: d.id, biome: l.biome, seed: l.seed, moons: false, coverage, footprint, cam }, phases, ['final']);
        const ok = `${l.look}|${footprint}|${coverage}`;
        if (!opens.has(ok)) opens.set(ok, (await frames({ biome: l.biome, seed: l.seed, moons: false, coverage, footprint, cam }, phases, ['mask-clouds'])).map((f) => stages(f['mask-clouds'])));
        for (let k = 0; k < phases.length; k++) {
          const disc = discPixels(base[k].nofog, empty, geom);
          const st = await getMask(footprint, coverage, k);
          const vis = opens.get(ok)[k];
          const open = new Set(disc.filter((p) => vis[p] > 0)); // fogged pixels not under a cloud
          const v = fogVisibility(fr[k].final, base[k].nofog, disc, st, open);
          // render checks: a fully charted planet is the planet itself; a fully fogged one shows its fog
          if (coverage === 1 && v.visible > 0) throw new CheckError(`${d.id} ${l.look}: 100% charted differs from fog off`);
          if (footprint === 'territory' && coverage === 0 && (v.fogged < 0.5 || v.visible === 0)) throw new CheckError(`${d.id} ${l.look}: 0% charted shows no fog`);
          rows.push({ cond: ck, dir: d.id, look: l.look, band: l.band, footprint, coverage, phase: phases[k], ...v });
        }
      }
      process.stdout.write(`  F2 ${ck} ${l.look} ${d.id}\r`);
    }
  }
  return rows;
}

/**
 * F3: the band read under fog. Clear centroids from the 24 seeds of every look (health-looks' set),
 * then every direction at 0% and 50% charted on seeds 1-8 (layout seed = terrain seed), at the
 * hero framing and at depth level 2 (far), plus 'overlays' (moons and artefacts) at 50%.
 */
async function measureF3() {
  const condKeys = QUICK ? ['hero'] : ['hero', 'far', 'overlays'];
  const seeds = HL_SEEDS.slice(0, QUICK ? 2 : 8);
  const out = { clear: {}, fog: [] };
  for (const ck of condKeys) {
    const cond = CONDITIONS.find((c) => c.key === ck);
    const base = { cam: heroCam(cond), size: cond.size, t: HL_T, moons: !!cond.overlays, artefacts: !!cond.overlays };
    const empty = (await frames({ ...base, coverage: 1, moons: false }, [HL_T], ['empty']))[0].empty;
    const geom = geometryFor(cond);
    const measureOne = (fr, look, mode) => {
      const emissive = look === 'lava' ? fr[mode === 'final' ? 'sentinel' : 'nofog-sentinel'] : null;
      return hlMeasure(fr[mode], empty, geom, { warmHue: WARM_HUE, emissive });
    };
    // clear: every look x the 24 seeds (only the hero centroids feed the fidelity check against health-looks)
    const clear = [];
    const palettes = {};
    for (const l of LOOKS) {
      for (const seed of ck === 'overlays' || QUICK ? seeds : HL_SEEDS) {
        const modes = l.look === 'lava' ? ['nofog', 'nofog-sentinel'] : ['nofog'];
        const fr = (await frames({ ...base, biome: l.biome, seed, layoutSeed: seed, coverage: 1 }, [HL_T], modes))[0];
        const m = measureOne(fr, l.look, 'nofog');
        clear.push({ look: l.look, band: l.band, seed, ...m });
        collectColours(fr.nofog, discPixels(fr.nofog, empty, geom), (palettes[l.band] ??= new Map()));
      }
      process.stdout.write(`  F3 ${ck} clear ${l.look}   \r`);
    }
    const cents = Object.fromEntries(LOOKS.map((l) => [l.look, centroid(clear.filter((r) => r.look === l.look).map(lookVector))]));
    const pal = Object.fromEntries(Object.entries(palettes).map(([b, m]) => [b, [...m.values()]]));
    out.clear[ck] = { records: clear, centroids: cents, h5: checkH5(clear, LOOKS.map((l) => l.look), bandOf) };
    const cache = new Map();
    // the dark pass (DARK_DIRS) also at 25% and 75%, with the band read from the charted land alone
    const covsOf = (d) => (ck === 'overlays' ? [0.5] : DARK_DIRS.includes(d) ? [0, 0.25, 0.5, 0.75] : [0, 0.5]);
    for (const d of MEASURED()) for (const coverage of covsOf(d)) for (const l of LOOKS) for (const seed of seeds) {
      const dark = DARK_DIRS.includes(d) && coverage > 0;
      const modes = [...(l.look === 'lava' ? ['final', 'sentinel'] : ['final']), ...(dark ? ['mask'] : [])];
      const fr = (await frames({ ...base, dir: d.id, biome: l.biome, seed, layoutSeed: seed, coverage }, [HL_T], modes))[0];
      const m = measureOne(fr, l.look, 'final');
      const read = readBand(lookVector(m), cents, bandOf, l.band);
      // charted land: the same measure with every fogged surface pixel taken out of the disc (set to the empty frame)
      let charted = null;
      if (dark) {
        const st = stages(fr.mask);
        const cut = (img) => { const d2 = new Uint8Array(img.data); for (let p = 0; p < st.length; p++) if (st[p]) d2.set(empty.data.subarray(p * 4, p * 4 + 4), p * 4); return { ...img, data: d2 }; };
        const masked = { final: cut(fr.final), ...(fr.sentinel ? { sentinel: cut(fr.sentinel) } : {}) };
        const mc = measureOne(masked, l.look, 'final');
        if (mc.n) charted = readBand(lookVector(mc), cents, bandOf, l.band);
      }
      const disc = discPixels(fr.final, empty, geom);
      const votes = pixelVote(fr.final, disc, pal, cache);
      const shown = pixelVote(fr.final, disc, pal, cache, 0.03); // the band from what still shows a planet colour
      out.fog.push({ cond: ck, dir: d.id, coverage, look: l.look, band: l.band, seed, L: m.L, warm: m.warm, glow: m.glow, ...read, vote: votes[l.band], voteShown: shown[l.band], shown: shown.voted, ...(charted ? { chartedRead: charted.read, chartedMargin: charted.margin, chartedConfusable: charted.confusable } : {}) });
      process.stdout.write(`  F3 ${ck} ${d.id} ${pct(coverage)} ${l.look} ${seed}   \r`);
    }
  }
  // the clear vote, for comparison: each clear hero disc against the palettes (its own colours are in them)
  return out;
}

/** F5-F7: the events (teal, direction of motion, cleanliness after) and the loop (seam, teal at rest). */
async function measureMotion() {
  const sc = await eventScenes();
  const out = { events: {}, loops: {} };
  for (const d of MEASURED()) {
    out.events[d.id] = {};
    for (const kind of ['clear', 'refog']) {
      const s = sc[kind];
      const ts = times(s.from, s.to);
      const fr = await frames({ ...s.cell, dir: d.id }, ts, ['flat', 'mask']);
      const teal = fr.map((f) => tealCount(f.flat));
      // motion: the changing mask pixels' mean distance from the event files' own cells, over time
      const proj = await page.evaluate(([c, ids, tt]) => tt.map((t) => window.lab.project(c, ids, t)), [s.cell, s.files, ts]);
      const dist = [];
      for (let k = 1; k < fr.length; k++) {
        const a = stages(fr[k - 1].mask), b = stages(fr[k].mask);
        let sum = 0, n = 0;
        for (let p = 0; p < a.length; p++) {
          if (a[p] === b[p]) continue;
          const x = (p % fr[k].mask.w) + 0.5, y = Math.floor(p / fr[k].mask.w) + 0.5;
          sum += Math.min(...proj[k].map((q) => Math.hypot(x - q.x, y - q.y))); n++;
        }
        if (n) dist.push({ t: ts[k] - s.from, d: sum / n, n });
      }
      // after the event: no teal, and the frame equals the same cell with the events' end state
      const end = s.to + 0.5;
      const after = (await frames({ ...s.cell, dir: d.id }, [end], ['flat']))[0].flat;
      const settled = (await frames({ ...s.end, dir: d.id }, [end], ['flat']))[0].flat;
      out.events[d.id][kind] = {
        tealMax: Math.max(...teal.map((x) => x.share)), tealFrames: teal.filter((x) => x.near > 0).length, frames: fr.length,
        tealAfter: tealCount(after).near, settledDiff: diffSet(after, settled).size,
        motion: dist, trend: trend(dist),
      };
    }
    process.stdout.write(`  motion ${d.id}   \r`);
  }
  // loops: frame 0 vs a loop later, wrap vs the largest step, and teal at rest over the loop (every 0.5 s)
  for (const d of MEASURED()) {
    const ts = times(0, 24, 2);
    const fr = await frames({ ...LOOP_CELL, dir: d.id }, [...ts, 24], ['final', 'flat']);
    // the wrap, then every step over the first 4 s (60 frames: eight of A's shimmer ticks fall in it)
    const steps = [];
    const fine = await frames({ ...LOOP_CELL, dir: d.id }, [24 - 1 / 15, ...times(0, 4)], ['final']);
    for (let k = 1; k < fine.length; k++) steps.push(diffSet(fine[k - 1].final, fine[k].final).size);
    const again = (await frames({ ...LOOP_CELL, dir: d.id }, [0], ['final']))[0].final;
    out.loops[d.id] = {
      loopLater: diffSet(fr[0].final, fr.at(-1).final).size, wrap: steps[0], maxStep: Math.max(...steps.slice(1)),
      deterministic: diffSet(fr[0].final, again).size === 0, tealRest: Math.max(...fr.map((f) => tealCount(f.flat).near)), // depth off: teal is exact
    };
  }
  return out;
}
/** The sign of the motion: the least-squares slope of the front's distance from the files over time (px/s). */
function trend(pts) {
  if (pts.length < 2) return 0;
  const mt = mean(pts.map((p) => p.t)), md = mean(pts.map((p) => p.d));
  const num = pts.reduce((s, p) => s + (p.t - mt) * (p.d - md), 0), den = pts.reduce((s, p) => s + (p.t - mt) ** 2, 0);
  return den ? num / den : 0;
}

/**
 * F8: fog against clouds (lush), ash smoke (lava), toxic smoke and artefact sectors (lush), at 50%
 * charted: bulge past the silhouette, terrain lock (the same layer a surface turn later), flicker
 * with the surface held still, palette membership and closeness to the weather ramps.
 */
async function measureF8() {
  const T0 = 2, TURN = 12;
  const geom = discGeometry({ camPos: [1.92, 1.12, 6.69], radius: 1, w: 320, h: 180, fov: 35 });
  const still = Array.from({ length: 16 }, (_, k) => T0 + k / 15);
  const layerOf = (fr, kind) => {
    if (kind === 'fog') { const s = stages(fr['mask-clouds']); return new Set([...s.keys()].filter((p) => s[p] === 1 || s[p] === 2)); }
    if (kind === 'weather') return diffSet(fr['nofog-flat'], fr['puffs-off']);
    return diffSet(fr['nofog-flat'], fr['art-off']);
  };
  const out = [];
  const subjects = [
    ...MEASURED().map((d) => ({ name: `fog ${d.id}`, kind: 'fog', cell: { dir: d.id, biome: 'lush', seed: 7 } })),
    ...MEASURED().map((d) => ({ name: `fog ${d.id} (lava)`, kind: 'fog', cell: { dir: d.id, biome: 'lava', seed: 11 } })),
    { name: 'clouds (lush)', kind: 'weather', cell: { biome: 'lush', seed: 7 } },
    { name: 'ash smoke (lava)', kind: 'weather', cell: { biome: 'lava', seed: 11 } },
    { name: 'toxic smoke', kind: 'weather', cell: { biome: 'toxic', seed: 7 } },
    { name: 'artefacts (lush)', kind: 'art', cell: { biome: 'lush', seed: 7, artefacts: true } },
  ];
  for (const s of subjects) {
    const cell = { coverage: 0.5, moons: false, ...s.cell };
    const modes = ['flat', 'nofog-flat', 'puffs-off', 'art-off', 'mask-clouds', 'mask'];
    const [a, b] = await frames(cell, [T0, T0 + TURN], modes);
    const layer = layerOf(a, s.kind), later = layerOf(b, s.kind);
    const lockA = s.kind === 'fog' ? new Set([...stages(a.mask).keys()].filter((p) => stages(a.mask)[p] > 0)) : layer;
    const lockB = s.kind === 'fog' ? new Set([...stages(b.mask).keys()].filter((p) => stages(b.mask)[p] > 0)) : later;
    const frozen = (await frames({ ...cell, freezeAt: T0 }, still, [s.kind === 'fog' ? 'flat' : 'nofog-flat'])).map((f) => f.flat ?? f['nofog-flat']);
    const st = layerStats(layer, s.kind === 'fog' ? a.flat : a['nofog-flat'], geom, cell.biome);
    // what fog adds: the same pixels' closeness to the weather ramps with the fog off
    const base = s.kind === 'fog' ? layerStats(layer, a['nofog-flat'], geom, cell.biome) : null;
    out.push({ name: s.name, kind: s.kind, ...st, weatherNearClear: base?.weatherNear ?? null, lock: iou(lockA, lockB), flicker: flicker(layer, frozen) });
    process.stdout.write(`  F8 ${s.name}   \r`);
  }
  return out;
}

/**
 * F8 for the dark pass: is a fully fogged parcel mistaken for space, the planet's unlit side or lava's
 * dark crust, and does the silhouette survive at the limb? For D2c, D2d and D2e on every look, fully
 * fogged, at hero and far, two phases. Fog pixels are the visible ones (not under a cloud); colours are
 * taken depth off (flat) for the colour shares, and as shipped (depth on) for the limb.
 *   space: the share of fog pixels within 0.05 of the space colour;
 *   night: within 0.05 of the look's unlit ground (each of its ramps' darkest step);
 *   crust: within 0.05 of lava's crust ramp (for the other looks: the worst band's ground);
 *   limb: the outer 2 px ring of the disc, its median OKLab distance from space, fogged and clear,
 *   and the share of the ring within 0.03 of space.
 */
async function measureDark(dirs = DARK_DIRS) {
  const out = [];
  const space = hexToOklab(SPACE);
  const crust = V2_PLANET_RAMPS.crust.map(hexToOklab);
  for (const ck of ['hero', 'far']) {
    const cond = CONDITIONS.find((c) => c.key === ck);
    const cam = heroCam(cond), geom = geometryFor(cond);
    const empty = (await frames({ coverage: 1, cam }, [3], ['empty']))[0].empty;
    for (const l of LOOKS) {
      const night = BIOME_RAMPS[l.biome].map((k) => hexToOklab(V2_PLANET_RAMPS[k][0]));
      const clear = await frames({ biome: l.biome, seed: l.seed, moons: false, coverage: 1, cam }, [3, 9], ['final']);
      for (const d of dirs) {
        const fr = await frames({ dir: d.id, biome: l.biome, seed: l.seed, moons: false, coverage: 0, cam }, [3, 9], ['final', 'flat', 'mask-clouds']);
        let n = 0, nSpace = 0, nNight = 0, nCrust = 0;
        const limbF = [], limbC = [];
        fr.forEach((f, k) => {
          const st = stages(f['mask-clouds']);
          for (let p = 0; p < st.length; p++) {
            if (st[p] < 1) continue;
            const lab = labAt(f.flat.data, p * 4);
            n++;
            if (dE(lab, space) < 0.05) nSpace++;
            if (Math.min(...night.map((q) => dE(lab, q))) < 0.05) nNight++;
            if (Math.min(...crust.map((q) => dE(lab, q))) < 0.05) nCrust++;
          }
          for (const [img, list] of [[f.final, limbF], [clear[k].final, limbC]]) {
            for (const p of discPixels(img, empty, geom, 1.0)) {
              const x = (p % img.w) + 0.5 - geom.cx, y = Math.floor(p / img.w) + 0.5 - geom.cy;
              if (Math.hypot(x, y) >= geom.r - 2) list.push(dE(labAt(img.data, p * 4), space));
            }
          }
        });
        const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
        out.push({
          cond: ck, dir: d.id, look: l.look, px: n, space: nSpace / Math.max(1, n), night: nNight / Math.max(1, n), crust: nCrust / Math.max(1, n),
          limbFog: med(limbF), limbClear: med(limbC), limbNearSpace: limbF.filter((x) => x < 0.03).length / Math.max(1, limbF.length), limbNearSpaceClear: limbC.filter((x) => x < 0.03).length / Math.max(1, limbC.length),
        });
        process.stdout.write(`  dark ${ck} ${l.look} ${d.id}   \r`);
      }
    }
  }
  return out;
}

async function measures() {
  const m = { at: 'lab.mjs measures', cells: { lineupT: LINEUP_T } };
  console.log('  F1'); m.f1 = ONLY ? null : await measureF1();
  console.log('  F2'); m.f2 = await measureF2();
  console.log('\n  F3'); m.f3 = await measureF3();
  console.log('\n  F5-F7'); m.motion = await measureMotion();
  console.log('\n  F8'); m.f8 = await measureF8();
  console.log('\n  F8 dark'); m.dark = await measureDark();
  if (ONLY) {
    // merge: these directions' rows replace the old ones; everything else is kept
    const old = JSON.parse(await readFile(path.join(ROOT, 'measures.json'), 'utf8'));
    const mine = (r) => ONLY.includes(r.dir);
    m.f1 = old.f1;
    m.f2 = [...old.f2.filter((r) => !mine(r)), ...m.f2];
    m.f3 = { clear: m.f3.clear, fog: [...old.f3.fog.filter((r) => !mine(r)), ...m.f3.fog] };
    m.motion = { events: { ...old.motion.events, ...m.motion.events }, loops: { ...old.motion.loops, ...m.motion.loops } };
    const fogName = (r) => ONLY.some((id) => r.name === `fog ${id}` || r.name === `fog ${id} (lava)`);
    m.f8 = [...old.f8.filter((r) => r.kind === 'fog' && !fogName(r)), ...m.f8.filter((r) => r.kind === 'fog'), ...m.f8.filter((r) => r.kind !== 'fog')];
  }
  m.page = await page.evaluate(() => window.lab.info({ coverage: 0.5 }));
  await writeFile(path.join(ROOT, 'measures.json'), `${JSON.stringify(m, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(5)) : v))}\n`);
  console.log('\n  measures.json');
}

// ---------------------------------------------------------------- run
await mkdir(OUT, { recursive: true });
if (names.length === 1 && names[0] === 'report') {
  await writeReport(ROOT);
} else {
  const browser = await launch();
  try {
    page = await openLab(browser);
    const run = { lineups, compare, d2, closeups, reasons, footprint, coexist, loops, events, dark, final, veil, haze, measures };
    for (const n of names) {
      if (!run[n] && n !== 'report') throw new Error(`unknown output ${n}`);
      if (n === 'report') continue;
      console.log(n);
      const t0 = Date.now();
      await run[n]();
      console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    if (names.includes('measures') || names.includes('report')) await writeReport(ROOT);
  } finally {
    await browser.close();
  }
}
