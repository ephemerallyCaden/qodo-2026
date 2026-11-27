// Beacons in live mode (#79, R10): fetch GET /api/beacons, pair it with the drawn layout (#64) and hand
// it to the view; a write's own answer (the review panel's) goes through the same door. The newest
// request wins: a write takes a ticket before it is sent, as fog answers do, so its answer never
// cancels a fetch started after it (Qodo 29b6e331), and a write that fails cancels nothing (1e9e7558). A failed or mismatched fetch is announced and never
// blocks the map, as the drones' and the fog's are.
import type { BeaconView } from '../../../src/core/contract/beacons.js';
import { ViewError, type DataClient } from '../data/client.js';

export interface BeaconsHost {
  /** View.setBeacons: draws a beacon view over the layout of `head`, or returns false when that layout isn't the one drawn. */
  view: { setBeacons(view: BeaconView | null, head: string): boolean };
  client: Pick<DataClient, 'beacons'>;
  /** Polite screen-reader and status-line announcement. */
  announce(text: string): void;
  /** The beacons drawn changed: redraw, and refresh the text equivalents. */
  changed(): void;
}

const short = (head: string) => head.slice(0, 7);
const describe = (e: unknown): string => (e instanceof ViewError ? e.title : 'something went wrong');

export class Beacons {
  /** Counts fetches, plus each write answer drawn: an answer to anything but the latest is dropped. */
  private gen = 0;

  constructor(private readonly host: BeaconsHost) {}

  /** Fetches the beacon view and draws it over the layout of `head` (null: none drawn yet, nothing to pair with). */
  async refresh(head: string | null): Promise<void> {
    if (head === null) return;
    const gen = ++this.gen;
    let got: BeaconView;
    try {
      got = await this.host.client.beacons();
    } catch (e) {
      if (gen === this.gen) this.host.announce(`beacons unavailable: ${describe(e)}`);
      return;
    }
    if (gen === this.gen) this.show(got, head);
  }

  /**
   * Take one before sending a write whose answer carries a beacon view (POST /api/beacon), and give it
   * to apply(). Taking it changes nothing, so a write that is refused or fails leaves the fetch already
   * out to land (Qodo 1e9e7558).
   */
  ticket(): number { return this.gen; }

  /**
   * A beacon view from a write's answer, sent under `ticket`. Applied only when no fetch was started
   * since the write was sent: one that was reads beacons.json after the write, so its answer is at
   * least as new and is left to land (a scan's new layout, or a `commet beacon` run meanwhile). Once it
   * is drawn, a fetch started before the write is older, and its answer is dropped.
   */
  apply(view: BeaconView, head: string | null, ticket: number): void {
    if (ticket !== this.gen || head === null) return;
    if (this.show(view, head)) this.gen++;
  }

  /** Draws `view` over the layout of `head`; false, said in the HUD, when it is of another scan. */
  private show(view: BeaconView, head: string): boolean {
    // One of another scan is not applied, like the fog (#64): the layout of its scan refetches for itself.
    if (view.head !== head || !this.host.view.setBeacons(view, head)) {
      this.host.announce(`beacons not applied: they are of ${short(view.head)} but the layout of ${short(head)} (different scans); waiting for the next update`);
      return false;
    }
    this.host.changed();
    return true;
  }
}
