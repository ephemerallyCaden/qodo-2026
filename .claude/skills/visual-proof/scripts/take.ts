// visual-proof (R1, A1): one take of a scene in the live view. requestAnimationFrame is replaced by a
// queue that only runs when the take steps it, 50 ms of loop time a tick, so time is the same on every
// take; the page is screenshotted after each recorded tick, and every page text and API response is
// kept for the privacy scan (R5). runTake drives a page it is given (the render spec does that);
// takeMain is a take in its own process: it starts the build's own server in-process, with the scene's
// drones through its hooks (R12), and a fresh Chromium on SwiftShader (the render tests' settings).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from '@playwright/test';
import { context as renderContext, launch as renderLaunch } from '../../../../playwright.config.js';
import type { LayoutV1 } from '../../../../src/core/contract/layout.js';
import { FPS } from '../../../../web/src/model/motion.js';
import { systemModel } from '../../../../web/src/model/system.js';
import { Stop } from './rules.js';
import { REGIONS, TICK_MS, type Boxes, type Scene, type SceneContext, type TakeLog } from './scene.js';

/** dt is clamped like this in web/src/loop.ts (MAX_TICK_MS). */
const MAX_TICK_MS = 100;

declare global {
  interface Window { __vpStep?: (ts: number) => number; __vpEvents?: string[]; __vpKept?: Uint8ClampedArray }
}

/** Installed before the view's own script: the stepped clock and the event-stream tee. */
function instrument(): void {
  const q = new Map<number, FrameRequestCallback>();
  let id = 0;
  window.requestAnimationFrame = (cb) => { const h = ++id; q.set(h, cb); return h; };
  window.cancelAnimationFrame = (h) => { q.delete(h); };
  window.__vpStep = (ts) => { const cbs = [...q.values()]; q.clear(); for (const cb of cbs) cb(ts); return cbs.length; };
  window.__vpEvents = [];
  const f = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await f(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/events') || !res.body) return res;
    const [mine, theirs] = res.body.tee();
    void (async () => {
      const r = mine.getReader(), dec = new TextDecoder();
      for (;;) { const { done, value } = await r.read().catch(() => ({ done: true, value: undefined })); if (done) return; window.__vpEvents!.push(dec.decode(value, { stream: true })); }
    })();
    return new Response(theirs, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

/** In the page: every open region's box, label pixels under each open panel (all, and new since keepLabels), the heading, the text. */
function sample(regions: readonly string[]): { boxes: Boxes; probes: Record<string, number>; heading: string | null; text: string } {
  const boxes: Boxes = {};
  for (const id of regions) {
    const e = document.getElementById(id);
    if (!e || e.hidden) continue;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) boxes[`#${id}`] = { x: r.x, y: r.y, w: r.width, h: r.height };
  }
  const probes: Record<string, number> = {};
  const c = document.getElementById('labels') as HTMLCanvasElement | null;
  if (c && c.width && c.height) {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const kept = window.__vpKept && window.__vpKept.length === d.length ? window.__vpKept : null;
    const cr = c.getBoundingClientRect(), s = c.width / cr.width;
    for (const id of ['panel', 'drone-panel']) {
      const b = boxes[`#${id}`];
      if (!b) continue;
      const x0 = Math.max(0, Math.floor((b.x - cr.x) * s)), x1 = Math.min(c.width, Math.ceil((b.x + b.w - cr.x) * s));
      const y0 = Math.max(0, Math.floor((b.y - cr.y) * s)), y1 = Math.min(c.height, Math.ceil((b.y + b.h - cr.y) * s));
      let all = 0, fresh = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i + 3] !== 0) all++;
          if (kept && (d[i] !== kept[i] || d[i + 1] !== kept[i + 1] || d[i + 2] !== kept[i + 2] || d[i + 3] !== kept[i + 3])) fresh++;
        }
      }
      probes[`label px under #${id}`] = all;
      if (kept) probes[`label px drawn under #${id} since the keep`] = fresh;
    }
  }
  const panel = document.getElementById('panel');
  const heading = panel && !panel.hidden ? (panel.querySelector('h2 .sr')?.textContent ?? null) : null;
  const attrs: string[] = [];
  for (const el of Array.from(document.querySelectorAll('*'))) for (const a of Array.from(el.attributes)) attrs.push(a.value);
  for (const el of Array.from(document.querySelectorAll('input, textarea'))) attrs.push((el as HTMLInputElement).value);
  // Text node by node, hidden ones too: textContent would glue neighbours ("UTC" + "branch") into false tokens
  const nodes: string[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue?.trim()) nodes.push(n.nodeValue);
  return { boxes, probes, heading, text: [document.title, ...nodes, ...attrs].join('\n') };
}

export interface TakeDeps {
  scene: Scene;
  layout: LayoutV1;
  files: readonly string[];
  out: string;
  /** The build's CLI in the clone (mid-take state changes). */
  cli: (...args: string[]) => string;
  /** Filled by the server as requests fail: shown with a page that never came up, and kept in the log. */
  serverErrors?: string[];
}

/** Runs `scene` in `page` (already instrumented with `instrumentPage`) at `url`; writes raw/<k>.png and returns the log. */
export async function runTake(page: Page, url: string, deps: TakeDeps): Promise<TakeLog> {
  const { scene, layout, out } = deps;
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const reduced = scene.reducedMotion ?? false;
  mkdirSync(join(out, 'raw'), { recursive: true });
  const log: TakeLog = { scene: scene.name, width: vp.width, height: vp.height, reducedMotion: reduced, frames: [], stills: [], texts: [], served: [], events: '', notes: [], errors: [], ticks: [] };
  const seenText = new Map<string, number>();
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(`console.error: ${m.text()}`); });
  let inflight = 0, lastNet = Date.now();
  const counted = (u: string) => !u.includes('/api/events');
  page.on('request', (r) => { if (counted(r.url())) { inflight++; lastNet = Date.now(); } });
  const done = (u: string) => { if (counted(u)) { inflight--; lastNet = Date.now(); } };
  page.on('requestfinished', (r) => done(r.url()));
  page.on('requestfailed', (r) => done(r.url()));
  const bodies: Promise<void>[] = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/') || u.pathname === '/api/events') return;
    // Path and query only: the token is in the URL's hash, and never in a request line.
    bodies.push(r.text().then((body) => { log.served.push({ path: u.pathname + u.search, status: r.status(), body }); }, () => {}));
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const settle = async (quietMs = 200) => {
    const t0 = Date.now();
    for (let round = 0; ; round++) {
      await page.evaluate(() => new Promise((r) => setTimeout(r, 10)));
      if (round > 0 && inflight === 0 && Date.now() - lastNet >= quietMs) return;
      if (Date.now() - t0 > 30_000) throw new Stop('scene-unreachable', `the view still had ${inflight} request(s) in flight after 30 s`);
      await sleep(10);
    }
  };

  let ts = 1000, lastTs: number | null = null, clockMs = 0;
  const tick = async () => {
    const n = await page.evaluate((t) => window.__vpStep!(t), ts);
    if (n > 0) {
      // loop.ts's own clock: dt from the last tick that ran, clamped, advancing only while animating
      const dt = lastTs === null ? 0 : Math.min(MAX_TICK_MS, ts - lastTs);
      lastTs = ts;
      if (!reduced) clockMs += dt;
    } else lastTs = null;
    if (n !== 1 && !reduced) log.ticks.push(`tick at ${ts}: ${n} callbacks`);
    ts += TICK_MS;
    await settle(60);
  };

  const model = systemModel(layout);
  let recorded = 0;
  const ctx: SceneContext = {
    page, layout, files: deps.files, model, width: vp.width, height: vp.height, reducedMotion: reduced,
    get frame() { return Math.floor((clockMs * FPS) / 1000); },
    get recorded() { return recorded; },
    async record(n) {
      for (let i = 0; i < n; i++) {
        await tick();
        const s = await page.evaluate(sample, REGIONS);
        const k = recorded++;
        if (!seenText.has(s.text)) { seenText.set(s.text, k); log.texts.push([s.text, k]); }
        writeFileSync(join(out, 'raw', `${String(k).padStart(4, '0')}.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));
        log.frames.push({ k, ts: ts - TICK_MS, frame: ctx.frame, boxes: s.boxes, probes: s.probes, heading: s.heading });
      }
    },
    async advance(n) { for (let i = 0; i < n; i++) await tick(); },
    still(name) {
      if (!recorded) ctx.fail(`still "${name}" before any recorded frame`);
      log.stills.push({ name, k: recorded - 1 });
    },
    settle,
    async waitFor(what, check, timeoutMs = 10_000) {
      const t0 = Date.now();
      while (!(await check())) {
        if (Date.now() - t0 > timeoutMs) ctx.fail(`${what}: not reached in ${timeoutMs / 1000} s`);
        await settle(100);
      }
    },
    async keepLabels() {
      await page.evaluate(() => { const c = document.getElementById('labels') as HTMLCanvasElement; window.__vpKept = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; });
    },
    cli: deps.cli,
    note(text) { log.notes.push(text); },
    fail(message): never { throw new Stop('scene-unreachable', `scene ${scene.name}: ${message}`); },
    async dismissOffer() {
      const b = await page.$('#panel button[data-key="dismiss"]');
      if (!b) ctx.fail('the start panel has no baseline offer to dismiss');
      await b.click();
      await settle();
    },
    heading: () => page.evaluate(() => { const p = document.getElementById('panel'); return p && !p.hidden ? (p.querySelector('h2 .sr')?.textContent ?? null) : null; }),
    async focusPlanet(path) {
      if (!layout.planets.some((p) => p.path === path)) ctx.fail(`the layout has no planet ${path} (it has ${layout.planets.map((p) => p.path).join(', ')})`);
      await page.focus('#view');
      for (let i = 0; i <= layout.planets.length + 1 && (await ctx.heading()) !== path; i++) {
        await page.keyboard.press(']');
        await settle();
        await tick();
      }
      if ((await ctx.heading()) !== path) ctx.fail(`the bracket keys never focused ${path}`);
      await page.waitForSelector('#panel li button', { timeout: 10_000 }).catch(() => ctx.fail(`${path}'s review panel lists no files`));
      await settle();
    },
    async click(x, y) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.up();
      await settle();
    },
    async press(key) { await page.keyboard.press(key); await settle(); },
  };

  await page.goto(url);
  const up = await page.waitForFunction(() => {
    const p = document.getElementById('panel');
    return Boolean(p && !p.hidden && p.querySelector('button')) && document.fonts.status === 'loaded';
  }, null, { timeout: 30_000, polling: 100 }).then(() => true, () => false);
  if (!up) ctx.fail(`the view never showed its review panel (errors: ${[...(deps.serverErrors ?? []), ...log.errors].join('; ') || 'none'})`);
  await settle(500);
  await tick(); // the first tick: dt 0, the frame clock at 0
  try {
    await scene.run(ctx);
  } finally {
    log.errors.push(...(deps.serverErrors ?? []));
  }
  if (!log.stills.length) ctx.fail('it marked no still');
  await settle();
  await Promise.all(bodies);
  log.events = (await page.evaluate(() => window.__vpEvents ?? [])).join('');
  log.served.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.body < b.body ? -1 : a.body > b.body ? 1 : 0));
  return log;
}

/** Adds the stepped clock and the event tee to every page of a context, before the view's script runs. */
export const instrumentPage = async (page: Page): Promise<void> => { await page.addInitScript(instrument); };

export interface TakeConfig {
  /** The built tree (its dist/ serves this take). */
  build: string;
  clone: string;
  /** The clone's .git/commet as the scan and setup left it; copied over the clone's state before the take. */
  stateStart: string;
  /** The clone's `git ls-files`, as JSON: the scene's drones may name these. */
  filesJson: string;
  scene: string;
  out: string;
  /** An empty folder for CLAUDE_CONFIG_DIR: no agent logs, ever. */
  claudeDir: string;
}

type ServerModule = typeof import('../../../../src/server/server.js');
type GuardModule = typeof import('../../../../src/server/guard.js');
type ChartModule = typeof import('../../../../src/state/chart.js');
type BeaconsModule = typeof import('../../../../src/state/beacons.js');
type DiffModule = typeof import('../../../../src/state/diff.js');

/** The build's own module (its dist/), so each side is served by its own code. */
async function fromBuild<T>(build: string, rel: string): Promise<T> {
  return (await import(pathToFileURL(join(build, 'dist', rel)).href)) as T;
}

/** One take in this process: state restored, the build's server up on 127.0.0.1, a fresh browser, the scene, the log written. */
export async function takeMain(cfg: TakeConfig, scenes: Readonly<Record<string, Scene>>): Promise<void> {
  const scene = scenes[cfg.scene];
  if (!scene) throw new Stop('bad-input', `no scene ${cfg.scene}`);
  const state = join(cfg.clone, '.git', 'commet');
  rmSync(state, { recursive: true, force: true });
  cpSync(cfg.stateStart, state, { recursive: true });
  const layout = JSON.parse(readFileSync(join(state, 'layout.json'), 'utf8')) as LayoutV1;
  const [srv, guard, chart, beacons, diff] = await Promise.all([
    fromBuild<ServerModule>(cfg.build, 'server/server.js'), fromBuild<GuardModule>(cfg.build, 'server/guard.js'),
    fromBuild<ChartModule>(cfg.build, 'state/chart.js'), fromBuild<BeaconsModule>(cfg.build, 'state/beacons.js'), fromBuild<DiffModule>(cfg.build, 'state/diff.js'),
  ]);
  const files = JSON.parse(readFileSync(cfg.filesJson, 'utf8')) as string[];
  let scripted: ReturnType<NonNullable<Scene['drones']>> | undefined;
  try {
    scripted = scene.drones?.({ layout, files });
  } catch (e) {
    throw new Stop('scene-unreachable', `scene ${scene.name} drones: ${e instanceof Error ? e.message : String(e)}`);
  }
  const repo = cfg.clone;
  const token = guard.newToken();
  const serverErrors: string[] = [];
  const server = await srv.startServer({
    stateDir: state, webRoot: join(cfg.build, 'dist', 'web'), port: 0, token, pollMs: 100,
    fog: () => chart.readFog(repo), chart: (a) => chart.applyChart(repo, a),
    // R12: drones only from the scene's script; without one, the real reader over a --no-ingest snapshot (none)
    drones: scripted ? async () => scripted.view : () => chart.readDrones(repo),
    droneDetail: scripted?.detail ? async (q) => scripted.detail!(q) : (q) => chart.readDroneDetail(repo, q),
    beacons: () => beacons.readBeacons(repo), beacon: (a) => beacons.applyBeacon(repo, a),
    unseen: (q) => diff.readUnseen(repo, q), diff: (q, s) => diff.readDiff(repo, q, s),
    // A 500's route and message, never the request (open.ts's COMMET_DEBUG); into the take's errors
    onError: (e, route) => { serverErrors.push(`server: ${route} failed: ${e instanceof Error ? e.message : String(e)}`); },
  });
  const browser = await chromium.launch({ ...renderLaunch, args: [...(renderLaunch.args ?? []), '--disable-smooth-scrolling'] });
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg.claudeDir };
  const cli = (...args: string[]) => execFileSync(process.execPath, [join(cfg.build, 'dist', 'cli.js'), ...args], { cwd: repo, env, encoding: 'utf8' });
  try {
    const context = await browser.newContext({ ...renderContext, reducedMotion: scene.reducedMotion ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await instrumentPage(page);
    const log = await runTake(page, server.url, { scene, layout, files, out: cfg.out, cli, serverErrors });
    // R5: the token is in the URL's hash only; if it showed up in anything the page saw, count it and never write it
    const text = JSON.stringify(log, null, 1);
    const parts = text.split(token);
    log.tokenHits = parts.length - 1;
    writeFileSync(join(cfg.out, 'log.json'), log.tokenHits ? JSON.stringify({ ...JSON.parse(parts.join('<launch token>')) as TakeLog, tokenHits: log.tokenHits }, null, 1) : JSON.stringify(log, null, 1));
  } finally {
    await browser.close();
    await server.close();
  }
}
