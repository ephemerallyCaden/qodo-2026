// The fog's hand-drawn pixel glyphs: 5x5, '#' = ink, drawn in the cell's 6 px box (a 1 px gutter
// keeps glyphs apart). The shapes are ascii-fx round 2's 5x5 set (feature/ascii-fx 29c64a1,
// mockups/ascii-fx/glyphs.js), the art direction's §9 vocabulary: ◎ ▢ · \ hatching and code glyphs.
// The fog's set shares no glyph with the artefacts' bug glyphs (artefacts.js: ✕ × # ; ! { } * 0 1 +):
// fog draws the calm ones, artefacts the loud ones, so a fogged cell never reads as a glitch.
// Pure: no DOM, no three.js.

export const GLYPHS = {
  dot: ['.....', '.....', '..#..', '.....', '.....'],
  colon: ['..#..', '.....', '.....', '.....', '..#..'],
  ring: ['.###.', '#...#', '#.#.#', '#...#', '.###.'], // ◎
  hollow: ['.###.', '#...#', '#...#', '#...#', '.###.'], // ○
  box: ['#####', '#...#', '#...#', '#...#', '#####'], // ▢
  hatch: ['#..#.', '.#..#', '..#..', '#..#.', '.#..#'],
  bslash: ['#....', '.#...', '..#..', '...#.', '....#'],
  eq: ['.....', '#####', '.....', '#####', '.....'],
  chev: ['.#...', '..#..', '...#.', '..#..', '.#...'], // >
  qmark: ['.###.', '#...#', '..##.', '.....', '..#..'], // ? (D2c's occasional unknown, one per big parcel)
};

/** Bit mask of a glyph: bit (y * 5 + x), y down. */
export const mask = (rows) => rows.join('').split('').reduce((m, ch, i) => (ch === '#' ? m | (1 << i) : m), 0);
/** Ink share of a glyph's 5x5 box. */
export const inkShare = (rows) => rows.join('').split('').filter((ch) => ch === '#').length / 25;

/**
 * Uniform fog (F4's default): the glyph follows the luminance of the terrain it covers (§9: glyphs are
 * chosen by luminance), darkest first, so the field shows the ground's value structure.
 */
export const LUMA_SET = ['colon', 'hollow', 'ring', 'hatch'];
/**
 * Per reason (F4's option, direction A only), in mock.js REASONS order: agent `>`, mixed `=`,
 * self-committed-agent-written ◎, teammate ▢, unknown `:`, lineage-unknown `\`.
 */
export const REASON_SET = ['chev', 'eq', 'ring', 'box', 'colon', 'bslash'];
/** Every glyph the fog draws. */
export const REST_GLYPHS = [...new Set([...LUMA_SET, ...REASON_SET, 'dot', 'qmark'])];
