// The ship's colours: BLK 36 only (art direction §4, the crew palette), like the astronauts and the
// drones. A ship palette is a set of named ramps (dark -> light); every variant picks its own shell
// and trim, and they all share the crew's gear greys for metal (nozzles, legs, window frames) and the
// visor's near-blacks for glass, so the ship reads as the crew's kit. Pure: no three.js.
import { mapPalette } from '../asset-viewer/palette-map.js';

const blk = mapPalette('blk-36'); // the crew roles, exactly as the viewer's 'final' palette uses them

export const BLK36 = ['#000000', '#12173d', '#293268', '#464b8c', '#6b74b2', '#909edd', '#c1d9f2', '#ffffff', '#ffccd0', '#e5959f', '#c16a7d', '#8c4b63', '#66334b', '#3f233c', '#29174c', '#412866', '#643499', '#8c51cc', '#b991f2', '#a5e6ff', '#5ab9e5', '#4185d8', '#354ab2', '#36277f', '#0a2a33', '#0f4a4c', '#14665b', '#22896e', '#42bc7f', '#8cff9b', '#ffe091', '#ff965f', '#cc5250', '#872a38', '#d83843', '#ff6866'];
// The [OIII] event teal (art direction §4): never a default; only the teal option tiles use it.
export const TEAL = ['#004538', '#007c66', '#00bc9c', '#00ffd5'];

// Ramps (BLK 36), dark -> light.
export const RAMPS = {
  white: ['#464b8c', '#6b74b2', '#c1d9f2', '#ffffff'], // the gear greys under the suit's whites: off the suit's blue darks
  red: ['#3f233c', '#872a38', '#d83843', '#ff6866'],
  orange: ['#872a38', '#cc5250', '#ff965f', '#ffe091'],
  mauve: ['#3f233c', '#8c4b63', '#c16a7d', '#e5959f'],
  navy: ['#12173d', '#293268', '#354ab2', '#4185d8'],
  gold: ['#872a38', '#cc5250', '#ff965f', '#ffe091'], // the captain's: cap crown, porthole frame, pedestal
  metal: [...blk.gear], // #293268 #464b8c #6b74b2 #909edd: the crew's mitts, boots and pack
  glass: [...blk.visor, '#36277f'], // interior and glass back: the visor's two near-blacks, then a lit sheen
  glint: [blk.glint, '#a5e6ff'], // glass highlight: white core, pale blue edge
  flame: ['#d83843', '#ff965f', '#ffe091', '#ffffff'], // unlit: red edge -> orange -> yellow -> white core
  lights: ['#66334b', '#ff6866'], // a nav light off / on
};

/** A ship palette: which ramp fills each slot the shader reads. */
export const slotPalette = (shell, trim, extra = {}) => ({
  shell: RAMPS[shell], trim: RAMPS[trim], metal: RAMPS.metal, gold: RAMPS.gold, glass: RAMPS.glass, glint: RAMPS.glint, flame: RAMPS.flame, lights: RAMPS.lights, ...extra,
});

/** The captain's cap: a gold crown over a navy band and peak (ship-spec.js CAP). */
export const CAP_PALETTE = slotPalette('navy', 'navy');

/** The same palette with the thrust in [OIII] teal: the option tile only (an event, never at rest). */
export const tealThrust = (pal) => ({ ...pal, flame: [...TEAL] });

/** Every colour a palette can put on screen. */
export const paletteHexes = (pal) => [...new Set(Object.values(pal).flat())];

/** The crew's own colours (BLK 36 roles), for the tile checks. */
export const CREW_HEXES = [...blk.suit, ...blk.gear, ...blk.visor, blk.glint, ...Object.values(blk.contributors).flat()];
export const CONTRIBUTORS = blk.contributors;
