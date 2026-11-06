// Minimal static server for the live lab page. Loopback only.
// Serves this directory, plus the few sibling modules the lab imports read-only: the V2 eyes
// (asset-viewer/faces.js) and the K astronaut from the astronaut lab, for the crew shot.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MOCKUPS = path.dirname(ROOT); // mockups/ (this lab is mockups/drone-lab)
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5192);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.gif': 'image/gif', '.md': 'text/markdown' };
const SHARED = new Set([
  '/asset-viewer/faces.js',
  '/explorations/astronaut-lab/astronaut.js',
  '/explorations/astronaut-lab/params.js',
  '/explorations/astronaut-lab/variants.js',
  '/explorations/astronaut-lab/crew.js',
]);

/** Maps a URL path to a file under the lab, or an allowlisted shared module; null if not allowed. */
export function resolveFile(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); } catch { return null; }
  if (SHARED.has(rel)) return path.join(MOCKUPS, ...rel.split('/').filter(Boolean));
  const file = path.join(ROOT, rel);
  return file.startsWith(ROOT + path.sep) ? file : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer(async (req, res) => {
    const file = resolveFile(new URL(req.url, 'http://localhost').pathname);
    if (!file) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(PORT, HOST, () => console.log(`drone lab: http://${HOST}:${PORT}/`));
}
