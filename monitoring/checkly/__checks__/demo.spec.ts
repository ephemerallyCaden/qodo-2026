// The monitor's browser check (live-demo L7): the public demo loads for an anonymous visitor, plays, draws,
// and names its first planet with the file count its own data gives. Run by Checkly hourly (demo.check.ts)
// and locally by `npm test` (playwright.config.ts).
import { test } from '@playwright/test';
import { DEMO_URL, firstPlanet, journey, open } from './journey';

test('the Commet demo opens, plays, draws, and names its first planet', async ({ page }) => {
  test.info().annotations.push({ type: 'site', description: DEMO_URL }); // which site this run checked
  const v = await open(page);
  await journey(page, await firstPlanet(page), v);
});
