// Slow orbits on the real view (#60; human, 2026-11-10): planets turn round the star once per
// ORBIT_FRAMES (12 minutes since #174), off the 48 s loop, so these tests pin the frames they compare
// instead of assuming frame LOOP_FRAMES is frame 0. From a fixed camera, one loop on only the orbits have
// moved (every other layer is loop-locked) and one orbit on (15 loops) the frame is frame 0 again; with
// the camera following a planet as focus does, that planet draws the same pixels one loop on while the
// rest of the system turns past it; reduced motion holds the orbits on frame 0. Every frame fails when blank.
import { expect, test } from '@playwright/test';
import { project, projectedRadius, fromCameraPose } from '../../web/src/camera/pose.js';
import { LOOP_FRAMES, ORBIT_FRAMES } from '../../web/src/model/motion.js';
import { planetCentre, planetReach, systemModel } from '../../web/src/model/system.js';
import { assertRendered, diffPixels, LOW_RES, type Frame } from './frame.js';
import { following, MINI, MINI_INPUT, openView, render, systemView } from './harness.js';

/**
 * How far round its orbit (in frames) a followed src stays clear of the star: by 48° the star is still out of
 * its reach on screen, by 57.6° it has turned into view behind src's moons (measured: 3 of the 24 s loops, 43.2°,
 * were clear and the fourth was not; 2 of #174's 48 s loops, 48°, are clear and the third, 72°, is not).
 */
const SRC_CLEAR_OF_STAR = (ORBIT_FRAMES * 48) / 360;

const model = systemModel(MINI);

/** Pixels that differ between two frames inside (or outside) a circle in internal px. */
function diffIn(a: Frame, b: Frame, centre: [number, number], radius: number, inside: boolean): number {
  let n = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if ((Math.hypot(x + 0.5 - centre[0], y + 0.5 - centre[1]) <= radius) !== inside) continue;
      const i = (y * a.width + x) * 4;
      if ([0, 1, 2, 3].some((k) => a.rgba[i + k] !== b.rgba[i + k])) n++;
    }
  }
  return n;
}

test.describe('slow orbits (#60)', () => {
  test('from a fixed camera, one loop on only the orbits have moved, and one orbit on (15 loops) is frame 0 again', async ({ page }) => {
    const view = await openView(page, systemView());
    const rs = await render(view, { ...MINI_INPUT }, [0, LOOP_FRAMES, ORBIT_FRAMES, ORBIT_FRAMES / 2, 0]);
    for (const r of rs) assertRendered(r.pixels, r.stats, LOW_RES);
    const [f0, loop, orbit, half, again] = rs.map((r) => r.pixels);
    const moved = diffPixels(f0!, loop!), turned = diffPixels(f0!, half!);
    console.log(`orbits, fixed start-pose camera: frame ${LOOP_FRAMES} differs from 0 by ${moved} px, frame ${ORBIT_FRAMES / 2} by ${turned} px, frame ${ORBIT_FRAMES} by ${diffPixels(f0!, orbit!)} px`);
    expect(moved, `frame ${LOOP_FRAMES} is no longer frame 0: the planets have moved`).toBeGreaterThan(0);
    expect(turned, 'half an orbit on, the planets are elsewhere').toBeGreaterThan(moved);
    expect(diffPixels(f0!, orbit!), `frame ${ORBIT_FRAMES} (one orbit, ${ORBIT_FRAMES / LOOP_FRAMES} loops) is frame 0`).toBe(0);
    expect(diffPixels(f0!, again!), 'frame 0 again after the others').toBe(0);
    expect(view.errors).toEqual([]);
  });

  test('focus follows the planet: with the camera following it, the planet draws the same pixels on every whole loop until the star turns into view, while the system turns past it', async ({ page }) => {
    // Pixel-stable because the scene is drawn relative to the camera's target (render/scene.ts): before that, float32
    // rounding at the planet's absolute position flipped single pixels, and the fog anchor at the frame's centre jumped a
    // pixel (283 px of web at frame 1440, on the 24 s loop). The loops stop where the star turns into view behind src's moons.
    const view = await openView(page, systemView());
    const loops = [1, 2, 3].map((k) => k * LOOP_FRAMES).filter((n) => n <= SRC_CLEAR_OF_STAR);
    expect(loops.length, 'more than one whole loop to compare').toBeGreaterThanOrEqual(2);
    const around: Record<string, number> = {};
    for (const path of ['src', 'web']) {
      const p = model.planets.find((x) => x.path === path)!;
      const followed = async (n: number) => (await render(view, { ...MINI_INPUT, camera: following(model, path, n) }, [n]))[0]!;
      const a = await followed(0);
      const [still] = await render(view, { ...MINI_INPUT, camera: following(model, path, 0) }, [LOOP_FRAMES]); // the camera left at frame 0
      // the planet and its moons: their reach on screen, round the frame's centre where the focus puts them
      const pose = fromCameraPose(following(model, path, LOOP_FRAMES));
      const q = project(pose, planetCentre(p, LOOP_FRAMES))!;
      const centre: [number, number] = [((q.x + 1) / 2) * LOW_RES.width, ((1 - q.y) / 2) * LOW_RES.height];
      const reach = projectedRadius(planetReach(p), q.depth) * (LOW_RES.height / 2) + 2;
      const held: number[] = [];
      for (const n of loops) {
        const b = await followed(n);
        assertRendered(b.pixels, b.stats, LOW_RES);
        held.push(diffIn(a.pixels, b.pixels, centre, reach, true));
        if (n === LOOP_FRAMES) around[path] = diffIn(a.pixels, b.pixels, centre, reach, false);
      }
      for (const r of [a, still!]) assertRendered(r.pixels, r.stats, LOW_RES);
      const left = diffIn(a.pixels, still!.pixels, centre, reach, true);
      console.log(`${path} followed: centre (${centre.map((v) => v.toFixed(1)).join(', ')}), reach ${reach.toFixed(1)} px; frames ${loops.join(', ')} vs 0: ${held.join(', ')} px differ on the planet, ${around[path]} px around it one loop on; camera left at frame 0: ${left} px differ on the planet`);
      expect(Math.hypot(centre[0] - LOW_RES.width / 2, centre[1] - LOW_RES.height / 2), `${path} is centred`).toBeLessThan(0.5);
      expect(held, `${path} followed: the same pixels at frames ${loops.join(', ')}`).toEqual(loops.map(() => 0));
      expect(left, `${path} not followed: it has moved off the centre`).toBeGreaterThan(0);
    }
    // src orbits next to the star, which is in its frame: the system has turned past it (web's moons fill its frame)
    expect(around['src'], 'around the followed src, the star has moved').toBeGreaterThan(0);
    expect(view.errors).toEqual([]);
  });

  test('reduced motion holds the orbits on frame 0, whatever the frame', async ({ page }) => {
    const view = await openView(page, systemView());
    const [moving] = await render(view, { ...MINI_INPUT }, [0]);
    const still = await render(view, { ...MINI_INPUT, reducedMotion: true }, [LOOP_FRAMES, ORBIT_FRAMES / 2, 123_457]);
    for (const r of [moving!, ...still]) assertRendered(r.pixels, r.stats, LOW_RES);
    for (const r of still) expect(diffPixels(r.pixels, moving!.pixels), `reduced motion, frame ${r.frame} vs frame 0`).toBe(0);
    expect(view.errors).toEqual([]);
  });
});
