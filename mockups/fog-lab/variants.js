// The lab's directions and fixed inputs. Pure: no DOM, no three.js.
// A direction is one rest look (fog.js: fogA..fogE; A2 is A refined with D's outlines) plus its thin
// look, which the event fronts use. The fronts themselves (clear, refog, the planet-clear pulse) are
// shared, so the directions differ only in what fog looks like, never in how it moves.

export const DIRECTIONS = [
  { id: 'A', name: 'glyph field', idea: 'the code layer: a fogged file shows its glyph source', rest: 'one hand-drawn 5x5 glyph per fogged grid cell, two steps lighter than the terrain on a ground a step darker; the glyph follows the terrain\'s luminance; a few swap on slow ticks', thin: 'dots' },
  { id: 'B', name: 'unlit', idea: 'unsurveyed land is out of the light', rest: 'the terrain two steps darker on its own ramps (lava glow one step); no ambient motion', thin: 'one step darker' },
  { id: 'C', name: 'unrendered', idea: 'the planet hasn\'t been resolved there yet', rest: 'the terrain resampled on a coarse lattice (tiles about 10 px across at any distance), each tile flat and lit by its centre', thin: 'tiles half the size' },
  { id: 'D', name: 'survey parcels', idea: 'a surveyor\'s map: you know the parcels, not their contents', rest: 'each grid cell flat in the terrain colour at its centre, a step darker, and each fogged file\'s footprint outlined by a 2 px line a step lighter', thin: 'the lines alone' },
  { id: 'E', name: 'mist', idea: 'literal fog: low mist hugging unsurveyed ground', rest: 'streaks of the terrain\'s lighter steps drifting west, one turn per loop against the surface', thin: 'sparse streaks one step lighter' },
  { id: 'A2', name: 'glyph parcels', idea: 'A refined with D\'s outlines: the code layer, with each file\'s footprint drawn', rest: 'A\'s glyph field, each fogged file\'s footprint outlined by a 2 px line in A\'s ink', thin: 'dots' },
  { id: 'D2a', name: 'blank map', idea: 'D refined toward "unseen": an unsurveyed region on an old map', rest: 'each fogged file\'s parcel one flat tone, the ramp of the ground under the file\'s own cell, shaded only by the light band (molten ground smoulders in the glow\'s darkest step); no continents, cracks, craters, dunes or artefacts; D\'s outlines', thin: 'D\'s lines alone' },
  { id: 'D2b', name: 'terra incognita', idea: 'D2a, plus the map\'s "uncharted" hatching', rest: 'D2a plus sparse diagonal hatching (\\ or / per parcel) 6 px apart, a step darker on the same ramp, drifting two periods per loop', thin: 'D\'s lines alone' },
  { id: 'D2c', name: 'veiled', idea: 'D2b, and the parcels don\'t get full sunlight', rest: 'D2b with the light softened to two steps, sparser dashed hatching (9 px apart), softer outlines and one "?" on half the big parcels', thin: 'D\'s lines alone' },
  { id: 'D2d', name: 'dark veil', idea: 'D2c pushed close to space: unmistakably hidden (the final fog, in the asset viewer)', rest: 'each parcel a cool blue-plum veil, whatever the band (lit #190e3d, night #110432: as dark as the band darks mixed toward space, but never lava crust\'s warm darks), faint hatching, a dim outline, a visible "?" and a halo-coloured limb', thin: 'D\'s lines alone' },
  { id: 'D2e', name: 'dark veil + band edges', idea: 'D2d, with the band readable from the parcel edges', rest: 'D2d with each parcel\'s 2 px outline in the middle step of the band\'s own ramp (lava: the glow body; toxic: its dull rust ground)', thin: 'D\'s lines alone' },
];
export const direction = (id) => DIRECTIONS.find((d) => d.id === id);

/** The looks of the four bands, worst to best (health-looks' LOOKS order), and the lineup seed of each. */
export const LOOKS = [
  { look: 'lava', band: 'lava', biome: 'lava', seed: 11 },
  { look: 'toxic', band: 'toxic', biome: 'toxic', seed: 7 },
  { look: 'desert', band: 'ash', biome: 'desert', seed: 7 },
  { look: 'lush', band: 'healthy', biome: 'lush', seed: 7 },
  { look: 'ocean', band: 'healthy', biome: 'ocean', seed: 7 },
  { look: 'ice', band: 'healthy', biome: 'ice', seed: 7 },
];

/** The two test-file moons: each is charted from this coverage on (both fogged at 0%, both clear at 100%). */
export { MOON_CHARTED_FROM } from '../asset-viewer/fog-layout.js';
