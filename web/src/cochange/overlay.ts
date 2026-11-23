// The constellation overlay (#211, R9; art direction §10, option B "signal" from the co-change lab): what
// a frame draws over the scene at the internal resolution, before the nearest-neighbour upscale. For the
// focused planet or file, a dim 2 px rail to each partner body with 1, 2 or 3 travelling beads by strength
// step, drawn in strongest first over 0.7 s (at once, beads frozen, under reduced motion), only over empty
// space and stopping 1 px short of every body, cloud and label; an edge arrow for a partner off screen;
// and, focused or not, the teal missing-pair flag beside a flagged file's body, with a 1 px tick on a
// flagged test moon. Lines and beads are the starfield's own colours, flags teal (Rule 5). Pure: geometry
// from (model, focus, frame, pose), pixels from the rendered frame; no three.js, no DOM, no clock.
import { palette } from '../../../src/core/palette.js';
import { NEAR, basis, eyeOf, fovOf, project, projectedRadius, type OrbitPose } from '../camera/pose.js';
import { LOOP_SECONDS, loopPhase } from '../model/motion.js';
import { MOON_RADIUS, moonOffset, planetCentre, type SystemModel } from '../model/system.js';
import { add, dot, sub, type Vec3 } from '../model/vec.js';
import { flagInFocus, flagText, focusLinks, type CoFile, type CoFlag, type CoIndex, type Focus } from './model.js';
import {
  blockBox, busyMask, clipSegment, dilate, drawBeads, drawRail, drawShape, hexKey, resample, revealAt, span, type Box, type Disc, type Pt, type Sample,
} from './raster.js';

/** Overlay colour indices (0: nothing drawn) and their palette colours. */
export const INK = { rail: 1, tail: 2, head: 3, flagDot: 4, flagRing: 5 } as const;
const [STAR_DIM, STAR_MID, STAR_BRIGHT] = palette.world.stars;
export const OVERLAY_COLOURS: readonly (string | null)[] = [null, STAR_DIM, STAR_MID, STAR_BRIGHT, palette.accent.teal[2], palette.accent.teal[3]];
/** The pixels a line may take: empty space and the starfield. */
const FREE = [palette.world.space, ...palette.world.stars].map(hexKey);

/** The signal line (option B): a 2 px rail with beads of `BEAD.len` px (white head, lavender tail), one trip per `BEAD.seconds`. */
export const BEAD = { w: 2, len: 6, headLen: 2, seconds: 3, stagger: 0.17 } as const;
/** Beads per strength step (weak, mid, strong). */
export const BEADS_PER_STEP = [1, 2, 3] as const;

/**
 * The missing-pair flag, "usually changes with X": a pair glyph whose far end is empty, a filled dot
 * linked to a hollow ring (the pair's missing half). # the dot and link, R the ring.
 */
export const FLAG_SHAPE = [
  '.......RRRR.',
  '.##...RRRRRR',
  '######RR..RR',
  '######RR..RR',
  '.##...RRRRRR',
  '.......RRRR.',
] as const;
const FLAG_INK = { '#': INK.flagDot, R: INK.flagRing };
/** Gap (px) between a body's disc and its flag. */
export const FLAG_GAP = 2;
/** A flagged test moon's tick: 1 px wide, 2 tall, 1 px above the moon (the human, 2026-11-23). */
const TICK = ['R', 'R'] as const;

/** Edge arrows, pointing at the off-screen partner. A arrow ink. */
const ARROWS = {
  right: ['A...', 'AA..', 'AAA.', 'AAAA', 'AAA.', 'AA..', 'A...'],
  left: ['...A', '..AA', '.AAA', 'AAAA', '.AAA', '..AA', '...A'],
  top: ['...A...', '..AAA..', '.AAAAA.', 'AAAAAAA'],
  bottom: ['AAAAAAA', '.AAAAA.', '..AAA..', '...A...'],
} as const;
const ARROW_INK = { A: INK.tail };
/** Arrows stand this far inside the frame's edge. */
const EDGE = 2;

export type Edge = keyof typeof ARROWS;

export interface PlannedLine { body: number; rank: number; step: 0 | 1 | 2; strengthMilli: number; files: CoFile[]; samples: Sample[]; span: [number, number] | null }
/** A partner off screen: an arrow at the frame's edge where its line leaves (clicking it focuses the partner). */
export interface EdgeArrow { body: number; files: CoFile[]; edge: Edge; box: Box }
/** One body's flags: the glyph's box, the side it stands on (the side with room for its text) and the text it shows in focus (none: `show` false). */
export interface PlacedFlag { body: number; flags: CoFlag[]; box: Box; right: boolean; text: string[]; show: boolean }

export interface Plan {
  focus: Focus | null;
  lines: PlannedLine[];
  arrows: EdgeArrow[];
  flags: PlacedFlag[];
  /** Top pixels of 1×2 ticks. */
  ticks: Pt[];
  /** File focus: partners named under the focused file; and whether its (or the planet's) test moons change with it. */
  named: CoFile[];
  tests: boolean;
}

export interface PlanInput {
  model: SystemModel;
  index: CoIndex | null;
  focus: Focus | null;
  frame: number;
  pose: OrbitPose;
  /** The internal frame. */
  W: number;
  H: number;
  /** A label's width in internal px. */
  textW: (text: string) => number;
}

/** In focus, the strongest this many flags anywhere get their two lines of text; the rest are one "+N more" line (the human, 2026-11-23). */
export const MAX_FLAG_TEXTS = 3;

const centreOf = (m: SystemModel, body: number, frame: number): Vec3 => (body < 0 ? [0, 0, 0] : planetCentre(m.planets[body]!, frame));
const radiusOf = (m: SystemModel, body: number): number => (body < 0 ? m.star.radius : m.planets[body]!.radius);

/** A world point in internal px (rows top-down) and its view depth, or null behind the eye. */
function toPx(pose: OrbitPose, v: Vec3, W: number, H: number): (Pt & { depth: number }) | null {
  const p = project(pose, v);
  return p && { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, depth: p.depth };
}

function discOf(pose: OrbitPose, centre: Vec3, radius: number, W: number, H: number): (Disc & { depth: number }) | null {
  const p = toPx(pose, centre, W, H);
  return p && { ...p, r: projectedRadius(radius, p.depth, fovOf(pose)) * (H / 2) };
}

const offFrame = (d: Disc, W: number, H: number) => d.x + d.r < 0 || d.x - d.r > W || d.y + d.r < 0 || d.y - d.r > H;

/** Where a 3D segment's far end lands on screen: itself, or (behind the eye) the segment cut just in front of the eye. */
function farEnd(pose: OrbitPose, a: Vec3, b: Vec3, W: number, H: number): Pt | null {
  const direct = toPx(pose, b, W, H);
  if (direct) return direct;
  const fwd = basis(pose.yaw, pose.pitch).fwd, eye = eyeOf(pose);
  const da = dot(sub(a, eye), fwd), db = dot(sub(b, eye), fwd);
  if (da <= 4 * NEAR || da === db) return null;
  const t = (da - 4 * NEAR) / (da - db);
  return toPx(pose, add(a, [(b[0] - a[0]) * t, (b[1] - a[1]) * t, (b[2] - a[2]) * t]), W, H);
}

function edgeOf(p: Pt, W: number, H: number): Edge {
  const d = [[p.x, 'left'], [W - p.x, 'right'], [p.y, 'top'], [H - p.y, 'bottom']] as const;
  return [...d].sort((x, y) => x[0] - y[0])[0]![1];
}

/** The arrow's box at the frame's edge where a line leaves it, kept inside the frame. */
function arrowBox(at: Pt, edge: Edge, W: number, H: number): Box {
  const rows = ARROWS[edge], w = rows[0]!.length, h = rows.length;
  const clampX = (x: number) => Math.min(Math.max(Math.round(x), EDGE), W - EDGE - w);
  const clampY = (y: number) => Math.min(Math.max(Math.round(y), EDGE), H - EDGE - h);
  if (edge === 'left') return { x: EDGE, y: clampY(at.y - h / 2), w, h };
  if (edge === 'right') return { x: W - EDGE - w, y: clampY(at.y - h / 2), w, h };
  if (edge === 'top') return { x: clampX(at.x - w / 2), y: EDGE, w, h };
  return { x: clampX(at.x - w / 2), y: H - EDGE - h, w, h };
}

/** Everything the overlay draws this frame, in internal px. */
export function planConstellation(i: PlanInput): Plan {
  const { model, index, focus, frame, pose, W, H } = i;
  const plan: Plan = { focus, lines: [], arrows: [], flags: [], ticks: [], named: [], tests: false };
  if (!index) return plan;
  const disc = (body: number) => discOf(pose, centreOf(model, body, frame), radiusOf(model, body), W, H);
  const moonAt = (f: CoFile): (Disc & { depth: number }) | null => {
    const p = model.planets[f.spot!.body]!;
    const centre = planetCentre(p, frame);
    const m = discOf(pose, add(centre, moonOffset(p.moons[f.spot!.moon!]!, frame)), MOON_RADIUS, W, H);
    const host = discOf(pose, centre, p.radius, W, H);
    // behind its own planet's disc: hidden, so no tick
    if (!m || (host && m.depth > host.depth && Math.hypot(m.x - host.x, m.y - host.y) < host.r)) return null;
    return m;
  };
  const tick = (f: CoFile) => {
    const m = moonAt(f);
    if (m && !offFrame(m, W, H)) plan.ticks.push({ x: Math.round(m.x), y: Math.round(m.y - m.r) - 1 - TICK.length });
  };

  const links = focusLinks(index, focus);
  plan.named = links.named;
  plan.tests = links.tests.length > 0;
  for (const f of links.tests) tick(f);
  const from = focus ? disc(focus.planet) : null;
  if (focus && from) {
    const a3 = centreOf(model, focus.planet, frame);
    links.lines.forEach((l, rank) => {
      const to = disc(l.body);
      const end = farEnd(pose, a3, centreOf(model, l.body, frame), W, H);
      if (!end) return;
      const cut = clipSegment(from, end, 0, 0, W, H);
      const off = !to || offFrame(to, W, H);
      if (cut) {
        const samples = resample(cut, 1);
        plan.lines.push({ body: l.body, rank, step: l.step, strengthMilli: l.strengthMilli, files: l.files, samples, span: span(samples, from, to) });
      }
      if (off) {
        const at = cut ? cut[1] : end;
        const edge = edgeOf(at, W, H);
        plan.arrows.push({ body: l.body, files: l.files, edge, box: arrowBox(at, edge, W, H) });
      }
    });
  }

  // Flags, by body: always drawn (an alert), their text only in focus: the strongest MAX_FLAG_TEXTS of
  // those in focus, wherever they are, then one "+N more" line after the last shown.
  const strongest = (a: CoFlag, b: CoFlag) => b.strengthMilli - a.strengthMilli || (a.file.fileId < b.file.fileId ? -1 : 1);
  const byBody = new Map<number, CoFlag[]>();
  for (const f of index.flags) {
    const b = f.file.spot!.body;
    byBody.set(b, [...(byBody.get(b) ?? []), f]);
    if (f.file.spot!.moon !== null) tick(f.file);
  }
  const inFocus = index.flags.filter((f) => flagInFocus(f, focus)).sort(strongest);
  const shown = new Set(inFocus.slice(0, MAX_FLAG_TEXTS));
  const last = inFocus[shown.size - 1];
  const fw = FLAG_SHAPE[0].length, fh = FLAG_SHAPE.length;
  for (const [body, flags] of [...byBody].sort((a, b) => a[0] - b[0])) {
    const d = disc(body);
    if (!d || offFrame(d, W, H)) continue;
    const sorted = [...flags].sort(strongest);
    const text = sorted.filter((f) => shown.has(f)).flatMap(flagText);
    if (last && sorted.includes(last) && inFocus.length > shown.size) text.push(`+${inFocus.length - shown.size} more`);
    // the side with room for any of its texts, fixed whether or not they show, so the glyph doesn't jump
    const right = d.x + d.r + FLAG_GAP + fw + 2 + Math.max(...sorted.flatMap(flagText).map(i.textW)) + 1 <= W;
    const box = { x: Math.round(right ? d.x + d.r + FLAG_GAP : d.x - d.r - FLAG_GAP - fw), y: Math.round(d.y - fh / 2), w: fw, h: fh };
    plan.flags.push({ body, flags: sorted, box, right, text, show: text.length > 0 });
  }
  return plan;
}

/** Whether a plan draws anything at all (no overlay pass when it doesn't). */
export const drawsAnything = (p: Plan): boolean => p.lines.length > 0 || p.arrows.length > 0 || p.flags.length > 0 || p.ticks.length > 0;

export interface RasterInput {
  /** The rendered frame, RGBA rows top-down: read only when there are lines to fit around it. */
  pixels: () => ArrayLike<number>;
  W: number;
  H: number;
  /** Every label's box in internal px: no line under one or within 1 px of it. */
  labels: readonly Box[];
  /** Seconds since the focus began (the draw-in). */
  since: number;
  reduced: boolean;
  /** The frame drawn: the beads' phase (frozen with the frame under reduced motion). */
  frame: number;
}

/** The overlay's colour indices (W×H, rows top-down), or null when nothing is drawn. */
export function rasterise(plan: Plan, r: RasterInput): Uint8Array | null {
  if (!drawsAnything(plan)) return null;
  const { W, H } = r;
  const ov = new Uint8Array(W * H);
  if (plan.lines.length > 0) {
    const blocked = dilate(busyMask(r.pixels(), W, H, FREE), W, H, 1);
    for (const b of r.labels) blockBox(blocked, W, H, b, 1);
    for (const f of plan.flags) blockBox(blocked, W, H, f.box, 1);
    for (const a of plan.arrows) blockBox(blocked, W, H, a.box, 1);
    for (const t of plan.ticks) blockBox(blocked, W, H, { x: t.x, y: t.y, w: 1, h: TICK.length }, 1);
    // rails weakest first, so a stronger one wins where two meet; the draw-in goes strongest first
    const lines = [...plan.lines].sort((a, b) => a.strengthMilli - b.strengthMilli || b.rank - a.rank);
    const reveal = new Map(lines.map((l) => [l, revealAt(r.since, l.rank, r.reduced)]));
    for (const l of lines) drawRail(ov, blocked, W, H, l.samples, l.span, BEAD.w, INK.rail, reveal.get(l));
    // one trip per BEAD.seconds: a whole number per loop, so the loop has no seam (Rule 4)
    const trips = loopPhase(r.frame) * (LOOP_SECONDS / BEAD.seconds);
    for (const l of lines) {
      drawBeads(ov, blocked, W, H, l.samples, l.span, { w: BEAD.w, n: BEADS_PER_STEP[l.step], u: trips + l.rank * BEAD.stagger,
        len: BEAD.len, headLen: BEAD.headLen, head: INK.head, tail: INK.tail }, reveal.get(l));
    }
  }
  for (const f of plan.flags) drawShape(ov, W, H, FLAG_SHAPE, f.box.x, f.box.y, FLAG_INK);
  for (const a of plan.arrows) drawShape(ov, W, H, ARROWS[a.edge], a.box.x, a.box.y, ARROW_INK);
  for (const t of plan.ticks) drawShape(ov, W, H, TICK, t.x, t.y, { R: INK.flagRing });
  return ov;
}
