// The debris the view draws (R13), kept across layout reloads of the same scan as the drones are: the items of the
// scan `head`, the sweeps running over them, the selected piece, and the labels and picking that go with them. The
// View holds one and hands it each scene it builds; the scene draws what this says. No DOM and no clock: frames are
// passed in (Rule 3).
import { fovOf, pick, project, projectedRadius, type OrbitPose } from '../camera/pose.js';
import type { Rect } from '../labels/place.js';
import { LOOP_FRAMES } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import type { Occluder } from '../model/vec.js';
import type { SystemScene } from '../render/scene.js';
import { FONT_HEIGHT, textWidth } from '../labels/font.js';
import { UI_COLOURS } from '../ui/colours.js';
import { homeBase } from '../drones/place.js';
import { debrisBody, pieceOffset, type DebrisPlan, type Drawable, type Piece } from './place.js';
import { debrisEntries, runningSweeps, sweepsAfter, type DebrisSweep } from './sweep.js';

/** A debris label: bitmap glyphs centred at a point of the label canvas (labels/overlay.ts Label, without the DOM). */
export interface DebrisLabel { text: string; x: number; y: number; align: 'left' | 'centre'; colour: string }

/** A piece's smallest clickable size, as a share of half the frame height (a drone's is 0.015). */
const DEBRIS_MIN_NDC = 0.015;
/** A body's "+N" shows only while its shell is at least this many internal px across: a far one is counted in the HUD line. */
const LABEL_MIN_PX = 24;
/** At most this many "+N" labels a frame. */
const MAX_COUNT_LABELS = 8;

export class DebrisState {
  /** The items of the scan `head`, as the data load gave them. */
  private items: readonly Drawable[] = [];
  private head: string | null = null;
  private sweeps: DebrisSweep[] = [];
  /** What the scene drawn was given: its pieces at rest, and what each body counts past its cap. */
  plan: DebrisPlan | null = null;
  /** The selected piece's id, and the name shown under it while selected. */
  selected: string | null = null;
  selectedName = '';

  /** The items drawn over the layout of `head`, or none of another scan. */
  itemsFor(head: string | null): readonly Drawable[] { return head !== null && head === this.head ? this.items : []; }

  /**
   * Takes the items of the scan `head` (R13): over a scene of that scan, each piece drawn before and gone now begins
   * its sweep at `frame` (unless `animate` is off: reduced motion, or the render hook, where it just goes). Returns
   * false, changing nothing, when the scene drawn is of another scan; with no scene they wait for the first of `head`.
   */
  set(scene: SystemScene | null, layoutHead: string | null, items: readonly Drawable[], head: string, frame: number, animate: boolean): boolean {
    if (scene && head !== layoutHead) return false;
    const drawn = scene ? this.itemsFor(head) : [];
    this.sweeps = scene && animate ? sweepsAfter(scene.model, drawn, items, this.sweeps, frame) : [];
    this.items = items;
    this.head = head;
    if (scene) this.attach(scene, head);
    if (this.selected !== null && !items.some((it) => it.id === this.selected)) this.deselect();
    return true;
  }

  /** Gives a scene of the scan `layoutHead` its debris: this scan's pieces and sweeps, or none of another. */
  attach(scene: SystemScene, layoutHead: string): void {
    if (this.head !== layoutHead) this.sweeps = [];
    const { entries, plan } = debrisEntries(scene.model, this.itemsFor(layoutHead), this.sweeps);
    scene.setDebris(entries);
    this.plan = plan;
  }

  /**
   * Before drawing `frame`: a sweep that has ended leaves the scene (rebuilt without it), and the selection is drawn.
   * True when that took a body's last piece, so its shell went: Home's framing moved (Qodo PR257 790dda54).
   */
  prepare(scene: SystemScene, layoutHead: string, frame: number): boolean {
    const before = scene.model;
    const running = runningSweeps(this.sweeps, frame);
    if (running.length !== this.sweeps.length) { this.sweeps = running; this.attach(scene, layoutHead); }
    scene.debrisSelected = this.selected;
    return scene.model !== before;
  }

  /** Reduced motion came on: sweeps cut to their end. */
  settle(scene: SystemScene | null, layoutHead: string | null): void {
    if (this.sweeps.length === 0) return;
    this.sweeps = [];
    if (scene && layoutHead !== null) this.attach(scene, layoutHead);
  }

  deselect(): void { this.selected = null; this.selectedName = ''; }

  /** The id of the piece under an NDC point, or null: everything drawn in front hides it, as for drones. */
  pickAt(scene: SystemScene, pose: OrbitPose, ndc: { x: number; y: number }, frame: number, blockers: readonly Occluder[]): string | null {
    const at = scene.debris.spheres(scene.model, frame);
    const drawn = at.flatMap((d, i) => (d ? [i] : []));
    const hit = pick(pose, ndc, drawn.map((i) => at[i]!), blockers, DEBRIS_MIN_NDC);
    return hit === null ? null : scene.debris.entries[drawn[hit]!]!.piece.id;
  }

  /**
   * The debris labels, bitmap glyphs only, in device px of a W×H canvas: each near body's "+N" past its cap (D5,
   * Rule 1: counted, never dropped) beside its disc, and the selected piece's name under it.
   */
  labels(scene: SystemScene, frame: number, pose: OrbitPose, W: number, H: number, px: number): DebrisLabel[] {
    const out: DebrisLabel[] = [];
    if (this.selected !== null && this.selectedName) {
      const k = scene.debris.entries.findIndex((e) => e.piece.id === this.selected && e.sweep === null);
      const s = k < 0 ? null : scene.debris.spheres(scene.model, frame)[k];
      const p = s ? project(pose, s.centre) : null;
      if (s && p) {
        const r = projectedRadius(s.radius, p.depth, fovOf(pose)) * (H / 2);
        out.push({ text: this.selectedName, x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H + r + 2 * px, align: 'centre', colour: UI_COLOURS.accent });
      }
    }
    const counts = [...(this.plan?.overflow ?? new Map<string, number>())].flatMap(([home, n]) => {
      const body = debrisBody(scene.model, home), c = homeBase(scene.model, home, frame)?.centre;
      if (!body || !c) return [];
      const p = project(pose, c);
      if (!p) return [];
      // beside the body's disc at mid height (in frame whenever the body is: its shell runs past a focused frame's
      // top), on the right, or on the left where the right has no room; only while the shell reads at this size
      const shell = projectedRadius(body.outer, p.depth, fovOf(pose)) * (H / 2), disc = projectedRadius(body.radius, p.depth, fovOf(pose)) * (H / 2);
      const cx = ((p.x + 1) / 2) * W, cy = ((1 - p.y) / 2) * H, text = `+${n} debris`, w = textWidth(text) * px;
      const right = cx + disc + 4 * px, x = right + w <= W - 2 * px ? right : cx - disc - 4 * px - w;
      if ((2 * shell) / px < LABEL_MIN_PX || x < 2 * px || cy < 0 || cy > H) return [];
      return [{ depth: p.depth, label: { text, x, y: cy - FONT_HEIGHT * px / 2, align: 'left' as const, colour: UI_COLOURS.ink } }];
    });
    counts.sort((a, b) => a.depth - b.depth);
    out.push(...counts.slice(0, MAX_COUNT_LABELS).map((c) => c.label));
    return out;
  }
}

/** Points of a piece's track over its orbit. */
const TRACK_SAMPLES = 24;

/**
 * A piece's screen boxes over its next whole orbit (one loop), plus where it is now, in window CSS px, for its
 * panel's dock (drones/dock.ts): the panel docks where it keeps the piece you clicked in view. The orbit is drawn
 * round its home where the home is now, so a panel docked clear of it stays clear while the camera follows that
 * home. `screen` is the view canvas's box in the window. Empty when the home isn't in this layout.
 */
export function pieceTrack(model: SystemModel, piece: Piece, frame: number, pose: OrbitPose, screen: Rect): Rect[] {
  const now = homeBase(model, piece.home, frame);
  if (!now) return [];
  return [frame, ...Array.from({ length: TRACK_SAMPLES }, (_, k) => frame + (k * LOOP_FRAMES) / TRACK_SAMPLES)].flatMap((f) => {
    const o = pieceOffset(piece, f);
    const p = project(pose, [now.centre[0] + o[0], now.centre[1] + o[1], now.centre[2] + o[2]]);
    if (!p) return [];
    const r = projectedRadius(piece.bound, p.depth, fovOf(pose)) * (screen.h / 2);
    const x = screen.x + ((p.x + 1) / 2) * screen.w, y = screen.y + ((1 - p.y) / 2) * screen.h;
    return [{ x: x - r, y: y - r, w: 2 * r, h: 2 * r }];
  });
}
