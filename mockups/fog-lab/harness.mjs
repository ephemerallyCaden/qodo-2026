// Opens the lab page in headless Chromium + SwiftShader. The page is served through Playwright
// request interception from the routes.mjs allowlist: no socket is opened and any other request
// is aborted (no network). Shared by lab.mjs and the tests.
import { chromium } from 'playwright';
import { load } from './routes.mjs';

const ORIGIN = 'http://fog.local';

export async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

/** The lab page in capture mode; resolves when window.lab is ready. */
export async function openLab(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort(); // no network
    const { status, body, type } = await load(url.pathname);
    if (status === 403) return route.abort();
    await route.fulfill({ status, body, contentType: type });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(new Error(m.text())); });
  page.errors = errors;
  await page.goto(`${ORIGIN}/fog-lab/index.html?capture`);
  // Startup compiles shaders in SwiftShader (minutes on a busy machine): allow 240 s, and surface the page's own error first.
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 240000 }).catch((e) => { throw errors[0] ?? e; });
  if (errors.length) throw errors[0];
  return page;
}

/** Writes a data: URL PNG to a file. */
export const pngFrom = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

/** Decodes a page frame ({ w, h, b64 } RGBA) into { w, h, data: Uint8Array }. */
export const decode = (f) => ({ w: f.w, h: f.h, data: new Uint8Array(Buffer.from(f.b64, 'base64')) });
