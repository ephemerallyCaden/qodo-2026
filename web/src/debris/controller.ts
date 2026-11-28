// The debris in live mode (R13): fetch GET /api/debris, draw its placed pieces over the layout of the same scan (a
// piece gone since the last load sweeps), say it in the HUD, and open the panel of a clicked piece, whose branch,
// commit and commands come from GET /api/debris-detail, once per selection, for the drawn head only. A failed fetch
// is announced and never blocks the map, as the crew's is (crew/controller.ts, the pattern this follows).
import type { DebrisId, DebrisView } from '../../../src/core/contract/debris.js';
import type { OrbitPose } from '../camera/pose.js';
import { ViewError, type DataClient } from '../data/client.js';
import { chooseDock, DOCK_INSET } from '../drones/dock.js';
import type { Rect } from '../labels/place.js';
import { CLASS_LABEL } from '../render/debris-kits.js';
import { byId } from '../ui/dom.js';
import type { View } from '../view.js';
import { DEBRIS_LOADING, debrisAnnouncement, debrisDetailState, debrisName, type DebrisDetailState } from './detail.js';
import { DebrisPanel } from './panel.js';
import { debrisStatus, drawables } from './select.js';
import { pieceTrack } from './state.js';

export interface DebrisHost {
  view: View;
  client: Pick<DataClient, 'debris' | 'debrisDetail'>;
  /** Polite screen-reader and status-line announcement. */
  announce(text: string): void;
  /** Something changed that needs a redraw. */
  redraw(): void;
  /** Hands keyboard focus back to the 3D view. */
  release(): void;
  /** The other panels laid over the view, which the debris panel docks clear of when they're open. */
  others(): readonly HTMLElement[];
  /** The bodies drawing debris changed: the start pose that frames their shells moved. */
  reframe(): void;
}

const short = (head: string) => head.slice(0, 7);
const boxOf = (e: HTMLElement): Rect | null => {
  if (e.hidden) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};
const describe = (e: unknown): string => (e instanceof ViewError ? e.title : 'something went wrong');

export class Debris {
  private readonly panel = new DebrisPanel();
  private readonly line = byId<HTMLParagraphElement>('debris-hud');
  /** The debris view drawn: always of the drawn layout's head, or null. */
  private data: DebrisView | null = null;
  private gen = 0;
  /** Why the latest refresh didn't apply, shown beside the HUD line until a matching one does. */
  private note = '';
  /** The open panel's detail: which piece, of which head, what it shows, and the request (gen) behind it. */
  private detail: { id: string; head: string; state: DebrisDetailState; gen: number } | null = null;
  private detailGen = 0;

  constructor(private readonly host: DebrisHost) {
    this.panel.onClose = () => { this.deselect(); host.release(); };
    this.panel.onCopy = (label, how) => host.announce(how === 'copied' ? `${label} command copied: run it in a terminal yourself` : `the browser can't copy here: the ${label} command is selected, copy it yourself`);
  }

  /**
   * Fetches the debris and draws it over the layout of `head` (null: none drawn yet). One of another scan is not
   * applied (#64); the previous one stays when it's of this head. The newest request wins.
   */
  async refresh(head: string | null): Promise<void> {
    if (head === null) return;
    const gen = ++this.gen;
    this.dropDetail(); // a refresh means a new scan: the open panel asks again, and an answer still out is dropped
    if (this.data && this.data.head !== head) { this.data = null; this.deselect(); }
    let got: DebrisView | Error;
    try { got = await this.host.client.debris(); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    if (gen !== this.gen) return;
    if (got instanceof Error) {
      this.note = `update failed: ${describe(got)}`;
      this.host.announce(`debris unavailable: ${describe(got)}`);
    } else if (got.head !== head) {
      this.note = `update of ${short(got.head)} not applied: other scan`;
      this.host.announce(`debris not applied: it is of ${short(got.head)} but the layout of ${short(head)} (different scans); waiting for the next update`);
    } else {
      this.note = '';
      const homes = (this.host.view.model?.debrisHomes ?? []).join();
      if (!this.host.view.setDebris(drawables(got), head)) return; // the layout moved on meanwhile: its own refresh follows
      this.data = got;
      if ((this.host.view.model?.debrisHomes ?? []).join() !== homes) this.host.reframe(); // Home's framing follows the shells
    }
    const kept = this.data?.head === head ? this.data : null;
    const overCap = [...(this.host.view.debris.plan?.overflow.values() ?? [])].reduce((a, b) => a + b, 0);
    this.line.textContent = (kept ? debrisStatus(kept, overCap) : 'debris: none loaded') + (this.note ? ` (${this.note})` : '');
    const open = this.selected();
    if (open !== null) this.showDetail(open, false);
    else this.deselect();
    this.host.redraw();
  }

  /** The planet's path for a home, from the map drawn; null when it isn't on it. */
  private readonly nameOf = (home: string): string | null => this.host.view.model?.planets.find((p) => p.dirId === home)?.path ?? null;

  private showDetail(id: string, selected: boolean): void {
    const head = this.data?.head;
    if (head === undefined) return;
    const had = this.detail;
    if (had && had.id === id && had.head === head && had.state.kind !== 'failed') {
      this.panel.showDetail(had.state, this.nameOf);
      if (selected) this.say(had.state, true);
      return;
    }
    void this.loadDetail(id, head, selected);
  }

  /** One short line per answer, said when the user picked the piece, and a failure once in any case. */
  private say(state: DebrisDetailState, selected: boolean): void {
    const line = debrisAnnouncement(state);
    if (line !== null && (selected || state.kind === 'failed')) this.host.announce(line);
  }

  private async loadDetail(id: string, head: string, selected: boolean): Promise<void> {
    const gen = ++this.detailGen;
    this.detail = { id, head, state: DEBRIS_LOADING, gen };
    this.panel.showDetail(DEBRIS_LOADING, this.nameOf);
    let got: Awaited<ReturnType<DebrisHost['client']['debrisDetail']>> | Error;
    try { got = await this.host.client.debrisDetail(id as DebrisId, head); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    if (gen !== this.detailGen || this.host.view.debris.selected !== id || this.data?.head !== head) {
      if (this.detail?.gen === gen) this.detail = null;
      return;
    }
    const state = debrisDetailState(got, id, head);
    this.detail = { id, head, state, gen };
    this.panel.showDetail(state, this.nameOf);
    // the selected piece's name under it, once the server says what it is
    this.host.view.debris.selectedName = state.kind === 'ready' ? debrisName(state.detail, 32) : '';
    this.say(state, selected);
    this.host.redraw();
  }

  /** A click on the view: selects the piece of debris under it and opens its panel. False when none is there. */
  pick(cssX: number, cssY: number, pose: OrbitPose, frame: number): boolean {
    const id = this.host.view.pickDebrisAt(cssX, cssY, pose, frame);
    const piece = this.host.view.debrisPiece(id);
    if (id === null || !piece) return false;
    const state = this.host.view.debris;
    state.selected = id;
    state.selectedName = '';
    this.host.announce(`selected a piece of debris: ${CLASS_LABEL[piece.cls]}`);
    this.panel.show(piece.cls);
    this.showDetail(id, true);
    this.host.redraw();
    return true;
  }

  /** Docks the open panel clear of the selected piece's orbit (drones/dock.ts). Call it with every drawn frame, before the labels. */
  dock(frame: number, pose: OrbitPose, focus: number | null): void {
    if (!this.panel.open) return;
    const view = this.host.view, model = view.model, piece = view.debrisPiece(view.debris.selected);
    if (!model || !piece) return;
    const canvas = view.labels.canvas, c = canvas.getBoundingClientRect();
    if (c.width === 0 || c.height === 0 || canvas.height === 0) return;
    const topLeft = Math.round(c.top + (view.infoEnd(focus) * c.height) / canvas.height + DOCK_INSET.side);
    const input = {
      track: pieceTrack(model, piece, frame, pose, { x: c.left, y: c.top, w: c.width, h: c.height }),
      panel: this.panel.size(), window: { w: innerWidth, h: innerHeight }, topLeft,
      others: this.host.others().flatMap((e) => boxOf(e) ?? []),
    };
    this.panel.dock(chooseDock(input, this.panel.docked), topLeft);
  }

  /** The selected piece's id, while it is still drawn at rest. */
  private selected(): string | null {
    const id = this.host.view.debris.selected;
    return id !== null && this.host.view.debrisPiece(id) ? id : null;
  }

  private dropDetail(): void {
    this.detailGen++;
    this.detail = null;
  }

  deselect(): void {
    this.dropDetail();
    const state = this.host.view.debris;
    if (state.selected === null && !this.panel.open) return;
    state.deselect();
    const hadFocus = this.panel.open && byId('debris-panel').contains(document.activeElement);
    this.panel.hide();
    if (hadFocus) this.host.release();
    this.host.redraw();
  }
}
