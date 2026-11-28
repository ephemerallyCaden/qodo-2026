// The Checkly project for the public demo (live-demo L7). Constructs live in __checks__/*.check.ts; the
// browser checks name their own Playwright files there, so no spec becomes a check by itself (the drill
// only deploys with CHECKLY_FAIL_DRILL=1, see demo.check.ts).
import { defineConfig } from 'checkly';

export default defineConfig({
  projectName: 'Commet demo monitor',
  logicalId: 'commet-demo-monitor',
  repoUrl: 'https://github.com/ephemerallyCaden/qodo-2026',
  checks: {
    // Hourly from one location: about 730 browser runs a month, inside the Hobby plan's browser-run quota.
    frequency: 60,
    locations: ['us-east-1'],
    // The runtime fixes Playwright and the browser Checkly runs the spec with.
    runtimeId: '2025.04',
    checkMatch: '**/__checks__/**/*.check.ts',
    playwrightConfig: {
      timeout: 120_000, // a cold software-rendered WebGL start compiles every shader first
      use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    },
  },
  cli: {
    runLocation: 'us-east-1',
    retries: 0,
  },
});
