// Checks every frame the runner writes goes through (lab.mjs), and the tests reuse. Pure: decoded
// frames in ({ final, scene, ov, blocked } as { w, h, data }, plus the page's lines), a list of
// problems out (an empty list is a pass). Render checks fail on empty output.
import { COLOURS, LINE_COLOURS, SPACE, C } from './variants.js';

const rgb = (d, i) => (d[4 * i] << 16) | (d[4 * i + 1] << 8) | d[4 * i + 2];
const hex = (h) => parseInt(h.slice(1), 16);
const SPACE_RGB = hex(SPACE);

/** Pixels of an index map (ov's R channel) that are constellation lines. */
export function linePixels(ov) {
  const out = [];
  for (let i = 0; i < ov.w * ov.h; i++) if (LINE_COLOURS.includes(ov.data[4 * i])) out.push(i);
  return out;
}

/** Line pixels not inside a full 2×2 block of line pixels: 1 px slivers, which the 2 px rule bans. */
export function slivers(ov) {
  const { w, h } = ov;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && LINE_COLOURS.includes(ov.data[4 * (y * w + x)]);
  return linePixels(ov).filter((i) => {
    const x = i % w, y = Math.floor(i / w);
    return ![[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => on(x + dx, y + dy) && on(x + dx + 1, y + dy) && on(x + dx, y + dy + 1) && on(x + dx + 1, y + dy + 1));
  }).length;
}

/**
 * One frame of a cell. Problems when:
 * - the scene is empty (fewer than 2,000 non-space pixels: the planets and star aren't there);
 * - a focused cell draws no line, or an unfocused one draws any (no hairball);
 * - any pixel the overlay changed isn't exactly its palette colour, or a pixel changed without the overlay;
 * - a line pixel sits on a blocked pixel (a disc, cloud, ring, moon, debris, drone, star, label or
 *   marker, or the 1 px gap round them), or is a 1 px sliver;
 * - teal (the flag's colour) covers 10% of the frame or more.
 */
export function checkFrame(r, cell) {
  const problems = [];
  const { final, scene, ov, blocked } = r;
  const n = final.w * final.h;
  let busy = 0;
  for (let i = 0; i < n; i++) if (rgb(scene.data, i) !== SPACE_RGB) busy++;
  if (busy < 2000) problems.push(`empty scene: ${busy} non-space px`);
  const lines = linePixels(ov);
  if (cell.focus && lines.length === 0) problems.push('focused, but no line drawn');
  if (!cell.focus && lines.length) problems.push(`nothing focused, but ${lines.length} line px`);
  let offPalette = 0, unexplained = 0, onBlocked = 0, teal = 0;
  for (let i = 0; i < n; i++) {
    const k = ov.data[4 * i];
    if (k) {
      if (!COLOURS[k] || rgb(final.data, i) !== hex(COLOURS[k])) offPalette++;
      if (k === C.teal || k === C.tealHi) teal++;
    } else if (rgb(final.data, i) !== rgb(scene.data, i)) unexplained++;
  }
  for (const i of lines) if (blocked.data[4 * i]) onBlocked++;
  if (offPalette) problems.push(`${offPalette} overlay px off their palette colour`);
  if (unexplained) problems.push(`${unexplained} px changed outside the overlay`);
  if (onBlocked) problems.push(`${onBlocked} line px on blocked pixels (a body, a label or its gap)`);
  const thin = slivers(ov);
  if (thin) problems.push(`${thin} line px thinner than 2 px`);
  if (teal / n >= 0.1) problems.push(`teal on ${((100 * teal) / n).toFixed(1)}% of the frame`);
  return problems;
}
