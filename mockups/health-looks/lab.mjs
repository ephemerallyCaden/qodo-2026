// The lab's fixed inputs: which looks, bands, seeds and viewing conditions are rendered, and the
// library state for each. Pure (no DOM, no three.js), shared by measure.mjs and the tests.
import { V2_PLANET_RAMPS } from '../asset-viewer/planet-ramps.js';
import { hexToOklab, hueDeg, discGeometry } from './metrics.mjs';

// Worst to best (art direction §6). The ash band is the desert look; the healthy band has three
// looks picked by a hash of the planet's ID, so all three are measured as one band.
export const BANDS = ['lava', 'toxic', 'ash', 'healthy'];
// emissive: the look's shader branch paints with the glow ramp (only lava's: `bool glow = uBiome == 4`).
export const LOOKS = [
  { look: 'lava', band: 'lava', biome: 'lava', emissive: true },
  { look: 'toxic', band: 'toxic', biome: 'toxic' },
  { look: 'desert', band: 'ash', biome: 'desert' },
  { look: 'lush', band: 'healthy', biome: 'lush' },
  { look: 'ocean', band: 'healthy', biome: 'ocean' },
  { look: 'ice', band: 'healthy', biome: 'ice' },
];
export const bandOf = (look) => LOOKS.find((l) => l.look === look).band;
export const LOOK_NAMES = LOOKS.map((l) => l.look);
export const HEALTHY = LOOKS.filter((l) => l.band === 'healthy').map((l) => l.look);
export const ASH = LOOKS.find((l) => l.band === 'ash'); // the desert look
export const EMISSIVE_LOOKS = new Set(LOOKS.filter((l) => l.emissive).map((l) => l.look));
export const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1); // H5: 20+ per look
export const T = 3; // seconds into the shared loop, paused (as the #19 lineup)

// Constants the viewer doesn't export (test/lab.test.mjs checks them against viewer.js):
export const VIEWER = {
  fov: 35, // camera = new THREE.PerspectiveCamera(35, ...)
  hero: [1.92, 1.12, 6.69], // VIEWS.planet.pos (target: the origin)
  smooth: { near: 5, far: 44 }, // SMOOTH, the pixel-smooth fade's log-distance range
  depth: [0, 0.38, 0.72, 0.88], // PALETTES.final.depth strengths, near -> silhouette
};
const HERO_D = Math.hypot(...VIEWER.hero);

/** The pixel-smooth depth-fade strength at camera distance d (the shader's depthFade, mode 2). */
export function fadeAt(d) {
  const { near, far } = VIEWER.smooth;
  const x = Math.min(1, Math.max(0, Math.log(d / near) / Math.log(far / near))) * (VIEWER.depth.length - 1);
  const i = Math.min(Math.floor(x), VIEWER.depth.length - 2);
  return VIEWER.depth[i] + (VIEWER.depth[i + 1] - VIEWER.depth[i]) * (x - i);
}

// Viewing conditions (H3). d: camera distance to the planet centre along the hero view's direction;
// size: the planet's size (~ LOC; the library's range is 0.25-2.2). The far depth levels are the
// fade's level 2 (0.72) and its full strength (0.88, d >= 44). 'full' and 'small-far' are the
// art direction's worst case: about 10 px discs (size 1 at full fade; the smallest size at 10 px).
export const CONDITIONS = [
  { key: 'hero', d: HERO_D, size: 1, note: 'the hero framing (VIEWS.planet)' },
  { key: 'mid', d: 12, size: 1, note: 'mid distance' },
  { key: 'far', d: 21.3, size: 1, note: 'far: depth level 2' },
  { key: 'full', d: 56, size: 1, note: 'full fade, ~10 px disc' },
  { key: 'small', d: HERO_D, size: 0.25, note: 'smallest size at the hero distance' },
  { key: 'small-far', d: 14.1, size: 0.25, note: 'smallest size as a ~10 px disc' },
  { key: 'overlays', d: HERO_D, size: 1, overlays: true, note: 'hero + moons + artefacts' },
  { key: 'overlays-full', d: 56, size: 1, overlays: true, note: 'full fade + moons + artefacts' },
];
export const condition = (key) => CONDITIONS.find((c) => c.key === key);
export const BASE = 'hero'; // the baseline for H1, H2 and H5, and what H3 compares against
export const FULL = 'full'; // the full-fade 10 px disc (the CVD and seed sheets, proposal A)
export const camPos = ({ d }) => VIEWER.hero.map((x) => (x * d) / HERO_D);

export const FRAME = { w: 320, h: 180 }; // the default internal resolution (pixel h 180)
export const geometryFor = (cond) => discGeometry({ camPos: camPos(cond), radius: cond.size, ...FRAME, fov: VIEWER.fov });

// The emissive ramp (lava glow, uG): swapped for these sentinels in a second render, the pixels that
// change are the ones it painted. Each differs from every glow colour in every channel.
export const SENTINEL = { 'glow.0': '#00ff00', 'glow.1': '#00ff80', 'glow.2': '#00ffff' };

// The warm pole: the lava glow's body colour (glow[1], #ff761a), the hottest colour in the palette.
// Read from the shipped ramps, not fitted to the measurements.
export const WARM_HUE = hueDeg(...hexToOklab(V2_PLANET_RAMPS.glow[1]).slice(1));

/**
 * The library state for one render. Rings are off (out of the product view); clouds are each
 * biome's own weather at its shipped cover. Overlays: the two moons (tests) and artefacts at the
 * auto count for the size, teal off (its default). empty: every planet layer hidden (the mask);
 * palette: edits (the emissive sentinel).
 */
export function stateFor({ biome, seed }, cond, { empty = false, palette = {} } = {}) {
  return {
    mode: 'asset', focus: 'planet', framing: 'planet', palette,
    camera: { pos: camPos(cond), target: [0, 0, 0] },
    asset: {
      kind: 'planet', biome, seed, size: cond.size, ring: 'off',
      moons: !!cond.overlays && !empty, artefacts: !!cond.overlays, artAuto: true, artTeal: false,
      layers: { surface: !empty, haze: !empty, clouds: !empty, ring: false },
    },
    render: { t: T, play: false, pixelH: FRAME.h, spin: true, depth: true, depthMode: 'pixel-smooth', depthBands: '3-band' },
  };
}
