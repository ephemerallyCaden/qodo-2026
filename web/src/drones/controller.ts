// Drones in live mode (#80): fetch GET /api/drones, pair it with the drawn layout, choose what to draw
// (select.ts), say it in the HUD and open the panel of a clicked drone. A failed fetch is announced and
// never blocks the map, as the fog's is. Everything the view needs from here is a call or two.
import type { DroneSession, DroneView } from '../../../src/core/contract/drones.js';
import type { OrbitPose } from '../camera/pose.js';
import { ViewError, type DataClient } from '../data/client.js';
import { byId } from '../ui/dom.js';
import type { View } from '../view.js';
import { DronePanel } from './panel.js';
import { droneStatus, entryOf, selectDrones } from './select.js';

export interface DronesHost {
  view: View;
  client: Pick<DataClient, 'drones'>;
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
    let got: DroneView | Error;
    try { got = await this.host.client.drones(); } catch (e) { got = e instanceof Error ? e : new Error(String(e)); }
    if (gen !== this.gen) return; // a newer refresh is on its way
    const had = this.data?.head === head ? this.data : null;
    if (got instanceof Error) {
      this.host.announce(`drones unavailable: ${describe(got)}`);
      await this.apply(had);
    } else if (got.head !== head) {
      this.host.announce(`drones not applied: they are of ${short(got.head)} but the layout of ${short(head)} (different scans); waiting for the next update`);
      await this.apply(had);
    } else await this.apply(got);
  }

  /** Draws `data` (null: no drones), after the layout or the drones changed. */
  private async apply(data: DroneView | null): Promise<void> {
    const model = this.host.view.model;
    this.data = data;
    if (!model || !data) {
      this.shown = [];
      this.line.textContent = data ? '' : 'drones: none loaded';
      await this.host.view.setDrones([]).catch(() => {});
      this.deselect();
      this.host.redraw();
      return;
    }
    const planets = new Set<string>(model.planets.map((p) => p.dirId));
    const sel = selectDrones(data, (h) => h === 'star' || planets.has(h));
    try {
      await this.host.view.setDrones(sel.shown.map(entryOf));
    } catch (e) {
      this.host.announce(`drones not drawn: ${describe(e)}`);
      return;
    }
    this.shown = sel.shown;
    this.line.textContent = droneStatus(sel);
    if (this.host.view.selectedDrone && !sel.shown.some((s) => s.key === this.host.view.selectedDrone)) this.deselect();
    this.host.redraw();
  }

  /** A click on the view: selects the drone under it and opens its panel. False when none is there. */
  pick(cssX: number, cssY: number, pose: OrbitPose, frame: number): boolean {
    const key = this.host.view.pickDroneAt(cssX, cssY, pose, frame);
    const s = key === null ? undefined : this.shown.find((d) => d.key === key);
    if (!s) return false;
    this.host.view.selectedDrone = s.key;
    const home = s.home === 'star' || s.home === null ? 'the star' : this.host.view.model?.planets.find((p) => p.dirId === s.home)?.path ?? 'unknown';
    this.panel.show(s, home);
    this.host.announce(`selected a ${s.tool} agent session`);
    this.host.redraw();
    return true;
  }

  deselect(): void {
    if (this.host.view.selectedDrone === null && !this.panelOpen()) return;
    this.host.view.selectedDrone = null;
    this.panel.hide();
    this.host.redraw();
  }

  private panelOpen(): boolean { return !byId('drone-panel').hidden; }
}
