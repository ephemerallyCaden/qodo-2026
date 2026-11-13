// The text the view shows beside the pixels: the info panel and the screen-reader status. Every
// count the layout caps is shown as "not drawn", never hidden (Rule 1). Repo totals only, no
// per-person figures and no scores (Rule 6). Pure.
import type { FogView } from '../../../src/core/contract/fog.js';
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
 * Fog of war in words (F2: coverage, exact): the view's own counts, unplaced files and moons
 * included. Private map coverage, never a score. Without a usable fog view nothing is known, and
 * every file is drawn uncharted (Rule 1).
 */
export const fogLine = (t: FogTally | null): string => (t ? `uncharted: ${t.fogged} of ${plural(t.total, 'file')}` : 'uncharted: unknown, so every file is drawn uncharted');

export function planetLines(p: PlanetModel, fog: FogView | null = null): string[] {
  const c = p.counts;
  const lines = [p.path, `${plural(c.loc, 'line')}`, bandLine(p)];
  if (c.debtUnknownFiles > 0) lines.push(`debt unknown in ${plural(c.debtUnknownFiles, 'file')}`);
  lines.push(c.qodoUnknown || c.qodoOpen === null ? 'qodo findings unknown' : plural(c.qodoOpen, 'open qodo finding'));
  lines.push(`${plural(c.moons, 'test moon')}${notDrawn(c.moonOverflow)}`);
  lines.push(`${plural(c.settlements, 'file')} on the surface${c.surfaceOverflow > 0 ? ` (+${c.surfaceOverflow} unplaced)` : ''}`);
  lines.push(fogLine(fog ? planetTally(fog, p.dirId) : null));
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

/**
 * The text equivalent of everything the canvas shows (labels and info panel), for screen readers:
 * the info panel's lines, then every planet by name.
 */
export function summaryText(m: SystemModel, focus: number | null, fog: FogView | null = null): string {
  const names = m.planets.map((p) => p.path);
  return [...infoLines(m, focus, fog), ...(names.length ? [`planets: ${names.join(', ')}`] : [])].join('. ');
}

/** What the info panel shows: the focused planet, else the system. */
export const infoLines = (m: SystemModel, focus: number | null, fog: FogView | null = null): string[] => {
  const p = focus === null ? undefined : m.planets[focus];
  return p ? planetLines(p, fog) : systemLines(m, fog);
};

export const HELP = 'drag: look · wasd: fly · r f: up down · [ ]: planets · esc: free flight';
