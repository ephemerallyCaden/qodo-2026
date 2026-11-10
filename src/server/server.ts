// The hardened local server behind `commet open` (R14). The only listener Commet has: 127.0.0.1,
// Host-checked, token-gated data routes, no CORS. Surface: docs/contracts/phase2.md.
import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { API, TOKEN_HEADER, type ChartResult, type LiveEvent } from '../core/contract/api.js';
import type { ChartAction, FogView } from '../core/contract/fog.js';
import { CommetError } from '../core/errors.js';
import { bundleKey, contentType, loadBundle, NO_SNAPSHOT, readBundleFile, readStateFile, STATE_FILES } from './files.js';
import { BIND_HOST, hostAllowed, parseChartAction, sameOrigin, tokenMatches } from './guard.js';
import { watchState, type StateWatcher } from './watch.js';

export interface ServerOptions {
  /** `<git-common-dir>/commet`, already checked by `stateDir()`. */
  stateDir: string;
  /** The built web bundle, listed once at startup. While it's missing, static requests answer 503 and the API still works. */
  webRoot: string;
  /** 0 picks a free port. */
  port: number;
  token: string;
  /** R5 (#33) fog view. Until it is wired, `GET /api/fog` answers 501. */
  fog?: () => Promise<FogView>;
  /** R5 (#33) chart-state writes. Until they are wired, `POST /api/chart` answers 501. */
  chart?: (action: ChartAction) => Promise<ChartResult>;
  /** Fallback poll for state changes, in ms (fs.watch is the fast path). */
  pollMs?: number;
}

export interface CommetServer {
  port: number;
  /** `http://127.0.0.1:<port>/#t=<token>`. Print it once; never log it. */
  url: string;
  /** True when the web bundle wasn't there at startup. */
  webMissing: boolean;
  close(): Promise<void>;
}

const NO_LAYOUT = 'layout not available yet: run `commet scan` to write it';
const MAX_BODY = 4096;
const MAX_STREAMS = 32;
const SHA = /^[0-9a-f]{40,64}$/;

/**
 * System design §9's policy plus three hardening directives: only the bundle's own scripts, and
 * `connect-src 'self'` keeps an injected script from sending the token anywhere else. No framing.
 */
const CSP = "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";

/** On every response. Deliberately no `Access-Control-*` header of any kind (R14 AC 4). */
const BASE_HEADERS: OutgoingHttpHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': CSP,
};

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export async function startServer(o: ServerOptions): Promise<CommetServer> {
  const streams = new Set<ServerResponse>();
  let port = 0;
  let bundle = await loadBundle(o.webRoot);
  const webMissing = bundle === null;

  const broadcast = (ev: LiveEvent) => {
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of streams) res.write(line);
  };

  const routes = new Map<string, { method: 'GET' | 'POST'; handle: Handler }>([
    [API.snapshot, { method: 'GET', handle: async (_req, res) => sendState(res, STATE_FILES.snapshot, NO_SNAPSHOT) }],
    [API.layout, { method: 'GET', handle: async (_req, res) => sendState(res, STATE_FILES.layout, NO_LAYOUT) }],
    [API.fog, {
      method: 'GET',
      handle: async (_req, res) => o.fog
        ? sendJson(res, 200, await o.fog())
        : sendJson(res, 501, { error: 'fog view not available yet: fog lands with R5' }),
    }],
    [API.chart, { method: 'POST', handle: (req, res) => chart(req, res) }],
    [API.beacon, {
      method: 'POST',
      handle: async (_req, res) => sendJson(res, 501, { ok: false, error: 'beacons are not implemented yet (R10)' }),
    }],
    [API.events, { method: 'GET', handle: async (req, res) => events(req, res) }],
  ]);

  async function sendState(res: ServerResponse, name: string, missing: string): Promise<void> {
    const body = await readStateFile(o.stateDir, name);
    if (body === null) return sendJson(res, 404, { error: missing });
    send(res, 200, body, 'application/json; charset=utf-8');
  }

  async function chart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const type = (req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase();
    if (type !== 'application/json') return sendJson(res, 415, { ok: false, error: 'chart actions are application/json' });
    const raw = await readBody(req, MAX_BODY);
    if (raw === null) return sendJson(res, 413, { ok: false, error: `chart actions are at most ${MAX_BODY} bytes` }, { connection: 'close' });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      return sendJson(res, 400, { ok: false, error: 'body is not JSON' });
    }
    const action = parseChartAction(parsed);
    if (!action) return sendJson(res, 400, { ok: false, error: 'not a chart action' });
    if (!o.chart) return sendJson(res, 501, { ok: false, error: 'chart writes are not implemented yet (R5)' } satisfies ChartResult);
    const result = await o.chart(action);
    if (result.ok) broadcast({ type: 'fog', head: result.fog.head });
    sendJson(res, result.ok ? 200 : 400, result);
  }

  async function events(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (streams.size >= MAX_STREAMS) return sendJson(res, 503, { error: 'too many open event streams' });
    res.writeHead(200, { ...BASE_HEADERS, 'content-type': 'text/event-stream; charset=utf-8' });
    res.write(': commet live updates\n\n');
    streams.add(res);
    req.socket.setTimeout(0);
    res.on('close', () => streams.delete(res));
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 421 Misdirected Request: this server doesn't answer for that authority (system design §9).
    if (!hostAllowed(req.headers.host, port)) return sendText(res, 421, 'host not allowed');
    const target = req.url ?? '';
    // Origin-form only: absolute-form (`GET http://…`) and `*` targets are proxy and OPTIONS forms.
    if (!target.startsWith('/')) return sendText(res, 400, 'bad request target');
    const pathname = target.split(/[?#]/, 1)[0]!;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      if (!sameOrigin(header(req, 'origin'), header(req, 'sec-fetch-site'), port)) {
        return sendJson(res, 403, { error: 'cross-origin request refused' });
      }
      if (!tokenMatches(req.headers[TOKEN_HEADER], o.token)) return sendJson(res, 401, { error: `missing or wrong ${TOKEN_HEADER}` });
      const route = routes.get(pathname);
      if (!route) return sendJson(res, 404, { error: 'no such route' });
      if (req.method !== route.method) return sendJson(res, 405, { error: 'method not allowed' }, { allow: route.method });
      return route.handle(req, res);
    }
    if (req.method !== 'GET') return sendText(res, 405, 'method not allowed', { allow: 'GET' });
    const key = bundleKey(pathname);
    if (key === null) return sendText(res, 400, 'bad path encoding');
    bundle ??= await loadBundle(o.webRoot);
    if (bundle === null) {
      return sendText(res, 503, "Commet's web view isn't built yet (dist/web is missing). The data API is running; build the view, then reload.");
    }
    const file = bundle.get(key);
    const body = file === undefined ? null : await readBundleFile(file);
    if (file === undefined || body === null) return sendText(res, 404, 'not found');
    send(res, 200, body, contentType(file));
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      if (res.headersSent) return void res.destroy();
      // CommetError messages are written for users and carry no paths; anything else stays generic.
      sendJson(res, 500, { error: e instanceof CommetError ? e.message : 'internal error' });
    });
  });
  // Nothing upgrades or tunnels through this server.
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('connect', (_req, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: BIND_HOST, port: o.port, exclusive: true }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address() as AddressInfo;
  if (addr.address !== BIND_HOST) {
    server.close();
    throw new Error('refusing to serve: the listener is not on 127.0.0.1');
  }
  port = addr.port;

  let watcher: StateWatcher;
  try {
    watcher = await watchState(o.stateDir, Object.values(STATE_FILES), (name, body) => {
      const ev = liveEvent(name, body);
      if (!ev) return;
      broadcast(ev);
      // The fog view is derived from the snapshot, so it is stale too once fog is wired.
      if (ev.type === 'snapshot' && o.fog) broadcast({ type: 'fog', head: ev.head });
    }, o.pollMs);
  } catch (e) {
    server.close();
    throw e;
  }

  return {
    port,
    url: `http://${BIND_HOST}:${port}/#t=${o.token}`,
    webMissing,
    close: () => new Promise<void>((resolve) => {
      watcher.close();
      for (const res of streams) res.end();
      streams.clear();
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}

/** The LiveEvent for a changed state file, or null when its head can't be read (nothing to announce). */
function liveEvent(name: string, body: Buffer): LiveEvent | null {
  let doc: unknown;
  try {
    doc = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  const d = doc as { repo?: { head?: unknown }; source?: { head?: unknown } } | null;
  const [type, head] = name === STATE_FILES.snapshot ? ['snapshot', d?.repo?.head] as const : ['layout', d?.source?.head] as const;
  return typeof head === 'string' && SHA.test(head) ? { type, head } : null;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v.join(',') : v;
}

/** The body, or null once it passes `limit` bytes (declared or actual). */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  if (Number(req.headers['content-length'] ?? 0) > limit) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.removeAllListeners('data');
        req.pause();
        resolve(null);
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: Buffer | string, type: string, extra: OutgoingHttpHeaders = {}): void {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  res.writeHead(status, { ...BASE_HEADERS, ...extra, 'content-type': type, 'content-length': buf.length });
  res.end(buf);
}

function sendJson(res: ServerResponse, status: number, value: unknown, extra: OutgoingHttpHeaders = {}): void {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', extra);
}

function sendText(res: ServerResponse, status: number, text: string, extra: OutgoingHttpHeaders = {}): void {
  send(res, status, `${text}\n`, 'text/plain; charset=utf-8', extra);
}
