// Planet colours for the "final" preset (revision 5): ONE shared set that every
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
export const PLANET_RAMPS = {
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
