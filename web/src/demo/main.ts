// The demo's entry (live-demo L2–L4): the real view, HUD, panels and live mode over the demo client,
// which answers from the site's baked data and keeps writes in memory. It opens on a title screen over a
// still of the system's first frame; nothing animates and no input reaches the view until Play. Built by
// `npm run build:demo` (web/vite.demo.config.ts) into dist/demo; the product's dist/web never imports it.
import 'virtual:commet-palette.css';
import '../style.css';
import './demo.css';
import type { RenderInput } from '../../../src/core/contract/api.js';
import { ViewError } from '../data/client.js';
import { renderHook } from '../hook.js';
import { runLive } from '../live.js';
import { byId } from '../ui/dom.js';
import { Hud } from '../ui/hud.js';
import { View } from '../view.js';
import { demoClient, type DemoClient } from './client.js';
import { Legend, paintAll, showBadge, titleScreen } from './page.js';
import { staticSource } from './source.js';

const viewport = () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 });
const describe = (e: unknown): ViewError =>
  e instanceof ViewError ? e : new ViewError('The demo hit an internal error.', [e instanceof Error ? e.message : String(e)]);

/** What the still behind the title shows: the dataset's first frame, with everything the live view would draw on it. */
async function stillInput(client: DemoClient): Promise<RenderInput> {
  const optional = <T>(p: Promise<T>) => p.then((v) => v, () => null);
  const [layout, fog, drones, crew, beacons, cochange] = await Promise.all([client.layout(), client.fog(),
    optional(client.drones()), optional(client.crew()), optional(client.beacons()), optional(client.cochange())]);
  return { layout, fog, drones, crew, beacons, cochange };
}

async function main(): Promise<void> {
  paintAll();
  const played = titleScreen(); // listening from the start: a press while the still loads plays once it's in
  const hud = new Hud();
  let view: View;
  try {
    view = new View(byId<HTMLCanvasElement>('view'), byId<HTMLCanvasElement>('labels'));
  } catch (e) {
    byId('demo-title').hidden = true;
    hud.error('The demo could not start.', [`WebGL 2 isn't available in this browser, so the 3D view can't run (${e instanceof Error ? e.message : String(e)}).`]);
    return;
  }
  let client: DemoClient;
  try {
    client = demoClient(await staticSource(`${import.meta.env.BASE_URL}data/`, location.origin));
  } catch (e) {
    byId('demo-title').hidden = true;
    hud.error('The demo data could not load.', [e instanceof Error ? e.message : String(e)]);
    return;
  }

  // The still: frame 0 from the start pose, as Play will start it, drawn once (and again on a resize).
  const hook = renderHook(view, viewport);
  let still: RenderInput | null = null;
  const drawStill = async () => {
    if (!still) return;
    await hook.load(still);
    await hook.renderFrame(0);
  };
  try {
    still = await stillInput(client);
    await hook.ready;
    await drawStill();
  } catch (e) {
    const err = describe(e);
    byId('demo-title').hidden = true;
    hud.error(err.title, err.detail);
    return;
  }
  // Redraws run one after another, and Play waits for the last: a still drawn after live mode started
  // would put the hook's own settings (no help line, motion on) back over the live view's.
  let drawing = Promise.resolve();
  const onResize = () => { drawing = drawing.then(drawStill, drawStill); };
  addEventListener('resize', onResize);

  await played;

  removeEventListener('resize', onResize);
  await drawing.catch(() => {});
  still = null;
  view.showHelp = true; // the still hid the help line; live mode shows it
  byId('stage').inert = false;
  const legend = new Legend();
  legend.release = () => view.pass.canvas.focus({ preventScroll: true });
  let dpr = devicePixelRatio || 1;
  addEventListener('resize', () => {
    if ((devicePixelRatio || 1) === dpr) return;
    dpr = devicePixelRatio || 1;
    paintAll();
    legend.rescale();
  });
  hud.show();
  // The review panel sits below the HUD's controls, however tall the text scale makes them (demo.css
  // --hud-bottom): the product's fixed 56 px puts the directory view's button under an open panel.
  const hudBox = byId('hud');
  new ResizeObserver(() => document.documentElement.style.setProperty('--hud-bottom', `${Math.ceil(hudBox.getBoundingClientRect().bottom)}px`)).observe(hudBox);
  showBadge();
  await runLive(view, hud, client); // it hands keyboard focus to the map once the system is in
  legend.open(); // then the legend takes it, and gives it back to the map when it closes
}

void main();
