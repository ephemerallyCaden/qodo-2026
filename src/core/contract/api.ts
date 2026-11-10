// Phase 2 contract (#29): the local HTTP surface of `commet open` (#32) and the deterministic render
// hook the view (#30) exposes to the render tests (#31). See docs/contracts/phase2.md.
import type { Sha } from '../snapshot/types.js';
import type { FogView } from './fog.js';
import type { LayoutV1 } from './layout.js';

/**
 * Data routes. All need the token header; GET only, except `chart` (POST a ChartAction, JSON body).
 * `beacon` is reserved for R10 and answers 501 until then. `events` is a text/event-stream that the
 * view reads with fetch (not EventSource), so the token travels in a header, never in a URL.
 */
export const API = {
  snapshot: '/api/snapshot',
  layout: '/api/layout',
  fog: '/api/fog',
  chart: '/api/chart',
  beacon: '/api/beacon',
  events: '/api/events',
} as const;

/** The per-launch secret goes in this header. The opened URL carries it in the fragment (`#t=<token>`), which browsers never send to the server. */
export const TOKEN_HEADER = 'x-commet-token';

/** Built web bundle, relative to the package root. Served at `/`; the bundle itself holds no repo data. */
export const WEB_DIST = 'dist/web';

/** One `data:` line of the events stream. The view refetches the named resource. */
export interface LiveEvent { type: 'snapshot' | 'layout' | 'fog'; head: Sha }

/** Write responses. */
export type ChartResult = { ok: true; fog: FogView } | { ok: false; error: string };

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
