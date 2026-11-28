// Where a drone is, as a pure function of (model, session seed and home, frame): it circles its home
// body at a constant rate, starting from a seeded phase on a seeded, slightly tilted orbit (art-direction
// §6 / AGENTS.md Rule 4: a fixed rate times time, no easing). No clock, no random: a frame number only.
import { debrisShell } from '../debris/shell.js';
import { FOG_SKY_TOP } from '../model/fog-cloud.js';
import { turnAngle } from '../model/motion.js';
import { mulberry32 } from '../model/prng.js';
import { CORONA } from '../model/star.js';
import { MOONLET_RADIUS, planetCentre, planetReach, type SystemModel } from '../model/system.js';
import { type Vec3 } from '../model/vec.js';

/** Whole turns round its home per loop (motion.ts LOOP_SECONDS): one every 24 s on the 48 s loop. */
export const DRONE_TURNS = 2;
/** One drone's size (render units per lab unit); a drone is about half an astronaut. */
export const DRONE_SCALE = 0.8;
/** How far past its home body's reach (moons included) a drone's orbit sits. */
const CLEARANCE = 0.35;
/** The orbit radius spread, so drones of one home don't share a lane. */
const LANE = 0.15;
/** The most an orbit plane tilts from the system's plane (radians). */
const MAX_TILT = 0.35;
/**
 * How far past its home body's reach a drone's orbit can go (its outermost lane, at any tilt); a drone's
 * own size, drift and bob add DRONE_PICK_RADIUS. The crew's ship (crew/place.ts) keeps clear of both.
 */
export const DRONE_LANE_OUT = CLEARANCE + LANE;
/** A drone's picking radius: its body (about 0.2 lab units across) plus the drift and bob that move it off its orbit's centre. */
export const DRONE_PICK_RADIUS = 0.35 * DRONE_SCALE;

export interface DronePlacement {
  centre: Vec3;
  /** Yaw (about +y) that turns the drone's +z face outward from its home. */
  yaw: number;
}

/**
 * A body as it draws itself, before its debris: its centre, its radius, and the reach of everything it draws, which
 * its debris shell clears (debris/shell.ts). A planet's reach is its moons and weather or its fog sky's top
 * (model/fog-cloud.ts FOG_SKY_TOP: the cloud, its domes past the limb included, or the mist), whichever is further,
 * on every planet whatever its fog now (#224, Qodo 1f87de0f); the star's is its moonlets' orbit, or its corona
 * (model/star.ts CORONA). Null when the home isn't in this layout.
 */
export function homeBase(model: SystemModel, home: string, frame: number): { centre: Vec3; radius: number; reach: number } | null {
  if (home === 'star') {
    const { moonlets, radius } = model.star;
    return { centre: [0, 0, 0], radius, reach: Math.max(moonlets.length > 0 ? moonlets[0]!.orbit + MOONLET_RADIUS : radius, radius * CORONA.reach) };
  }
  const p = model.planets.find((x) => x.dirId === home);
  return p ? { centre: planetCentre(p, frame), radius: p.radius, reach: Math.max(planetReach(p), p.radius * FOG_SKY_TOP) } : null;
}

/**
 * The body a drone circles: its centre and the radius its orbit clears, or null when the home isn't in this
 * layout. That is the reach of what it draws (homeBase), or, on a body drawing debris (R13, `model.debrisHomes`),
 * the outer edge of its debris shell (debris/shell.ts): so a drone never flies through the cloud or the debris, and
 * never moves when a file is charted or refogged. It moves out when a body's first piece of debris comes, and back
 * in when its last one is swept (lead, 2026-11-28: on a rescan only, and the sweep shows why).
 */
export function homeBody(model: SystemModel, home: string, frame: number): { centre: Vec3; reach: number } | null {
  const b = homeBase(model, home, frame);
  if (!b) return null;
  return { centre: b.centre, reach: model.debrisHomes?.includes(home) ? debrisShell(b.reach, b.radius).outer : b.reach };
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
