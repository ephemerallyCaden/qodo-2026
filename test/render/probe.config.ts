// Opt-in probes (`*.probe.ts`): Playwright runs outside CI, for a debugger's evidence. The render tests' own config with
// only the probes matched: `npx playwright test -c test/render/probe.config.ts [<file>]`.
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.js';

export default defineConfig({ ...base, testDir: '.', testMatch: '**/*.probe.ts', globalSetup: './global-setup.ts', outputDir: '../../test-results/probes', timeout: 600_000 });
