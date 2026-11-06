// Opens the asset library, and the asset viewer for comparison, in headless Chromium +
// SwiftShader. Pages are served through Playwright request interception from the routes.mjs
// allowlist: no socket is opened and any other request is aborted (no network).
// The viewer is served as-is from ../asset-viewer, with three from this package's node_modules
// (the same pinned version), so the comparison needs no install in the viewer.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveFile, MIME, MOCKUPS, LIBRARY_ROOT } from '../routes.mjs';

export const ORIGIN = 'http://library.local';
const VIEWER_THREE = /^\/asset-viewer\/node_modules\/three\/(.+)$/;

/** Viewer files: its index.html and top-level modules; three is mapped to ours. */
function resolveViewer(pathname) {
  const m = VIEWER_THREE.exec(pathname);
  if (m) return resolveFile(`/asset-library/node_modules/three/${m[1]}`);
  if (pathname === '/asset-viewer/index.html') return path.join(MOCKUPS, 'asset-viewer', 'index.html');
  return resolveFile(pathname);
}

export async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

async function newPage(browser, { width = 1280, height = 720 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = url.origin === ORIGIN ? resolveViewer(url.pathname) : null;
    if (!file) return route.abort();
    try {
      await route.fulfill({ body: await readFile(file), contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(new Error(m.text())); });
  page.errors = errors;
  return page;
}

// Startup compiles shaders in SwiftShader (minutes on a busy machine): allow 240 s, and surface the page's own error first.
async function waitFor(page, fn) {
  await page.waitForFunction(fn, null, { timeout: 240000 }).catch((e) => { throw page.errors[0] ?? e; });
}

/** The library page (optionally at a URL hash); resolves when it has booted. */
export async function openLibrary(browser, { hash = '', viewport } = {}) {
  const page = await newPage(browser, viewport);
  await page.goto(`${ORIGIN}/asset-library/index.html${hash}`);
  await waitFor(page, () => window.library?.ready);
  return page;
}

/** The asset viewer page; resolves when it has booted. */
export async function openViewer(browser) {
  const page = await newPage(browser);
  await page.goto(`${ORIGIN}/asset-viewer/index.html`);
  await waitFor(page, () => window.viewer?.ready);
  return page;
}

/** The canvas at its internal resolution, as { w, h, data: number[] } (RGBA). */
export const grabCanvas = (page) => page.evaluate(() => {
  const s = document.getElementById('view');
  const c = Object.assign(document.createElement('canvas'), { width: s.width, height: s.height });
  const x = c.getContext('2d');
  x.drawImage(s, 0, 0);
  return { w: s.width, h: s.height, data: Array.from(x.getImageData(0, 0, s.width, s.height).data) };
});

/** Pixel stats: unique colours, and how many pixels are not the background (the most common colour). */
export function stats({ data }) {
  const colours = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const c = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    colours.set(c, (colours.get(c) ?? 0) + 1);
  }
  const bg = Math.max(...colours.values());
  return { colours, drawn: data.length / 4 - bg };
}

/** Indices of pixels that differ between two grabs of the same size. */
export function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`size ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  const out = [];
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) out.push(i / 4);
  return out;
}

export const rgbAt = ({ data }, px) => (data[px * 4] << 16) | (data[px * 4 + 1] << 8) | data[px * 4 + 2];
export const hexInt = (h) => parseInt(h.replace('#', ''), 16);
export { LIBRARY_ROOT };
