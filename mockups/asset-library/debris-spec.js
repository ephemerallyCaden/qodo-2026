// Space debris (R13) on a library planet: stale items drifting near the planet they touch, drawn by
// the asset viewer's own debris (makePlanet().setDebris, A3). A planet's `debris` state is demo
// items (the viewer's demoItems, by count and age mix) or edited items, a seed (the planet's by
// default, as the viewer), sweeps (an item breaking apart from time `at`, outside the loop lock)
// and a selected piece (teal). Pure: the viewer's debris layout and kits are pure modules.
import { demoItems, ranked, ageStep, AGE_MIXES, AGES, PAINT_AGE_LABEL } from '../asset-viewer/debris-layout.js';
import { CLASSES, CLASS_LABEL } from '../asset-viewer/debris-kits.js';
// The debris lab's directions (A-E, A2 and the final A3): importing them registers the lab's kits,
// arrangements and colours with the viewer's debris, so the history draws every direction live.
import { VARIANTS as DIRECTIONS } from '../debris-lab/variants.js';

export { AGE_MIXES, AGES, CLASSES, CLASS_LABEL, ranked };
export const DEBRIS_COUNTS = [0, 1, 3, 8, 24]; // the viewer's clutter scale (DEBRIS_COUNTS in viewer.js; the fidelity test checks)
export const MAX_DEBRIS = 24;
export const AGE_NAMES = PAINT_AGE_LABEL; // intact, weathered, broken (A3 ages by paint)
export const ageName = (days) => AGE_NAMES[ageStep(days)];

export const DEBRIS_DIRECTIONS = DIRECTIONS.map((v) => v.id); // A, A2, A3, B, C, D, E
export const FINAL_DIRECTION = 'A3'; // the viewer's DEBRIS_STYLE
export const directionOf = (id) => DIRECTIONS.find((v) => v.id === id);
export const DEBRIS_DEFAULTS = { on: false, count: 8, mix: 'mixed', seed: null, items: null, sweeps: [], selected: null, direction: FINAL_DIRECTION };

/** The stale items a debris state shows: its edited items, or the viewer's demo items. */
export const itemsOf = (d) => d.items ?? demoItems(d.count, { mix: d.mix });

/**
 * The viewer's setDebris spec for a planet item ({ seed, debris }), or null when it has none:
 * { items, seed, sweeps: { id: start s }, selected } (and an exploration direction's style).
 */
export function debrisSpec(planet) {
  const d = planet.debris;
  if (!d?.on) return null;
  const spec = { items: itemsOf(d), seed: d.seed ?? planet.seed, sweeps: Object.fromEntries(d.sweeps.map(({ id, at }) => [id, at])), selected: d.selected };
  if (d.direction === FINAL_DIRECTION) return spec;
  const { kit, arrangement, cap, hull } = directionOf(d.direction); // an exploration (the history): its kit, arrangement, cap and hull
  return { ...spec, style: { kit, arrangement, cap, hull: hull ?? 'gear' } }; // (the lab's default hull for A-E)
}

/** The next item a "sweep one" takes, as the viewer's button does: the biggest not yet swept (null when none is left). */
export function nextSweep(d) {
  const gone = new Set(d.sweeps.map((s) => s.id));
  return ranked(itemsOf(d)).find((it) => !gone.has(it.id))?.id ?? null;
}
