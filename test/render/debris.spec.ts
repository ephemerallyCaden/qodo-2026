// Space debris on the real view (R13, space-debris.md D1–D8; the debris lab's render checks, mockups/debris-lab/
// checks.mjs and test/render.test.mjs on feature/asset-library): mini's debris (RenderInput.debris, the contract's
// mini fixture) draws in exactly 3 more draw calls, in palette colours, and a frame without it has none; 12 pieces
// round every planet and the star with 90 drones, 40 crew and every file fogged stays within the frame budget; a
// piece behind its planet draws nothing; the red outline is a 1 px rim on the body; the debris is loop-locked and
// its lights blink; a swept piece flashes teal, breaks apart and leaves no trace; a selected one's teal is the lit
// band only. Every check fails on a frame with no debris in it.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { RenderInput } from '../../src/core/contract/api.js';
import type { CrewMember, CrewView } from '../../src/core/contract/crew.js';
import type { DebrisPiece, DebrisView } from '../../src/core/contract/debris.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { palette } from '../../src/core/palette.js';
import { focusPose, fromCameraPose, project, projectedRadius, startPose, toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { homeBase } from '../../web/src/drones/place.js';
import { debrisBody, orbitPoint, planDebris, type Piece } from '../../web/src/debris/place.js';
import { drawables } from '../../web/src/debris/select.js';
import { SWEEP_FRAMES } from '../../web/src/debris/sweep.js';
import { LOOP_FRAMES, loopPhase } from '../../web/src/model/motion.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { debrisViewOf } from '../fixtures/debris-view.js';
import { repoDrones } from '../fixtures/drones.js';
import { miniDebris } from '../fixtures/contract/mini.js';
import { selfLikeRoots } from '../fixtures/overview.js';
import { assertRendered, diffPixels, hex, LOW_RES, rgbaAt, type Frame } from './frame.js';
import { checkGolden, describeEnv, GOLDEN_DIR } from './golden.js';
import { eventsPage, fogFor, following, goldenOptions, MINI, MINI_FOG, openView, render, renderEnv, systemView } from './harness.js';
import { BUDGET } from './thresholds.js';
import { paletteProblems, type RenderEnv } from './twin.js';

const model = systemModel(MINI);
const DEBRIS = new Set<string>([...palette.debris.metal, palette.debris.outline.bright, palette.debris.outline.dim, palette.debris.light]);
const TEAL = new Set<string>(palette.accent.teal);
const count = (f: Frame, set: ReadonlySet<string>) => { let n = 0; for (let i = 0; i < f.rgba.length; i += 4) if (set.has(hex(rgbaAt(f.rgba, i)))) n++; return n; };
const at = (f: Frame, x: number, y: number) => hex(rgbaAt(f.rgba, (y * f.width + x) * 4));

/** The focus framing of a mini planet (by path) at `frame`: the hero view, the planet filling 45% of the frame. */
function onPlanet(path: string, frame = 0): ReturnType<typeof toCameraPose> {
  const p = model.planets.find((x) => x.path === path)!;
  return toCameraPose(focusPose(startPose(model), planetCentre(p, frame), p.radius));
}
const SRC = onPlanet('src');
/** mini's debris round src alone: mini's pieces with other homes left out (still mini's head). */
const onlyOn = (view: DebrisView, home: string): DebrisView => {
  const pieces = view.pieces.filter((p) => p.home === home);
  return { ...view, pieces, total: pieces.length, placed: pieces.length, mass: pieces.reduce((n, p) => n + p.lines, 0) };
};
const SRC_ID = model.planets.find((p) => p.path === 'src')!.dirId as DebrisPiece['home'] & string;

/** n invented crew members, the first being you (as crew.spec.ts's). */
function crewOf(l: LayoutV1, n: number): CrewView {
  const members: CrewMember[] = Array.from({ length: n }, (_, i) => ({ person: `p_${(i + 1).toString(16).padStart(12, '0')}` as CrewMember['person'], displayName: `Crew ${i}`, seed: (i * 2654435761) >>> 0, captain: i === 0 }));
  return { schemaVersion: 'crew.1', head: l.source.head, members, total: n, bots: 0, needsRescan: false };
}

/** Where a piece is on the internal frame at `frame` from `pose`: its centre (px), its bound's radius (px) and its depth. */
function onFrame(p: Piece, frame: number, pose: OrbitPose): { x: number; y: number; r: number; depth: number } | null {
  const home = homeBase(model, p.home, frame)!, off = orbitPoint(p.orbit, loopPhase(frame));
  const q = project(pose, [home.centre[0] + off[0], home.centre[1] + off[1], home.centre[2] + off[2]]);
  if (!q) return null;
  return { x: ((q.x + 1) / 2) * LOW_RES.width, y: ((1 - q.y) / 2) * LOW_RES.height, r: projectedRadius(p.bound, q.depth) * (LOW_RES.height / 2), depth: q.depth };
}

test.describe('debris', () => {
  let env: RenderEnv;
  test.beforeAll(async ({ browser }) => {
    env = await renderEnv(browser);
    console.log(`render env: ${describeEnv(env)}`);
  });

  test("draws mini's debris in exactly 3 more draw calls, in palette colours with no teal at rest; a frame without it has none", async ({ page }) => {
    const view = await openView(page, systemView());
    const [bare] = await render(view, { layout: MINI, fog: MINI_FOG, camera: SRC, depthFade: false }, [0]);
    const [full] = await render(view, { layout: MINI, fog: MINI_FOG, debris: miniDebris, camera: SRC, depthFade: false }, [0]);
    for (const r of [bare!, full!]) assertRendered(r.pixels, r.stats, LOW_RES);
    const px = count(full!.pixels, DEBRIS), none = count(bare!.pixels, DEBRIS);
    console.log(`src close-up: ${bare!.stats.drawCalls} → ${full!.stats.drawCalls} draw calls, ${bare!.stats.triangles} → ${full!.stats.triangles} triangles; ${px} debris px (${none} without), ${diffPixels(bare!.pixels, full!.pixels)} px changed`);
    expect(full!.stats.drawCalls - bare!.stats.drawCalls, 'body, outline shell and nav lights: 3 draws for every piece').toBe(3);
    expect(px, 'the debris is drawn').toBeGreaterThan(150);
    expect(none, 'no debris colour without debris').toBe(0);
    expect(paletteProblems(full!.pixels)).toEqual([]);
    expect(count(full!.pixels, TEAL), 'teal is an event, never a piece at rest').toBe(0);
    // more pieces, still 3 draws: the field is one merged mesh
    const [busy] = await render(view, { layout: MINI, fog: MINI_FOG, debris: debrisViewOf(MINI, 12), camera: SRC, depthFade: false }, [0]);
    expect(busy!.stats.drawCalls - bare!.stats.drawCalls).toBe(3);
    expect(view.errors).toEqual([]);
  });

  test('12 pieces round every planet and the star, with 90 drones, 40 crew and every file fogged, stay within 100 draw calls and 500k triangles', async ({ page }) => {
    const view = await openView(page, systemView());
    const fogged = fogFor(selfLikeRoots, () => true);
    const busy: RenderInput = { layout: selfLikeRoots, fog: fogged, drones: repoDrones(selfLikeRoots), crew: crewOf(selfLikeRoots, 40) };
    const [bare] = await render(view, busy, [0]);
    const debris = debrisViewOf(selfLikeRoots, 14); // 14 a body: 12 drawn, 2 counted
    const [full] = await render(view, { ...busy, debris }, [0]);
    for (const r of [bare!, full!]) assertRendered(r.pixels, r.stats, LOW_RES, 0.005);
    console.log(`selfLikeRoots, 90 sessions, 40 crew, all fogged, ${debris.total} pieces: ${bare!.stats.drawCalls} → ${full!.stats.drawCalls} draw calls, ${bare!.stats.triangles} → ${full!.stats.triangles} triangles`);
    expect(full!.stats.drawCalls - bare!.stats.drawCalls).toBe(3);
    expect(full!.stats.drawCalls).toBeLessThanOrEqual(BUDGET.maxDrawCalls);
    expect(full!.stats.triangles).toBeLessThanOrEqual(BUDGET.maxTriangles);
    expect(view.errors).toEqual([]);
  });

  test('a piece behind its planet draws nothing, and some pieces do pass behind it (depth)', async ({ page }) => {
    const view = await openView(page, systemView());
    const debris = debrisViewOf(MINI, 12, [SRC_ID]);
    const pieces = planDebris(model, drawables(debris)).pieces;
    const p = model.planets.find((x) => x.dirId === SRC_ID)!;
    let hiddenChecked = 0, frames = 0;
    for (let f = 0; f < LOOP_FRAMES && frames < 4; f += 60) {
      const pose = fromCameraPose(onPlanet('src', f));
      const c = project(pose, planetCentre(p, f))!;
      const disc = { x: ((c.x + 1) / 2) * LOW_RES.width, y: ((1 - c.y) / 2) * LOW_RES.height, r: projectedRadius(p.radius, c.depth) * (LOW_RES.height / 2) };
      // fully behind: further than the planet's centre by more than its bound, and inside the disc with room to spare
      const behind = pieces.map((q) => onFrame(q, f, pose)).filter((s): s is NonNullable<typeof s> => s !== null && s.depth > c.depth + 0.1
        && Math.hypot(s.x - disc.x, s.y - disc.y) + s.r + 2 < disc.r);
      if (behind.length === 0) continue;
      frames++;
      const cam = onPlanet('src', f);
      const [bare] = await render(view, { layout: MINI, fog: MINI_FOG, camera: cam, depthFade: false }, [f]);
      const [full] = await render(view, { layout: MINI, fog: MINI_FOG, debris, camera: cam, depthFade: false }, [f]);
      let leak = 0;
      for (const s of behind) {
        for (let y = Math.floor(s.y - s.r); y <= Math.ceil(s.y + s.r); y++) for (let x = Math.floor(s.x - s.r); x <= Math.ceil(s.x + s.r); x++) {
          if (Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) <= s.r && at(full!.pixels, x, y) !== at(bare!.pixels, x, y)) leak++;
        }
      }
      console.log(`frame ${f}: ${behind.length} pieces fully behind src, ${leak} px of them drawn`);
      expect(leak, `frame ${f}: pieces behind the planet show through it`).toBe(0);
      expect(count(full!.pixels, DEBRIS), `frame ${f}: the other pieces are drawn`).toBeGreaterThan(0);
      hiddenChecked += behind.length;
    }
    expect(hiddenChecked, 'some pieces pass behind the planet').toBeGreaterThan(0);
    expect(view.errors).toEqual([]);
  });

  test('the red outline is a 1 px rim: it touches the body (at most a corner pixel 2 px off) and covers most of its edge', async ({ page }) => {
    const view = await openView(page, systemView());
    // one intact piece of each class, close up, looking out from its planet so only space is behind it
    const home = model.planets.find((x) => x.path === 'src')!;
    for (const cls of ['branch', 'merged', 'agent'] as const) {
      const one: DebrisView = { ...onlyOn(miniDebris, SRC_ID), pieces: [{ id: 'x_000000000001', cls, home: SRC_ID, ageStep: 0, lines: 9000, seed: 99 }], total: 1, placed: 1, mass: 9000 };
      const piece = planDebris(model, drawables(one)).pieces[0]!;
      const c = planetCentre(home, 0), o = orbitPoint(piece.orbit, 0), w: [number, number, number] = [c[0] + o[0], c[1] + o[1], c[2] + o[2]];
      const out = [o[0], o[1], o[2]].map((v) => v / Math.hypot(...o));
      // the eye just inside the piece's orbit, between it and the planet, looking out along the radius
      const eye = [w[0] - out[0]! * 1.2 * home.radius, w[1] - out[1]! * 1.2 * home.radius, w[2] - out[2]! * 1.2 * home.radius];
      const camera = { position: eye as [number, number, number], target: w, fovDeg: 35 };
      const [r] = await render(view, { layout: MINI, debris: one, camera, depthFade: false }, [0]);
      const f = r!.pixels;
      const red = palette.debris.outline.bright, body = new Set<string>([...palette.debris.metal, palette.debris.light]);
      let rim = 0, far = 0, edge = 0, covered = 0;
      const is = (x: number, y: number, set: ReadonlySet<string> | string) => x >= 0 && y >= 0 && x < f.width && y < f.height && (typeof set === 'string' ? at(f, x, y) === set : set.has(at(f, x, y)));
      const near = (x: number, y: number, set: ReadonlySet<string> | string, d: number) => { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if ((dx || dy) && is(x + dx, y + dy, set)) return true; return false; };
      for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
        if (is(x, y, red)) { rim++; if (!near(x, y, body, 1)) far++; }
        if (is(x, y, body) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !is(x + dx!, y + dy!, body))) { edge++; if (near(x, y, red, 1)) covered++; }
      }
      console.log(`${cls} close-up: ${count(f, body)} body px, ${rim} outline px (${far} not touching the body), outline on ${covered}/${edge} edge px`);
      expect(count(f, body), `${cls}: the piece is drawn`).toBeGreaterThan(40);
      expect(rim, `${cls}: the outline is drawn`).toBeGreaterThan(0);
      expect(far, `${cls}: at most 2% of the outline (or 1 px) is 2 px from the body, where a corner thickens it (the lab's bound)`).toBeLessThanOrEqual(Math.max(1, rim * 0.02));
      expect(covered / edge, `${cls}: the outline covers its edge`).toBeGreaterThan(0.8);
    }
    expect(view.errors).toEqual([]);
  });

  test('is loop-locked: one loop on is the same, the wrap is no bigger than a step, something moves, and the lights blink (D7)', async ({ page }) => {
    const view = await openView(page, systemView());
    const debris = onlyOn(miniDebris, model.planets.find((x) => x.path === 'web')!.dirId);
    const p = model.planets.find((x) => x.path === 'web')!;
    const shell = debrisBody(model, p.dirId)!;
    const step = LOOP_FRAMES / 24;
    const frames = [...Array.from({ length: 24 }, (_, k) => k * step), LOOP_FRAMES];
    const shots: Frame[] = [];
    for (const n of frames) shots.push((await render(view, { layout: MINI, fog: MINI_FOG, debris, camera: following(model, 'web', n), depthFade: false }, [n]))[0]!.pixels);
    // the shell round web, where the focus puts it (the frame's centre): the star and the other planets are off the loop
    const pose = fromCameraPose(following(model, 'web', 0)), q = project(pose, planetCentre(p, 0))!;
    const r = projectedRadius(shell.outer, q.depth) * (LOW_RES.height / 2) + 2, cx = LOW_RES.width / 2, cy = LOW_RES.height / 2;
    // the debris's own pixels: the planet's surface, clouds and moons have their own loop (orbits.spec.ts, fog.spec.ts)
    const diffIn = (a: Frame, b: Frame) => {
      let n = 0;
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
        const ca = at(a, x, y), cb = at(b, x, y);
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r && ca !== cb && (DEBRIS.has(ca) || DEBRIS.has(cb))) n++;
      }
      return n;
    };
    const steps = shots.slice(1, -1).map((s, i) => diffIn(shots[i]!, s));
    const wrap = diffIn(shots.at(-2)!, shots[0]!), same = diffIn(shots[0]!, shots.at(-1)!);
    const lights = shots.slice(0, -1).map((s) => count(s, new Set([palette.debris.light])));
    console.log(`web followed: one loop on ${same} px differ; steps ${Math.min(...steps)}..${Math.max(...steps)} px, wrap ${wrap} px; lit nav-light px over the loop ${lights.join(' ')}`);
    expect(count(shots[0]!, DEBRIS), 'the debris is drawn').toBeGreaterThan(0);
    expect(same, 'one loop on is frame 0').toBe(0);
    expect(wrap, 'the wrap is no bigger than the largest step').toBeLessThanOrEqual(Math.max(...steps));
    expect(Math.max(...steps), 'something moves').toBeGreaterThan(0);
    expect(new Set(lights).size, 'the nav lights blink').toBeGreaterThan(1);
    expect(view.errors).toEqual([]);
  });

  test('a piece gone on the next load flashes teal, breaks apart in 1.2 s and leaves no trace (D6); a selected piece shows teal on its lit band only', async ({ page }) => {
    const ev = await openView(page, eventsPage());
    const all = drawables(onlyOn(miniDebris, SRC_ID));
    const gone = planDebris(model, all).pieces[0]!; // the biggest, in plain view
    const next = all.filter((it) => it.id !== gone.id);
    const F = 240, cam = onPlanet('src', F);
    const frameAt = (n: number) => ev.page.evaluate((k) => window.__events.frame(k), n);
    const asFrame = (f: { width: number; height: number; rgba: number[] }): Frame => ({ width: f.width, height: f.height, rgba: Uint8Array.from(f.rgba) });
    const setup = (items: typeof all) => ev.page.evaluate(async ([l, fog, c, it, head]) => { await window.__events.setup(l, fog, c, 180); window.__events.debris(it, head, false); }, [MINI, MINI_FOG, cam, items, MINI.source.head] as const);
    await setup(all);
    const rest = asFrame(await frameAt(F));
    await ev.page.evaluate(([n, it, head]) => { window.__events.at(n); return window.__events.debris(it, head, true); }, [F, next, MINI.source.head] as const);
    const during = [] as Frame[];
    for (let n = F + 1; n <= F + SWEEP_FRAMES + 1; n++) during.push(asFrame(await frameAt(n)));
    await setup(next);
    const after = asFrame(await frameAt(F + SWEEP_FRAMES + 1));
    const teal = during.map((f) => count(f, TEAL));
    const total = LOW_RES.width * LOW_RES.height;
    console.log(`sweep from frame ${F}: teal px ${teal.join(' ')}; at rest ${count(rest, TEAL)}; the frame after its end vs a load without the piece: ${diffPixels(during.at(-1)!, after)} px`);
    expect(count(rest, TEAL), 'no teal at rest').toBe(0);
    expect(Math.max(...teal.slice(0, 6)), 'the flash is teal').toBeGreaterThan(0);
    expect(Math.max(...teal), 'teal stays under 10% of the frame').toBeLessThan(total * 0.1);
    expect(teal.at(-1), 'no teal after the sweep').toBe(0);
    expect(diffPixels(during.at(-1)!, after), 'no trace: the frame after the sweep is the next load without the piece').toBe(0);
    // a selected piece: teal on the lit band only, an event under 10% of the frame
    await setup(all);
    await ev.page.evaluate((id) => window.__events.selectDebris(id), gone.id);
    const selected = asFrame(await frameAt(F));
    const tealSel = count(selected, TEAL);
    console.log(`selected piece: ${tealSel} teal px`);
    expect(tealSel).toBeGreaterThan(0);
    expect(tealSel).toBeLessThan(count(rest, DEBRIS));
    expect(ev.errors).toEqual([]);
  });

  test('the render hook refuses debris of another scan or a broken view, and draws none for a view that needs a rescan', async ({ page }) => {
    const view = await openView(page, systemView());
    const load = (debris: unknown) => page.evaluate((i) => window.__commet!.load(i as RenderInput).then(() => null, (e: unknown) => String(e)), { layout: MINI, debris });
    expect(await load({ ...miniDebris, head: 'b'.repeat(40) })).toContain('different scans');
    expect(await load({ ...miniDebris, total: 3 })).toContain('invalid debris');
    expect(await load({ ...miniDebris, pieces: [{ ...miniDebris.pieces[0], name: 'feature/x' }, ...miniDebris.pieces.slice(1)] })).toContain('invalid debris'); // no name in the list (Rule 6)
    const [bare] = await render(view, { layout: MINI, camera: SRC, depthFade: false }, [0]);
    const [rescan] = await render(view, { layout: MINI, camera: SRC, depthFade: false, debris: { ...miniDebris, pieces: [], total: 0, placed: 0, mass: 0, unreadable: 0, needsRescan: true } }, [0]);
    expect(diffPixels(bare!.pixels, rescan!.pixels)).toBe(0);
    expect(rescan!.stats.drawCalls).toBe(bare!.stats.drawCalls);
    expect(view.errors.filter((e) => !e.includes('invalid debris') && !e.includes('different scans'))).toEqual([]);
  });

  // New goldens are made in CI's pinned container and committed from its artifact (test/render/README.md).
  const GOLDENS: [string, () => { input: RenderInput; frame: number }][] = [
    ['debris-mini-src-f0', () => ({ input: { layout: MINI, fog: MINI_FOG, debris: miniDebris, camera: SRC }, frame: 0 })],
  ];
  for (const [name, make] of GOLDENS) {
    test(`matches golden ${name}`, async ({ page }, info) => {
      test.skip(!existsSync(join(GOLDEN_DIR, `${name}.png`)) && !process.env['CI'] && process.env['UPDATE_GOLDEN'] !== '1', `no golden ${name} committed yet; CI's artifact provides it`);
      const view = await openView(page, systemView());
      const { input, frame } = make();
      const [bare] = await render(view, { ...input, debris: null }, [frame]);
      const [r] = await render(view, input, [frame]);
      expect(diffPixels(bare!.pixels, r!.pixels), 'the golden frame has debris in it: it differs from the same frame without').toBeGreaterThan(100);
      const result = checkGolden(name, r!.pixels, r!.stats, goldenOptions(env));
      if (result.status === 'unpinned') info.annotations.push({ type: 'golden-informational', description: `${result.diffPixels} px differ (not pinned)` });
      expect(view.errors).toEqual([]);
    });
  }
});
