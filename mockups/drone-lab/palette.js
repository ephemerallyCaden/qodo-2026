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
  // The human's call: BLK 36 greys and whites like the crew's gear, a dark screen, teal eyes.
  // The shell is the crew's gear-grey ramp (the astronauts' mitts and boots), not the suit's
  // whites, so a drone can't melt into a white suit at 180p; the whites go to the trim (bezel,
  // nozzles, rim, ears), which frames the dark screen, and to the smoke.
  base: {
    name: 'base (BLK 36 + teal)',
    shell: ['#293268', '#464b8c', '#6b74b2', '#909edd'],
    trim: ['#6b74b2', '#909edd', '#c1d9f2', '#ffffff'],
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

// BLK 36 (BurakoIRL, lospec.com/palette-list/blk-36): every brand drone colour comes from it.
export const BLK36 = ['#000000', '#12173d', '#293268', '#464b8c', '#6b74b2', '#909edd', '#c1d9f2', '#ffffff', '#ffccd0', '#e5959f', '#c16a7d', '#8c4b63', '#66334b', '#3f233c', '#29174c', '#412866', '#643499', '#8c51cc', '#b991f2', '#a5e6ff', '#5ab9e5', '#4185d8', '#354ab2', '#36277f', '#0a2a33', '#0f4a4c', '#14665b', '#22896e', '#42bc7f', '#8cff9b', '#ffe091', '#ff965f', '#cc5250', '#872a38', '#d83843', '#ff6866'];

// Brand drone palettes (phase 2), BLK 36 only, keyed by brand id (brands.js). Brand colours are
// mapped to BLK 36 by OKLab distance; brands.js BRAND_COLOURS records each mapping and why.
// The screen keeps the crew's dark visor (or a BLK 36 navy) and the glow stays [OIII] teal, so
// every drone shares one face language. Seeded trims for per-session variety are in brands.js.
const VISOR = [...CREW.visor, CREW.glint];
const COPILOT_GOGGLES = ['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff']; // the goggle frames' cyan (#5cc8ff -> #5ab9e5)
export const BRAND_PALETTES = {
  // Clawd's terracotta (#d77757) sits between BLK 36's reds and its orange: the lit front takes
  // the orange, turned faces the terracotta red, so the shell averages to the brand colour.
  claude: { name: 'Claude Code', shell: ['#3f233c', '#872a38', '#cc5250', '#ff965f'], trim: ['#3f233c', '#872a38', '#cc5250', '#ff6866'], screen: VISOR, glow: TEAL, accent: ['#3f233c', '#872a38', '#cc5250', '#ff965f'], smoke: ['#ff965f', '#ffe091', '#ffffff'] },
  // A graphite cube with a white top facet (the logo's light facet), on Cursor's near-black.
  cursor: { name: 'Cursor', shell: ['#000000', '#12173d', '#293268', '#464b8c'], trim: ['#464b8c', '#909edd', '#c1d9f2', '#ffffff'], screen: ['#000000', '#12173d', '#ffffff'], glow: TEAL, accent: ['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], smoke: ['#464b8c', '#909edd', '#c1d9f2'] },
  // The goggled head's blue-to-violet, with light cyan trim and goggles (the accent: frames, bridge, strap).
  copilot: { name: 'GitHub Copilot', shell: ['#29174c', '#36277f', '#354ab2', '#8c51cc'], trim: ['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], screen: VISOR, glow: TEAL, accent: COPILOT_GOGGLES, smoke: ['#909edd', '#c1d9f2', '#ffffff'] },
  // Codey's cornflower blue (#6e9bfa -> #909edd is nearest, but that is the generic drone's grey;
  // a lighter, cyan-leaning sky ramp keeps it apart from generic and Copilot), its navy screen (#232d66 -> #293268).
  codex: { name: 'OpenAI Codex', shell: ['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], trim: ['#4185d8', '#5ab9e5', '#a5e6ff', '#ffffff'], screen: ['#12173d', '#293268', '#ffffff'], glow: TEAL, accent: ['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], smoke: ['#909edd', '#c1d9f2', '#ffffff'] },
  // Jules's pixel octopus purple (#642cc2 -> #643499), lighter purple tentacles (accent), white trim.
  google: { name: 'Google (Jules, Gemini CLI, Antigravity)', shell: ['#12173d', '#29174c', '#412866', '#643499'], trim: ['#8c51cc', '#b991f2', '#ffffff', '#ffffff'], screen: VISOR, glow: TEAL, accent: ['#412866', '#643499', '#8c51cc', '#b991f2'], smoke: ['#8c51cc', '#b991f2', '#ffffff'] },
  // Devin's near-black (#0e1015 -> #12173d) for the head, its white hexagons for the side pods.
  devin: { name: 'Devin', shell: ['#000000', '#000000', '#12173d', '#293268'], trim: ['#6b74b2', '#c1d9f2', '#ffffff', '#ffffff'], screen: ['#000000', '#12173d', '#ffffff'], glow: TEAL, accent: ['#000000', '#12173d', '#293268', '#464b8c'], smoke: ['#909edd', '#c1d9f2', '#ffffff'] },
  // The white ghost, shaded in Kiro's purple (#9046ff -> #8c51cc).
  kiro: { name: 'Kiro', shell: ['#643499', '#8c51cc', '#b991f2', '#ffffff'], trim: ['#412866', '#643499', '#8c51cc', '#b991f2'], screen: ['#000000', '#12173d', '#ffffff'], glow: TEAL, accent: ['#412866', '#643499', '#8c51cc', '#b991f2'], smoke: ['#8c51cc', '#b991f2', '#ffffff'] },
  // OpenCode's block O: a light ring round a dark-over-grey core.
  opencode: { name: 'OpenCode', shell: ['#464b8c', '#909edd', '#c1d9f2', '#ffffff'], trim: ['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], screen: ['#000000', '#293268', '#ffffff'], glow: TEAL, accent: ['#12173d', '#293268', '#464b8c', '#6b74b2'], smoke: ['#6b74b2', '#909edd', '#c1d9f2'] },
  // The hoodie purple (#7a68fa -> #8c51cc), a white snout.
  qodo: { name: 'Qodo', shell: ['#29174c', '#412866', '#643499', '#8c51cc'], trim: ['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], screen: VISOR, glow: TEAL, accent: ['#29174c', '#412866', '#643499', '#8c51cc'], smoke: ['#b991f2', '#c1d9f2', '#ffffff'] },
  // Every other detected tool: D-final's own base palette, with the tool's name as a label.
  generic: { ...PALETTES.base, name: 'generic (other tools)' },
  // No tool known: the generic drone exactly (human, 2026-11-10), labelled "unknown agent".
  unknown: { ...PALETTES.base, name: 'unknown agent (the generic drone)' },
};

// Option palettes (brands.js BRAND_OPTIONS): Copilot b is the generic drone's palette with only the
// accent, which colours the goggles, in Copilot's cyan.
export const OPTION_PALETTES = {
  'copilot-b': { ...PALETTES.base, name: "Copilot b: the generic's palette, Copilot goggles", accent: COPILOT_GOGGLES },
};

/** Every colour a palette can produce. */
export const paletteHexes = (pal) => Object.keys(SLOTS).flatMap((k) => pal[k]);
