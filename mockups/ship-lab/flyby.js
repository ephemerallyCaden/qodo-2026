// The fly-by: the crew's ship flying past a still camera near your star (the Day 18 hype shot), v2:
// nose first. The ship flies on its side, rolled in the camera's view plane so its nose points along
// its travel on screen (left to right: the nose right, the flame trailing left) while its portholes
// keep facing the camera; every rider is turned back upright (ship.js setUpright). The path is a pure
// function of the frame number at the lab's stepped clock (frame k at t0 + k / fps): empty stars, a
// fast entry from the left, a slow glide across the middle on a gentle climbing arc, a fast exit to
// the right, then empty stars again. Its own idle motion (bob, sway, the lively flame and its puffs,
// the crew's bob and blinks) runs on top. Pure: no three.js, no clock, no random numbers.
// (v1, the ship upright and leaning into its travel, is at d6b1cfb.)

export const FLYBY = {
  v: 'R2-4c-final', n: 6, // the pick, the captain plus five teammates
  fps: 20, frames: 120, // 6 s
  t0: 8.0, // the lab clock at frame 0: three blinks while aboard is on screen (seat 1 at 9.67, the captain at 12.0, seat 5 at 12.36)
  hold: [10, 10], // frames of empty stars before and after the pass
  // the pass, laid out on screen at the internal 320x180: the ship's middle (mid, design units up its
  // axis) runs at x = 160 + X e and y = y0 - climb (e + e^2 / 2), with e = a s + (1 - a) s^3 (slow
  // through the middle), s in [-1, 1]: level as it enters, climbing gently through the middle and a
  // little more as it leaves. Its distance from the camera swoops from `far` to `near` and back.
  X: 290, a: 0.12, y0: 98, climb: 20, near: 4.7, far: 10.5, mid: 2.5,
  bank: 0.06, // rad: a roll about its own axis across the middle (its top tips toward the camera)
  // design units: how far back each rider sits once turned upright, so its boots stay inside the hull
  // (ship.js setUpright): the captain's body runs round the upper dome, the teammates' round the barrel
  sink: [0.32, 0.14],
  camera: { at: [0, 2.43, 7.0], look: [0, 1.6, 2.15] }, // 0.17 rad down, as the lab's close-ups
  fov: 35, aspect: 16 / 9, w: 320, h: 180,
  star: [-7.2, 2.6, -16], // upper left, clear of the pass
  // two of your drones in the middle distance, drifting a little (one whole sine over the shot)
  drones: [{ i: 0, at: [3.6, 3.0, -4.6], drift: [-0.25, -0.08, 0] }, { i: 1, at: [-3.4, -0.1, -3.8], drift: [0.2, 0.12, 0] }],
};

const ease = (s, a) => a * s + (1 - a) * s * s * s;
const sub = (p, q) => p.map((x, i) => x - q[i]);
const dot = (p, q) => p.reduce((acc, x, i) => acc + x * q[i], 0);
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit = (p) => { const l = Math.hypot(...p); return p.map((x) => x / l); };
const along = (p, d, k) => p.map((x, i) => x + d[i] * k);

/** The camera's frame: forward, right and up (world unit vectors), as three's lookAt builds it. */
export function cameraFrame(f = FLYBY) {
  const fw = unit(sub(f.camera.look, f.camera.at));
  const right = unit(cross(fw, [0, 1, 0]));
  return { fw, right, up: cross(right, fw) };
}
/** A world point -> internal px [x, y] (y down) and its depth along the camera's forward. */
export function project(p, f = FLYBY) {
  const { fw, right, up } = cameraFrame(f);
  const d = sub(p, f.camera.at), z = dot(d, fw), tan = Math.tan((f.fov * Math.PI) / 360);
  return [f.w / 2 + (dot(d, right) / (z * tan * f.aspect)) * (f.w / 2), f.h / 2 - (dot(d, up) / (z * tan)) * (f.h / 2), z];
}
/** The world point at internal px (x, y), dist from the camera along its ray. */
function unproject(x, y, dist, f) {
  const { fw, right, up } = cameraFrame(f), tan = Math.tan((f.fov * Math.PI) / 360);
  const ray = unit(along(along(fw, right, ((x - f.w / 2) / (f.w / 2)) * tan * f.aspect), up, ((f.h / 2 - y) / (f.h / 2)) * tan));
  return along(f.camera.at, ray, dist);
}

/** The pass parameter at frame k: null before or after the pass, else s in [-1, 1]. */
export function passAt(k, f = FLYBY) {
  const n = f.frames - f.hold[0] - f.hold[1];
  const j = k - f.hold[0];
  if (j < 0 || j > n - 1) return null;
  return (2 * j) / (n - 1) - 1;
}

/** The lab clock at frame k (s). */
export const timeAt = (k, f = FLYBY) => f.t0 + k / f.fps;

/** The ship's middle at pass parameter s: on screen [x, y] (internal px) and in the world. */
export function middleAt(s, f = FLYBY) {
  const e = ease(s, f.a);
  const x = f.w / 2 + f.X * e, y = f.y0 - f.climb * (e + (e * e) / 2);
  return { screen: [x, y], world: unproject(x, y, f.near + (f.far - f.near) * s * s, f) };
}

/**
 * The ship's placement at frame k: { visible, p, axes: { x, y, z } } (world; the root group's position
 * and its local axes in the world, a rotation matrix's columns). Its front (+z, the portholes) faces
 * the camera; its nose (+y) points along its travel on screen: the travel with its part along the line
 * of sight taken out, which projects to the same direction on screen. Then the bank about the nose.
 * Also { travel, s }: the travel's screen direction (rad, y up) and the pass parameter.
 */
export function shipAt(k, f = FLYBY) {
  const s = passAt(k, f);
  if (s === null) return { visible: false, p: [0, 0, 0], axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, travel: 0, s };
  const m = middleAt(s, f), e = 1e-4;
  const v = sub(middleAt(Math.min(1, s + e), f).world, middleAt(Math.max(-1, s - e), f).world);
  const z0 = unit(sub(f.camera.at, m.world));
  const y0 = unit(along(v, z0, -dot(v, z0)));
  // the bank: a turn about the nose (y), its top (screen up, the ship's -x) tipping toward the camera
  const b = f.bank * (1 - s * s), x0 = cross(y0, z0);
  const x = along(x0.map((c) => c * Math.cos(b)), z0, -Math.sin(b));
  const z = cross(x, y0);
  const a = middleAt(Math.min(1, s + e), f).screen, c = middleAt(Math.max(-1, s - e), f).screen;
  return { visible: true, p: along(m.world, y0, -f.mid * 0.6), axes: { x, y: y0, z }, travel: Math.atan2(c[1] - a[1], a[0] - c[0]), s };
}

/** Drone d's position at frame k. */
export function droneAt(d, k, f = FLYBY) {
  const w = Math.sin((2 * Math.PI * k) / f.frames);
  return d.at.map((c, i) => c + d.drift[i] * w);
}

/** The shot's beats, in frames, for the report. */
export function beats(f = FLYBY) {
  const n = f.frames - f.hold[0] - f.hold[1];
  const at = (s) => f.hold[0] + Math.round(((s + 1) / 2) * (n - 1));
  return [
    { what: 'empty stars, the star and two drones', from: 0, to: f.hold[0] - 1 },
    { what: 'the ship enters from the left, nose first, fast, the flame and its puffs trailing', from: f.hold[0], to: at(-0.45) - 1 },
    { what: 'the glide: it slows across the middle on a gentle climb, portholes to the camera, the crew upright', from: at(-0.45), to: at(0.45) },
    { what: 'it speeds off to the right, climbing a little', from: at(0.45) + 1, to: f.frames - f.hold[1] - 1 },
    { what: 'empty stars again', from: f.frames - f.hold[1], to: f.frames - 1 },
  ];
}
