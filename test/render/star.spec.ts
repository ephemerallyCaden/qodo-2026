// The star on the real view (#81, docs/features/star-art.md S1–S5): the Day 1 GIF's sun, ported from
// the asset viewer's star.js. With the depth fade off it draws only its own palette roles
// (world.starDisc, world.starCorona; never teal), core at the centre and each band further out, with a
// flat, lumpy corona past the limb; frame 720 (one 24 s loop) is frame 0 and the seam is no bigger
// than any other step; reduced motion holds it; far away it fades at 0.15 (S5); fog never covers it
// (#74); its moonlets wear the planets' moon look (S6); and a drone (#80) still draws in front of it.
// Every check fails on an empty frame.
import { expect, test } from '@playwright/test';
import { palette } from '../../src/core/palette.js';
import type { CameraPose, RenderInput } from '../../src/core/contract/api.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { framingDistance, projectedRadius, toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { placeDrone } from '../../web/src/drones/place.js';
import { LOOP_FRAMES } from '../../web/src/model/motion.js';
import { frameWidth } from '../../web/src/model/pixels.js';
import { systemModel } from '../../web/src/model/system.js';
import { droneView, session } from '../fixtures/drones.js';
import { assertRendered, diffPixels, hex, LOW_RES, rgbaAt, statsProblems, type Frame } from './frame.js';
import type { Rendered } from './harness.js';
import { fogFor, MINI, MINI_FOG, openView, render, systemView } from './harness.js';
import { paletteProblems } from './twin.js';

/** The star alone: mini without planets or moonlets (the dev `empty` fixture). */
const ALONE: LayoutV1 = { ...MINI, planets: [], star: { ...MINI.star, moonlets: [] } };
const DISC: readonly string[] = palette.world.starDisc; // limb → core
const CORONA: readonly string[] = palette.world.starCorona; // crown, halo
const STAR_COLOURS: readonly string[] = [...new Set([...DISC, ...CORONA])]; // the limb and the crown share the glow rim
const BACKDROP: readonly string[] = [palette.world.space, ...palette.world.stars];
/** The star's depth-fade strength (S5, decided 2026-11-11). */
const STAR_FADE = 0.15;

/** A camera on the star, `dist` out, a little above and to the side (the asset viewer's star view line). */
const onStar = (dist: number): OrbitPose => ({ target: [0, 0, 0], yaw: 0.28, pitch: 0.16, dist });
const starRadius = (l: LayoutV1) => systemModel(l).star.radius;
/** The star framed like a focused planet (45% of the frame height). */
const close = (l: LayoutV1) => onStar(framingDistance(starRadius(l), 0.45));
const cam = (p: OrbitPose): CameraPose => toCameraPose(p);

const colours = (f: Frame) => Array.from({ length: f.width * f.height }, (_, i) => hex(rgbaAt(f.rgba, i * 4)));
const count = (px: readonly string[], set: readonly string[]) => px.filter((h) => set.includes(h)).length;
/** Distance of pixel i's centre from the frame centre (where the star is). */
const radiusOf = (f: Frame, i: number) => Math.hypot((i % f.width) + 0.5 - f.width / 2, Math.floor(i / f.width) + 0.5 - f.height / 2);
function meanRadius(f: Frame, px: readonly string[], colour: string): number {
  let s = 0, n = 0;
  px.forEach((h, i) => { if (h === colour) { s += radiusOf(f, i); n++; } });
  return n ? s / n : NaN;
}
/** The star's disc radius on screen, internal px, for a camera `dist` from it. */
const discPx = (l: LayoutV1, dist: number, height: number = LOW_RES.height) => projectedRadius(starRadius(l), dist) * (height / 2);
/**
 * The star alone isn't blank: within budget, every disc and corona colour drawn, and at least 80% of
 * its disc's area in star colours. (It draws 6 colours, so the fixtures' 12-colour floor can't apply.)
 */
function assertStar(r: Rendered, l: LayoutV1, dist: number): void {
  expect(statsProblems(r.stats, r.pixels)).toEqual([]);
  const px = colours(r.pixels);
  expect(STAR_COLOURS.filter((h) => !px.includes(h)), `frame ${r.frame}: star colours missing`).toEqual([]);
  expect(count(px, STAR_COLOURS), `frame ${r.frame}: star px`).toBeGreaterThan(Math.PI * discPx(l, dist, r.pixels.height) ** 2 * 0.8);
}

test.describe('the star (#81)', () => {
  test('S1–S3: a banded disc, core at the centre, a flat lumpy corona past the limb, in the star\'s palette roles only', async ({ page }) => {
    const view = await openView(page, systemView());
    const pose = close(ALONE);
    const [r] = await render(view, { layout: ALONE, camera: cam(pose), depthFade: false }, [0]);
    const f = r!.pixels;
    expect([f.width, f.height]).toEqual([LOW_RES.width, LOW_RES.height]);
    assertStar(r!, ALONE, pose.dist);
    expect(paletteProblems(f)).toEqual([]);
    const px = colours(f);
    expect([...new Set(px.filter((h) => !BACKDROP.includes(h) && !STAR_COLOURS.includes(h)))], 'colours outside the star\'s roles (teal is never on the star)').toEqual([]);
    expect(px[(f.height / 2) * f.width + f.width / 2], 'the centre is the cream-white core').toBe(DISC[4]);

    // limb darkening: core, cream, yellow, orange, red-orange (limb and crown), then the dark-red halo, each further out
    const order = [...DISC].reverse().concat(CORONA[1]!).map((h) => meanRadius(f, px, h));
    const disc = discPx(ALONE, pose.dist);
    console.log(`star: disc ${disc.toFixed(1)} px; band radii (core → halo) ${order.map((x) => x.toFixed(1)).join(' ')}; px per band ${[...DISC].reverse().concat(CORONA[1]!).map((h) => count(px, [h])).join(' ')}`);
    order.slice(1).forEach((x, i) => expect(x, `band ${i + 1} sits outside band ${i}`).toBeGreaterThan(order[i]!));

    // the corona: past the limb all round, with a lumpy edge, never past its span, in flat bands (no dithering)
    const edge = Array.from({ length: 72 }, (_, k) => {
      const a = (k / 72) * Math.PI * 2;
      let last = 0;
      for (let d = 0; d < 80; d += 0.5) {
        const x = Math.floor(f.width / 2 + Math.cos(a) * d), y = Math.floor(f.height / 2 + Math.sin(a) * d);
        if (STAR_COLOURS.includes(px[y * f.width + x]!)) last = d;
      }
      return last;
    });
    const reach = edge.map((e) => e - disc);
    console.log(`corona reach past the disc: ${Math.min(...reach).toFixed(1)}–${Math.max(...reach).toFixed(1)} px`);
    expect(Math.min(...reach), 'the corona reaches past the disc all round').toBeGreaterThanOrEqual(2);
    expect(Math.max(...reach) - Math.min(...reach), 'the corona\'s edge is lumpy').toBeGreaterThanOrEqual(2.5);
    expect(Math.max(...edge), 'nothing is drawn past the corona\'s span').toBeLessThanOrEqual(disc * 1.4 + 1);
    const halo = px.flatMap((h, i) => (h === CORONA[1] ? [radiusOf(f, i)] : []));
    expect(Math.min(...halo), 'the halo is only past the limb').toBeGreaterThan(disc - 1);
    const lone = px.filter((h, i) => CORONA.includes(h) && [-1, 1, -f.width, f.width].every((o) => px[i + o] !== h)).length;
    expect(lone / count(px, CORONA), 'lone corona pixels (dithering)').toBeLessThan(0.02);
    expect(view.errors).toEqual([]);
  });

  test('S4: loop-locked: frame 720 is frame 0, the seam is no bigger than a step, and the surface churns', async ({ page }) => {
    const view = await openView(page, systemView());
    const step = 15;
    const frames = Array.from({ length: LOOP_FRAMES / step + 1 }, (_, i) => i * step); // 0, 15, ... 720
    const pose = close(ALONE);
    const input: RenderInput = { layout: ALONE, camera: cam(pose), depthFade: false };
    const rs = await render(view, input, [...frames, 2 * LOOP_FRAMES]);
    for (const r of rs) assertStar(r, ALONE, pose.dist);
    const at = (n: number) => rs.find((r) => r.frame === n)!.pixels;
    expect(LOOP_FRAMES).toBe(720);
    expect(diffPixels(at(0), at(720)), 'frame 720 vs frame 0').toBe(0);
    expect(diffPixels(at(0), at(1440)), 'frame 1440 vs frame 0').toBe(0);
    const steps = frames.slice(1, -1).map((n) => diffPixels(at(n - step), at(n)));
    const seam = diffPixels(at(720 - step), at(720));
    const median = [...steps].sort((a, b) => a - b)[steps.length >> 1]!;
    console.log(`star loop: seam (frame ${720 - step} → 720) ${seam} px vs median ${step}-frame step ${median} px; frame 360 vs 0: ${diffPixels(at(0), at(360))} px`);
    expect(median, 'the star moves over the loop').toBeGreaterThan(0);
    expect(seam, 'the seam is no bigger than a step').toBeLessThanOrEqual(median * 1.5);
    expect(diffPixels(at(0), at(360)), 'half a loop later the granulation has moved').toBeGreaterThan(200);
    expect(view.errors).toEqual([]);
  });

  test('reduced motion holds the star on frame 0', async ({ page }) => {
    const view = await openView(page, systemView());
    const pose = close(ALONE);
    const input: RenderInput = { layout: ALONE, camera: cam(pose), depthFade: false };
    const still = await render(view, { ...input, reducedMotion: true }, [0, 180, 360]);
    const moving = await render(view, input, [0, 360]);
    for (const r of [...still, ...moving]) assertStar(r, ALONE, pose.dist);
    for (const r of still) expect(diffPixels(r.pixels, moving[0]!.pixels), `reduced motion, frame ${r.frame} vs frame 0`).toBe(0);
    expect(diffPixels(moving[1]!.pixels, moving[0]!.pixels), 'without reduced motion frame 360 has moved').toBeGreaterThan(200);
    expect(view.errors).toEqual([]);
  });

  test('from inside the star (free flight can enter it) the core is ahead and the frame is all star', async ({ page }) => {
    const view = await openView(page, systemView());
    const pose = onStar(starRadius(ALONE) * 0.5); // halfway from the centre to the surface, looking at the centre
    const [r] = await render(view, { layout: ALONE, camera: cam(pose), depthFade: false }, [0]);
    const f = r!.pixels;
    expect(statsProblems(r!.stats, f)).toEqual([]);
    const px = colours(f);
    const hot: readonly string[] = DISC.slice(3); // cream and the cream-white core
    console.log(`inside the star: ${count(px, DISC)} of ${px.length} px in disc colours, ${count(px, hot)} cream or core`);
    expect(count(px, DISC), 'every pixel is the star').toBe(px.length);
    expect(hot, 'straight ahead is the hot core').toContain(px[(f.height / 2) * f.width + f.width / 2]);
    expect(count(px, hot), 'mostly hot: the far side seen from inside is near its centre').toBeGreaterThan(px.length / 2);
    expect(view.errors).toEqual([]);
  });

  test('S5: far away it fades at 0.15, so its core stays lighter than lava\'s hottest glow', async ({ page }) => {
    const view = await openView(page, systemView());
    const height = 360, dist = 60; // past the fade's last step (44 units): the full 0.88 toward its last tint
    const [r] = await render(view, { layout: ALONE, camera: cam(onStar(dist)), pixelHeight: height }, [0]);
    const f = r!.pixels;
    expect([f.width, f.height]).toEqual([frameWidth(height), height]);
    const body = colours(f).filter((h) => !BACKDROP.includes(h));
    const last = palette.world.depth.at(-1)!;
    const mix = (c: string, k: number) => [0, 1, 2].map((i) => {
      const ch = (h: string) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
      return Math.round(ch(c) + (ch(last.tint) - ch(c)) * k);
    });
    const faded = STAR_COLOURS.map((c) => mix(c, last.strength * STAR_FADE));
    const near = (h: string, rgb: number[]) => rgb.every((v, i) => Math.abs(parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16) - v) <= 2);
    console.log(`star at ${dist} units: ${body.length} px; expected ${STAR_COLOURS.length} colours ${last.strength} × ${STAR_FADE} toward ${last.tint}`);
    expect(body.length, 'the far star drew').toBeGreaterThan(Math.PI * discPx(ALONE, dist, height) ** 2 * 0.8);
    expect([...new Set(body.filter((h) => !faded.some((rgb) => near(h, rgb))))], `colours not ${last.strength * STAR_FADE} toward ${last.tint}`).toEqual([]);
    expect(body.some((h) => near(h, faded[4]!)), 'the faded core is there').toBe(true);
    const okL = (rgb: number[]) => {
      const lin = rgb.map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const [l, m, s] = [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]]
        .map((w) => Math.cbrt(w[0]! * lin[0]! + w[1]! * lin[1]! + w[2]! * lin[2]!));
      return 0.2104542553 * l! + 0.793617785 * m! - 0.0040720468 * s!;
    };
    const hottest = palette.world.glow[2];
    expect(okL(faded[4]!), `the fully faded core vs lava's hottest glow ${hottest} unfaded`).toBeGreaterThan(okL(mix(hottest, 0)));
    expect(view.errors).toEqual([]);
  });

  test('fog never covers the star (#74): all fogged and all clear draw the same star; its moonlets wear the moon look (S6)', async ({ page }) => {
    const view = await openView(page, systemView());
    const pose = close(MINI);
    const input: RenderInput = { layout: MINI, camera: cam(pose), depthFade: false };
    const [fogged] = await render(view, { ...input, fog: null }, [0]);
    const [clear] = await render(view, { ...input, fog: fogFor(MINI) }, [0]);
    const [mini] = await render(view, { ...input, fog: MINI_FOG }, [0]);
    for (const r of [fogged!, clear!, mini!]) assertRendered(r.pixels, r.stats, LOW_RES);
    const a = colours(fogged!.pixels), b = colours(clear!.pixels), c = colours(mini!.pixels);
    // Within the star's span on screen (planets elsewhere share the glow, sand and cloud colours).
    const span = discPx(MINI, pose.dist) * 1.4 + 1;
    const changed = (x: readonly string[], y: readonly string[]) => x.flatMap((h, i) =>
      (h !== y[i] && radiusOf(fogged!.pixels, i) <= span && (STAR_COLOURS.includes(h) || STAR_COLOURS.includes(y[i]!)) ? [i] : []));
    console.log(`star px: ${count(a, STAR_COLOURS)}; fog changed ${diffPixels(fogged!.pixels, clear!.pixels)} px of the frame, ${changed(a, b).length} of them star-coloured`);
    expect(count(a, STAR_COLOURS)).toBeGreaterThan(3000);
    expect(diffPixels(fogged!.pixels, clear!.pixels), 'not vacuous: the fog changed the moonlets').toBeGreaterThan(0);
    expect(changed(a, b), 'star pixels changed with the fog').toEqual([]);
    expect(changed(a, c)).toEqual([]);
    // S6: its moonlets wear the planets' test-moon look (warm peach), never the grey regolith ramp
    const grey: readonly string[] = palette.world.moon, peach: readonly string[] = palette.world.moonBody;
    const inSpan = (px: readonly string[], set: readonly string[]) => px.filter((h, i) => set.includes(h) && radiusOf(clear!.pixels, i) <= discPx(MINI, pose.dist) * 2).length;
    console.log(`moonlets (all clear): ${inSpan(b, peach)} px warm peach, ${count(b, grey)} px grey regolith`);
    expect(inSpan(b, peach), 'moonlets in the moon look').toBeGreaterThan(20);
    expect(count(b, grey), 'grey regolith moonlets').toBe(0);
    expect(view.errors).toEqual([]);
  });

  test('a drone at the star (#80) draws in front of it, in palette colours', async ({ page }) => {
    const view = await openView(page, systemView());
    const s = session(2, 'star');
    const model = systemModel(MINI);
    const at = placeDrone(model, 'star', s.seed, 0)!;
    // from just outside the drone's orbit, looking back past it at the star
    const out: [number, number, number] = [Math.sin(at.yaw), 0, Math.cos(at.yaw)];
    const pose: OrbitPose = { target: at.centre, yaw: Math.atan2(out[0], out[2]), pitch: 0.15, dist: 1.6 };
    const input: RenderInput = { layout: MINI, fog: MINI_FOG, camera: cam(pose), depthFade: false };
    const [bare] = await render(view, input, [0]);
    const [withDrone] = await render(view, { ...input, drones: droneView(MINI.source.head, [s]) }, [0]);
    for (const r of [bare!, withDrone!]) {
      assertRendered(r.pixels, r.stats, LOW_RES, 0.02);
      expect(paletteProblems(r.pixels)).toEqual([]);
    }
    const before = colours(bare!.pixels), after = colours(withDrone!.pixels);
    const overStar = after.filter((h, i) => h !== before[i] && STAR_COLOURS.includes(before[i]!)).length;
    console.log(`drone at the star: ${diffPixels(bare!.pixels, withDrone!.pixels)} px changed, ${overStar} of them over the star (${count(before, STAR_COLOURS)} star px)`);
    expect(count(before, STAR_COLOURS), 'the star is behind the drone').toBeGreaterThan(1000);
    expect(overStar, 'the drone draws over the star').toBeGreaterThan(50);
    expect(view.errors).toEqual([]);
  });
});
