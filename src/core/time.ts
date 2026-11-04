import type { IsoUtc } from './snapshot/types.js';

/** Epoch milliseconds → 'YYYY-MM-DDTHH:MM:SSZ' (seconds precision, UTC). */
export function isoUtc(ms: number): IsoUtc {
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}

/** Calendar-month subtraction in UTC, clamping the day (Mar 31 − 1 month = Feb 28/29). */
export function minusMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}
