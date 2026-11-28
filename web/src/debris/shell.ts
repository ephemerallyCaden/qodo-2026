// The debris shell (R13): the band round a body that its stale work drifts in, just outside everything the body
// already draws (its moons, its fog sky, the star's corona) and inside its drones' lanes. Pure arithmetic, no
// imports from the drones or the crew, so drones/place.ts can grow every body's reach by it without a cycle.
//
// Only a body drawing debris has a shell its neighbours clear (lead, 2026-11-28; SystemModel.debrisHomes): its
// drones and the crew's ship read its reach (drones/place.ts homeBody) and sit outside the shell, and the start pose
// frames it. A body's pieces are placed in it the same way whatever else is drawn, so no piece ever moves when
// another comes or goes. All its sizes are in the body's radii, as a piece's size is, so it looks the same against
// a body of any size in focus.
import { CORONA } from '../model/star.js';
import { MAX_BOUND } from '../render/debris-kits.js';

/**
 * In the body's radii: `gap` between what the body draws and the nearest point of any piece (the 1.2 px outline
 * and some air at the focus framing), `ecc` how far a crooked orbit swings in and out of its mean radius, and
 * `band` how much room mean radii have to spread over at the least, so pieces don't share one lane. The rest is
 * room for the biggest piece's bound on either side (render/debris-kits.ts MAX_BOUND: a broken solar array,
 * its fragments drifting apart), so a smaller piece has a wider band to drift in.
 */
export const DEBRIS_SHELL = { gap: 0.08, ecc: 0.05, band: 0.2 } as const;

/**
 * What a body's debris clears: the reach of what it draws (drones/place.ts homeBase), and round the star its corona
 * too (model/star.ts CORONA), which its drones never needed to clear. World units.
 */
export const shellBase = (home: string, reach: number, radius: number): number => (home === 'star' ? Math.max(reach, radius * CORONA.reach) : reach);

/**
 * The shell round a body whose drawn reach is `base` (world units) and whose radius is `radius`: no point of any
 * piece is nearer the centre than `inner` or further than `outer`, whatever its size and orbit (debris/place.ts).
 */
export function debrisShell(base: number, radius: number): { inner: number; outer: number } {
  const inner = base + DEBRIS_SHELL.gap * radius;
  return { inner, outer: inner + (2 * DEBRIS_SHELL.ecc + DEBRIS_SHELL.band + 2 * MAX_BOUND) * radius };
}
