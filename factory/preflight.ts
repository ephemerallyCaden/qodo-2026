import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';

/**
 * Expiry (epoch seconds) of the Midway `session` cookie in a Netscape cookie jar, or null.
 * Reads only the domain, expiry and name columns; the value column is never touched, so it
 * can't end up in a log.
 */
export function midwaySessionExpiry(jar: string): number | null {
  let best: number | null = null;
  for (const line of jar.split('\n')) {
    const cols = line.replace(/^#HttpOnly_/, '').split('\t');
    if (cols.length < 7 || cols[0]!.startsWith('#')) continue;
    const domain = cols[0]!.replace(/^\./, '');
    if (domain !== 'midway-auth.amazon.com' || cols[5] !== 'session') continue;
    const exp = Number(cols[4]);
    if (Number.isFinite(exp) && (best === null || exp > best)) best = exp;
  }
  return best;
}

/** Hours left on the Midway session, or null when there is no readable session cookie. */
export async function midwayHoursLeft(cookieFile: string, nowMs: number): Promise<number | null> {
  let jar: string;
  try {
    jar = await readFile(cookieFile, 'utf8');
  } catch {
    return null;
  }
  const exp = midwaySessionExpiry(jar);
  return exp === null ? null : (exp * 1000 - nowMs) / 3_600_000;
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
