// The one scene both builds render: the asset viewer's hero lush planet (seed 7, clouds, thin
// ring, two moons) with the three-astronaut crew in front, seen from the viewer's depth-view
// camera. The viewer's depth copies and solo astronauts are hidden so only this scene shows.
// Pure data and maths (no three.js, no DOM): shared by the defaults page and render.mjs.

export const CAMERA = { fov: 35, pos: [0.1, 1.2, 9.6], target: [-0.3, 0.3, -6] }; // viewer VIEWS.depth
export const STILL_TIME = 0; // seconds into the loop for the stills: at 0 (and every 12 s) eased and constant motion agree, so both builds show the same pose

// Asset-viewer state for the house render: its shipped defaults, pinned time, UI hidden.
export const HOUSE_STATE = { view: 'depth', time: STILL_TIME, ui: false, seed: 7, biome: 'lush', size: 1, ringMode: 'thin', moons: true, spin: true };

// Layout copied from viewer.js so the defaults build places the same things in the same spots.
export const LIGHT_DIR = [-0.3, 0.55, 0.78]; // viewer LIGHT_DIR (normalised where used)
export const RING = { inner: 1.69, width: 0.22, tilt: [0.2, 0, -0.32] }; // RING_PRESETS.thin, ringTilt
export const MOONS = [ // viewer MOONS
  { size: 0.11, orbit: 1.75, incl: 0.34, yaw: 0.25, offset: 0.15 },
  { size: 0.062, orbit: 1.36, incl: 0.5, yaw: -0.4, offset: 0.62 },
];
export const CREW_SPOT = [-1.35, -0.2, 4.6];
export const CREW = ['coral', 'mint', 'lilac'].map((color, i) => ({
  color, pos: [CREW_SPOT[0] + (i - 1) * 0.72, CREW_SPOT[1], CREW_SPOT[2]], yaw: [0.4, 0.05, -0.4][i], phase: i * 1.7,
}));
export const FIGURE = { height: 0.95, lift: 0.03 }; // astronaut.js SCALE, LIFT

// ---------------------------------------------------------------- motion
// The house loop (viewer LOOP): 24 s, surface 2 turns, clouds 3, moons once per surface turn,
// all at constant rates. Angles in radians, negative = right to left like the viewer.
export const LOOP = { period: 24, surfaceTurns: 2, cloudTurns: 3 };
const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);

export const constantMotion = (t) => {
  const phase = frac(t / LOOP.period);
  const turn = phase * TAU * LOOP.surfaceTurns;
  return { spin: -turn, clouds: -phase * TAU * LOOP.cloudTurns, moon: turn };
};

// What an agent writes by default: a repeating tween per layer, e.g.
//   gsap.to(planet.rotation, { y: -2 * Math.PI, duration: 12, repeat: -1 })
// whose default ease is power1.out (fast start, slow finish, then a jump back to full speed on
// every repeat), and moons on a sine.inOut tween. Same periods as the house loop.
export const power1Out = (x) => 1 - (1 - x) * (1 - x);
export const sineInOut = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const tween = (t, duration, ease) => { const k = t / duration; return Math.floor(k) + ease(frac(k)); };
export const easedMotion = (t) => {
  const surfaceTurn = LOOP.period / LOOP.surfaceTurns, cloudTurn = LOOP.period / LOOP.cloudTurns;
  return { spin: -tween(t, surfaceTurn, power1Out) * TAU, clouds: -tween(t, cloudTurn, power1Out) * TAU, moon: tween(t, surfaceTurn, sineInOut) * TAU };
};

/** Min and max angular speed (rad/s) of a motion channel over one loop, sampled at `fps`. */
export function speedRange(motion, key, fps = 100) {
  const n = LOOP.period * fps;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = i / fps, t1 = (i + 1) / fps;
    const d = (((motion(t1)[key] - motion(t0)[key]) % TAU) + TAU + Math.PI) % TAU - Math.PI; // shortest way round: a loop wrap is not a jump
    const v = Math.abs(d) * fps;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

/** Seeded PRNG (the viewer's mulberry32), so the defaults build is deterministic too. */
export const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
