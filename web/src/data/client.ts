// The view's data source. Live: the hardened local server (#32), every request carrying the
// per-launch token in TOKEN_HEADER (contract). Nothing here talks to any other origin.
import { API, TOKEN_HEADER, type LiveEvent } from '../../../src/core/contract/api.js';
import type { FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import { checkFog, checkLayout, type Checked } from '../model/validate.js';
import { EventStreamParser } from './sse.js';

/** A failure the view shows as text: a title and the reasons (AC9: a readable error, never a blank canvas). */
export class ViewError extends Error {
  constructor(readonly title: string, readonly detail: readonly string[] = []) {
    super([title, ...detail].join('\n'));
  }
}

export interface DataClient {
  layout(): Promise<LayoutV1>;
  /** The fog view. The view accepts it but doesn't draw fog yet (#30 scope); a failure is shown, not fatal. */
  fog(): Promise<FogView>;
  /** Follows live updates until the returned stop() is called. */
  follow(onEvent: (ev: LiveEvent) => void, onStatus: (status: string) => void): () => void;
}

const HINTS: Record<number, string> = {
  401: 'The server refused the token. Open the exact URL that `commet open` printed.',
  403: 'The server refused this page. Open the exact URL that `commet open` printed.',
  404: 'Nothing there yet. Run `commet scan` in the repository, then reload.',
};

/** The error for a non-OK answer, with the hint for its status when there is one. */
export const httpError = (path: string, status: number): ViewError =>
  new ViewError(`${path} answered ${status}.`, HINTS[status] ? [HINTS[status]!] : []);

/** Parses and checks a document; throws a ViewError that lists what is wrong. */
function parseChecked<T>(text: string, what: string, source: string, check: (v: unknown) => Checked<T>): T {
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new ViewError(`The ${what} from ${source} is not JSON.`); }
  const c = check(v);
  if (!c.ok) throw new ViewError(`The ${what} from ${source} is invalid.`, c.errors);
  return c.value;
}
export const parseLayout = (text: string, source: string): LayoutV1 => parseChecked(text, 'layout', source, checkLayout);
export const parseFog = (text: string, source: string): FogView => parseChecked(text, 'fog view', source, checkFog);

const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];

export function serverClient(token: string): DataClient {
  // Every request: the token header, no caching, same origin only, no redirects.
  const init = { headers: { [TOKEN_HEADER]: token }, cache: 'no-store', credentials: 'same-origin', redirect: 'error' } as const;
  const get = async (path: string): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(path, init);
    } catch {
      throw new ViewError(`Couldn't reach the Commet server for ${path}.`, ['Is `commet open` still running?']);
    }
    if (!res.ok) throw httpError(path, res.status);
    return res.text();
  };
  return {
    layout: async () => parseLayout(await get(API.layout), API.layout),
    fog: async () => parseFog(await get(API.fog), API.fog),
    follow(onEvent, onStatus) {
      const abort = new AbortController();
      let attempt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const retry = (why: string) => {
        if (abort.signal.aborted) return;
        const ms = RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]!;
        onStatus(`live updates paused (${why}); retrying`);
        timer = setTimeout(run, ms);
      };
      const run = async () => {
        let res: Response;
        try {
          res = await fetch(API.events, { ...init, signal: abort.signal });
        } catch {
          retry('server unreachable');
          return;
        }
        if (res.status === 401 || res.status === 403) { onStatus('live updates refused: open the URL `commet open` printed'); return; }
        if (!res.ok || !res.body) { retry(`events answered ${res.status}`); return; }
        attempt = 0;
        onStatus('live');
        const parser = new EventStreamParser();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let reported = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const ev of parser.push(value)) onEvent(ev);
            // a malformed update is ignored, but never silently (Rule 1)
            if (parser.rejected > reported) { reported = parser.rejected; onStatus(`ignored ${reported} malformed live ${reported === 1 ? 'update' : 'updates'}`); }
          }
        } catch {
          // the stream broke (server stopped, network): reconnect below
        }
        retry('stream ended');
      };
      void run();
      return () => { abort.abort(); clearTimeout(timer); };
    },
  };
}
