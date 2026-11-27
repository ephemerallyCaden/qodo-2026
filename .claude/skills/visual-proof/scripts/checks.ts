// visual-proof: what the run decides once the takes are done (or one of them failed): the privacy scan
// (R5), the determinism check (R2) and the failed take, and which of them stops the run.
import { rmSync } from 'node:fs';
import { assetHits, privacyHits, takeTexts, type Hit, type PrivacyContext, type Scanned } from './privacy.js';
import { compareTakes, keepsScratch, privacyStop, Stop, takesStop, type TakeCompare } from './rules.js';
import type { TakeLog } from './scene.js';

/** A finished take; `scanned` is its build's dist/web as the bundle scan read it (path → sha256), which every static file it was served must match. */
export interface TakeDone { name: string; dir: string; log: TakeLog; scanned?: ReadonlyMap<string, string> }
export interface TakeFailed { name: string; dir: string; error: Stop | Error }

export interface Checked {
  hits: Hit[];
  compared: { side: string; c: TakeCompare }[];
  /** The stop, if any. */
  stop: Stop | Error | null;
  /** Take dirs removed: a failed take's, which left nothing to scan. */
  removed: string[];
}

/**
 * The takes' checks, privacy first (PR #199 be6e0044): every finished take is scanned before any is
 * compared, so no stop leaves an unscanned take behind. A failed take wrote no log to scan, so its dir
 * is removed. A hit is a privacy stop whatever else happened; then the failed take's own stop; then the
 * first pair of takes that differ.
 */
export async function checkTakes(o: { done: readonly TakeDone[]; failed?: TakeFailed; pairs: readonly (readonly [string, string, string])[]; items: readonly Scanned[]; ctx: Pick<PrivacyContext, 'literals'>; tokenHits?: number }): Promise<Checked> {
  const removed: string[] = [];
  if (o.failed) {
    rmSync(o.failed.dir, { recursive: true, force: true });
    removed.push(o.failed.name);
  }
  // The literals only: three's library text is skipped in the bundle scan alone, never in what a take saw (Qodo 648df95e)
  const hits = privacyHits([...o.items, ...o.done.flatMap((t) => takeTexts(t.name, t.log))], { literals: o.ctx.literals });
  for (const t of o.done) if (t.scanned) hits.push(...assetHits(t.name, t.log.assets, t.scanned));
  if (o.tokenHits) hits.push({ rule: 'the launch token', where: 'a take log', excerpt: `(${o.tokenHits} times, replaced before writing)` });
  const compared: Checked['compared'] = [];
  const leak = privacyStop(hits);
  if (leak) return { hits, compared, stop: leak, removed };
  if (o.failed) return { hits, compared, stop: o.failed.error, removed };
  const dir = (name: string) => o.done.find((t) => t.name === name)!.dir;
  for (const [side, a, b] of o.pairs) {
    const c = await compareTakes(dir(a), dir(b));
    compared.push({ side, c });
    const stop = takesStop(side, c);
    if (stop) return { hits, compared, stop, removed };
  }
  return { hits, compared, stop: null, removed };
}

/** After a stop: removes the scratch dir unless the stop keeps it (keepsScratch). Returns whether it was kept. */
export function settleScratch(stop: Stop, keep: boolean, scratch: string): boolean {
  const kept = keepsScratch(stop.code, keep);
  if (!kept) rmSync(scratch, { recursive: true, force: true });
  return kept;
}
