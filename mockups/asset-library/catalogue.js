// The catalogue (R1): every entry is a starting configuration for the inspector (a partial state:
// focus, framing and asset), or for the palette editor. Seeds are the asset viewer's own (its
// system shot), so each tile is a look the viewer already shows. `final: false` marks the
// exploration archive (R6). Pure data, no DOM.
import { TOXIC_LOOKS, TOXIC_LOOK, toxicLookEdits } from '../asset-viewer/planet-ramps.js';

const astro = (title, sub, asset, extra = {}) => ({ title, sub, final: true, state: { focus: 'astronaut', framing: 'body', asset: { kind: 'astronaut', ...asset } }, ...extra });
const planet = (title, sub, asset, extra = {}) => ({ title, sub, final: true, state: { focus: 'planet', framing: 'planet', asset: { kind: 'planet', ...asset } }, ...extra });
const focus = (f, framing = 'planet') => (e) => ({ ...e, state: { ...e.state, focus: f, framing } });
const HOST_HIDDEN = { surface: false, haze: false, clouds: false, ring: false };
// Toxic band candidates (#19), side by side: each tile carries its look as palette edits
// (`state.palette`, {} for the shipped look), applied to its thumbnail and when opened.
const TOXIC_SUBS = { acid: 'before #19: acid lime + fungus', sulphur: 'sulphur ochre', ember: 'rust-ember' };
const toxicLook = (look) => {
  const e = planet(`toxic · ${look === 'acid' ? 'before' : look}`, `${TOXIC_SUBS[look] ?? look}${look === TOXIC_LOOK ? ' (shipped)' : ''} · 13`, { biome: 'toxic', seed: 13, ring: 'off' });
  return { ...e, final: look === TOXIC_LOOK, state: { ...e.state, palette: toxicLookEdits(look) } };
};

export const GROUPS = [
  {
    id: 'astronauts', title: 'Astronauts', note: 'crew K (final): any contributor colour, any of the 10 V2 eyes',
    items: [
      astro('K · coral', '@caden, hashed eyes', { color: 'coral', handle: '@caden', eyes: 'auto' }),
      astro('K · mint', '@mira, hashed eyes', { color: 'mint', handle: '@mira', eyes: 'auto', phase: 1.7 }),
      astro('K · lilac', '@juno, hashed eyes', { color: 'lilac', handle: '@juno', eyes: 'auto', phase: 3.4 }),
      astro('K · any colour', 'free colour, binocular', { color: '#e0a020', handle: '@you', eyes: 3, yaw: -0.5 }),
      astro('K · face', 'face close-up', { color: 'mint', handle: '@mira', eyes: 5 }, { state: { focus: 'astronaut', framing: 'face', asset: { kind: 'astronaut', color: 'mint', handle: '@mira', eyes: 5 } } }),
      astro('K · side', 'three-quarter back', { color: 'lilac', handle: '@juno', eyes: 'auto', yaw: -2.2 }),
    ],
  },
  {
    id: 'planets', title: 'Planets', note: 'one shader, a branch per biome; extras marked',
    items: [
      planet('lush', 'healthy, active · seed 7', { biome: 'lush', seed: 7 }),
      planet('ocean', 'stable, rarely touched · 42', { biome: 'ocean', seed: 42, ring: 'off' }),
      planet('ice', 'stable · 21', { biome: 'ice', seed: 21, ring: 'off' }),
      planet('desert', 'stale, low coverage · 3', { biome: 'desert', seed: 3, ring: 'off' }),
      planet('lava', 'churn hotspot · 11', { biome: 'lava', seed: 11, ring: 'off' }),
      planet('gas giant', 'extra · very large · 5', { biome: 'gas', seed: 5, ring: 'off' }),
      planet('barren moon', 'extra · tiny or dead · 9', { biome: 'moon', seed: 9, ring: 'off', moons: false }),
      ...[TOXIC_LOOK, ...Object.keys(TOXIC_LOOKS).filter((l) => l !== TOXIC_LOOK && l !== 'acid'), 'acid'].map(toxicLook), // shipped, other candidates, before
    ],
  },
  {
    id: 'moons', title: 'Moons', note: 'the two warm moons every planet can carry',
    items: [
      focus('moon')(planet('moon pair', 'orbiting the lush hero', { biome: 'lush', seed: 7, ring: 'off' })),
      focus('moon')(planet('moons alone', 'host body hidden', { biome: 'lush', seed: 7, ring: 'off', layers: HOST_HIDDEN })),
      focus('moon')(planet('wide orbits', 'pushed out, steeper', { biome: 'desert', seed: 3, ring: 'off', moonOrbits: [{ size: 0.14, orbit: 2.3, incl: 0.6, yaw: 0.25, offset: 0.15 }, { size: 0.08, orbit: 1.6, incl: -0.3, yaw: -0.4, offset: 0.62 }] })),
    ],
  },
  {
    id: 'rings', title: 'Rings', note: 'a modifier on any biome: width × distance',
    items: [
      focus('ring')(planet('thin ring', 'default · 0.22 at 1.69', { biome: 'lush', seed: 7, moons: false })),
      focus('ring')(planet('wide ring', 'shared lib · 0.72 at 1.54', { biome: 'lush', seed: 7, ring: 'wide', ringWidth: 0.72, ringInner: 1.54, moons: false })),
      focus('ring')(planet('thread', '0.04 at 1.25', { biome: 'ocean', seed: 42, ringWidth: 0.04, ringInner: 1.25, moons: false })),
      focus('ring')(planet('far belt', '0.72 at 2.6', { biome: 'desert', seed: 3, ringWidth: 0.72, ringInner: 2.6, moons: false })),
      focus('ring')(planet('ring alone', 'host body hidden', { biome: 'lush', seed: 7, ring: 'wide', ringWidth: 0.72, ringInner: 1.54, moons: false, layers: HOST_HIDDEN })),
    ],
  },
  {
    id: 'clouds', title: 'Clouds', note: 'weather layers: cover, float, shadow',
    items: [
      focus('clouds')(planet('cloud masses', 'lush weather', { biome: 'lush', seed: 7, ring: 'off', moons: false })),
      focus('clouds')(planet('thin clouds', 'ocean weather', { biome: 'ocean', seed: 42, ring: 'off', moons: false })),
      focus('clouds')(planet('spores', 'toxic weather', { biome: 'toxic', seed: 13, ring: 'off', moons: false })),
      focus('clouds')(planet('ash plumes', 'lava smoke', { biome: 'lava', seed: 11, ring: 'off', moons: false })),
      focus('clouds', 'clouds-zoom')(planet('cloud close-up', 'the cloud-zoom framing', { biome: 'lush', seed: 7, ring: 'off', moons: false })),
      focus('clouds')(planet('clouds alone', 'host body hidden', { biome: 'lush', seed: 7, ring: 'off', moons: false, cover: 0.35, layers: { ...HOST_HIDDEN, clouds: true } })),
    ],
  },
  {
    id: 'fx', title: 'FX', note: 'the code layer: planet artefacts (adopted) and the ASCII FX candidates',
    items: [
      focus('fx')(planet('artefacts', 'auto by size', { biome: 'lush', seed: 7, artefacts: true })),
      focus('fx')(planet('artefacts + teal', '[OIII] garnish', { biome: 'lush', seed: 7, artefacts: true, artTeal: true })),
      focus('fx')(planet('artefacts on lava', 'contrast glyphs', { biome: 'lava', seed: 11, ring: 'off', artefacts: true, size: 1.4 })),
      ...[
        ['fog of war', 'glyph field + wavefront'], ['glitch packets', 'heads carry source colour'], ['terminal', 'ASCII pass, scan bar'],
        ['drifting bands', 'ASCII pass, bands'], ['pixel ↔ glyph', 'mosaic transition'], ['decode tags', 'inverted label slabs'],
      ].map(([title, sub]) => ({ title, sub, final: false, ported: false, note: 'only in the ascii-fx mockup (feature/ascii-fx 29c64a1)' })),
    ],
  },
  {
    id: 'palettes', title: 'Palettes', note: 'the one base palette; edit single colours',
    items: [
      { title: 'space + depth', sub: 'v2', palette: 'space', final: true },
      { title: 'world', sub: 'v2 planet ramps', palette: 'world', final: true },
      { title: 'lava', sub: 'crust, glow, ash', palette: 'lava', final: true },
      { title: 'crew', sub: 'BLK 36', palette: 'crew', final: true },
      { title: 'accent', sub: '[OIII] teal', palette: 'accent', final: true },
    ],
  },
  {
    id: 'explorations', title: 'Explorations', note: 'archive: exploration, not final',
    items: [
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((v) => ({
        title: `astronaut ${v}`, variant: v, final: false,
        state: { focus: 'lab', framing: 'lab', asset: { kind: 'lab', variant: v, color: 'mint', eyes: 0, yaw: -0.75 } },
      })),
      { ...planet('lava · static-painted', 'A/B mode, 3b6a482', { biome: 'lava', seed: 11, ring: 'off', lavaMode: 'static-painted' }), final: false },
      { ...planet('lava · full-warp', 'A/B mode, classic warp', { biome: 'lava', seed: 11, ring: 'off', lavaMode: 'full-warp' }), final: false },
    ],
  },
];

// Stable ids: group-index.
GROUPS.forEach((g) => g.items.forEach((it, i) => (it.id = `${g.id}-${i}`)));
export const ITEMS = GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.id })));

// The viewer's showcase (its depth view: hero planet, mid/far/silhouette copies, crew line-up and
// solo astronauts), as a composed scene. Positions, yaws and phases are the viewer's.
export function showcaseScene() {
  const hero = { kind: 'planet', biome: 'lush', seed: 7, ring: 'thin' };
  const planets = [[0, 0, 0], [-6.5, 1.2, -13], [9, 2.2, -27], [-13, 5, -40]].map((pos, i) => ({ ...hero, pos, moons: i === 0 }));
  const spot = [-1.35, -0.2, 4.6];
  const crew = [['coral', '@caden'], ['mint', '@mira'], ['lilac', '@juno']].map(([color, handle], i) => ({
    kind: 'astronaut', color, handle, eyes: 'auto', pos: [spot[0] + (i - 1) * 0.72, spot[1], spot[2]], yaw: [0.4, 0.05, -0.4][i], phase: i * 1.7,
  }));
  const solos = [[[4.6, -0.4, -8], -0.3], [[-1.5, 2.6, -21], 0.4], [[6.5, 4.2, -38], -0.5]].map(([pos, yaw], i) => ({
    kind: 'astronaut', color: 'coral', handle: '@caden', eyes: 'auto', pos, yaw, phase: 0.6 + i * 2.3,
  }));
  return { items: [...planets, ...crew, ...solos], selected: -1, framing: 'depth', camera: null };
}

/** A small composition: one planet and three astronauts at chosen positions and depths. */
export function crewScene() {
  return {
    items: [
      { kind: 'planet', biome: 'lava', seed: 11, size: 1.3, ring: 'off', pos: [0.4, 0.6, -4], artefacts: true },
      { kind: 'astronaut', color: 'coral', handle: '@caden', eyes: 'auto', pos: [-1.2, -0.4, 3.6], yaw: 0.45, phase: 0 },
      { kind: 'astronaut', color: '#e0a020', handle: '@you', eyes: 3, pos: [0.05, -0.55, 4.2], yaw: 0, phase: 2.1 },
      { kind: 'astronaut', color: 'lilac', handle: '@juno', eyes: 'auto', pos: [1.3, -0.3, 2.4], yaw: -0.5, phase: 4.4 },
    ],
    selected: -1, framing: 'depth', camera: { pos: [0.1, 0.7, 8.6], target: [0, 0, 0] },
  };
}
