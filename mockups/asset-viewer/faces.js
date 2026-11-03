// ASCII faces for the visor screen, after the ApprenticeHack avatars
// (site/js/avatar-renderer.js): an eyes string whose glyphs are spaced evenly
// around the centre, plus an optional mouth, picked from the handle by hash.
// Real font text turns to mush at our internal resolution, so every glyph is a
// hand-drawn bitmap ('#' = lit), centred on the eye line or the mouth line.

export const EYES = ['•   •', '◉   ◉', '^   ^', '⌐■_■', '• ▮ •', '>   <', '◕   ◕', '✖   ✖', 'ʘ   ʘ', '◣   ◢', '◕   ↼', '•   ●', '■■■■'];
export const MOUTHS = ['', '‿', '︿', 'ᴗ', '_', 'ε', '◡', '▽', '—'];

const EYE_GLYPHS = {
  '•': ['.##.', '####', '####', '.##.'],
  '●': ['.####.', '######', '######', '######', '######', '.####.'],
  '◉': ['..###..', '.#...#.', '#.###.#', '#.###.#', '#.###.#', '.#...#.', '..###..'],
  'ʘ': ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
  '^': ['...#...', '..#.#..', '.#...#.', '#.....#'],
  '⌐': ['###', '#..', '#..'],
  '■': ['####', '####', '####', '####'], // 4 wide so the 4-glyph sets keep their gaps
  '_': ['...', '...', '...', '###'],
  '▮': ['##', '##', '##', '##', '##'],
  '>': ['##...', '..##.', '....#', '..##.', '##...'],
  '<': ['...##', '.##..', '#....', '.##..', '...##'],
  '◕': ['..###..', '.#####.', '##..###', '##..###', '#######', '.#####.', '..###..'],
  '✖': ['##...##', '.##.##.', '..###..', '.##.##.', '##...##'],
  '◣': ['#.....', '##....', '###...', '####..', '#####.', '######'],
  '◢': ['.....#', '....##', '...###', '..####', '.#####', '######'],
  '↼': ['.#.....', '##.....', '#######'],
};

const MOUTH_GLYPHS = {
  '‿': ['#.....#', '.#####.'],
  '︿': ['.#####.', '#.....#'],
  'ᴗ': ['#...#', '#...#', '.###.'],
  '_': ['#####'],
  'ε': ['.###', '#...', '.###'],
  '◡': ['#.....#', '##...##', '.#####.'],
  '▽': ['#######', '.#...#.', '..#.#..', '...#...'],
  '—': ['#######'],
};

// Face bitmap: a 4:3 screen. Layout follows the reference's monitor head: the eye
// row sits at the screen centre and spans ~46% of its width; the mouth sits below.
// 32x24 keeps one texel close to one internal pixel in the crew close-up at 320x180.
export const FACE_W = 32;
export const FACE_H = 24;
const EYE_SPAN = 15; // centre of first glyph to centre of last (15 keeps 2/4-glyph gaps integer)
const EYE_LINE = 10; // glyphs are centred vertically on these rows
const MOUTH_LINE = 17;

/** Same hash as ApprenticeHack's hashStr. */
export function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Eye and mouth indices for a handle, like the reference's fallback. */
export const faceFor = (handle) => ({ eyes: hashStr(handle + 'e') % EYES.length, mouth: hashStr(handle + 'm') % MOUTHS.length });

/** Rasterise a face into a FACE_W x FACE_H RGBA buffer (white = lit, row 0 = top). */
export function faceBitmap(eyesIdx, mouthIdx) {
  const data = new Uint8Array(FACE_W * FACE_H * 4);
  const stamp = (rows, cx, cy) => {
    const w = rows[0].length;
    const left = Math.round(cx - (w - 1) / 2);
    const top = Math.round(cy - (rows.length - 1) / 2);
    rows.forEach((row, j) => {
      for (let i = 0; i < w; i++) {
        if (row[i] !== '#') continue;
        const x = left + i;
        const y = top + j;
        if (x < 0 || y < 0 || x >= FACE_W || y >= FACE_H) continue;
        data.fill(255, (y * FACE_W + x) * 4, (y * FACE_W + x) * 4 + 4);
      }
    });
  };
  const glyphs = [...EYES[eyesIdx].replace(/\s+/g, '')];
  const gap = EYE_SPAN / Math.max(1, glyphs.length - 1);
  const start = (FACE_W - 1) / 2 - (glyphs.length > 1 ? EYE_SPAN / 2 : 0);
  glyphs.forEach((g, i) => stamp(EYE_GLYPHS[g], start + i * gap, EYE_LINE));
  const mouth = MOUTHS[mouthIdx];
  if (mouth) stamp(MOUTH_GLYPHS[mouth], (FACE_W - 1) / 2, MOUTH_LINE);
  return data;
}
