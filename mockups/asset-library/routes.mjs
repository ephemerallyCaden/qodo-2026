// Which files the library page may load, shared by the dev server (serve.mjs) and the test and
// screenshot harnesses (Playwright interception), so every path goes through the same allowlist.
// URL paths mirror mockups/: the page is /asset-library/, and it imports the asset viewer's
// modules (../asset-viewer/*.js) and the astronaut lab's (../explorations/astronaut-lab/*.js)
// read-only. three comes from this package's own node_modules (the same pinned 0.187.0).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIBRARY_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const MOCKUPS = path.dirname(LIBRARY_ROOT);
export const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

// Allowed path patterns (relative to mockups/). Top-level module files only for the two
// read-only imports, so their tests, debug probes and screenshots are never served.
const ALLOW = [
  /^asset-library\/(index\.html|[\w-]+\.js)$/,
  /^asset-library\/node_modules\/three\/(build\/three\.module\.js|build\/three\.core\.js|examples\/jsm\/[\w/-]+\.js)$/,
  /^asset-viewer\/[\w-]+\.js$/,
  /^explorations\/astronaut-lab\/[\w-]+\.js$/,
];

/** A URL pathname -> an absolute file under mockups/, or null when it isn't allowed. */
export function resolveFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (rel === 'asset-library/') rel = 'asset-library/index.html';
  if (rel.includes('..') || rel.includes('\\') || !ALLOW.some((re) => re.test(rel))) return null;
  const file = path.join(MOCKUPS, rel);
  return file.startsWith(MOCKUPS + path.sep) ? file : null;
}
