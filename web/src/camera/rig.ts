// Camera rigs: how input moves the camera. The view only talks to the `CameraRig` interface, so
// another rig (ortho snapped, a scripted path) can replace free flight without touching the
// renderer (R4: the camera module stays pluggable). Pure: input arrives as plain values, and the
// caller passes elapsed milliseconds, so this module reads no clock.
import { add, scale, sub, type Sphere, type Vec3 } from '../model/vec.js';
import { basis, clampPitch, eyeOf, focusDistance, focusPose, lerpPose, type OrbitPose } from './pose.js';

export type FlyKey = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down';

export interface RigInput {
  /** Pointer drag since the last step, in CSS px. */
  drag?: [number, number];
  /** Wheel delta since the last step (DOM deltaY: positive = away). */
  wheel?: number;
  /** Fly keys held down. */
  keys?: ReadonlySet<FlyKey>;
}

export interface CameraRig {
  /** The pose the next frame renders. */
  pose(): OrbitPose;
  /** Jumps to a pose and drops any focus (start pose, test input). */
  reset(pose: OrbitPose): void;
  /** Applies input over `dtMs`; true when the pose changed (so the view must redraw). */
  step(input: RigInput, dtMs: number): boolean;
  /** Focuses a body (null returns to free flight). `cut` jumps; otherwise the camera glides. */
  focus(target: Sphere | null, cut: boolean): void;
  /** Follows the focused body as it moves or resizes (a reload); true when the pose changed. */
  track(body: Sphere): boolean;
  /** True while a glide is running, so the loop keeps drawing until it ends. */
  moving(): boolean;
  /** Ends any glide at its destination now (reduced motion switched on mid-glide: cut, don't glide). */
  settle(): void;
  focused(): boolean;
}

/** Glide length for focus changes; reduced motion cuts instead (AC7). Camera framing, not planetary motion, so it may ease. */
export const GLIDE_MS = 700;
const LOOK_RAD_PER_PX = 0.005;
const WHEEL_ZOOM = 0.0015;
/** Fly speed as a share of the focal distance per second. */
const FLY_RATE = 0.6;
const MIN_FLY_SPEED = 0.5;
/** A focused camera never enters the planet: the clouds reach about 1.1 radii. */
export const MIN_FOCUS_DIST = 1.35;
/** The closest a camera focused on a body of `radius` may come to its centre. */
const zoomLimit = (radius: number) => radius * MIN_FOCUS_DIST;

const smoothstep = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

/**
 * Perspective free flight (human, 2026-11-04). Unfocused, dragging turns the view around the eye,
 * W/S/A/D fly along the view, R/F rise and fall, the wheel moves along the view. Focused, dragging
 * orbits the planet, the wheel zooms, and any fly key returns to free flight.
 */
export class FreeFlightRig implements CameraRig {
  private current: OrbitPose;
  private target: Sphere | null = null;
  private glide: { from: OrbitPose; to: OrbitPose; ms: number } | null = null;

  constructor(start: OrbitPose) { this.current = start; }

  pose(): OrbitPose { return this.current; }
  focused(): boolean { return this.target !== null; }
  moving(): boolean { return this.glide !== null; }
  settle(): void { this.finishGlide(); }

  reset(pose: OrbitPose): void {
    this.current = pose;
    this.target = null;
    this.glide = null;
  }

  focus(target: Sphere | null, cut: boolean): void {
    this.target = target;
    if (!target) { this.glide = null; return; } // free flight from wherever the camera is now
    const to = focusPose(this.current, target.centre, target.radius);
    if (cut) { this.glide = null; this.current = to; return; }
    this.glide = { from: this.current, to, ms: 0 };
  }

  track(body: Sphere): boolean {
    if (!this.target) return false;
    const d = sub(body.centre, this.target.centre);
    const resized = body.radius !== this.target.radius;
    this.target = { centre: body.centre, radius: body.radius }; // the zoom limit follows a resized planet
    // On a resize, a glide (a focus action) re-aims at the framing for the new size, while the
    // user's own framing stays, pushed out at once to the new zoom limit and never pulled in.
    const base = this.glide ? this.glide.to : this.current;
    const dist = !resized ? base.dist : this.glide ? focusDistance(base, body.radius) : Math.max(zoomLimit(body.radius), base.dist);
    if (d[0] === 0 && d[1] === 0 && d[2] === 0 && dist === base.dist) return false;
    const next = { ...base, target: add(base.target, d), dist };
    if (this.glide) this.glide.to = next;
    else this.current = next;
    return true;
  }

  step(input: RigInput, dtMs: number): boolean {
    const keys = input.keys ?? new Set<FlyKey>();
    const drag = input.drag ?? [0, 0];
    const wheel = input.wheel ?? 0;
    const acting = keys.size > 0 || drag[0] !== 0 || drag[1] !== 0 || wheel !== 0;
    if (this.glide) {
      if (acting) this.finishGlide(); // input during a glide cuts to its end, then applies
      else {
        this.glide.ms += dtMs;
        const u = this.glide.ms / GLIDE_MS;
        this.current = lerpPose(this.glide.from, this.glide.to, smoothstep(u));
        if (u >= 1) this.finishGlide();
        return true;
      }
    }
    if (!acting) return false;
    if (keys.size > 0 && this.target) this.target = null; // flying away leaves the focus
    let p = this.current;
    if (this.target) {
      // orbit the focused body
      p = { ...p, yaw: p.yaw - drag[0] * LOOK_RAD_PER_PX, pitch: clampPitch(p.pitch + drag[1] * LOOK_RAD_PER_PX) };
      p = { ...p, dist: Math.max(zoomLimit(this.target.radius), p.dist * Math.exp(wheel * WHEEL_ZOOM)) };
    } else {
      // turn around the eye, then move the eye
      if (drag[0] !== 0 || drag[1] !== 0) {
        const eye = eyeOf(p);
        const yaw = p.yaw - drag[0] * LOOK_RAD_PER_PX;
        const pitch = clampPitch(p.pitch + drag[1] * LOOK_RAD_PER_PX);
        p = { yaw, pitch, dist: p.dist, target: add(eye, scale(basis(yaw, pitch).fwd, p.dist)) };
      }
      const b = basis(p.yaw, p.pitch);
      const speed = Math.max(MIN_FLY_SPEED, p.dist * FLY_RATE) * (dtMs / 1000);
      let move: Vec3 = scale(b.fwd, -wheel * WHEEL_ZOOM * p.dist);
      const axis = (k: FlyKey, v: Vec3, s: number) => { if (keys.has(k)) move = add(move, scale(v, s)); };
      axis('forward', b.fwd, speed);
      axis('back', b.fwd, -speed);
      axis('right', b.right, speed);
      axis('left', b.right, -speed);
      axis('up', [0, 1, 0], speed);
      axis('down', [0, 1, 0], -speed);
      p = { ...p, target: add(p.target, move) };
    }
    this.current = p;
    return true;
  }

  private finishGlide(): void {
    if (this.glide) this.current = this.glide.to;
    this.glide = null;
  }
}
