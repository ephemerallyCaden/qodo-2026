// Dev server for the asset library. Loopback only (127.0.0.1, not configurable), static files
// from the routes.mjs allowlist, no network access at runtime. PORT=... picks the port.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveFile, MIME } from './routes.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5190);

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  if (pathname === '/' || pathname === '/asset-library') return res.writeHead(302, { location: '/asset-library/' }).end();
  const file = resolveFile(pathname);
  if (!file) return res.writeHead(404).end('not found');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, HOST, () => console.log(`asset library: http://${HOST}:${PORT}/asset-library/`));
