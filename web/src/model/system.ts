// layout.json → the bodies the view draws, in render units, as plain numbers (no three.js, no DOM).
// Everything that encodes data comes from the layout: planet size (LOC), orbit slot and angle,
// health band, moons, moonlets and every overflow count. Everything else here (moon lanes,
// inclinations, star size, the healthy look) is seeded variety that stays inside one meaning and is
// a pure function of the layout, so appending a moon or a moonlet never moves the others
// (principle 4; contract: append-only slots). No rings: they have no meaning yet (contract amendment
// 2026-11-10), so the view draws none.
import type { HealthBand, LayoutV1, Planet } from '../../../src/core/contract/layout.js';
import { TURNS, turnAngle } from './motion.js';
import { INV_PHI, R2, fract } from './prng.js';
import type { Vec3 } from './vec.js';

/**
 * Layout lengths are world units ×1000; the renderer works in units where a 10-unit planet
 * radius is 1.0, the asset viewer's hero size. The depth fade's distances (art-direction §5) were
 * tuned at that scale, so a focused planet fades exactly as it does in the approved viewer.
 */
export const MILLI_PER_RENDER_UNIT = 10_000;

/** Planet looks (art-direction §6, #19): the band picks the look; ash is the desert look. */
export type Look = 'lava' | 'toxic' | 'desert' | 'lush' | 'ocean' | 'ice';
/** A healthy planet is lush, ocean or ice, picked by biomeSeed: variety inside one meaning (contract). */
export const HEALTHY_LOOKS = ['lush', 'ocean', 'ice'] as const satisfies readonly Look[];

export function lookOf(band: HealthBand, biomeSeed: number): Look {
  switch (band) {
    case 'lava': return 'lava';
    case 'toxic': return 'toxic';
    case 'ash': return 'desert';
    case 'healthy': return HEALTHY_LOOKS[(biomeSeed >>> 0) % HEALTHY_LOOKS.length]!;
  }
}

/** A moon's orbit, in render units around its planet's centre. */
export interface MoonModel { fileId: string; slot: number; orbit: number; incl: number; yaw: number; offset: number }
export interface MoonletModel { fileId: string; slot: number; orbit: number; incl: number; offset: number }

export interface PlanetModel {
  dirId: string;
  path: string;
  band: HealthBand;
  look: Look;
  /** Seeded variety only: terrain, clouds and the healthy look. */
  seed: number;
  radius: number;
  orbit: number;
  /** Frame-0 angle in turns (phaseMilliturn / 1000). */
  phase: number;
  slot: number;
  moons: MoonModel[];
  /** What the view shows as text; overflow is counted, never dropped (Rule 1). */
  counts: {
    loc: number;
    moons: number;
    moonOverflow: number;
    settlements: number;
    surfaceOverflow: number;
    debtUnknownFiles: number;
    /** The band's inputs (art-direction §6 rule 5: explained on demand). */
    markersPerKlocMilli: number;
    qodoOpen: number | null;
    /** No Qodo data: the band comes from debt markers alone. */
    qodoUnknown: boolean;
  };
}

export interface SystemModel {
  star: { radius: number; moonlets: MoonletModel[]; moonletOverflow: number; testData: number };
  planets: PlanetModel[];
  /** Radius of the smallest sphere around the star that holds every body, moons included. */
  extent: number;
}

/** Moons are all one size: a test file's moon carries no size data, so none may look bigger (principle 4). */
export const MOON_RADIUS = 0.06;
export const MOONLET_RADIUS = 0.07;
/** Moon lanes in planet radii: the asset viewer's inner moon orbit, then a lane per slot. */
const MOON_LANE = { first: 1.36, step: 0.05 } as const;

const ms = (milli: number) => milli / MILLI_PER_RENDER_UNIT;

function moonModel(planetRadius: number, fileId: string, slot: number): MoonModel {
  return {
    fileId,
    slot,
    orbit: planetRadius * (MOON_LANE.first + MOON_LANE.step * slot) + MOON_RADIUS,
    incl: 0.2 + 0.3 * fract(slot * INV_PHI), // 0.2..0.5 rad: passes in front at the bottom, behind at the top
    // (offset, yaw) walk the R2 sequence: two independent low-discrepancy steps, so moons never line
    // up (one step for both would cancel out and stack every moon at one longitude)
    yaw: fract(0.5 + slot * R2[1]) * Math.PI * 2,
    offset: fract(0.15 + slot * R2[0]),
  };
}

function planetModel(p: Planet): PlanetModel {
  const radius = ms(p.radiusMilli);
  return {
    dirId: p.dirId,
    path: p.path,
    band: p.health.band,
    look: lookOf(p.health.band, p.biomeSeed),
    seed: p.biomeSeed,
    radius,
    orbit: ms(p.slot.radiusMilli),
    phase: p.slot.phaseMilliturn / 1000,
    slot: p.slot.index,
    moons: p.moons.map((m) => moonModel(radius, m.fileId, m.slot)),
    counts: {
      loc: p.loc,
      moons: p.moons.length,
      moonOverflow: p.moonOverflow,
      settlements: p.surface.settlements.length,
      surfaceOverflow: p.surface.overflow,
      debtUnknownFiles: p.health.debtUnknownFiles,
      markersPerKlocMilli: p.health.markersPerKlocMilli,
      qodoOpen: p.health.qodoOpen,
      qodoUnknown: p.health.qodoUnknown,
    },
  };
}

/** How far a planet's furthest moon (or its cloud tops) reaches from its centre. */
export function planetReach(p: PlanetModel): number {
  return Math.max(p.radius * 1.15, ...p.moons.map((m) => m.orbit + MOON_RADIUS));
}

export function systemModel(layout: LayoutV1): SystemModel {
  const planets = layout.planets.map(planetModel);
  const maxR = ms(layout.constants.maxPlanetRadiusMilli);
  // The star and its moonlets sit inside the innermost orbit, clear of any planet that could fill it.
  const inner = planets.length ? Math.min(...planets.map((p) => p.orbit)) : ms(layout.constants.slotSpacingMilli) + maxR;
  const free = Math.max(0.6, inner - maxR);
  const starRadius = Math.min(maxR, Math.max(0.3, free * 0.5));
  const moonletOrbit = starRadius + (free - starRadius) * 0.5;
  const moonlets = layout.star.moonlets.map((m) => ({
    fileId: m.fileId,
    slot: m.slot,
    orbit: moonletOrbit,
    incl: 0.15 * (fract(m.slot * INV_PHI) - 0.5),
    offset: fract(m.slot * INV_PHI),
  }));
  const extent = Math.max(
    starRadius,
    moonlets.length ? moonletOrbit + MOONLET_RADIUS : 0,
    ...planets.map((p) => p.orbit + planetReach(p)),
  );
  return {
    star: { radius: starRadius, moonlets, moonletOverflow: layout.star.moonletOverflow, testData: layout.star.testData },
    planets,
    extent,
  };
}


/** A planet's centre at a frame: its slot's orbit, starting at phaseMilliturn, turning TURNS.orbits per loop. */
export function planetCentre(p: PlanetModel, frame: number): Vec3 {
  const a = p.phase * Math.PI * 2 + turnAngle(frame, TURNS.orbits);
  return [Math.cos(a) * p.orbit, 0, -Math.sin(a) * p.orbit];
}

/**
 * A moon's offset from its planet's centre: one orbit per surface turn on an inclined circle,
 * so its speed only changes through projection (art-direction §6 Moons), never by easing.
 */
export function moonOffset(m: { orbit: number; incl: number; yaw: number; offset: number }, frame: number): Vec3 {
  const a = turnAngle(frame, TURNS.moons) + m.offset * Math.PI * 2;
  const x = Math.cos(a) * m.orbit;
  const y = -Math.sin(a) * m.orbit * Math.sin(m.incl);
  const z = Math.sin(a) * m.orbit * Math.cos(m.incl);
  const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
  return [x * c + z * s, y, -x * s + z * c];
}

/** A moonlet's position around the star (the star is at the origin); slots sit golden-ratio steps apart on the orbit. */
export function moonletPosition(m: MoonletModel, frame: number): Vec3 {
  return moonOffset({ orbit: m.orbit, incl: m.incl, yaw: 0, offset: m.offset }, frame);
}
