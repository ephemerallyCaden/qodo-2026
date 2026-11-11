// Playwright global setup (#31 AC 8): builds the web view into dist/web before any render test runs,
// so view.spec.ts always drives a bundle made from the current sources, never a stale one. This is the
// web half of `npm run build` (vite build with web/vite.config.ts, where every build option lives);
// the CLI's tsc half isn't needed to render.
import { join } from 'node:path';
import { build } from 'vite';

export default async function globalSetup(): Promise<void> {
  await build({ configFile: join(import.meta.dirname, '../../web/vite.config.ts'), logLevel: 'warn' });
}
