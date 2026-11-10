// The five debris directions (A-E). Each is only a parameter set over the one factory: a kit
// (what a piece is), an arrangement (where pieces sit and how they move) and a cap (how many are
// drawn before the rest is counted). A vs B vs E change only the arrangement; A vs C vs D only
// the kit, so any mix ("C's blocks in E's wake") is one edit here.
import { demoItems } from './layout.js';

export const VARIANTS = [
  {
    id: 'A', name: 'derelicts', kit: 'hardware', arrangement: 'orbits', cap: 12,
    blurb: 'Dead spacecraft, one silhouette per class, each on its own crooked orbit (a third retrograde), tumbling.',
  },
  {
    id: 'A2', name: 'satellites', kit: 'satellite', arrangement: 'orbits', cap: 12, hull: 'gear-light',
    blurb: "The human's pick, refined: A's orbits with grey metal, red paint and real satellite parts (a dish satellite, a snapped boom, a spent stage, a solar array).",
  },
  {
    id: 'A3', name: 'outlined satellites', kit: 'outlined', arrangement: 'orbits', cap: 12, hull: 'grey',
    blurb: "The human's second refinement: A2's satellite parts in neutral grey, red only as a 1 px outline and blinking nav lights.",
  },
  {
    id: 'B', name: 'junkyard', kit: 'hardware', arrangement: 'heaps', cap: 20,
    blurb: "A's hardware parked in two churning heaps on the planet's leading and trailing sides, so the disc stays clear.",
  },
  {
    id: 'C', name: 'scrap blocks', kit: 'blocks', arrangement: 'orbits', cap: 12,
    blurb: 'Chunky cube scrap: the block count is the diff size, the block pattern is the class, and broken means the blocks come loose.',
  },
  {
    id: 'D', name: 'tagged canisters', kit: 'canister', arrangement: 'polar', cap: 12,
    blurb: 'One canister shape for everything; the class is the colour of its painted band. Near-polar orbits, all one way.',
  },
  {
    id: 'E', name: 'wake', kit: 'hardware', arrangement: 'wake', cap: 10,
    blurb: "A's hardware trailing off one side like a comet's tail, youngest nearest the planet and the oldest at the end.",
  },
];
export const variant = (id) => VARIANTS.find((v) => v.id === id);
// The human's pick (A, refined as A2, then A3), which gets the sweep GIF.
export const PICK = 'A3';

// Sample stale items: the viewer's demo items (every class and age step represented as soon as n
// allows; 12 items cover all 12 class x age pairs), so the lab and the viewer's controls agree.
export { AGES } from './layout.js';
export const sampleItems = (n, { prefix = 'item' } = {}) => demoItems(n, { prefix });

// The planets each direction is shown on (lineups): every product band (art direction §6), worst
// to best, then the three healthy looks. Seeds are the viewer's showcase seeds.
export const BANDS = [
  { biome: 'lava', label: 'lava', seed: 11 },
  { biome: 'toxic', label: 'toxic', seed: 13 },
  { biome: 'desert', label: 'ash (desert)', seed: 3 },
  { biome: 'lush', label: 'lush', seed: 7 },
  { biome: 'ocean', label: 'ocean', seed: 42 },
  { biome: 'ice', label: 'ice', seed: 21 },
];
export const SIZES = [1, 0.55]; // planet size (LOC): the hero and a small planet
export const CLUTTER = [0, 1, 3, 8, 24]; // D5
