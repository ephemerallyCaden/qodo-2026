// Render tests (#31, R8): Playwright drives Chromium on SwiftShader through the contract's render
// hook. Only *.spec.ts under test/render; Vitest (npm test) only runs *.test.ts. See test/render/README.md.
import { defineConfig, type BrowserContextOptions, type LaunchOptions } from '@playwright/test';

/** Every page the render tests open uses these, including a browser a test launches itself. */
export const context: BrowserContextOptions = {
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  locale: 'en-US',
  timezoneId: 'UTC',
  serviceWorkers: 'block',
};
/** Software WebGL on every machine: ANGLE's SwiftShader backend, never the host GPU. */
export const launch: LaunchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

export default defineConfig({
  testDir: 'test/render',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results/render',
  // view.spec.ts drives the built view: build dist/web from the current sources first.
  globalSetup: './test/render/global-setup.ts',
  // One worker: SwiftShader is CPU-bound, and serial runs keep the timing comparable between runs.
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  // A render that only passes on retry is nondeterministic: a bug, never a flake to absorb.
  retries: 0,
  timeout: 120_000,
  reporter: process.env['CI'] ? [['list'], ['github']] : 'list',
  use: { ...context, launchOptions: launch },
});
