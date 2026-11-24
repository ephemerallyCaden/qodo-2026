// Fog of war on the real view (#74, R5; D2d, docs/features/fog-of-war-art.md). The goldens
// (view.spec.ts) are fogged frames of mini; these check what a golden can't say on its own: haze
// (#201) is thin cloud between clear and fogged, fog without evidence covers everything (Rule 1), the veil and its
// limb are palette colours, teal shows only on events, the hatch drift closes the loop (on a planet
// followed along its orbit, #60), and fog costs no draw call or triangle.
import { expect, test } from '@playwright/test';
import type { FogView } from '../../src/core/contract/fog.js';
import { palette } from '../../src/core/palette.js';
import { focusPose, startPose, toCameraPose } from '../../web/src/camera/pose.js';
import { LOOP_FRAMES, ORBIT_FRAMES } from '../../web/src/model/motion.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { assertRendered, diffPixels } from './frame.js';
import { fogFor, following, MINI, MINI_FOG, MINI_INPUT, openView, render, systemView, type Rendered } from './harness.js';
import { LATER } from './suite.js';
import { paletteProblems } from './twin.js';

const model = systemModel(MINI);
/**
 * The hero framing of a mini planet by path, at 360 px: big enough to show parcels, hatching and the "?".
 * At frame `n` it has followed the planet along its orbit since frame 0, as focus does (#60).
 */
const focus = (path: string, n = 0) => ({ camera: following(model, path, n), pixelHeight: 360 });
/** The same framing, orbited by `dyaw` and `dpitch` radians: an oblique view, where smoke overlaps its neighbours. */
const oblique = (path: string, dyaw: number, dpitch: number) => {
  const p = model.planets.find((x) => x.path === path)!;
  const o = focusPose(startPose(model), planetCentre(p, 0), p.radius);
  return { camera: toCameraPose({ ...o, yaw: o.yaw + dyaw, pitch: o.pitch + dpitch }), pixelHeight: 360 };
};
const hex = (rgba: Uint8Array, p: number) => `#${[0, 1, 2].map((c) => rgba[p * 4 + c]!.toString(16).padStart(2, '0')).join('')}`;
/** Pixels of each of these colours in a frame. */
function count(r: Rendered, colours: readonly string[], box?: number): number {
  const want = new Set(colours), { width, height } = r.pixels;
  let n = 0;
  for (let p = 0; p < width * height; p++) {
    // box: only the middle of the frame, `box` x the height wide each side of the centre (the hero planet, not the star)
    if (box !== undefined && Math.abs((p % width) - width / 2) > box * height) continue;
    if (want.has(hex(r.pixels.rgba, p))) n++;
  }
  return n;
}
const VEILS = Object.values(palette.fog.veil).flatMap((v) => [v.lit, v.night, v.hatch, v.line]);

/** mini with every drawn file haze (#201: seen, not yet understood). */
const allHaze = (layout = MINI): FogView => fogFor(layout, () => false, () => true);

test('#201: haze draws thin cloud, distinct from clear (no cloud) and from fogged, in palette colours and no veil', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const [what, extra] of [['src focused', focus('src')], ['web focused', focus('web')]] as const) {
    const base = { layout: MINI, ...extra, depthFade: false };
    const [clear] = await render(view, { ...base, fog: fogFor(MINI) }, [0]);
    const [haze] = await render(view, { ...base, fog: allHaze() }, [0]);
    const [fogged] = await render(view, { ...base, fog: fogFor(MINI, () => true) }, [0]);
    for (const r of [clear, haze, fogged]) assertRendered(r!.pixels, r!.stats);
    expect(paletteProblems(haze!.pixels), what).toEqual([]);
    const thin = diffPixels(clear!.pixels, haze!.pixels), veil = diffPixels(clear!.pixels, fogged!.pixels);
    console.log(`${what}: haze differs from clear by ${thin} px, fogged by ${veil} px; veil px clear ${count(clear!, VEILS)}, haze ${count(haze!, VEILS)}`);
    expect(thin, `${what}: haze draws something (not vacuous)`).toBeGreaterThan(0);
    expect(diffPixels(haze!.pixels, fogged!.pixels), `${what}: haze is not fogged`).toBeGreaterThan(0);
    expect(thin, `${what}: haze is thin, far less than the veil`).toBeLessThan(veil / 2);
    expect(count(haze!, VEILS), `${what}: haze adds no veil colour`).toBeLessThanOrEqual(count(clear!, VEILS));
  }
  expect(view.errors).toEqual([]);
});

test('#201: haze under reduced motion holds still, and costs no draw call or triangle', async ({ page }) => {
  const view = await openView(page, systemView());
  const input = { layout: MINI, fog: allHaze(), ...focus('src'), reducedMotion: true };
  const [a, b] = await render(view, input, [0, 180]);
  for (const r of [a, b]) assertRendered(r!.pixels, r!.stats);
  expect(diffPixels(a!.pixels, b!.pixels)).toBe(0);
  const [clear] = await render(view, { layout: MINI, fog: fogFor(MINI), ...focus('src') }, [0]);
  const [haze] = await render(view, { layout: MINI, fog: allHaze(), ...focus('src') }, [0]);
  expect(haze!.stats).toEqual(clear!.stats);
  expect(view.errors).toEqual([]);
});

test('without a usable fog view every file is fogged (Rule 1): no view, or one from another scan, draw alike', async ({ page }) => {
  const view = await openView(page, systemView());
  const [none] = await render(view, { layout: MINI, fog: null }, [0]);
  const [stale] = await render(view, { layout: MINI, fog: { ...MINI_FOG, head: '2'.repeat(40) } }, [0]);
  const [allFogged] = await render(view, { layout: MINI, fog: fogFor(MINI, () => true) }, [0]);
  const [mini] = await render(view, { ...MINI_INPUT }, [0]);
  expect(diffPixels(none!.pixels, stale!.pixels)).toBe(0);
  expect(diffPixels(none!.pixels, allFogged!.pixels)).toBe(0);
  expect(diffPixels(none!.pixels, mini!.pixels), 'not vacuous').toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});

test('a fogged frame is palette-only with the depth fade off: the veil, its line and hatch, the "?" and the halo limb', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const [what, input] of [['mini', { ...MINI_INPUT }], ['web focused', { ...MINI_INPUT, ...focus('web') }], ['all fogged, src focused', { layout: MINI, fog: null, ...focus('src') }]] as const) {
    const [r] = await render(view, { ...input, depthFade: false }, [0]);
    assertRendered(r!.pixels, r!.stats);
    expect(paletteProblems(r!.pixels), what).toEqual([]);
    const veil = count(r!, VEILS), limb = count(r!, [palette.world.halo]);
    console.log(`${what}: ${veil} veil px, ${limb} halo-colour px`);
    expect(veil, `${what}: veil pixels`).toBeGreaterThan(0);
    expect(limb, `${what}: halo limb pixels`).toBeGreaterThan(0);
  }
  expect(view.errors).toEqual([]);
});

test('teal stays off the frame at rest (it marks events only)', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const input of [{ ...MINI_INPUT }, { ...MINI_INPUT, ...focus('web') }, { layout: MINI, fog: null, ...focus('src') }, { layout: MINI, fog: allHaze(), ...focus('src') }]) {
    for (const r of await render(view, { ...input, depthFade: false }, [0, LATER])) {
      assertRendered(r.pixels, r.stats); // a blank frame has no teal either
      expect(count(r, palette.accent.teal)).toBe(0);
    }
  }
  expect(view.errors).toEqual([]);
});

test('the hatch drift closes the loop: the fogged planet, followed along its orbit, draws the same pixels on every whole loop of its first fifth of an orbit', async ({ page }) => {
  // web fills its hero frame (src has the star behind it, which the orbit moves); the planets left the loop (#60), so the
  // camera follows web as focus does, and the frames are pinned: 0, every whole loop on until the star comes into view
  // behind web (past 80° round the orbit: five 24 s loops, 72°, were clear, as are three of #174's 48 s loops; the fourth,
  // 96°, is not), and a frame inside the loop. Before the floating origin (render/scene.ts) float32 rounding at web's
  // position changed 1 px at frame 720 in CI and 572 px (the fog anchor a pixel over) at frames 1440 and 2880 here (24 s loop).
  const view = await openView(page, systemView());
  const at = async (n: number) => (await render(view, { layout: MINI, fog: null, ...focus('web', n) }, [n]))[0]!;
  const a = await at(0), c = await at(LATER);
  const loops = [1, 2, 3, 4, 5].map((k) => k * LOOP_FRAMES).filter((n) => n <= ORBIT_FRAMES / 5);
  expect(loops.length, 'more than one whole loop to compare').toBeGreaterThanOrEqual(2);
  const diffs: number[] = [];
  for (const n of loops) {
    const b = await at(n);
    assertRendered(b.pixels, b.stats);
    diffs.push(diffPixels(a.pixels, b.pixels));
  }
  for (const r of [a, c]) assertRendered(r.pixels, r.stats);
  console.log(`hatch loop, web followed at 360 px: frames ${loops.join(', ')} differ from frame 0 by ${diffs.join(', ')} px`);
  expect(diffs, `frames ${loops.join(', ')} vs frame 0`).toEqual(loops.map(() => 0));
  expect(diffPixels(a.pixels, c.pixels), 'not vacuous: the frame moves within the loop').toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});

test('fog adds no draw call and no triangle', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const extra of [{}, focus('src'), focus('web')]) {
    const stats = [];
    for (const fog of [fogFor(MINI), MINI_FOG, null]) stats.push((await render(view, { layout: MINI, fog, ...extra }, [0]))[0]!.stats);
    expect(stats[1]).toEqual(stats[0]);
    expect(stats[2]).toEqual(stats[0]);
  }
  expect(view.errors).toEqual([]);
});

// Fog hides health (#74, Qodo local r1 and PR #117 r1): a fully fogged lava world shows none of the
// lava look's own colours, neither its glowing fissures nor its smoke, so the ground, the shadow pass
// and the clouds all say the same thing. The fade is off, so every pixel is a palette colour.
test('a fully fogged lava planet shows no fissure glow or smoke colour at hero focus; hazed, its health shows through', async ({ page }) => {
  const lava = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'src' ? { ...p, health: { ...p.health, band: 'lava' as const } } : p)) };
  const view = await openView(page, systemView());
  const base = { layout: lava, ...focus('src'), depthFade: false };
  // The fissure glow and the smoke (the ash ramp). The crust is the ground itself: the "?" glyph is inked in one of its steps.
  const LAVA = [...palette.world.glow, ...palette.world.ash];
  const [clear] = await render(view, { ...base, fog: fogFor(lava) }, [0]);
  const [fogged] = await render(view, { ...base, fog: fogFor(lava, () => true) }, [0]);
  const [fogged90] = await render(view, { ...base, ...focus('src', 90), fog: fogFor(lava, () => true) }, [90]); // followed to frame 90 (#60)
  const [hazed] = await render(view, { ...base, fog: allHaze(lava) }, [0]);
  for (const r of [clear, fogged, hazed]) assertRendered(r!.pixels, r!.stats);
  // The star glows in the same colours, so only the middle of the frame, where the planet is, is counted.
  const BOX = 0.3;
  const glow = (r: Rendered) => count(r, palette.world.glow, BOX), all = (r: Rendered) => count(r, LAVA, BOX);
  console.log(`lava hero, clear: ${glow(clear!)} glow px, ${all(clear!)} glow+ash px; fogged: ${glow(fogged!)} glow, ${all(fogged!)} glow+ash px (f90: ${all(fogged90!)})`);
  expect(glow(clear!), 'not vacuous: a clear lava planet glows').toBeGreaterThan(0);
  expect(all(clear!), 'not vacuous: smoke and ash ground show').toBeGreaterThan(glow(clear!));
  expect(all(fogged!), 'fogged: no glow or smoke colour').toBe(0);
  expect(all(fogged90!), 'fogged, a later frame').toBe(0);
  // #201: haze is seen ground, so its health reads through the thin cloud.
  expect(glow(hazed!), 'hazed: the glow shows through').toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});

// The lava smoke over partly fogged ground (PR #117 r1: smoke is tested at its own cell, so one from a
// clear parcel could overlap a fogged neighbour). F1 fogs every file but one settlement (moons and moonlets too, so they don't show in both), F2 only that one:
// a smoke pixel over F1's fogged ground would be an ash-coloured pixel in both, since F2 draws that
// ground (and its smoke) clear. The ground under the one clear parcel is veiled in F2.
test('lava smoke never shows over a fogged settlement, head-on and at oblique angles', async ({ page }) => {
  const lava = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'src' ? { ...p, health: { ...p.health, band: 'lava' as const } } : p)) };
  const src = lava.planets.find((p) => p.path === 'src')!;
  const ids = src.surface.settlements.map((s) => s.fileId);
  const view = await openView(page, systemView());
  const ash = new Set(palette.world.ash), seen = new Map<string, number>();
  const views = [['head-on', focus('src')], ['yaw +1.1', oblique('src', 1.1, 0)], ['yaw -1.1, pitch -0.5', oblique('src', -1.1, -0.5)], ['pitch +0.6', oblique('src', 0, 0.6)]] as const;
  for (const [vname, cam, keep, i] of views.flatMap(([v, c]) => ids.map((id, i) => [v, c, id, i] as const))) {
    const name = `${vname}, parcel ${i}`;
    const base = { layout: lava, ...cam, depthFade: false };
    const [f1] = await render(view, { ...base, fog: fogFor(lava, (id) => id !== keep) }, [0]);
    const [f2] = await render(view, { ...base, fog: fogFor(lava, (id) => id === keep) }, [0]);
    let both = 0, in1 = 0;
    const { width, height } = f1!.pixels;
    for (let q = 0; q < width * height; q++) {
      if (Math.abs((q % width) - width / 2) > 0.3 * height || !ash.has(hex(f1!.pixels.rgba, q) as never)) continue;
      in1++;
      if (ash.has(hex(f2!.pixels.rgba, q) as never)) both++;
    }
    seen.set(vname, (seen.get(vname) ?? 0) + in1); // a parcel on the far side shows no smoke: vacuous per view, not per parcel
    console.log(`smoke over fogged ground, ${name} clear: ${both} of ${in1} ash px also ash with it fogged`);
    // A lone pixel can coincide: smoke from F1's clear parcel and from F2's clear ones may cross at the limb.
    expect(both, name).toBeLessThanOrEqual(Math.ceil(in1 * 0.02));
  }
  for (const [vname, n] of seen) expect(n, `${vname}: not vacuous`).toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});

// The contrast the fog draws: at overview a fogged lava world beside a clear one. F1 fogs src only and
// F2 docs only; the star glows in the same colours (the all-fogged frame shows what is left of it).
test('at overview a fogged lava planet has no glow while its clear neighbour keeps its own', async ({ page }) => {
  const lava = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'web' ? p : { ...p, health: { ...p.health, band: 'lava' as const } })) };
  const files = (path: string) => { const p = lava.planets.find((x) => x.path === path)!; return [...p.surface.settlements, ...p.moons].map((f) => f.fileId) as string[]; };
  const view = await openView(page, systemView());
  const base = { layout: lava, depthFade: false };
  const [none] = await render(view, { ...base, fog: fogFor(lava, () => true) }, [0]);
  const [srcFogged] = await render(view, { ...base, fog: fogFor(lava, (id) => files('src').includes(id)) }, [0]);
  const [docsFogged] = await render(view, { ...base, fog: fogFor(lava, (id) => files('docs').includes(id)) }, [0]);
  const glowing = (r: Rendered) => { const s = new Set<number>(), g = new Set(palette.world.glow); for (let q = 0; q < r.pixels.width * r.pixels.height; q++) if (g.has(hex(r.pixels.rgba, q) as never)) s.add(q); return s; };
  const star = glowing(none!), a = glowing(srcFogged!), b = glowing(docsFogged!);
  const own = (s: Set<number>) => [...s].filter((q) => !star.has(q));
  const onlyA = own(a), onlyB = own(b);
  const shared = onlyA.filter((q) => b.has(q)).length;
  console.log(`overview, src fogged: ${onlyA.length} planet glow px; docs fogged: ${onlyB.length}; in both: ${shared}`);
  expect(onlyA.length, 'docs, clear, glows').toBeGreaterThan(0);
  expect(onlyB.length, 'src, clear, glows').toBeGreaterThan(0);
  expect(shared, 'no pixel glows in both: a fogged planet shows none').toBe(0);
  expect(view.errors).toEqual([]);
});

// Rule 1 on a layout whose settlements can't be drawn: with no usable fog view the planet is still
// drawn fogged all over, even when no settlement's cell is on its grid (Qodo PR #117 r5).
test('a planet whose settlements are all off its grid is drawn fogged without a usable fog view', async ({ page }) => {
  const off = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'src' ? { ...p, surface: { ...p.surface, settlements: p.surface.settlements.map((s) => ({ ...s, cell: 99_999 })) } } : p)) };
  const view = await openView(page, systemView());
  const base = { layout: off, ...focus('src'), depthFade: false };
  const [unknown] = await render(view, { ...base, fog: null }, [0]);
  const [stale] = await render(view, { ...base, fog: { ...MINI_FOG, head: '2'.repeat(40) } }, [0]);
  const [known] = await render(view, { ...base, fog: fogFor(off) }, [0]);
  for (const r of [unknown, stale, known]) assertRendered(r!.pixels, r!.stats);
  const veil = (r: Rendered) => count(r, VEILS, 0.3);
  console.log(`src with no settlement on its grid: ${veil(unknown!)} veil px with no fog view, ${veil(known!)} with every file known clear`);
  expect(veil(unknown!), 'no fog view: fogged all over').toBeGreaterThan(5000);
  expect(diffPixels(unknown!.pixels, stale!.pixels)).toBe(0);
  expect(veil(known!), 'not vacuous: known clear files leave it clear').toBeLessThan(veil(unknown!) / 10);
  expect(view.errors).toEqual([]);
});
