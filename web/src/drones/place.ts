// Where a drone is, as a pure function of (model, session seed and home, frame): it circles its home
// body at a constant rate, starting from a seeded phase on a seeded, slightly tilted orbit (art-direction
// §6 / AGENTS.md Rule 4: a fixed rate times time, no easing). No clock, no random: a frame number only.
import { turnAngle } from '../model/motion.js';
import { mulberry32 } from '../model/prng.js';
import { MOONLET_RADIUS, planetCentre, planetReach, type SystemModel } from '../model/system.js';
import { type Vec3 } from '../model/vec.js';

/** Whole turns round its home per 24 s loop. */
export const DRONE_TURNS = 2;
/** One drone's size (render units per lab unit); a drone is about half an astronaut. */
export const DRONE_SCALE = 0.8;
/** How far past its home body's reach (moons included) a drone's orbit sits. */
const CLEARANCE = 0.35;
/** The orbit radius spread, so drones of one home don't share a lane. */
const LANE = 0.15;
/** The most an orbit plane tilts from the system's plane (radians). */
const MAX_TILT = 0.35;
/** A drone's picking radius: its body (about 0.2 lab units across) plus the drift and bob that move it off its orbit's centre. */
export const DRONE_PICK_RADIUS = 0.35 * DRONE_SCALE;

export interface DronePlacement {
  centre: Vec3;
  /** Yaw (about +y) that turns the drone's +z face outward from its home. */
  yaw: number;
}

/** The body a drone circles: its centre and the radius its orbit clears, or null when the home isn't in this layout. */
export function homeBody(model: SystemModel, home: string, frame: number): { centre: Vec3; reach: number } | null {
  if (home === 'star') {
    const moonlets = model.star.moonlets;
    return { centre: [0, 0, 0], reach: moonlets.length > 0 ? moonlets[0]!.orbit + MOONLET_RADIUS : model.star.radius };
  }
  const p = model.planets.find((x) => x.dirId === home);
  return p ? { centre: planetCentre(p, frame), reach: planetReach(p) } : null;
}

export function placeDrone(model: SystemModel, home: string, seed: number, frame: number): DronePlacement | null {
  const body = homeBody(model, home, frame);
  if (!body) return null;
  const r = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const phase = r(), node = r() * Math.PI * 2, tilt = (r() * 2 - 1) * MAX_TILT, lane = r();
  const radius = body.reach + CLEARANCE + LANE * lane;
  const a = phase * Math.PI * 2 + turnAngle(frame, DRONE_TURNS);
  const u: Vec3 = [Math.cos(node), 0, -Math.sin(node)];
  const w: Vec3 = [Math.sin(node) * Math.cos(tilt), Math.sin(tilt), Math.cos(node) * Math.cos(tilt)];
  const off: Vec3 = [0, 1, 2].map((i) => radius * (Math.cos(a) * u[i]! + Math.sin(a) * w[i]!)) as Vec3;
  return {
    centre: [body.centre[0] + off[0], body.centre[1] + off[1], body.centre[2] + off[2]],
    yaw: Math.atan2(off[0], off[2]),
  };
}
