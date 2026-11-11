// Which files the lab page may load, shared by the dev server (serve.mjs) and the Playwright
// harness (request interception), so every path goes through the same allowlist. URL paths mirror
// mockups/: the page is /fog-lab/, and it imports read-only the asset viewer's top-level modules
// (../asset-viewer/*.js, in library mode), the drone lab's top-level modules and the asset library's
// drone mapping (drones.js), for the drone in the coexistence scene, with the astronaut lab's crew
// colours the drone palette reads. three comes from this package's
// own node_modules (the same pinned 0.187.0 as the viewer).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MOCKUPS = path.dirname(LAB_ROOT);
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const ALLOW = [
  /^fog-lab\/(index\.html|[\w-]+\.js)$/,
  /^fog-lab\/node_modules\/three\/(build\/three\.module\.js|build\/three\.core\.js|examples\/jsm\/[\w/-]+\.js)$/,
  /^asset-viewer\/[\w-]+\.js$/,
  /^drone-lab\/[\w-]+\.js$/,
  /^explorations\/astronaut-lab\/crew\.js$/, // the drone lab's palette reads the crew colours from it
  /^asset-library\/drones\.js$/,
];

/** A URL pathname -> an absolute file under mockups/, or null when it isn't allowed. */
export function resolveFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (rel === '' || rel === 'fog-lab/') rel = 'fog-lab/index.html';
  if (rel.includes('..') || rel.includes('\\') || !ALLOW.some((re) => re.test(rel))) return null;
  const file = path.join(MOCKUPS, rel);
  return file.startsWith(MOCKUPS + path.sep) ? file : null;
}

/** The response for a URL pathname: { status, body, type }. 403 off the allowlist, 404 if missing. */
export async function load(pathname) {
  const file = resolveFile(pathname);
  if (!file) return { status: 403, body: '', type: 'text/plain' };
  try {
    return { status: 200, body: await readFile(file), type: MIME[path.extname(file)] ?? 'application/octet-stream' };
  } catch {
    return { status: 404, body: 'not found', type: 'text/plain' };
  }
}
