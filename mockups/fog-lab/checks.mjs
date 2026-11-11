// Checks every measured render goes through (lab.mjs) and the tests reuse. Pure: frames in, a list
// of problems out (an empty list is a pass). Render checks must fail on empty output.
import { discPixels, fogVisibility, tealCount, diffSet } from './stats.mjs';

export class CheckError extends Error {}

/**
 * One fogged render against its fog-off twin; st: its stage mask (stats.mjs stages()).
 * - the planet is there (some disc pixels);
 * - 100% charted with no event is the planet itself, pixel for pixel;
 * - any fogged file shows: the mask has fog and the frame differs visibly from fog off;
 * - teal only during an event (no teal at rest; teal is exact only in a depth-off frame).
 */
export function checkFrame({ final, nofog, empty, geom, st, coverage, event = false }) {
  const problems = [];
  const disc = discPixels(nofog, empty, geom);
  if (disc.length < 200) problems.push(`empty render: ${disc.length} planet pixels`);
  const v = fogVisibility(final, nofog, disc, st);
  if (coverage === 1 && !event && diffSet(final, nofog).size) problems.push(`100% charted differs from fog off in ${diffSet(final, nofog).size} px`);
  if (coverage < 1 && (v.fogged === 0 || v.visible === 0)) problems.push(`fog invisible at ${coverage * 100}% charted (fogged ${v.fogged}, visible ${v.visible})`);
  if (!event && tealCount(final).near) problems.push(`teal at rest: ${tealCount(final).near} px`);
  return { problems, ...v };
}
