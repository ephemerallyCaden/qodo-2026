// Artefact glyph clamp (ART_CELLS in artefacts.js): at far, default and very close zoom (180p,
// plus 360p), every visible sector spans ART_CELLS.min..max glyph cells across, its rendered
// extent never exceeds that, and cells are whole-pixel squares (a multiple of the 6 px glyph cell)
// that grow as the camera closes in. Uses the shader's artefact debug view (cell index colours,
// row slip off), diffed against artefacts off. Fails on empty output (no sector at a zoom).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { ART_CELLS } from '../artefacts.js';

const VIEW = [1.92, 1.12, 6.69]; // the planet view camera
const ZOOMS = [['far', 2.6, 180], ['default', 1, 180], ['close', 0.25, 180], ['default', 1, 360], ['close', 0.25, 360]];
const BASE = { view: 'planet', biome: 'lush', seed: 7, size: 1, ringMode: 'off', moons: false, cover: 0, depth: false, palette: 'final', spin: true, ui: false, halo: false, artAuto: false, artCount: 5, artTeal: false };

export async function measureCells(page, zoom, pixelH, base = BASE) {
  return page.evaluate(({ base, zoom, pixelH, VIEW }) => {
    const camera = { pos: VIEW.map((v) => v * zoom), target: [0, 0, 0] };
    const grab = (o) => {
      window.viewer.set(o);
      const src = document.getElementById('view');
      const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      return { W: src.width, H: src.height, d: x.getImageData(0, 0, src.width, src.height).data };
    };
    let best = null;
    for (let time = 0; time < 12; time += 1) {
      const off = grab({ ...base, pixelH, camera, time, artefacts: false, artDebug: true });
      const on = grab({ ...base, pixelH, camera, time, artefacts: true, artDebug: true });
      const sectors = new Map(); // i -> { across, cells: Map(key -> px) }
      for (let p = 0; p < on.W * on.H; p++) {
        const q = p * 4;
        if (on.d[q] === off.d[q] && on.d[q + 1] === off.d[q + 1] && on.d[q + 2] === off.d[q + 2]) continue;
        const i = Math.floor(on.d[q + 2] / 50);
        if (!sectors.has(i)) sectors.set(i, { across: (on.d[q + 2] % 50) / 4, cells: new Map() });
        const key = `${on.d[q] - 128},${on.d[q + 1] - 128}`;
        const cells = sectors.get(i).cells;
        cells.set(key, (cells.get(key) ?? 0) + 1);
      }
      const px = [...sectors.values()].reduce((a, s) => a + [...s.cells.values()].reduce((x, y) => x + y, 0), 0);
      if (!best || px > best.px) best = { time, px, sectors };
    }
    const rows = [];
    for (const [i, s] of best.sectors) {
      const keys = [...s.cells.keys()].map((k) => k.split(',').map(Number));
      const cols = new Set(keys.map(([x]) => x)).size, rowsN = new Set(keys.map(([, y]) => y)).size;
      // interior cells (all 4 neighbours in the sector) are whole squares; their side is the cell size
      const has = (x, y) => s.cells.has(`${x},${y}`);
      const sides = keys.filter(([x, y]) => has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1)).map(([x, y]) => Math.sqrt(s.cells.get(`${x},${y}`)));
      rows.push({ sector: i, across: s.across, cols, rows: rowsN, cells: keys.length, interior: sides.length, cellPx: sides.length ? Math.max(...sides) : null, ragged: sides.filter((v) => v !== sides[0] || v % 6 !== 0).length });
    }
    return { time: best.time, px: best.px, rows };
  }, { base, zoom, pixelH, VIEW });
}

test(`artefact glyph clamp: ${ART_CELLS.min}..${ART_CELLS.max} cells across a sector at far, default and close zoom`, async () => {
  const { browser, page } = await openViewer();
  try {
    const out = [];
    for (const [name, zoom, pixelH] of ZOOMS) {
      const m = await measureCells(page, zoom, pixelH);
      for (const r of m.rows) out.push({ zoom: name, pixelH, t: m.time, ...r });
      assert.ok(m.rows.length > 0, `${name}@${pixelH}: no artefact sector rendered (empty output)`);
    }
    console.table(out);
    for (const r of out) {
      const id = `${r.zoom}@${r.pixelH} sector ${r.sector}`;
      assert.ok(r.across >= ART_CELLS.min - 0.13 && r.across <= ART_CELLS.max + 0.13, `${id}: ${r.across} cells across`);
      assert.ok(Math.max(r.cols, r.rows) <= Math.ceil(r.across) + 1, `${id}: renders ${r.cols} x ${r.rows} cells for ${r.across} across`);
      assert.equal(r.ragged, 0, `${id}: interior cells are not equal whole-pixel squares`);
    }
    // zooming in grows the cells instead of adding them
    const size = (zoom, pixelH) => Math.max(...out.filter((r) => r.zoom === zoom && r.pixelH === pixelH && r.cellPx).map((r) => r.cellPx));
    assert.ok(size('close', 180) > size('default', 180), 'cells did not grow when zooming in (180p)');
    assert.ok(size('close', 360) > size('default', 360), 'cells did not grow when zooming in (360p)');
  } finally {
    await browser.close();
  }
});
