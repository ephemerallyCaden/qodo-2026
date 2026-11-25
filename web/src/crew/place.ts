// Where the crew's ship is (#207 C4), as a pure function of (model, frame): no clock, no random (AGENTS.md
// Rule 3). There is one ship per system and nothing about it varies, so it has no seed: its place comes
// from the layout alone, and stays put between scans unless the bodies near it change.
//
// It hovers beside the star, on the start pose's right (camera/pose.ts startPose), past the star's drone
// lane, and high enough above the orbit plane that no planet, moon or planet drone passes through it. It
// faces the start pose's camera, so the crew in its front portholes shows. Like the start pose, it turns
// round the star with the planets (one constant rate, model/motion.ts orbitAngle), so Home always sees its
// front and it keeps its place among the planets.
import { fovOf, project, projectedRadius, startPose, type OrbitPose } from '../camera/pose.js';
import { DRONE_LANE_OUT, DRONE_PICK_RADIUS, homeBody } from '../drones/place.js';
import type { Rect } from '../labels/place.js';
import { FPS, LOOP_SECONDS, loopPhase, orbitAngle } from '../model/motion.js';
import { planetReach, type SystemModel } from '../model/system.js';
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
 * lane, on the start pose's right; its height lifts its lowest point clear of every planet's reach plus its
 * drones' lane wherever the footprint crosses that planet's orbit.
 */
export function shipSpot(model: SystemModel): ShipPlacement {
  const start = startPose(model);
  const right: Vec3 = [Math.cos(start.yaw), 0, -Math.sin(start.yaw)];
  const star = homeBody(model, 'star', 0)!;
  const d = star.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS + SHIP_MARGIN + SHIP_FOOTPRINT;
  const inner = d - SHIP_FOOTPRINT, outer = d + SHIP_FOOTPRINT;
  let floor = SHIP_MARGIN;
  for (const p of model.planets) {
    const clear = planetReach(p) + DRONE_LANE_OUT + DRONE_PICK_RADIUS + SHIP_MARGIN;
    const gap = Math.max(0, p.orbit - outer, inner - p.orbit);
    if (gap < clear) floor = Math.max(floor, Math.sqrt(clear * clear - gap * gap) + SHIP_MARGIN);
  }
  const bob = 0.07 * SHIP_SCALE; // idleAt's largest bob
  return { centre: [right[0] * d, floor - SHIP_BOTTOM + bob, right[2] * d], yaw: start.yaw };
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
