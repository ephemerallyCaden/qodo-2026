// File access for `commet open`: the built bundle (an allowlist: no listing, no traversal, no
// symlinks) and the state files under `.git/commet/` (never read through a symlink, Rule 2).
import { constants } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_DIST } from '../core/contract/api.js';
import { CommetError, EXIT } from '../core/errors.js';

/** `dist/web` of this package. src/server and dist/server both sit two levels below the package root. */
export function packageWebRoot(): string {
  return join(fileURLToPath(new URL('../../', import.meta.url)), WEB_DIST);
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

export function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Most files a bundle may hold; a wrong root (a home directory, say) stops here instead of walking it all. */
const MAX_BUNDLE_FILES = 10_000;

/**
 * The allowlist of servable files: request path (`/assets/app.js`) → absolute path, walked once
 * under the real root. Only regular files are listed; symlinks, dotfiles and dot-directories are
 * skipped, and a directory is never itself a key, so nothing is ever listed. Requests are looked up
 * here and never joined onto the filesystem (system design §9). Null when the root is missing.
 */
export async function loadBundle(root: string): Promise<Map<string, string> | null> {
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    return null;
  }
  const files = new Map<string, string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}/${e.name}`);
      else if (e.isFile()) {
        if (files.size >= MAX_BUNDLE_FILES) throw new CommetError(`the web bundle has more than ${MAX_BUNDLE_FILES} files`, EXIT.internal);
        files.set(`${prefix}/${e.name}`, join(dir, e.name));
      }
    }
  };
  await walk(realRoot, '');
  return files;
}

/** The allowlist key a request path names (`/` is `/index.html`), or null for malformed percent-encoding. */
export function bundleKey(pathname: string): string | null {
  try {
    const key = decodeURIComponent(pathname);
    return key === '/' ? '/index.html' : key;
  } catch {
    return null;
  }
}

/** One allowlisted file, re-checked at read time: a file swapped for a symlink since startup is refused. */
export function readBundleFile(file: string): Promise<Buffer | null> {
  return readRegularFile(file).catch(() => null);
}

/** The state files the server reads, all written by `commet scan`. */
export const STATE_FILES = { snapshot: 'snapshot.json', layout: 'layout.json' } as const;
export const NO_SNAPSHOT = 'no snapshot yet: run `commet scan` first';

/**
 * A state file (`snapshot.json`, `layout.json`) from the already-checked state dir, or null when it
 * doesn't exist. A symlink or non-file there is a state error, never followed (Rule 2). Messages
 * name the file, never its absolute path.
 */
export async function readStateFile(dir: string, name: string): Promise<Buffer | null> {
  try {
    const body = await readRegularFile(join(dir, name));
    if (body === null) throw new CommetError(`state error: .git/commet/${name} is not a regular file`, EXIT.state);
    return body;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (code === 'ELOOP') throw new CommetError(`state error: .git/commet/${name} is a symlink; refusing to read it`, EXIT.state);
    throw e;
  }
}

/** Opens without following a final symlink (ELOOP), then reads only if it's a regular file. */
async function readRegularFile(file: string): Promise<Buffer | null> {
  // O_NOFOLLOW is undefined on Windows; there the allowlist walk, which skips symlinks, is the guard.
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await handle.stat()).isFile()) return null;
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
