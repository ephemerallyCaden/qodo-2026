// Loopback-only dev server for the live lab page: http://127.0.0.1:5195/cochange-lab/
// Serves only the routes.mjs allowlist; anything else is 403.
import { createServer } from 'node:http';
import { load } from './routes.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5195);

createServer(async (req, res) => {
  const { status, body, type } = await load(new URL(req.url, `http://${HOST}`).pathname);
  res.writeHead(status, { 'content-type': type }).end(body);
}).listen(PORT, HOST, () => console.log(`co-change lab: http://${HOST}:${PORT}/cochange-lab/`));
