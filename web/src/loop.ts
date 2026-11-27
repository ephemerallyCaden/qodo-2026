// The animation loop: the view's one clock read (system design §6). requestAnimationFrame's
// timestamp becomes a whole frame number here; everything downstream only ever sees frame numbers
// (principle 3). In reduced motion the frame holds still and the loop sleeps until input wakes it.
import { FPS } from './model/motion.js';

/** A tab switch or a breakpoint must not fling the camera: a tick never covers more than this. */
const MAX_TICK_MS = 100;

export interface LoopTick {
  /** Whole frames since the loop started, counting only animated time. */
  frame: number;
  /** Milliseconds since the previous tick (clamped), for camera movement. */
  dtMs: number;
}

export interface Loop {
  /** Ask for a tick (input arrived, data changed, a resize). */
  wake(): void;
  stop(): void;
}

/**
 * Calls `tick` once per display frame while `active()` is true; otherwise sleeps until wake().
 * `animating()` says whether time advances (false under reduced motion).
 */
export function startLoop(tick: (t: LoopTick) => void, active: () => boolean, animating: () => boolean): Loop {
  let handle = 0;
  let last: number | null = null;
  let clockMs = 0;
  let stopped = false;
  const run = (ts: number) => {
    handle = 0;
    if (stopped) return;
    const dtMs = last === null ? 0 : Math.min(MAX_TICK_MS, Math.max(0, ts - last));
    last = ts;
    if (animating()) clockMs += dtMs;
    tick({ frame: Math.floor((clockMs * FPS) / 1000), dtMs });
    if (active()) handle = requestAnimationFrame(run);
    else last = null; // asleep: the next wake starts a fresh dt
  };
  const wake = () => { if (!handle && !stopped) handle = requestAnimationFrame(run); };
  wake();
  return { wake, stop: () => { stopped = true; if (handle) cancelAnimationFrame(handle); } };
}
