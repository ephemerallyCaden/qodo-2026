// Opens the asset library in headless Chromium + SwiftShader and renders planets through it, so
// every measured pixel comes from the asset viewer's own factories and shaders (the library is
// pixel-identical to the viewer; its fidelity test checks that). Pages are served by Playwright
// request interception through the library's own allowlist (../asset-library/routes.mjs, imported
// read-only): no socket is opened and any other request is aborted (no network). three comes from
// this package's node_modules (the same pinned 0.187.0), so the library needs no install.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFile, MIME } from '../asset-library/routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://library.local';
const LIBRARY_THREE = /^\/asset-library\/node_modules\/three\/(.+)$/;

/** A URL pathname -> a file: the library's allowlist, with its three mapped onto ours. */
function resolve(pathname) {
  const file = resolveFile(pathname); // null unless the library would serve it
  const m = LIBRARY_THREE.exec(pathname);
  return file && m ? path.join(HERE, 'node_modules', 'three', m[1]) : file;
}

export const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/** The value after `--name` on the command line, or def. */
export const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };

/** The library page; resolves when it has booted and drawn its catalogue thumbnails (so they don't
 *  compete with the first renders). page.errors collects page errors. */
export async function openLibrary(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = url.origin === ORIGIN ? resolve(url.pathname) : null;
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
  // Startup compiles shaders in SwiftShader (minutes on a busy machine), so navigation gets the same budget.
  await page.goto(`${ORIGIN}/asset-library/index.html`, { timeout: 240000 });
  await page.waitForFunction(() => window.library?.ready && window.library.thumbsDone, null, { timeout: 240000 }).catch((e) => { throw errors[0] ?? e; });
  return page;
}

/** Runs work(page, job) over a shared queue on n browsers in parallel (one library page each). */
export async function runPool(n, queue, work) {
  const browsers = [];
  try {
    await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
      const browser = await launch();
      browsers.push(browser);
      const page = await openLibrary(browser);
      while (queue.length) await work(page, queue.shift());
    }));
  } finally {
    await Promise.all(browsers.map((b) => b.close()));
  }
}

/** Renders a library state (paused) and returns the canvas at internal resolution: { w, h, data } (RGBA bytes). */
export async function render(page, state) {
  const grab = await page.evaluate((s) => {
    window.library.set(s);
    const v = document.getElementById('view');
    const c = Object.assign(document.createElement('canvas'), { width: v.width, height: v.height });
    const x = c.getContext('2d');
    x.drawImage(v, 0, 0);
    // base64 of the raw bytes: a number array of 230k entries takes seconds to cross CDP, this milliseconds
    const d = x.getImageData(0, 0, v.width, v.height).data;
    let bin = '';
    for (let i = 0; i < d.length; i += 8192) bin += String.fromCharCode.apply(null, d.subarray(i, i + 8192));
    return { w: v.width, h: v.height, b64: btoa(bin) };
  }, state);
  if (page.errors.length) throw page.errors[0];
  return { w: grab.w, h: grab.h, data: new Uint8ClampedArray(Buffer.from(grab.b64, 'base64')) };
}

/** Encodes RGBA tiles into one PNG in the page (no image dependency): returns a Buffer. Tiles cross as base64. */
export async function sheetPng(page, sheet) {
  const url = await page.evaluate(async ({ w, h, bg, blits, texts }) => {
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    for (const b of blits) {
      const t = Object.assign(document.createElement('canvas'), { width: b.w, height: b.h });
      t.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(atob(b.b64), (ch) => ch.charCodeAt(0)), b.w, b.h), 0, 0);
      x.drawImage(t, 0, 0, b.w, b.h, b.x, b.y, b.w * b.scale, b.h * b.scale);
    }
    x.textBaseline = 'top';
    for (const t of texts) {
      x.fillStyle = t.color;
      x.font = `${t.size}px monospace`;
      x.fillText(t.text, t.x, t.y);
    }
    return c.toDataURL('image/png');
  }, { ...sheet, blits: sheet.blits.map(({ data, ...b }) => ({ ...b, b64: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64') })) });
  return Buffer.from(url.split(',')[1], 'base64');
}
