// The view: one star system drawn through the pixel pass, with labels on top. A frame is a pure
// function of (layout, fog, camera pose, focus, frame number); nothing here keeps time.
import type { RenderStats } from '../../src/core/contract/api.js';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { pick, startPose, type OrbitPose } from './camera/pose.js';
import { ViewError } from './data/client.js';
import { FogLedger } from './model/fog.js';
import { infoLines, HELP } from './model/describe.js';
import { systemModel, type SystemModel } from './model/system.js';
import { LabelLayer, lineHeight, type Label } from './labels/overlay.js';
import { placeLabels } from './labels/place.js';
import { SHARED } from './render/materials.js';
import { PixelPass } from './render/pixel.js';
import type { FleetEntry } from './render/drone-fleet.js';
import { SystemScene } from './render/scene.js';
import { UI_COLOURS } from './ui/colours.js';
import type { Sphere } from './model/vec.js';

/** At most this many labels per frame (system design §7). */
export const MAX_LABELS = 50;

const starSphere = (s: SystemScene): Sphere => ({ centre: [0, 0, 0], radius: s.model.star.radius });

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
  selectedDrone: string | null = null;
  /** The per-pixel depth fade (RenderInput.depthFade); off leaves only palette colours. */
  depthFade = true;
  showHelp = true;
  constructor(viewCanvas: HTMLCanvasElement, labelCanvas: HTMLCanvasElement) {
    this.pass = new PixelPass(viewCanvas);
    this.labels = new LabelLayer(labelCanvas);
  }

  get model(): SystemModel | null { return this.system?.model ?? null; }

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
      next.fleet.set(this.drones);
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
    // The fog already drawn stays when it is newer than this load's, but only for the same scan;
    // fronts in progress carry over, by file.
    const dropped = this.fogs.setLayout(layout.source.head, animate);
    this.pushFog();
    if (!this.applyWith(fog, ticket, animate) && dropped) this.onFog?.(null);
  }

  /** Draws these drones (#80), compiling their shader first; a failure throws a ViewError and keeps the old ones. */
  async setDrones(entries: readonly FleetEntry[]): Promise<void> {
    const s = this.system;
    if (!s) { this.drones = entries; return; }
    const before = s.fleet.entries;
    s.fleet.set(entries);
    try {
      if (entries.length > 0) {
        this.pass.takeShaderErrors();
        s.fleet.group.traverse((o) => { o.visible = true; });
        await this.pass.renderer.compileAsync(s.fleet.group, s.camera);
        for (const program of this.pass.renderer.info.programs ?? []) program.getUniforms();
        const failed = this.pass.takeShaderErrors();
        if (failed.length > 0) throw new ViewError('The view could not compile the drone shader.', failed);
      }
    } catch (e) {
      s.fleet.set(before);
      throw e;
    }
    this.drones = entries;
  }

  /** Fits the view to the space available (CSS px) at the device pixel ratio. */
  resize(pixelHeight: number, cssW: number, cssH: number, dpr: number): void {
    this.pass.resize(pixelHeight, Math.floor(cssW * dpr), Math.floor(cssH * dpr), dpr);
    const c = this.pass.canvas;
    this.labels.resize(c.width, c.height, c.style.width, c.style.height, this.pass.scale);
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
    infoLines(s.model, focus, this.fogs.fog).forEach((text, k) => out.push({ text, x: 2 * px, y: 2 * px + k * lh, align: 'left', colour: k === 0 && focus !== null ? mark : ink }));
    if (this.showHelp) out.push({ text: HELP, x: 2 * px, y: H - lh, align: 'left', colour: dim });
    for (const l of placeLabels(pose, s.spheres(frame), [starSphere(s)], W, H, 2 * px, MAX_LABELS - out.length)) {
      out.push({ text: s.model.planets[l.i]!.path, x: l.x, y: l.y, align: 'centre', colour: l.i === focus ? mark : ink });
    }
    out.push(...this.droneLabels(s, frame, pose, W, H, 2 * px, MAX_LABELS - out.length));
    return out;
  }

  /** Labels for the drones that have one (the generic drone's tool, "inferred") and the selected drone, under each. */
  private droneLabels(s: SystemScene, frame: number, pose: OrbitPose, W: number, H: number, gap: number, max: number): Label[] {
    const entries = s.fleet.entries;
    if (!entries.some((e) => e.label !== null || e.key === this.selectedDrone)) return [];
    const at = s.fleet.spheres(s.model, frame); // null: its home isn't in this layout, so it isn't drawn and has no label
    const wanted = entries.flatMap((e, i) => (at[i] && (e.label !== null || e.key === this.selectedDrone) ? [i] : []));
    const spheres = wanted.map((i) => at[i]!);
    const blockers = [...s.spheres(frame), starSphere(s)];
    return placeLabels(pose, spheres, blockers, W, H, gap, max).map((l) => {
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
    return pick(pose, ndc, s.spheres(frame), [starSphere(s)]); // the star hides what is behind it
  }

  /** The session key of the drone under a point of the view canvas, or null. A planet or the star in front of it hides it. */
  pickDroneAt(cssX: number, cssY: number, pose: OrbitPose, frame: number): string | null {
    const s = this.system;
    if (!s || s.fleet.entries.length === 0) return null;
    const c = this.pass.canvas.getBoundingClientRect();
    const ndc = { x: (cssX / c.width) * 2 - 1, y: 1 - (cssY / c.height) * 2 };
    const at = s.fleet.spheres(s.model, frame);
    const drawn = at.flatMap((d, i) => (d ? [i] : []));
    const hit = pick(pose, ndc, [...drawn.map((i) => at[i]!), ...s.spheres(frame)], [starSphere(s)]);
    return hit !== null && hit < drawn.length ? s.fleet.entries[drawn[hit]!]!.key : null;
  }

  /** What focusing planet i targets: its sphere at this frame (the hero framing fills 45% of the frame with it). */
  focusTarget(i: number, frame: number): Sphere | null {
    return this.system?.spheres(frame)[i] ?? null;
  }

  pixels() { return this.pass.pixels(); }
}
