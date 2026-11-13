// Every render-test threshold in one file (#31 AC 2-4), taken from docs/design/system-design.md §10.
// Change one only on purpose, with the reason in the commit message; a threshold loosened to make a
// test pass hides a regression.
import { palette } from '../../src/core/palette.js';

/** Per-frame draw budget, read from renderer.info (never FPS). Applies to the whole frame: scene pass plus upscale. */
export const BUDGET = {
  maxDrawCalls: 100,
  maxTriangles: 500_000,
} as const;

/**
 * Pixel comparison, for two runs (AC 2) and for a run against its golden (AC 5). Zero is reachable:
 * the test reads the low-res target before upscale, there is no AA, filtering or dithering, shading
 * is banded, and goldens are compared only in the one pinned SwiftShader build that made them. If
 * flakes appear, §10 allows up to 0.1% of the frame, with a written justification.
 */
export const PIXELS = {
  /** A pixel differs when any RGBA channel differs by more than this (0..255). */
  channelTolerance: 0,
  /** Pixels allowed to differ. */
  maxDiffPixels: 0,
} as const;

/**
 * Empty output (AC 3, §10 anti-empty asserts). A frame fails with fewer unique colours, or less of it
 * off the space colour, than this. A body shader that fails to compile leaves space and the 1 px
 * stars: 4 colours and well under 1% of the frame.
 */
export const BLANK = {
  minColours: 12,
  minNonSpaceFraction: 0.05,
} as const;

/**
 * Overview readability (system-design §10, #59; human, 2026-11-11). At a system's start pose the
 * farthest planet on screen fades by at most the palette's 0.72 step, and its health band still
 * separates from the next band by at least `minBandStep` (OKLab, the health-looks lab's glance floor).
 */
export const OVERVIEW = {
  maxFarFade: palette.world.depth[2]!.strength,
  minBandStep: 0.05,
  /** Fewer planet pixels than this and the band measure would be noise. */
  minPlanetPx: 16,
  /**
   * The overview's own anti-empty floor, in place of BLANK's 5% (fixtures only). The widest
   * self-like overview is about 1% off space; space and the 1 px stars alone are under 0.1%.
   */
  minNonSpaceFraction: 0.005,
} as const;
