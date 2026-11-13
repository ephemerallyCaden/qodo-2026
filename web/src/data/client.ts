// The view's data source. Live: the hardened local server (#32), every request carrying the
// per-launch token in TOKEN_HEADER (contract). Nothing here talks to any other origin.
import { API, STAR_HOME, TOKEN_HEADER, type ChartResult, type DiffResult, type LiveEvent, type UnseenResult } from '../../../src/core/contract/api.js';
import type { ChartAction, FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import type { DirId, FileId, Sha } from '../../../src/core/snapshot/types.js';
import { checkChartResult, checkDiff, checkFog, checkLayout, checkUnseen, type Checked } from '../model/validate.js';
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
  /** #75: the fogged files of a planet (null: the star) at the head the view shows; a refusal comes back, not thrown. */
  unseen(home: DirId | null, at: Sha): Promise<UnseenResult>;
  /** #75: a file's unseen diff at the head the view shows. Held in memory only, never stored. */
  diff(fileId: FileId, at: Sha): Promise<DiffResult>;
  /** #75: one chart write; the answer carries the new fog, or a refusal. */
  chart(action: ChartAction): Promise<ChartResult>;
}

const HINTS: Record<number, string> = {
  401: 'The server refused the token. Open the exact URL that `commet open` printed.',
  403: 'The server refused this page. Open the exact URL that `commet open` printed.',
  404: 'Nothing there yet. Run `commet scan` in the repository, then reload.',
};

/** The longest server message shown; the server's own are one short line. */
const MAX_MESSAGE = 300;

/**
 * The error for a non-OK answer: the hint for its status when there is one, else the server's own
 * message for users (a state error says what to run, #64). Only a short single-line string
 * `error` field is shown.
 */
export const httpError = (path: string, status: number, body = ''): ViewError => {
  const hint = HINTS[status];
  if (hint) return new ViewError(`${path} answered ${status}.`, [hint]);
  let message: unknown = null;
  try { message = (JSON.parse(body) as { error?: unknown } | null)?.error; } catch { /* not JSON: the status alone */ }
  const ok = typeof message === 'string' && message.length > 0 && message.length <= MAX_MESSAGE && !/\p{Cc}/u.test(message);
  return new ViewError(`${path} answered ${status}.`, ok ? [message as string] : []);
};

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

/** Statuses whose JSON body is an answer the view acts on (a refusal it can explain), not an error. */
const ANSWERS = [200, 400, 404, 409];

const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];

export function serverClient(token: string): DataClient {
  // Every request: the token header, no caching, same origin only, no redirects.
  const init = { headers: { [TOKEN_HEADER]: token }, cache: 'no-store', credentials: 'same-origin', redirect: 'error' } as const;
  /** One request; an unreachable server is a readable error, named by `label` (the route, never its query). */
  const send = async (path: string, label: string, extra: RequestInit = {}): Promise<Response> => {
    try {
      return await fetch(path, { ...init, ...extra });
    } catch {
      throw new ViewError(`Couldn't reach the Commet server for ${label}.`, ['Is `commet open` still running?']);
    }
  };
  const get = async (path: string): Promise<string> => {
    const res = await send(path, path);
    if (!res.ok) throw httpError(path, res.status, await res.text().catch(() => ''));
    return res.text();
  };
  /** A route whose refusals are answers: their body is parsed and checked like a success. */
  const answer = async <T>(path: string, label: string, what: string, check: (v: unknown) => Checked<T>, post?: string): Promise<T> => {
    const res = await send(path, label, post === undefined ? {}
      : { method: 'POST', headers: { ...init.headers, 'content-type': 'application/json' }, body: post });
    if (!ANSWERS.includes(res.status)) {
      // The server's own fixed text (busy, too slow, a state error) says more than the status.
      const said = await res.json().then((b: unknown) => (b as { error?: unknown } | null)?.error, () => undefined);
      const e = httpError(label, res.status);
      throw typeof said === 'string' && said.length <= 200 ? new ViewError(e.title, [said, ...e.detail]) : e;
    }
    return parseChecked(await res.text(), what, label, check);
  };
  return {
    layout: async () => parseLayout(await get(API.layout), API.layout),
    fog: async () => parseFog(await get(API.fog), API.fog),
    unseen: (home, at) => answer(`${API.unseen}?${new URLSearchParams({ home: home ?? STAR_HOME, at })}`, API.unseen, 'unseen list', checkUnseen),
    diff: (fileId, at) => answer(`${API.diff}?${new URLSearchParams({ fileId, at })}`, API.diff, 'diff', checkDiff),
    chart: (action) => answer(API.chart, API.chart, 'chart answer', checkChartResult, JSON.stringify(action)),
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
