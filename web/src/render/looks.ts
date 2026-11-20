// What each health-band look draws, by palette role (art-direction §6, asset viewer BIOMES and
// WEATHER). Colours are always palette roles, never literals (AGENTS.md Rule 5).
import { palette, type Hex, type Ramp } from '../../../src/core/palette.js';
import type { Look } from '../model/system.js';
import { LOOK_ID } from './shaders.js';

const w = palette.world;

export interface Weather {
  ramp: Ramp;
  /** Share of the visible disc the weather hides; `gain` converts site share to disc share. */
  cover: number;
  gain: number;
  /** Gap between the surface and the puff bases. */
  float: number;
  mass: number;
  size: number;
  lift: number;
  strays: number;
  flat: number;
  stretch: number;
  /** Lava smoke: short plumes rise only off the glowing fissures. */
  fissure: boolean;
}

export interface LookSpec {
  id: number;
  /** uA, uB, uC (5 steps; short ramps repeat their last colour) and uG (3 steps). */
  ramps: readonly [Ramp, Ramp, Ramp, Ramp];
  /** Sea level range; the planet's seed picks a level in it. */
  sea: readonly [number, number];
  weather: Weather | null;
  haze: Hex | null;
}

const base = { float: 0, mass: 2.0, size: 1, lift: 1, strays: 0, flat: 0.6, stretch: 1, fissure: false };
const CLOUD: Weather = { ...base, ramp: w.cloud, cover: 0.27, gain: 0.57, float: 0.055, strays: 0.012 }; // Planetarium: ~25–30%
const THIN: Weather = { ...base, ramp: w.cloud, cover: 0.27, gain: 0.63, float: 0.05, mass: 2.2, size: 0.7, lift: 0.5, strays: 0.012 };
const SPORE: Weather = { ...base, ramp: w.spore, cover: 0.27, gain: 0.62, float: 0.05, mass: 2.2, size: 0.7, lift: 1.1, strays: 0.05 };
const ASH: Weather = { ...base, ramp: w.ash, cover: 0.08, gain: 0.3, size: 0.45, lift: 0.3, flat: 0.3, stretch: 3.0, fissure: true }; // light, low, streaky smoke

export const LOOKS: Readonly<Record<Look, LookSpec>> = {
  lush: { id: LOOK_ID.lush, ramps: [w.ocean, w.land, w.cap, w.glow], sea: [0.47, 0.55], weather: CLOUD, haze: null },
  ocean: { id: LOOK_ID.ocean, ramps: [w.water, w.land, w.cap, w.glow], sea: [0.7, 0.73], weather: THIN, haze: w.haze.ocean },
  ice: { id: LOOK_ID.ice, ramps: [w.ice, w.crevasse, w.water, w.glow], sea: [0.5, 0.5], weather: null, haze: w.haze.ice },
  toxic: { id: LOOK_ID.toxic, ramps: [w.sludge, w.toxic, w.fungus, w.glow], sea: [0.5, 0.56], weather: SPORE, haze: w.haze.toxic },
  desert: { id: LOOK_ID.desert, ramps: [w.sand, w.rock, w.cap, w.glow], sea: [0.5, 0.5], weather: null, haze: null },
  lava: { id: LOOK_ID.lava, ramps: [w.crust, w.crust, w.ash, w.glow], sea: [0.5, 0.5], weather: ASH, haze: null },
};
