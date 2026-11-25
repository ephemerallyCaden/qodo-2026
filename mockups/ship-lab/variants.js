// The four directions for the human to pick from (#207 C2: "3-4 variants based on the description of
// a cartoonish rocket"). Each is a builder (ship-spec.js) plus a palette (palette.js); they differ in
// silhouette and in how the crew is seen aboard, not just in trim. In every one the repo owner rides
// as the captain (seat 0): the captain's cap (ship-spec.js CAP) plus a seat of their own (`captain`). Pure.
import { BUILDERS } from './ship-spec.js';
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
export const VARIANT_BY_ID = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));

/** The spec of direction id with a crew of n. */
export const specOf = (id, n) => BUILDERS[id](n);
