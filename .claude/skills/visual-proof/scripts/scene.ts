// visual-proof: what a scene is. A scene is one TypeScript module in ../scenes/, listed in
// ../scenes/index.ts. It says what data the view gets (the clone's commit, its content roots, CLI steps
// such as a beacon, scripted drones) and drives the live view through real input, recording frames as
// it goes. The same scene runs four times (two builds, two takes each), so it must be a pure function of
// the layout and the frame clock: no wall clock, no randomness, no reading of the page to decide what
// to do beyond checking it reached the state it needs (else `fail`).
import type { Page } from '@playwright/test';
import type { DroneDetailQuery, DroneDetailResult, DroneView } from '../../../../src/core/contract/drones.js';
import type { LayoutV1 } from '../../../../src/core/contract/layout.js';
import type { SystemModel } from '../../../../web/src/model/system.js';
import type { Box } from './frames.js';

/** One commit of a scene's own repo: these files written (added or changed) at `at`. */
export interface FixtureCommit { files: Readonly<Record<string, string>>; at: string }

/** What every take of a run sees: the clone's layout and its files at the pinned commit. */
export interface SceneData { layout: LayoutV1; files: readonly string[] }

export interface SetupContext {
  /** Runs the base build's own CLI in the data clone (no shell); returns its stdout. Throws on a nonzero exit. */
  cli(...args: string[]): string;
  layout: LayoutV1;
}

export interface Scene {
  name: string;
  /** One sentence: what the scene shows (the summary's first line). */
  summary: string;
  /** The commit of this repo the data clone is checked out at. Default: the base commit. */
  repoAt?: string;
  /**
   * Instead of a clone of this repo, the scene's own repo: these files in one commit at `at` (author and
   * committer fixed, so its SHA is the same every run). For a scene that needs a small, exact layout.
   * `earlier`: commits made before that one, oldest first, each writing its own files (e.g. a file whose
   * last change is older than the scan's 24-month window, counted back from the last commit).
   */
  fixture?: { files: Readonly<Record<string, string>>; at: string; earlier?: readonly FixtureCommit[] };
  /**
   * Instead of a clone or a `fixture`, the scene's own repo built into `dest` (empty) by a test fixture's own
   * builder, for data a one-author fixture can't make (#207: test/fixtures/crew's invented crew, its own
   * authors, dates and `.mailmap`). Deterministic: the same SHAs every run. Returns the record's lines.
   */
  repo?(dest: string): Promise<string[]>;
  /** CSS px (= frame px). Default: the render tests' 1280x720. */
  viewport?: { width: number; height: number };
  /** The GIF at 1/n size (nearest, a whole n), for a large viewport with motion; stills stay full size. Default 1. */
  gifScale?: number;
  /** `commet scan --root` values for the clone. Default: ['src']. */
  roots?: readonly string[];
  /** Reduced motion: the frame clock holds at 0 and focus cuts instead of gliding (the view's own setting). */
  reducedMotion?: boolean;
  /** CLI steps on the clone after the scan, before any take (a chart, a beacon); every take starts from their state. */
  setup?(s: SetupContext): void;
  /**
   * Scripted drone sessions, served through the server's drone hooks (R12: no agent logs). Pure: from the
   * layout and the clone's file list (`git ls-files` at its commit) only.
   */
  drones?(data: SceneData): { view: DroneView; detail?: (q: DroneDetailQuery) => DroneDetailResult };
  /** The probes the summary reports at each still (default: every probe a still has). */
  report?: readonly string[];
  /** Drives the view. A scene has `run` or `parts`, not both. */
  run?(s: SceneContext): Promise<void>;
  /**
   * Shots that need their own page: each part is a fresh page (and server) in the same take, from the
   * same start state, with its own drones, viewport and motion where it sets them. Frames and stills run on
   * across parts; each still is named `<part>: <still>`.
   */
  parts?: readonly ScenePart[];
}

export interface ScenePart {
  name: string;
  viewport?: { width: number; height: number };
  reducedMotion?: boolean;
  drones?: Scene['drones'];
  /** false: its frames stay out of the GIF (e.g. another viewport than the GIF's). Its stills still get pairs. */
  gif?: boolean;
  run(s: SceneContext): Promise<void>;
}

/** A scene's parts: its own `parts`, or the scene itself as one. */
export function partsOf(scene: Scene): ScenePart[] {
  if (scene.parts && scene.run) throw new Error(`scene ${scene.name} has both run and parts`);
  if (scene.parts?.length) return [...scene.parts];
  if (!scene.run) throw new Error(`scene ${scene.name} has neither run nor parts`);
  return [{ name: '', ...(scene.viewport ? { viewport: scene.viewport } : {}), ...(scene.reducedMotion !== undefined ? { reducedMotion: scene.reducedMotion } : {}), ...(scene.drones ? { drones: scene.drones } : {}), run: scene.run }];
}

/** One recorded frame's DOM boxes, in CSS px (= frame px). Only open (non-hidden) elements are listed. */
export type Boxes = Record<string, { x: number; y: number; w: number; h: number }>;

export interface SceneContext {
  page: Page;
  layout: LayoutV1;
  files: readonly string[];
  /** systemModel(layout), from this checkout's web/src: for working out where a body or drone is on screen. */
  model: SystemModel;
  width: number;
  height: number;
  reducedMotion: boolean;
  /** The view's loop frame as of the last tick (loop.ts: 30 a second of loop time; held at 0 under reduced motion). */
  readonly frame: number;
  /** Frames recorded so far. */
  readonly recorded: number;
  /** Steps the clock `n` ticks of 50 ms, screenshotting and probing after each one. */
  record(n: number): Promise<void>;
  /** Steps the clock `n` ticks without recording (a pre-roll). */
  advance(n: number): Promise<void>;
  /** Marks the last recorded frame as a still: it gets a before | after pair and a line in the summary. */
  still(name: string): void;
  /** Waits until no request is in flight and none started for `quietMs`. */
  settle(quietMs?: number): Promise<void>;
  /** Polls `check` (settling between tries) until it holds; else the scene can't be reached. */
  waitFor(what: string, check: () => Promise<boolean>, timeoutMs?: number): Promise<void>;
  /** Keeps the label canvas as it is now: the `new` probes count label pixels that differ from it. */
  keepLabels(): Promise<void>;
  /**
   * Measures the drones on the last recorded frame from the page's own pixels (the #189 debugger's method):
   * a seam skips the drone shader's draws, so `drone px visible` is what changes in the page as the user sees
   * it when the drones are drawn, `drone px drawn` the same on the bare canvas (overlays hidden), and
   * `drone px drawn under #drone-panel` the drawn ones inside the open drone panel's box. The frame is drawn
   * again at the same time, so the take goes on as before. Adds the three to that frame's probes.
   */
  measureDrones(): Promise<{ drawn: number; visible: number; underPanel: number }>;
  /**
   * Where the drones are drawn now, from the page's own pixels (the same seam): the centre of the drone
   * pixels the user can see, and their count. Click there to select a scene's one drone in whatever build
   * is running, wherever that build draws it; null when none is visible.
   */
  locateDrone(): Promise<{ visible: number; centre: { x: number; y: number } | null; box: Box | null }>;
  /**
   * Measures the fog on the last recorded frame from the page's own pixels, the way measureDrones does:
   * the same frame is drawn again on the bare canvas (overlays hidden) with and without the fog (a seam
   * holds every program's `uFogOn` at 0, which draws a body as if nothing on it were fogged), and the
   * pixels that differ are the fog. `regionOf` names the region a frame pixel (CSS px) is in, or null.
   * Adds `fog px` and, per region, `fog px on <region>` and `px of <region>` to that frame's probes.
   * Moons carry their fog per instance, not in `uFogOn`, so a moon's fog isn't counted.
   */
  measureFog(regionOf: (x: number, y: number) => string | null): Promise<{ total: number; regions: Record<string, { fog: number; px: number }> }>;
  /** The build's own CLI in the data clone, mid-take (a state change the view hears about): wait for its effect after. */
  cli(...args: string[]): string;
  /** A line for the take log and the record (where a click landed, which seed). */
  note(text: string): void;
  /** Stops the run: the scene can't be reached. */
  fail(message: string): never;
  /** Turns down the start panel's baseline offer, as a first-time user would. */
  dismissOffer(): Promise<void>;
  /** The review panel's heading: a planet's path or the star's line; null when it's closed. */
  heading(): Promise<string | null>;
  /** Focuses planet `path` with the bracket keys (one tick after each press), as the review tests do. */
  focusPlanet(path: string): Promise<void>;
  click(x: number, y: number): Promise<void>;
  press(key: string): Promise<void>;
}

/** The drone shader's own uniform: the seam knows a drone program by it (web/src/render/drone-shader.ts). */
export const DRONE_MARK = 'uHeadB';

/** The fog shaders' switch (web/src/render/fog-glsl.ts FOG_GRID): at 0 a body draws as if nothing on it were fogged. The fog seam knows it by name. */
export const FOG_ON = 'uFogOn';

/** Loop time per tick: 20 frames a second. */
export const TICK_MS = 50;
/** The DOM parts a frame's pixels are attributed to, first match first (the rest is the 3D view and its labels). */
export const REGIONS = ['drone-panel', 'panel', 'tree', 'hud', 'error'] as const;

/** `part`: which of the scene's parts recorded it (0 for a scene without parts). */
export interface FrameLog { k: number; part?: number; ts: number; frame: number; boxes: Boxes; probes: Record<string, number>; heading: string | null }
export interface TakeLog {
  scene: string;
  width: number;
  height: number;
  reducedMotion: boolean;
  frames: FrameLog[];
  stills: { name: string; k: number }[];
  /** Every distinct page text (all text in the DOM, the title and every attribute value), with the first frame it was seen at. */
  texts: [string, number][];
  served: { path: string; status: number; body: string }[];
  /** Every static file the page was served (200), by request path and the sha256 of its bytes: checked against the bundle scan (Qodo 968ff513). */
  assets: { path: string; sha256: string }[];
  /** The live event stream's bytes (GET /api/events never ends, so its body is teed in the page). */
  events: string;
  notes: string[];
  /** Page errors and console errors: recorded, not judged. */
  errors: string[];
  /** Ticks that ran other than one callback. */
  ticks: string[];
  /** Times the server's launch token appeared anywhere in this log; each was replaced by `<launch token>` before it was written (R5). */
  tokenHits?: number;
}

