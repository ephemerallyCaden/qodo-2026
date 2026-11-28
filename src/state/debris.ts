// GET /api/debris and GET /api/debris-detail (R13): the stale work and one piece's panel, from the same
// snapshot/layout pair as the fog (#64's check), so a piece sits on the body the fog puts its files on.
import type { DebrisDetailQuery, DebrisDetailResult, DebrisView } from '../core/contract/debris.js';
import { debrisDetail, debrisProblem, debrisView } from '../core/debris.js';
import { CommetError, EXIT } from '../core/errors.js';
import { openFogSource } from './chart.js';

const DAMAGED = 'state error: .git/commet/snapshot.json is damaged or from another commet version; run `commet scan`';

/** The debris of the latest snapshot. Damaged debris is a state error (a 500 with this message), never guessed around. */
export async function readDebrisView(repoDir: string): Promise<DebrisView> {
  const { base } = await openFogSource(repoDir);
  if (debrisProblem(base.snapshot) !== null) throw new CommetError(DAMAGED, EXIT.state);
  return debrisView(base.snapshot, base.home);
}

/** One piece's panel, at the head the view shows (else unknown-head). State errors throw CommetError. */
export async function readDebrisDetail(repoDir: string, q: DebrisDetailQuery): Promise<DebrisDetailResult> {
  const { base } = await openFogSource(repoDir);
  const head = base.snapshot.repo.head;
  if (q.at !== head) return { ok: false, error: 'unknown-head', head };
  if (debrisProblem(base.snapshot) !== null) throw new CommetError(DAMAGED, EXIT.state);
  return debrisDetail(base.snapshot, base.home, q.id) ?? { ok: false, error: 'no-such-item' };
}
