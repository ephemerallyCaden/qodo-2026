// The catalogue (R1): every entry is a starting configuration for the inspector (a partial state:
// focus, framing and asset), for the composer (`scene`: a whole scene), or for the palette editor. Seeds are the asset viewer's own (its
// system shot), so each tile is a look the viewer already shows. `final: false` marks the
// exploration archive (R6). `t` (optional) is the loop time it opens at. `tag` (optional)
// replaces the final badge: a library extra, or a look whose meaning is open (R9). Pure data, no DOM.
import { BRANDS, DRONE_VARIANTS, variantOf } from './drones.js';
import { DEBRIS_COUNTS, CLASSES, CLASS_LABEL, AGES, AGE_NAMES } from './debris-spec.js';
import { FOG_COVERAGES, FOG_DEFAULTS, chartEvents } from './fog-spec.js';

const astro = (title, sub, asset, extra = {}) => ({ title, sub, final: true, state: { focus: 'astronaut', framing: 'body', asset: { kind: 'astronaut', ...asset } }, ...extra });
const planet = (title, sub, asset, { camera = null, ...extra } = {}) => ({ title, sub, final: true, state: { focus: 'planet', framing: 'planet', camera, asset: { kind: 'planet', ...asset } }, ...extra });
const focus = (f, framing = 'planet') => (e) => ({ ...e, state: { ...e.state, focus: f, framing } });
// Each provider drone's tile: its title and what it covers (brands.js covers, shortened to a tile)
const DRONE_TILES = {
  claude: ['Claude Code', 'CLI, web, Action'], cursor: ['Cursor', 'IDE, CLI, cloud agent'], copilot: ['GitHub Copilot', 'cloud agent, CLI, app, VS Code'],
  codex: ['OpenAI Codex', 'CLI, cloud'], google: ['Google', 'Jules, Gemini CLI, Antigravity'], devin: ['Devin', 'cloud, CLI, Devin Desktop'],
  kiro: ['Kiro / Amazon Q', 'Kiro CLI, IDE, cloud; Amazon Q'], opencode: ['OpenCode', 'CLI, GitHub agent'], qodo: ['Qodo', 'the review bot, its fix commits'],
  generic: ['generic', 'any other detected tool'], unknown: ['unknown agent', 'the generic drone, its own label'],
};
const drone = (title, sub, asset, extra = {}) => ({ title, sub, final: true, state: { focus: 'drone', framing: 'drone-close', asset: { kind: 'drone', yaw: -0.5, ...asset } }, ...extra });
const HOST_HIDDEN = { surface: false, haze: false, clouds: false, ring: false };
const star = (title, sub, asset, extra = {}) => ({ title, sub, final: true, state: { focus: 'star', framing: 'star', asset: { kind: 'star', ...asset } }, ...extra });

// What each planet look means (art direction §6, "What a planet tells you"): its code-health band,
// worst to best (lava, toxic, ash, healthy; lush, ocean and ice are the healthy band's three
// seeded looks), or a library extra that never appears in the product view.
export const BIOME_MEANING = {
  lava: 'the worst health band',
  toxic: 'the second-worst health band, between lava and ash',
  desert: 'the ash health band (the desert look)',
  lush: 'the healthy band: one of its three seeded looks (lush, ocean, ice)',
  ocean: 'the healthy band: one of its three seeded looks (lush, ocean, ice)',
  ice: 'the healthy band: one of its three seeded looks (lush, ocean, ice)',
  gas: 'a library extra, never shown in the product view',
  moon: 'a library extra, never shown in the product view',
};
export const EXTRA = 'library extra';
export const RING_TAG = 'meaning open';
export const TRIAL_TAG = 'trial';

// Cameras for the trial lineup: the viewer's hero planet view (VIEWS.planet), and the same line at
// mid distance (12, as the health-looks lab's 'mid' condition).
const HERO_POS = [1.92, 1.12, 6.69];
const MID_POS = HERO_POS.map((x) => Math.round(((x * 12) / Math.hypot(...HERO_POS)) * 1e4) / 1e4);
const debrisTile = (title, sub, asset, debris) => focus('debris')(planet(title, sub, { ring: 'off', ...asset, debris: { on: true, ...debris } }));
const fogTile = (title, sub, asset, fog, extra = {}) => focus('fog')(planet(title, sub, { ring: 'off', ...asset, fog: { ...FOG_DEFAULTS, on: true, ...fog } }, extra));
/** A fog tile caught mid-event: the chart button `kind` ('one', 'refog' or 'all') pressed at `at`, shown at t. */
const fogEventTile = (title, sub, asset, charted, kind, at, t) => {
  const it = { seed: 7, ...asset, fog: { ...FOG_DEFAULTS, on: true, charted } };
  return fogTile(title, sub, asset, { charted, ...chartEvents(it, kind, at) }, { t });
};
const pct = (x) => `${Math.round(x * 100)}%`;
const trialTile = (title, sub, asset, camera = null) => planet(title, sub, { ...asset, trial: 'dusty-ash' }, { final: false, tag: TRIAL_TAG, camera });

/** The star's spot in the viewer's system view (viewer.js SYSTEM_STAR; test/star.test.mjs checks): up and back, upper left. */
export const STAR_SPOT = [-8.4, 7.6, -28];

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
    // agent sessions: the drone lab's drones (read-only), one per provider, then its explorations
    id: 'drones', title: 'Drones', note: 'agent sessions: one drone per provider (final), any session seed; A–E: the drone lab\'s explorations',
    items: [
      ...BRANDS.map((b) => drone(DRONE_TILES[b.id]?.[0] ?? b.name, DRONE_TILES[b.id]?.[1] ?? b.covers, { provider: b.id })),
      ...DRONE_VARIANTS.map((v) => drone(`drone ${v}`, variantOf(v).name, { variant: v }, { final: false })),
    ],
  },
  {
    // the repo at the centre of its system (star-art.md): the Day 1 GIF's sun, one per repo, a constant look
    id: 'star', title: 'Star', note: 'the repo: one star per system, a constant look (no data in its colour); moonlets are root files and unmatched tests',
    items: [
      star('star', 'the Day 1 sun · corona on', {}),
      star('corona off', 'the disc alone', { corona: false }),
      star('with moonlets', '5 moonlets, the moon look', { moonlets: 5 }),
      { title: 'star system', sub: 'star, 3 planets, a debris planet, crew K', final: true, scene: starSystemScene() },
    ],
  },
  {
    // worst to best, then the extras; no rings, since a ring's meaning is open
    id: 'planets', title: 'Planets', note: 'a look is a code-health band, worst to best; size = lines of code, moons = test files',
    items: [
      planet('lava', 'worst health band · 11', { biome: 'lava', seed: 11, ring: 'off' }),
      planet('toxic', 'second-worst band · 13', { biome: 'toxic', seed: 13, ring: 'off' }),
      planet('desert', 'ash band · 3', { biome: 'desert', seed: 3, ring: 'off' }),
      trialTile('dustier ash · trial', 'P2 ash look · 3', { biome: 'desert', seed: 3, ring: 'off' }),
      planet('lush', 'healthy look 1/3 · 7', { biome: 'lush', seed: 7, ring: 'off' }),
      planet('ocean', 'healthy look 2/3 · 42', { biome: 'ocean', seed: 42, ring: 'off' }),
      planet('ice', 'healthy look 3/3 · 21', { biome: 'ice', seed: 21, ring: 'off' }),
      planet('gas giant', 'very large · 5', { biome: 'gas', seed: 5, ring: 'off' }, { tag: EXTRA }),
      planet('barren moon', 'tiny, cratered · 9', { biome: 'moon', seed: 9, ring: 'off', moons: false }, { tag: EXTRA }),
    ],
  },
  {
    // planet-health-looks P2, beside the shipped looks it sits between, at the hero and mid distances
    // rows worst to best, columns hero | mid (the grid's two columns)
    id: 'trials', title: 'Trial: dustier ash', note: 'P2, not adopted: judge by eye. Worst to best down, hero | mid distance across',
    items: [
      ['lava', 'worst band', { biome: 'lava', seed: 11 }],
      ['toxic', 'second-worst band', { biome: 'toxic', seed: 13 }],
      ['ash', 'ash band, shipped', { biome: 'desert', seed: 3 }],
      ['ash (trial)', 'ash band, P2', { biome: 'desert', seed: 3 }, true],
      ['lush', 'healthy band', { biome: 'lush', seed: 7 }],
    ].flatMap(([title, sub, asset, trial]) => [['hero', null], ['mid', { pos: MID_POS, target: [0, 0, 0] }]].map(([d, camera]) => (
      trial ? trialTile(`${title} · ${d}`, sub, { ...asset, ring: 'off' }, camera) : planet(`${title} · ${d}`, sub, { ...asset, ring: 'off' }, { camera })))),
  },
  {
    id: 'moons', title: 'Moons', note: 'moons are test files; the two warm moons every planet can carry',
    items: [
      focus('moon')(planet('moon pair', 'orbiting the lush hero', { biome: 'lush', seed: 7, ring: 'off' })),
      focus('moon')(planet('moons alone', 'host body hidden', { biome: 'lush', seed: 7, ring: 'off', layers: HOST_HIDDEN })),
      focus('moon')(planet('wide orbits', 'pushed out, steeper', { biome: 'desert', seed: 3, ring: 'off', moonOrbits: [{ size: 0.14, orbit: 2.3, incl: 0.6, yaw: 0.25, offset: 0.15 }, { size: 0.08, orbit: 1.6, incl: -0.3, yaw: -0.4, offset: 0.62 }] })),
    ],
  },
  {
    id: 'rings', title: 'Rings', note: 'a modifier on any band: width × distance. Meaning open: library only',
    items: [
      focus('ring')(planet('thin ring', 'default · 0.22 at 1.69', { biome: 'lush', seed: 7, moons: false }, { tag: RING_TAG })),
      focus('ring')(planet('wide ring', 'wide belt · 0.72 at 1.54', { biome: 'lush', seed: 7, ring: 'wide', ringWidth: 0.72, ringInner: 1.54, moons: false }, { tag: RING_TAG })),
      focus('ring')(planet('thread', '0.04 at 1.25', { biome: 'ocean', seed: 42, ringWidth: 0.04, ringInner: 1.25, moons: false }, { tag: RING_TAG })),
      focus('ring')(planet('far belt', '0.72 at 2.6', { biome: 'desert', seed: 3, ringWidth: 0.72, ringInner: 2.6, moons: false }, { tag: RING_TAG })),
      focus('ring')(planet('ring alone', 'host body hidden', { biome: 'lush', seed: 7, ring: 'wide', ringWidth: 0.72, ringInner: 1.54, moons: false, layers: HOST_HIDDEN }, { tag: RING_TAG })),
    ],
  },
  {
    // stale work (R13; art direction §6 Debris): the clutter scale, every kind at every age, and on every band
    id: 'debris', title: 'Debris', note: 'stale work near the planet it touches: 0, 1, 3, 8 and 24 pieces; each kind at each age; on every band',
    items: [
      ...DEBRIS_COUNTS.map((n) => debrisTile(`debris · ${n}`, n === 24 ? '24 items, 12 drawn' : `${n} stale item${n === 1 ? '' : 's'}`, { biome: 'lush', seed: 7 }, { count: n })),
      ...CLASSES.flatMap((cls) => AGES.map((age, a) => debrisTile(`${CLASS_LABEL[cls]}`, `${AGE_NAMES[a]} · 3 pieces`, { biome: 'lush', seed: 7 },
        { items: [240, 900, 3000].map((diff, i) => ({ id: `${cls}-${i}`, cls, diff, age: age + i })) }))),
      ...[['lava', 11, 'worst band'], ['toxic', 13, 'second-worst band'], ['desert', 3, 'ash band'], ['lush', 7, 'healthy'], ['ocean', 42, 'healthy'], ['ice', 21, 'healthy']]
        .map(([biome, seed, band]) => debrisTile(`debris on ${biome}`, `8 items · ${band}`, { biome, seed }, { count: 8 })),
      debrisTile('debris alone', 'host body hidden · 8 items', { biome: 'lush', seed: 7, layers: HOST_HIDDEN }, { count: 8 }),
    ],
  },
  {
    // fog of war (R5; the fog lab's D2d · dark veil): every band at every charted share, the chart buttons, and fog with debris
    id: 'fog', title: 'Fog', note: 'the files you haven\'t reviewed, under a dark veil: every band at 0, 25, 50, 75 and 100% charted; chart one, refog one, chart all; fog with debris',
    items: [
      ...[['lava', 11, 'worst band'], ['toxic', 13, 'second-worst band'], ['desert', 3, 'ash band'], ['lush', 7, 'healthy'], ['ocean', 42, 'healthy'], ['ice', 21, 'healthy']]
        .flatMap(([biome, seed, band]) => FOG_COVERAGES.map((charted) => fogTile(`fog · ${biome} ${pct(charted)}`, `${pct(charted)} charted · ${band}`, { biome, seed }, { charted }))),
      // chosen so the file is on the visible hemisphere: at 50% the next file is never in view on this planet
      fogEventTile('chart one', 'the next file clears · 25% charted, 0.3 s in', { biome: 'lush', seed: 7 }, 0.25, 'one', 10.7, 11),
      fogEventTile('refog one', 'the last charted file refogs · 1.2 s in', { biome: 'lush', seed: 7 }, 0.5, 'refog', 5.8, 7),
      fogEventTile('chart all', 'every fogged file clears · 0.7 s in', { biome: 'lush', seed: 7 }, 0, 'all', 2.3, 3),
      fogTile('fog with debris', '50% charted · 8 debris pieces', { biome: 'lush', seed: 7, debris: { on: true, count: 8 } }, { charted: 0.5 }),
    ],
  },
  {
    id: 'clouds', title: 'Clouds', note: 'weather layers: cover, float, shadow',
    items: [
      focus('clouds')(planet('cloud masses', 'lush weather', { biome: 'lush', seed: 7, ring: 'off', moons: false })),
      focus('clouds')(planet('thin clouds', 'ocean weather', { biome: 'ocean', seed: 42, ring: 'off', moons: false })),
      focus('clouds')(planet('rust smoke', 'toxic weather', { biome: 'toxic', seed: 13, ring: 'off', moons: false })),
      focus('clouds')(planet('ash plumes', 'lava smoke', { biome: 'lava', seed: 11, ring: 'off', moons: false })),
      focus('clouds', 'clouds-zoom')(planet('cloud close-up', 'the cloud-zoom framing', { biome: 'lush', seed: 7, ring: 'off', moons: false })),
      focus('clouds')(planet('clouds alone', 'host body hidden', { biome: 'lush', seed: 7, ring: 'off', moons: false, cover: 0.35, layers: { ...HOST_HIDDEN, clouds: true } })),
    ],
  },
  {
    id: 'fx', title: 'FX', note: 'the code layer: planet artefacts (adopted) and the ASCII FX candidates',
    items: [
      // t: the loop time where the glitch covers the most pixels (measured), so the tile shows it
      { ...focus('fx')(planet('artefacts', 'auto by size', { biome: 'lush', seed: 7, artefacts: true })), t: 11.9 },
      { ...focus('fx')(planet('artefacts + teal', '[OIII] garnish', { biome: 'lush', seed: 7, artefacts: true, artTeal: true })), t: 11.2 },
      { ...focus('fx')(planet('artefacts on lava', 'contrast glyphs', { biome: 'lava', seed: 11, ring: 'off', artefacts: true, size: 1.4 })), t: 7.7 },
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
      { title: 'star', sub: 'disc, corona', palette: 'star', final: true },
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
export const ITEMS = GROUPS.flatMap((g) => g.items);

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

/** A small system in the viewer's system view: the star at STAR_SPOT, the lush
 *  hero, lava and ocean planets (the viewer's system spots), a desert planet with 8 debris pieces, and the crew. */
export function starSystemScene() {
  const spot = [-1.35, -0.2, 4.6];
  const crew = [['coral', '@caden'], ['mint', '@mira'], ['lilac', '@juno']].map(([color, handle], i) => ({
    kind: 'astronaut', color, handle, eyes: 'auto', pos: [spot[0] + (i - 1) * 0.72, spot[1], spot[2]], yaw: [0.4, 0.05, -0.4][i], phase: i * 1.7,
  }));
  return {
    items: [
      { kind: 'star', pos: [...STAR_SPOT] },
      { kind: 'planet', biome: 'lush', seed: 7, ring: 'thin', pos: [0.75, 0.15, 0] },
      { kind: 'planet', biome: 'lava', seed: 11, size: 0.7, ring: 'off', moons: false, pos: [3.3, -0.9, 0.9] },
      { kind: 'planet', biome: 'ocean', seed: 42, size: 1.25, ring: 'off', moons: false, pos: [7.2, 3.6, -19] },
      { kind: 'planet', biome: 'desert', seed: 3, size: 0.85, ring: 'off', moons: false, pos: [-1.0, 3.4, -9], debris: { on: true, count: 8 } },
      ...crew,
    ],
    selected: -1, framing: 'system', camera: null,
  };
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
