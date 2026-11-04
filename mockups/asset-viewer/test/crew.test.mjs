// Crew astronaut (variant K, astronaut.js) at 180p, rendered alone through the viewer's real
// makeAstronaut at the crew close-up's pixel density (debug/crew-probe.mjs):
//  (a) every view, bob phase and contributor colour: one connected silhouette (no gaps or
//      floating parts), only BLK 36 crew colours + the space background, not clipped
//  (b) the shoulder rings carry the contributor colour: against a control build whose ring
//      region is gear, the only pixels that change are on the rings, accent -> gear
// Both fail on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapPalette } from '../palette-map.js';
import { openCrewProbe, tileStats, VIEWS, SPACE } from '../debug/crew-probe.mjs';

const W = 100, H = 128;
const blk = mapPalette('blk-36'); // the 'final' palette's crew roles are BLK 36 exactly
const toInt = (h) => parseInt(h.slice(1), 16);
const ramp = (hexes) => new Set(hexes.map(toInt));
const allowed = (color) => ramp([...blk.suit, ...blk.gear, ...blk.visor, blk.glint, ...blk.contributors[color], SPACE]);
const show = (c) => `#${c.toString(16).padStart(6, '0')}`;

test('crew at 180p: one connected silhouette, BLK 36 + space only, unclipped', { timeout: 240000 }, async () => {
  const { browser, probe } = await openCrewProbe();
  try {
    const cells = [];
    for (const [view, yaw] of Object.entries(VIEWS)) for (const t of [0, 1.5, 4.5]) for (const [color, eyes] of [['coral', 2], ['mint', 0], ['lilac', 9]]) cells.push({ view, yaw, t, color, eyes });
    const tiles = await probe(cells, W, H);
    for (const [i, c] of cells.entries()) {
      const s = tileStats(tiles[i], W, H);
      const where = `${c.view} t=${c.t} ${c.color}`;
      assert.ok(s.px > 3000, `${where}: empty or tiny figure (${s.px} px)`);
      assert.equal(s.pieces, 1, `${where}: silhouette in ${s.pieces} pieces`);
      assert.ok(!s.clipped, `${where}: figure touches the tile edge`);
      const ok = allowed(c.color);
      const stray = [...s.colours.keys()].filter((k) => !ok.has(k));
      assert.deepEqual(stray.map(show), [], `${where}: colours outside BLK 36 + space`);
    }
  } finally {
    await browser.close();
  }
});

test('crew: the shoulder rings carry the contributor colour', { timeout: 240000 }, async () => {
  const GUARD = 'if (part == 5) return 2;';
  assert.ok((await readFile(new URL('../astronaut.js', import.meta.url), 'utf8')).includes(GUARD), 'region() changed; update the control patch');
  const CONTROL = (src) => src.replace('${ASTRO_SDF_GLSL}', `\${ASTRO_SDF_GLSL.replace('${GUARD}', 'if (part == 5) return 1;')}`);
  const cells = [{ yaw: VIEWS.front, t: 0 }, { yaw: VIEWS['3/4'], t: 0 }].map((c) => ({ ...c, color: 'coral', eyes: 0 }));
  const runs = [];
  for (const patch of [undefined, CONTROL]) {
    const { browser, probe } = await openCrewProbe({ patch });
    try {
      runs.push(await probe(cells, W, H));
    } finally {
      await browser.close();
    }
  }
  const accent = ramp(blk.contributors.coral), gear = ramp(blk.gear);
  for (const [i, c] of cells.entries()) {
    const [on, off] = [runs[0][i], runs[1][i]];
    assert.ok(tileStats(on, W, H).px > 3000, `yaw ${c.yaw}: empty render`);
    let changed = 0;
    for (let k = 0; k < on.length; k += 4) {
      const a = (on[k] << 16) | (on[k + 1] << 8) | on[k + 2], b = (off[k] << 16) | (off[k + 1] << 8) | off[k + 2];
      if (a === b) continue;
      changed++;
      assert.ok(accent.has(a) && gear.has(b), `yaw ${c.yaw}: pixel ${k / 4} changed ${show(b)} -> ${show(a)}, not gear -> accent`);
    }
    assert.ok(changed >= 30, `yaw ${c.yaw}: only ${changed} shoulder-ring pixels in the contributor colour`);
    console.log(`yaw ${c.yaw.toFixed(2)}: ${changed} shoulder-ring pixels in the contributor colour`);
  }
});
