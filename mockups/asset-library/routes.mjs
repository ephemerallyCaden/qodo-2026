// Which files the library page may load, shared by the dev server (serve.mjs) and the test and
// screenshot harnesses (Playwright interception), so every request goes through the same
// decision (route()). URL paths mirror mockups/: the page is /asset-library/, and it imports the
// asset viewer's modules (../asset-viewer/*.js) and the astronaut lab's
// (../explorations/astronaut-lab/*.js) read-only. three comes from this package's own
// node_modules (the same pinned 0.187.0).
//
// The local art archive (R11) is served read-only at /art-archive/<path>: only the images the
// iteration view names (history.js IMAGES, an exact allowlist), only PNG and GIF, and only when
// the real path (symlinks resolved) is a file inside the archive's real root. Nothing is listed.
// The archive is <main-checkout>/.archive/art-iteration/, gitignored and never copied into git.
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IMAGES } from './history.js';

export const LIBRARY_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const MOCKUPS = path.dirname(LIBRARY_ROOT);
export const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
export const IMAGE_MIME = { '.png': 'image/png', '.gif': 'image/gif' };
export const ARCHIVE_PREFIX = '/art-archive/';

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

/** The art archive's root: $ART_ARCHIVE, else <main-checkout>/.archive/art-iteration (null outside a git checkout). */
export function archiveRoot(env = process.env) {
  if (env.ART_ARCHIVE) return path.resolve(env.ART_ARCHIVE);
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: LIBRARY_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.join(path.dirname(common), '.archive', 'art-iteration');
  } catch {
    return null;
  }
}

const realRoots = new Map(); // archive root -> its real path (once found; a missing archive is retried)
async function realRoot(root) {
  if (!realRoots.has(root)) realRoots.set(root, await realpath(root));
  return realRoots.get(root);
}

/** An /art-archive/ pathname -> the real path of an allowlisted image file inside the archive, or null. */
export async function resolveArchive(pathname, root, allow = IMAGES) {
  if (!root || !pathname.startsWith(ARCHIVE_PREFIX)) return null;
  let rel;
  try {
    rel = decodeURIComponent(pathname.slice(ARCHIVE_PREFIX.length));
  } catch {
    return null; // malformed percent-encoding
  }
  // The exact allowlist is the gate (no listing, no other files); the rest is defence in depth
  // against traversal, encoded or double-encoded, and against symlinks that leave the archive.
  if (!allow.has(rel) || !IMAGE_MIME[path.extname(rel)]) return null;
  if (/\.\.|\\|%|\0/.test(rel) || path.isAbsolute(rel)) return null;
  try {
    const base = await realRoot(root);
    const file = await realpath(path.join(base, rel));
    if (!file.startsWith(base + path.sep) || !IMAGE_MIME[path.extname(file)]) return null;
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null; // missing archive or file
  }
}

/**
 * The one routing decision for a request: { status, file?, type?, location? }. GET and HEAD only.
 * opts.archive: the archive root (null: no archive, every archive request is a 404); opts.allow:
 * the archive allowlist (tests pass their own).
 */
export async function route(method, pathname, { archive = null, allow = IMAGES } = {}) {
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 };
  if (pathname === '/' || pathname === '/asset-library') return { status: 302, location: '/asset-library/' };
  if (pathname.startsWith(ARCHIVE_PREFIX)) {
    const file = await resolveArchive(pathname, archive, allow);
    return file ? { status: 200, file, type: IMAGE_MIME[path.extname(file)] } : { status: 404 };
  }
  const file = resolveFile(pathname);
  return file ? { status: 200, file, type: MIME[path.extname(file)] ?? 'application/octet-stream' } : { status: 404 };
}
