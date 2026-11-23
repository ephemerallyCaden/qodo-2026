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
  run(s: SceneContext): Promise<void>;
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

/** Loop time per tick: 20 frames a second. */
export const TICK_MS = 50;
/** The DOM parts a frame's pixels are attributed to, first match first (the rest is the 3D view and its labels). */
export const REGIONS = ['drone-panel', 'panel', 'hud', 'error'] as const;

export interface FrameLog { k: number; ts: number; frame: number; boxes: Boxes; probes: Record<string, number>; heading: string | null }
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

