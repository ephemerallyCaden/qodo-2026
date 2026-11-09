// The library palette: the asset viewer's "final" palette (v2 world, BLK 36 crew, v2 space and
// depth) plus the [OIII] teal accent, with individual colours editable. There is no
// whole-palette swapping: edits are { path: hex } over that one base, and reset drops an edit.
//
// The edits live in one viewer palette, PALETTES.library, rewritten in place on each change
// (usePalette(..., { edited: true }) drops the viewer's cached depth fades). With no edits its
// colours are exactly 'final', so renders match the viewer.
//
// Free contributor colours (any hex, not only the three presets) get a 4-step ramp walked over
// BLK 36 with the viewer's own ramp builder (rampThrough), so a BLK 36 colour gets exactly the
// preset ramp, and the darker and lighter steps of any other colour stay BLK 36 colours.
import { PALETTES, usePalette } from '../asset-viewer/viewer.js';
import { LOSPEC } from '../asset-viewer/palettes.js';
import { rampThrough } from '../asset-viewer/palette-map.js';
import { ACCENTS } from '../asset-viewer/planet-ramps.js';
import { CONTRIBUTOR_PRESETS } from './state.js';

const BLK36 = LOSPEC['blk-36'].colors.map((h) => `#${h}`);
export const BLK36_SET = new Set(BLK36);

/** The base: 'final' plus the teal accent ramp (the planet artefacts' garnish uses step 3). */
export const BASE = Object.freeze(structuredClone({ ...PALETTES.final, accent: [...ACCENTS.reveal] }));

// Editor groups (R4): which colours show, in which order, with a note on where each is used.
export const GROUPS = [
  { id: 'space', title: 'Space and depth (v2)', note: 'background, stars, depth-fade tints, dark halo', keys: ['space', 'stars', 'depth', 'halo'] },
  { id: 'world', title: 'World (v2 planet ramps)', note: 'planet surfaces, clouds, caps, rings, moons, haze', keys: ['ocean', 'land', 'cap', 'cloud', 'ring', 'water', 'ice', 'crevasse', 'sand', 'rock', 'gasA', 'gasB', 'moon', 'moonBody', 'sludge', 'toxic', 'fungus', 'spore', 'haze'] },
  { id: 'lava', title: 'Lava ramps', note: 'crust plates, molten glow (rim, body, hot cores), ash smoke', keys: ['crust', 'glow', 'ash'] },
  { id: 'crew', title: 'Crew (BLK 36)', note: 'suit, gear, visor, glint and the three preset contributor ramps', keys: ['suit', 'gear', 'visor', 'glint', 'contributors'] },
  { id: 'accent', title: '[OIII] teal accent', note: 'code-layer events only; the artefacts\' teal garnish uses step 3', keys: ['accent'] },
];

/** Every editable colour of a group: [{ path, label, hex }] (depth entries are [tint, amount]: the tint). */
export function swatches(group) {
  const out = [];
  for (const key of group.keys) {
    const v = BASE[key];
    if (key === 'depth') v.forEach(([hex], i) => out.push({ path: `depth.${i}.0`, row: 'depth', label: `level ${i}`, hex }));
    else if (key === 'contributors') for (const c of CONTRIBUTOR_PRESETS) BASE.contributors[c].forEach((hex, i) => out.push({ path: `contributors.${c}.${i}`, row: c, label: `${c} ${i}`, hex }));
    else if (Array.isArray(v)) v.forEach((hex, i) => out.push({ path: `${key}.${i}`, row: key, label: `${key} ${i}`, hex }));
    else if (typeof v === 'string') out.push({ path: key, row: key, label: key, hex: v });
    else if (v && typeof v === 'object') for (const [k, hex] of Object.entries(v)) out.push({ path: `${key}.${k}`, row: key, label: `${key}.${k}`, hex });
  }
  return out;
}
const EDITABLE = new Set(GROUPS.flatMap((g) => swatches(g).map((s) => s.path)));
export const isEditable = (path) => EDITABLE.has(path);
/** The base colour at a path. */
export const baseHex = (path) => path.split('.').reduce((o, k) => o?.[k], BASE);

/** Only edits to real colours that differ from the base. */
export const cleanEdits = (edits) => Object.fromEntries(Object.entries(edits).filter(([p, hex]) => isEditable(p) && baseHex(p) !== hex).sort(([a], [b]) => (a < b ? -1 : 1)));

function setPath(obj, path, hex) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = hex;
}

const LIBRARY = 'library';
let applied = null; // the edit set PALETTES.library holds (JSON)
/** Makes PALETTES.library the base plus `edits` and activates it; returns { palette, changed } (changed: retint). */
export function activate(edits) {
  const clean = cleanEdits(edits);
  const key = JSON.stringify(clean);
  if (key === applied) return { palette: PALETTES[LIBRARY], changed: usePalette(LIBRARY) };
  applied = key;
  const pal = structuredClone(BASE);
  for (const [path, hex] of Object.entries(clean)) setPath(pal, path, hex);
  pal.spaceBands = [pal.space, pal.space, pal.space]; // the flat background follows the space colour
  pal.name = `library (${Object.keys(clean).length} edits)`;
  PALETTES[LIBRARY] = pal;
  return { palette: pal, changed: usePalette(LIBRARY, { edited: true }), edited: true };
}

/** The contributor ramp key for an astronaut colour (a preset key, or a hex registered on the palette). */
export function contributorKey(pal, color) {
  if (CONTRIBUTOR_PRESETS.includes(color)) return color;
  pal.contributors[color] ??= rampThrough(BLK36, color, 4, 0.66);
  return color;
}
/** The eye-light ramp key: the contributor ramp's step 2, or a free colour (a hex key resolves to itself). */
export const eyeGlowKey = (key, eyeGlow) => eyeGlow ?? `contributors.${key}.2`;
/** The 4-step ramp a contributor colour resolves to (shown in the inspector). */
export const rampOf = (pal, color) => pal.contributors[contributorKey(pal, color)];
