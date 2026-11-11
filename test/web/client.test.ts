// The live data client (#30) against a fake fetch: the token header on every request, readable
// errors for each failure, and live updates that are never dropped silently (Rule 1).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, TOKEN_HEADER } from '../../src/core/contract/api.js';
import { ViewError, serverClient } from '../../web/src/data/client.js';
import { miniLayout } from '../fixtures/contract/mini.js';

const TOKEN = 'aB3-_cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX4yZ5a';
type Call = { url: string; init: RequestInit };

function fakeFetch(answer: (url: string) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, init }); return answer(url); });
  return calls;
}
const stream = (text: string) => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }), { status: 200 });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('serverClient', () => {
  it('sends the token header, same-origin, uncached and without redirects', async () => {
    const calls = fakeFetch(() => new Response(JSON.stringify(miniLayout), { status: 200 }));
    expect((await serverClient(TOKEN).layout()).planets).toHaveLength(3);
    expect(calls[0]!.url).toBe(API.layout);
    expect(calls[0]!.init).toMatchObject({ headers: { [TOKEN_HEADER]: TOKEN }, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  });

  it('turns a refusal, a 404 or bad JSON into a readable ViewError', async () => {
    fakeFetch(() => new Response('', { status: 401 }));
    await expect(serverClient(TOKEN).layout()).rejects.toThrow(/answered 401[\s\S]*refused the token/);
    fakeFetch(() => new Response('', { status: 404 }));
    await expect(serverClient(TOKEN).layout()).rejects.toThrow(/Run `commet scan`/);
    fakeFetch(() => new Response('{not json', { status: 200 }));
    await expect(serverClient(TOKEN).layout()).rejects.toBeInstanceOf(ViewError);
  });

  it('shows the server\'s message for a status without a hint, such as a mismatched pair\'s 500 (#64), and only a short single line', async () => {
    const message = 'state error: the snapshot (of aaaaaaa) and the layout (of bbbbbbb) come from different scans; run `commet scan`';
    fakeFetch(() => new Response(JSON.stringify({ error: message }), { status: 500 }));
    await expect(serverClient(TOKEN).fog()).rejects.toMatchObject({ title: `${API.fog} answered 500.`, detail: [message] });
    // A status with a hint keeps the hint.
    fakeFetch(() => new Response(JSON.stringify({ error: message }), { status: 404 }));
    await expect(serverClient(TOKEN).fog()).rejects.toMatchObject({ detail: [expect.stringContaining('Run `commet scan` in the repository')] });
    for (const body of ['', 'oops', '{"error":7}', JSON.stringify({ error: 'x'.repeat(301) }), JSON.stringify({ error: 'two\nlines' }), 'null']) {
      fakeFetch(() => new Response(body, { status: 500 }));
      await expect(serverClient(TOKEN).fog(), body).rejects.toMatchObject({ title: `${API.fog} answered 500.`, detail: [] });
    }
  });

  it('follows events and reports malformed ones instead of dropping them silently', async () => {
    vi.useFakeTimers();
    const calls = fakeFetch(() => stream(': hi\n\ndata: {"type":"layout","head":"abc"}\n\ndata: garbage\n\n'));
    const events: unknown[] = [], status: string[] = [];
    const stop = serverClient(TOKEN).follow((e) => events.push(e), (s) => status.push(s));
    await vi.waitFor(() => expect(status).toContain('ignored 1 malformed live update'));
    expect(events).toEqual([{ type: 'layout', head: 'abc' }]);
    expect(calls[0]!.url).toBe(API.events);
    expect(calls[0]!.init.headers).toEqual({ [TOKEN_HEADER]: TOKEN });
    stop();
  });
});
