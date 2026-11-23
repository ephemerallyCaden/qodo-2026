// Co-change in live mode (#211, R9): fetch GET /api/cochange, pair it with the drawn layout (#64) and hand
// it to the view. Refetched with every layout load and every snapshot and fog event (a chart dismisses a
// flag). The newest request wins; a failed or mismatched fetch is announced and never blocks the map, as
// the beacons' and the drones' are.
import type { CoChangeView } from '../../../src/core/contract/cochange.js';
import { ViewError, type DataClient } from '../data/client.js';

export interface CoChangeHost {
  /** View.setCoChange: draws a co-change view over the layout of `head`, or returns false when that layout isn't the one drawn. */
  view: { setCoChange(view: CoChangeView | null, head: string): boolean };
  client: Pick<DataClient, 'cochange'>;
  /** Polite screen-reader and status-line announcement. */
  announce(text: string): void;
  /** What's drawn changed: redraw, and refresh the text equivalents. */
  changed(): void;
}

const short = (head: string) => head.slice(0, 7);
const describe = (e: unknown): string => (e instanceof ViewError ? e.title : 'something went wrong');

export class CoChange {
  private gen = 0;
  /** The head a "rescan" notice was given for: said once, never repeated (Rule 6: no nagging). */
  private told: string | null = null;

  constructor(private readonly host: CoChangeHost) {}

  /** Fetches the co-change view and draws it over the layout of `head` (null: none drawn yet, nothing to pair with). */
  async refresh(head: string | null): Promise<void> {
    if (head === null) return;
    const gen = ++this.gen;
    let got: CoChangeView;
    try {
      got = await this.host.client.cochange();
    } catch (e) {
      if (gen === this.gen) this.host.announce(`co-change unavailable: ${describe(e)}`);
      return;
    }
    if (gen !== this.gen) return;
    // One of another scan is not applied, like the fog (#64): the layout of its scan refetches for itself.
    if (got.head !== head || !this.host.view.setCoChange(got, head)) {
      this.host.announce(`co-change not applied: it is of ${short(got.head)} but the layout of ${short(head)} (different scans); waiting for the next update`);
      return;
    }
    if (got.needsRescan && this.told !== head) {
      this.told = head;
      this.host.announce('co-change links need a rescan: run `commet scan`');
    }
    this.host.changed();
  }
}
