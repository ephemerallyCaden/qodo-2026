// What the view draws of a debris view, and what it says about it (R13). Pure: no three.js, no DOM. A piece with a
// home is drawn (debris/place.ts ranks and caps each body's), one without is counted, never guessed (Rule 1). The
// HUD line holds repo totals only, never a score, a percentage or a per-person number (Rule 6): debris never ages
// while you're away (its "now" is HEAD's commit), so nothing here nags.
import type { DebrisView } from '../../../src/core/contract/debris.js';
import type { Drawable } from './place.js';

/** The pieces the view can draw: those with a home. None of a view that needs a rescan. */
export const drawables = (view: DebrisView): Drawable[] =>
  view.needsRescan ? [] : view.pieces.flatMap((p) => (p.home === null ? [] : [{ ...p, home: p.home }]));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The HUD line, short enough for the top centre: how much stale work the repo holds and its rough mass, what isn't
 * drawn and why, the refs the scan couldn't read, and that stale PRs aren't read (R13, Rule 1: counted or "not read",
 * never a quiet 0). Each piece's kind is its own silhouette (D1) and its panel's words.
 */
export function debrisStatus(view: DebrisView, overCap: number): string {
  if (view.needsRescan) return 'rescan to see debris';
  const extra: string[] = [];
  if (overCap > 0) extra.push(`${overCap} past a planet's 12 (+N)`);
  const unplaced = view.total - view.placed;
  if (unplaced > 0) extra.push(`${unplaced} with no file at HEAD`);
  if (view.unreadable > 0) extra.push(`${view.unreadable} unreadable`);
  const head = view.total === 0 ? 'debris: none' : `debris: ${plural(view.total, 'stale branch', 'stale branches')}, ${plural(view.mass, 'line', 'lines')}`;
  return `${head}${extra.length ? ` (${extra.join(', ')})` : ''}; PRs not read`;
}
