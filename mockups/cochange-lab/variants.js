// The three line styles (A-C), their colours, the missing-pair flag, the stub beacon and the GIF's
// timeline. A style is a parameter set read by lab.js and drawn by raster.js. Every colour is a
// palette colour (art direction §4): the lines use the v2 starfield's own three colours, so a
// constellation is drawn in starlight; the flag is [OIII] teal, the accent for code-layer events
// and HUD marks. Nothing here is new.

export const SPACE = '#0d0b16';
/** v2 stars, dim -> bright: the line colours by strength step (weak, mid, strong). */
export const STARS = ['#3b3866', '#9a90e0', '#fff8ff'];
/** [OIII] teal (ACCENTS.reveal). */
export const TEAL = ['#004538', '#007c66', '#00bc9c', '#00ffd5'];
/** The product's stub beacon (web/src/render/beacons.ts): BLK 36 suit, glint and gear. */
export const BEACON_COLOURS = { R: '#5ab9e5', C: '#ffffff', M: '#909edd' };
/** UI text (web/src/ui/colours.ts): ink is the cloud cream, dim the mid star, accent the teal. */
export const UI = { space: SPACE, ink: '#fffaf0', dim: STARS[1], accent: TEAL[3] };

/** The overlay's colour table: index -> hex (0 = nothing drawn). */
export const COLOURS = [null, STARS[0], STARS[1], STARS[2], TEAL[2], TEAL[3], BEACON_COLOURS.R, BEACON_COLOURS.C, BEACON_COLOURS.M];
export const C = { dim: 1, mid: 2, bright: 3, teal: 4, tealHi: 5, beaconRim: 6, beaconCore: 7, beaconMast: 8 };
/** The overlay indices that are constellation lines (the rest are markers). */
export const LINE_COLOURS = [C.dim, C.mid, C.bright];

/**
 * The options. Each says, per strength step (weak, mid, strong), how its line is drawn:
 * w (brush px), colour (C index), period (dots: one every `period` px) and, for signals, beads.
 * path: 'straight' or 'arc' (bowed outward, away from the star, by `bow` x the chord).
 */
export const OPTIONS = [
  {
    id: 'A', name: 'star chart', path: 'straight',
    idea: 'dotted lines like a star atlas: 2 px dots in the starfield\'s own colours; stronger is brighter and denser',
    steps: [{ w: 2, colour: C.dim, period: 6 }, { w: 2, colour: C.mid, period: 5 }, { w: 2, colour: C.bright, period: 4 }],
  },
  {
    id: 'B', name: 'signal', path: 'straight',
    idea: 'a dim rail with beads of light running from the focused item to each partner; stronger sends more beads (1, 2, 3)',
    steps: [1, 2, 3].map((n) => ({ w: 2, colour: C.dim, beads: { n, len: 6, headLen: 2, head: C.bright, tail: C.mid } })),
    beadPeriod: 3, // s per trip: 8 trips per 24 s loop, so the beads are loop-locked
  },
  {
    id: 'C', name: 'arcs', path: 'arc', bow: 0.22,
    idea: 'faint solid arcs that bow outward, away from the star, like flight paths; stronger is thicker (2, 3, 4 px)',
    steps: [{ w: 2, colour: C.dim }, { w: 3, colour: C.dim }, { w: 4, colour: C.dim }],
  },
];
export const option = (id) => OPTIONS.find((o) => o.id === id);

/**
 * The missing-pair flag, "usually changes with X": a pair glyph whose far end is empty, a filled dot
 * linked to a hollow ring. It stands just right of the left-out file's planet, at mid height (the
 * beacon stands above the disc and the label sits below it). D = the dot and link, R = the ring.
 */
export const FLAG_SHAPE = [
  '.......####.',
  '.##...######',
  '########..##',
  '########..##',
  '.##...######',
  '.......####.',
];
export const FLAG_COLOURS = { '#': C.teal, R: C.tealHi };
// the ring is the empty socket: draw it in the brighter teal
export const FLAG_ROWS = FLAG_SHAPE.map((row) => [...row].map((ch, i) => (ch === '#' && i >= 6 ? 'R' : ch)).join(''));
/** Gap (px) between the planet's disc and the flag. */
export const FLAG_GAP = 2;

/** The product's beacon marker (web/src/render/beacons.ts BEACON_SHAPE), 2 px above the disc. */
export const BEACON_SHAPE = ['...RR...', '..RCCR..', '..RCCR..', '...RR...', '...MM...', '...MM...', '...MM...', '..MMMM..'];
export const BEACON_GAP = 2;

/**
 * The GIF (6 s): nothing focused, then `src` is focused and its lines draw in; then one of its files,
 * src/core/fog.ts, is focused and its own lines draw in. Times in s from the GIF's start.
 */
export const TIMELINE = [
  { at: 0, focus: null },
  { at: 0.8, focus: { planet: 'src' } },
  { at: 3.6, focus: { planet: 'src', file: 'src/core/fog.ts' } },
];
export const GIF = { seconds: 6, fps: 15, t0: 2 }; // t0: the scene's loop time at the GIF's first frame
export const focusAt = (t) => TIMELINE.filter((k) => k.at <= t).at(-1);
