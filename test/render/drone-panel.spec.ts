// #189: a selected drone stays visible beside its own open panel (AC 1, 2): at least half of it, when it's clicked and
// for a whole turn round its home as it orbits, and the panel holds still meanwhile. The panel (#drone-panel) is DOM
// laid over the view canvas, so a drone drawn where it sits can't be seen. These tests drive the built view (dist/web)
// against a real `startServer` on a temp repo, as review.spec.ts does, with requestAnimationFrame stepped by hand
// so the frame number is exact. They measure the drone from the page's own pixels, never from where it should be:
// a test-only WebGL seam skips the drone shader's draws, and the drone's visible pixels are those of the page as the
// user sees it (panels, labels and HUD included) that change when its draws come back. The same seam on the bare
// canvas (every overlay hidden) gives the drone's drawn pixels, so a frame without a drone can't pass.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { WEB_DIST } from '../../src/core/contract/api.js';
import { DETAIL_BUCKETS, type DroneDetailQuery, type DroneDetailResult, type DroneSession, type DroneView } from '../../src/core/contract/drones.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import type { DirId } from '../../src/core/snapshot/types.js';
import { project, startPose } from '../../web/src/camera/pose.js';
import { DRONE_TURNS, placeDrone } from '../../web/src/drones/place.js';
import { FPS, LOOP_FRAMES } from '../../web/src/model/motion.js';
import { systemModel } from '../../web/src/model/system.js';
import { DRONE_FRAG } from '../../web/src/render/drone-shader.js';
import { newToken } from '../../src/server/guard.js';
import { startServer, type CommetServer } from '../../src/server/server.js';
import { readBeacons } from '../../src/state/beacons.js';
import { applyChart, readFog } from '../../src/state/chart.js';
import { readCoChange } from '../../src/state/cochange.js';
import { readDiff, readUnseen } from '../../src/state/diff.js';
import { cli } from '../fixtures/cli.js';
import { droneView, session } from '../fixtures/drones.js';
import { realTempDir, removeTempDirs } from '../fixtures/tmp.js';
import { BLANK } from './thresholds.js';

const WEB = join(import.meta.dirname, '../..', WEB_DIST);
/** In the drone's fragment shader only: how the seam knows a drone program. */
const DRONE_MARK = 'uHeadB';
/** The view's internal frame is 180 px tall (the default pixel height). */
const INTERNAL_H = 180;

interface Hooks { drones?: () => Promise<DroneView>; droneDetail?: (q: DroneDetailQuery) => Promise<DroneDetailResult> }
interface Fixture { dir: string; server: CommetServer; hooks: Hooks; layout: LayoutV1 }

const servers: CommetServer[] = [];
test.afterEach(async () => { for (const s of servers.splice(0)) await s.close(); });
test.afterAll(() => removeTempDirs());

/** review.spec.ts's repo: planets aa (two files) and bb (one), and a README on the star, all fogged; scanned and served with a drone route. */
async function fixture(): Promise<Fixture> {
  const dir = realTempDir('commet-189-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
  for (const [path, text] of [['aa/one.ts', 'one\n'], ['aa/two.ts', 'two\n'], ['bb/three.ts', 'three\n'], ['README.md', '# r\n']]) {
    mkdirSync(dirname(join(dir, path!)), { recursive: true });
    writeFileSync(join(dir, path!), text!);
  }
  git('add', '-A');
  const at = '2026-10-10T09:00:00Z';
  execFileSync('git', ['commit', '-q', '-m', at], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
  expect((await cli(['scan', '--no-ingest', '--no-root'], dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') })).code).toBe(0);
  const hooks: Hooks = {};
  const server = await startServer({
    stateDir: join(dir, '.git', 'commet'), webRoot: WEB, port: 0, token: newToken(), pollMs: 100,
    fog: () => readFog(dir), unseen: (q) => readUnseen(dir, q), diff: (q, s) => readDiff(dir, q, s), chart: (a) => applyChart(dir, a),
    beacons: () => readBeacons(dir),
    cochange: () => readCoChange(dir), // #211, as `commet open` serves it
    drones: () => (hooks.drones ?? (() => Promise.reject(new Error('no drone view set'))))(),
    droneDetail: (q) => (hooks.droneDetail ?? (() => Promise.reject(new Error('no drone detail set'))))(q),
  });
  servers.push(server);
  const layout = JSON.parse(readFileSync(join(dir, '.git', 'commet', 'layout.json'), 'utf8')) as LayoutV1;
  return { dir, server, hooks, layout };
}

/** One drone, session 1 on planet `home` with `seed`, whose panel lists one file edited 3 times in its last slice (as #169's test). */
function oneDrone(f: Fixture, home: string, seed: number): DroneSession {
  const s = session(1, home as DirId, { seed });
  f.hooks.drones = async () => droneView(f.layout.source.head, [s]);
  f.hooks.droneDetail = async (q) => ({ ok: true, schemaVersion: 'drone-detail.1', head: q.at, key: q.key, startedAt: s.startedAt, endedAt: s.endedAt,
    files: [{ fileId: fileIdOf('bb/three.ts'), path: 'bb/three.ts', edits: 3 }], otherFiles: 0, otherEdits: 0,
    buckets: Array.from({ length: DETAIL_BUCKETS }, (_, i) => (i === DETAIL_BUCKETS - 1 ? 3 : 0)), spanMs: 3_600_000, needsRescan: false });
  return s;
}

/**
 * Test seams, before any page script: requestAnimationFrame runs only on `__step(ts)` (the Day 7-9 GIF tools'
 * clock), and while `__hideDrones` is set, draws by a program whose fragment shader holds `mark` are skipped.
 */
function seams(mark: string): void {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  window.requestAnimationFrame = (cb) => { const h = ++id; queue.set(h, cb); return h; };
  window.cancelAnimationFrame = (h) => { queue.delete(h); };
  const w = window as unknown as { __step: (ts: number) => number; __hideDrones: boolean };
  w.__step = (ts) => { const cbs = [...queue.values()]; queue.clear(); for (const cb of cbs) cb(ts); return cbs.length; };
  w.__hideDrones = false;
  const gl = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const sources = new WeakMap<object, string>(), drones = new WeakSet<object>();
  let current: object | null = null;
  const wrap = (name: string, before: (args: unknown[]) => boolean) => {
    const real = gl[name]!;
    gl[name] = function (this: unknown, ...args: unknown[]) { return before(args) ? real.apply(this, args) : undefined; };
  };
  wrap('shaderSource', (a) => { sources.set(a[0] as object, a[1] as string); return true; });
  wrap('attachShader', (a) => { if ((sources.get(a[1] as object) ?? '').includes(mark)) drones.add(a[0] as object); return true; });
  wrap('useProgram', (a) => { current = (a[0] as object | null) ?? null; return true; });
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
    wrap(name, () => !(w.__hideDrones && current !== null && drones.has(current)));
  }
}

/** Any 8-bit RGB or RGBA PNG with any filter (Playwright's screenshots; png.ts reads only its own unfiltered ones). */
function decodeShot(png: Buffer): { width: number; height: number; rgba: Uint8Array } {
  let at = 8, ihdr: Buffer | undefined;
  const idat: Buffer[] = [];
  for (;;) {
    const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8), data = png.subarray(at + 8, at + 8 + len);
    at += 12 + len;
    if (type === 'IHDR') ihdr = data; else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
  }
  const width = ihdr!.readUInt32BE(0), height = ihdr!.readUInt32BE(4), depth = ihdr![8], ct = ihdr![9];
  if (depth !== 8 || (ct !== 2 && ct !== 6) || ihdr![12] !== 0) throw new Error(`unsupported screenshot PNG: depth ${depth}, colour type ${ct}`);
  const bpp = ct === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!, row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0, b = prev[i]!, c = i >= bpp ? prev[i - bpp]! : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (row[i]! + p) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp]!; out[o + 1] = cur[x * bpp + 1]!; out[o + 2] = cur[x * bpp + 2]!; out[o + 3] = bpp === 4 ? cur[x * bpp + 3]! : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

type Shot = ReturnType<typeof decodeShot>;
/** Pixels whose colour differs between two screenshots, and their bounding box. */
function changed(a: Shot, b: Shot): { n: number; box: [number, number, number, number] | null } {
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      if (a.rgba[i] === b.rgba[i] && a.rgba[i + 1] === b.rgba[i + 1] && a.rgba[i + 2] === b.rgba[i + 2]) continue;
      n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return { n, box: n ? [x0, y0, x1, y1] : null };
}
const colours = (s: Shot) => { const seen = new Set<number>(); for (let i = 0; i < s.rgba.length; i += 4) seen.add((s.rgba[i]! << 16) | (s.rgba[i + 1]! << 8) | s.rgba[i + 2]!); return seen.size; };

/** The live view at W×H on the fixture's start pose, its clock held at frame 0 until `advance`. */
async function openLive(page: Page, f: Fixture, W: number, H: number, reduced: boolean) {
  await page.setViewportSize({ width: W, height: H });
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(seams, DRONE_MARK);
  let ts = 1000;
  const tick = (dt: number) => { ts += dt; return page.evaluate((t) => (window as unknown as { __step: (ts: number) => number }).__step(t), ts); };
  await page.goto(f.server.url);
  await expect.poll(async () => { await tick(0); return page.$eval('#drones-hud', (e) => e.textContent ?? ''); }, { timeout: 15_000 }).toContain('1 drone shown');
  let frame = 0;
  const live = {
    get frame() { return frame; },
    /** Runs the view's loop to `to` (motion on): 100 ms ticks, 3 frames each. */
    async advance(to: number) {
      if (reduced || to % 3 !== 0 || to < frame) throw new Error(`can't step to frame ${to}`);
      while (frame < to) { await tick(100); frame += (100 * FPS) / 1000; }
    },
    /** Asks the view to draw its current frame again (a resize redraws), and lets it. */
    async redraw() { await page.evaluate(() => dispatchEvent(new Event('resize'))); await tick(0); await tick(0); },
    /** The page as the user sees it now: canvas, labels, HUD and both panels. */
    shot: async () => decodeShot(await page.screenshot({ caret: 'hide' })),
    /** The drone's pixels on screen now: drawn (on the bare canvas) and visible (in the page as the user sees it). */
    async drone() {
      const seen = await live.shot();
      await page.evaluate(() => { (window as unknown as { __hideDrones: boolean }).__hideDrones = true; });
      await live.redraw();
      const unseen = await live.shot();
      const overlays = (v: string) => page.evaluate((v) => { for (const id of ['labels', 'hud', 'panel', 'drone-panel']) document.getElementById(id)!.style.setProperty('visibility', v, 'important'); }, v);
      await overlays('hidden');
      const bareWithout = await live.shot();
      await page.evaluate(() => { (window as unknown as { __hideDrones: boolean }).__hideDrones = false; });
      await live.redraw();
      const bare = await live.shot();
      await overlays('visible');
      const drawn = changed(bare, bareWithout), visible = changed(seen, unseen);
      const panel = await page.$eval('#drone-panel', (e) => { const r = e.getBoundingClientRect(); return (e as HTMLElement).hidden ? null : [r.left, r.top, r.right, r.bottom].map(Math.round); });
      return { frame, drawn: drawn.n, visible: visible.n, drawnBox: drawn.box, panel, colours: colours(bare) };
    },
  };
  await live.redraw();
  return live;
}

/** Clicks the drone of `s` where it is drawn at `frame` from the start pose, and waits for its panel's file list. */
async function select(page: Page, f: Fixture, s: DroneSession, frame: number, W: number, H: number): Promise<void> {
  const model = systemModel(f.layout);
  const at = project(startPose(model), placeDrone(model, s.home!, s.seed, frame)!.centre)!;
  await page.mouse.click(((at.x + 1) / 2) * W, ((1 - at.y) / 2) * H);
  await page.waitForSelector('#drone-panel:not([hidden]) li', { timeout: 10_000 });
}

const VIEWPORTS = [[1280, 720], [1920, 1080]] as const;
/** One turn of a drone round its home, in frames (24 s). */
const TURN = LOOP_FRAMES / DRONE_TURNS;
/** A drone has at least this many internal pixels drawn (×scale² device px at dpr 1), so an empty frame can't pass. */
const MIN_DRONE_PX = 4;

test.describe('#189 the selected drone beside its open panel', () => {
  test('the drone seam is still keyed to the drone shader', () => {
    expect(DRONE_FRAG, `the seam finds drone programs by ${DRONE_MARK}; pick another of the drone shader's own names`).toContain(DRONE_MARK);
  });

  // Planet bb sits low on the left of the start pose (x 72, y 472 of 1280x720). Seed 28's drone is drawn left of bb,
  // low in the frame, in front of it at frame 0: x 16-71, y 508-559 at 1280x720 and x 24-107, y 762-839 at 1920x1080,
  // where the panel opened before #189 (x 8-297, y 299-680 and y 659-1040). Reduced motion holds frame 0 and cuts any glide.
  for (const [W, H] of VIEWPORTS) {
    test(`a drone selected at the bottom left of its planet stays at least half visible beside its own panel at ${W}x${H} (AC 1, 2)`, async ({ page }) => {
      const f = await fixture();
      const bb = systemModel(f.layout).planets.find((p) => p.path === 'bb')!;
      const s = oneDrone(f, bb.dirId, 28);
      const live = await openLive(page, f, W, H, true);
      await select(page, f, s, 0, W, H);
      await live.redraw();
      const got = await live.drone();
      const minPx = MIN_DRONE_PX * (H / INTERNAL_H) ** 2;
      expect(got.colours, 'the bare frame rendered').toBeGreaterThanOrEqual(BLANK.minColours);
      expect(got.drawn, `the selected drone is drawn (${JSON.stringify(got)})`).toBeGreaterThanOrEqual(minPx);
      expect(got.visible, `pixels of the selected drone the user can see with its panel open: at least half (${JSON.stringify(got)})`).toBeGreaterThanOrEqual(got.drawn / 2);
    });
  }

  // Seed 78's drone at 1920x1080 is clear of the panel when it's clicked (x 180-251, y 576-647 at frame 0, above the
  // panel's top at 659 before #189), then orbits down to where that panel was: fully under it from frame 93 (3.1 s) to
  // 327 (10.9 s). Every second for one whole turn round bb (24 s), while it is drawn on screen, at least half of it must
  // be visible, and the panel must hold still: the camera doesn't move, so nothing should move it while the user reads.
  test('a selected drone that orbits towards its open panel stays at least half visible for a whole turn, the panel holding still, at 1920x1080 (AC 1)', async ({ page }) => {
    test.setTimeout(300_000); // 25 samples of four 1080p screenshots each on SwiftShader
    const [W, H] = [1920, 1080];
    const f = await fixture();
    const bb = systemModel(f.layout).planets.find((p) => p.path === 'bb')!;
    const s = oneDrone(f, bb.dirId, 78);
    const live = await openLive(page, f, W, H, false);
    await select(page, f, s, 0, W, H);
    await live.redraw();
    const minPx = MIN_DRONE_PX * (H / INTERNAL_H) ** 2;
    const first = await live.drone();
    expect(first.colours, 'the bare frame rendered').toBeGreaterThanOrEqual(BLANK.minColours);
    expect(first.drawn, `the selected drone is drawn when clicked (${JSON.stringify(first)})`).toBeGreaterThanOrEqual(minPx);
    expect(first.visible, `the drone is clear of the panel when clicked (${JSON.stringify(first)})`).toBeGreaterThan(first.drawn / 2);
    const samples = [first];
    for (let fr = 30; fr <= TURN; fr += 30) {
      await live.advance(fr);
      samples.push(await live.drone());
    }
    const onScreen = samples.filter((x) => x.drawn >= minPx);
    expect(onScreen.length, 'the drone is drawn in most samples, so the check is not empty').toBeGreaterThanOrEqual(samples.length / 2);
    const hidden = onScreen.filter((x) => x.visible < x.drawn / 2).map((x) => `frame ${x.frame} (${(x.frame / FPS).toFixed(1)} s): ${x.visible} of ${x.drawn} px visible at ${JSON.stringify(x.drawnBox)}, panel ${JSON.stringify(x.panel)}`);
    expect(hidden, 'samples where the selected drone is drawn but less than half of it is visible').toEqual([]);
    expect([...new Set(samples.map((x) => JSON.stringify(x.panel)))], 'where the panel is, sample by sample: one place').toHaveLength(1);
  });
});
