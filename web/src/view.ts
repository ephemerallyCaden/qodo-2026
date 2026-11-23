// The view: one star system drawn through the pixel pass, with labels on top. A frame is a pure
// function of (layout, fog, camera pose, focus, frame number); nothing here keeps time.
import type { RenderStats } from '../../src/core/contract/api.js';
import type { BeaconView } from '../../src/core/contract/beacons.js';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { fovOf, pick, project, projectedRadius, startPose, type OrbitPose } from './camera/pose.js';
import { ViewError } from './data/client.js';
import { beaconSpots, spotBody } from './model/beacons.js';
import { FogLedger } from './model/fog.js';
import { focusedNotes, infoLines, HELP, type BeaconInfo } from './model/describe.js';
import { systemModel, type SystemModel } from './model/system.js';
import { LabelLayer, labelBox, lineHeight, type Label } from './labels/overlay.js';
import { clearOf, placeLabels, type Rect } from './labels/place.js';
import { BEACON_MARK } from './render/beacons.js';
import { SHARED } from './render/materials.js';
import { PixelPass } from './render/pixel.js';
import { DroneFleet, type FleetEntry } from './render/drone-fleet.js';
import { capLabels } from './drones/select.js';
import { SystemScene } from './render/scene.js';
import { starOccluders } from './render/corona.js';

import { UI_COLOURS } from './ui/colours.js';
import type { Occluder, Sphere } from './model/vec.js';

/** A drone's smallest clickable size, as a share of half the frame height (a planet's is 0.04). */
const DRONE_MIN_NDC = 0.015;

/** At most this many labels per frame (system design §7). */
export const MAX_LABELS = 50;
/** Of them, at most this many go to drones. */
const MAX_DRONE_LABELS = 8;
/** The focused planet's newest beacon notes labelled over its marker (#79); the rest are counted in one more line. */
const MAX_NOTE_LABELS = 3;
/** A note label's longest text; the whole note is in the screen-reader summary and `commet beacon list`. */
const NOTE_LABEL_CHARS = 48;

/** The star's disc and corona at a frame: they hide the planets and drones behind them from picking and labels. */
const starBlockers = (s: SystemScene, frame: number): Occluder[] => starOccluders(s.model.star.radius, frame);

export class View {
  readonly pass: PixelPass;
  readonly labels: LabelLayer;
  private system: SystemScene | null = null;
  /** The fog drawn, the fronts in progress and the fog tickets (model/fog.ts). */
  private readonly fogs = new FogLedger();
  private lastFrame = 0;
  private reduced = false;
  /** Called once each time a fog is applied (applyFog, or load()'s own fog when it wins), never for a stale one. */
  onFog?: (fog: FogView | null) => void;
  /** The drones drawn (#80), kept across layout reloads, and the selected one's session key. */
  private drones: readonly FleetEntry[] = [];
  /** The head the kept drones belong to, and the head of the layout drawn: drones only ever show over their own scan's layout. */
  private dronesHead: string | null = null;
  private layoutHead: string | null = null;
  selectedDrone: string | null = null;
  /** The beacons drawn (#79), kept across layout reloads of the same scan, and the head they belong to. */
  private beaconView: BeaconView | null = null;
  private beaconHead: string | null = null;
  /** The per-pixel depth fade (RenderInput.depthFade); off leaves only palette colours. */
  depthFade = true;
  showHelp = true;
  /** The parts of the label canvas the open panels cover (#169), read every frame: note and drone labels move out from under them. */
  covered: () => readonly Rect[] = () => [];
  constructor(viewCanvas: HTMLCanvasElement, labelCanvas: HTMLCanvasElement) {
    this.pass = new PixelPass(viewCanvas);
    this.labels = new LabelLayer(labelCanvas);
  }

  get model(): SystemModel | null { return this.system?.model ?? null; }

  /** The beacons drawn over the current layout, for the info lines and summary; null when none are loaded. */
  get beacons(): BeaconInfo | null {
    const m = this.system?.model;
    return m && this.beaconView && this.beaconHead === this.layoutHead ? beaconSpots(this.beaconView, m) : null;
  }

  /** The fog drawn: the last one applied. null: no usable fog view, so every file is drawn fogged (Rule 1). */
  get fog(): FogView | null { return this.fogs.fog; }

  /** What the last applied fog changed for the files drawn (announced even under reduced motion, which draws no front). */
  get fogChange(): { cleared: number; refogged: number } { return this.fogs.change; }

  /** Why the fog isn't drawn from a view (every file drawn fogged), for the status line; null when it is. */
  get fogNotice(): string | null {
    if (this.fogs.fog) return null;
    return this.fogs.mismatch ? 'the fog and the layout come from different scans' : 'no fog view';
  }

  /**
   * Reduced motion (art-direction §7): fog changes snap to their end, with no fronts, and turning it
   * on ends any front in progress.
   */
  set reducedMotion(on: boolean) {
    this.reduced = on;
    if (on && this.fogs.settle()) this.pushFog();
  }

  /** Take one before sending any request whose answer carries a FogView (GET /api/fog, POST /api/chart's ChartResult.fog). */
  fogTicket(): number { return this.fogs.ticket(); }

  /**
   * Applies a fog answer: the one entry point for every fog change (#74; #75's chart panel calls it
   * with ChartResult.fog). `fog: null` means no usable fog view, drawn as all fogged (Rule 1), and so
   * is a fog from another scan than the layout. Files whose state changed get a clear or refog front
   * from the last drawn frame (none under reduced motion). Returns false, and changes nothing, when
   * an answer to a later ticket was already applied, so an older answer never lands over a newer
   * one. Calls onFog when applied; wake the loop afterwards to redraw.
   */
  applyFog(fog: FogView | null, ticket: number): boolean {
    return this.applyWith(fog, ticket, !this.reduced);
  }

  private applyWith(fog: FogView | null, ticket: number, animate: boolean): boolean {
    if (!this.fogs.apply(fog, ticket, this.system?.fileIds() ?? [], this.lastFrame, animate)) return false;
    this.pushFog();
    this.onFog?.(this.fogs.fog);
    return true;
  }

  private pushFog(): void { this.system?.setFog(this.fogs.fog, this.fogs.events); }

  /**
   * Builds the scene for a layout and compiles its shaders, so the first frame draws fully. `fog` is
   * the answer to `ticket` (take it before fetching): it goes through applyFog, so a newer fog
   * already applied wins. `animate: false` (the render hook) snaps any change, so a frame stays a
   * pure function of its input.
   */
  async load(layout: LayoutV1, fog: FogView | null = null, opts: { ticket?: number; animate?: boolean } = {}): Promise<void> {
    const ticket = opts.ticket ?? this.fogTicket();
    const animate = opts.animate !== false && !this.reduced;
    const next = new SystemScene(systemModel(layout));
    try {
      next.fleet.set(this.dronesHead === layout.source.head ? this.drones : []);
      next.beacons.set(this.beaconHead === layout.source.head ? beaconSpots(this.beaconView, next.model).spots : []);
      next.pose(0, startPose(next.model), this.pass.height);
      // Compile every program up front, hidden ones (small planets' cloud shadows) included, and force
      // three's error check, which it otherwise defers to a program's first draw.
      this.pass.takeShaderErrors();
      next.scene.traverse((o) => { o.visible = true; });
      await this.pass.renderer.compileAsync(next.scene, next.camera);
      for (const program of this.pass.renderer.info.programs ?? []) program.getUniforms();
      const failed = this.pass.takeShaderErrors();
      if (failed.length > 0) throw new ViewError('The view could not compile its shaders.', failed);
    } catch (e) {
      next.dispose(); // a failed load never leaks its half-built scene; the old one stays shown
      throw e;
    }
    this.system?.dispose();
    this.system = next;
    this.layoutHead = layout.source.head;
    // The fog already drawn stays when it is newer than this load's, but only for the same scan;
    // fronts in progress carry over, by file.
    const dropped = this.fogs.setLayout(layout.source.head, animate);
    this.pushFog();
    if (!this.applyWith(fog, ticket, animate) && dropped) this.onFog?.(null);
  }

  /**
   * Draws these drones (#80), which belong to the scan `head`, compiling their shader first. Returns false,
   * changing nothing, when the drawn layout is of another scan or was replaced while compiling (the
   * caller's answer is then stale). A compile failure throws a ViewError and keeps the old drones.
   */
  async setDrones(entries: readonly FleetEntry[], head: string): Promise<boolean> {
    const s = this.system;
    if (!s) { this.drones = entries; this.dronesHead = head; return true; }
    if (head !== this.layoutHead) return false;
    // Compile on a fleet that isn't in the scene, so a failure (or a stale answer) never reaches a drawn frame.
    // The probe lives until the real fleet exists: its materials keep the compiled program alive for them.
    const probe = new DroneFleet();
    try {
      if (entries.length > 0) {
        probe.set(entries);
        this.pass.takeShaderErrors();
        probe.group.traverse((o) => { o.visible = true; });
        await this.pass.renderer.compileAsync(probe.group, s.camera);
        for (const program of this.pass.renderer.info.programs ?? []) program.getUniforms();
        const failed = this.pass.takeShaderErrors();
        if (failed.length > 0) throw new ViewError('The view could not compile the drone shader.', failed);
      }
      if (this.system !== s || head !== this.layoutHead) return false; // a layout reload replaced the scene meanwhile
      s.fleet.set(entries);
    } finally {
      probe.dispose();
    }
    this.drones = entries;
    this.dronesHead = head;
    return true;
  }

  /**
   * Draws these beacons (#79; null: none), which belong to the scan `head`. Returns false, changing
   * nothing, when the drawn layout is of another scan (the answer is stale); before any layout they're
   * kept for the first load of that head. The marker's shader is built with the scene, so nothing compiles here.
   */
  setBeacons(view: BeaconView | null, head: string): boolean {
    const s = this.system;
    if (s && head !== this.layoutHead) return false;
    this.beaconView = view;
    this.beaconHead = head;
    s?.beacons.set(beaconSpots(view, s.model).spots);
    return true;
  }

  /** Fits the view to the space available (CSS px) at the device pixel ratio. */
  resize(pixelHeight: number, cssW: number, cssH: number, dpr: number): void {
    this.pass.resize(pixelHeight, Math.floor(cssW * dpr), Math.floor(cssH * dpr), dpr);
    const c = this.pass.canvas;
    this.labels.resize(c.width, c.height, c.style.width, c.style.height, this.pass.scale);
  }

  /**
   * Where the info lines in the top left end for this focus, in device px of the label canvas: the selected
   * drone's panel docks under them there (#189).
   */
  infoEnd(focus: number | null): number {
    const m = this.system?.model;
    if (!m) return 0;
    const px = this.labels.px;
    return 2 * px + infoLines(m, focus, this.fogs.fog, this.beacons).length * lineHeight(px);
  }

  /** Draws exactly this frame. */
  draw(frame: number, pose: OrbitPose, focus: number | null): RenderStats {
    const s = this.system;
    if (!s) throw new Error('nothing loaded');
    SHARED.uDepthOn.value = this.depthFade;
    this.lastFrame = frame;
    if (this.fogs.prune(frame)) this.pushFog();
    s.pose(frame, pose, this.pass.height);
    const stats = this.pass.render(s.scene, s.camera);
    this.labels.draw(this.labelsFor(s, frame, pose, focus));
    return stats;
  }

  private labelsFor(s: SystemScene, frame: number, pose: OrbitPose, focus: number | null): Label[] {
    const W = this.pass.canvas.width, H = this.pass.canvas.height, px = this.labels.px, lh = lineHeight(px);
    const { ink, accent: mark, dim } = UI_COLOURS;
    const out: Label[] = [];
    const beacons = this.beacons;
    const covers = this.covered();
    infoLines(s.model, focus, this.fogs.fog, beacons).forEach((text, k) => out.push({ text, x: 2 * px, y: 2 * px + k * lh, align: 'left', colour: k === 0 && focus !== null ? mark : ink }));
    if (this.showHelp) out.push({ text: HELP, x: 2 * px, y: H - lh, align: 'left', colour: dim });
    out.push(...this.clear(this.noteLabels(s, frame, pose, focus, beacons, H, lh), covers, W, H));
    // drone labels come first in the budget (a few at most), so a busy system never drops a selected drone's name
    const drones = this.droneLabels(s, frame, pose, W, H, 2 * px, MAX_DRONE_LABELS).map((l) => this.clear([l], covers, W, H)[0]!);
    for (const l of placeLabels(pose, s.spheres(frame), starBlockers(s, frame), W, H, 2 * px, MAX_LABELS - out.length - drones.length)) {
      out.push({ text: s.model.planets[l.i]!.path, x: l.x, y: l.y, align: 'centre', colour: l.i === focus ? mark : ink });
    }
    out.push(...drones);
    return out;
  }

  /**
   * The beacon notes (#79) of the body in view, the focused planet or in free flight the star (Qodo
   * 36a4f942), newest nearest, stacked over its marker: the marker stands BEACON_MARK.gap internal px
   * above the disc's top (render/beacons.ts), so the labels sit above that. Bitmap glyphs only, never HTML.
   */
  private noteLabels(s: SystemScene, frame: number, pose: OrbitPose, focus: number | null, beacons: BeaconInfo | null, H: number, lh: number): Label[] {
    const notes = focusedNotes(beacons, focus);
    const spot = beacons?.spots.find((x) => x.planet === (focus ?? -1));
    if (notes.length === 0 || !spot) return [];
    const body = spotBody(s.model, spot, frame);
    const at = project(pose, body.centre);
    if (!at) return [];
    const x = ((at.x + 1) / 2) * this.pass.canvas.width;
    const top = ((1 - at.y) / 2) * H - projectedRadius(body.radius, at.depth, fovOf(pose)) * (H / 2) - (BEACON_MARK.gap + BEACON_MARK.size + 1) * this.pass.scale;
    const short = (t: string) => ([...t].length > NOTE_LABEL_CHARS ? `${[...t].slice(0, NOTE_LABEL_CHARS - 3).join('')}...` : t);
    const lines = notes.slice(0, MAX_NOTE_LABELS).map(short);
    if (notes.length > MAX_NOTE_LABELS) lines.push(`+${notes.length - MAX_NOTE_LABELS} more`);
    return lines.map((text, k) => ({ text, x, y: top - (k + 1) * lh, align: 'centre', colour: k === 0 ? UI_COLOURS.ink : UI_COLOURS.dim }));
  }

  /**
   * Moves these labels as one block, as little as it can, fully into the W×H frame and out from under
   * the open panels (#169: they are DOM laid over the label canvas, so a label under one can't be read).
   */
  private clear(group: Label[], covers: readonly Rect[], W: number, H: number): Label[] {
    if (group.length === 0) return group;
    const px = this.labels.px;
    const boxes = group.map((l) => labelBox(l, px));
    const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
    const block = { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
    const { dx, dy } = clearOf(block, covers, W, H, 2 * px);
    return group.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
  }

  /** Labels for the drones that have one (the generic drone's tool, "inferred") and the selected drone, under each. */
  private droneLabels(s: SystemScene, frame: number, pose: OrbitPose, W: number, H: number, gap: number, max: number): Label[] {
    const entries = s.fleet.entries;
    if (!entries.some((e) => e.label !== null || e.key === this.selectedDrone)) return [];
    const at = s.fleet.spheres(s.model, frame); // null: its home isn't in this layout, so it isn't drawn and has no label
    const wanted = entries.flatMap((e, i) => (at[i] && (e.label !== null || e.key === this.selectedDrone) ? [i] : []));
    const spheres = wanted.map((i) => at[i]!);
    const blockers = [...s.spheres(frame), ...starBlockers(s, frame)];
    const selected = (l: { i: number }) => entries[wanted[l.i]!]!.key === this.selectedDrone;
    return capLabels(placeLabels(pose, spheres, blockers, W, H, gap, spheres.length), selected, max).map((l) => {
      const e = entries[wanted[l.i]!]!;
      const sel = e.key === this.selectedDrone;
      return { text: sel ? e.selectedLabel : e.label!, x: l.x, y: l.y, align: 'centre', colour: sel ? UI_COLOURS.accent : UI_COLOURS.ink };
    });
  }

  /** The planet under a point of the view canvas (CSS px from its top-left), or null. */
  pickAt(cssX: number, cssY: number, pose: OrbitPose, frame: number): number | null {
    const s = this.system;
    if (!s) return null;
    const c = this.pass.canvas.getBoundingClientRect();
    const ndc = { x: (cssX / c.width) * 2 - 1, y: 1 - (cssY / c.height) * 2 };
    return pick(pose, ndc, s.spheres(frame), starBlockers(s, frame)); // the star and its corona hide what is behind them
  }

  /**
   * The session key of the drone under a point of the view canvas, or null. Everything drawn in front hides it
   * (planets, moons, moonlets, the star and its corona, at their real size), and a drone is only as clickable as its own
   * pick sphere plus a small screen minimum: the planets' bigger floor would let a click beside it select it.
   */
  pickDroneAt(cssX: number, cssY: number, pose: OrbitPose, frame: number): string | null {
    const s = this.system;
    if (!s || s.fleet.entries.length === 0) return null;
    const c = this.pass.canvas.getBoundingClientRect();
    const ndc = { x: (cssX / c.width) * 2 - 1, y: 1 - (cssY / c.height) * 2 };
    const at = s.fleet.spheres(s.model, frame);
    const drawn = at.flatMap((d, i) => (d ? [i] : []));
    const hit = pick(pose, ndc, drawn.map((i) => at[i]!), [...starBlockers(s, frame), ...s.spheres(frame), ...s.smallBodies(frame)], DRONE_MIN_NDC);
    return hit === null ? null : s.fleet.entries[drawn[hit]!]!.key;
  }

  /** What focusing planet i targets: its sphere at this frame (the hero framing fills 45% of the frame with it). */
  focusTarget(i: number, frame: number): Sphere | null {
    return this.system?.spheres(frame)[i] ?? null;
  }

  pixels() { return this.pass.pixels(); }
}
