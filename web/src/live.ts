// Live mode: data from the local server (or a dev fixture), the animation loop, free-flight input,
// planet focus, the HUD and live updates. Reduced motion freezes the frame, draws only on input and
// cuts instead of gliding (AC7).
import { PARKED_POSE, startPose } from './camera/pose.js';
import { FreeFlightRig } from './camera/rig.js';
import { ViewError, type DataClient } from './data/client.js';
import { startLoop } from './loop.js';
import { planetLines, summaryText } from './model/describe.js';
import { effectiveFrame } from './model/motion.js';
import { PIXEL_HEIGHT } from './model/pixels.js';
import type { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';
import type { View } from './view.js';

const REDUCE = '(prefers-reduced-motion: reduce)';

const describeError = (e: unknown): ViewError =>
  e instanceof ViewError ? e : new ViewError('The view hit an internal error.', [e instanceof Error ? e.message : String(e)]);
/** The fog isn't drawn yet, so a fog failure is announced, not fatal (Rule 1: never silent). */
const fogFailed = (hud: Hud) => (e: unknown) => hud.announce(`fog view unavailable: ${describeError(e).message}`);

export async function runLive(view: View, hud: Hud, client: DataClient): Promise<void> {
  const media = matchMedia(REDUCE);
  let reduced = media.matches;
  let userSetMotion = false;
  let pixelHeight: number = PIXEL_HEIGHT.default;
  let focus: number | null = null;
  /** The focused planet's dirId: what survives a reload, whenever the user changed focus. */
  let focusId: string | null = null;
  let dirty = true;
  let lastFrame = -1;
  let frame = 0;
  let loaded = false;
  /** Whether the start pose was framed on planets (false: on a star alone). */
  let framedPlanets = false;
  const rig = new FreeFlightRig(PARKED_POSE); // replaced by the start pose once a layout loads

  /** Something changed that needs a redraw: mark it and wake the loop. */
  const redraw = () => { dirty = true; loop.wake(); };
  const fit = () => {
    const dpr = devicePixelRatio || 1;
    view.resize(pixelHeight, innerWidth, innerHeight, dpr);
    hud.scale(view.labels.px, dpr);
    redraw();
  };

  const shown = () => effectiveFrame(frame, reduced);
  const say = () => {
    const m = view.model;
    const p = focus === null ? null : m?.planets[focus];
    hud.announce(p ? `focused ${planetLines(p).join(', ')}` : 'free flight');
    if (m) hud.summary(summaryText(m, focus));
  };
  const setFocus = (i: number | null) => {
    focus = i;
    focusId = i === null ? null : view.model?.planets[i]?.dirId ?? null;
    rig.focus(i === null ? null : view.focusTarget(i, shown()), reduced);
    say();
    dirty = true;
  };

  const loadOnce = async () => {
    try {
      const fog = client.fog().catch((e: unknown) => { fogFailed(hud)(e); return null; }); // in parallel with the layout
      const layout = await client.layout();
      await view.load(layout, await fog);
      hud.clearError();
      const model = view.model!;
      // Later reloads keep the camera (planets never move: append-only slots), except that a system
      // which started empty, framed on its star, is reframed once planets appear.
      if (!loaded || (!framedPlanets && model.planets.length > 0)) rig.reset(startPose(model));
      framedPlanets = model.planets.length > 0;
      loaded = true;
      // focusId is read now, after the awaits, so a focus change made during the reload wins
      const kept = focusId === null ? -1 : model.planets.findIndex((p) => p.dirId === focusId);
      if (kept >= 0) {
        // still there: keep the user's framing (zoom, angle) and only follow the planet's centre
        focus = kept;
        const t = view.focusTarget(kept, shown());
        if (t) rig.track(t);
      } else if (focus !== null) setFocus(null);
      say();
      redraw();
    } catch (e) {
      const err = describeError(e);
      hud.error(err.title, err.detail);
    }
  };
  // One load at a time: a burst of live events while one runs collapses into a single reload after it.
  let loading: Promise<void> | null = null, rerun = false;
  const loadLayout = (): Promise<void> => {
    if (loading) { rerun = true; return loading; }
    loading = (async () => {
      do { rerun = false; await loadOnce(); } while (rerun);
      loading = null;
    })();
    return loading;
  };

  const input = new Input(view.pass.canvas, {
    wake: () => loop.wake(),
    click: (x, y) => { if (!loaded) return; const i = view.pickAt(x, y, rig.pose(), shown()); if (i !== null) setFocus(i); },
    cycle: (dir) => {
      const n = view.model?.planets.length ?? 0;
      if (n === 0) return;
      setFocus(focus === null ? (dir > 0 ? 0 : n - 1) : (focus + dir + n) % n);
    },
    release: () => setFocus(null),
    home: () => { if (view.model) { rig.reset(startPose(view.model)); setFocus(null); } },
  });

  const loop = startLoop(({ frame: f, dtMs }) => {
    frame = f;
    if (!loaded) return;
    const now = shown();
    let changed = rig.step(input.take(), dtMs);
    if (focus !== null && !rig.focused()) { focus = focusId = null; say(); } // flying away left the focus
    if (focus !== null) {
      const t = view.focusTarget(focus, now);
      if (t) changed = rig.track(t) || changed;
    }
    if (!changed && !dirty && now === lastFrame) return;
    view.draw(now, rig.pose(), focus);
    lastFrame = now;
    dirty = false;
  }, () => !reduced || input.busy() || rig.moving() || dirty, () => !reduced);

  const setReduced = (on: boolean) => {
    reduced = on;
    if (on) rig.settle(); // a glide already running cuts to its end
    hud.setReducedMotion(on);
    redraw();
  };
  hud.onPixelHeight = (h) => { pixelHeight = h; fit(); }; // the pixel pass clamps it
  hud.onReducedMotion = (on) => { userSetMotion = true; setReduced(on); };
  hud.setReducedMotion(reduced);
  media.addEventListener('change', () => { if (!userSetMotion) setReduced(media.matches); });
  addEventListener('resize', fit);
  fit();

  await loadLayout();
  let paused = false;
  client.follow((ev) => {
    if (ev.type === 'layout') void loadLayout();
    else if (ev.type === 'fog') void client.fog().then((f) => { view.fog = f; }, fogFailed(hud));
  }, (status) => {
    // The server keeps no backlog, so a change made while the stream was down (or before it first
    // connected) would be lost: every (re)connect reloads. A resumed stream is announced once.
    if (status === 'live') {
      void loadLayout();
      if (paused) hud.announce('live updates resumed');
      paused = false;
      return;
    }
    paused = true;
    hud.announce(status);
  });
  view.pass.canvas.focus({ preventScroll: true });
}
