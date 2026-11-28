// The drill spec alone, for tests/drill.spec.ts: the same browser settings as playwright.config.ts, and no
// server of its own (the run that starts it already serves the site, or it targets the public demo).
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

const settings = { ...base };
delete settings.webServer;
export default defineConfig({ ...settings, testDir: '..', testMatch: ['__checks__/drill.spec.ts'], outputDir: '../test-results/drill' });
