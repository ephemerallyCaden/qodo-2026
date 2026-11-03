// Hand-drawn pixel sprites. One char per pixel; '.' is transparent.
// o outline · w helmet · g helmet shade · v visor · V visor glint
// s suit · S suit shade · m chest light · f/F jet flame

const HELMET = [
  '...oooo...',
  '..owwwwo..',
  '.owwwwwgo.',
  'owwvvvvvgo',
  'owvVVvvvgo',
  'owvVvvvvgo',
  'owwvvvvggo',
  '.oggggggo.',
];

// Frame A: arms out at shoulder height. Frame B: arms dipped one pixel.
const ASTRO_A = [
  ...HELMET,
  'osossssoso',
  'osomsssoSo',
  'oooSsssooo',
  '..osssSo..',
  '..osooSo..',
  '..oSooSo..',
  '..oo..oo..',
  '...f..f...',
];

const ASTRO_B = [
  ...HELMET,
  '..osssso..',
  'osomsssoso',
  'osoSsssoSo',
  'oo.osssooo',
  '..osooSo..',
  '..oSooSo..',
  '..oo..oo..',
  '..F....F..',
];

export const ASTRO_FRAMES = [ASTRO_A, ASTRO_B];
export const ASTRO_W = ASTRO_A[0].length;
export const ASTRO_H = ASTRO_A.length;

/** Draw a sprite with a colour map; flip mirrors horizontally. */
export function drawSprite(ctx, rows, x, y, colors, flip = false) {
  x = Math.round(x);
  y = Math.round(y);
  const w = rows[0].length;
  rows.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const c = colors[row[flip ? w - 1 - i : i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  });
}
