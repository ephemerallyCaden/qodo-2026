// The four directions for the human to pick from (#207 C2: "3-4 variants based on the description of
// a cartoonish rocket"). Each is a builder (ship-spec.js) plus a palette (palette.js); they differ in
// silhouette and in how the crew is seen aboard, not just in trim. In every one the repo owner rides
// as the captain (seat 0): the captain's cap (ship-spec.js CAP) plus a seat of their own (`captain`). Pure.
import { BUILDERS } from './ship-spec.js';
import { R2_BUILDERS } from './ship-r2.js';
import { slotPalette } from './palette.js';

export const VARIANTS = [
  {
    id: 'A', name: 'Finned classic',
    pitch: 'The storybook rocket: a tall white bullet with a red nose and three swept fins; each teammate looks out of a porthole of their own.',
    crewSeen: 'helmets in portholes',
    captain: 'the big gold-framed porthole under the nose',
    palette: slotPalette('white', 'red'),
  },
  {
    id: 'B', name: 'Chubby capsule',
    pitch: 'A round orange gumdrop on stubby legs with a blinking antenna; the crew sits shoulder to shoulder behind one big bus-windscreen window.',
    crewSeen: 'upper bodies behind a wraparound window',
    captain: 'alone at the front of the window, the rows raised behind',
    palette: slotPalette('orange', 'white'),
  },
  {
    id: 'C', name: 'Bubble top',
    pitch: 'A short finned rocket carrying a glass fishbowl dome; the whole crew stands inside it in full view, like astronauts in a giant visor.',
    crewSeen: 'full figures inside a glass dome',
    captain: 'front and centre on a gold pedestal',
    palette: slotPalette('mauve', 'white'),
  },
  {
    id: 'D', name: 'Ringed retro',
    pitch: 'A 1950s atomic-age ship: a navy onion body with a needle nose, wearing a planet-like orange ring that the crew stands on, with chasing marquee lights.',
    crewSeen: 'full figures standing on an open ring deck',
    captain: 'at the front of the ring on a white podium',
    palette: slotPalette('navy', 'white', { ring: slotPalette('orange', 'orange').shell }),
  },
];
// Round 2 (human, 2026-11-25): A, but shorter, fatter and rounder, chunkier, with chunky window rims.
// All five keep A's colours (white body, red nose and fins), grey rims and the captain's gold.
const A_COLOURS = slotPalette('white', 'red', { interior: ['#36277f'] }); // windows open onto a lighter indigo, so the dark visors read
export const R2_VARIANTS = [
  {
    id: 'R2-1', name: 'A porthole each',
    pitch: 'A round, fat little rocket where every teammate peeks out of a porthole of their own, each with a thick grey rim.',
    crewSeen: 'helmets in their own round portholes', captain: 'the big gold-rimmed porthole at the top, under the nose', palette: A_COLOURS,
  },
  {
    id: 'R2-2', name: 'One big window',
    pitch: 'The same round rocket with one big round window in a thick rim, the whole crew packed in together behind it.',
    crewSeen: 'upper bodies together behind one big round window', captain: 'front and centre, low in the window, the rows raised behind', palette: A_COLOURS,
  },
  {
    id: 'R2-3', name: 'Glass nose',
    pitch: 'The nose is a clear dome on a chunky red collar, so the crew stands right at the top of the rocket in full view.',
    crewSeen: 'full figures inside a glass nose dome', captain: 'front and centre on a gold pedestal', palette: A_COLOURS,
  },
  {
    id: 'R2-4', name: 'Round lander',
    pitch: 'The fattest of the five: a wide round body on four splayed fins with ball feet, a blunt dome nose with a blinking antenna, and a red belly band of portholes.',
    crewSeen: 'helmets in round portholes round a red belly band', captain: 'the big gold-rimmed porthole above the band', palette: A_COLOURS,
  },
  {
    id: 'R2-5', name: 'Bridge window',
    pitch: 'A big gold-rimmed bridge window up front for the captain and two teammates, with the rest of the crew in small portholes beneath it.',
    crewSeen: 'the bridge crew in a big window, the rest in small portholes below', captain: 'front and centre in the big gold-rimmed bridge window', palette: A_COLOURS,
  },
];
// Round 2b (human, 2026-11-25), on the pick R2-4: every window the same colour, in one vertical line.
export const R2B_VARIANTS = [
  R2_VARIANTS.find((v) => v.id === 'R2-4'),
  {
    id: 'R2-4b', name: 'Round lander, one column',
    pitch: 'R2-4 tidied up as asked: every porthole alike in one grey-rimmed column down the front, the captain at the top; eight in a line stretch the lander into a tall capsule.',
    crewSeen: 'helmets in one column of identical round portholes', captain: 'the top porthole, in the gold cap', palette: A_COLOURS,
  },
  {
    id: 'R2-4c', name: 'Round lander, straight columns',
    pitch: 'An alternative reading: R2-4\'s round, fat shape kept, the portholes all alike in three straight vertical columns, the captain on top in the middle.',
    crewSeen: 'helmets in three straight columns of identical round portholes', captain: 'the top porthole in the middle, in the gold cap', palette: A_COLOURS,
  },
];
export const ALL_VARIANTS = [...VARIANTS, ...R2_VARIANTS, ...R2B_VARIANTS.slice(1)];
export const VARIANT_BY_ID = Object.fromEntries(ALL_VARIANTS.map((v) => [v.id, v]));
export const ALL_BUILDERS = { ...BUILDERS, ...R2_BUILDERS };

/** The spec of direction id with a crew of n. */
export const specOf = (id, n) => ALL_BUILDERS[id](n);
