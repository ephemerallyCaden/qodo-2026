// Who rides the ship, in which seat, and what the view says about the crew (#207 C4, C9). Pure: no three.js,
// no DOM. Seat 0 is the captain's (you); the teammates fill the seats after it in person-id order, the order
// the crew view already has (never by activity: AGENTS.md Rule 6). The overflow rule (approved): 8 a deck, two
// decks, so the captain and the first 15 teammates ride and the rest are counted in a "+N" label, never dropped
// (Rule 1). With no captain in the crew (your emails wrote nothing in the window), seat 0 stays empty.
import type { CrewMember, CrewView } from '../../../src/core/contract/crew.js';
import { MAX_ABOARD } from '../render/ship-spec.js';
import type { Rider } from '../render/ship.js';
import { plain } from '../drones/select.js';

export interface Seating {
  /** `seats[i]` rides in seat i; seat 0 is the captain's (null: empty). Empty when nobody rides. */
  seats: (CrewMember | null)[];
  /** Crew members the seats leave out, counted ("+N"). */
  extra: number;
  total: number;
  bots: number;
  needsRescan: boolean;
}

/** The seats for a crew view: the captain in seat 0, then the teammates by person id, at most MAX_ABOARD seats. */
export function seatCrew(view: CrewView): Seating {
  const members = view.needsRescan ? [] : view.members;
  const base = { total: view.total, bots: view.bots, needsRescan: view.needsRescan };
  if (members.length === 0) return { seats: [], extra: 0, ...base };
  const captain = members.find((m) => m.captain) ?? null;
  const mates = members.filter((m) => !m.captain); // already in person-id order
  const riding = mates.slice(0, MAX_ABOARD - 1);
  return { seats: [captain, ...riding], extra: mates.length - riding.length, ...base };
}

/** What the ship draws for a seat. */
export const riderOf = (m: CrewMember | null): Rider | null => (m ? { person: m.person, seed: m.seed, captain: m.captain } : null);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The HUD line: the crew aboard, those the seats leave out, and the bot and agent authors left out of the
 * crew (Rule 1: counted, never dropped silently). Repo totals only, never a per-person number (Rule 6).
 */
export function crewStatus(s: Seating): string {
  if (s.needsRescan) return 'rescan to see your crew';
  if (s.total === 0) return `crew: nobody in the scan window${s.bots > 0 ? `, ${plural(s.bots, 'bot or agent author', 'bot or agent authors')} left out` : ''}`;
  const aboard = s.seats.filter((m) => m !== null).length;
  const parts = [`crew: ${aboard} aboard`];
  if (s.extra > 0) parts.push(`${s.extra} more not seated (shown as +${s.extra})`);
  if (!s.seats[0]) parts.push("captain's seat empty (none of your commits are in the scan window)");
  if (s.bots > 0) parts.push(`${plural(s.bots, 'bot or agent author', 'bot or agent authors')} left out`);
  return parts.join(', ');
}

/** A crew member's name as the panel and labels show it: printable, bounded. */
export const crewName = (m: Pick<CrewMember, 'displayName'>, max = 60): string => plain(m.displayName, max) || 'unnamed';
