import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import type { CredentialCheck } from './config.js';

/**
 * Expiry (epoch seconds) of the cookie `name` for `domain` in a Netscape cookie jar, the latest if
 * there are several, or null. Reads only the domain, expiry and name columns; the value column is
 * never touched, so it can't end up in a log.
 */
export function cookieExpiry(jar: string, domain: string, name: string): number | null {
  const host = domain.toLowerCase();
  let best: number | null = null;
  for (const line of jar.split('\n')) {
    const cols = line.replace(/^#HttpOnly_/, '').split('\t');
    if (cols.length < 7 || cols[0]!.startsWith('#')) continue;
    if (cols[0]!.replace(/^\./, '').toLowerCase() !== host || cols[5] !== name) continue;
    const exp = Number(cols[4]);
    if (Number.isFinite(exp) && (best === null || exp > best)) best = exp;
  }
  return best;
}

/** Hours left on the checked login, or null when its cookie can't be read. */
export async function credentialHoursLeft(check: CredentialCheck, nowMs: number): Promise<number | null> {
  let jar: string;
  try {
    jar = await readFile(check.cookieJar, 'utf8');
  } catch {
    return null;
  }
  const exp = cookieExpiry(jar, check.domain, check.cookie);
  return exp === null ? null : (exp * 1000 - nowMs) / 3_600_000;
}

/** Whether the checked login has run out; with no check configured, never (the agent call says so instead). */
export async function credentialsExpired(check: CredentialCheck | null, nowMs: number): Promise<boolean> {
  if (!check) return false;
  const hours = await credentialHoursLeft(check, nowMs);
  return hours === null || hours <= 0;
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** The pre-flight line for the freshness check: skipped (and said so) when the local config has none. */
export function credentialCheck(check: CredentialCheck | null, hours: number | null): Check {
  if (!check) return { name: 'credentials', ok: true, detail: 'no freshness check configured' };
  if (hours === null) return { name: 'credentials', ok: false, detail: 'no agent credential cookie found' };
  return { name: 'credentials', ok: hours >= check.minHours, detail: `${hours.toFixed(1)} h left (need ${check.minHours})` };
}
