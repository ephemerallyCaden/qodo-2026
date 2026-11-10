// Every render-test threshold in one file (#31 AC 2-4), taken from docs/design/system-design.md §10.
// Change one only on purpose, with the reason in the commit message; a threshold loosened to make a
// test pass hides a regression.

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
