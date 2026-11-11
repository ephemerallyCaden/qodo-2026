// Pure checks (Node, no browser): the #18 grid port, the mock planets and footprints, the fog state
// over time, the shader's search window, the glyph set, and the constants copied from other mockups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fibonacciCell, centresOf, Surface, SURFACE_CELLS } from '../surface.js';
import { mockPlanet, footprint, chartedAt, stateAt, cellData, shares, coverRadius, COVER_256, COVERAGES, REASONS, EVENT, TEX_ROWS, PLANETS } from '../mock.js';
import { GLYPHS, mask, LUMA_SET, REASON_SET, REST_GLYPHS } from '../glyphs.js';
import { BIOME_RAMPS } from '../stats.mjs';
import { LOOKS } from '../variants.js';
import { LOOKS as HL_LOOKS } from '../../health-looks/lab.mjs';
import { ARTEFACTS_GLSL } from '../../asset-viewer/artefacts.js';
import { VEIL } from '../../asset-viewer/fog.js';
import { hexToOklab } from '../../health-looks/metrics.mjs';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';

const viewer = await readFile(new URL('../../asset-viewer/viewer.js', import.meta.url), 'utf8');

test('fibonacciCell is #18 contract helper: cell 0 at the north pole, the last at the south, golden-angle steps', () => {
  assert.deepEqual(fibonacciCell(0, 256), [1, 1, 0].map((v, i) => (i === 1 ? 1 : i === 0 ? 0 : 0)));
  const last = fibonacciCell(255, 256);
  assert.ok(Math.abs(last[1] + 1) < 1e-12 && Math.hypot(last[0], last[2]) < 1e-6);
  const c1 = fibonacciCell(1, 256), y = 1 - 2 / 255, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5));
  assert.deepEqual(c1, [Math.cos(th) * r, y, Math.sin(th) * r]);
  for (let i = 0; i < 256; i++) assert.ok(Math.abs(Math.hypot(...fibonacciCell(i, 256)) - 1) < 1e-12);
  assert.deepEqual(fibonacciCell(0, 1), [1, 0, 0]);
});

test('Surface: the top folder seeds at cell 0, later continents at the free cell farthest from every seed, files claim the nearest free cell', () => {
  const s = new Surface(256, 'top');
  assert.equal(s.seed('top'), 0);
  assert.equal(s.seed('a'), 255, 'the farthest cell from the north pole is the south pole');
  assert.equal(s.seed('b'), 127, 'equidistant from both poles: the equator, ties to the lower cell');
  assert.equal(s.seed('a'), 255, 'a seed is decided once');
  assert.equal(s.claim(0), 0);
  const second = s.claim(0);
  const c = centresOf(256);
  const dot = (i) => c[3 * i + 1]; // cell 0 is (0, 1, 0): the dot product is y
  for (let i = 1; i < 256; i++) if (i !== second) assert.ok(dot(i) <= dot(second), 'the claimed cell is the nearest free one');
  s.release(0);
  assert.equal(s.claim(255), 255);
  const full = new Surface(4, 't');
  for (let i = 0; i < 4; i++) assert.notEqual(full.claim(0), null);
  assert.equal(full.claim(0), null, 'a full grid returns null');
});

test('mock planets settle as #18: each folder\'s first file on its continent seed, every file on its own cell', () => {
  for (const kind of Object.keys(PLANETS)) {
    const p = mockPlanet(kind, 3);
    assert.equal(p.files.length, PLANETS[kind].files);
    assert.equal(new Set(p.files.map((f) => f.cell)).size, p.files.length, 'one file per cell');
    for (const f of PLANETS[kind].folders) assert.equal(p.files.find((x) => x.folder === f.id).cell, p.seeds.get(f.id));
    assert.equal(p.seeds.get(PLANETS[kind].folders[0].id), 0, 'the top-level folder grows from the north pole');
    assert.deepEqual(mockPlanet(kind, 3), p, 'deterministic');
    for (const f of p.files) assert.ok(REASONS.includes(f.reason));
  }
});

test('coverage charts round(c x N) files in charting order; 100% charts all', () => {
  const p = mockPlanet('src', 1);
  for (const c of COVERAGES) assert.equal(chartedAt(p, c).size, Math.round(c * p.files.length));
  const half = chartedAt(p, 0.5), quarter = chartedAt(p, 0.25);
  for (const id of quarter) assert.ok(half.has(id), 'more coverage only adds charted files');
});

test('footprints: cell owns exactly the files\' cells; territory shares out every cell, each file keeping its own', () => {
  for (const seed of [1, 2, 3, 4]) for (const kind of Object.keys(PLANETS)) {
    const p = mockPlanet(kind, seed);
    const cell = footprint(p, 'cell');
    assert.equal([...cell.owner].filter((k) => k >= 0).length, p.files.length);
    p.files.forEach((f, k) => assert.equal(cell.owner[f.cell], k));
    const t = footprint(p, 'territory');
    assert.ok([...t.owner].every((k) => k >= 0), 'every cell is owned');
    p.files.forEach((f, k) => assert.equal(t.owner[f.cell], k, 'a file owns its own cell'));
    // the fogged share of the surface tracks the fogged share of the files
    for (const c of COVERAGES) {
      const s = shares(p, t, stateAt(p, { coverage: c }).fogged);
      assert.ok(Math.abs(s.cells - s.files) <= 0.12, `${kind} seed ${seed} at ${c}: cells ${s.cells} vs files ${s.files}`);
    }
    for (let k = 0; k < p.files.length; k++) {
      assert.ok(t.reach[k] >= COVER_256 - 1e-9);
      assert.equal(t.owner[t.anchor[k]], k, 'the anchor is one of the file\'s own cells');
      assert.equal(cell.anchor[k], p.files[k].cell, 'a one-cell footprint is anchored on its cell');
    }
  }
});

test('the grid\'s covering radius is pinned, and the shader\'s search window holds the two nearest cells', () => {
  const r = coverRadius(256);
  assert.ok(Math.abs(r - COVER_256) < 0.003, `cover ${r}`);
  const win = Math.ceil((1.7 * COVER_256 * 255) / 2) + 1;
  const c = centresOf(256);
  for (let k = 0; k < 4000; k++) {
    const y = 1 - (2 * (k + 0.5)) / 4000, rr = Math.sqrt(1 - y * y), t = k * 2.399963229728653;
    const p = [Math.cos(t) * rr, y, Math.sin(t) * rr];
    const order = Array.from({ length: 256 }, (_, i) => i).sort((a, b) => (p[0] * c[3 * b] + p[1] * c[3 * b + 1] + p[2] * c[3 * b + 2]) - (p[0] * c[3 * a] + p[1] * c[3 * a + 1] + p[2] * c[3 * a + 2]));
    const i0 = Math.floor((1 - y) * 0.5 * 255 + 0.5);
    assert.ok(Math.abs(order[0] - i0) <= win && Math.abs(order[1] - i0) <= win, `point ${k}`);
  }
});

test('events: a clear runs then charts, a refog runs then fogs, the planet-clear pulse follows the last clear', () => {
  const p = mockPlanet('src', 1);
  const N = p.files.length;
  const last = [...stateAt(p, { coverage: (N - 1) / N }).fogged];
  assert.equal(last.length, 1);
  const events = [{ file: last[0], kind: 'clear', at: 1 }];
  assert.ok(stateAt(p, { coverage: (N - 1) / N, events, t: 0.5 }).fogged.has(last[0]));
  const mid = stateAt(p, { coverage: (N - 1) / N, events, t: 1.5 });
  assert.equal(mid.active.get(last[0]).kind, 1);
  assert.ok(!mid.fogged.has(last[0]));
  const after = stateAt(p, { coverage: (N - 1) / N, events, t: 1 + EVENT.clear + 0.3 });
  assert.equal(after.fogged.size, 0);
  assert.ok(after.pulse && after.pulse.file === last[0]);
  assert.equal(stateAt(p, { coverage: (N - 1) / N, events, t: 1 + EVENT.clear + EVENT.pulse + 0.1 }).pulse, null);
  const f = p.files[0].id;
  const re = [{ file: f, kind: 'refog', at: 0 }];
  assert.equal(stateAt(p, { coverage: 1, events: re, t: 1 }).active.get(f).kind, 2);
  assert.ok(stateAt(p, { coverage: 1, events: re, t: EVENT.refog + 0.1 }).fogged.has(f));
});

test('cellData: rest state, event and cell centre rows', () => {
  const p = mockPlanet('src', 1);
  const foot = footprint(p, 'territory');
  const st = stateAt(p, { coverage: 0 });
  const d = cellData(p, foot, st);
  assert.equal(d.length, SURFACE_CELLS * TEX_ROWS * 4);
  for (let i = 0; i < SURFACE_CELLS; i++) {
    const f = p.files[foot.owner[i]];
    assert.equal(d[i * 4], 1);
    assert.equal(d[i * 4 + 1], REASONS.indexOf(f.reason));
    assert.equal(d[i * 4 + 2], foot.anchor[foot.owner[i]]);
    assert.ok(Math.abs(d[(2 * SURFACE_CELLS + i) * 4 + 1] - fibonacciCell(i, SURFACE_CELLS)[1]) < 1e-6);
  }
  assert.ok(cellData(p, foot, stateAt(p, { coverage: 1 })).filter((_, k) => k < SURFACE_CELLS * 4 && k % 4 === 0).every((v) => v === 0));
});

test('glyphs: 5x5, one per reason, none of them an artefact bug glyph', () => {
  for (const [name, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, 5, name);
    for (const r of rows) assert.match(r, /^[#.]{5}$/, name);
  }
  assert.equal(REASON_SET.length, REASONS.length);
  assert.equal(new Set(REASON_SET.map((n) => mask(GLYPHS[n]))).size, REASONS.length, 'reasons are told apart');
  assert.equal(LUMA_SET.length, 4);
  const bugs = ARTEFACTS_GLSL.match(/const int BUGS\[10\] = int\[10\]\(([^)]*)\)/)[1].split(',').map(Number);
  const plus = Number(ARTEFACTS_GLSL.match(/const int PLUS = (\d+)/)[1]);
  assert.equal(bugs.length, 10);
  for (const g of REST_GLYPHS) assert.ok(![...bugs, plus].includes(mask(GLYPHS[g])), `${g} is an artefact glyph`);
});

test('constants copied from other mockups still match them', () => {
  for (const [biome, ramps] of Object.entries(BIOME_RAMPS)) {
    const m = viewer.match(new RegExp(`\\n  ${biome}: \\{ id: \\d+, label: '[^']+', ramps: \\[([^\\]]+)\\]`));
    assert.ok(m, biome);
    assert.deepEqual(m[1].split(',').map((s) => s.trim().replace(/'/g, '')), ramps, biome);
  }
  assert.deepEqual(LOOKS.map((l) => [l.look, l.band, l.biome]), HL_LOOKS.map((l) => [l.look, l.band, l.biome]));
  // the fog hook's splice points are the viewer's own shader lines
  for (const from of ['vec4(artefacts(p, b, surface(p, b)), 1.0)', 'depthFade(surface(p, b - 1), vPosW, 1.0)', 'depthFade(uRamp[band(normalize(vNormalW))], vPosW, 1.0)']) assert.ok(viewer.includes(from), from);
});

test('D2d\'s veil is cool-dark: every veil tone at least 0.06 (OKLab) from lava\'s crust and from space', () => {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const crust = V2_PLANET_RAMPS.crust.map(hexToOklab), space = hexToOklab('#0d0b16');
  for (const [name, hex] of Object.entries(VEIL)) {
    const c = hexToOklab(hex);
    assert.ok(Math.min(...crust.map((q) => d(c, q))) >= 0.06, `${name} ${hex} is near lava crust`);
    assert.ok(d(c, space) >= 0.06, `${name} ${hex} is near space`);
  }
});
