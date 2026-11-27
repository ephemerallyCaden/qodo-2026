// Every number layout() (#18) decides by, in one place. Lengths are world units ×1000 and angles
// thousandths of a turn, because layout.json holds integers only (canonicalJson).

/** Orbits: slot i sits at FIRST_ORBIT + i × SLOT_SPACING. Spacing ≥ 2 × the largest planet, so growth never forces a move. */
export const FIRST_ORBIT_MILLI = 30_000;
export const SLOT_SPACING_MILLI = 24_000;
/**
 * Zones (#71). With content roots, content planets take slots 0..CONTENT_SLOTS-1 and outer planets
 * start OUTER_GAP_SLOTS empty slots beyond them, so a growing zone never pushes the other (nothing
 * moves). A content planet born while every content slot is taken takes the innermost free slot
 * past the gap. With no roots every planet is outer, from slot 0 (#18).
 */
export const CONTENT_SLOTS = 8;
export const OUTER_GAP_SLOTS = 1;
/** Starting angle of slot i: i × 618 thousandths of a turn (the golden ratio), so neighbours never line up. */
export const PHASE_STEP_MILLITURN = 618;

/** Planet radius = clamp(log2(1 + LOC) × RADIUS_PER_LOG2, MIN, MAX), world units ×1000. MAX is reached at 65,535 LOC. */
export const RADIUS_PER_LOG2_MILLI = 750;
export const MIN_PLANET_RADIUS_MILLI = 1_500;
export const MAX_PLANET_RADIUS_MILLI = 12_000;

/** Cells on every planet's surface grid (a Fibonacci sphere). Fixed, so no cell ever moves. */
export const SURFACE_CELLS = 256;

/** Moons per planet and moonlets around the star; the rest are counted as overflow. */
export const MOON_CAP = 24;
export const MOONLET_CAP = 24;

/** Settlement size class 1..4: the largest LOC of sizes 1, 2 and 3; anything larger is 4. */
export const SETTLEMENT_SIZE_MAX_LOC = [50, 200, 500] as const;

/**
 * Health bands (art-direction §6), worst to best lava → toxic → ash → healthy, from a score in
 * thousandths per 1,000 LOC: debt markers per kLOC, plus QODO_FINDING_WEIGHT × open Qodo findings
 * per kLOC when they're known. A score at a band's maximum stays in that band; one thousandth above
 * it moves to the next worse band.
 */
export const HEALTHY_MAX_MILLI = 2_000;
export const ASH_MAX_MILLI = 5_000;
export const TOXIC_MAX_MILLI = 10_000;
/** An open Qodo finding weighs as much as this many debt markers. */
export const QODO_FINDING_WEIGHT = 2;
