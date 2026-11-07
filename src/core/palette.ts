// Commet's palette: every colour the renderer may draw, named by role (AGENTS.md Rule 5,
// art-direction §4 and §5). Code reads `palette.world.ocean[2]`, never a hex value; this is
// the only file in src/ (and web/) allowed to hold colour literals.
//
// Ported as data from what the asset viewer actually renders as PALETTES.final on
// feature/hype-gif (mockups/asset-viewer): v2 space, stars and depth (viewer.js),
// V2_PLANET_RAMPS (planet-ramps.js), the BLK 36 crew roles from mapPalette('blk-36')
// (palette-map.js) and the [OIII] teal accent (planet-ramps.js ACCENTS.reveal).
//
// Pinned by test/golden/palette.v1.json. Change it only on purpose: UPDATE_GOLDEN=1 npm test
// and a `Golden-Update: <reason>` line in the commit.

export type Hex = `#${string}`;
/** Colours ordered dark → light; the shader picks a band per pixel from lighting and terrain. */
export type Ramp = readonly Hex[];
/** One step of the depth fade: blend toward `tint` by `strength` (0..1). */
export interface DepthStep { readonly tint: Hex; readonly strength: number }

interface PaletteShape {
  readonly world: { readonly [role: string]: Hex | Ramp | readonly DepthStep[] | { readonly [biome: string]: Hex } };
  readonly crew: { readonly [role: string]: Hex | Ramp | { readonly [key: string]: Ramp } };
  readonly accent: { readonly teal: Ramp };
}

const PALETTE = {
  /** v2: planets, clouds, rings, space, stars and the depth tint. */
  world: {
    space: '#0d0b16', // flat near-black blue-plum; never pure black
    stars: ['#3b3866', '#9a90e0', '#fff8ff'], // 1 px, static, mostly the dim one
    // lush
    ocean: ['#141d5c', '#1d3fa6', '#2b6ee0', '#4ea3f7', '#94dcff'],
    land: ['#123d33', '#1d7350', '#38a85a', '#7cd65a', '#d0f56c'],
    cap: ['#3f4590', '#98a3e8', '#dfe5ff', '#ffffff'],
    cloud: ['#30285a', '#f2d8b8', '#f2d8b8', '#fffaf0'], // cream with a warm shadow
    // rings: ocean darkest (in the planet's shadow), cloud cream, ocean step, pale ocean
    ring: ['#141d5c', '#f2d8b8', '#4ea3f7', '#94dcff'],
    // ocean world
    water: ['#0f1a4e', '#18378f', '#2560c8', '#3f92ec', '#86ccff'],
    // ice
    ice: ['#5a78ac', '#93b6dc', '#c6e0f4', '#e6f4ff', '#ffffff'],
    crevasse: ['#16234e', '#24407e', '#3a64b0', '#6a96d6'],
    // desert
    sand: ['#6a3a1e', '#a8602c', '#d8944a', '#f0c27a', '#fff0b8'],
    rock: ['#2e1c14', '#4e3020', '#7a4c30', '#a4744c'],
    // lava: near-black crust; glow is emissive and unlit
    crust: ['#0b0a10', '#0b0a10', '#17151d', '#262129', '#382c30'],
    glow: ['#c9361a', '#ff761a', '#ffc93c'],
    ash: ['#1a1719', '#332e30', '#565052', '#827b7c'],
    // gas giant: cream zones (A) and salmon-brown belts (B)
    gasA: ['#5a2e1c', '#9c5a30', '#d89a5a', '#f2cc94', '#fff0d0'],
    gasB: ['#481a18', '#883422', '#c25e38', '#e69068', '#ffc6a0'],
    // barren moon: neutral regolith grey
    moon: ['#26262c', '#4a4a54', '#76767f', '#a4a4ac', '#d2d2d6'],
    // toxic (rust-ember, #19): the health band between lava and ash desert, hues between the lava
    // glow and the sand. Cooled slag seas (sludge) with ember veins (toxic's top step), rust ground
    // (toxic), oxidised orange crusts (fungus), dull rust smoke (spore, kept under chroma 0.08)
    sludge: ['#150e0e', '#22140f', '#341c12', '#4a2614', '#643218'],
    toxic: ['#3a1c12', '#642c16', '#8e421c', '#b85e26', '#e88a34'],
    fungus: ['#7a4a1e', '#a66a2a', '#cc8e3c', '#e8b45c'],
    spore: ['#2a2022', '#6a5048', '#8e705e', '#b49680'],
    moonBody: ['#a8602c', '#d8944a', '#f0c27a', '#f2d8b8'], // small orbiting moons: warm peach
    haze: { ocean: '#86ccff', ice: '#ffffff', toxic: '#e07a48' }, // thin lit-limb sliver per biome
    halo: '#30285a', // optional 1–2 px dark back-shell, off by default
    // Per-pixel depth fade toward the tint (§5): the one allowed off-palette output.
    depth: [
      { tint: '#1b1f4a', strength: 0 },
      { tint: '#1b1f4a', strength: 0.38 },
      { tint: '#1b1f4a', strength: 0.72 },
      { tint: '#17172f', strength: 0.88 },
    ],
  },
  /** BLK 36 (BurakoIRL, lospec.com/palette-list/blk-36), exactly as published: only the colours the crew uses. */
  crew: {
    suit: ['#4185d8', '#5ab9e5', '#c1d9f2', '#ffffff'],
    gear: ['#293268', '#464b8c', '#6b74b2', '#909edd'], // mitts, boots, backpack, visor rim
    visor: ['#12173d', '#29174c'],
    glint: '#ffffff',
    // shoulder bands, backpack stripe and eye glow, hashed per contributor
    contributors: {
      coral: ['#3f233c', '#872a38', '#cc5250', '#ff6866'],
      mint: ['#14665b', '#22896e', '#42bc7f', '#8cff9b'],
      lilac: ['#643499', '#8c51cc', '#b991f2', '#a5e6ff'],
    },
  },
  /** [OIII] teal: code-layer events only (reveals, HUD marks), under ~10% of the frame. */
  accent: {
    teal: ['#004538', '#007c66', '#00bc9c', '#00ffd5'],
  },
} as const satisfies PaletteShape;

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const v of Object.values(value)) deepFreeze(v);
  return Object.freeze(value);
}

/** Frozen at runtime too, so nothing can retune a colour behind the pinned test. */
export const palette = deepFreeze(PALETTE);
export type Palette = typeof palette;
