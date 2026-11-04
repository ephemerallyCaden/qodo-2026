// Ring width and distance (RING, ringLanes in viewer.js):
//  1. the thin preset is today's ring exactly (one lane, centre 1.8, half-width 0.11, 15 clusters)
//  2. over the slider range: >= 70% chunky 2x2 / plus particles, every particle inside the ring,
//     particle density follows ring area, moons move out with a far ring
//  3. rendered (no clouds, depth off): the ring draws (fails on empty output), its front arc is
//     drawn over the disc and its back arc is hidden, dust stays 1 px at 180p and 360p, and
//     the loop is seamless (t = 0 and t = one period render the same frame)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

const EXPOSE = (s) => `${s}\nwindow.__ring = { ringLanes, RING, RING_PRESETS, RING_DENSITY, MOON_GEO };`;
const BASE = { view: 'planet', biome: 'lush', seed: 7, size: 1, ringMode: 'thin', moons: false, cover: 0, depth: false, pixelH: 180, palette: 'final', spin: true, ui: false, halo: false, artefacts: false, period: 24, surfaceTurns: 2, cloudTurns: 3, time: 3 };
const SWEEP = [];
for (const ringWidth of [0.03, 0.22, 0.5, 0.72, 1.0]) for (const ringInner of [1.2, 1.69, 2.8]) SWEEP.push({ ringWidth, ringInner });

test('ring lanes: thin preset is the legacy ring; the sweep keeps chunky clumps, bounds and density', async () => {
  const { browser, page } = await openViewer({ patch: EXPOSE });
  try {
    const r = await page.evaluate(({ BASE, SWEEP }) => {
      const { ringLanes, RING_PRESETS, RING_DENSITY, MOON_GEO } = window.__ring;
      const { planets } = window.__dbg;
      const moonDist = () => planets[0].group.children.filter((o) => o.geometry === MOON_GEO).map((o) => o.position.length());
      const rows = SWEEP.map((g) => {
        window.viewer.set({ ...BASE, ...g, moons: true });
        const geo = planets[0].ring.geometry;
        const pos = geo.getAttribute('position'), type = geo.getAttribute('aType');
        let chunky = 0, out = 0;
        for (let i = 0; i < type.count; i++) {
          if (type.getX(i) > 0.5) chunky++;
          const rr = Math.hypot(pos.getX(i), pos.getZ(i));
          if (rr < g.ringInner - 1e-6 || rr > g.ringInner + g.ringWidth + 1e-6) out++;
        }
        const lanes = ringLanes({ inner: g.ringInner, width: g.ringWidth });
        const area = lanes.reduce((a, [c, h]) => a + (c + h) ** 2 - (c - h) ** 2, 0);
        const clusters = lanes.reduce((a, l) => a + l[2], 0);
        return { ...g, points: type.count, chunky: +(chunky / type.count).toFixed(3), out, lanes: lanes.length, clusters, expected: +(RING_DENSITY * area).toFixed(2), moons: moonDist() };
      });
      window.viewer.set({ ...BASE, moons: true, ringInner: 1.69, ringWidth: 0.22 });
      const moonDefault = moonDist();
      return { thin: ringLanes(RING_PRESETS.thin), wide: ringLanes(RING_PRESETS.wide), rows, moonDefault };
    }, { BASE, SWEEP });
    console.table(r.rows.map(({ moons, ...row }) => ({ ...row, moon1: +moons[0].toFixed(2) })));
    console.log('thin lanes', JSON.stringify(r.thin), 'wide lanes', JSON.stringify(r.wide));
    assert.equal(r.thin.length, 1);
    const [c, h, n] = r.thin[0];
    assert.ok(Math.abs(c - 1.8) < 1e-9 && Math.abs(h - 0.11) < 1e-9 && n === 15, 'thin preset is not the legacy ring');
    assert.ok(r.wide.length === 2 && Math.abs(r.wide[0][0] - 1.66) < 1e-9 && Math.abs(r.wide[1][0] - 2.12) < 1e-9, 'wide preset lost its two lanes');
    for (const row of r.rows) {
      assert.ok(row.points > 0, `empty ring at ${row.ringWidth}/${row.ringInner}`);
      assert.ok(row.chunky >= 0.7, `${row.ringWidth}/${row.ringInner}: only ${row.chunky} chunky`);
      assert.equal(row.out, 0, `${row.ringWidth}/${row.ringInner}: particles outside the ring`);
      // density follows area: whole clusters per lane (rounding), never fewer than 2 per lane
      assert.ok(Math.abs(row.clusters - row.expected) <= row.lanes || row.clusters === 2 * row.lanes, `${row.ringWidth}/${row.ringInner}: ${row.clusters} clusters for area ${row.expected}`);
      // moons scale out with the ring's distance past the thin preset, never in
      const k = Math.max(1, row.ringInner / 1.69);
      row.moons.forEach((d, i) => assert.ok(Math.abs(d - r.moonDefault[i] * k) < 1e-6, `${row.ringWidth}/${row.ringInner}: moon ${i} at ${d}`));
    }
  } finally {
    await browser.close();
  }
});

test('ring render: front arc over the disc, back arc hidden, 1 px dust, loop-locked, not empty', async () => {
  const { browser, page } = await openViewer({ patch: EXPOSE });
  try {
    const CASES = [{ ringWidth: 0.22, ringInner: 1.69 }, { ringWidth: 0.72, ringInner: 1.2 }, { ringWidth: 1.0, ringInner: 2.8 }, { ringWidth: 0.03, ringInner: 1.69 }];
    const rows = await page.evaluate(({ BASE, CASES }) => {
      const { THREE, planets, camera } = window.__dbg;
      const grab = () => {
        const src = document.getElementById('view');
        const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
        const x = c.getContext('2d');
        x.drawImage(src, 0, 0);
        return { W: src.width, H: src.height, d: x.getImageData(0, 0, src.width, src.height).data };
      };
      const out = [];
      for (const g of CASES) for (const pixelH of [180, 360]) {
        window.viewer.set({ ...BASE, ...g, pixelH, ringMode: 'off' });
        const off = grab();
        window.viewer.set({ ...BASE, ...g, pixelH, ringMode: 'thin', ringWidth: g.ringWidth, ringInner: g.ringInner });
        const on = grab();
        const { W, H } = on;
        const diff = new Uint8Array(W * H);
        let ringPx = 0;
        for (let i = 0; i < W * H; i++) if (on.d[i * 4] !== off.d[i * 4] || on.d[i * 4 + 1] !== off.d[i * 4 + 1] || on.d[i * 4 + 2] !== off.d[i * 4 + 2]) { diff[i] = 1; ringPx++; }
        // 1 px dust: diff components of exactly one pixel (8-connected)
        let single = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          if (!diff[y * W + x]) continue;
          let nb = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && diff[(y + dy) * W + x + dx]) nb++;
          if (!nb) single++;
        }
        // project every ring particle; inside the disc, front = nearer the camera than the centre
        const p = planets[0];
        const ring = p.ring, pos = ring.geometry.getAttribute('position');
        const centre = p.group.getWorldPosition(new THREE.Vector3());
        const camD = camera.position.distanceTo(centre);
        const toPx = (v) => { const q = v.clone().project(camera); return [Math.floor((q.x + 1) / 2 * W), Math.floor((1 - q.y) / 2 * H)]; };
        const [cx, cy] = toPx(centre);
        const edge = toPx(centre.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(p.group.scale.x)));
        const R = Math.hypot(edge[0] - cx, edge[1] - cy);
        const front = new Set(), back = new Set();
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(ring.matrixWorld);
          const [x, y] = toPx(v);
          if (Math.hypot(x - cx, y - cy) > R - 3 || x < 0 || y < 0 || x >= W || y >= H) continue;
          (v.distanceTo(camera.position) < camD ? front : back).add(y * W + x);
        }
        const near = (i) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (front.has(i + dy * W + dx)) return true; return false; };
        const frontHit = [...front].filter((i) => diff[i]).length;
        const backOnly = [...back].filter((i) => !near(i));
        const backShown = backOnly.filter((i) => diff[i]).length;
        // loop lock: t = 0 vs t = period, ring + moons + clouds on
        window.viewer.set({ ...BASE, ...g, pixelH, ringMode: 'thin', ringWidth: g.ringWidth, ringInner: g.ringInner, moons: true, cover: null, time: 0 });
        const a = document.getElementById('view').toDataURL();
        window.viewer.set({ time: 24 });
        const b = document.getElementById('view').toDataURL();
        out.push({ ...g, pixelH, ringPx, single, front: front.size, frontHit, backOnly: backOnly.length, backShown, loop: a === b });
      }
      return out;
    }, { BASE, CASES });
    console.table(rows);
    for (const r of rows) {
      const id = `${r.ringWidth}/${r.ringInner}@${r.pixelH}`;
      assert.ok(r.ringPx >= 30, `${id}: ring drew ${r.ringPx} px (empty)`);
      assert.ok(r.single > 0, `${id}: no 1 px dust`);
      if (r.front >= 5) assert.ok(r.frontHit / r.front >= 0.9, `${id}: front arc hidden (${r.frontHit}/${r.front})`);
      assert.equal(r.backShown, 0, `${id}: ${r.backShown} back-arc px drawn over the disc`);
      assert.ok(r.loop, `${id}: t = 0 and t = 24 s differ`);
    }
    assert.ok(rows.some((r) => r.front >= 5 && r.backOnly >= 5), 'no case crossed the disc front and back (test framing)');
  } finally {
    await browser.close();
  }
});
