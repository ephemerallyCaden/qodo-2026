// Where the crew's ship is (#207 C4), as a pure function of (model, frame): no clock, no random (AGENTS.md
// Rule 3). There is one ship per system and nothing about it varies, so it has no seed: its place comes
// from the layout alone, and stays put between scans unless the bodies near it change.
//
// It hovers beside the star, on the start pose's left (camera/pose.ts START_ANGLES), past the star's drone
// lane, and high enough above the orbit plane that no planet, moon or planet drone passes through it: the
// left, because the review panel opens over the top right of the start view (free flight lists the star's
// files there), where it would hide the ship's top portholes, the captain's among them. It
// faces the start pose's camera, so the crew in its front portholes shows, and the start pose fits it in
// (shipCorners; human, 2026-11-25), so Home always frames it. Like the start pose, it turns round the star
// with the planets (one constant rate, model/motion.ts orbitAngle), so Home always sees its front and it
// keeps its place among the planets.
import { fovOf, project, projectedRadius, START_ANGLES, type OrbitPose } from '../camera/pose.js';
import { DRONE_LANE_OUT, DRONE_PICK_RADIUS, homeBody } from '../drones/place.js';
import type { Rect } from '../labels/place.js';
import { FPS, LOOP_SECONDS, loopPhase, orbitAngle } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import type { Vec3 } from '../model/vec.js';
import { shipBounds } from '../render/ship-glsl.js';
import { buildShip, CYCLE, idleAt, MAX_ABOARD, SHIP_SCALE, type ShipSpec, type Vec } from '../render/ship-spec.js';

/** The gap the ship keeps from every body's reach and every drone's path, world units. */
export const SHIP_MARGIN = 0.25;

/** The biggest ship (two decks): placed for it, the ship never moves as people join. */
const BIGGEST = shipBounds(buildShip(MAX_ABOARD), 0);
/** The ship's footprint radius round its axis (fins and feet), and its lowest point (the flame's tip) below its origin, world units. */
export const SHIP_FOOTPRINT = Math.max(...[BIGGEST.lo[0], BIGGEST.lo[2], BIGGEST.hi[0], BIGGEST.hi[2]].map(Math.abs)) * SHIP_SCALE;
const SHIP_BOTTOM = BIGGEST.lo[1] * SHIP_SCALE;

export interface ShipPlacement {
  /** The ship's origin (its design-space origin, world units). */
  centre: Vec3;
  /** Yaw about +y that turns the ship's front (+z) toward the start pose's camera, turned with the orbits. */
  yaw: number;
}

/**
 * The ship at frame 0: its horizontal distance from the star puts its footprint just past the star's drone
 * lane, on the start pose's left; its height lifts its lowest point clear of every planet's drones' lane (round
 * its reach or its fog sky, drones/place.ts homeBody) wherever the footprint crosses that planet's orbit.
 */
export function shipSpot(model: SystemModel): ShipPlacement {
  const left: Vec3 = [-Math.cos(START_ANGLES.yaw), 0, Math.sin(START_ANGLES.yaw)];
  const star = homeBody(model, 'star', 0)!;
  const d = star.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS + SHIP_MARGIN + SHIP_FOOTPRINT;
  const inner = d - SHIP_FOOTPRINT, outer = d + SHIP_FOOTPRINT;
  let floor = SHIP_MARGIN;
  for (const p of model.planets) {
    // the drones' own circle round the planet (homeBody: its reach or its fog sky's top, #225), so the two never drift apart
    const clear = homeBody(model, p.dirId, 0)!.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS + SHIP_MARGIN;
    const gap = Math.max(0, p.orbit - outer, inner - p.orbit);
    if (gap < clear) floor = Math.max(floor, Math.sqrt(clear * clear - gap * gap) + SHIP_MARGIN);
  }
  const bob = 0.07 * SHIP_SCALE; // idleAt's largest bob
  return { centre: [left[0] * d, floor - SHIP_BOTTOM + bob, left[2] * d], yaw: START_ANGLES.yaw };
}

/**
 * The corners of the box round the ship drawn (`spec`) at frame 0, its bob included, in world units: what the
 * start pose fits in when a crew is drawn (camera/pose.ts startPose `extra`). Empty without a ship.
 */
export function shipCorners(model: SystemModel, spec: ShipSpec | null): Vec3[] {
  return spec ? boxCorners(placeShip(model, 0), spec, 0, 0.07) : [];
}

/** The corners of the box round `spec` at a placement and loop time, `bob` design units taller each way. */
function boxCorners(at: ShipPlacement, spec: ShipSpec, t: number, bob: number): Vec3[] {
  const { lo, hi } = shipBounds(spec, 0), out: Vec3[] = [];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1] - bob, hi[1] + bob]) for (const z of [lo[2], hi[2]]) out.push(shipPoint(at, [x, y, z], t));
  return out;
}

/**
 * Where the "+N" label goes (#207): under the ship's axis, at the bottom of its box as seen at this frame (its
 * flame at the longest, its feet), so the label never covers the ship. In device px of a W×H view; null when
 * any of the box is behind the eye.
 */
export function belowShip(model: SystemModel, spec: ShipSpec, frame: number, pose: OrbitPose, W: number, H: number): { x: number; y: number } | null {
  const at = placeShip(model, frame);
  const ps = [...boxCorners(at, spec, loopPhase(frame) * LOOP_SECONDS, 0), at.centre].map((c) => project(pose, c));
  if (ps.some((p) => p === null)) return null;
  const axis = ps.at(-1)!;
  return { x: ((axis.x + 1) / 2) * W, y: ((1 - Math.min(...ps.map((p) => p!.y))) / 2) * H };
}

/** The ship at a frame: its frame-0 spot turned round the star with the planets (the turn startPoseAt makes). */
export function placeShip(model: SystemModel, frame: number, spot: ShipPlacement = shipSpot(model)): ShipPlacement {
  const a = orbitAngle(frame), c = Math.cos(a), s = Math.sin(a), [x, y, z] = spot.centre;
  return { centre: [x * c + z * s, y, z * c - x * s], yaw: spot.yaw + a };
}

/** A design-space point of the ship (idle bob included, its small roll and pitch not) in world units at a placement and loop time. */
export function shipPoint(at: ShipPlacement, p: Vec, t: number): Vec3 {
  const c = Math.cos(at.yaw), s = Math.sin(at.yaw);
  const x = p[0] * SHIP_SCALE, y = (p[1] + idleAt(t).bob) * SHIP_SCALE, z = p[2] * SHIP_SCALE;
  return [at.centre[0] + x * c + z * s, at.centre[1] + y, at.centre[2] - x * s + z * c];
}

/** A design-space direction turned to world. */
export function shipDirection(at: ShipPlacement, n: Vec): Vec3 {
  const c = Math.cos(at.yaw), s = Math.sin(at.yaw);
  return [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
}

/** Each seat's porthole as a world circle at a placement and loop time: what clicking a crew member hits. */
export function portholes(spec: ShipSpec, at: ShipPlacement, t: number): { centre: Vec3; normal: Vec3; radius: number }[] {
  return spec.rims.map((r) => ({ centre: shipPoint(at, r.c, t), normal: shipDirection(at, r.n), radius: r.R * SHIP_SCALE }));
}

/**
 * The selected crew member's porthole as screen boxes over one idle cycle from `frame` (its bob), in window
 * CSS px, for the panel's dock (drones/dock.ts): the panel docks where it keeps the person you clicked in
 * view. `screen` is the view canvas's box in the window. Empty when the seat has no porthole or is behind the eye.
 */
export function seatTrack(model: SystemModel, spec: ShipSpec, seat: number, frame: number, pose: OrbitPose, screen: Rect): Rect[] {
  const at = placeShip(model, frame);
  const step = (CYCLE * FPS) / TRACK_SAMPLES;
  return Array.from({ length: TRACK_SAMPLES }, (_, k) => frame + k * step).flatMap((f) => {
    const hole = portholes(spec, at, loopPhase(f) * LOOP_SECONDS)[seat];
    const p = hole ? project(pose, hole.centre) : null;
    if (!hole || !p) return [];
    const r = projectedRadius(hole.radius, p.depth, fovOf(pose)) * (screen.h / 2);
    const x = screen.x + ((p.x + 1) / 2) * screen.w, y = screen.y + ((1 - p.y) / 2) * screen.h;
    return [{ x: x - r, y: y - r, w: 2 * r, h: 2 * r }];
  });
}
/** Points of a porthole's track per idle cycle. */
const TRACK_SAMPLES = 8;
