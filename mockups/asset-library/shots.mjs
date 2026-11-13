// Review screenshots of the library UI in headless Chromium (no socket, no network: the page is
// served by request interception). Usage: node shots.mjs [name ...]  (no names = all) -> out/<name>.png
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launch, openLibrary, settle, pageErrors, LIBRARY_ROOT } from './test/harness.mjs';
import { archiveRoot } from './routes.mjs';
import { crewScene, showcaseScene } from './catalogue.js';

const OUT = path.join(LIBRARY_ROOT, 'out');
const VIEWPORT = { width: 1920, height: 1080 };
const paused = (t = 3) => ({ t, play: false });
const ARCHIVE = archiveRoot(); // the local art archive, for the iteration view's archived images
const history = (family, step, compare = -1, more = {}) => ({ mode: 'history', history: { family, step, compare, ...more }, render: paused() });

// Each shot: open a catalogue item (or set a state), optionally act, then capture.
const SHOTS = {
  catalogue: { viewport: { width: 1920, height: 4200 }, open: 'planets-0' },
  'inspector-astronaut': { open: 'astronauts-3', extra: { render: paused(1.2) } },
  'inspector-astronaut-face': { open: 'astronauts-4', extra: { render: paused(0.4) } },
  'inspector-planet': { open: 'planets-0' }, // lava, the worst band
  'inspector-moon': { open: 'moons-0', extra: { render: paused(4.6) } },
  'inspector-ring': { open: 'rings-1' },
  'inspector-clouds': { open: 'clouds-4' },
  'inspector-fx': { open: 'fx-2' }, // opens at its peak glitch time (catalogue t)
  'inspector-exploration': { open: 'explorations-2' },
  'palette-editor': { open: 'planets-4', act: async (page) => {
    await page.evaluate(() => window.library.set({ ...window.library.state(), palette: { 'land.2': '#c16a7d', 'land.3': '#e5959f', 'ocean.2': '#22896e' }, render: { ...window.library.state().render, t: 3, play: false } }));
    await page.evaluate(() => window.library.editColour('land.2'));
  } },
  'scene-showcase': { set: { mode: 'scene', scene: showcaseScene(), render: paused(2) } },
  'narrow-1280': { viewport: { width: 1280, height: 800 }, open: 'astronauts-1', extra: { render: paused(1.2) } },
  scene: { set: { mode: 'scene', scene: crewScene(), render: paused(2) }, act: async (page) => {
    await page.evaluate(() => window.library.set({ ...window.library.state(), scene: { ...window.library.state().scene, selected: 2 } }));
  } },
  // drones (agent sessions, the drone lab's): a provider's drone, the catalogue group, drones with the crew
  'inspector-drone': { open: 'drones-2', extra: { render: paused(2.5) } }, // GitHub Copilot, close-up
  'drone-working': { open: 'drones-8', extra: { asset: { kind: 'drone', provider: 'qodo', yaw: 0, face: 'working' }, render: paused(2) } },
  'drones-catalogue': { viewport: { width: 1920, height: 1300 }, open: 'drones-3', act: async (page) => {
    await page.evaluate(() => document.querySelector('[data-id="drones-0"]').scrollIntoView({ block: 'start' }));
  } },
  // the drone lab's crew shot as a scene: astronaut, drone, astronaut 0.72 apart round the viewer's
  // crew spot, the drone hovering 0.52 above their floor; a second drone further back, the hero planet behind
  'drone-scene': { set: { mode: 'scene', render: paused(2), scene: { framing: 'crew', selected: 1, items: [
    { kind: 'astronaut', color: 'coral', handle: '@caden', pos: [-2.07, -0.17, 4.6], yaw: 0.4 },
    { kind: 'drone', provider: 'claude', session: 1, pos: [-1.35, 0.32, 4.6], yaw: 0.05 },
    { kind: 'astronaut', color: 'lilac', handle: '@juno', pos: [-0.63, -0.17, 4.6], yaw: -0.4, phase: 3.4 },
    { kind: 'drone', provider: 'copilot', session: 2, pos: [0.15, 0.55, 3.3], yaw: -0.5, phase: 2.1 },
    { kind: 'planet', biome: 'lush', seed: 7, pos: [0, 0, 0] },
  ] } } },
  // debris (stale work, R13): the inspector's debris section with a selected piece, and the Debris group
  'inspector-debris': { open: 'debris-3', extra: { asset: { kind: 'planet', biome: 'lush', seed: 7, ring: 'off', debris: { on: true, count: 8, selected: 'item-2' } }, render: paused(3) } },
  'debris-catalogue': { viewport: { width: 1920, height: 1800 }, open: 'debris-3', act: async (page) => {
    await page.evaluate(() => document.querySelector('[data-id="debris-0"]').scrollIntoView({ block: 'start' }));
  } },
  // fog of war (R5): the inspector's fog section on the lush hero at 50% charted, and the Fog group
  'inspector-fog': { open: 'fog-17' },
  'fog-catalogue': { viewport: { width: 1920, height: 1800 }, open: 'fog-17', act: async (page) => {
    await page.evaluate(() => document.querySelector('[data-id="fog-0"]').scrollIntoView({ block: 'start' }));
  } },
  // the star (star-art.md): the inspector with moonlets, the star system scene in the composer, and the Star group
  'inspector-star': { open: 'star-2' },
  'star-system': { open: 'star-3' },
  'star-catalogue': { viewport: { width: 1920, height: 1800 }, open: 'star-0', act: async (page) => {
    await page.evaluate(() => document.querySelector('[data-id="star-0"]').scrollIntoView({ block: 'start' }));
  } },
  // the dustier-ash trial (health-looks P2): the inspector's look switch, side by side, and the lineup group
  'trial-compare': { open: 'planets-3', extra: { trialCompare: true, render: paused() } },
  'trial-lineup': { viewport: { width: 1920, height: 1800 }, open: 'trials-6', act: async (page) => {
    await page.evaluate(() => document.querySelector('[data-id="trials-0"]').scrollIntoView({ block: 'start' }));
  } },
  // the iteration view (R10): live steps, archived renders from the local archive, comparisons
  'history-toxic': { set: history('toxic', 0, 2), archive: true }, // acid lime (live, history colours) beside rust-ember
  'history-crew': { set: history('crew', 3, 8), archive: true }, // the V1 glyph faces (archived) beside K
  'history-palettes': { set: history('palettes', 0, 5), archive: true }, // v1 pastels beside research x2, both live
  'history-depth': { set: history('depth', 2, 5), archive: true }, // the reverted colour budgets beside pixel-smooth
  'history-planets': { set: history('planets', 5), archive: true }, // the health bands, worst to best
  'history-lab': { set: history('crew', 7, -1, { option: 2 }), archive: true }, // lab variant C, live
  'history-drones': { set: history('drones', 6, 4, { option: 2 }), archive: true }, // the live Copilot drone beside D-final (archived)
  'history-no-archive': { set: history('crew', 3) }, // the same view without the archive
  'history-debris': { set: history('debris', 0, 2, { option: 1 }), archive: true }, // direction B (junkyard), live through the debris lab's kits, beside the final A3
  'history-fog': { set: history('fog', 2, 4, { option: 2 }), archive: true }, // D2c (veiled), live through the fog lab's looks, beside the final D2d
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted.filter((n) => SHOTS[n]) : Object.keys(SHOTS);
await mkdir(OUT, { recursive: true });
const browser = await launch();
try {
  const pages = new Map(); // one page per viewport: the catalogue thumbnails render once
  for (const name of names) {
    const shot = SHOTS[name];
    const vp = shot.viewport ?? VIEWPORT;
    const key = `${vp.width}x${vp.height}${shot.archive ? ' archive' : ''}`;
    if (!pages.has(key)) {
      const p = await openLibrary(browser, { viewport: vp, archive: shot.archive ? ARCHIVE : null });
      await p.waitForFunction(() => window.library.thumbsDone, null, { timeout: 300000 });
      pages.set(key, p);
    }
    const page = pages.get(key);
    await page.evaluate(() => { window.library.set({ palette: {}, render: { t: 3, play: false } }); window.library.tab('inspect'); });
    if (shot.open) await page.evaluate(({ id, extra }) => window.library.open(id, extra), { id: shot.open, extra: shot.extra ?? {} });
    if (shot.set) await page.evaluate((s) => window.library.set(s), shot.set);
    if (shot.act) await shot.act(page);
    await page.waitForFunction(() => window.library.thumbsDone && window.library.histDone, null, { timeout: 300000 }); // palette edits re-render the thumbnails
    await page.waitForFunction(() => [...document.querySelectorAll('.pane:not([hidden]) img.arch')].every((i) => i.complete), null, { timeout: 60000 });
    await page.evaluate(() => window.library.set(window.library.state())); // one settled frame
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    if (pageErrors(page).length) throw new Error(pageErrors(page)[0]);
    console.log(`out/${name}.png`);
  }
} finally {
  await browser.close();
}
