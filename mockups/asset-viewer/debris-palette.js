// Debris colours (space-debris.md D8, and the human's two debris-only exceptions). Every ramp runs
// dark -> light and is lit in four bands (night, terminator, lit, full light).
//
// The product look is A3 (the human's pick, 2026-11-10): neutral grey metal, red only as a 1 px
// outline and blinking nav lights. Two exceptions hold for debris only and nowhere else:
//   - the grey is off BLK 36 ("more grey and less blue, it's ok to not use the palette exactly");
//   - the outline breaks art direction §3's no-outlines rule (it lives only in debris.js).
// The debris lab (../debris-lab) registers its exploration colours (directions A-E, A2) here with
// registerDebrisColours(), so one implementation draws them all.
import { ACCENTS } from './planet-ramps.js';

// [OIII] teal, the viewer's accent: an event only (the sweep's flash, a selected piece). Never on a piece at rest.
export const TEAL = ACCENTS.reveal;

// A3 grey: neutral, a touch warm in the light, each step picked for distance from every planet
// colour (OKLab to the nearest: .053 .052 .052 .046; the lava-ash and barren-moon greys are the
// near ones). Its darkest step is the solar cells and scorch (GREY_DARK).
export const GREY = ['#3d3d3d', '#616161', '#8e8c8a', '#b4b2b0'];
export const GREY_DARK = ['#3d3d3d', '#3d3d3d', '#3d3d3d', '#3d3d3d'];
// The red outline (#d83843, kept by the human) dims to #872a38 with age; the nav lights are BLK 36's lightest red.
export const OUTLINE = { bright: '#d83843', dim: '#872a38' };
export const LIGHT = '#ff6866';

/**
 * The registry: hull ramps, colour roles and, per kit, the roles it can put on screen at rest.
 * A role is a ramp (4 hexes), a hex, or an object of them (e.g. outline: { bright, dim }).
 */
export const DEBRIS_COLOURS = {
  hulls: { grey: GREY },
  roles: { greyDark: GREY_DARK, outline: OUTLINE, light: LIGHT },
  kits: { outlined: ['greyDark', 'outline', 'light'] },
};

const flat = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : Object.values(v).flatMap(flat));

/** Every colour a kit's debris can put on screen at rest: its hull and its roles. */
export const restColours = (hull = 'grey', kit = 'outlined') =>
  [...new Set([...DEBRIS_COLOURS.hulls[hull], ...DEBRIS_COLOURS.kits[kit].flatMap((r) => flat(DEBRIS_COLOURS.roles[r]))])];

/** The ramps as a viewer palette role, so resolve('debris.hull.grey') etc. work for depth tints. */
export const paletteRole = () => ({ hull: { ...DEBRIS_COLOURS.hulls }, teal: TEAL, ...structuredClone(DEBRIS_COLOURS.roles) });

const bound = [];
/** The viewer hands over its palettes, so every palette carries the `debris` role. */
export function bindPalettes(palettes) {
  bound.push(palettes);
  for (const pal of Object.values(palettes)) pal.debris = paletteRole();
}

/** Adds hulls, roles and kit roles (the debris lab's explorations), and refreshes every bound palette. */
export function registerDebrisColours({ hulls = {}, roles = {}, kits = {} } = {}) {
  Object.assign(DEBRIS_COLOURS.hulls, hulls);
  Object.assign(DEBRIS_COLOURS.roles, roles);
  Object.assign(DEBRIS_COLOURS.kits, kits);
  for (const palettes of bound) for (const pal of Object.values(palettes)) pal.debris = paletteRole();
}
