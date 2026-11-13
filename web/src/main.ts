// Entry. `?test=1` (TEST_MODE_PARAM) is the deterministic render hook for R8 and nothing else;
// otherwise the live view reads its token from `#t=<token>` and fetches from the local server.
import 'virtual:commet-palette.css';
import './style.css';
import { TEST_MODE_PARAM, type RenderHook } from '../../src/core/contract/api.js';
import { serverClient, type DataClient } from './data/client.js';
import { tokenFromHash } from './data/token.js';
import { brokenHook, renderHook } from './hook.js';
import { runLive } from './live.js';
import { byId } from './ui/dom.js';
import { Hud } from './ui/hud.js';
import { View } from './view.js';

declare global {
  interface Window { __commet?: RenderHook }
}

function makeView(): View | string {
  try {
    return new View(byId<HTMLCanvasElement>('view'), byId<HTMLCanvasElement>('labels'));
  } catch (e) {
    return `WebGL 2 isn't available in this browser, so the 3D view can't start (${e instanceof Error ? e.message : String(e)}).`;
  }
}

async function chooseClient(params: URLSearchParams): Promise<DataClient | null> {
  const token = tokenFromHash(location.hash);
  if (token) return serverClient(token);
  // Dev server only: the contract fixtures, through the same checks. Compiled out of dist/web.
  if (import.meta.env.DEV && params.has('fixture')) {
    const { fixtureClient } = await import('./data/fixtures.js');
    return fixtureClient(params.get('fixture') ?? 'mini');
  }
  return null;
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const view = makeView();
  if (params.get(TEST_MODE_PARAM) === '1') {
    window.__commet = typeof view === 'string'
      ? brokenHook(view)
      : renderHook(view, () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }));
    return;
  }
  const hud = new Hud();
  if (typeof view === 'string') { hud.error('The view could not start.', [view]); return; }
  hud.show();
  const client = await chooseClient(params);
  if (!client) {
    hud.error('This page has no access token.', ['Open Commet with `commet open`, which prints the URL to use.']);
    return;
  }
  await runLive(view, hud, client);
}

void main();
