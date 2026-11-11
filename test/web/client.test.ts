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
