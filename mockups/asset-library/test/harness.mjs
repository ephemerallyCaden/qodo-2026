// Opens the asset library, and the asset viewer for comparison, in headless Chromium +
// SwiftShader. Pages are served through Playwright request interception by routes.mjs's route(),
// the same decision the dev server makes: no socket is opened, and any request to another origin
// is aborted (no network). The viewer is served as-is from ../asset-viewer, with three from this
// package's node_modules (the same pinned version), so the comparison needs no install in the viewer.
// The art archive (R11) is opts.archive: a root folder (tests use a temp fixture), or null for none.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { route, MOCKUPS, LIBRARY_ROOT } from '../routes.mjs';

export const ORIGIN = 'http://library.local';
const BOOT_MS = 240000; // SwiftShader on a busy machine: boot and page actions
const VIEWER_THREE = /^\/asset-viewer\/node_modules\/three\/(.+)$/;
const DRONE_LAB_THREE = /^\/drone-lab\/node_modules\/three\/(.+)$/;

/** The server's route(), plus the two comparison pages (the viewer's index.html, the drone lab's capture.html), with three mapped to ours. */
async function resolve(method, pathname, archive) {
  const m = VIEWER_THREE.exec(pathname) ?? DRONE_LAB_THREE.exec(pathname);
  if (m) return route(method, `/asset-library/node_modules/three/${m[1]}`);
  if (pathname === '/asset-viewer/index.html') return { status: 200, file: path.join(MOCKUPS, 'asset-viewer', 'index.html'), type: 'text/html' };
  if (pathname === '/drone-lab/capture.html') return { status: 200, file: path.join(MOCKUPS, 'drone-lab', 'capture.html'), type: 'text/html' };
  return route(method, pathname, { archive });
}

export async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

async function newPage(browser, { width = 1280, height = 720 } = {}, archive = null) {
  const page = await browser.newPage({ viewport: { width, height } });
  // Clicks wait for two steady animation frames, and a frame that renders thumbnails in SwiftShader
  // can take many seconds on a busy machine: give actions the boot allowance too.
  page.setDefaultTimeout(BOOT_MS);
  await page.route('**/*', async (req) => {
    const url = new URL(req.request().url());
    if (url.origin !== ORIGIN) return req.abort();
    const r = await resolve(req.request().method(), url.pathname, archive);
    if (r.status !== 200) return req.fulfill({ status: r.status, headers: r.location ? { location: r.location } : {}, body: r.status === 404 ? 'not found' : '' });
    try {
      await req.fulfill({ body: await readFile(r.file), contentType: r.type });
    } catch {
      await req.fulfill({ status: 404, body: 'not found' });
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(new Error(m.text())); });
  page.errors = errors;
  return page;
}

// Startup compiles shaders in SwiftShader (minutes on a busy machine): allow BOOT_MS, from the
// navigation (its load event waits for the page's module scripts) to ready, and surface the page's own error first.
async function waitFor(page, fn) {
  await page.waitForFunction(fn, null, { timeout: BOOT_MS }).catch((e) => { throw page.errors[0] ?? e; });
}

/** The library page (optionally at a URL hash, with an art archive root); resolves when it has booted. */
export async function openLibrary(browser, { hash = '', viewport, archive = null } = {}) {
  const page = await newPage(browser, viewport, archive);
  await page.goto(`${ORIGIN}/asset-library/index.html${hash}`, { timeout: BOOT_MS });
  await waitFor(page, () => window.library?.ready);
  return page;
}

/** The drone lab's capture page (its own renderer, read-only); resolves when it has booted. */
export async function openDroneLab(browser) {
  const page = await newPage(browser);
  await page.goto(`${ORIGIN}/drone-lab/capture.html`, { timeout: BOOT_MS });
  await waitFor(page, () => window.lab?.ready);
  return page;
}

/** The asset viewer page; resolves when it has booted. */
export async function openViewer(browser) {
  const page = await newPage(browser);
  await page.goto(`${ORIGIN}/asset-viewer/index.html`, { timeout: BOOT_MS });
  await waitFor(page, () => window.viewer?.ready);
  return page;
}

/** A canvas (the stage by default) at its internal resolution, as { w, h, data: number[] } (RGBA). */
export const grabCanvas = (page, selector = '#view') => page.evaluate((selector) => {
  const s = document.querySelector(selector);
  const c = Object.assign(document.createElement('canvas'), { width: s.width, height: s.height });
  const x = c.getContext('2d');
  x.drawImage(s, 0, 0);
  return { w: s.width, h: s.height, data: Array.from(x.getImageData(0, 0, s.width, s.height).data) };
}, selector);

/** A catalogue tile's thumbnail: scrolled into view (tiles render as they come near it), once it's current. */
export async function grabTile(page, id) {
  await page.evaluate((id) => document.querySelector(`[data-id="${id}"]`).scrollIntoView({ block: 'center' }), id);
  await page.waitForFunction((id) => window.library.tileReady(id), id, { timeout: BOOT_MS });
  return grabCanvas(page, `[data-id="${id}"] canvas`);
}

/** The page's errors, less the 404s of archived images that a missing art archive causes. */
export const pageErrors = (page) => page.errors.map(String).filter((e) => !/Failed to load resource/.test(e));

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

/** Resolves after two animation frames: the page has drawn whatever it was about to. */
export const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

export const rgbAt = ({ data }, px) => (data[px * 4] << 16) | (data[px * 4 + 1] << 8) | data[px * 4 + 2];
export const hexInt = (h) => parseInt(h.replace('#', ''), 16);
export { LIBRARY_ROOT };
