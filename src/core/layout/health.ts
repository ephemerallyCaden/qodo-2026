// Code health per planet and per settlement (#18): four bands, worst to best lava → toxic → ash →
// healthy, from debt markers per 1,000 LOC plus open Qodo findings when they're known.
import type { Health, HealthBand } from '../contract/layout.js';
import type { DebtCounts } from '../snapshot/types.js';
import { DEBT_KEYS } from '../structure.js';
import { ASH_MAX_MILLI, HEALTHY_MAX_MILLI, QODO_FINDING_WEIGHT, TOXIC_MAX_MILLI } from './constants.js';

/** What health reads from one file: its LOC, its markers (null: unread) and its open findings (null: unknown). */
export interface HealthInput { loc: number; debt: DebtCounts | null; qodoOpen: number | null }

/** The band for a score (thousandths per kLOC). A score at a band's maximum stays in it. */
export function bandOf(scoreMilli: number): HealthBand {
  if (scoreMilli <= HEALTHY_MAX_MILLI) return 'healthy';
  if (scoreMilli <= ASH_MAX_MILLI) return 'ash';
  if (scoreMilli <= TOXIC_MAX_MILLI) return 'toxic';
  return 'lava';
}

/** `count` per 1,000 LOC, ×1000, rounded down. Markers can't sit in 0 lines, so LOC 0 counts as 1. */
const perKlocMilli = (count: number, loc: number) => Math.floor((count * 1_000_000) / Math.max(1, loc));

/**
 * Health of a set of files. Markers count only where debt was read; unread files are counted in
 * `debtUnknownFiles` and a set holding any is never healthy (Rule 1: no reassuring state without
 * evidence). Open findings are summed only when every file's count is known; otherwise `qodoOpen`
 * is null and the band comes from markers alone (`qodoUnknown`).
 */
export function health(files: HealthInput[]): Health {
  let markers = 0;
  let knownLoc = 0;
  let loc = 0;
  let debtUnknownFiles = 0;
  // No files is no evidence either way.
  let qodoOpen: number | null = files.length > 0 ? 0 : null;
  for (const f of files) {
    loc += f.loc;
    if (f.debt === null) debtUnknownFiles++;
    else {
      knownLoc += f.loc;
      for (const k of DEBT_KEYS) markers += f.debt[k];
    }
    qodoOpen = qodoOpen === null || f.qodoOpen === null ? null : qodoOpen + f.qodoOpen;
  }
  const markersPerKlocMilli = perKlocMilli(markers, knownLoc);
  const score = markersPerKlocMilli + (qodoOpen === null ? 0 : QODO_FINDING_WEIGHT * perKlocMilli(qodoOpen, loc));
  const band = bandOf(score);
  return { band: band === 'healthy' && debtUnknownFiles > 0 ? 'ash' : band, markersPerKlocMilli, debtUnknownFiles, qodoOpen,
    qodoUnknown: qodoOpen === null };
}
