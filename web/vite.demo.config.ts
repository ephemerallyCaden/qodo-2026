// The public demo's build (live-demo L2, L5): `npm run build:demo` writes a static site to dist/demo for
// GitHub Pages, separate from the product's dist/web. It runs the real view (web/src) through the demo
// entry (web/demo/index.html → web/src/demo/main.ts) with the demo data client, and bakes one dataset into
// `data/`: the files its manifest names and nothing else. The build ends with the visual-proof privacy
// scan over everything it wrote and removes the site on any hit, so a site that exists passed it.
//
//   DEMO_DATA=<folder>       the dataset: a manifest.json or a showcase index (default: the showcase
//                            fixture, test/fixtures/showcase, when it's in the tree; else the mini fixture)
//   DEMO_BASE=/qodo-2026/    the path Pages serves it at
//
// Dev server: `npx vite --config web/vite.demo.config.ts`, then open http://127.0.0.1:5184/qodo-2026/demo/
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { MANIFEST_FILE } from './src/demo/source.js';
import { paletteCss } from './vite.config.js';
import { dataFile, dataset, DEMO_DIST, faviconSvg, ROOT, siteBase, siteHits, type Dataset } from './demo/site.js';

/** Serves (dev) and emits (build) the dataset under `<base>data/` and the site's icon, plus `.nojekyll` so Pages serves the site as built. */
function demoData(d: Dataset, base: string): Plugin {
  const files = new Map<string, string>([[MANIFEST_FILE, `${JSON.stringify(d.manifest, null, 2)}\n`]]);
  for (const file of new Set(Object.values(d.manifest.routes))) files.set(file, dataFile(d, file));
  const prefix = `${base}data/`;
  return {
    name: 'commet-demo-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?', 1)[0]!;
        if (path === `${base}favicon.svg` || path === `${base}demo/favicon.svg`) { // the built page sits at the base; the dev page at demo/
          res.setHeader('content-type', 'image/svg+xml');
          return void res.end(faviconSvg());
        }
        const text = path.startsWith(prefix) ? files.get(path.slice(prefix.length)) : undefined;
        if (text === undefined) return next();
        res.setHeader('content-type', 'application/json');
        res.end(text);
      });
    },
    generateBundle() {
      for (const [file, text] of files) this.emitFile({ type: 'asset', fileName: `data/${file}`, source: text });
      this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: faviconSvg() });
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
    },
  };
}

/** The page is web/demo/index.html (root `web`, so dev resolves its ../src imports); the site serves it as its own index. */
function pageAsIndex(): Plugin {
  return {
    name: 'commet-demo-index',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['demo/index.html'];
      if (!page) throw new Error('the demo build wrote no demo/index.html');
      delete bundle['demo/index.html'];
      page.fileName = 'index.html';
      bundle['index.html'] = page;
    },
  };
}

/**
 * The dev server only: drops the page's CSP meta, since Vite's dev client injects its styles as inline
 * <style> elements, which the policy refuses. The built site keeps it (demo.spec.ts checks it there).
 */
function devWithoutCsp(): Plugin {
  return {
    name: 'commet-demo-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
  };
}

/** After the site is written: the bundle scan over every file of it. Any hit fails the build and removes the site. */
function privacyGate(outDir: string): Plugin {
  return {
    name: 'commet-demo-privacy',
    apply: 'build',
    closeBundle() {
      const hits = siteHits(outDir);
      if (hits.length === 0) return;
      rmSync(outDir, { recursive: true, force: true });
      throw new Error(`the demo site failed the privacy scan, so ${DEMO_DIST} was removed:\n${hits.map((h) => `  ${h.rule} in ${h.where}: ${h.excerpt}`).join('\n')}`);
    },
  };
}

const outDir = join(ROOT, DEMO_DIST);
const base = siteBase(process.env['DEMO_BASE']);
const data = dataset(process.env['DEMO_DATA']);
const port = Number(process.env['PORT'] ?? 5184);

export default defineConfig({
  root: join(ROOT, 'web'),
  base,
  publicDir: false,
  // No .env file and no environment variable reaches the page: only this unused prefix would.
  envDir: false,
  envPrefix: 'COMMET_DEMO_PAGE_',
  plugins: [paletteCss(), demoData(data, base), pageAsIndex(), devWithoutCsp(), privacyGate(outDir)],
  build: {
    outDir,
    rollupOptions: { input: join(ROOT, 'web/demo/index.html') }, // only the demo page, never the product's web/index.html
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false }, // the polyfill is an inline script, which the page's CSP refuses
    chunkSizeWarningLimit: 1024, // three.js is most of the bundle
  },
  // The dev server: loopback only, no CORS, only the folders the demo imports.
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    cors: false,
    fs: { strict: true, allow: [join(ROOT, 'web'), join(ROOT, 'src/core'), join(ROOT, 'node_modules')] },
  },
  preview: { host: '127.0.0.1', port, strictPort: true, cors: false },
});
