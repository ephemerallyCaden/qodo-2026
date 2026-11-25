// Fog of war on the real view (#74, R5; cloud since #224, the planets' own weather since #228: art-direction §9).
// The goldens (view.spec.ts) are fogged frames of mini; these check what a golden can't say on its own:
// fogged is cloud, misted (stored haze) is thin mist, clear has nothing over it, and none of it
// darkens the ground (the human, 2026-11-25: "there should be no black area"); fog without evidence is
// cloud everywhere (Rule 1); every fog colour is a palette colour and teal shows only on events;
// the cloud is locked to the ground, so it closes the loop (on a planet followed along its orbit, #60);
// and the fog stays inside the draw budget.
import { expect, test } from '@playwright/test';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { palette } from '../../src/core/palette.js';
import { focusPose, project, projectedRadius, startPose, toCameraPose } from '../../web/src/camera/pose.js';
import { LOOP_FRAMES, ORBIT_FRAMES } from '../../web/src/model/motion.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { selfLikeRoots } from '../fixtures/overview.js';
import { assertRendered, diffPixels, LOW_RES } from './frame.js';
import { fogFor, following, MINI, MINI_FOG, MINI_INPUT, openView, render, systemView, type Rendered } from './harness.js';
import { LATER } from './suite.js';
import { BUDGET, OVERVIEW } from './thresholds.js';
import { paletteProblems } from './twin.js';

const model = systemModel(MINI);
/**
 * The hero framing of a mini planet by path, at 360 px. At frame `n` it has followed the planet along
 * its orbit since frame 0, as focus does (#60).
 */
const focus = (path: string, n = 0) => ({ camera: following(model, path, n), pixelHeight: 360 });
/** The same framing, orbited by `dyaw` and `dpitch` radians: an oblique view, where smoke overlaps its neighbours. */
const oblique = (path: string, dyaw: number, dpitch: number) => {
  const p = model.planets.find((x) => x.path === path)!;
  const o = focusPose(startPose(model), planetCentre(p, 0), p.radius);
  return { camera: toCameraPose({ ...o, yaw: o.yaw + dyaw, pitch: o.pitch + dpitch }), pixelHeight: 360 };
};
const hex = (rgba: Uint8Array, p: number) => `#${[0, 1, 2].map((c) => rgba[p * 4 + c]!.toString(16).padStart(2, '0')).join('')}`;
const luma = (rgba: Uint8Array, p: number) => 0.299 * rgba[p * 4]! + 0.587 * rgba[p * 4 + 1]! + 0.114 * rgba[p * 4 + 2]!;
/** Whether pixel p is in the middle of the frame, `box` × the height either side of the centre (the hero planet, not the star). */
const inBox = (r: Rendered, p: number, box?: number) => box === undefined || Math.abs((p % r.pixels.width) - r.pixels.width / 2) <= box * r.pixels.height;
/** Pixels of each of these colours in a frame. */
function count(r: Rendered, colours: readonly string[], box?: number): number {
  const want = new Set(colours), { width, height } = r.pixels;
  let n = 0;
  for (let p = 0; p < width * height; p++) if (inBox(r, p, box) && want.has(hex(r.pixels.rgba, p))) n++;
  return n;
}
/** The pixels where two frames differ, as indices. */
function changed(a: Rendered, b: Rendered, box?: number): number[] {
  const out: number[] = [];
  for (let p = 0; p < a.pixels.width * a.pixels.height; p++) {
    if (!inBox(a, p, box)) continue;
    if ([0, 1, 2].some((c) => a.pixels.rgba[p * 4 + c] !== b.pixels.rgba[p * 4 + c])) out.push(p);
  }
  return out;
}
/** The fog's own colours: the cloud (the mist is its light steps) and nothing else at rest. */
const CLOUD = [...palette.world.cloud];
const MIST = new Set<string>(palette.fog.mist);

/** A layout with every drawn file misted (#201's haze: read, not yet tested). */
const allMisted = (layout = MINI): FogView => fogFor(layout, () => false, () => true);
const allFogged = (layout = MINI): FogView => fogFor(layout, () => true);

test('#224, #228: fogged is cloud, misted thin mist, clear nothing, and the fog never darkens: no black area', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const [what, extra] of [['src focused', focus('src')], ['web focused', focus('web')]] as const) {
    const base = { layout: MINI, ...extra, depthFade: false };
    const [clear] = await render(view, { ...base, fog: fogFor(MINI) }, [0]);
    const [misted] = await render(view, { ...base, fog: allMisted() }, [0]);
    const [fogged] = await render(view, { ...base, fog: allFogged() }, [0]);
    for (const r of [clear, misted, fogged]) {
      assertRendered(r!.pixels, r!.stats);
      expect(paletteProblems(r!.pixels), what).toEqual([]);
    }
    const mist = changed(clear!, misted!, 0.3), storm = changed(clear!, fogged!, 0.3);
    const lighter = (r: Rendered, px: number[]) => px.filter((p) => luma(r.pixels.rgba, p) >= luma(clear!.pixels.rgba, p)).length;
    const mean = (r: Rendered, px: number[]) => px.reduce((s, p) => s + luma(r.pixels.rgba, p), 0) / Math.max(1, px.length);
    console.log(`${what}: mist changes ${mist.length} px (${lighter(misted!, mist)} lighter), storm ${storm.length} px (${lighter(fogged!, storm)} lighter); `
      + `mean luma there, clear ${mean(clear!, storm).toFixed(1)} → fogged ${mean(fogged!, storm).toFixed(1)}; cloud px clear ${count(clear!, CLOUD, 0.3)}, misted ${count(misted!, CLOUD, 0.3)}, fogged ${count(fogged!, CLOUD, 0.3)}`);
    expect(mist.length, `${what}: mist draws something (not vacuous)`).toBeGreaterThan(0);
    expect(diffPixels(misted!.pixels, fogged!.pixels), `${what}: misted is not fogged`).toBeGreaterThan(0);
    // #228: mist covers 0.07 of the sites against the cloud's 0.35, in smaller, flatter puffs
    expect(mist.length, `${what}: mist is thin, far less than the cloud`).toBeLessThan(storm.length / 3);
    // never dark: every pixel the mist changes is a mist colour (it has no shadow), and the cloud lightens the planet
    expect(mist.filter((p) => !MIST.has(hex(misted!.pixels.rgba, p))), `${what}: mist pixels outside the mist colours`).toEqual([]);
    expect(mean(fogged!, storm), `${what}: the cloud lightens what it covers`).toBeGreaterThan(mean(clear!, storm) + 40);
    expect(lighter(fogged!, storm), `${what}: at most its shadows (one band darker) are darker`).toBeGreaterThan(storm.length * 0.8);
    expect(count(fogged!, CLOUD, 0.3), `${what}: the fog is cloud`).toBeGreaterThan(storm.length * 0.7);
  }
  expect(view.errors).toEqual([]);
});

// The cloud's offset shadow (§6 Clouds; Qodo c8a30ce7, PR #225, whose storm floated too high for the
// weather's reach; since #228 the fog is the weather's own puffs, at the weather's 0.1 R). One of src's
// three files fogged, so its cloud faces discovered ground; the shadow is the ground the fog darkens
// without covering it (darker than clear, and no cloud colour), over four turns of the surface.
test('the cloud casts its offset shadow on the discovered ground beside it', async ({ page }) => {
  const view = await openView(page, systemView());
  const ids = MINI.planets.find((p) => p.path === 'src')!.surface.settlements.map((s) => s.fileId as string);
  let shadow = 0, storm = 0;
  for (const n of [0, 90, 180, 270]) {
    const base = { layout: MINI, ...focus('src', n), depthFade: false };
    const [clear] = await render(view, { ...base, fog: fogFor(MINI) }, [n]);
    const [one] = await render(view, { ...base, fog: fogFor(MINI, (id) => id === ids[0]) }, [n]);
    for (const r of [clear, one]) assertRendered(r!.pixels, r!.stats);
    for (const p of changed(clear!, one!)) {
      if (CLOUD.includes(hex(one!.pixels.rgba, p) as never)) storm++;
      else if (luma(one!.pixels.rgba, p) < luma(clear!.pixels.rgba, p)) shadow++;
    }
  }
  console.log(`src, one file fogged, four turns: ${storm} cloud px, ${shadow} shadow px`);
  expect(storm, 'not vacuous: the cloud draws').toBeGreaterThan(10_000);
  expect(shadow, 'the cloud\'s main masses cast their shadow, not only its satellites').toBeGreaterThan(storm * 0.06);
  expect(view.errors).toEqual([]);
});

test('#224: misted and fogged hold still under reduced motion', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const fog of [allMisted(), allFogged()]) {
    const [a, b] = await render(view, { layout: MINI, fog, ...focus('src'), reducedMotion: true }, [0, 180]);
    for (const r of [a, b]) assertRendered(r!.pixels, r!.stats);
    expect(diffPixels(a!.pixels, b!.pixels)).toBe(0);
  }
  expect(view.errors).toEqual([]);
});

test('without a usable fog view every file is fogged (Rule 1): no view, or one from another scan, draw alike', async ({ page }) => {
  const view = await openView(page, systemView());
  const [none] = await render(view, { layout: MINI, fog: null }, [0]);
  const [stale] = await render(view, { layout: MINI, fog: { ...MINI_FOG, head: '2'.repeat(40) } }, [0]);
  const [fogged] = await render(view, { layout: MINI, fog: allFogged() }, [0]);
  const [mini] = await render(view, { ...MINI_INPUT }, [0]);
  expect(diffPixels(none!.pixels, stale!.pixels)).toBe(0);
  expect(diffPixels(none!.pixels, fogged!.pixels)).toBe(0);
  expect(diffPixels(none!.pixels, mini!.pixels), 'not vacuous').toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});

test('a fogged frame is palette-only with the depth fade off, and its fog is cloud colours, no veil', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const [what, input] of [['mini', { ...MINI_INPUT }], ['web focused', { ...MINI_INPUT, ...focus('web') }], ['all fogged, src focused', { layout: MINI, fog: null, ...focus('src') }]] as const) {
    const [r] = await render(view, { ...input, depthFade: false }, [0]);
    const [clear] = await render(view, { ...input, fog: fogFor(MINI), depthFade: false }, [0]);
    assertRendered(r!.pixels, r!.stats);
    expect(paletteProblems(r!.pixels), what).toEqual([]);
    const fog = changed(clear!, r!);
    const cloud = fog.filter((p) => CLOUD.includes(hex(r!.pixels.rgba, p) as never)).length;
    console.log(`${what}: the fog changes ${fog.length} px, ${cloud} of them to cloud colours`);
    expect(fog.length, `${what}: the fog draws (not vacuous)`).toBeGreaterThan(0);
    expect(cloud, `${what}: mostly cloud; the rest is its shadow on the ground`).toBeGreaterThan(fog.length * 0.6);
    expect(count(r!, [palette.world.space]), `${what}: no more space than clear: the fog never reads as empty space`).toBeLessThanOrEqual(count(clear!, [palette.world.space]));
  }
  expect(view.errors).toEqual([]);
});

test('teal stays off the frame at rest (it marks events only)', async ({ page }) => {
  const view = await openView(page, systemView());
  for (const input of [{ ...MINI_INPUT }, { ...MINI_INPUT, ...focus('web') }, { layout: MINI, fog: null, ...focus('src') }, { layout: MINI, fog: allMisted(), ...focus('src') }]) {
    for (const r of await render(view, { ...input, depthFade: false }, [0, LATER])) {
      assertRendered(r.pixels, r.stats); // a blank frame has no teal either
      expect(count(r, palette.accent.teal)).toBe(0);
    }
  }
  expect(view.errors).toEqual([]);
});

test('the cloud is locked to the ground and closes the loop: the fogged planet, followed along its orbit, draws the same pixels on every whole loop of its first fifth of an orbit', async ({ page }) => {
  // web fills its hero frame (src has the star behind it, which the orbit moves); the planets left the loop (#60), so the
  // camera follows web as focus does, and the frames are pinned: 0, every whole loop on until the star comes into view
  // behind web (past 80° round the orbit), and a frame inside the loop. Fogged and misted both ride the surface's turn.
  const view = await openView(page, systemView());
  for (const [what, fog] of [['fogged', null], ['misted', allMisted()]] as const) {
    const at = async (n: number) => (await render(view, { layout: MINI, fog, ...focus('web', n) }, [n]))[0]!;
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
    console.log(`${what} loop, web followed at 360 px: frames ${loops.join(', ')} differ from frame 0 by ${diffs.join(', ')} px`);
    expect(diffs, `${what}: frames ${loops.join(', ')} vs frame 0`).toEqual(loops.map(() => 0));
    expect(diffPixels(a.pixels, c.pixels), `${what}: not vacuous: the frame moves within the loop`).toBeGreaterThan(0);
  }
  expect(view.errors).toEqual([]);
});

// The fog's puffs are instanced meshes: at most four draws per planet (cloud, its shadow, teal, mist), and
// only the layers with puffs draw. Measured on mini and on a fixture the size of this repo (11 planets).
test('the fog stays inside the draw budget, mini and a repo-sized system, fogged and misted', async ({ page }) => {
  const view = await openView(page, systemView());
  const cases: [string, LayoutV1, Record<string, unknown>][] = [['mini', MINI, {}], ['mini src', MINI, focus('src')], ['mini web', MINI, focus('web')], ['repo-sized', selfLikeRoots, {}]];
  for (const [what, layout, extra] of cases) {
    const planets = layout.planets.length;
    const stats = [];
    const half = new Set<string>(fogFor(layout).files.filter((_, i) => i % 2 === 0).map((f) => f.fileId));
    for (const fog of [fogFor(layout), allMisted(layout), allFogged(layout), fogFor(layout, (id) => half.has(id), (id) => !half.has(id))]) {
      const [r] = await render(view, { layout, fog, ...extra }, [0]);
      if (what === 'repo-sized') assertRendered(r!.pixels, r!.stats, LOW_RES, OVERVIEW.minNonSpaceFraction);
      else assertRendered(r!.pixels, r!.stats);
      stats.push(r!.stats);
    }
    console.log(`${what} (${planets} planets): draw calls clear/misted/fogged/both ${stats.map((s) => s.drawCalls).join('/')}, triangles ${stats.map((s) => s.triangles).join('/')}`);
    for (const s of stats) {
      expect(s.drawCalls, what).toBeLessThanOrEqual(BUDGET.maxDrawCalls);
      expect(s.triangles, what).toBeLessThanOrEqual(BUDGET.maxTriangles);
      expect(s.drawCalls - stats[0]!.drawCalls, `${what}: four fog draws a planet at most`).toBeLessThanOrEqual(4 * planets);
    }
    expect(stats[2]!.drawCalls, `${what}: the cloud draws (not vacuous)`).toBeGreaterThan(stats[0]!.drawCalls);
  }
  expect(view.errors).toEqual([]);
});

const lavaAt = (paths: readonly string[]): LayoutV1 => ({ ...MINI, planets: MINI.planets.map((p) => (paths.includes(p.path) ? { ...p, health: { ...p.health, band: 'lava' as const } } : p)) });

// Health reads on discovered land and through the clear sky between the cloud's masses (art-direction §9;
// #228, C, the human, 2026-11-25): the fog is the planets' weather at 0.35 of the sites, so a fully fogged
// lava world shows about half its glow, by the human's choice; the cloud still hides a real share of it,
// there's no smoke over fogged ground, and misted (sparse white puffs) shows clearly more. The fade is off,
// so every pixel is a palette colour.
test('a fully fogged lava planet hides a share of its glow under the cloud, its health showing through the clear sky; misted, far more shows', async ({ page }) => {
  const lava = lavaAt(['src']);
  const view = await openView(page, systemView());
  const base = { layout: lava, ...focus('src'), depthFade: false };
  const [clear] = await render(view, { ...base, fog: fogFor(lava) }, [0]);
  const [fogged] = await render(view, { ...base, fog: allFogged(lava) }, [0]);
  const [fogged90] = await render(view, { ...base, ...focus('src', 90), fog: allFogged(lava) }, [90]); // followed to frame 90 (#60)
  const [misted] = await render(view, { ...base, fog: allMisted(lava) }, [0]);
  for (const r of [clear, fogged, fogged90, misted]) assertRendered(r!.pixels, r!.stats);
  // The star glows in the same colours, so only the middle of the frame, where the planet is, is counted.
  const BOX = 0.3;
  const glow = (r: Rendered) => count(r, palette.world.glow, BOX), ash = (r: Rendered) => count(r, palette.world.ash, BOX);
  console.log(`lava hero, glow px: clear ${glow(clear!)}, fogged ${glow(fogged!)} (f90: ${glow(fogged90!)}), misted ${glow(misted!)}; smoke px: clear ${ash(clear!)}, fogged ${ash(fogged!)}`);
  expect(glow(clear!), 'not vacuous: a clear lava planet glows').toBeGreaterThan(0);
  expect(ash(clear!), 'not vacuous: its smoke shows').toBeGreaterThan(0);
  expect(glow(fogged!), 'fogged: its health shows through the clear sky').toBeGreaterThan(glow(clear!) * 0.2);
  expect(glow(fogged!), 'fogged: over a third of it under the cloud').toBeLessThan(glow(clear!) * 0.65);
  expect(glow(fogged90!), 'fogged, a later frame').toBeLessThan(glow(clear!) * 0.65);
  expect(ash(fogged!), 'fogged: no smoke over the fogged ground').toBe(0);
  expect(glow(misted!), 'misted (0.07 of the sites): most of the glow shows through').toBeGreaterThan(glow(clear!) * 0.8);
  expect(glow(misted!), 'misted shows clearly more than fogged').toBeGreaterThan(glow(fogged!) * 1.5);
  expect(view.errors).toEqual([]);
});

// The lava smoke over partly fogged ground (PR #117 r1: smoke is tested at its own cell, so one from a
// clear parcel could overlap a fogged neighbour). F1 fogs every file but one settlement (moons and moonlets
// too, so they don't show in both), F2 only that one: a smoke pixel over F1's fogged ground would be an
// ash-coloured pixel in both, since F2 draws that ground (and its smoke) clear.
test('lava smoke never shows over a fogged settlement, head-on and at oblique angles', async ({ page }) => {
  const lava = lavaAt(['src']);
  const src = lava.planets.find((p) => p.path === 'src')!;
  const ids = src.surface.settlements.map((s) => s.fileId);
  const view = await openView(page, systemView());
  const ashes = new Set(palette.world.ash), seen = new Map<string, number>();
  const views = [['head-on', focus('src')], ['yaw +1.1', oblique('src', 1.1, 0)], ['yaw -1.1, pitch -0.5', oblique('src', -1.1, -0.5)], ['pitch +0.6', oblique('src', 0, 0.6)]] as const;
  for (const [vname, cam, keep, i] of views.flatMap(([v, c]) => ids.map((id, i) => [v, c, id, i] as const))) {
    const name = `${vname}, parcel ${i}`;
    const base = { layout: lava, ...cam, depthFade: false };
    const [f1] = await render(view, { ...base, fog: fogFor(lava, (id) => id !== keep) }, [0]);
    const [f2] = await render(view, { ...base, fog: fogFor(lava, (id) => id === keep) }, [0]);
    let both = 0, in1 = 0;
    const { width, height } = f1!.pixels;
    for (let q = 0; q < width * height; q++) {
      if (Math.abs((q % width) - width / 2) > 0.3 * height || !ashes.has(hex(f1!.pixels.rgba, q) as never)) continue;
      in1++;
      if (ashes.has(hex(f2!.pixels.rgba, q) as never)) both++;
    }
    seen.set(vname, (seen.get(vname) ?? 0) + in1); // a parcel on the far side shows no smoke: vacuous per view, not per parcel
    console.log(`smoke over fogged ground, ${name} clear: ${both} of ${in1} ash px also ash with it fogged`);
    // A lone pixel can coincide: smoke from F1's clear parcel and from F2's clear ones may cross at the limb.
    expect(both, name).toBeLessThanOrEqual(Math.ceil(in1 * 0.02));
  }
  for (const [vname, n] of seen) expect(n, `${vname}: not vacuous`).toBeGreaterThan(0);
  expect(view.errors).toEqual([]);
});

// The contrast the fog draws: at overview a fogged lava world beside a clear one. Each planet's glow is
// counted inside its own disc on screen (with the cloud's bulge), so the star's glow never counts.
test('at overview a fogged lava planet glows less than clear (#228 C: over a quarter under the cloud), while its clear neighbour keeps its own', async ({ page }) => {
  const lava = lavaAt(['src', 'docs']);
  const files = (path: string) => { const p = lava.planets.find((x) => x.path === path)!; return [...p.surface.settlements, ...p.moons].map((f) => f.fileId) as string[]; };
  const view = await openView(page, systemView());
  const base = { layout: lava, depthFade: false };
  const [clear] = await render(view, { ...base, fog: fogFor(lava) }, [0]);
  const [srcFogged] = await render(view, { ...base, fog: fogFor(lava, (id) => files('src').includes(id)) }, [0]);
  const [docsFogged] = await render(view, { ...base, fog: fogFor(lava, (id) => files('docs').includes(id)) }, [0]);
  const lavaModel = systemModel(lava), pose = startPose(lavaModel), g = new Set<string>(palette.world.glow);
  const glowIn = (r: Rendered, path: string) => {
    const p = lavaModel.planets.find((x) => x.path === path)!, at = project(pose, planetCentre(p, 0))!;
    const { width, height } = r.pixels, rad = projectedRadius(p.radius, at.depth) * (height / 2) * 1.4;
    const cx = (at.x + 1) / 2 * width, cy = (1 - at.y) / 2 * height;
    let n = 0;
    for (let q = 0; q < width * height; q++) if (Math.hypot((q % width) + 0.5 - cx, Math.floor(q / width) + 0.5 - cy) <= rad && g.has(hex(r.pixels.rgba, q))) n++;
    return n;
  };
  const [sc, sf, dc, df] = [glowIn(clear!, 'src'), glowIn(srcFogged!, 'src'), glowIn(clear!, 'docs'), glowIn(docsFogged!, 'docs')];
  console.log(`overview glow px: src clear ${sc}, fogged ${sf}; docs clear ${dc}, fogged ${df}`);
  expect(sc, 'src, clear, glows').toBeGreaterThan(0);
  expect(dc, 'docs, clear, glows').toBeGreaterThan(0);
  expect(sf, 'src fogged: under the cloud').toBeLessThan(sc * 0.75);
  expect(df, 'docs fogged: under the cloud').toBeLessThan(dc * 0.75);
  expect(glowIn(srcFogged!, 'docs'), 'docs keeps its own glow while src is fogged').toBe(dc);
  expect(glowIn(docsFogged!, 'src'), 'src keeps its own glow while docs is fogged').toBe(sc);
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
  const cloud = (r: Rendered) => count(r, CLOUD, 0.3);
  console.log(`src with no settlement on its grid: ${cloud(unknown!)} cloud px with no fog view, ${cloud(known!)} with every file known clear`);
  expect(cloud(unknown!), 'no fog view: cloud all over').toBeGreaterThan(5000);
  expect(diffPixels(unknown!.pixels, stale!.pixels)).toBe(0);
  expect(cloud(known!), 'not vacuous: known clear files leave it clear').toBeLessThan(cloud(unknown!) / 10);
  expect(view.errors).toEqual([]);
});
