// Raw HTTP/1.1 over a real 127.0.0.1 socket, so tests can send what a browser never would: a spoofed
// Host, an un-normalised `..` path, absolute-form targets, no Host at all.
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';

export interface RawResponse { status: number; headers: Record<string, string>; body: string; raw: string }

/** Sends `text` as-is and reads until the server closes the connection. Status 0: closed with no response. */
export function rawHttp(port: number, text: string, host = '127.0.0.1'): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const s = connect(port, host);
    let data = '';
    s.setEncoding('utf8');
    s.on('data', (d: string) => (data += d));
    s.on('close', () => resolve(parseResponse(data)));
    s.on('error', (e: NodeJS.ErrnoException) => (e.code === 'ECONNRESET' ? undefined : reject(e)));
    s.write(text);
  });
}

function parseResponse(raw: string): RawResponse {
  const end = raw.indexOf('\r\n\r\n');
  if (end < 0) return { status: 0, headers: {}, body: '', raw };
  const [statusLine = '', ...lines] = raw.slice(0, end).split('\r\n');
  const headers: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf(':');
    headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return { status: Number(statusLine.split(' ')[1]), headers, body: raw.slice(end + 4), raw };
}

export interface Req {
  method?: string;
  path?: string;
  /** null sends no Host header. Default `127.0.0.1:<port>`. */
  host?: string | null;
  headers?: Record<string, string>;
  body?: string;
}

export function req(port: number, r: Req = {}): Promise<RawResponse> {
  let text = `${r.method ?? 'GET'} ${r.path ?? '/'} HTTP/1.1\r\n`;
  const host = r.host === undefined ? `127.0.0.1:${port}` : r.host;
  if (host !== null) text += `Host: ${host}\r\n`;
  for (const [k, v] of Object.entries(r.headers ?? {})) text += `${k}: ${v}\r\n`;
  if (r.body !== undefined) text += `Content-Length: ${Buffer.byteLength(r.body)}\r\n`;
  return rawHttp(port, `${text}Connection: close\r\n\r\n${r.body ?? ''}`);
}

export interface Stream { text: () => string; close: () => void; status: Promise<number> }

/** Opens a long-lived GET (the events stream) and accumulates what arrives. */
export function openStream(port: number, path: string, headers: Record<string, string>): Stream {
  let text = '';
  const r = httpRequest({ host: '127.0.0.1', port, path, headers });
  const status = new Promise<number>((resolve, reject) => {
    r.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (d: string) => (text += d));
      res.on('error', () => {});
      resolve(res.statusCode ?? 0);
    });
    r.on('error', reject);
  });
  r.end();
  return { text: () => text, close: () => r.destroy(), status };
}

export async function waitFor(cond: () => boolean, timeoutMs = 10_000, what = 'condition'): Promise<void> {
  for (let waited = 0; !cond(); waited += 20) {
    if (waited > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** The LiveEvents received so far on a stream. */
export function liveEvents(text: string): unknown[] {
  return text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}
