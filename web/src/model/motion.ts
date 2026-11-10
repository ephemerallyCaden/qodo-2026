// Loop-locked motion (art-direction §7, AGENTS.md Rule 4): every animated layer completes a whole
// number of cycles per loop, at a constant rate, with no easing. A frame number is the only input;
// nothing here reads a clock (principle 3). Pure: no three.js, no DOM.

/** Frames per second of the frame clock. `t = (n mod LOOP_FRAMES) / FPS` (system design §7). */
export const FPS = 30;
/** The loop: 24 s. */
export const LOOP_SECONDS = 24;
export const LOOP_FRAMES = FPS * LOOP_SECONDS;

/** Whole cycles per loop for each layer. */
export const TURNS = {
  /** The surface turns twice per loop, right to left. */
  surface: 2,
  /** Clouds turn three times, 1.5× the surface, so they slide over the terrain. */
  clouds: 3,
  /** Each moon (and each moonlet of the star) orbits once per surface turn. */
  moons: 2,
  /** The molten lava field churns once per surface turn. */
  lava: 2,
  /**
   * Planets around the star. Zero: planets hold their frame-0 angle (`phaseMilliturn`). The loop
   * lock only allows whole turns per 24 s loop, and even one turn sweeps a large system past the
   * camera at 15°/s, which fights free flight and focus. Pending an art-direction call.
   */
  orbits: 0,
} as const;

/** The frame reduced motion freezes on (AC7). */
export const REDUCED_MOTION_FRAME = 0;

/** Position in the loop, 0..1, for any integer frame (negative frames wrap too). */
export function loopPhase(frame: number): number {
  const n = Math.floor(frame);
  return (((n % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES) / LOOP_FRAMES;
}

/** Angle in radians after `turnsPerLoop` whole turns per loop, at a constant rate. */
export function turnAngle(frame: number, turnsPerLoop: number): number {
  return loopPhase(frame) * Math.PI * 2 * turnsPerLoop;
}

/** The frame the renderer actually draws: reduced motion freezes on one fixed frame. */
export function effectiveFrame(frame: number, reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_MOTION_FRAME : Math.floor(frame);
}
