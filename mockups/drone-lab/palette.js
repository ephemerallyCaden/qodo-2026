// Drone palettes: six slots, so a brand palette drops in as one object.
//   shell  [4]  the head, lit in four bands (shadow, dark, mid, light)
//   trim   [4]  bezel, nozzles, rim, ears, goggle frames, antenna stalk; lit in four bands
//   screen [3]  the face screen's two near-blacks, then the glint
//   glow   [4]  emissive (unlit), dark -> bright: code lines [2], eyes and tips [3], nozzle mouths [2]
//   accent [4]  band / panel / stripe / crest; lit in four bands
//   smoke  [3]  thruster puffs, lit in three bands, darkening as they fade; sparkles use [2]
// Every colour a drone can put on screen comes from its palette (lab.mjs checks it).
import { CREW } from '../explorations/astronaut-lab/crew.js';

// The [OIII] teal accent (art-direction §4): the code layer's colour, and the drones' glow.
export const TEAL = ['#004538', '#007c66', '#00bc9c', '#00ffd5'];

export const PALETTES = {
  // The human's call: a BLK 36 shell in the crew's greys and whites, the crew's dark visor as
  // the screen, teal eyes. The shell runs from the gear greys into the suit's whites, so it is
  // greyer than a suit (whose shadows are blue) but plainly the same family.
  base: {
    name: 'base (BLK 36 + teal)',
    shell: ['#464b8c', '#6b74b2', '#c1d9f2', '#ffffff'],
    trim: CREW.gear,
    screen: [...CREW.visor, CREW.glint],
    glow: TEAL,
    accent: ['#36277f', '#354ab2', '#4185d8', '#5ab9e5'],
    smoke: ['#909edd', '#c1d9f2', '#ffffff'],
  },
  // A slot test (not a brand): the same drones in a warm shell, to show a swap is one object.
  ember: {
    name: 'slot test: ember',
    shell: ['#872a38', '#cc5250', '#ff965f', '#ffe091'],
    trim: CREW.gear,
    screen: [...CREW.visor, CREW.glint],
    glow: TEAL,
    accent: ['#29174c', '#412866', '#643499', '#8c51cc'],
    smoke: ['#6b74b2', '#c1d9f2', '#ffffff'],
  },
};

export const SLOTS = { shell: 4, trim: 4, screen: 3, glow: 4, accent: 4, smoke: 3 };

/** Every colour a palette can produce. */
export const paletteHexes = (pal) => Object.keys(SLOTS).flatMap((k) => pal[k]);
