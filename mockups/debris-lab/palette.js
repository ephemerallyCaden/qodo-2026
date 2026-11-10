// Debris colours (space-debris.md D8). Debris is man-made, so it takes the crew's BLK 36 metal,
// never the planet ramps (which belong to rings and clouds). Every ramp runs dark -> light and is
// lit in four bands (night, terminator, lit, full light). test/pure.test.mjs checks that every
// colour here is a BLK 36 colour as the asset viewer maps it (mapPalette('blk-36')).
import { ACCENTS } from '../asset-viewer/planet-ramps.js';

// Hull metal. `gear` is D8 as written: the crew's gear and metal family, one step darker than the
// drone shell (#293268..#909edd), so dead hardware never shows the drone's lit grey or its whites.
// `violet` is the measured alternative: BLK 36's violets sit furthest from every planet ramp
// (OKLab 0.039-0.133 to the nearest product-planet colour, where gear's #464b8c is 0.022 from the
// polar cap and #6b74b2 0.027 from ice). README: "Colour separation".
// `violet-dark` keeps the violets to their two darker steps and takes the highlights from the
// rust ramp's mauve, because art direction §4 bans saturated violet on rings: against land green
// it reads brighter and nearer than the planet (Helmholtz-Kohlrausch). README: "Violet check".
export const HULLS = {
  gear: ['#12173d', '#293268', '#464b8c', '#6b74b2'],
  violet: ['#29174c', '#412866', '#643499', '#8c51cc'],
  'violet-dark': ['#29174c', '#29174c', '#412866', '#8c4b63'],
};
export const HULL_KEYS = Object.keys(HULLS);

// Rust and decay: D8's four warm reds and mauves, sorted by OKLab lightness (.395 .430 .498 .598).
// BLK 36 has no browns, so rust reads red-mauve. Every one is >= 0.060 from the product planets.
export const RUST = ['#66334b', '#872a38', '#8c4b63', '#cc5250'];

// [OIII] teal, the viewer's accent: an event only (the sweep's flash, a selected piece). Never on a piece at rest.
export const TEAL = ACCENTS.reveal;

// Direction D's class paint (one flat colour per class, shown on the lit bands): BLK 36 colours
// picked for distance from the planet ramps (OKLab to the nearest: .050 .061 .067 .094) and from
// the teal accent. They stretch D8, which keeps debris to metal and rust; D tests whether a
// colour code reads better than silhouettes.
export const TAGS = { pr: '#ffe091', branch: '#ff965f', merged: '#b991f2', agent: '#e5959f' };

// Colours that make a drone a drone (drone-lab palette.js): its lit shell, white trim and smoke,
// and the teal eyes. Debris at rest must show none of them.
export const DRONE_TELLS = ['#909edd', '#c1d9f2', '#ffffff', ...TEAL];

/** Every colour debris can put on screen at rest (hull, rust and, for D, the class paint). */
export const restColours = (hull = 'gear', tags = false) => [...HULLS[hull], ...RUST, ...(tags ? Object.values(TAGS) : [])];

/** The ramps as a viewer palette role, so resolve('debris.hull.gear') etc. work for depth tints. */
export const paletteRole = () => ({ hull: { ...HULLS }, rust: RUST, teal: TEAL, tag: { ...TAGS } });
