// The fly-by: the crew's ship flying past a still camera near your star (the Day 18 hype shot). The
// path is a pure function of the frame number at the lab's stepped clock (frame k at t0 + k / fps):
// empty stars, a fast entry from the left, a slow glide across the middle facing the camera, a fast
// exit to the right, then empty stars again. The ship leans into its travel (more when it's fast),
// turns its portholes toward the camera as it passes and banks a little; its own idle motion (bob,
// sway, flame, the crew's bob and blinks) runs on top, as in every other lab shot. Pure: no three.js,
// no clock, no random numbers.

export const FLYBY = {
  v: 'R2-4c-final', n: 6, // the pick, the captain plus five teammates
  fps: 20, frames: 120, // 6 s
  t0: 8.0, // the lab clock at frame 0: three blinks while aboard is on screen (seat 1 at 9.67, the captain at 12.0, seat 5 at 12.36)
  hold: [10, 10], // frames of empty stars before and after the pass
  // the pass: x from -X to +X with a slow middle (x = X (a s + (1 - a) s^3), s in [-1, 1]); y rises by
  // rise over the pass; z swoops in from zEnd to `near` from the camera at the middle and back out
  X: 7.4, a: 0.12, rise: 0.5, near: 4.85, zEnd: -3,
  lean: [0.1, 0.32], // rad: the lean into travel at the slowest and the fastest
  turn: 0.5, // how much of the bearing to the camera the ship turns to (0: none, 1: always faces it)
  bank: 0.07, // rad: the top dips toward the camera across the middle
  camera: { at: [0, 2.43, 7.0], look: [0, 1.6, 2.15] }, // 0.17 rad down at the close pass, as the lab's close-ups: the captain's face shows under the cap
  star: [-7.2, 2.6, -16], // upper left, clear of the pass
  // two of your drones in the middle distance, drifting a little (one whole sine over the shot)
  drones: [{ i: 0, at: [3.6, 3.0, -4.6], drift: [-0.25, -0.08, 0] }, { i: 1, at: [-3.4, -0.1, -3.8], drift: [0.2, 0.12, 0] }],
};

const ease = (s, a) => a * s + (1 - a) * s * s * s;
const speed = (s, a) => a + 3 * (1 - a) * s * s; // d ease / ds

/** The pass parameter at frame k: null before or after the pass, else s in [-1, 1]. */
export function passAt(k, f = FLYBY) {
  const n = f.frames - f.hold[0] - f.hold[1];
  const j = k - f.hold[0];
  if (j < 0 || j > n - 1) return null;
  return (2 * j) / (n - 1) - 1;
}

/** The lab clock at frame k (s). */
export const timeAt = (k, f = FLYBY) => f.t0 + k / f.fps;

/**
 * The ship's placement at frame k: { visible, p: [x, y, z], yaw, bank, lean } (world units, rad; the
 * root group's rotation in 'ZXY' order: yaw about the ship's own axis, then the bank, then the lean).
 */
export function shipAt(k, f = FLYBY) {
  const s = passAt(k, f);
  if (s === null) return { visible: false, p: [0, 0, 0], yaw: 0, bank: 0, lean: 0 };
  const zc = f.camera.at[2] - f.near;
  const x = f.X * ease(s, f.a), y = (f.rise * s) / 2, z = zc - (zc - f.zEnd) * s * s;
  const v = speed(s, f.a) / speed(1, f.a); // 0..1 of the fastest
  const [cx, , cz] = f.camera.at;
  const lean = -(f.lean[0] + (f.lean[1] - f.lean[0]) * v); // negative z: the top leans toward +x, the way it flies
  return { visible: true, p: [x, y, z], yaw: f.turn * Math.atan2(cx - x, cz - z), bank: f.bank * (1 - s * s), lean };
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
    { what: 'the ship enters from the left, fast, leaning into its travel', from: f.hold[0], to: at(-0.45) - 1 },
    { what: 'the glide: it slows across the middle, portholes to the camera, banking a little', from: at(-0.45), to: at(0.45) },
    { what: 'it speeds off to the right', from: at(0.45) + 1, to: f.frames - f.hold[1] - 1 },
    { what: 'empty stars again', from: f.frames - f.hold[1], to: f.frames - 1 },
  ];
}
