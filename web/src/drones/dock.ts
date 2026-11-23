// Where the selected drone's panel docks (#189). The panel is opaque DOM laid over the view, so a drone
// drawn under it can't be seen: it docks in the corner of the window that keeps the drone it describes
// clear over that drone's whole turn round its home, so the drone you clicked never goes under its own
// details as it orbits. It moves only when the corner it is in stops keeping the drone clear and another
// does clearly better, never to chase a slightly better one, so it holds still while you read. Pure (no
// DOM, no clock): the drone's track is a function of the model, the camera pose and a frame number (Rule 3).
import { fovOf, project, projectedRadius, type OrbitPose } from '../camera/pose.js';
import type { Rect } from '../labels/place.js';
import { LOOP_FRAMES } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import type { Vec3 } from '../model/vec.js';
import { DRONE_PICK_RADIUS, DRONE_TURNS, homeBody, placeDrone } from './place.js';

export type Dock = 'bottom-left' | 'top-left' | 'bottom-right' | 'top-right';
/**
 * The corners in the order the panel prefers them: its home in the bottom left (#80), then across the window at
 * the same height, where the eye finds it again, then the top corners.
 */
export const DOCKS: readonly Dock[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
/**
 * The panel's distance from the window's edges, CSS px: 8 at the sides; 40 at the bottom, above the help
 * line (style.css #drone-panel); 56 at the top right, under the HUD controls, where the review panel opens.
 * The top left sits under the planet info lines instead (`DockInput.topLeft`).
 */
export const DOCK_INSET = { side: 8, bottom: 40, top: 56 } as const;
/** Points of the drone's track per turn round its home. */
export const TRACK_SAMPLES = 48;
/** A corner that covers more than this share of the drone at any point of its turn hides it (#189 AC 1: at least half stays visible). */
export const HIDES = 0.5;
/** How much less of the drone (a share of it, at the worst point) a corner must cover before the panel moves there. */
export const DOCK_MARGIN = 0.1;

/**
 * The selected drone's screen boxes over one whole turn round its home, plus where it is now, in window CSS
 * px: each a square round its picking sphere (body, drift and bob). The turn is drawn round its home where
 * the home is now, so a panel docked clear of it stays clear while the camera follows that home (focus); a
 * home that drifts in free flight is caught up with as the frames go by. `screen` is the view canvas's box in
 * the window. Empty when the home isn't in this layout.
 */
export function droneTrack(model: SystemModel, home: string, seed: number, frame: number, pose: OrbitPose, screen: Rect): Rect[] {
  const now = homeBody(model, home, frame);
  if (!now) return [];
  const turn = LOOP_FRAMES / DRONE_TURNS;
  const frames = [frame, ...Array.from({ length: TRACK_SAMPLES }, (_, k) => (k * turn) / TRACK_SAMPLES)];
  return frames.flatMap((f) => {
    const at = placeDrone(model, home, seed, f)!, body = homeBody(model, home, f)!;
    const p = project(pose, [0, 1, 2].map((i) => now.centre[i]! + at.centre[i]! - body.centre[i]!) as Vec3);
    if (!p) return [];
    const r = projectedRadius(DRONE_PICK_RADIUS, p.depth, fovOf(pose)) * (screen.h / 2);
    const x = screen.x + ((p.x + 1) / 2) * screen.w, y = screen.y + ((1 - p.y) / 2) * screen.h;
    return [{ x: x - r, y: y - r, w: 2 * r, h: 2 * r }];
  });
}

export interface DockInput {
  /** The drone's boxes over its turn (droneTrack), window CSS px. */
  track: readonly Rect[];
  /** The panel's size, CSS px. */
  panel: { w: number; h: number };
  /** The window's size, CSS px. */
  window: { w: number; h: number };
  /** The top-left dock's top: under the planet info lines, CSS px. */
  topLeft: number;
  /** The other open panels, which the drone panel shouldn't cover, window CSS px. */
  others: readonly Rect[];
}

/** The panel's box at a dock, window CSS px. */
export function dockBox(d: Dock, i: DockInput): Rect {
  const { w, h } = i.panel;
  const x = d.endsWith('left') ? DOCK_INSET.side : i.window.w - DOCK_INSET.side - w;
  const y = d.startsWith('bottom') ? i.window.h - DOCK_INSET.bottom - h : d === 'top-left' ? i.topLeft : DOCK_INSET.top;
  return { x, y, w, h };
}

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** How a dock does: the most of the drone it covers at any point of its turn (a share), and how much of other panels or off-window space it covers (CSS px²). */
export function dockCost(d: Dock, i: DockInput): { worst: number; clash: number } {
  const box = dockBox(d, i);
  const worst = i.track.reduce((m, t) => (t.w > 0 && t.h > 0 ? Math.max(m, overlap(t, box) / (t.w * t.h)) : m), 0);
  const inside = overlap(box, { x: 0, y: 0, w: i.window.w, h: i.window.h });
  const clash = i.others.reduce((n, o) => n + overlap(box, o), box.w * box.h - inside);
  return { worst, clash };
}

/** Hiding the drone is worst, then covering another panel or running off the window. */
const tier = (c: { worst: number; clash: number }) => (c.worst > HIDES ? 2 : 0) + (c.clash > 0 ? 1 : 0);

/**
 * Where the panel docks now, given where it is (`current`, null when it just opened). It stays while it keeps
 * the drone clear and covers nothing else; otherwise it moves only to a corner of a better tier (not hiding the
 * drone, not covering another panel) or one that covers at least DOCK_MARGIN less of the drone, so a camera that
 * hovers near a tie never makes it flicker between two corners. A panel that just opened takes the best corner,
 * ties going to the first of DOCKS.
 */
export function chooseDock(i: DockInput, current: Dock | null): Dock {
  const costs = new Map(DOCKS.map((d) => [d, dockCost(d, i)] as const));
  const cost = (d: Dock) => costs.get(d)!;
  if (current !== null && cost(current).worst === 0 && cost(current).clash === 0) return current;
  const rank = (a: Dock, b: Dock) => tier(cost(a)) - tier(cost(b)) || cost(a).worst - cost(b).worst || cost(a).clash - cost(b).clash || DOCKS.indexOf(a) - DOCKS.indexOf(b);
  const best = [...DOCKS].sort(rank)[0]!;
  if (current === null) return best;
  const b = cost(best), c = cost(current);
  return tier(b) < tier(c) || (tier(b) === tier(c) && b.worst + DOCK_MARGIN <= c.worst) ? best : current;
}
