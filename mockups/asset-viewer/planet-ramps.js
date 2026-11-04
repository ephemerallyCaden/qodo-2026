// Planet colour data.
// - V2_PLANET_RAMPS: the active "final" preset (human's call after revision 5): the
//   v2 look (f4ceea0) for planets/clouds/caps/haze, naturalistic v2-spirit biome
//   ramps, and a re-coloured ring built only from v2 planet-family colours.
// - RESEARCH_RAMPS + PLANET_DEPTH: the revision 5 "research ×2" shared set, kept for
//   the "final-blk" preset.
//
// Revision 5 research set: ONE shared set that every
// planet, ring, cloud, haze, moon and planet depth step draws from. Biomes differ
// only by which subset they use. Built with the "research ×2" policy
// (docs/design/planet-colour-research.md): measured true-colour L and H from
// colour-research/05-verification.md, chroma × 2 in OKLCH, quantised to these steps.
// Highlights shift toward cream and every shadow ends in the same shared dark.
// Astronauts, space and stars are NOT here: they are BLK 36, exactly.
//
// | name     | hex     | OKLCH (L C H)      | measured source -> rule                                              |
// |----------|---------|--------------------|-----------------------------------------------------------------------|
// | crust    | #16120e | 0.18 0.010  67     | lava crust #141210 (01) ×2                                            |
// | shadow   | #29272d | 0.28 0.011 301     | Cassini Division #29282b (05) ×2: shared terminator dark              |
// | mauve    | #5a4e5e | 0.44 0.030 318     | Saturn A ring L (#56524d, 05), hue to the plum bg: bg+1 glue          |
// | ocean    | #163b68 | 0.35 0.089 255     | Earth ocean #2b3c52 (05) ×2                                           |
// | oceanLit | #32618e | 0.48 0.089 249     | ocean ×2, lit step: L +0.13, hue 6° toward cream                      |
// | land     | #4a5530 | 0.43 0.058 122     | scout olive #4a5530 (01); measured #484d4a is mixed-pixel (05 limits) |
// | landLit  | #787b53 | 0.57 0.058 112     | land lit step: L +0.14, hue 10° toward cream                          |
// | sand     | #a3692e | 0.57 0.105  63     | Sahara #8f7258 (05) ×2                                                |
// | rust     | #ac5021 | 0.54 0.135  44     | Mars dark terrain #90624e (05) ×2                                     |
// | taupe    | #927a5b | 0.59 0.053  73     | Saturn B ring #887c6d (05) ×2: ring/moon glue                         |
// | ice      | #c8fefe | 0.96 0.054 197     | Uranus #def8f8 (05) ×2: ice / cool white                              |
// | peach    | #ebceb7 | 0.87 0.045  62     | cloud shadow: warm peach ~1 step below cream (06 Animation)           |
// | cream    | #f7eed9 | 0.95 0.030  90     | thick cloud L #d4d9d8 (05) +0.07, hue to cream 90° (rule 2)           |
export const PLANET_SET = {
  crust: '#16120e', shadow: '#29272d', mauve: '#5a4e5e', ocean: '#163b68', oceanLit: '#32618e', land: '#4a5530',
  landLit: '#787b53', sand: '#a3692e', rust: '#ac5021', taupe: '#927a5b', ice: '#c8fefe', peach: '#ebceb7', cream: '#f7eed9',
};

// Accents, exempt from the shared set and kept small: blackbody lava glow
// (1000 K, 1400 K, 2000 K) and the [OIII] teal reveal glow.
export const ACCENTS = { glow: ['#ff3300', '#ff6600', '#ff8d0b'], reveal: ['#004538', '#007c66', '#00bc9c', '#00ffd5'] };

const S = PLANET_SET;
const r = (...names) => names.map((n) => S[n]);

// Role ramps (dark -> light). Surface ramps are 5 long; index 0 is always the
// shared shadow (or crust) so the terminator only ever uses shared darks.
export const RESEARCH_RAMPS = {
  // lush
  ocean: r('shadow', 'ocean', 'ocean', 'oceanLit', 'oceanLit'),
  land: r('shadow', 'land', 'land', 'landLit', 'landLit'),
  cap: r('shadow', 'mauve', 'ice', 'ice', 'ice'),
  cloud: r('peach', 'peach', 'cream', 'cream'), // two tones only: cream + warm peach
  // ocean world
  water: r('shadow', 'ocean', 'ocean', 'oceanLit', 'oceanLit'),
  // ice (Europa-style rust lineae for crevasses)
  ice: r('shadow', 'mauve', 'ice', 'ice', 'ice'), // stays cool white
  crevasse: r('shadow', 'rust', 'rust', 'rust', 'rust'),
  // desert
  sand: r('shadow', 'rust', 'sand', 'sand', 'peach'),
  rock: r('crust', 'shadow', 'rust', 'taupe', 'taupe'),
  // lava: truly near-black crust, mauve/taupe smoke
  crust: r('crust', 'crust', 'crust', 'shadow', 'shadow'),
  ash: r('shadow', 'mauve', 'mauve', 'taupe'),
  glow: ACCENTS.glow,
  // gas giant (extra): cream zones, rust/sand belts
  gasA: r('shadow', 'taupe', 'peach', 'cream', 'cream'),
  gasB: r('shadow', 'rust', 'sand', 'sand', 'peach'),
  // barren moon (extra): warm regolith grey
  moon: r('shadow', 'mauve', 'taupe', 'taupe', 'peach'),
  // toxic (extra): ochre sludge seas, olive growth, mauve fungus, sand spores
  sludge: r('shadow', 'rust', 'rust', 'sand', 'sand'),
  toxic: r('shadow', 'land', 'landLit', 'landLit', 'landLit'),
  fungus: r('shadow', 'mauve', 'mauve', 'mauve', 'mauve'),
  spore: r('sand', 'sand', 'peach', 'peach'),
  // rings: mauve-grey > the planet's own colour > taupe specks; index 0 = in the planet's shadow
  ring: {
    lush: r('shadow', 'mauve', 'oceanLit', 'taupe'),
    ocean: r('shadow', 'mauve', 'oceanLit', 'taupe'),
    ice: r('shadow', 'mauve', 'ice', 'taupe'),
    desert: r('shadow', 'mauve', 'sand', 'taupe'),
    lava: r('shadow', 'mauve', 'rust', 'taupe'),
    gas: r('shadow', 'mauve', 'peach', 'taupe'),
    moon: r('shadow', 'mauve', 'taupe', 'taupe'),
    toxic: r('shadow', 'mauve', 'sand', 'taupe'),
  },
  // small orbiting moons: 3-tone warm spheres (4 light bands)
  moonBody: r('sand', 'sand', 'peach', 'cream'),
  // lit-limb atmosphere haze and the optional dark halo (bg+1)
  haze: { ocean: S.ice, ice: S.ice, toxic: S.landLit },
  halo: S.mauve,
};

// Planet depth: distant planets step down through the shared set toward its
// shared dark (not onto BLK 36's plum/lavender). Snap pools are shared colours only.
const darkest = r('crust', 'shadow', 'mauve');
export const PLANET_DEPTH = {
  depth: [[S.shadow, 0], [S.shadow, 0.38], [S.shadow, 0.66], [S.crust, 0.82]],
  snap: [null, Object.values(S), r('crust', 'shadow', 'mauve', 'ocean', 'land', 'taupe', 'rust'), darkest],
};

// ---------------------------------------------------------------- v2 (active)
// v2 lush/cloud/cap ramps from f4ceea0 plus naturalistic biome ramps in the same
// spirit (ea84759). Ring: no pink, violet or yellow; it uses v2 planet-family colours
// only: ocean darkest #141d5c (in planet shadow), cloud cream #f2d8b8 (most debris),
// ocean step #4ea3f7, pale ocean #94dcff.
export const V2_PLANET_RAMPS = {
  ocean: ['#141d5c', '#1d3fa6', '#2b6ee0', '#4ea3f7', '#94dcff'],
  land: ['#123d33', '#1d7350', '#38a85a', '#7cd65a', '#d0f56c'],
  cap: ['#3f4590', '#98a3e8', '#dfe5ff', '#ffffff'],
  cloud: ['#30285a', '#f2d8b8', '#f2d8b8', '#fffaf0'], // v2 tones; the purple mid-shadow is swapped for v2's warm cream
  ring: ['#141d5c', '#f2d8b8', '#4ea3f7', '#94dcff'],
  water: ['#0f1a4e', '#18378f', '#2560c8', '#3f92ec', '#86ccff'],
  ice: ['#5a78ac', '#93b6dc', '#c6e0f4', '#e6f4ff', '#ffffff'],
  crevasse: ['#16234e', '#24407e', '#3a64b0', '#6a96d6'],
  sand: ['#6a3a1e', '#a8602c', '#d8944a', '#f0c27a', '#fff0b8'],
  rock: ['#2e1c14', '#4e3020', '#7a4c30', '#a4744c'],
  crust: ['#0b0a10', '#0b0a10', '#17151d', '#262129', '#382c30'], // truly near-black; cool blue-grey shadows, a touch warm in full light
  glow: ['#c9361a', '#ff761a', '#ffc93c'], // cooler rim, orange body, yellow only on the hottest cores
  ash: ['#1a1719', '#332e30', '#565052', '#827b7c'],
  gasA: ['#5a2e1c', '#9c5a30', '#d89a5a', '#f2cc94', '#fff0d0'],
  gasB: ['#481a18', '#883422', '#c25e38', '#e69068', '#ffc6a0'],
  moon: ['#26262c', '#4a4a54', '#76767f', '#a4a4ac', '#d2d2d6'],
  // toxic: ochre sludge seas + acid-lime growth + purple fungus, so it can't be read as lush
  sludge: ['#2e1c14', '#6a3a1e', '#a8602c', '#d8944a', '#f0c27a'],
  toxic: ['#1c3810', '#386814', '#68a41c', '#a6d63a', '#e0ff7a'],
  fungus: ['#381444', '#682a76', '#9848a6', '#c678d2'],
  spore: ['#688828', '#a6c648', '#d2ea78', '#f2ffbe'],
  moonBody: ['#a8602c', '#d8944a', '#f0c27a', '#f2d8b8'], // warm moons
  haze: { ocean: '#86ccff', ice: '#ffffff', toxic: '#c8f06a' },
  halo: '#30285a',
};

// The active planet ramps (kept as the name other modules import).
export const PLANET_RAMPS = V2_PLANET_RAMPS;

