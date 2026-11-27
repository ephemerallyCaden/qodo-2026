// Captain's log beacons on the real view (#79, R10): the beacon view reaches the hook as
// `RenderInput.beacons`. Without beacons a frame is exactly what it was before them (no extra draw
// call, not a pixel changed); with one, a single draw call adds a lamp-on-a-mast marker of BEACON_MARK
// internal px standing just above its planet's disc, in the crew's BLK 36 colours only, never faded
// or blended, and it moves with the planet as it orbits (#60). Every frame fails when blank.
import { expect, test } from '@playwright/test';
import type { Beacon, BeaconView } from '../../src/core/contract/beacons.js';
import { palette } from '../../src/core/palette.js';
import { fovOf, project, projectedRadius, startPose } from '../../web/src/camera/pose.js';
import { ORBIT_FRAMES } from '../../web/src/model/motion.js';
import { CORONA } from '../../web/src/model/star.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { BEACON_MARK, BEACON_SHAPE } from '../../web/src/render/beacons.js';
import { assertRendered, diffPixels, hex, LOW_RES, rgbaAt, type Frame } from './frame.js';
import { MINI, MINI_INPUT, openView, render, systemView } from './harness.js';
import { paletteProblems } from './twin.js';

const model = systemModel(MINI);
const HEAD = MINI.source.head;
const pose = startPose(model);
/** The marker's own colours: lamp rim, lamp core, mast. */
const MARK_COLOURS = new Set<string>([palette.crew.suit[1], palette.crew.glint, palette.crew.gear[3]]);
const MARK_PIXELS = BEACON_SHAPE.join('').replace(/\./g, '').length;

const beacons = (homes: string[], head = HEAD): BeaconView => ({ schemaVersion: 'beacons.1', head, unplaced: 0,
  beacons: homes.map((home, i) => ({ fileId: `f_${String(i).padStart(12, '0')}`, path: `p/${i}.ts`, home: home as Beacon['home'], at: head, text: `note ${i}` })) });

/** The pixels that changed between two frames: how many, their colours and their bounding box (internal px, row 0 at the top). */
function changed(a: Frame, b: Frame) {
  const colours = new Set<string>();
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      if (rgbaAt(a.rgba, i) === rgbaAt(b.rgba, i)) continue;
      n++;
      colours.add(hex(rgbaAt(b.rgba, i)));
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  return { n, colours, box: { x0, y0, x1, y1 } };
}

/** A body's disc on the low-res frame from the start pose: its centre and radius in internal px. */
function disc(centre: [number, number, number], radius: number) {
  const p = project(pose, centre)!;
  return { x: ((p.x + 1) / 2) * LOW_RES.width, y: ((1 - p.y) / 2) * LOW_RES.height, r: projectedRadius(radius, p.depth, fovOf(pose)) * (LOW_RES.height / 2) };
}

/** Checks a marker's box against the disc it stands on: centred over it, its bottom BEACON_MARK.gap px above the disc's top (±1 px for the pixel snap). */
function standsOn(box: { x0: number; y0: number; x1: number; y1: number }, d: { x: number; y: number; r: number }) {
  const mid = (box.x0 + box.x1 + 1) / 2;
  const bottom = box.y1 + 1; // the row under the marker's last
  expect(box.x1 - box.x0 + 1).toBeLessThanOrEqual(BEACON_MARK.size);
  expect(box.y1 - box.y0 + 1).toBe(BEACON_MARK.size);
  expect(Math.abs(mid - d.x), `marker centre ${mid} vs disc centre ${d.x.toFixed(1)}`).toBeLessThanOrEqual(1);
  expect(Math.abs(bottom - (d.y - d.r - BEACON_MARK.gap)), `marker bottom ${bottom} vs disc top ${(d.y - d.r).toFixed(1)}`).toBeLessThanOrEqual(1.5);
}

test.describe('beacons (#79)', () => {
  test('no beacons draws exactly the frame it drew before: no draw call, no pixel', async ({ page }) => {
    const view = await openView(page, systemView());
    const [bare] = await render(view, MINI_INPUT, [0]);
    const [none] = await render(view, { ...MINI_INPUT, beacons: null }, [0]);
    const [empty] = await render(view, { ...MINI_INPUT, beacons: beacons([]) }, [0]);
    assertRendered(bare!.pixels, bare!.stats, LOW_RES);
    for (const r of [none!, empty!]) {
      expect(diffPixels(bare!.pixels, r.pixels, 0)).toBe(0);
      expect(r.stats.drawCalls).toBe(bare!.stats.drawCalls);
    }
    expect(view.errors).toEqual([]);
  });

  test('a beacon is one draw call: a lamp on a 2 px mast just above its planet, in BLK 36 crew colours only', async ({ page }) => {
    const view = await openView(page, systemView());
    const p = model.planets[0]!;
    for (const depthFade of [false, true]) {
      const [bare] = await render(view, { ...MINI_INPUT, depthFade }, [0]);
      const [lit] = await render(view, { ...MINI_INPUT, depthFade, beacons: beacons([p.dirId, p.dirId]) }, [0]);
      assertRendered(lit!.pixels, lit!.stats, LOW_RES);
      expect(lit!.stats.drawCalls - bare!.stats.drawCalls, 'one draw call for every beacon').toBe(1);
      const c = changed(bare!.pixels, lit!.pixels);
      console.log(`beacon on ${p.path} (depth fade ${depthFade}): ${c.n} px changed in ${JSON.stringify(c.box)}, colours ${[...c.colours].join(' ')}`);
      // Two notes, one marker: the marker's own pixels, nothing else changed, never faded or blended.
      expect(c.n).toBe(MARK_PIXELS);
      expect([...c.colours].filter((x) => !MARK_COLOURS.has(x))).toEqual([]);
      expect(c.colours.size).toBe(MARK_COLOURS.size);
      standsOn(c.box, disc(planetCentre(p, 0), p.radius));
      if (!depthFade) expect(paletteProblems(lit!.pixels)).toEqual([]);
    }
    expect(view.errors).toEqual([]);
  });

  test('a star beacon stands above the corona', async ({ page }) => {
    const view = await openView(page, systemView());
    const [bare] = await render(view, MINI_INPUT, [0]);
    const [lit] = await render(view, { ...MINI_INPUT, beacons: beacons(['star']) }, [0]);
    const c = changed(bare!.pixels, lit!.pixels);
    expect(c.n).toBe(MARK_PIXELS);
    standsOn(c.box, disc([0, 0, 0], model.star.radius * CORONA.reach));
  });

  test('it moves with its planet as the planet orbits, and frame n is a pure function of (input, n)', async ({ page }) => {
    const view = await openView(page, systemView());
    const p = model.planets[0]!;
    const later = ORBIT_FRAMES / 8; // an eighth of an orbit: 90 s on
    const frames = [0, later, 0];
    const bare = await render(view, MINI_INPUT, frames);
    const lit = await render(view, { ...MINI_INPUT, beacons: beacons([p.dirId]) }, frames);
    expect(diffPixels(lit[0]!.pixels, lit[2]!.pixels, 0)).toBe(0);
    const m0 = changed(bare[0]!.pixels, lit[0]!.pixels), m1 = changed(bare[1]!.pixels, lit[1]!.pixels);
    const d0 = disc(planetCentre(p, 0), p.radius), d1 = disc(planetCentre(p, later), p.radius);
    console.log(`planet ${p.path} moved ${(d1.x - d0.x).toFixed(1)}, ${(d1.y - d0.y).toFixed(1)} px from frame 0 to ${later}; its marker from ${JSON.stringify(m0.box)} to ${JSON.stringify(m1.box)}`);
    expect(Math.hypot(d1.x - d0.x, d1.y - d0.y), 'the planet moved enough to tell').toBeGreaterThan(10);
    for (const r of [...bare, ...lit]) assertRendered(r.pixels, r.stats, LOW_RES);
    standsOn(m0.box, d0);
    standsOn(m1.box, d1);
    expect(view.errors).toEqual([]);
  });

  test("refuses beacons of another scan's head, and a bad note, as the live view does", async ({ page }) => {
    const view = await openView(page, systemView());
    await expect(render(view, { ...MINI_INPUT, beacons: beacons([model.planets[0]!.dirId], 'f'.repeat(40)) }, [0])).rejects.toThrow(/different scans/);
    const bad = beacons([model.planets[0]!.dirId]);
    bad.beacons[0]!.text = 'two\nlines';
    await expect(render(view, { ...MINI_INPUT, beacons: bad }, [0])).rejects.toThrow(/invalid beacons/);
  });
});
