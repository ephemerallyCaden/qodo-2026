// The text the view shows beside the pixels: the info panel and the screen-reader status. Every
// count the layout caps is shown as "not drawn", never hidden (Rule 1). Repo totals only, no
// per-person figures and no scores (Rule 6); a planet's mastery (#201, U3) is the share of its own
// files understood, the human's call (understanding mode, 2026-11-23). Pure.
import type { FogView } from '../../../src/core/contract/fog.js';
import { masteryPercent } from '../../../src/core/mastery.js';
import { beaconLine, type BeaconSpot } from './beacons.js';
import { planetTally, systemTally, type FogTally } from './fog.js';
import type { PlanetModel, SystemModel } from './system.js';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const notDrawn = (n: number) => (n > 0 ? ` (+${n} not drawn)` : '');

/** The band's inputs in words (art-direction §6 rule 5), e.g. "toxic: 9 debt markers per 1k lines". */
export function bandLine(p: PlanetModel): string {
  const c = p.counts;
  const markers = c.markersPerKlocMilli / 1000;
  return `${p.band}: ${Number.isInteger(markers) ? markers : markers.toFixed(1)} debt markers per 1k lines`;
}

/**
 * Fog of war in words (F2: coverage, exact): the view's own counts by level (#201; the stored `haze`
 * is said "misted", #224), unplaced files and moons included. Private map coverage, never a score. Without a usable fog view nothing is
 * known, and every file is drawn uncharted (Rule 1).
 */
export const fogLine = (t: FogTally | null): string => (t
  ? `uncharted: ${t.fogged} of ${plural(t.total, 'file')}; ${t.haze} misted (read), ${t.clear} clear (understood)`
  : 'uncharted: unknown, so every file is drawn uncharted');

/**
 * Mastery (#201, U3): the planet's cleared files over all its files, by count, as its fog draws them
 * (clear files have nothing over them). Rounded down, so it never says 100% while a file isn't clear.
 */
export const masteryLine = (t: FogTally | null): string => (t
  ? `mastery: ${masteryPercent(t.clear, t.total)}% (${t.clear} of ${plural(t.total, 'file')} understood)`
  : 'mastery: unknown, so every file is drawn uncharted');

export function planetLines(p: PlanetModel, fog: FogView | null = null): string[] {
  const c = p.counts;
  const lines = [p.path, `${plural(c.loc, 'line')}`, bandLine(p)];
  if (c.debtUnknownFiles > 0) lines.push(`debt unknown in ${plural(c.debtUnknownFiles, 'file')}`);
  lines.push(c.qodoUnknown || c.qodoOpen === null ? 'qodo findings unknown' : plural(c.qodoOpen, 'open qodo finding'));
  lines.push(`${plural(c.moons, 'test moon')}${notDrawn(c.moonOverflow)}`);
  lines.push(`${plural(c.settlements, 'file')} on the surface${c.surfaceOverflow > 0 ? ` (+${c.surfaceOverflow} unplaced)` : ''}`);
  const tally = fog ? planetTally(fog, p.dirId) : null;
  lines.push(masteryLine(tally), fogLine(tally));
  return lines;
}

export function systemLines(m: SystemModel, fog: FogView | null = null): string[] {
  const lines = [m.planets.length === 0 ? 'no planets yet: just the star' : plural(m.planets.length, 'planet')];
  const ml = m.star.moonlets.length;
  if (ml > 0 || m.star.moonletOverflow > 0) lines.push(`${plural(ml, 'moonlet')} (root files, unmatched tests)${notDrawn(m.star.moonletOverflow)}`);
  if (m.star.testData > 0) lines.push(`${plural(m.star.testData, 'test data file')} (ride with the tests, not drawn)`);
  lines.push(fogLine(systemTally(fog)));
  return lines;
}

/** The beacons drawn (#79): the bodies holding notes, and the notes that couldn't be placed. */
export interface BeaconInfo { spots: readonly BeaconSpot[]; unplaced: number }

/** The beacon spot of the body in view: the focused planet, or in free flight the star, whose files the review panel lists then (Qodo 36a4f942). */
const spotInView = (beacons: BeaconInfo | null, focus: number | null): BeaconSpot | undefined =>
  beacons?.spots.find((s) => s.planet === (focus ?? -1));

/** The notes of the body in view (the focused planet, else the star), newest first: the ones the view labels. */
export const focusedNotes = (beacons: BeaconInfo | null, focus: number | null): readonly string[] => spotInView(beacons, focus)?.notes ?? [];

/** Every body that carries a beacon, as its marker shows it, e.g. "beacons on src/server (1), the star (2)" (Qodo 5cfba6e0). */
export function beaconBodies(m: SystemModel, beacons: BeaconInfo | null): string | null {
  if (!beacons || beacons.spots.length === 0) return null;
  return `beacons on ${beacons.spots.map((s) => `${s.planet < 0 ? 'the star' : m.planets[s.planet]?.path ?? 'a planet'} (${s.notes.length})`).join(', ')}`;
}

/**
 * The text equivalent of everything the canvas shows (labels and info panel), for screen readers:
 * the info panel's lines, which bodies carry beacons, the labelled notes of the body in view, then
 * every planet by name. Other bodies' note text isn't drawn, so it isn't read either: focus a planet
 * to hear its notes (human, 2026-11-18, on Qodo 5cfba6e0).
 */
export function summaryText(m: SystemModel, focus: number | null, fog: FogView | null = null, beacons: BeaconInfo | null = null): string {
  const names = m.planets.map((p) => p.path);
  const where = beaconBodies(m, beacons);
  const notes = focusedNotes(beacons, focus);
  return [...infoLines(m, focus, fog, beacons), ...(where ? [where] : []), ...(notes.length ? [`beacon notes, newest first: ${notes.join('; ')}`] : []),
    ...(names.length ? [`planets: ${names.join(', ')}`] : [])].join('. ');
}

/** What the info panel shows: the focused planet, else the system, then the beacon count (none: no line). */
export const infoLines = (m: SystemModel, focus: number | null, fog: FogView | null = null, beacons: BeaconInfo | null = null): string[] => {
  const p = focus === null ? undefined : m.planets[focus];
  const lines = p ? planetLines(p, fog) : systemLines(m, fog);
  const line = beacons && (p ? beaconLine(spotInView(beacons, focus)?.notes.length ?? 0, 0)
    : beaconLine(beacons.spots.reduce((n, s) => n + s.notes.length, 0), beacons.unplaced));
  if (line) lines.push(line);
  return lines;
};

export const HELP = 'drag: look · wasd: fly · r f: up down · [ ]: planets · esc: free flight';
