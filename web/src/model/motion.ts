// Motion (art-direction §7, AGENTS.md Rule 4): every layer turns at a constant rate, with no easing.
// Every layer but the planets' orbits completes a whole number of cycles per 24 s loop; the orbits
// are slower than any loop allows and turn once per ORBIT_SECONDS (#60). A frame number is the only
// input; nothing here reads a clock (principle 3). Pure: no three.js, no DOM.

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
  /** The star's disc turns once per loop, right to left like the planets (star-art.md S4). */
  starSpin: 1,
  /** The star's granulation and corona lumps churn once per loop, on a circle in noise space. */
  starChurn: 1,
} as const;

/**
 * Planets orbit the star once every 10 minutes, all at this one rate (human, 2026-11-10, #60). The loop
 * lock allows at least one turn per 24 s loop, 15°/s, which swept a large system past the camera and
 * fought free flight and focus, so the orbits left the loop: 0.6°/s, 25 times slower. One rate for every
 * planet turns the system as one, so planets keep their places relative to each other (the layout's slots
 * and phases) and a speed never reads as data (principle 4). The start pose's distance grows with the
 * system, so seen from it no planet crosses more than 1.5% of the frame per second (over a minute to
 * cross it) in a small or a large system alike; Commet's own outermost planet moves 0.36 units/s, under
 * the slowest free-flight speed (rig.ts MIN_FLY_SPEED, 0.5). Both are checked in test/web/model.test.ts.
 */
export const ORBIT_SECONDS = 600;
/** One orbit in frames: a whole number of loops (25), so every 18 000 frames the whole scene is frame 0 again. */
export const ORBIT_FRAMES = FPS * ORBIT_SECONDS;

/**
 * The frame a view under reduced motion from the start holds (AC7), and the one the render hook draws
 * for `reducedMotion`. Switched on mid-session, the live view freezes on the frame it was showing
 * instead (live.ts `shown`), so the orbits never jump (#60, Qodo d094226d).
 */
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

/**
 * How far the planets have turned round the star at a frame, in radians (0..2π, one turn per ORBIT_FRAMES).
 * Not loop-locked: frame 720 is 1/25 of a turn on from frame 0 (#60).
 */
export function orbitAngle(frame: number): number {
  const n = Math.floor(frame);
  return ((((n % ORBIT_FRAMES) + ORBIT_FRAMES) % ORBIT_FRAMES) / ORBIT_FRAMES) * Math.PI * 2;
}

/** The frame the render hook draws: reduced motion freezes on REDUCED_MOTION_FRAME. */
export function effectiveFrame(frame: number, reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_MOTION_FRAME : Math.floor(frame);
}
