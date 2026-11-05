// The files the comparison pages may load: only day2-compare/ and asset-viewer/ under mockups/.
// Used by the headless harness (Playwright request interception, so no socket is opened).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = ['day2-compare', 'asset-viewer'].map((d) => path.join(ROOT, d) + path.sep);
export const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };

// URL pathname -> absolute file path, or null if it is outside the allowed dirs.
export function resolveFile(pathname) {
  let file = path.join(ROOT, decodeURIComponent(pathname));
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  return ALLOWED.some((d) => file.startsWith(d)) ? file : null;
}
