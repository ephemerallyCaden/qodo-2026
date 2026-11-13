// Drives a view through the contract's render hook (docs/contracts/phase2.md, Render hook) in
// Playwright. Pages are served by request interception from an allowlist of repo directories: no
// socket is opened, and any request to another origin is refused, so a render can't depend on (or
// leak to) the network.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import ts from 'typescript';
import { TEST_MODE_PARAM, WEB_DIST, type RenderInput, type RenderStats } from '../../src/core/contract/api.js';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import type { Frame } from './frame.js';
import type { GoldenOptions } from './golden.js';
import type { RenderEnv } from './twin.js';

const ROOT = resolve(import.meta.dirname, '../..');
/** A reserved test TLD: the browser never resolves it, every request is answered from disk. */
const ORIGIN = 'http://render.commet.test';
const HOOK_TIMEOUT_MS = 30_000;
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

/** A page under test: URL path prefixes mapped to repo directories. */
export interface Target {
  name: string;
  /** Page path from the origin root, without the query. */
  entry: string;
  mounts: { url: string; dir: string }[];
  /** Rewrites a served text file in memory. Negative tests only: it never touches the file on disk. */
  patch?: (url: string, source: string) => string;
}

/** The stand-in view (test/render/standin), with its TypeScript transpiled per request. */
export function standin(patch?: Target['patch']): Target {
  return {
    name: 'standin',
    entry: '/test/render/standin/index.html',
    mounts: ['test/render/standin', 'src/core', 'node_modules/three/build'].map((d) => ({ url: `/${d}/`, dir: d })),
    ...(patch ? { patch } : {}),
  };
}

/**
 * The real system view (web/, #30) as `vite build` writes it to dist/web, the bundle `commet open`
 * serves. global-setup.ts builds it before the render tests run.
 */
export function systemView(): Target {
  return { name: 'view', entry: '/index.html', mounts: [{ url: '/', dir: WEB_DIST }] };
}

/** The contract's `mini` fixture (test/fixtures/contract). */
export const MINI = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/contract/mini.layout.json'), 'utf8')) as LayoutV1;
/** Its fog view (#74): the toxic `web` planet's one surface file and one moonlet fogged, one file charted, the rest clear. */
export const MINI_FOG = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/contract/mini.fog.json'), 'utf8')) as FogView;
/** What the suite renders: mini with its fog, so every golden is a fogged frame. */
export const MINI_INPUT = { layout: MINI, fog: MINI_FOG } as const;

/**
 * A fog view for a layout with every drawn file (settlements, moons, moonlets) clear except those
 * `fogged` picks, with matching counts and the layout's head (the view checks it).
 */
export function fogFor(layout: LayoutV1, fogged: (fileId: string) => boolean = () => false): FogView {
  const ids = (p: LayoutV1['planets'][number]) => [...p.surface.settlements.map((s) => s.fileId), ...p.moons.map((m) => m.fileId)];
  const all = [...layout.planets.flatMap(ids), ...layout.star.moonlets.map((m) => m.fileId)].sort();
  const count = (list: string[]) => ({ total: list.length, fogged: list.filter(fogged).length });
  return {
    schemaVersion: 'fog.1', head: layout.source.head, baseline: null,
    files: all.map((fileId) => (fogged(fileId) ? { fileId, state: 'fogged', reasons: ['agent'], since: layout.source.head } : { fileId, state: 'clear', reasons: [], since: null })),
    planets: [...layout.planets].sort((a, b) => (a.dirId < b.dirId ? -1 : 1)).map((p) => ({ dirId: p.dirId, ...count(ids(p)) })),
    star: count(layout.star.moonlets.map((m) => m.fileId)),
  };
}

/** The file for a request path, or null when it's outside every mount. A `.js` request with only a `.ts` beside it is served transpiled. */
function locate(t: Target, pathname: string): { file: string; transpile: boolean } | null {
  const mount = t.mounts.find((m) => pathname.startsWith(m.url));
  if (!mount) return null;
  const dir = resolve(ROOT, mount.dir);
  const file = resolve(dir, decodeURIComponent(pathname.slice(mount.url.length)));
  if (!file.startsWith(dir + sep)) return null;
  if (existsSync(file) && statSync(file).isFile()) return { file, transpile: false };
  const source = file.replace(/\.js$/, '.ts');
  return source !== file && existsSync(source) ? { file: source, transpile: true } : null;
}

function transpile(source: string, fileName: string): string {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
  }).outputText;
}

export interface View {
  page: Page;
  /** Page errors and console errors (a shader compile error lands here). */
  errors: string[];
}

/**
 * Opens a target with the render hook on (unless `testMode` is false) and waits for `ready`. Throws
 * when the hook never appears, `ready` rejects, or the page has no canvas.
 */
export async function openView(page: Page, target: Target, opts: { testMode?: boolean; hookTimeoutMs?: number } = {}): Promise<View> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
    const hit = locate(target, url.pathname);
    if (!hit) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    const ext = hit.transpile ? '.js' : extname(hit.file);
    const type = MIME[ext] ?? 'application/octet-stream';
    if (!type.startsWith('text/') && type !== 'application/json') return route.fulfill({ contentType: type, body: readFileSync(hit.file) });
    let text = readFileSync(hit.file, 'utf8');
    if (target.patch) text = target.patch(url.pathname, text);
    return route.fulfill({ contentType: type, body: hit.transpile ? transpile(text, hit.file) : text });
  });
  const testMode = opts.testMode ?? true;
  await page.goto(`${ORIGIN}${target.entry}${testMode ? `?${TEST_MODE_PARAM}=1` : ''}`);
  const why = () => (errors.length ? `\n  ${errors.join('\n  ')}` : '');
  const hooked = await page.waitForFunction(() => window.__commet !== undefined, null, { timeout: opts.hookTimeoutMs ?? HOOK_TIMEOUT_MS }).then(() => true, () => false);
  if (!hooked) throw new Error(`${target.name}: window.__commet never appeared (${testMode ? 'test mode on' : `opened without ?${TEST_MODE_PARAM}=1`})${why()}`);
  const ready = await page.evaluate(() => window.__commet!.ready.then(() => null, (e: unknown) => String(e)));
  if (ready !== null) throw new Error(`${target.name}: render hook's ready rejected: ${ready}${why()}`);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { width: c.width, height: c.height } : null;
  });
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error(`${target.name}: no canvas in the page${canvas ? ` (it is ${canvas.width}x${canvas.height})` : ''}${why()}`);
  }
  return { page, errors };
}

export interface Rendered { frame: number; stats: RenderStats; pixels: Frame }

/** load(input), then renderFrame(n) and lowResPixels() for each frame, in the order given. */
export async function render(view: View, input: RenderInput, frames: number[]): Promise<Rendered[]> {
  await view.page.evaluate((i) => window.__commet!.load(i), input);
  const out: Rendered[] = [];
  for (const frame of frames) {
    const r = await view.page.evaluate(async (n) => {
      const hook = window.__commet!;
      const stats = await hook.renderFrame(n);
      const { width, height, rgba } = hook.lowResPixels();
      // Validate and pack in the page: a structured clone of 230k numbers is slow, and Uint8Array would wrap bad values silently.
      const bytes = new Uint8Array(rgba.length);
      for (let i = 0; i < rgba.length; i++) {
        const v = rgba[i]!;
        if (!Number.isInteger(v) || v < 0 || v > 255) return { error: `lowResPixels().rgba[${i}] is ${v}, not a byte` };
        bytes[i] = v;
      }
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { stats, width, height, b64: btoa(bin) };
    }, frame);
    if ('error' in r) throw new Error(r.error);
    out.push({ frame, stats: r.stats, pixels: { width: r.width, height: r.height, rgba: new Uint8Array(Buffer.from(r.b64, 'base64')) } });
  }
  return out;
}

/** What this run renders with. Goldens compare strictly only when it equals the one they were made in. */
export async function renderEnv(browser: Browser): Promise<RenderEnv> {
  const page = await browser.newPage();
  try {
    const webgl = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'no WebGL2';
    });
    const playwright = (JSON.parse(readFileSync(join(ROOT, 'node_modules/@playwright/test/package.json'), 'utf8')) as { version: string }).version;
    return { playwright, browser: browser.version(), platform: process.platform, arch: process.arch, webgl };
  } finally {
    await page.close();
  }
}

/** Golden mode from the environment: UPDATE_GOLDEN=1 rewrites, and CI never skips a compare. */
export const goldenOptions = (env: RenderEnv): GoldenOptions => ({ env, update: process.env['UPDATE_GOLDEN'] === '1', ci: Boolean(process.env['CI']) });
