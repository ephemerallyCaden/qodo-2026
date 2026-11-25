// The crew in live mode (#207): fetch GET /api/crew, pair it with the drawn layout, seat it aboard the ship
// (select.ts), say it in the HUD and open the panel of a clicked crew member, whose planets and files come
// from GET /api/crew-detail, once per selection, for the drawn head only. A failed fetch is announced and
// never blocks the map, as the drones' is (drones/controller.ts, the pattern this follows).
import type { CrewDetailResult, CrewMember, CrewView } from '../../../src/core/contract/crew.js';
import type { PersonId } from '../../../src/core/snapshot/types.js';
import type { OrbitPose } from '../camera/pose.js';
import { ViewError, type DataClient } from '../data/client.js';
import { chooseDock, DOCK_INSET } from '../drones/dock.js';
import type { Rect } from '../labels/place.js';
import { byId } from '../ui/dom.js';
import type { View } from '../view.js';
import { CREW_LOADING, crewAnnouncement, crewDetailState, type CrewDetailState } from './detail.js';
import { CrewPanel } from './panel.js';
import { seatTrack } from './place.js';
import { crewName, crewStatus, riderOf, seatCrew, type Seating } from './select.js';

export interface CrewHost {
  view: View;
  client: Pick<DataClient, 'crew' | 'crewDetail'>;
  /** Polite screen-reader and status-line announcement. */
  announce(text: string): void;
  /** Something changed that needs a redraw. */
  redraw(): void;
  /** Hands keyboard focus back to the 3D view. */
  release(): void;
  /** The other panels laid over the view, which the crew panel docks clear of when they're open. */
  others(): readonly HTMLElement[];
  /** The ship drawn changed (another crew, or none): the start pose that frames it moved. */
  reframe(): void;
}

const short = (head: string) => head.slice(0, 7);
const boxOf = (e: HTMLElement): Rect | null => {
  if (e.hidden) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};
const describe = (e: unknown): string => (e instanceof ViewError ? e.title : 'something went wrong');

export class Crew {
  private readonly panel = new CrewPanel();
  private readonly line = byId<HTMLParagraphElement>('crew-hud');
  /** The crew view the ship follows: always of the drawn layout's head, or null. */
  private data: CrewView | null = null;
  private seating: Seating | null = null;
  private gen = 0;
  /** Why the latest refresh didn't apply, shown beside the HUD line until a matching one does. */
  private note = '';
  /** The open panel's detail: whose, of which head, what it shows, and the request (gen) behind it. */
  private detail: { person: string; head: string; state: CrewDetailState; gen: number } | null = null;
  private detailGen = 0;

  constructor(private readonly host: CrewHost) {
    this.panel.onClose = () => { this.deselect(); host.release(); };
  }

  /**
   * Fetches the crew and seats it over the layout of `head` (null: none drawn yet). One of another scan is not
   * applied (#64); the previous one stays when it's of this head. The newest request wins.
   */
  async refresh(head: string | null): Promise<void> {
    if (head === null) return;
    const gen = ++this.gen;
    this.dropDetail(); // a refresh means a new scan: the open panel asks again, and an answer still out is dropped
    if (this.selected()) this.panel.showDetail(CREW_LOADING, this.nameOf);
    if (this.data && this.data.head !== head) { this.data = null; this.seating = null; this.deselect(); }
    let got: CrewView | Error;
    try { got = await this.host.client.crew(); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    if (gen !== this.gen) return;
    const had = this.data?.head === head ? this.data : null;
    if (got instanceof Error) {
      this.note = `update failed: ${describe(got)}`;
      this.host.announce(`crew unavailable: ${describe(got)}`);
      await this.apply(had, head, gen);
    } else if (got.head !== head) {
      this.note = `update of ${short(got.head)} not applied: other scan`;
      this.host.announce(`crew not applied: it is of ${short(got.head)} but the layout of ${short(head)} (different scans); waiting for the next update`);
      await this.apply(had, head, gen);
    } else { this.note = ''; await this.apply(got, head, gen); }
  }

  private async apply(data: CrewView | null, head: string, gen: number): Promise<void> {
    const seating = data ? seatCrew(data) : null;
    let drawn: boolean;
    try {
      drawn = await this.host.view.setCrew(seating ? seating.seats.map(riderOf) : [], seating?.extra ?? 0, head);
    } catch (e) {
      if (gen !== this.gen) return;
      this.host.announce(`crew not drawn: ${describe(e)}`);
      if (this.selected()) this.panel.showDetail({ kind: 'failed', text: `the ship could not be drawn (${describe(e)}); this crew member's files will show after the next update` }, this.nameOf);
      return;
    }
    if (!drawn || gen !== this.gen) return;
    const before = this.seating?.seats.length ?? 0;
    this.data = data;
    this.seating = seating;
    this.line.textContent = (seating ? crewStatus(seating) : 'crew: none loaded') + (this.note ? ` (${this.note})` : '');
    if ((seating?.seats.length ?? 0) !== before) this.host.reframe(); // the ship's size, so Home's framing, follows its seats
    const open = this.selected();
    if (open) this.showPanel(open, false);
    else this.deselect();
    this.host.redraw();
  }

  /** The planet's path for a home, from the map drawn; null when it isn't on it. */
  private readonly nameOf = (home: string): string | null => this.host.view.model?.planets.find((p) => p.dirId === home)?.path ?? null;

  private showPanel(m: CrewMember, takeFocus = true, selected = takeFocus): void {
    this.host.view.selectedName = m.captain ? 'you' : crewName(m, 24);
    this.panel.show(m, takeFocus);
    this.showDetail(m, selected);
  }

  private showDetail(m: CrewMember, selected: boolean): void {
    const head = this.data?.head;
    if (head === undefined) return;
    const had = this.detail;
    if (had && had.person === m.person && had.head === head && had.state.kind !== 'failed') {
      this.panel.showDetail(had.state, this.nameOf);
      if (selected) this.say(had.state, m, true);
      return;
    }
    void this.loadDetail(m, head, selected);
  }

  /** One short line per answer, said when the user picked the member, and a failure once in any case. */
  private say(state: CrewDetailState, m: CrewMember, selected: boolean): void {
    const line = crewAnnouncement(state, m);
    if (line !== null && (selected || state.kind === 'failed')) this.host.announce(line);
  }

  private async loadDetail(m: CrewMember, head: string, selected: boolean): Promise<void> {
    const gen = ++this.detailGen;
    this.detail = { person: m.person, head, state: CREW_LOADING, gen };
    this.panel.showDetail(CREW_LOADING, this.nameOf);
    let got: CrewDetailResult | Error;
    try { got = await this.host.client.crewDetail(m.person as PersonId, head); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    if (gen !== this.detailGen || this.host.view.selectedPerson !== m.person || this.data?.head !== head) {
      if (this.detail?.gen === gen) this.detail = null;
      return;
    }
    const state = crewDetailState(got, m.person, head);
    this.detail = { person: m.person, head, state, gen };
    this.panel.showDetail(state, this.nameOf);
    this.say(state, m, selected);
  }

  /** A click on the view: selects the crew member whose porthole is under it and opens their panel. False when none is there. */
  pick(cssX: number, cssY: number, pose: OrbitPose, frame: number): boolean {
    const person = this.host.view.pickCrewAt(cssX, cssY, pose, frame);
    const m = person === null ? undefined : this.seating?.seats.find((s) => s?.person === person) ?? undefined;
    if (!m) return false;
    this.host.view.selectedPerson = m.person;
    this.host.announce(m.captain ? 'selected you, the captain' : `selected crew member ${crewName(m)}`);
    this.showPanel(m);
    this.host.redraw();
    return true;
  }

  /** Docks the open panel clear of the selected member's porthole (drones/dock.ts). Call it with every drawn frame, before the labels. */
  dock(frame: number, pose: OrbitPose, focus: number | null): void {
    if (!this.panel.open) return;
    const view = this.host.view, model = view.model, spec = view.crewSpec;
    const seat = view.crewSeat(view.selectedPerson);
    if (!model || !spec || seat === null) return;
    const canvas = view.labels.canvas, c = canvas.getBoundingClientRect();
    if (c.width === 0 || c.height === 0 || canvas.height === 0) return;
    const topLeft = Math.round(c.top + (view.infoEnd(focus) * c.height) / canvas.height + DOCK_INSET.side);
    const input = {
      track: seatTrack(model, spec, seat, frame, pose, { x: c.left, y: c.top, w: c.width, h: c.height }),
      panel: this.panel.size(), window: { w: innerWidth, h: innerHeight }, topLeft,
      others: this.host.others().flatMap((e) => boxOf(e) ?? []),
    };
    this.panel.dock(chooseDock(input, this.panel.docked), topLeft);
  }

  /** The selected crew member, when they are still aboard the crew drawn. */
  private selected(): CrewMember | undefined {
    const p = this.host.view.selectedPerson;
    return p === null ? undefined : this.seating?.seats.find((s) => s?.person === p) ?? undefined;
  }

  private dropDetail(): void {
    this.detailGen++;
    this.detail = null;
  }

  deselect(): void {
    this.dropDetail();
    if (this.host.view.selectedPerson === null && !this.panel.open) return;
    this.host.view.selectedPerson = null;
    this.host.view.selectedName = '';
    const hadFocus = this.panel.open && byId('crew-panel').contains(document.activeElement);
    this.panel.hide();
    if (hadFocus) this.host.release();
    this.host.redraw();
  }
}
