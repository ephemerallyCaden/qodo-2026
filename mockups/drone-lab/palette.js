// Drone palettes: five slots, so a brand palette drops in as one object.
//   shell  [4]  the main body, lit in four bands (shadow, dark, mid, light)
//   trim   [4]  bezel, ears, arms, rotor housings and arms, nozzle; lit in four bands
//   screen [3]  the face screen's two near-black tones, then the glint
//   glow   [4]  emissive (unlit): eyes, antenna tip, thrust, halos; dark -> bright
//   accent [4]  the brand band / panel / stripe / crest; lit in four bands
// Every colour a drone can put on screen comes from its palette (lab.mjs checks it).
import { CREW } from '../explorations/astronaut-lab/crew.js';

// The [OIII] teal accent (art-direction §4): the code layer's colour. Drones are AI agents,
// the actors of the code layer, so the unbranded base glows teal.
export const TEAL = ['#004538', '#007c66', '#00bc9c', '#00ffd5'];

export const PALETTES = {
  // Unbranded base: a warm BLK 36 "work-bot" shell so it can't be mistaken for a white-suited
  // astronaut, the crew's gear greys as trim (same family), the crew's visor tones, teal glow.
  base: {
    name: 'base (unbranded)',
    shell: ['#872a38', '#cc5250', '#ff965f', '#ffe091'],
    trim: CREW.gear,
    screen: [...CREW.visor, CREW.glint],
    glow: TEAL,
    accent: ['#29174c', '#412866', '#643499', '#8c51cc'],
  },
  // A slot test: the same drone in a cool shell, to show a palette swap is one object.
  // (Not a brand; brand palettes are phase 2.)
  frost: {
    name: 'slot test: frost',
    shell: ['#4185d8', '#5ab9e5', '#c1d9f2', '#ffffff'],
    trim: CREW.gear,
    screen: [...CREW.visor, CREW.glint],
    glow: ['#0a2a33', '#22896e', '#42bc7f', '#8cff9b'],
    accent: ['#872a38', '#cc5250', '#ff965f', '#ffe091'],
  },
};

export const SLOTS = { shell: 4, trim: 4, screen: 3, glow: 4, accent: 4 };

/** Every colour a palette can produce. */
export const paletteHexes = (pal) => Object.keys(SLOTS).flatMap((k) => pal[k]);
