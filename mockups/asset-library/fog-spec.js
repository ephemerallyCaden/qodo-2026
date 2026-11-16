// Fog of war (R5) on a library planet: the asset viewer's fog, cloud fog (fog-cloud.js, C6 · white storm
// front, the human's pick 2026-11-16: planet.setFogClouds, no shader hook), or one of the earlier looks (the
// dark veil D2d and the fog lab's directions: built by makePlanet({ fog }) and set by driveFog(), for the history). A planet's `fog`
// state is on/off, the charted share (one of the viewer's coverages), a seed for the demo layout
// (null: the planet's, as the viewer), the chart events (a file clearing or refogging from time `at`,
// outside the loop lock, as the viewer's buttons), the moons' events, and a look: D2d, or one of the
// fog lab's directions (the history's explorations). Pure: the fog layout is a pure module.
import { COVERAGES, EVENT, demoLayout, stateAt, moonStateAt, nextToChart, lastCharted, allFogged, shares } from '../asset-viewer/fog-layout.js';
// The fog lab's directions (A-E, A2, D2a-D2e; D2d is final). Their looks register with the viewer's
// fog when the page imports the lab's fog.js (engine.js), so the history draws every direction live.
import { DIRECTIONS } from '../fog-lab/variants.js';
import { CLOUD_FOGS, FINAL_CLOUD_FOG, fogClouds } from '../asset-viewer/fog-cloud.js';

export { COVERAGES as FOG_COVERAGES, EVENT as FOG_EVENT };
export const FOG_LOOKS = [...Object.keys(CLOUD_FOGS), ...DIRECTIONS.map((d) => d.id)];
export const FINAL_FOG_LOOK = FINAL_CLOUD_FOG; // the viewer's fog (heroFogAt's look)
/** Cloud fog looks (C1-C6) draw as clouds (setFogClouds); the rest are shader fog looks (driveFog). */
export const isCloudLook = (id) => Object.hasOwn(CLOUD_FOGS, id);
export const fogLookOf = (id) => CLOUD_FOGS[id] ?? DIRECTIONS.find((d) => d.id === id);
export const MAX_FOG_EVENTS = 64;
export const FOG_DEFAULTS = { on: false, charted: 0.5, seed: null, events: [], moonEvents: [], look: FINAL_FOG_LOOK };
/** "chart all" clears the fogged files this far apart (s), as the viewer's button. */
export const CHART_ALL_GAP = 0.12;

/** A planet item's demo layout ({ planet, foot }): the viewer's src planet at the fog's seed, or the planet's. */
export const layoutOf = (it) => demoLayout('src', it.fog.seed ?? it.seed);

/** The viewer's driveFog options for a planet item at time t (s); null when it has no shader fog. */
export function fogDrive(it, t, period) {
  const f = it.fog;
  if (!f?.on || isCloudLook(f.look)) return null;
  return { layout: layoutOf(it), coverage: f.charted, events: f.events, moonEvents: f.moonEvents, t, period, look: f.look, on: true };
}

/** A planet item's fog clouds at time t (planet.setFogClouds), or null when its fog is off or not a cloud look. */
export function fogCloudsAt(it, t) {
  const f = it.fog;
  if (!f?.on || !isCloudLook(f.look)) return null;
  const { planet, foot } = layoutOf(it);
  return fogClouds(planet, foot, stateAt(planet, { coverage: f.charted, events: f.events, t }), f.look);
}

/** The fog at time t: the layout's state (fogged files, events, pulse) and the charted share of files. */
export function fogStatus(it, t) {
  const { planet } = layoutOf(it);
  const st = stateAt(planet, { coverage: it.fog.charted, events: it.fog.events, t });
  return { planet, st, charted: 1 - shares(planet, layoutOf(it).foot, st.fogged).files };
}

/**
 * The events the viewer's chart buttons add at time `at`: { events, moonEvents } to append, or null
 * when the button has nothing to do. one: the next file in charting order clears; refog: the last
 * charted one refogs; all: every fogged file clears CHART_ALL_GAP apart, and every fogged moon.
 */
export function chartEvents(it, kind, at) {
  const { planet, st } = fogStatus(it, at);
  if (kind === 'one' || kind === 'refog') {
    const f = kind === 'one' ? nextToChart(planet, st) : lastCharted(planet, st);
    return f ? { events: [{ file: f.id, kind: kind === 'one' ? 'clear' : 'refog', at }], moonEvents: [] } : null;
  }
  const files = allFogged(planet, st);
  const moons = [0, 1].filter((i) => moonStateAt(i, { coverage: it.fog.charted, moonEvents: it.fog.moonEvents, t: at }).fogged);
  if (!files.length && !moons.length) return null;
  return { events: files.map((f, k) => ({ file: f.id, kind: 'clear', at: at + k * CHART_ALL_GAP })), moonEvents: moons.map((moon) => ({ moon, kind: 'clear', at })) };
}
