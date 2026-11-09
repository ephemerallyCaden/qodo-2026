// Planet colour data.
// - V2_PLANET_RAMPS: the active "final" preset (human's call after revision 5): the
//   v2 look (f4ceea0) for planets/clouds/caps/haze, naturalistic v2-spirit biome
//   ramps, and a re-coloured ring built only from v2 planet-family colours.
// - ACCENTS.reveal: the [OIII] teal reveal glow, garnish only.

export const ACCENTS = { reveal: ['#004538', '#007c66', '#00bc9c', '#00ffd5'] };

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
  // toxic (rust-ember, #19): the health band between lava and ash desert, hues between the lava
  // glow and the sand. Cooled slag seas (sludge) with ember veins (toxic's top step), rust ground
  // (toxic), oxidised orange crusts (fungus), dull rust smoke (spore, kept under chroma 0.08)
  sludge: ['#150e0e', '#22140f', '#341c12', '#4a2614', '#643218'],
  toxic: ['#3a1c12', '#642c16', '#8e421c', '#b85e26', '#e88a34'],
  fungus: ['#7a4a1e', '#a66a2a', '#cc8e3c', '#e8b45c'],
  spore: ['#2a2022', '#6a5048', '#8e705e', '#b49680'],
  moonBody: ['#a8602c', '#d8944a', '#f0c27a', '#f2d8b8'], // warm moons
  haze: { ocean: '#86ccff', ice: '#ffffff', toxic: '#e07a48' },
  halo: '#30285a',
};

// The active planet ramps (kept as the name other modules import).
export const PLANET_RAMPS = V2_PLANET_RAMPS;

