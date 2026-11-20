// Vite build for the web view (#30): `npm run build` writes the static bundle to WEB_DIST (dist/web),
// which `commet open` (#32) serves at `/`. The bundle holds no repo data; it fetches it with the token.
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { WEB_DIST } from '../src/core/contract/api.js';
import { UI_COLOURS } from './src/ui/colours.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const at = (path: string) => fileURLToPath(new URL(path, new URL('..', import.meta.url)));

// The page colours are the UI colour roles (from the palette) as CSS custom properties (--space,
// --ink, --dim, --accent) in their own stylesheet, so no colour literal lives in web/ (AGENTS.md
// Rule 5) and the page never flashes another background before the script runs. A stylesheet, not
// an inline <style>, so the server's CSP needs no 'unsafe-inline'.
const PALETTE_CSS = 'virtual:commet-palette.css';
function paletteCss(): Plugin {
  const css = `:root {\n${Object.entries(UI_COLOURS).map(([role, hex]) => `  --${role}: ${hex};`).join('\n')}\n}\n`;
  return {
    name: 'commet-palette-css',
    resolveId: (id) => (id === PALETTE_CSS ? `\0${PALETTE_CSS}` : null),
    load: (id) => (id === `\0${PALETTE_CSS}` ? css : null),
  };
}

const port = Number(process.env['PORT'] ?? 5183);

export default defineConfig({
  root: at('web'),
  base: './',
  plugins: [paletteCss()],
  build: {
    outDir: at(WEB_DIST),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1024, // three.js is most of the bundle; it loads once, from 127.0.0.1
  },
  // Dev and preview servers: loopback only, no CORS, and only the folders the view imports
  // (the dev fixture loader reads the contract fixtures; the server's real data never passes here).
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    cors: false,
    fs: { strict: true, allow: [at('web'), at('src/core'), at('test/fixtures/contract'), `${repo}node_modules`] },
  },
  preview: { host: '127.0.0.1', port, strictPort: true, cors: false },
});
