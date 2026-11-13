// Fog of war on the real view (#74, R5; D2d, docs/features/fog-of-war-art.md). The goldens
// (view.spec.ts) are fogged frames of mini; these check what a golden can't say on its own: clear
// and charted draw the same, fog without evidence covers everything (Rule 1), the veil and its
// limb are palette colours, teal shows only on events, the hatch drift closes the loop, and fog
// costs no draw call or triangle.
import { expect, test } from '@playwright/test';
import type { FogView } from '../../src/core/contract/fog.js';
import { palette } from '../../src/core/palette.js';
import { focusPose, startPose, toCameraPose } from '../../web/src/camera/pose.js';
import { LOOP_FRAMES } from '../../web/src/model/motion.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { assertRendered, diffPixels } from './frame.js';
import { fogFor, MINI, MINI_FOG, MINI_INPUT, openView, render, systemView, type Rendered } from './harness.js';
import { LATER } from './suite.js';
import { paletteProblems } from './twin.js';

const model = systemModel(MINI);
/** The hero framing of a mini planet by path, at 360 px: big enough to show parcels, hatching and the "?". */
const focus = (path: string) => {
  const p = model.planets.find((x) => x.path === path)!;
  return { camera: toCameraPose(focusPose(startPose(model), planetCentre(p, 0), p.radius)), pixelHeight: 360 };
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

test('clear and charted draw the same pixels (contract: the renderer draws them the same)', async ({ page }) => {
  const view = await openView(page, systemView());
  const charted: FogView = { ...MINI_FOG, files: MINI_FOG.files.map((f) => (f.state === 'clear' ? { ...f, state: 'charted' } : f)) };
  const allClear = fogFor(MINI), allCharted: FogView = { ...allClear, files: allClear.files.map((f) => ({ ...f, state: 'charted' })) };
  for (const extra of [{}, focus('src')]) {
    const [a] = await render(view, { ...MINI_INPUT, ...extra }, [0]);
    const [b] = await render(view, { layout: MINI, fog: charted, ...extra }, [0]);
    const [c] = await render(view, { layout: MINI, fog: allClear, ...extra }, [0]);
    const [d] = await render(view, { layout: MINI, fog: allCharted, ...extra }, [0]);
    for (const r of [a, b, c, d]) assertRendered(r!.pixels, r!.stats);
    expect(diffPixels(a!.pixels, b!.pixels)).toBe(0);
    expect(diffPixels(c!.pixels, d!.pixels)).toBe(0);
    expect(diffPixels(a!.pixels, c!.pixels), 'not vacuous: the fogged files show').toBeGreaterThan(0);
  }
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
  for (const input of [{ ...MINI_INPUT }, { ...MINI_INPUT, ...focus('web') }, { layout: MINI, fog: null, ...focus('src') }]) {
    for (const r of await render(view, { ...input, depthFade: false }, [0, LATER])) expect(count(r, palette.accent.teal)).toBe(0);
  }
  expect(view.errors).toEqual([]);
});

test('the hatch drift closes the 24 s loop: a fogged frame one loop on is the same frame', async ({ page }) => {
  const view = await openView(page, systemView());
  const [a, b, c] = await render(view, { layout: MINI, fog: null, ...focus('src') }, [0, LOOP_FRAMES, LATER]);
  expect(diffPixels(a!.pixels, b!.pixels)).toBe(0);
  expect(diffPixels(a!.pixels, c!.pixels), 'not vacuous: the frame moves within the loop').toBeGreaterThan(0);
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
test('a fully fogged lava planet shows no fissure glow or smoke colour at hero focus; charted looks like clear', async ({ page }) => {
  const lava = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'src' ? { ...p, health: { ...p.health, band: 'lava' as const } } : p)) };
  const view = await openView(page, systemView());
  const base = { layout: lava, ...focus('src'), depthFade: false };
  // The fissure glow and the smoke (the ash ramp). The crust is the ground itself: the "?" glyph is inked in one of its steps.
  const LAVA = [...palette.world.glow, ...palette.world.ash];
  const [clear] = await render(view, { ...base, fog: fogFor(lava) }, [0, 90]);
  const [fogged, fogged90] = await render(view, { ...base, fog: fogFor(lava, () => true) }, [0, 90]);
  const [charted] = await render(view, { ...base, fog: { ...fogFor(lava), files: fogFor(lava).files.map((f) => ({ ...f, state: 'charted' as const })) } }, [0]);
  for (const r of [clear, fogged, charted]) assertRendered(r!.pixels, r!.stats);
  // The star glows in the same colours, so only the middle of the frame, where the planet is, is counted.
  const BOX = 0.3;
  const glow = (r: Rendered) => count(r, palette.world.glow, BOX), all = (r: Rendered) => count(r, LAVA, BOX);
  console.log(`lava hero, clear: ${glow(clear!)} glow px, ${all(clear!)} glow+ash px; fogged: ${glow(fogged!)} glow, ${all(fogged!)} glow+ash px (f90: ${all(fogged90!)})`);
  expect(glow(clear!), 'not vacuous: a clear lava planet glows').toBeGreaterThan(0);
  expect(all(clear!), 'not vacuous: smoke and ash ground show').toBeGreaterThan(glow(clear!));
  expect(all(fogged!), 'fogged: no glow or smoke colour').toBe(0);
  expect(all(fogged90!), 'fogged, a later frame').toBe(0);
  expect(diffPixels(clear!.pixels, charted!.pixels)).toBe(0);
  expect(view.errors).toEqual([]);
});

// The lava smoke over partly fogged ground (PR #117 r1: smoke is tested at its own cell, so one from a
// clear parcel could overlap a fogged neighbour). F1 fogs every settlement but one, F2 only that one:
// a smoke pixel over F1's fogged ground would be an ash-coloured pixel in both, since F2 draws that
// ground (and its smoke) clear. The ground under the one clear parcel is veiled in F2.
test('lava smoke never shows over a fogged settlement at hero focus', async ({ page }) => {
  const lava = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'src' ? { ...p, health: { ...p.health, band: 'lava' as const } } : p)) };
  const src = lava.planets.find((p) => p.path === 'src')!;
  const ids = src.surface.settlements.map((s) => s.fileId);
  const view = await openView(page, systemView());
  const base = { layout: lava, ...focus('src'), depthFade: false };
  const ash = new Set(palette.world.ash);
  for (const [name, keep] of ids.map((id, i) => [`parcel ${i}`, id] as const)) {
    const [f1] = await render(view, { ...base, fog: fogFor(lava, (id) => (ids as string[]).includes(id) && id !== keep) }, [0]);
    const [f2] = await render(view, { ...base, fog: fogFor(lava, (id) => id === keep) }, [0]);
    let both = 0, in1 = 0;
    const { width, height } = f1!.pixels;
    for (let q = 0; q < width * height; q++) {
      if (Math.abs((q % width) - width / 2) > 0.3 * height || !ash.has(hex(f1!.pixels.rgba, q) as never)) continue;
      in1++;
      if (ash.has(hex(f2!.pixels.rgba, q) as never)) both++;
    }
    console.log(`smoke over fogged ground, only ${name} clear: ${both} of ${in1} ash px also ash with it fogged`);
    expect(both, name).toBe(0);
  }
  expect(view.errors).toEqual([]);
});
