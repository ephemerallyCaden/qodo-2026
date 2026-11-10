// The iteration view (R10): how each asset family got to its final look, as dated timelines,
// oldest to final. Each step says what changed and why, from docs/design/art-direction-history.md,
// the commit messages and the archive's file names (dates are the commits', UTC).
//
// A step is live when today's code can still render it: an old parameter set, or an old palette
// on today's shapes (`live`). The others show their archived render (`img`, a path under the
// local art archive, <main-checkout>/.archive/art-iteration/, which is gitignored and served by
// routes.mjs from the allowlist below, never copied into git). A step can offer `options` (the
// lab's variants, the 25 Lospec palettes), each a patch over its live view.
//
// History palettes are plain data, applied in their own viewer palette (palette.js
// lookPalette), never as palette edits, so the old looks stay in this view. `base` names a
// viewer palette ('lospec:<slug>'; default: the library base), `world` lays today's v2 planet
// ramps over it, and `set` replaces whole roles (plain objects merge one level). The vendored
// tables were copied from git at `rev`; test/history.test.mjs checks them against it.
// Pure data, no DOM and no three.js, so state.js and the Node tests can use it.
import { showcaseScene, GROUPS } from './catalogue.js';
import { LOSPEC_ORDER } from '../asset-viewer/palettes.js';
import { BRANDS } from './drones.js';

// ---------------------------------------------------------------- vendored palettes
// f4ceea0 viewer.js: the suit shared by v1 and v2 there (the cool white approved in revision 1)
const SUIT_F4 = {
  suit: ['#68718f', '#a3aec8', '#d3dcea', '#f2f6fc'],
  gear: ['#4a5170', '#77819f', '#a2adc6', '#c4cee0'],
  visor: ['#0f1329', '#232f58'],
  glint: '#f4f8ff',
};
export const VENDORED = {
  // f4ceea0 PALETTES.v1: the batch 1 Planetarium pastels (6e287db), kept there for a before/after
  v1: {
    rev: 'f4ceea0', file: 'mockups/asset-viewer/viewer.js', key: 'PALETTES.v1',
    set: {
      ...SUIT_F4,
      space: '#2b2535',
      stars: ['#5d5372', '#a99cbf', '#f4ecf7'],
      ocean: ['#2f3a62', '#3f5794', '#5a7fc0', '#80a9dc', '#acd3ee'],
      land: ['#33504a', '#4c7a5a', '#6fa36a', '#9cc678', '#cfe39a'],
      cap: ['#6e6a86', '#b9b3c9', '#e6e0ee', '#fbf8ff'],
      cloud: ['#6e6274', '#b39c94', '#e3cdb0', '#fff6e4'],
      ring: ['#5d4e72', '#8f7fae', '#d8a9b8', '#f2d6b3'],
      contributors: {
        coral: ['#6e3a4c', '#b85c66', '#f08e7f', '#ffc4a8'],
        mint: ['#2c5a5a', '#3f9886', '#6fd1b0', '#bff2da'],
        lilac: ['#433a74', '#7563bd', '#a993ec', '#dccfff'],
      },
      depth: [['#262a46', 0], ['#262a46', 0.35], ['#262a46', 0.7], ['#110f18', 0.88]],
    },
  },
  // f4ceea0 PALETTES.v2: more vibrant on near-black space, with the violet-pink ring and the purple cloud shadow
  v2: {
    rev: 'f4ceea0', file: 'mockups/asset-viewer/viewer.js', key: 'PALETTES.v2',
    set: {
      ...SUIT_F4,
      space: '#0d0b16',
      stars: ['#3b3866', '#9a90e0', '#fff8ff'],
      ocean: ['#141d5c', '#1d3fa6', '#2b6ee0', '#4ea3f7', '#94dcff'],
      land: ['#123d33', '#1d7350', '#38a85a', '#7cd65a', '#d0f56c'],
      cap: ['#3f4590', '#98a3e8', '#dfe5ff', '#ffffff'],
      cloud: ['#30285a', '#8f74b0', '#f2d8b8', '#fffaf0'],
      ring: ['#3a2a78', '#8463e6', '#ff86bf', '#ffd38a'],
      contributors: {
        coral: ['#5c1838', '#cc3f4f', '#ff7663', '#ffbb8c'],
        mint: ['#0e4247', '#0fa384', '#33e6a8', '#a6ffd8'],
        lilac: ['#2a1a74', '#6948ea', '#a27aff', '#dac9ff'],
      },
      depth: [['#1b1f4a', 0], ['#1b1f4a', 0.38], ['#1b1f4a', 0.72], ['#17172f', 0.88]],
    },
  },
  // b67f935 planet-ramps.js PLANET_RAMPS: the research ×2 shared set (13 colours), on BLK 36 banded space
  researchX2: {
    rev: 'b67f935', file: 'mockups/asset-viewer/planet-ramps.js', key: 'PLANET_RAMPS',
    set: {
      ocean: ['#29272d', '#163b68', '#163b68', '#32618e', '#32618e'],
      land: ['#29272d', '#4a5530', '#4a5530', '#787b53', '#787b53'],
      cap: ['#29272d', '#5a4e5e', '#c8fefe', '#c8fefe', '#c8fefe'],
      cloud: ['#ebceb7', '#ebceb7', '#f7eed9', '#f7eed9'],
      water: ['#29272d', '#163b68', '#163b68', '#32618e', '#32618e'],
      ice: ['#29272d', '#5a4e5e', '#c8fefe', '#c8fefe', '#c8fefe'],
      crevasse: ['#29272d', '#ac5021', '#ac5021', '#ac5021', '#ac5021'],
      sand: ['#29272d', '#ac5021', '#a3692e', '#a3692e', '#ebceb7'],
      rock: ['#16120e', '#29272d', '#ac5021', '#927a5b', '#927a5b'],
      crust: ['#16120e', '#16120e', '#16120e', '#29272d', '#29272d'],
      ash: ['#29272d', '#5a4e5e', '#5a4e5e', '#927a5b'],
      glow: ['#ff3300', '#ff6600', '#ff8d0b'],
      gasA: ['#29272d', '#927a5b', '#ebceb7', '#f7eed9', '#f7eed9'],
      gasB: ['#29272d', '#ac5021', '#a3692e', '#a3692e', '#ebceb7'],
      moon: ['#29272d', '#5a4e5e', '#927a5b', '#927a5b', '#ebceb7'],
      sludge: ['#29272d', '#ac5021', '#ac5021', '#a3692e', '#a3692e'],
      toxic: ['#29272d', '#4a5530', '#787b53', '#787b53', '#787b53'],
      fungus: ['#29272d', '#5a4e5e', '#5a4e5e', '#5a4e5e', '#5a4e5e'],
      spore: ['#a3692e', '#a3692e', '#ebceb7', '#ebceb7'],
      ring: {
        lush: ['#29272d', '#5a4e5e', '#32618e', '#927a5b'], ocean: ['#29272d', '#5a4e5e', '#32618e', '#927a5b'],
        ice: ['#29272d', '#5a4e5e', '#c8fefe', '#927a5b'], desert: ['#29272d', '#5a4e5e', '#a3692e', '#927a5b'],
        lava: ['#29272d', '#5a4e5e', '#ac5021', '#927a5b'], gas: ['#29272d', '#5a4e5e', '#ebceb7', '#927a5b'],
        moon: ['#29272d', '#5a4e5e', '#927a5b', '#927a5b'], toxic: ['#29272d', '#5a4e5e', '#a3692e', '#927a5b'],
      },
      moonBody: ['#a3692e', '#a3692e', '#ebceb7', '#f7eed9'],
      haze: { ocean: '#c8fefe', ice: '#c8fefe', toxic: '#787b53' },
      halo: '#5a4e5e',
    },
  },
  // a5d8bf6 planet-ramps.js V2_PLANET_RAMPS, the toxic roles: the acid-lime extra before #19
  acid: {
    rev: 'a5d8bf6', file: 'mockups/asset-viewer/planet-ramps.js', key: 'V2_PLANET_RAMPS',
    set: {
      sludge: ['#2e1c14', '#6a3a1e', '#a8602c', '#d8944a', '#f0c27a'],
      toxic: ['#1c3810', '#386814', '#68a41c', '#a6d63a', '#e0ff7a'],
      fungus: ['#381444', '#682a76', '#9848a6', '#c678d2'],
      spore: ['#688828', '#a6c648', '#d2ea78', '#f2ffbe'],
      haze: { toxic: '#c8f06a' },
    },
  },
  // e23aff9 planet-ramps.js TOXIC_LOOKS.sulphur: the #19 candidate that lost to rust-ember
  sulphur: {
    rev: 'e23aff9', file: 'mockups/asset-viewer/planet-ramps.js', key: 'TOXIC_LOOKS.sulphur',
    set: {
      sludge: ['#1a1410', '#2a2016', '#3c2e1c', '#523e22', '#6a5028'],
      toxic: ['#3a2814', '#5e4018', '#88601e', '#b2842a', '#e8a840'],
      fungus: ['#8a7428', '#b49a34', '#d8c050', '#ecdc86'],
      spore: ['#2e2622', '#6e6052', '#94826a', '#b8a486'],
      haze: { toxic: '#e0a46a' },
    },
  },
};
// 63f3913 and b67f935: BLK 36's hard space bands
const BANDS_63F = ['#000000', '#12173d', '#29174c'];
const BANDS_B67 = ['#12173d', '#29174c', '#412866'];

// ---------------------------------------------------------------- live views
const TL = (name) => `04-timeline/${name}`;
const planet = (o = {}) => ({ kind: 'planet', ...o });
const solo = (asset, framing = 'planet', more = {}) => ({ items: [asset], framing, ...more });
const showcase = (framing, more = {}) => ({ items: showcaseScene().items, framing, ...more });
const LUSH = planet({ biome: 'lush', seed: 7 }); // the viewer's hero planet
// The catalogue's planet tiles, by biome, worst band to best then the extras
const TILES = Object.fromEntries(GROUPS.find((g) => g.id === 'planets').items.filter((it) => !it.state.asset.trial).map((it) => [it.state.asset.biome, it.state.asset]));
const TOXIC = TILES.toxic, LAVA = TILES.lava;
// The health bands worst to best (art direction §6), one row, no rings or moons, depth fade off
const BANDS = Object.keys(TILES).slice(0, 6);
const lineup = () => ({
  items: BANDS.map((biome, i) => planet({ ...TILES[biome], size: 0.9, moons: false, pos: [(i - 2.5) * 2.4, 0, 0] })),
  camera: { pos: [0, 0.6, 13], target: [0, 0, 0] },
  render: { depth: false },
});

// The debris family: 8 of the viewer's demo items on the lush hero, in a debris-lab direction
const DEBRIS_NAMES = { A: 'derelicts', B: 'junkyard', C: 'scrap blocks', D: 'tagged canisters', E: 'wake' };
const debrisOf = (direction) => ({ on: true, count: 8, mix: 'mixed', direction });
const debrisView = (direction) => solo({ ...LUSH, ring: 'off', debris: debrisOf(direction) });

// ---------------------------------------------------------------- families
export const FAMILIES = [
  {
    id: 'crew', title: 'Crew', note: 'the astronauts: a primitive toy, an SDF figure, V1 glyph faces, the V2 eyes, the lab variants A–J and the final K',
    steps: [
      { date: '2026-11-03 11:33', rev: '6e287db', title: 'batch 1: a toy from primitives', img: TL('01-6e287db-live-3D-asset-viewer-for-batch-1-lush-p--crew-closeup.png'),
        changed: 'Chunky toy proportions built from primitives: a round helmet about 40% of the height, a reflective visor, stubby limbs, a boxy backpack and a cream pastel suit.',
        why: 'The first design Q&A: live 3D only, and the crew reads as small toys beside the planets.' },
      { date: '2026-11-03 12:28', rev: 'fb7fefa', title: 'one SDF body', img: TL('02-fb7fefa-batch-1-revision-SDF-astronaut-flatter--crew-closeup.png'),
        changed: 'One raymarched SDF body with continuous bent limb tubes, self cast shadows, a cool-white suit and a two-tone near-black visor. The contributor colour moves to the backpack stripe and shoulder bands.',
        why: 'Revision 1: a bluer suit, shadows unified across the parts, one tube per limb, and no contributor colour on the visor.' },
      { date: '2026-11-03 12:39', rev: 'f4ceea0', title: 'letterbox visor', img: TL('03-f4ceea0-batch-1-revision-2-noise-driven-clouds--crew-closeup.png'),
        changed: 'The visor becomes a wide letterbox with a gear rim.',
        why: 'Revision 2 approved the body, limbs, shadows and shoulder bands, and asked for a wide letterbox visor.' },
      { date: '2026-11-03 12:46', rev: '5cf1afd', title: 'V1 ASCII glyph faces', img: TL('04-5cf1afd-ASCII-screen-faces-4-3-visor-bigger-he--crew-closeup.png'),
        changed: 'A 4:3 screen visor with ApprenticeHack V1 faces: eye and mouth glyphs as pixel bitmaps, hashed from the handle. The helmet grows to about 48% of the height.',
        why: 'Revision 2 addendum: a monitor-screen ratio, the faces from ApprenticeHack\'s avatar renderer, and a bigger head.' },
      { date: '2026-11-03 13:01', rev: '102578e', title: 'corner glint, mouths hidden', img: TL('06-102578e-25-Lospec-palette-mockups-corner-glint--crew-closeup.png'),
        changed: 'The glint becomes a fixed 3 px reflection in the screen\'s corner, and the mouths are hidden.',
        why: 'Revision 3: the glint must never cover the face, and the faces become eyes only.' },
      { date: '2026-11-03 13:09', rev: '3289d9f', title: 'V2 eyes, chibi proportions', img: TL('07-3289d9f-ApprenticeHack-V2-eyes-chibi-proportion--crew-closeup.png'),
        changed: 'The ten ApprenticeHack V2 eye designs replace the glyph faces, with staggered blinks. Chibi proportions: a 55% helmet, a short torso and stubby bent limbs.',
        why: 'Revision 3: V2 eye designs, eyes only and not ASCII glyphs, and much shorter limbs.' },
      { date: '2026-11-03 13:49', rev: 'ea84759', title: 'BLK 36 crew, SDF eyes', img: TL('09-ea84759-final-palette-BLK-36-crew--Earth-planet--crew-closeup.png'),
        changed: 'The crew takes BLK 36 exactly, and the eyes become 2D SDFs on the visor, pixelated only by the render pass.',
        why: 'Revision 4: BLK 36 (tile 19 of the palette sheet) for the crew; eyes resolution-independent, not pre-rasterised.' },
      { date: '2026-11-04 14:28', rev: '3ecf36f', title: 'astronaut lab: A–J', exploration: true,
        live: { ...solo({ kind: 'lab', variant: 'A', color: 'mint', eyes: 0, yaw: -0.75 }, 'lab'),
          options: { label: 'variant', list: 'ABCDEFGHIJ'.split('').map((v) => ({ id: v, label: v, item: { variant: v } })) } },
        changed: 'One parameterised figure with ten parameter sets: proportions, joint types, cuffs, neck seal, and the torso, helmet and backpack shapes.',
        why: 'To pick the final figure side by side, every variant in the same pipeline with BLK 36 and the V2 eyes. Explorations, not final.' },
      { date: '2026-11-04 20:16', rev: 'aac6a1b', title: 'K, the final crew', final: true, live: showcase('scene-crew'),
        changed: 'K is ported into the asset viewer: C\'s grey hard-suit rings and cuffs with A\'s smooth white limbs and backpack. It differs from the lab\'s K by 0 pixels.',
        why: 'The human picked K (91fdc3c: C plus A\'s pack, smooth white).' },
    ],
  },
  {
    id: 'planets', title: 'Planets and biomes', note: 'from one lush planet to a look per code-health band',
    steps: [
      { date: '2026-11-03 11:33', rev: '6e287db', title: 'batch 1: one lush planet', img: TL('01-6e287db-live-3D-asset-viewer-for-batch-1-lush-p--planet-closeup.png'),
        changed: 'A procedural shader sphere: noise terrain in palette bands, puffy cloud heaps past the silhouette and a scattered-pixel ring.',
        why: 'The primary reference, Planetarium: keep its clouds, rings, starfield and tiny font.' },
      { date: '2026-11-03 13:41', rev: '36d4284', title: 'a biome set, health as biome', img: TL('08-36d4284-biome-set-ocean-ice-desert-lava-rin--variety-sheet.png'),
        changed: 'One biome-switched shader: lush, ocean, ice, desert and lava, plus gas giant, barren moon and toxic as extras, each with its own weather and lit-limb haze.',
        why: 'The first meaning (2026-11-03): lush = healthy and active, ocean and ice = stable, desert = stale, lava = churn. Superseded by the health bands.' },
      { date: '2026-11-03 13:49', rev: 'ea84759', title: 'Earth-like ramps', img: TL('09-ea84759-final-palette-BLK-36-crew--Earth-planet--variety-sheet.png'),
        changed: 'Planets, rings and haze move to planet-ramps.js: v2\'s lush ramps plus a naturalistic ramp per biome.',
        why: 'Revision 4: the planets use the Earth-like v2 ramps and the crew uses BLK 36.' },
      { date: '2026-11-04 01:16', rev: 'e917540', title: 'bold jagged cracks', img: TL('20-e917540-bold-jagged-lava-fissures-and-ice-crevas--variety-sheet.png'),
        changed: 'Lava fissures and ice crevasses become Voronoi edges at least 2 px wide, with pointed junctions and 1 px tips (the median lava width went from 1 to 4–5 px).',
        why: 'The human (2026-11-04): the old 1 px lines broke into dots through the pixel filter.' },
      { date: '2026-11-04 11:32', rev: 'ab78778', title: 'open lava pools and ice water', img: TL('22-ab78778-open-lava-pools-and-ice-water-orange-la--variety-sheet.png'),
        changed: 'Lava worlds get open molten seas and ice worlds open dark-blue water. The lava turns more orange, with yellow only on the hottest cores, over a bluer crust.',
        why: 'The human (2026-11-04): each planet mixes solid ground, crack networks and open areas.' },
      { date: '2026-11-09 20:37', rev: '83dfc76', title: 'looks carry code health', final: true, live: lineup(),
        changed: 'A planet\'s look is its code-health band, worst to best: lava, toxic, ash (the desert look), healthy. Lush, ocean and ice are the healthy band\'s three seeded looks. Gas giant and barren moon stay library extras.',
        why: 'The human (2026-11-06 and 2026-11-09): every visual property carries data or stays inside one meaning, and worse reads hotter and darker. Shown here worst to best.' },
    ],
  },
  {
    id: 'toxic', title: 'Toxic', note: 'from an acid-lime extra to the ember health band (#19)',
    steps: [
      { date: '2026-11-03 14:28', rev: '351c05a', title: 'acid lime, an extra', live: { ...solo(TOXIC), palette: { set: VENDORED.acid.set } },
        changed: 'Ochre sludge seas with glowing veins, acid-lime growth, violet fungal blooms, lime spore puffs and a lime haze.',
        why: 'A library extra meaning "overgrown, risky" (the 2026-11-03 biome set, 36d4284); its v2 ramps date from 351c05a.' },
      { date: '2026-11-07 06:03', rev: 'e23aff9', title: 'a health band: sulphur candidate', live: { ...solo(TOXIC), palette: { set: VENDORED.sulphur.set } },
        changed: 'Toxic becomes the band between lava and ash desert, and the violet fungus goes. One of two candidates: dark tar seas with amber veins, scorched ochre ground, pale sulphur crusts and sooty tan fumes.',
        why: '#19: lime and violet read as a different world, not as "less bad than lava", and the violet broke the ring hue rule. The colours must sit between the lava glow and the sand.' },
      { date: '2026-11-07 11:32', rev: 'b00e1f9', title: 'rust-ember, the toxic band', final: true, live: solo(TOXIC),
        changed: 'Rust-ember ships: cooled slag seas with ember veins, rust ground, oxidised orange crusts and dull rust smoke. The acid and sulphur looks leave the code and stay only here.',
        why: 'The human picked ember: its hues (39–79°) sit between the lava glow and the sand, so the bands read as one scale.' },
    ],
  },
  {
    id: 'lava', title: 'Lava', note: 'the worst health band: fissures, pools, then a moving molten layer',
    steps: [
      { date: '2026-11-03 13:41', rev: '36d4284', title: 'lava enters', img: TL('08-36d4284-biome-set-ocean-ice-desert-lava-rin--system-shot.png'),
        changed: 'A near-black crust with glowing fissures and low ash smoke.',
        why: 'The first biome set; lava then meant a churn or bug-fix hotspot.' },
      { date: '2026-11-04 01:16', rev: 'e917540', title: 'bold fissures', img: TL('20-e917540-bold-jagged-lava-fissures-and-ice-crevas--system-shot.png'),
        changed: 'Fissures become jagged Voronoi edges up to 3 px wide, with a bright core and dark edges, and the ash rises off them.',
        why: 'The old 1 px lines broke into dots (16–62% isolated pixels).' },
      { date: '2026-11-04 11:32', rev: 'ab78778', title: 'open pools, orange glow', img: TL('22-ab78778-open-lava-pools-and-ice-water-orange-la--system-shot.png'),
        changed: 'About 30% of the sphere becomes open molten pools. The glow turns orange, with yellow only on the hottest cores, and the crust shades slightly bluer.',
        why: 'The human (2026-11-04): more open areas, more orange, yellow only as an accent.' },
      { date: '2026-11-04 15:02', rev: '3b6a482', title: 'animated lava: A/B modes', exploration: true,
        live: { ...solo({ ...LAVA, lavaMode: 'static-painted' }), options: { label: 'mode', list: [
          { id: 'static-painted', label: 'static-painted', item: { lavaMode: 'static-painted' } },
          { id: 'full-warp', label: 'full-warp', item: { lavaMode: 'full-warp' } }] } },
        changed: 'A loop-locked, domain-warped FBM makes the molten rock churn while the 24 s loop stays seamless: painted flow over static plates, or the whole surface warping.',
        why: 'Lava should move without breaking the loop. These modes stay as A/B options.' },
      { date: '2026-11-04 20:47', rev: 'ea79f2c', title: 'layered lava', final: true, live: solo(LAVA),
        changed: 'Cracks become gaps between crust plates that show the moving molten layer underneath, and pools are missing plates. The plates hold still.',
        why: 'Picked over the A/B modes; lava is now the worst health band (art direction §6).' },
    ],
  },
  {
    id: 'clouds', title: 'Clouds', note: 'from puffy heaps to floating, drifting, mass-shaded clumps',
    steps: [
      { date: '2026-11-03 11:33', rev: '6e287db', title: 'puffy heaps', img: TL('01-6e287db-live-3D-asset-viewer-for-batch-1-lush-p--planet-closeup.png'),
        changed: 'Puffy cloud heaps that break the silhouette.', why: 'Planetarium\'s puffy cream clouds spilling past the planet\'s edge.' },
      { date: '2026-11-03 12:28', rev: 'fb7fefa', title: 'small flat clumps', img: TL('02-fb7fefa-batch-1-revision-SDF-astronaut-flatter--planet-closeup.png'),
        changed: 'Many small flattened clumps that hug the planet and still break the silhouette.', why: 'Revision 1: closer to Planetarium, with more, smaller, slightly flattened clumps.' },
      { date: '2026-11-03 12:39', rev: 'f4ceea0', title: 'noise-driven masses', img: TL('03-f4ceea0-batch-1-revision-2-noise-driven-clouds--planet-closeup.png'),
        changed: 'FBM fields place a few large merged masses, long east–west streaks and sparse strays, with clear sky between.', why: 'Revision 2: clustered with varied sizes, not an even scatter.' },
      { date: '2026-11-03 12:47', rev: '28627ee', title: 'lumpy mini-clumps', img: TL('05-28627ee-build-lone-cloud-puffs-as-lumpy-mini-clu--planet-closeup.png'),
        changed: 'Edge and stray puffs get two or three satellite puffs.', why: 'So no single sphere reads as a round white ball on the disc.' },
      { date: '2026-11-03 14:53', rev: '276b628', title: 'solid puffs (a bug fix)', img: TL('14-276b628-solid-cloud-puffs-right-handed-instance--planet-closeup.png'),
        changed: 'Puff instances get right-handed frames, and the shading becomes monotonic.', why: 'A left-handed basis culled every puff\'s outer shell, so clouds drew as hollow rings.' },
      { date: '2026-11-03 18:46', rev: 'bffb095', title: 'quantile cover', img: TL('15-bffb095-quantile-cloud-cover-27-per-biome-f--planet-closeup.png'),
        changed: 'Cover becomes the share of the visible disc under weather, about 27% on every biome, and lava gets ash plumes off its fissures.', why: 'Cover now holds across seeds and loop phases (the lush hero had been at 47%).' },
      { date: '2026-11-03 19:36', rev: '9797b2f', title: 'floating, drifting, mass-shaded', img: TL('16-9797b2f-floating-drifting-mass-shaded-cloud-cl--planet-closeup.png'),
        changed: 'Puff bases float at r ≈ 1.05 and drift 1.5× faster than the ground (24 s loop at 2:3). Each mass shades as one dome and casts a shadow one band darker.',
        why: 'The human (2026-11-03): float slightly above the surface, drift faster, and blend into soft continuous clumps.' },
      { date: '2026-11-03 23:46', rev: '19fc75f', title: 'shadows only from the lit side', final: true, live: solo(LUSH),
        changed: 'Clouds facing away from the light no longer cast shadows.', why: 'Mirror-image "phantom" shadows were spinning the wrong way on the lit side (31–73% of shadow pixels).' },
    ],
  },
  {
    id: 'rings', title: 'Rings', note: 'from scattered pixels to chunky debris in planet colours; the meaning is open',
    steps: [
      { date: '2026-11-03 11:33', rev: '6e287db', title: 'scattered pixels', img: TL('01-6e287db-live-3D-asset-viewer-for-batch-1-lush-p--planet-closeup.png'),
        changed: 'A ring of scattered single pixels.', why: 'Planetarium\'s scattered-pixel rings.' },
      { date: '2026-11-03 12:28', rev: 'fb7fefa', title: 'one thin band', img: TL('02-fb7fefa-batch-1-revision-SDF-astronaut-flatter--planet-closeup.png'),
        changed: 'A single thin 1 px band.', why: 'Revision 1: a thin band, its dots always 1 internal pixel.' },
      { date: '2026-11-03 14:22', rev: 'b67f935', title: 'chunky debris', img: TL('11-b67f935-research-x2-shared-planet-palette-Plane--planet-closeup.png'),
        changed: 'Debris clusters, at least 70% of them 2×2 or plus-shaped clumps.', why: 'The Planetarium measurements: chunky ring debris drawn in the planet\'s own colours.' },
      { date: '2026-11-03 14:28', rev: '351c05a', title: 'planet-family colours only', img: TL('12-351c05a-final-BLK-36-crew--v2-world-rev-5-mix--planet-closeup.png'),
        changed: 'The ring is recoloured from v2 planet colours: ocean navy and blues, with cloud cream for most debris.',
        why: 'No natural ring process makes magenta, and a magenta ring near-complements the land green, so it looks pasted on.' },
      { date: '2026-11-04 14:04', rev: '0b37d59', title: 'width and distance',
        live: { ...solo({ ...LUSH, moons: false }), options: { label: 'ring', list: [
          { id: 'thin', label: 'thin', item: {} },
          { id: 'wide', label: 'wide belt', item: { ring: 'wide', ringWidth: 0.72, ringInner: 1.54 } },
          { id: 'thread', label: 'thread', item: { ringWidth: 0.04, ringInner: 1.25 } },
          { id: 'far', label: 'far belt', item: { ringWidth: 0.72, ringInner: 2.6 } }] } },
        changed: 'Per-planet ring width (0.03 thread to 1.0 belt) and distance (1.2 to 2.8 radii). A Cassini-style gap opens past 0.3, and particle density stays constant.',
        why: 'A data channel reserved for codebase metrics. The wide ring had meant a shared library, and later unmerged branches (#18).' },
      { date: '2026-11-09 20:37', rev: '83dfc76', title: 'meaning open', final: true, tag: 'meaning open', live: solo({ ...LUSH, moons: false }),
        changed: 'Rings stay a modifier in the asset library, out of the product view.',
        why: 'Stale work is debris (R13), so rings no longer mean unmerged branches. They need a new meaning first.' },
    ],
  },
  {
    // stale work (R13), drawn live: the debris lab's directions are registered with the viewer's debris (debris-spec.js)
    id: 'debris', title: 'Debris', note: 'stale work near the planet it touches: five directions, then grey and red satellites, then the outlined A3',
    steps: [
      { date: '2026-11-10 12:20', rev: 'ce3e46f', title: 'five directions, A–E', exploration: true,
        live: { ...debrisView('A'), options: { label: 'direction', list: ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, label: `${id} · ${DEBRIS_NAMES[id]}`, item: { debris: debrisOf(id) } })) } },
        changed: 'One debris factory, five parameter sets: A derelicts (a silhouette per class on crooked tumbling orbits), B junkyard (two heaps beside the disc), C scrap blocks, D tagged canisters on polar orbits, E a comet-like wake.',
        why: 'The human (2026-11-09): debris owns all stale work, so rings no longer mean unmerged branches. It must never read as a ring, a moon, an artefact, a drone or a health band. The human picked A.' },
      { date: '2026-11-10 15:31', rev: '50195cc', title: 'A2: grey and red satellites', exploration: true, live: debrisView('A2'),
        changed: 'A\'s orbits with grey metal, red paint and real satellite parts: a dish satellite, a snapped boom, a spent stage, a solar array.',
        why: 'The human: "make them grey and red, to really be noticeable and look more like satellite pieces."' },
      { date: '2026-11-10 19:12', rev: '5d53455', title: 'A3, a planet modifier', final: true, live: debrisView('A3'),
        changed: 'Neutral grey metal, a 1 px red outline and two blinking red nav lights per piece (69dcefe); age by paint: intact, weathered, broken. Ported into the viewer as a modifier any planet can carry.',
        why: 'The human: "more grey and less blue … leave the red as an outline effect … flashing lights on the debris that are red." Two approved exceptions: grey outside BLK 36, and the outline.' },
    ],
  },
  {
    id: 'palettes', title: 'Palettes', note: 'Planetarium pastels, v2, 25 published palettes, BLK 36, research ×2, then BLK 36 crew + v2 world',
    steps: [
      { date: '2026-11-03 11:33', rev: '6e287db', title: 'v1: Planetarium pastels', live: { ...showcase('depth'), palette: { set: VENDORED.v1.set } },
        changed: 'Pastel ramps on plum-grey space (#2b2535), with depth darkening toward a cool space tone. Old colours on today\'s shapes; the suit is f4ceea0\'s cool white.',
        why: 'The first Q&A: keep Planetarium\'s palette and add depth, which Planetarium lacks.' },
      { date: '2026-11-03 12:39', rev: 'f4ceea0', title: 'v2: vibrant', live: { ...showcase('depth'), palette: { set: VENDORED.v2.set } },
        changed: 'More saturation and contrast on near-black blue-plum space, with retuned depth tints, a violet-pink-yellow ring and a purple cloud mid-shadow.',
        why: 'Revision 2: more vibrant overall, and space much darker.' },
      { date: '2026-11-03 13:01', rev: '102578e', title: '25 published palettes',
        live: { ...showcase('depth'), palette: { base: 'lospec:resurrect-64' }, options: { label: 'palette', list: LOSPEC_ORDER.map((slug, i) => ({ id: slug, label: `${i + 1} · ${slug}`, palette: { base: `lospec:${slug}` } })) } },
        changed: 'Each of 25 Lospec palettes mapped onto every role using only its own colours, with depth steps snapped to its darks.',
        why: 'Revision 3: v2 lost cohesion and was too Earth-like, so choose from published pixel-art palettes.' },
      { date: '2026-11-03 13:49', rev: 'ea84759', title: 'BLK 36 crew and space, Earth planets', live: { ...showcase('depth'), palette: { base: 'lospec:blk-36', world: true } },
        changed: 'The crew, space, stars and depth use BLK 36 exactly; the planets use v2\'s Earth-like ramps (today\'s versions here).',
        why: 'Revision 4: the human picked BLK 36, tile 19 of the contact sheet.' },
      { date: '2026-11-03 13:57', rev: '63f3913', title: 'banded BLK 36 space', live: { ...showcase('depth'), palette: { base: 'lospec:blk-36', world: true, set: { spaceBands: BANDS_63F } } },
        changed: 'Space becomes three hard screen bands of BLK 36: #000000, #12173d, #29174c.',
        why: 'Revision 5: near-black with a subtle vertical gradient in 3–4 hard bands.' },
      { date: '2026-11-03 14:22', rev: 'b67f935', title: 'research ×2', live: { ...showcase('depth'), palette: { base: 'lospec:blk-36', set: { ...VENDORED.researchX2.set, space: BANDS_B67[0], spaceBands: BANDS_B67 } } },
        changed: 'One shared 13-colour set for every planet, ring and cloud: measured true colour with OKLCH chroma ×2, on navy-to-violet banded space.',
        why: 'Revision 6, after the Planetarium measurements. Rejected next: coherent, but too muted.' },
      { date: '2026-11-03 14:28', rev: '351c05a', title: 'BLK 36 crew, v2 world', final: true, live: showcase('depth'),
        changed: 'The crew stays BLK 36 exactly; space, stars, depth and the planets revert to v2, the ring uses planet-family colours only, and the purple cloud shadow becomes cream.',
        why: 'Revision 7 (the human): BLK 36 for the crew, v2 for everything else.' },
    ],
  },
  {
    id: 'depth', title: 'Depth', note: 'from per-object steps to the per-pixel smooth fade',
    steps: [
      { date: '2026-11-03 11:33', rev: '6e287db', title: 'batch 1: three object steps', img: TL('01-6e287db-live-3D-asset-viewer-for-batch-1-lush-p--depth-scene.png'),
        changed: 'Each object darkens by distance in three steps snapped to palette colours.', why: 'Planetarium has no depth cue; the human asked for "darker" with distance.' },
      { date: '2026-11-03 12:28', rev: 'fb7fefa', title: 'object mode, four levels', live: { ...showcase('depth'), render: { depthMode: 'object' } },
        changed: 'A fourth, near-black silhouette level. Each whole object picks one level from its distance (thresholds 12, 26, 44).',
        why: 'Revision 1: four steps per object, the furthest near-black silhouettes. Still a viewer option.' },
      { date: '2026-11-04 00:01', rev: '2aa584a', title: 'colour budgets (reverted)', img: TL('18-2aa584a-depth-colour-budgets-fewer-colours-with--depth-scene.png'),
        changed: 'Fewer colours with distance: full ramps near, 3 tones mid, 2 far, 1 for silhouettes, with clouds, moons and artefacts dropped far away.',
        why: 'Tried to cut colour counts. The human reverted it the same day: it "clips the threshold too much".' },
      { date: '2026-11-04 00:52', rev: 'aa3992e', title: 'per-pixel, stepped', live: { ...showcase('depth'), render: { depthMode: 'pixel-stepped' } },
        changed: 'Each fragment picks its level from its own distance, so a planet that straddles a threshold splits at a crisp pixel edge.',
        why: 'The human (2026-11-04): levels per pixel, not per object.' },
      { date: '2026-11-04 09:37', rev: '36522b9', title: '6- and 8-band presets', exploration: true,
        live: { ...showcase('depth'), render: { depthMode: 'pixel-stepped', depthBands: '6-band' }, options: { label: 'bands', list: [
          { id: '6-band', label: '6-band', render: { depthBands: '6-band' } }, { id: '8-band', label: '8-band', render: { depthBands: '8-band' } }] } },
        changed: 'More, thinner bands on geometric thresholds from 6 to 44, through the same four strengths.', why: 'Smaller steps over the same near-to-far range, for an A/B.' },
      { date: '2026-11-04 10:00', rev: 'e40056d', title: 'pixel-smooth', final: true, live: showcase('depth'),
        changed: 'A continuous per-pixel blend toward the depth tint on log distance from 5 to 44.', why: 'The human picked it for its smoothness: the one deliberate gradient in the style.' },
    ],
  },
  {
    id: 'fx', title: 'ASCII FX', note: 'the code layer: lime and teal loops, then filters, then planet artefacts',
    steps: [
      { date: '2026-11-03 14:20', rev: 'fe5e848', title: 'round 1: lime and teal', img: '07-ascii-fx/round1-lime-teal/fx-sheet.png',
        changed: 'Seven 4 s loops (glyph fog, packets, planet artefacts, terminal, bands, transition and tags) in acid lime and in [OIII] teal.',
        why: 'Revision 5: cyberbrutalist flourishes in one acid "system" accent, lime by default with a teal variant.' },
      { date: '2026-11-03 14:44', rev: '29c64a1', title: 'round 2: filters', img: '07-ascii-fx/round2-filter/fx-sheet.png',
        changed: 'Glyphs and glitches take the colours of the scene they cover (lifted, darkened, inverted, posterised or slipped), with teal only as an event accent. Lime is dropped.',
        why: 'The human: teal over lime, and every effect tried as a filter, not a sticker.' },
      { date: '2026-11-03 19:06', rev: '34bf42b', title: 'planet artefacts adopted', live: { ...solo({ ...LUSH, artefacts: true, artAuto: false, artCount: 3 }), render: { t: 11.9 } },
        changed: 'Corrupted sectors inside the planet\'s own surface shader (bug glyphs in inverted lightness, moshed terrain, torn rows) that rotate with the planet. A fixed count here: 3.',
        why: 'The human favoured planet artefacts in the filter form.' },
      { date: '2026-11-04 10:00', rev: 'e40056d', title: 'sector count by size', final: true,
        live: { ...solo({ ...LUSH, artefacts: true }), render: { t: 11.9 }, options: { label: 'accent', list: [
          { id: 'filter', label: 'filter', item: {} }, { id: 'teal', label: 'filter + teal', item: { artTeal: true } }] } },
        changed: 'From 1 sector on the smallest planets to 5 on the biggest, with a teal sub-toggle.', why: 'The human\'s pick: auto by size is the default; the count is a manual override.' },
    ],
  },
  {
    id: 'drones', title: 'Drones', note: 'agent sessions: six directions, five head-is-body drones, then D-final (drone lab, feature/drone-lab)',
    steps: [
      { date: '2026-11-06 21:41', rev: '90d28e5', title: 'six directions, A–F',
        changed: 'One raymarched drone driven by parameters (head shape, screen, rotors or jets, antenna, arms, a five-slot palette), in six directions.',
        why: 'A first pass at the agent-session drone. Its renders were replaced by the next round, so none is archived.' },
      { date: '2026-11-06 23:04', rev: '22e24fd', title: 'five head-is-body drones', img: '10-drones/base-lineup.png',
        changed: 'Five variants to the human\'s brief: head-is-body, half an astronaut tall, a thruster pack sputtering chunky smoke, a dark screen with V2 eyes glowing teal, no arms.',
        why: 'The human\'s brief v2 replaced the first directions. This lineup is the lab\'s last render, so the shells are already gear grey.' },
      { date: '2026-11-06 23:10', rev: 'c8f66f5', title: 'gear-grey shell', img: '10-drones/base-with-crew.png',
        changed: 'The shell takes the crew\'s gear greys, and the whites move to the trim and smoke.', why: 'A shell lit in the suit\'s whites melted into the K astronauts at 180p.' },
      { date: '2026-11-06 23:29', rev: 'a79516d', title: 'the working face', img: '10-drones/working-face.png',
        changed: 'While working, the eyes blink shut and the screen types hashed 5×7 ASCII glyphs in the teal glow ramp, then scrambles back to the eyes.', why: 'A face for "busy" in the code layer\'s glyph vocabulary.' },
      { date: '2026-11-06 23:29', rev: 'a79516d', title: 'D-final', img: '10-drones/final-with-crew.png',
        changed: 'The base drone is D (the saucer scout) with the human\'s exact parameters; A–E stay as explorations.', why: 'The human picked D.' },
      { date: '2026-11-10 15:47', rev: '4b60da3', title: 'a drone per provider', final: true,
        live: { items: [{ kind: 'drone', provider: 'generic', yaw: -0.5 }], framing: 'drone',
          options: { label: 'provider', list: BRANDS.map((b) => ({ id: b.id, label: b.name, item: { provider: b.id } })) } },
        changed: 'D-final, adapted into a drone for each approved provider, plus generic (D-final itself) and the unknown agent (the generic drone, its own label). Each is a parameter set and a BLK 36 palette, with seeded details per session. Copilot and Claude Code keep D-final\'s shape and add goggles and legs, Codex\'s head is one smooth cloud, and Qodo wears sunglasses.',
        why: 'The human (2026-11-10): one drone per agent provider (a5ff3e9), then four changes the same afternoon. Every pair stays distinct at the crew close-up and system distance (A4).' },
    ],
  },
];

// Every archived render the view may ask for: the archive route's exact allowlist (routes.mjs).
export const IMAGES = new Set(FAMILIES.flatMap((f) => f.steps.map((s) => s.img).filter(Boolean)));
export const FAMILY_IDS = FAMILIES.map((f) => f.id);
export const family = (id) => FAMILIES.find((f) => f.id === id) ?? FAMILIES[0];

/** A step's badges: how it shows ('live', 'archived image' or 'no render'), then 'final', 'exploration' or its tag. */
export const badgesOf = (step) => [
  step.live ? 'live' : step.img ? 'archived image' : 'no render',
  ...(step.final ? ['final'] : []), ...(step.exploration ? ['exploration'] : []), ...(step.tag ? [step.tag] : []),
];

/**
 * What the stage shows for { family, step, option }: { step, live, items, framing, camera, render,
 * palette, img }. items are unnormalised state items; render is a partial render state; palette is
 * a history palette spec (undefined: the library base).
 */
export function view({ family: id, step: i, option = 0 }) {
  const step = family(id).steps[i] ?? family(id).steps.at(-1);
  if (!step.live) return { step, live: false, img: step.img ?? null };
  const { items, framing = null, camera = null, render = {}, palette, options } = step.live;
  const opt = options?.list[option] ?? options?.list[0];
  return {
    step, live: true, img: null, framing, camera,
    items: items.map((it, k) => (opt?.item && k === 0 ? { ...it, ...opt.item } : it)),
    render: { ...render, ...opt?.render },
    palette: opt?.palette ? { ...palette, ...opt.palette } : palette,
  };
}
