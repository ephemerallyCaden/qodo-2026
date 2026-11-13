// Phase 2 contract (#29): the local HTTP surface of `commet open` (#32) and the deterministic render
// hook the view (#30) exposes to the render tests (#31). See docs/contracts/phase2.md.
import type { DirId, FileId, Sha } from '../snapshot/types.js';
import type { DroneView } from './drones.js';
import type { ChartUnknownHead, FogReason, FogView } from './fog.js';
import type { LayoutV1 } from './layout.js';

/**
 * Data routes. All need the token header; GET only, except `chart` (POST a ChartAction, JSON body).
 * `beacon` is reserved for R10 and answers 501 until then. `events` is a text/event-stream that the
 * view reads with fetch (not EventSource), so the token travels in a header, never in a URL.
 * `unseen` and `diff` (#75) take query parameters: see UnseenQuery and DiffQuery.
 */
export const API = {
  snapshot: '/api/snapshot',
  layout: '/api/layout',
  fog: '/api/fog',
  drones: '/api/drones',
  chart: '/api/chart',
  beacon: '/api/beacon',
  events: '/api/events',
  unseen: '/api/unseen',
  diff: '/api/diff',
} as const;

/** The per-launch secret goes in this header. The opened URL carries it in the fragment (`#t=<token>`), which browsers never send to the server. */
export const TOKEN_HEADER = 'x-commet-token';

/** Built web bundle, relative to the package root. Served at `/`; the bundle itself holds no repo data. */
export const WEB_DIST = 'dist/web';

/** One `data:` line of the events stream. The view refetches the named resource. */
export interface LiveEvent { type: 'snapshot' | 'layout' | 'fog'; head: Sha }

/**
 * Write responses. An action whose `at` the snapshot doesn't know (#58) gets `ChartUnknownHead`, told
 * apart by `head`; any other refusal has no `head`.
 */
export type ChartResult = { ok: true; fog: FogView } | ChartUnknownHead | { ok: false; error: string; head?: undefined };

// ---- Reviewing from the view (#75, R5): what's unseen, and its diff ----

/**
 * `GET /api/unseen?home=<DirId>|star&at=<Sha>`: the fogged files of one planet, or of the star (root
 * files and unmatched tests). Each key exactly once, nothing else. `at` is the `FogView.head` the
 * view shows and must be the current head; otherwise the answer is `ChartUnknownHead` (409).
 */
export interface UnseenQuery { home: DirId | null; at: Sha }
/** The `home` value that names the star. */
export const STAR_HOME = 'star';

/** One fogged file. `since` and `reasons` are its `FileFog` fields; `path` is repo-relative, for its label. */
export interface UnseenFile { fileId: FileId; path: string; since: Sha; reasons: FogReason[] }

/** Every fogged file of the home, surface overflow included (Rule 1), sorted by path (codepoint). */
export interface UnseenList { ok: true; at: Sha; home: DirId | null; files: UnseenFile[] }

/** 200, `ChartUnknownHead` (409: refetch the fog), or 404 for a planet the current layout doesn't have. */
export type UnseenResult = UnseenList | ChartUnknownHead | { ok: false; error: 'no-such-home'; head?: undefined };

/**
 * `GET /api/diff?fileId=<FileId>&at=<Sha>`: the file's unseen diff. Each key exactly once, nothing
 * else. `at` must be the current head (else `ChartUnknownHead`, 409). The client never names a path
 * or a range: the server takes the path from the snapshot and the range from its own fog, so a stale
 * or forged request can't narrow the diff (Rule 1).
 */
export interface DiffQuery { fileId: FileId; at: Sha }

/**
 * `modified`, `added`, `deleted` (only the old half of a rename git didn't pair: the file itself is
 * at HEAD), `renamed` (from `oldPath`, maybe edited too) or `mode` (only the mode or type changed).
 */
export type DiffStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'mode';

/** One `@@` hunk: its header line as git wrote it, then its lines, each starting with ' ', '+', '-' or '\'. */
export interface DiffHunk { header: string; lines: string[] }

/** One file pair of the diff. `binary`: git shows no text for it (by content, or a `-diff` attribute). */
export interface DiffSection { status: DiffStatus; path: string; oldPath: string | null; binary: boolean; hunks: DiffHunk[] }

/** Most patch text one diff carries: characters and lines. Past either, the rest is cut and `truncated` set. */
export const DIFF_LIMITS = { chars: 1 << 20, lines: 20_000 } as const;

/**
 * The file's unseen change: `git diff <base> <at> -- <path> [<oldPath>]`. `since` is its
 * `FileFog.since`, or null when nothing is unseen (no sections then). `base` is the first-parent
 * parent of its oldest unseen change, so every unseen change is inside the range, a window gap
 * included; it is the empty tree's id when that change is the root commit. Usually one section; two
 * when git didn't pair a rename. `truncated`: the diff passed DIFF_LIMITS and only `shownLines`
 * hunk lines are here. Served on demand and never stored, cached or logged.
 */
export interface DiffView {
  ok: true;
  fileId: FileId;
  at: Sha;
  since: Sha | null;
  base: Sha | null;
  sections: DiffSection[];
  truncated: boolean;
  shownLines: number;
}

/** 200, `ChartUnknownHead` (409: refetch the fog), or 404 for a file that isn't in the snapshot at the current head. */
export type DiffResult = DiffView | ChartUnknownHead | { ok: false; error: 'no-such-file'; head?: undefined };

// ---- Deterministic render hook (R8) ----

/** Query parameter that turns on test mode: no animation loop, and `window.__commet` is exposed. Absent otherwise. */
export const TEST_MODE_PARAM = 'test';

export interface CameraPose {
  /** World units, floats allowed (render input, not serialised output). */
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
}

export interface RenderInput {
  layout: LayoutV1;
  fog?: FogView | null;
  /** The drone view to draw (#80); the view draws at most 16 of its placed sessions. Default: none. */
  drones?: DroneView | null;
  reducedMotion?: boolean;
  /** Internal resolution height in pixels, 120..480. Default 180. */
  pixelHeight?: number;
  /** Default: the view's own start pose. */
  camera?: CameraPose;
  /**
   * Per-pixel depth fade (art-direction §5). Default true. With it off, every pixel must be a palette
   * colour (system-design §10: off-palette pixels = 0), because the fade is the only off-palette output.
   */
  depthFade?: boolean;
}

export interface RenderStats { drawCalls: number; triangles: number; width: number; height: number }

/** `window.__commet` in test mode. A frame is a pure function of (input, frame). */
export interface RenderHook {
  /** Resolves once the renderer and fonts are ready. */
  ready: Promise<void>;
  load(input: RenderInput): Promise<void>;
  /** Draws exactly frame `n` (frame 0 is the start), then resolves with renderer.info figures. */
  renderFrame(n: number): Promise<RenderStats>;
  /** RGBA bytes of the low-res internal target, before upscale. Row 0 is the top. */
  lowResPixels(): { width: number; height: number; rgba: number[] };
}
