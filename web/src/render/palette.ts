// Hero planet colours: space and star tones plus the v2 world ramps, each running
// dark -> light. Every colour the renderer draws is read from here.
export const PALETTE = {
  space: '#0d0b16',
  stars: ['#3b3866', '#9a90e0', '#fff8ff'],
  ocean: ['#141d5c', '#1d3fa6', '#2b6ee0', '#4ea3f7', '#94dcff'],
  land: ['#123d33', '#1d7350', '#38a85a', '#7cd65a', '#d0f56c'],
  cap: ['#3f4590', '#98a3e8', '#dfe5ff', '#ffffff'],
  cloud: ['#30285a', '#f2d8b8', '#f2d8b8', '#fffaf0'],
  ring: ['#141d5c', '#f2d8b8', '#4ea3f7', '#94dcff'],
  moon: ['#26262c', '#4a4a54', '#76767f', '#a4a4ac', '#d2d2d6'],
  haze: { ocean: '#86ccff' },
} as const;
