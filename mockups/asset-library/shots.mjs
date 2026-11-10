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
  'history-drones': { set: history('drones', 4, 2), archive: true },
  'history-no-archive': { set: history('crew', 3) }, // the same view without the archive
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
