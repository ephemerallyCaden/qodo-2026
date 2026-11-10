// Camera maths, pure (no three.js, no DOM), so picking, labels and the renderer share one
// projection and tests can check it. Internally a pose is an orbit pose { target, yaw, pitch, dist };
// the contract's CameraPose (position, target, fovDeg) is what crosses the render hook.
import type { CameraPose } from '../../../src/core/contract/api.js';
import { TURNS } from '../model/motion.js';
import { planetCentre, planetReach, type SystemModel } from '../model/system.js';
import { add, cross, dot, lerp, length, scale, sub, type Sphere, type Vec3 } from '../model/vec.js';

/** The asset viewer's perspective camera. */
export const FOV_DEG = 35;
/** Frames are 16:9 at every pixel height (asset viewer frameWidth). */
export const ASPECT = 16 / 9;
/** Planet focus: the planet fills this share of frame height (art-direction §6: 42–50%). */
export const FOCUS_FILL = 0.45;
export const NEAR = 0.05;
export const FAR = 1200;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

/** fovDeg: vertical field of view, FOV_DEG when absent (a render-hook caller may set another). */
export interface OrbitPose { target: Vec3; yaw: number; pitch: number; dist: number; fovDeg?: number }

const tanHalfV = (fovDeg: number = FOV_DEG) => Math.tan((fovDeg * Math.PI) / 360);
/** A pose's vertical field of view in degrees. */
export const fovOf = (p: OrbitPose): number => p.fovDeg ?? FOV_DEG;

export const clampPitch = (p: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

/** Yaw and pitch of the direction from a target back to the eye; `fallback` when they coincide. */
function anglesOf(back: Vec3, fallback: { yaw: number; pitch: number }): { yaw: number; pitch: number; dist: number } {
  const d = length(back);
  if (!(d > 1e-9)) return { ...fallback, dist: 0 };
  return { yaw: Math.atan2(back[0], back[2]), pitch: clampPitch(Math.asin(back[1] / d)), dist: d };
}

/** A placeholder pose (the rig's, before any layout loads): 20 units back, slightly above. */
export const PARKED_POSE: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0.4, dist: 20 };

/** The view basis: yaw 0 puts the eye on the +z side looking toward -z. Matches three's lookAt with +y up. */
export function basis(yaw: number, pitch: number): { fwd: Vec3; right: Vec3; up: Vec3; back: Vec3 } {
  const cp = Math.cos(pitch);
  const back: Vec3 = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  const fwd = scale(back, -1);
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  return { fwd, right, up: cross(right, fwd), back };
}

export const eyeOf = (p: OrbitPose): Vec3 => add(p.target, scale(basis(p.yaw, p.pitch).back, p.dist));

export function toCameraPose(p: OrbitPose): CameraPose {
  return { position: eyeOf(p), target: [...p.target], fovDeg: fovOf(p) };
}

/** The orbit pose of a contract pose. A degenerate pose (eye on the target) looks down -z from 1 unit back. */
export function fromCameraPose(c: CameraPose): OrbitPose {
  const a = anglesOf(sub(c.position, c.target), { yaw: 0, pitch: 0 });
  return { target: [...c.target], yaw: a.yaw, pitch: a.pitch, dist: a.dist > 0 ? a.dist : 1, fovDeg: c.fovDeg };
}

/** The distance at which a sphere of radius r fills `fill` of the frame height. */
export const framingDistance = (r: number, fill: number, fovDeg: number = FOV_DEG): number => r / (fill * tanHalfV(fovDeg));

/** The start pose fits every body inside this share of the frame (NDC), leaving room for labels. */
const START_FIT = { x: 0.92, y: 0.85 } as const;

/**
 * The view's start pose: 28° above the orbit plane, looking at the middle of the system's bodies
 * (each planet with its moons, the star, the moonlet orbit), as close as they all fit START_FIT at
 * frame 0, found by bisection. Planets hold still (TURNS.orbits is 0); if they orbit, whole orbits
 * are fitted instead. A star alone fills 45% of the frame height, like a focused planet.
 */
export function startPose(model: SystemModel): OrbitPose {
  const pts: Vec3[] = [];
  const sphere = (c: Vec3, r: number) => {
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as Vec3[]) pts.push(add(c, scale(d, r)));
  };
  const circle = (r: number, h: number) => {
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push([Math.cos(a) * r, h, Math.sin(a) * r], [Math.cos(a) * r, -h, Math.sin(a) * r]); }
  };
  sphere([0, 0, 0], model.star.radius);
  if (model.star.moonlets.length) circle(model.star.moonlets[0]!.orbit, 0);
  for (const p of model.planets) {
    if (TURNS.orbits === 0) sphere(planetCentre(p, 0), planetReach(p));
    else circle(p.orbit + planetReach(p), planetReach(p));
  }
  let pose: OrbitPose = { target: [0, 0, 0], yaw: 0.35, pitch: (28 * Math.PI) / 180, dist: 1 };
  // a star alone (no planets) is framed like a focused planet, so the frame is never near-empty
  if (model.planets.length === 0) return { ...pose, dist: framingDistance(model.star.radius, FOCUS_FILL) };
  const fit = (p: OrbitPose): OrbitPose => {
    const fits = (dist: number) => pts.every((pt) => {
      const q = project({ ...p, dist }, pt);
      return q !== null && Math.abs(q.x) <= START_FIT.x && Math.abs(q.y) <= START_FIT.y;
    });
    let lo = 0, hi = Math.max(1, model.extent) * 64;
    for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    return { ...p, dist: hi };
  };
  // Fit, then re-aim at the middle of what the frame shows and fit again, so a lopsided system
  // (every planet on one side of the star) isn't framed loosely. A fixed number of rounds: deterministic.
  for (let round = 0; round < 4; round++) {
    pose = fit(pose);
    const ndc = pts.map((pt) => project(pose, pt)).filter((q) => q !== null);
    const centre = (k: 'x' | 'y') => (Math.min(...ndc.map((q) => q[k])) + Math.max(...ndc.map((q) => q[k]))) / 2;
    const b = basis(pose.yaw, pose.pitch), tanV = tanHalfV(fovOf(pose)) * pose.dist;
    pose = { ...pose, target: add(pose.target, add(scale(b.right, centre('x') * tanV * ASPECT), scale(b.up, centre('y') * tanV))) };
  }
  return fit(pose);
}

/** The pose that frames a body of `radius` at `centre`, seen from the current eye's direction. */
export function focusPose(current: OrbitPose, centre: Vec3, radius: number): OrbitPose {
  const { yaw, pitch } = anglesOf(sub(eyeOf(current), centre), current);
  return { ...current, target: [...centre], yaw, pitch, dist: framingDistance(radius, FOCUS_FILL, fovOf(current)) };
}

/** Blends two poses: target linearly, distance in log space, yaw the short way round. */
export function lerpPose(a: OrbitPose, b: OrbitPose, u: number): OrbitPose {
  let dy = (b.yaw - a.yaw) % (Math.PI * 2);
  if (dy > Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  return {
    target: [lerp(a.target[0], b.target[0], u), lerp(a.target[1], b.target[1], u), lerp(a.target[2], b.target[2], u)],
    yaw: a.yaw + dy * u,
    pitch: lerp(a.pitch, b.pitch, u),
    dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)),
    fovDeg: lerp(fovOf(a), fovOf(b), u),
  };
}

/** A world point in normalised device coordinates (x right, y up, -1..1), or null behind the eye. */
export function project(p: OrbitPose, point: Vec3): { x: number; y: number; depth: number } | null {
  const b = basis(p.yaw, p.pitch);
  const rel = sub(point, eyeOf(p));
  const z = dot(rel, b.fwd);
  if (z <= NEAR) return null;
  const tanV = tanHalfV(fovOf(p));
  return { x: dot(rel, b.right) / (z * tanV * ASPECT), y: dot(rel, b.up) / (z * tanV), depth: z };
}

/** Screen radius, as a share of half the frame height, of a sphere of radius r at view depth z. */
export const projectedRadius = (r: number, depth: number, fovDeg: number = FOV_DEG): number => r / (depth * tanHalfV(fovDeg));

/**
 * The body under a point in normalised device coordinates: the nearest sphere the view ray hits,
 * each grown to at least `minNdc` of half the frame height so a far planet is still clickable.
 * `blockers` (the star) hide what is behind them but are never picked.
 */
export function pick(p: OrbitPose, ndc: { x: number; y: number }, bodies: readonly Sphere[], blockers: readonly Sphere[] = [], minNdc = 0.04): number | null {
  const b = basis(p.yaw, p.pitch);
  const tanV = tanHalfV(fovOf(p));
  const eye = eyeOf(p);
  const ray = add(b.fwd, add(scale(b.right, ndc.x * tanV * ASPECT), scale(b.up, ndc.y * tanV)));
  const dir = scale(ray, 1 / length(ray));
  /** Distance along the ray to where it enters the sphere, or Infinity on a miss. */
  const enter = (s: Sphere, grow: boolean) => {
    const oc = sub(s.centre, eye);
    const t = dot(oc, dir);
    if (t <= NEAR) return Infinity;
    const r = grow ? Math.max(s.radius, minNdc * t * tanV) : s.radius;
    const miss = dot(oc, oc) - t * t;
    return miss > r * r ? Infinity : t - Math.sqrt(r * r - miss);
  };
  let best: number | null = null, bestT = Infinity;
  bodies.forEach((body, i) => {
    const t = enter(body, true);
    if (t < bestT) { bestT = t; best = i; }
  });
  if (blockers.some((s) => enter(s, false) < bestT)) return null;
  return best;
}
