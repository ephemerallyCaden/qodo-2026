// The view: one star system drawn through the pixel pass, with labels on top. A frame is a pure
// function of (layout, fog, camera pose, focus, frame number); nothing here keeps time.
import type { RenderStats } from '../../src/core/contract/api.js';
import type { BeaconView } from '../../src/core/contract/beacons.js';
import type { CoChangeView } from '../../src/core/contract/cochange.js';
import type { FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { eyeOf, fovOf, pick, project, projectedRadius, startPose, type OrbitPose } from './camera/pose.js';
import { ViewError } from './data/client.js';
import { beaconSpots, spotBody } from './model/beacons.js';
import { FogLedger } from './model/fog.js';
import { focusedNotes, infoLines, HELP, type BeaconInfo } from './model/describe.js';
import { systemModel, type SystemModel } from './model/system.js';
import { LabelLayer, labelBox, lineHeight, type Label } from './labels/overlay.js';
import { textWidth } from './labels/font.js';
import { clearOf, placeLabels, type Placed, type Rect } from './labels/place.js';
import { coChangeIndex, coChangeLines, focusFor, shortName, type CoIndex, type Focus } from './cochange/model.js';
import { OVERLAY_COLOURS, planConstellation, rasterise, type Plan } from './cochange/overlay.js';
import { FPS, LOOP_SECONDS, loopPhase } from './model/motion.js';
import { BEACON_MARK } from './render/beacons.js';
import { SHARED } from './render/materials.js';
import { PixelPass } from './render/pixel.js';
import { DroneFleet, type FleetEntry } from './render/drone-fleet.js';
import { CrewShip, type Rider } from './render/ship.js';
import type { ShipSpec } from './render/ship-spec.js';
import { placeShip, portholes } from './crew/place.js';
import { capLabels } from './drones/select.js';
import { SystemScene } from './render/scene.js';
import { starOccluders } from './render/corona.js';

import { UI_COLOURS } from './ui/colours.js';
import { dot, sub, type Occluder, type Sphere } from './model/vec.js';

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

/** #211: the overlay's colour table as RGB bytes (index 0 draws nothing). */
const OVERLAY_RGB = OVERLAY_COLOURS.map((c) => (c === null ? null : [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))));

/** A crew member's smallest clickable porthole, as a share of half the frame height (a drone's is 0.015). */
const CREW_MIN_NDC = 0.015;

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
  /** The crew aboard (#207: `seats[i]` rides in seat i, null empty), kept across layout reloads of the same scan, its head, and the crew the seats leave out (+N). */
  private crewSeats: readonly (Rider | null)[] = [];
  private crewHead: string | null = null;
  private crewExtra = 0;
  /** The selected crew member's person id, and the name shown under their porthole while selected. */
  selectedPerson: string | null = null;
  selectedName = '';
  /** The beacons drawn (#79), kept across layout reloads of the same scan, and the head they belong to. */
  private beaconView: BeaconView | null = null;
  private beaconHead: string | null = null;
  /** The co-change view drawn (#211), kept across layout reloads of the same scan, the head it belongs to, and its files placed on this layout. */
  private coView: CoChangeView | null = null;
  private coHead: string | null = null;
  private coIndex: CoIndex | null = null;
  /** #211: the focused planet's file whose constellation is drawn (the review panel's open diff), and the frame the focus began (the draw-in). */
  focusFile: string | null = null;
  focusSince = 0;
  /** #211: the edge arrows drawn last frame, in device px of the view canvas, with the body each focuses (-1: the star). */
  private arrows: { box: Rect; body: number }[] = [];
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
      next.crew.set(this.crewHead === layout.source.head ? this.crewSeats : []);
      next.beacons.set(this.beaconHead === layout.source.head ? beaconSpots(this.beaconView, next.model).spots : []);
      next.pose(0, startPose(next.model), this.pass.height);
      // Compile every program up front, hidden ones (small planets' cloud shadows) included, and force
      // three's error check, which it otherwise defers to a program's first draw.
      this.pass.takeShaderErrors();
      next.scene.traverse((o) => { o.visible = true; });
      await this.pass.renderer.compileAsync(next.scene, next.camera);
      this.pass.compileOverlay(); // #211: the constellation overlay's one program
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
    this.coIndex = this.coView && this.coHead === this.layoutHead ? coChangeIndex(this.coView, next.model) : null;
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
   * Draws this crew (#207): `seats[i]` rides in seat i (seat 0 the captain's; null empty), `extra` more are
   * counted in a "+N" label; they belong to the scan `head`. The ship's shaders are compiled first, on a ship
   * that isn't in the scene. Returns false, changing nothing, when the drawn layout is of another scan or was
   * replaced while compiling; a compile failure throws a ViewError and keeps the old crew.
   */
  async setCrew(seats: readonly (Rider | null)[], extra: number, head: string): Promise<boolean> {
    const s = this.system;
    if (!s) { this.crewSeats = seats; this.crewExtra = extra; this.crewHead = head; return true; }
    if (head !== this.layoutHead) return false;
    const probe = new CrewShip();
    try {
      if (seats.length > 0) {
        probe.set(seats);
        probe.pose(s.model, this.lastFrame);
        this.pass.takeShaderErrors();
        probe.group.traverse((o) => { o.visible = true; });
        await this.pass.renderer.compileAsync(probe.group, s.camera);
        for (const program of this.pass.renderer.info.programs ?? []) program.getUniforms();
        const failed = this.pass.takeShaderErrors();
        if (failed.length > 0) throw new ViewError("The view could not compile the crew's ship.", failed);
      }
      if (this.system !== s || head !== this.layoutHead) return false; // a layout reload replaced the scene meanwhile
      s.crew.set(seats);
    } finally {
      probe.dispose();
    }
    this.crewSeats = seats;
    this.crewExtra = extra;
    this.crewHead = head;
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

  /**
   * Draws this co-change view (#211; null: none), which belongs to the scan `head`: the focus's lines and
   * every missing-pair flag. Returns false, changing nothing, when the drawn layout is of another scan;
   * before any layout it's kept for the first load of that head.
   */
  setCoChange(view: CoChangeView | null, head: string): boolean {
    const s = this.system;
    if (s && head !== this.layoutHead) return false;
    this.coView = view;
    this.coHead = head;
    this.coIndex = s && view ? coChangeIndex(view, s.model) : null;
    return true;
  }

  /** #211: the focus's links and the standing flags in words, for the screen-reader summary. */
  coChangeLines(focus: number | null): string[] {
    const m = this.system?.model;
    return m ? coChangeLines(this.coIndex, m, this.focusOf(focus), this.coView?.dismissed ?? 0) : [];
  }

  /** The body an edge arrow drawn at this point of the view canvas (CSS px from its top-left) focuses: a planet's index, -1 the star, or null. */
  arrowAt(cssX: number, cssY: number): number | null {
    const c = this.pass.canvas.getBoundingClientRect();
    if (c.width === 0 || c.height === 0) return null;
    const x = cssX * (this.pass.canvas.width / c.width), y = cssY * (this.pass.canvas.height / c.height);
    return this.arrows.find((a) => x >= a.box.x && x < a.box.x + a.box.w && y >= a.box.y && y < a.box.y + a.box.h)?.body ?? null;
  }

  private focusOf(focus: number | null): Focus | null {
    return focusFor(this.coIndex, focus, this.focusFile);
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
    // #211: the constellation's geometry first (its labels go with the others), then the scene, then the
    // overlay fitted around what the scene drew and every label, then the labels.
    const scale = this.pass.scale, px = this.labels.px;
    const plan = planConstellation({ model: s.model, index: this.coIndex, focus: this.focusOf(focus), frame, pose, W: this.pass.width, H: this.pass.height,
      textW: (t) => (textWidth(t) * px) / scale });
    const labels = this.labelsFor(s, frame, pose, focus, plan);
    const boxes = labels.map((l) => { const b = labelBox(l, px); return { x: b.x / scale, y: b.y / scale, w: b.w / scale, h: b.h / scale }; });
    const since = Math.max(0, frame - this.focusSince) / FPS;
    const stats = this.pass.render(s.scene, s.camera, (pixels) => {
      const ov = rasterise(plan, { pixels, W: this.pass.width, H: this.pass.height, labels: boxes, since, reduced: this.reduced, frame });
      if (!ov) return null;
      const rgba = new Uint8Array(ov.length * 4);
      ov.forEach((c, i) => { const rgb = OVERLAY_RGB[c]; if (rgb) { rgba.set(rgb, 4 * i); rgba[4 * i + 3] = 255; } });
      return rgba;
    });
    this.labels.draw(labels);
    return stats;
  }

  private labelsFor(s: SystemScene, frame: number, pose: OrbitPose, focus: number | null, plan: Plan): Label[] {
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
    const placed = placeLabels(pose, s.spheres(frame), starBlockers(s, frame), W, H, 2 * px, MAX_LABELS - out.length - drones.length);
    // #211: the constellation's names, stacked under the planet labels they belong to; the farthest planet labels give way to them
    const co = this.coLabels(s, pose, plan, placed, W, H, px, lh, covers);
    const anchors = new Set([focus, ...plan.lines.map((l) => l.body)]);
    const room = MAX_LABELS - out.length - drones.length - co.length;
    placed.forEach((l, k) => {
      if (k < room || anchors.has(l.i)) out.push({ text: s.model.planets[l.i]!.path, x: l.x, y: l.y, align: 'centre', colour: l.i === focus ? mark : ink });
    });
    const plain = (l: Label & { arrow?: number }): Label => ({ text: l.text, x: l.x, y: l.y, align: l.align, colour: l.colour });
    out.push(...co.slice(0, Math.max(0, MAX_LABELS - out.length - drones.length)).map(plain), ...drones);
    out.push(...this.crewLabels(s, frame, pose, W, H, px).map((l) => this.clear([l], covers, W, H)[0]!));
    // the arrows' click boxes (#211): the glyph and its name
    const scale = this.pass.scale;
    this.arrows = plan.arrows.map((a, k) => {
      const glyph = { x: a.box.x * scale, y: a.box.y * scale, w: a.box.w * scale, h: a.box.h * scale };
      const name = co.find((l) => l.arrow === k);
      const b = name ? labelBox(name, px) : glyph;
      const x = Math.min(glyph.x, b.x), y = Math.min(glyph.y, b.y);
      return { body: a.body, box: { x: x - px, y: y - px, w: Math.max(glyph.x + glyph.w, b.x + b.w) - x + 2 * px, h: Math.max(glyph.y + glyph.h, b.y + b.h) - y + 2 * px } };
    });
    return out;
  }

  /**
   * The constellation's labels (#211), in device px: under the focused planet's label, the focused file
   * and the partners named with it (and "tests usually change with this" when its test moons do); under each
   * partner planet's label, a focused file's partner files there; each edge arrow's name; and a flag's text
   * while its pair is in focus. Bitmap glyphs only, never HTML.
   */
  private coLabels(s: SystemScene, pose: OrbitPose, plan: Plan, placed: readonly Placed[], W: number, H: number, px: number, lh: number,
    covers: readonly Rect[]): (Label & { arrow?: number })[] {
    if (!this.coIndex) return [];
    const { ink, dim, accent } = UI_COLOURS;
    const scale = this.pass.scale;
    const out: (Label & { arrow?: number })[] = [];
    const under = (body: number): { x: number; y: number } | null => {
      if (body >= 0) { const l = placed.find((p) => p.i === body); return l ? { x: l.x, y: l.y + lh } : null; }
      const at = project(pose, [0, 0, 0]);
      if (!at) return null;
      return { x: ((at.x + 1) / 2) * W, y: ((1 - at.y) / 2) * H + projectedRadius(s.model.star.radius, at.depth, fovOf(pose)) * (H / 2) + 2 * px };
    };
    const stack = (at: { x: number; y: number } | null, lines: [string, string][]) => {
      if (at) lines.forEach(([text, colour], k) => out.push({ text, x: at.x, y: at.y + k * lh, align: 'centre', colour }));
    };
    const f = plan.focus;
    const file = f?.file ? this.coIndex.files.get(f.file) : undefined;
    if (f) {
      const mine: [string, string][] = file && file.spot?.body === f.planet ? [[shortName(file.path), accent], ...plan.named.map((g): [string, string] => [`with ${shortName(g.path)}`, dim])] : [];
      if (plan.tests) mine.push(['tests usually change with this', dim]);
      stack(under(f.planet), mine);
      if (plan.byFile) for (const l of plan.lines) if (!plan.arrows.some((a) => a.body === l.body)) stack(under(l.body), l.files.map((g) => [shortName(g.path), dim]));
    }
    plan.arrows.forEach((a, k) => {
      const name = plan.byFile ? `${shortName(a.files[0]!.path)}${a.files.length > 1 ? ` +${a.files.length - 1}` : ''}` : a.body < 0 ? 'the star' : s.model.planets[a.body]!.path;
      const w = textWidth(name) * px;
      const [bx, by, bw, bh] = [a.box.x * scale, a.box.y * scale, a.box.w * scale, a.box.h * scale];
      const mid = by + bh / 2 - (lh - 2 * px) / 2;
      const at = a.edge === 'left' ? { x: bx + bw + 2 * px, y: mid } : a.edge === 'right' ? { x: bx - 2 * px - w, y: mid }
        : a.edge === 'top' ? { x: Math.min(Math.max(bx + bw / 2 - w / 2, 2 * px), W - w - 2 * px), y: by + bh + 2 * px }
          : { x: Math.min(Math.max(bx + bw / 2 - w / 2, 2 * px), W - w - 2 * px), y: by - lh };
      out.push({ text: name, x: at.x, y: at.y, align: 'left', colour: dim, arrow: k });
    });
    // a flag's text beside its glyph; a later one moves clear of those already placed, so two bodies' texts never overlap
    const taken: Rect[] = [];
    for (const fl of plan.flags) {
      if (!fl.show) continue;
      const mid = (fl.box.y + fl.box.h / 2) * scale, top = mid - (fl.text.length * lh) / 2 + px;
      const group: Label[] = fl.text.map((text, k) => {
        const x = fl.right ? (fl.box.x + fl.box.w + 2) * scale : (fl.box.x - 2) * scale - textWidth(text) * px;
        return { text, x, y: top + k * lh, align: 'left', colour: k % 2 === 0 && k < fl.text.length - (fl.text.length % 2) ? ink : dim };
      });
      const placedGroup = this.clear(group, [...covers, ...taken], W, H);
      const boxes = placedGroup.map((l) => labelBox(l, px));
      const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
      taken.push({ x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y });
      out.push(...placedGroup);
    }
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

  /**
   * The crew's labels (#207), bitmap glyphs only: the "+N" the seats leave out, under the ship, and the
   * selected crew member's name under their porthole. At most two.
   */
  private crewLabels(s: SystemScene, frame: number, pose: OrbitPose, W: number, H: number, px: number): Label[] {
    const spec = s.crew.spec;
    if (!spec) return [];
    const at = placeShip(s.model, frame), t = loopPhase(frame) * LOOP_SECONDS;
    const out: Label[] = [];
    const below = (centre: [number, number, number], radius: number, text: string, colour: string) => {
      const p = project(pose, centre);
      if (!p) return;
      const r = projectedRadius(radius, p.depth, fovOf(pose)) * (H / 2);
      out.push({ text, x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H + r + 2 * px, align: 'centre', colour });
    };
    const sel = s.crew.riders.find((r) => r.rider.person === this.selectedPerson);
    if (sel && this.selectedName) {
      const hole = portholes(spec, at, t)[sel.seat];
      if (hole) below(hole.centre, hole.radius, this.selectedName, UI_COLOURS.accent);
    }
    if (this.crewExtra > 0) below(at.centre, 0, `+${this.crewExtra} crew`, UI_COLOURS.ink);
    return out;
  }

  /** The ship drawn (#207), or null when nobody is aboard. */
  get crewSpec(): ShipSpec | null { return this.system?.crew.spec ?? null; }
  /** The seat a crew member rides in, or null when they aren't aboard the ship drawn. */
  crewSeat(person: string | null): number | null {
    return this.system?.crew.riders.find((r) => r.rider.person === person)?.seat ?? null;
  }

  /**
   * The person id of the crew member whose porthole is under a point of the view canvas, or null. A porthole
   * turned away from the eye can't be clicked (the hull hides it), and everything drawn in front hides it
   * (planets, moons, moonlets, the star and its corona), as for drones.
   */
  pickCrewAt(cssX: number, cssY: number, pose: OrbitPose, frame: number): string | null {
    const s = this.system, spec = s?.crew.spec;
    if (!s || !spec || s.crew.riders.length === 0) return null;
    const c = this.pass.canvas.getBoundingClientRect();
    const ndc = { x: (cssX / c.width) * 2 - 1, y: 1 - (cssY / c.height) * 2 };
    const holes = portholes(spec, placeShip(s.model, frame), loopPhase(frame) * LOOP_SECONDS);
    const eye = eyeOf(pose);
    const riders = s.crew.riders.filter((r) => {
      const h = holes[r.seat];
      return h !== undefined && dot(h.normal, sub(eye, h.centre)) > 0;
    });
    const spheres = riders.map((r) => ({ centre: holes[r.seat]!.centre, radius: holes[r.seat]!.radius }));
    const hit = pick(pose, ndc, spheres, [...starBlockers(s, frame), ...s.spheres(frame), ...s.smallBodies(frame)], CREW_MIN_NDC);
    return hit === null ? null : riders[hit]!.rider.person;
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
