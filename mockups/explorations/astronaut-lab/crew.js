// BLK 36 crew roles, exactly as the asset viewer resolves them (mapPalette('blk-36')); lab.mjs
// re-derives them from mockups/asset-viewer/palette-map.js and fails if these ever drift.
export const CREW = {
  suit: ['#4185d8', '#5ab9e5', '#c1d9f2', '#ffffff'],
  gear: ['#293268', '#464b8c', '#6b74b2', '#909edd'],
  visor: ['#12173d', '#29174c'],
  glint: '#ffffff',
  contributors: {
    coral: ['#3f233c', '#872a38', '#cc5250', '#ff6866'],
    mint: ['#14665b', '#22896e', '#42bc7f', '#8cff9b'],
    lilac: ['#643499', '#8c51cc', '#b991f2', '#a5e6ff'],
  },
};
export const SPACE = '#0d0b16'; // v2 space, the world behind the crew
