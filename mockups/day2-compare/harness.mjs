// Headless Chromium (SwiftShader) with both pages served through Playwright request
// interception (static.mjs decides what may load), so nothing touches the network.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MIME, resolveFile } from './static.mjs';

export const ORIGIN = 'http://mockups.local';

export async function openBrowser() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  // A 1280x720 page at device pixel ratio 1, waiting for `ready` on the given window global.
  async function open(url, global) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      const file = u.origin === ORIGIN ? resolveFile(u.pathname) : null;
      if (!file) return route.abort();
      try {
        await route.fulfill({ body: await readFile(file), contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
      } catch {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    });
    page.on('pageerror', (e) => errors.push(e));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(new Error(`[page] ${m.text()}`)); });
    await page.goto(`${ORIGIN}${url}`);
    await page.waitForFunction((g) => window[g]?.ready, global, { timeout: 90000 }).catch((e) => { throw errors[0] ?? e; });
    return page;
  }
  return { browser, errors, open };
}

export const dataUrlBytes = (url) => Buffer.from(url.split(',')[1], 'base64');
