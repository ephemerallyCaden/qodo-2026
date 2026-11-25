// Opens the lab page in headless Chromium + SwiftShader. The page is served through Playwright
// request interception from the routes.mjs allowlist: no socket is opened and any other request
// is aborted (no network). Shared by lab.mjs and the tests.
import { chromium } from 'playwright';
import { load } from './routes.mjs';

const ORIGIN = 'http://ship.local';

export async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

/** The lab page in capture mode; resolves when window.lab is ready. */
export async function openLab(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const blocked = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) { blocked.push(url.href); return route.abort(); } // no network
    const { status, body, type } = await load(url.pathname);
    if (status === 403) { blocked.push(url.pathname); return route.abort(); }
    await route.fulfill({ status, body, contentType: type });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(new Error(m.text())); });
  page.errors = errors;
  page.blocked = blocked;
  const failed = new Promise((_, reject) => { page.on('pageerror', reject); }); // fail fast on a page error
  failed.catch(() => {});
  await page.goto(`${ORIGIN}/ship-lab/index.html?capture`);
  if (errors.length) throw errors[0];
  // Startup compiles shaders in SwiftShader (minutes on a busy machine): allow 240 s, and surface the page's own error first.
  await Promise.race([page.waitForFunction(() => window.lab?.ready, null, { timeout: 240000 }), failed]).catch((e) => { throw errors[0] ?? e; });
  if (errors.length) throw errors[0];
  return page;
}

/** Writes a data: URL PNG to a Buffer. */
export const pngFrom = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
