// Minimal static server for the live lab page. Loopback only.
// Serves this directory, plus the one asset-viewer module the lab imports read-only (faces.js).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MOCKUPS = path.dirname(path.dirname(ROOT)); // mockups/ (this lab is mockups/explorations/astronaut-lab)
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5186);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.gif': 'image/gif', '.md': 'text/markdown' };

/** Maps a URL path to a file under the lab, or the shared faces module; null if not allowed. */
export function resolveFile(pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  if (rel === '/asset-viewer/faces.js') return path.join(MOCKUPS, 'asset-viewer', 'faces.js');
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
  }).listen(PORT, HOST, () => console.log(`astronaut lab: http://${HOST}:${PORT}/`));
}
