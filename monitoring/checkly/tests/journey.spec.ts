// The journey's own guards (Qodo PR256 2c6b344c), offline: a request to another origin is stopped before it
// leaves the browser, not only noticed afterwards, and the data the check reads can only come from the site.
import { expect, test } from '@playwright/test';
import { dataUrl, open } from '../__checks__/journey';

const SITE = 'http://site.commet.test/qodo-2026/';

test('a request to another origin never leaves the page, and is recorded', async ({ page }) => {
  let reached = false;
  // the "network": the site's page asks another origin for something as it loads
  await page.context().route('http://site.commet.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: '<!doctype html><title>site</title><script>fetch("http://elsewhere.commet.test/beacon").catch(() => {});</script>' }));
  await page.context().route('http://elsewhere.commet.test/**', (r) => { reached = true; return r.fulfill({ body: 'reached' }); });
  const v = await open(page, SITE);
  await expect.poll(() => v.offsite).toEqual(['http://elsewhere.commet.test']);
  expect(reached, 'the off-site request was sent').toBe(false);
});

test('the data the check reads is a plain JSON file of the site itself', () => {
  expect(dataUrl('manifest.json', SITE)).toBe('http://site.commet.test/qodo-2026/data/manifest.json');
  expect(dataUrl('showcase.layout.json', SITE)).toBe('http://site.commet.test/qodo-2026/data/showcase.layout.json');
  for (const file of ['https://elsewhere.commet.test/layout.json', '//elsewhere.commet.test/layout.json', '../layout.json', 'sub/layout.json', 'layout.js', '']) {
    expect(() => dataUrl(file, SITE), file).toThrow(/plain \.json file of the site/);
  }
});
