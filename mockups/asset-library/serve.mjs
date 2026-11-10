// Dev server for the asset library. Loopback only (127.0.0.1, not configurable), GET/HEAD of the
// routes.mjs allowlist (static files, plus the allowlisted images of the local art archive), no
// network access at runtime. PORT=... picks the port; ART_ARCHIVE=... points at another archive.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { route, archiveRoot } from './routes.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5190);
const ARCHIVE = archiveRoot();

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const r = await route(req.method, pathname, { archive: ARCHIVE });
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (r.status === 302) return res.writeHead(302, { ...headers, location: r.location }).end();
  if (r.status !== 200) return res.writeHead(r.status, headers).end(r.status === 404 ? 'not found' : '');
  try {
    const body = await readFile(r.file);
    res.writeHead(200, { ...headers, 'content-type': r.type }).end(body);
  } catch {
    res.writeHead(404, headers).end('not found');
  }
}).listen(PORT, HOST, () => {
  console.log(`asset library: http://${HOST}:${PORT}/asset-library/`);
  console.log(`art archive: ${ARCHIVE && existsSync(ARCHIVE) ? 'found' : 'not found (the history view shows no archived images)'}`);
});
