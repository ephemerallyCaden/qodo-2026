// GET /api/cochange (#211, R9): the snapshot's co-change pairs and the missing-pair flags still standing
// after the chart state, from the same snapshot/layout pair as the fog (#64's check), so a flag is
// dismissed by exactly the charts the fog counts.
import { coChangeProblem, coChangeView } from '../core/cochange.js';
import type { CoChangeView } from '../core/contract/cochange.js';
import { CommetError, EXIT } from '../core/errors.js';
import { openFogSource, readChart } from './chart.js';

const DAMAGED = 'state error: .git/commet/snapshot.json is damaged or from another commet version; run `commet scan`';

/** The co-change view for the latest snapshot. A damaged record is a state error (a 500 with this message), never guessed around. */
export async function readCoChange(repoDir: string): Promise<CoChangeView> {
  const { base, dir } = await openFogSource(repoDir);
  if (base.snapshot.cochange !== undefined && coChangeProblem(base.snapshot.cochange, base) !== null) throw new CommetError(DAMAGED, EXIT.state);
  return coChangeView(base, await readChart(dir));
}
