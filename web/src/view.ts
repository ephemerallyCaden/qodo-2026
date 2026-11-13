// The view: one star system drawn through the pixel pass, with labels on top. A frame is a pure
// function of (layout, fog, camera pose, focus, frame number); nothing here keeps time.
import type { RenderStats } from '../../src/core/contract/api.js';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { pick, startPose, type OrbitPose } from './camera/pose.js';
import { ViewError } from './data/client.js';
import { infoLines, HELP } from './model/describe.js';
import { systemModel, type SystemModel } from './model/system.js';
import { LabelLayer, lineHeight, type Label } from './labels/overlay.js';
import { placeLabels } from './labels/place.js';
import { SHARED } from './render/materials.js';
import { PixelPass } from './render/pixel.js';
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
  /** Accepted but not drawn yet: fog visuals aren't designed (#30 scope). */
  fog: FogView | null = null;
  /** The per-pixel depth fade (RenderInput.depthFade); off leaves only palette colours. */
  depthFade = true;
  showHelp = true;
  /** Told of every fog applyFog takes (#75: the review panel follows it). */
  onFog: ((fog: FogView | null) => void) | null = null;
  private fogTickets = 0;
  private fogApplied = 0;

  /** Take one before sending any request whose answer carries a FogView (GET /api/fog, POST /api/chart). Minimal until #74. */
  fogTicket(): number { return ++this.fogTickets; }

  /**
   * The one entry point for a fog answer. Returns false, changing nothing, when an answer to a later
   * ticket was already applied, so an older GET never lands over a newer chart result. #74 adds the
   * clear and refog fronts.
   */
  applyFog(fog: FogView | null, ticket: number): boolean {
    if (ticket < this.fogApplied) return false;
    this.fogApplied = ticket;
    this.fog = fog;
    this.onFog?.(fog);
    return true;
  }

  constructor(viewCanvas: HTMLCanvasElement, labelCanvas: HTMLCanvasElement) {
    this.pass = new PixelPass(viewCanvas);
    this.labels = new LabelLayer(labelCanvas);
  }

  get model(): SystemModel | null { return this.system?.model ?? null; }

  /**
   * Builds the scene for a layout and compiles its shaders, so the first frame draws fully.
   * `opts.ticket` is the fog ticket taken before `fog` was requested: the fog goes through applyFog, so one
   * fetched before a newer fog was applied never replaces it (PR #108 r1 #1). Default: a fresh ticket.
   */
  async load(layout: LayoutV1, fog: FogView | null = null, opts: { ticket?: number } = {}): Promise<void> {
    const ticket = opts.ticket ?? this.fogTicket();
    const next = new SystemScene(systemModel(layout));
    try {
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
    this.applyFog(fog, ticket);
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
    s.pose(frame, pose, this.pass.height);
    const stats = this.pass.render(s.scene, s.camera);
    this.labels.draw(this.labelsFor(s, frame, pose, focus));
    return stats;
  }

  private labelsFor(s: SystemScene, frame: number, pose: OrbitPose, focus: number | null): Label[] {
    const W = this.pass.canvas.width, H = this.pass.canvas.height, px = this.labels.px, lh = lineHeight(px);
    const { ink, accent: mark, dim } = UI_COLOURS;
    const out: Label[] = [];
    infoLines(s.model, focus).forEach((text, k) => out.push({ text, x: 2 * px, y: 2 * px + k * lh, align: 'left', colour: k === 0 && focus !== null ? mark : ink }));
    if (this.showHelp) out.push({ text: HELP, x: 2 * px, y: H - lh, align: 'left', colour: dim });
    for (const l of placeLabels(pose, s.spheres(frame), [starSphere(s)], W, H, 2 * px, MAX_LABELS - out.length)) {
      out.push({ text: s.model.planets[l.i]!.path, x: l.x, y: l.y, align: 'centre', colour: l.i === focus ? mark : ink });
    }
    return out;
  }

  /** The planet under a point of the view canvas (CSS px from its top-left), or null. */
  pickAt(cssX: number, cssY: number, pose: OrbitPose, frame: number): number | null {
    const s = this.system;
    if (!s) return null;
    const c = this.pass.canvas.getBoundingClientRect();
    const ndc = { x: (cssX / c.width) * 2 - 1, y: 1 - (cssY / c.height) * 2 };
    return pick(pose, ndc, s.spheres(frame), [starSphere(s)]); // the star hides what is behind it
  }

  /** What focusing planet i targets: its sphere at this frame (the hero framing fills 45% of the frame with it). */
  focusTarget(i: number, frame: number): Sphere | null {
    return this.system?.spheres(frame)[i] ?? null;
  }

  pixels() { return this.pass.pixels(); }
}
