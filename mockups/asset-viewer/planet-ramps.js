// Planet, ring and galactic-accent colours for the "final" palette preset, kept as
// plain data so they can be swapped wholesale once the colour research lands.
// Ramps run dark -> light. Lush, cloud, cap and ring are the v2 ramps (f4ceea0);
// the other biomes are naturalistic ramps in the same spirit.
// The crew, space, stars and depth tints are NOT here: they come from BLK 36 exactly.
export const PLANET_RAMPS = {
  // lush (v2)
  ocean: ['#141d5c', '#1d3fa6', '#2b6ee0', '#4ea3f7', '#94dcff'],
  land: ['#123d33', '#1d7350', '#38a85a', '#7cd65a', '#d0f56c'],
  cap: ['#3f4590', '#98a3e8', '#dfe5ff', '#ffffff'],
  cloud: ['#30285a', '#8f74b0', '#f2d8b8', '#fffaf0'],
  ring: ['#3a2a78', '#8463e6', '#ff86bf', '#ffd38a'], // pending colour research
  // ocean world
  water: ['#0f1a4e', '#18378f', '#2560c8', '#3f92ec', '#86ccff'],
  // ice
  ice: ['#5a78ac', '#93b6dc', '#c6e0f4', '#e6f4ff', '#ffffff'],
  crevasse: ['#16234e', '#24407e', '#3a64b0', '#6a96d6'],
  // desert
  sand: ['#6a3a1e', '#a8602c', '#d8944a', '#f0c27a', '#fff0b8'],
  rock: ['#2e1c14', '#4e3020', '#7a4c30', '#a4744c'],
  // lava
  crust: ['#0e0809', '#1c0f0d', '#2e1712', '#432118', '#5a2c1e'],
  glow: ['#d63c1a', '#ff8a1e', '#ffe066'],
  ash: ['#1a1719', '#332e30', '#565052', '#827b7c'],
  // gas giant (extra)
  gasA: ['#5a2e1c', '#9c5a30', '#d89a5a', '#f2cc94', '#fff0d0'],
  gasB: ['#481a18', '#883422', '#c25e38', '#e69068', '#ffc6a0'],
  // barren moon (extra)
  moon: ['#26262c', '#4a4a54', '#76767f', '#a4a4ac', '#d2d2d6'],
  // toxic (extra)
  sludge: ['#0a1c1a', '#103630', '#1a5444', '#2a7458', '#46946e'],
  toxic: ['#1c3810', '#386814', '#68a41c', '#a6d63a', '#e0ff7a'],
  fungus: ['#381444', '#682a76', '#9848a6', '#c678d2'],
  spore: ['#688828', '#a6c648', '#d2ea78', '#f2ffbe'],
  // lit-limb atmosphere haze
  haze: { ocean: '#86ccff', ice: '#ffffff', toxic: '#c8f06a' },
};
