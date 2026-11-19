// Drones in live mode (#80): fetch GET /api/drones, pair it with the drawn layout, choose what to draw
// (select.ts), say it in the HUD and open the panel of a clicked drone. A failed fetch is announced and
// never blocks the map, as the fog's is. Everything the view needs from here is a call or two. The open
// panel asks for its session's files and timeline (#148), once per selection, for the drawn head only.
import type { DroneDetailResult, DroneSession, DroneView } from '../../../src/core/contract/drones.js';
import type { OrbitPose } from '../camera/pose.js';
import { ViewError, type DataClient } from '../data/client.js';
import { byId } from '../ui/dom.js';
import type { View } from '../view.js';
import { detailAnnouncement, detailState, INFERRED_NOTE, LOADING, type DetailState } from './detail.js';
import { DronePanel } from './panel.js';
import { droneStatus, entryOf, selectDrones } from './select.js';

export interface DronesHost {
  view: View;
  client: Pick<DataClient, 'drones' | 'droneDetail'>;
  /** Polite screen-reader and status-line announcement. */
  announce(text: string): void;
  /** Something changed that needs a redraw. */
  redraw(): void;
  /** Hands keyboard focus back to the 3D view. */
  release(): void;
}

const short = (head: string) => head.slice(0, 7);
const describe = (e: unknown): string => (e instanceof ViewError ? e.title : 'something went wrong');

export class Drones {
  private readonly panel = new DronePanel();
  private readonly line = byId<HTMLParagraphElement>('drones-hud');
  /** The drone view the drawing follows: always of the drawn layout's head, or null. */
  private data: DroneView | null = null;
  private shown: DroneSession[] = [];
  private gen = 0;
  /** Why the latest refresh didn't apply, shown beside the counts until a matching one does. */
  private note = '';
  /** The open panel's session detail (#148): whose, of which head, what it shows, and the request (gen) behind it. */
  private detail: { key: string; head: string; state: DetailState; gen: number } | null = null;
  /** Bumped by every detail request and every close, so a late answer is dropped. */
  private detailGen = 0;

  constructor(private readonly host: DronesHost) {
    this.panel.onClose = () => { this.deselect(); host.release(); };
  }

  /**
   * Fetches the drone view and draws it over the layout of `head` (null: none drawn yet, nothing to
   * pair with). One of another scan is not applied, like the fog (#64); the previous one stays when it's
   * of this head. The newest request wins.
   */
  async refresh(head: string | null): Promise<void> {
    if (head === null) return;
    const gen = ++this.gen;
    // A refresh means a new scan (a snapshot or layout event), maybe of the same head: the open panel asks
    // for its detail again however the drone view fetch goes, and an answer still out is dropped (Qodo PR #167 09393e2b).
    // The list on show is of the old scan, so it goes at once too, not only from the cache (34ee1e52).
    this.dropDetail();
    if (this.openAgentSession()) this.panel.showDetail(LOADING);
    if (this.data && this.data.head !== head) { // a layout of another scan: its sessions are gone from the scene, so are their details
      this.data = null;
      this.shown = [];
      this.deselect();
    }
    let got: DroneView | Error;
    try { got = await this.host.client.drones(); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    if (gen !== this.gen) return; // a newer refresh is on its way
    const had = this.data?.head === head ? this.data : null;
    if (got instanceof Error) {
      this.note = `update failed: ${describe(got)}`;
      this.host.announce(`drones unavailable: ${describe(got)}`);
      await this.apply(had, head, gen);
    } else if (got.head !== head) {
      this.note = `update of ${short(got.head)} not applied: other scan`;
      this.host.announce(`drones not applied: they are of ${short(got.head)} but the layout of ${short(head)} (different scans); waiting for the next update`);
      await this.apply(had, head, gen);
    } else { this.note = ''; await this.apply(got, head, gen); }
  }

  /** Draws `data` (null: no drones) over the layout of `head`. Does nothing if a newer refresh began or the layout changed meanwhile. */
  private async apply(data: DroneView | null, head: string, gen: number): Promise<void> {
    const model = this.host.view.model;
    const sel = model && data ? selectDrones(data, (h) => h === 'star' || model.planets.some((p) => p.dirId === h)) : null;
    let drawn: boolean;
    try {
      drawn = await this.host.view.setDrones(sel ? sel.shown.map(entryOf) : [], head);
    } catch (e) {
      if (gen !== this.gen) return;
      this.host.announce(`drones not drawn: ${describe(e)}`);
      // The open panel's files would be of the old scan: say so rather than leave them (34ee1e52).
      if (this.openAgentSession()) this.panel.showDetail({ kind: 'failed', text: `the drones could not be drawn (${describe(e)}); this session's files will show after the next update` });
      return;
    }
    if (!drawn || gen !== this.gen) return; // stale: a newer refresh or a layout reload owns the state now
    this.data = data;
    this.shown = sel ? sel.shown : [];
    this.line.textContent = (sel ? droneStatus(sel) : 'drones: none loaded') + (this.note ? ` (${this.note})` : '');
    const open = this.shown.find((s) => s.key === this.host.view.selectedDrone);
    if (open) this.showPanel(open, false); // the refresh may have changed what the open panel says
    else this.deselect();
    this.host.redraw();
  }

  /** `selected`: the user picked it (say its answer); otherwise a refresh rebuilds it (say only a failure). */
  private showPanel(s: DroneSession, takeFocus = true, selected = takeFocus): void {
    const home = s.home === 'star' || s.home === null ? 'the star' : this.host.view.model?.planets.find((p) => p.dirId === s.home)?.path ?? 'unknown';
    this.panel.show(s, home, takeFocus);
    this.showDetail(s, selected);
  }

  /**
   * The panel's files and timeline (#148). Never asked for an inferred pseudo-session (Rule 6). The same
   * session of the same drone view keeps what it has (a failed refresh rebuilds the panel); anything else asks again.
   */
  private showDetail(s: DroneSession, selected: boolean): void {
    if (s.inferred) { this.dropDetail(); this.panel.showDetail({ kind: 'note', text: INFERRED_NOTE }); return; }
    const head = this.data?.head;
    if (head === undefined) return;
    const had = this.detail;
    if (had && had.key === s.key && had.head === head && had.state.kind !== 'failed') {
      this.panel.showDetail(had.state);
      if (selected) this.say(had.state, true);
      return;
    }
    void this.loadDetail(s.key, head, selected);
  }

  /**
   * The panel isn't a live region (Qodo PR #167 ef145633): an answer is said in one short line, the counts
   * and never the list. It is said when the user picked the drone, and a failure is said once in any case;
   * a refresh that reloads the list says nothing else.
   */
  private say(state: DetailState, selected: boolean): void {
    const line = detailAnnouncement(state);
    if (line !== null && (selected || state.kind === 'failed')) this.host.announce(line);
  }

  private async loadDetail(key: string, head: string, selected: boolean): Promise<void> {
    const gen = ++this.detailGen;
    this.detail = { key, head, state: LOADING, gen };
    this.panel.showDetail(LOADING);
    let got: DroneDetailResult | Error;
    try { got = await this.host.client.droneDetail(key as DroneSession['key'], head); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    // Stale: another request, a close, another drone or another scan took over meanwhile. Its "loading"
    // is forgotten, so coming back to this drone asks again (Qodo PR #167 7fdffd82).
    if (gen !== this.detailGen || this.host.view.selectedDrone !== key || this.data?.head !== head) {
      if (this.detail?.gen === gen) this.detail = null;
      return;
    }
    const state = detailState(got, key, head);
    this.detail = { key, head, state, gen };
    this.panel.showDetail(state);
    this.say(state, selected);
  }

  /** A click on the view: selects the drone under it and opens its panel. False when none is there. */
  pick(cssX: number, cssY: number, pose: OrbitPose, frame: number): boolean {
    const key = this.host.view.pickDroneAt(cssX, cssY, pose, frame);
    const s = key === null ? undefined : this.shown.find((d) => d.key === key);
    if (!s) return false;
    this.host.view.selectedDrone = s.key;
    this.host.announce(`selected a ${s.tool} agent session`);
    this.showPanel(s);
    this.host.redraw();
    return true;
  }

  /** The selected drone when its panel lists files: an agent session, not an inferred one. */
  private openAgentSession(): DroneSession | undefined {
    const s = this.shown.find((d) => d.key === this.host.view.selectedDrone);
    return s && !s.inferred ? s : undefined;
  }

  /** Forgets the open panel's detail and drops any answer still out for it. */
  private dropDetail(): void {
    this.detailGen++;
    this.detail = null;
  }

  deselect(): void {
    this.dropDetail();
    if (this.host.view.selectedDrone === null && !this.panelOpen()) return;
    this.host.view.selectedDrone = null;
    const hadFocus = this.panelOpen() && byId('drone-panel').contains(document.activeElement);
    this.panel.hide();
    if (hadFocus) this.host.release(); // the focused button just went away: keys keep working on the view
    this.host.redraw();
  }

  private panelOpen(): boolean { return !byId('drone-panel').hidden; }
}
