// Local runs of the monitor's spec with plain Playwright (live-demo L7), no Checkly key needed:
//   npm test                 the public demo (DEMO_URL, default its GitHub Pages address)
//   npm run test:local       a fresh build of dist/demo, served on 127.0.0.1 by `vite preview`
// tests/ holds the drill's own test: it runs drill.spec.ts and expects it to fail.
import { defineConfig } from '@playwright/test';

const LOCAL = process.env['DEMO_LOCAL'] === '1';
const PORT = Number(process.env['PORT'] ?? 5186);
if (LOCAL) process.env['DEMO_URL'] = `http://127.0.0.1:${PORT}/qodo-2026/`;

export default defineConfig({
  testDir: '.',
  testMatch: ['__checks__/demo.spec.ts', 'tests/**/*.spec.ts'],
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  // The local site: the checkout's own demo build, on loopback only (vite preview binds 127.0.0.1, web/vite.demo.config.ts).
  ...(LOCAL ? { webServer: { command: `npm run build:demo && PORT=${PORT} npx vite preview --config web/vite.demo.config.ts`, cwd: '../..', url: `http://127.0.0.1:${PORT}/qodo-2026/`, reuseExistingServer: false, timeout: 120_000 } } : {}),
});
