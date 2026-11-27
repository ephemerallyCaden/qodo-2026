// GET /api/crew and GET /api/crew-detail (#207): the crew and one member's own panel, from the same
// snapshot/layout pair as the fog (#64's check), so the panel names and places files as the fog counts them.
import type { CrewDetailQuery, CrewDetailResult, CrewView } from '../core/contract/crew.js';
import { crewDetail, crewProblem, crewView } from '../core/crew.js';
import { CommetError, EXIT } from '../core/errors.js';
import { openFogSource } from './chart.js';

const DAMAGED = 'state error: .git/commet/snapshot.json is damaged or from another commet version; run `commet scan`';

/** The crew for the latest snapshot. Damaged people are a state error (a 500 with this message), never guessed around. */
export async function readCrew(repoDir: string): Promise<CrewView> {
  const { base } = await openFogSource(repoDir);
  if (crewProblem(base.snapshot) !== null) throw new CommetError(DAMAGED, EXIT.state);
  return crewView(base.snapshot);
}

/** One crew member's panel, at the head the view shows (else unknown-head). State errors throw CommetError. */
export async function readCrewDetail(repoDir: string, q: CrewDetailQuery): Promise<CrewDetailResult> {
  const { base } = await openFogSource(repoDir);
  const head = base.snapshot.repo.head;
  if (q.at !== head) return { ok: false, error: 'unknown-head', head };
  if (crewProblem(base.snapshot) !== null) throw new CommetError(DAMAGED, EXIT.state);
  const d = crewDetail(base, q.person);
  if (d === 'damaged') throw new CommetError(DAMAGED, EXIT.state);
  return d ?? { ok: false, error: 'no-such-person' };
}
