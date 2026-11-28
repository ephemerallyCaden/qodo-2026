// The controlled failure (live-demo L7): the monitor's own journey, expecting a planet the demo doesn't
// have, so it fails at the focus step and Checkly sends the alert. Deployed only with CHECKLY_FAIL_DRILL=1
// (demo.check.ts), and removed by the next normal deploy. tests/drill.spec.ts proves it fails.
import { test } from '@playwright/test';
import { journey, NO_SUCH_PLANET, open } from './journey';

test('DRILL: the demo names a planet that does not exist', async ({ page }) => {
  const v = await open(page);
  await journey(page, NO_SUCH_PLANET, v);
});
