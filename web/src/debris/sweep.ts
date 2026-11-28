// The sweep (R13, D6): when a piece's branch is gone on the next data load of the same scan, its piece breaks apart
// in a 1.2 s one-shot and leaves no trace. Pure: a sweep is the item it was and the frame it began, so a frame stays
// a function of (items, sweeps, frame), as the fog's fronts are (model/fog.ts). No clock (Rule 3).
import type { DebrisEntry } from '../render/debris.js';
import { FPS } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import { debrisBody, placePiece, planDebris, SWEEP, type Drawable, type DebrisPlan } from './place.js';

/** A piece breaking apart: the item it was, and the frame its sweep began. */
export interface DebrisSweep { item: Drawable; start: number }

/** Frames a sweep lasts. */
export const SWEEP_FRAMES = Math.ceil(SWEEP.end * FPS);

/** The sweeps still running at `frame`: one that began SWEEP_FRAMES or more ago has left no trace, and is dropped. */
export const runningSweeps = (sweeps: readonly DebrisSweep[], frame: number): DebrisSweep[] => sweeps.filter((s) => frame < s.start + SWEEP_FRAMES);

/**
 * The sweeps after the items drawn went from `drawn` to `next` at `frame`: every item drawn before and gone now
 * begins one, a running one carries on (unless its item is back: then it's drawn whole again), and one that
 * ended is dropped. Only an item that was drawn is swept, never one past its body's cap or with no body here.
 */
export function sweepsAfter(model: SystemModel, drawn: readonly Drawable[], next: readonly Drawable[], running: readonly DebrisSweep[], frame: number): DebrisSweep[] {
  const now = new Set(next.map((it) => it.id));
  const shown = new Set(planDebris(model, drawn).pieces.map((p) => p.id));
  const kept = runningSweeps(running, frame).filter((s) => !now.has(s.item.id));
  const have = new Set(kept.map((s) => s.item.id));
  const begun = drawn.filter((it) => shown.has(it.id) && !now.has(it.id) && !have.has(it.id)).map((item) => ({ item, start: frame }));
  return [...kept, ...begun];
}

/** What the scene draws: the plan of `items` at rest, then every running sweep's piece, where it was. */
export function debrisEntries(model: SystemModel, items: readonly Drawable[], sweeps: readonly DebrisSweep[]): { entries: DebrisEntry[]; plan: DebrisPlan } {
  const plan = planDebris(model, items);
  const entries: DebrisEntry[] = plan.pieces.map((piece) => ({ piece, sweep: null }));
  for (const s of sweeps) {
    const body = debrisBody(model, s.item.home);
    if (body) entries.push({ piece: placePiece(s.item, body), sweep: s.start });
  }
  return { entries, plan };
}
