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
// `gear-light` (A2) is the same gear family lifted one step, so the metal reads as grey beside the
// red paint and the darkest navy is left to the solar cells and scorch; it stops below the drone
// shell's lit #909edd.
// `grey` (A3) is off BLK 36, a human-approved exception for debris only (2026-11-10: "more grey and
// less blue, it's ok to not use the palette exactly"): neutral, a touch warm in the light, each step
// picked for distance from every planet colour (OKLab to the nearest: .053 .052 .052 .046; the
// barren-moon and lava-ash greys are the near ones).
export const HULLS = {
  gear: ['#12173d', '#293268', '#464b8c', '#6b74b2'],
  'gear-light': ['#293268', '#464b8c', '#6b74b2', '#6b74b2'],
  grey: ['#3d3d3d', '#616161', '#8e8c8a', '#b4b2b0'],
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

// A2 (satellites, the human's pick refined, 2026-11-10: "grey and red, to really be noticeable"):
// red is deliberate paint, not rust. PAINT is BLK 36's reds, dark -> light; #d83843 is the
// strongest red, 0.048 (OKLab) from the lava rim #c9361a (swap it for #cc5250, 0.060, if that
// ever matters). Age then can't lean on red, so it uses value and structure: the paint chips and
// dulls to DULL (dark mauves, about 0.19 L darker on the lit band), the metal scorches to NAVY,
// and old pieces break apart. NAVY is also the solar panels' cell colour: the gear and navy
// family, never the ocean blues.
export const PAINT = ['#872a38', '#cc5250', '#d83843', '#ff6866'];
export const DULL = ['#66334b', '#66334b', '#66334b', '#8c4b63'];
export const NAVY = ['#12173d', '#12173d', '#12173d', '#12173d']; // flat: solar cells and scorch stay the darkest navy in any light
// A3: solar cells and scorch in the grey ramp's darkest step (grey-led; the navy vanished against space).
export const GREY_DARK = ['#3d3d3d', '#3d3d3d', '#3d3d3d', '#3d3d3d'];
// A3: red is only an outline and lights. The outline is #d83843 (the human kept it), dimming to
// #872a38 with age; the blinking nav lights are BLK 36's lightest red.
export const OUTLINE = { bright: '#d83843', dim: '#872a38' };
export const LIGHT = '#ff6866';

// Which colour roles each kit can put on screen at rest.
const KIT_ROLES = { hardware: ['rust'], blocks: ['rust'], canister: ['rust', 'tag'], satellite: ['paint', 'dull', 'navy'], outlined: ['greyDark', 'outline', 'light'] };
const ROLE = { rust: RUST, tag: Object.values(TAGS), paint: PAINT, dull: DULL, navy: NAVY, greyDark: GREY_DARK, outline: Object.values(OUTLINE), light: [LIGHT] };

/** Every colour a kit's debris can put on screen at rest: its hull and its roles. */
export const restColours = (hull = 'gear', kit = 'hardware') => [...new Set([...HULLS[hull], ...KIT_ROLES[kit].flatMap((r) => ROLE[r])])];

/** The ramps as a viewer palette role, so resolve('debris.hull.gear') etc. work for depth tints. */
export const paletteRole = () => ({ hull: { ...HULLS }, rust: RUST, teal: TEAL, tag: { ...TAGS }, paint: PAINT, dull: DULL, navy: NAVY, greyDark: GREY_DARK, outline: { ...OUTLINE }, light: LIGHT });
