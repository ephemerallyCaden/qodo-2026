// Live mode: data from the local server (or a dev fixture), the animation loop, free-flight input,
// planet focus, the HUD and live updates. Reduced motion freezes the frame, draws only on input and
// cuts instead of gliding (AC7).
import type { FogView } from '../../src/core/contract/fog.js';
import { PARKED_POSE, startPose } from './camera/pose.js';
import { FreeFlightRig } from './camera/rig.js';
import { ViewError, type DataClient } from './data/client.js';
import { Drones } from './drones/controller.js';
import { startLoop } from './loop.js';
import { planetLines, summaryText } from './model/describe.js';
import { effectiveFrame } from './model/motion.js';
import { PIXEL_HEIGHT } from './model/pixels.js';
import type { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Panel } from './ui/panel.js';
import type { View } from './view.js';
import type { DirId } from '../../src/core/snapshot/types.js';

const REDUCE = '(prefers-reduced-motion: reduce)';

const describeError = (e: unknown): ViewError =>
  e instanceof ViewError ? e : new ViewError('The view hit an internal error.', [e instanceof Error ? e.message : String(e)]);
const short = (head: string) => head.slice(0, 7);
const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

/** A fog fetch's outcome: it never rejects, so a fetch running beside the layout's is never unhandled. */
type Fetched = { fog: FogView } | { error: unknown };

/**
 * The fog to keep over a layout of `head` (#64): the fetched one when it's of that scan, else the
 * one the view had when it is, else none, so one scan's fog is never applied over another's
 * layout (a scan can land between the layout and fog fetches). A refused or failed fog is said in
 * the HUD status line, not fatal (Rule 1: never silent), and `held` stays set until a fog of the
 * drawn layout is applied again, which is said too. The next fog event fetches again.
 */
function pairFog(head: string, got: Fetched, had: FogView | null, held: boolean): { fog: FogView | null; notice: string | null; held: boolean } {
  if ('fog' in got && got.fog.head === head) return { fog: got.fog, notice: held ? `fog view updated (${short(head)})` : null, held: false };
  const notice = 'fog' in got
    ? `fog not applied: the fog is of ${short(got.fog.head)} but the layout of ${short(head)} (different scans); waiting for the next update`
    : `fog view unavailable: ${describeError(got.error).message}`;
  return { fog: had?.head === head ? had : null, notice, held: true };
}

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
  /** The drawn layout's head: the only head a fog may be applied at (#64). */
  let drawnHead: string | null = null;
  /** A fog was refused or failed and the HUD said so (pairFog). */
  let fogHeld = false;
  const rig = new FreeFlightRig(PARKED_POSE); // replaced by the start pose once a layout loads
  // #75: review and chart the focused planet's unseen files (the star's in free flight).
  const panel = new Panel({ client, fogTicket: () => view.fogTicket(), applyFog: (f, t) => view.applyFog(f, t),
    announce: (t) => hud.announce(t), release: () => view.pass.canvas.focus({ preventScroll: true }) });

  /** Something changed that needs a redraw: mark it and wake the loop. */
  const redraw = () => { dirty = true; loop.wake(); };
  const fit = () => {
    const dpr = devicePixelRatio || 1;
    view.resize(pixelHeight, innerWidth, innerHeight, dpr);
    hud.scale(view.labels.px, dpr);
    panel.scale(view.labels.px, dpr);
    redraw();
  };

  const shown = () => effectiveFrame(frame, reduced);
  const say = () => {
    const m = view.model;
    const p = focus === null ? null : m?.planets[focus];
    hud.announce(p ? `focused ${planetLines(p, view.fog).join(', ')}` : 'free flight');
    if (m) hud.summary(summaryText(m, focus, view.fog));
  };
  const setFocus = (i: number | null) => {
    focus = i;
    focusId = i === null ? null : view.model?.planets[i]?.dirId ?? null;
    rig.focus(i === null ? null : view.focusTarget(i, shown()), reduced);
    panel.select(focusId as DirId | null, i === null ? null : view.model?.planets[i]?.path ?? null);
    say();
    dirty = true;
  };

  /** What the last applied fog changed, in words; a reload says it again after its own status text overwrites it. */
  let fogChanged = '';
  // Fog (#74): every applied fog redraws and refreshes the text; a front starts on the next frame.
  // What changed is announced, since a front can be on the far side, or not drawn under reduced motion.
  view.onFog = (f) => {
    panel.setFog(f); // the review panel follows every applied fog (#75)
    const { cleared, refogged } = view.fogChange;
    const notice = view.fogNotice;
    if (cleared || refogged) hud.announce(fogChanged = [cleared ? `charted ${files(cleared)}` : '', refogged ? `${files(refogged)} refogged` : ''].filter(Boolean).join(', '));
    else if (notice && notice !== 'no fog view') hud.announce(`${notice}: every file is drawn uncharted until the next update`); // a fog refused through the panel's path
    const m = view.model;
    if (m) hud.summary(summaryText(m, focus, view.fog));
    redraw();
  };
  // #80: the agent drones, refetched with every layout load and snapshot event.
  const drones = new Drones({ view, client, announce: (t) => hud.announce(t), redraw: () => redraw(), release: () => view.pass.canvas.focus({ preventScroll: true }) });

  const fetchFog = (): Promise<Fetched> => client.fog().then((fog) => ({ fog }), (error: unknown) => ({ error }));
  const loadOnce = async () => {
    try {
      const ticket = view.fogTicket(); // taken before the fetch, so a newer fog applied meanwhile wins
      const fog = fetchFog(); // in parallel with the layout
      const layout = await client.layout();
      const paired = pairFog(layout.source.head, await fog, view.fog, fogHeld);
      fogChanged = '';
      await view.load(layout, paired.fog, { ticket });
      drawnHead = layout.source.head;
      fogHeld = paired.held;
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
        panel.select(focusId as DirId, model.planets[kept]!.path);
        const t = view.focusTarget(kept, shown());
        if (t) rig.track(t);
      } else if (focus !== null) setFocus(null);
      say();
      if (fogChanged) hud.announce(fogChanged); // what the reload's fog changed (a rescan's refogs), not overwritten by say()
      if (paired.notice) hud.announce(paired.notice); // after say(), so the status line keeps it
      void drones.refresh(drawnHead);
      redraw();
    } catch (e) {
      const err = describeError(e);
      hud.error(err.title, err.detail);
    }
  };
  /** A fog event: the fog, paired with the drawn layout. Before any is drawn, the first load fetches its own. */
  const refreshOnce = async () => {
    if (drawnHead === null) return;
    const ticket = view.fogTicket();
    const paired = pairFog(drawnHead, await fetchFog(), view.fog, fogHeld);
    if (paired.fog !== view.fog) view.applyFog(paired.fog, ticket); // a kept fog isn't applied again
    fogHeld = paired.held;
    if (paired.notice) hud.announce(paired.notice);
  };
  // One update at a time: live events that arrive while one runs collapse into a single run after
  // it, and a layout reload (which fetches its own fog) covers a fog refresh. Run in turn, a fog is
  // always paired with the layout drawn while it was fetched (#64), and an older answer never lands
  // after a newer one (Qodo local r1 03ea87ee, 43250c53).
  let running: Promise<void> | null = null;
  let pending: 'layout' | 'fog' | null = null;
  const update = (kind: 'layout' | 'fog'): Promise<void> => {
    if (pending !== 'layout') pending = kind;
    if (running) return running;
    running = (async () => {
      while (pending !== null) {
        const next = pending;
        pending = null;
        await (next === 'layout' ? loadOnce() : refreshOnce());
      }
      running = null;
    })();
    return running;
  };

  const input = new Input(view.pass.canvas, {
    wake: () => loop.wake(),
    click: (x, y) => { if (!loaded || drones.pick(x, y, rig.pose(), shown())) return; const i = view.pickAt(x, y, rig.pose(), shown()); if (i !== null) setFocus(i); },
    cycle: (dir) => {
      const n = view.model?.planets.length ?? 0;
      if (n === 0) return;
      setFocus(focus === null ? (dir > 0 ? 0 : n - 1) : (focus + dir + n) % n);
    },
    release: () => { drones.deselect(); setFocus(null); },
    home: () => { if (view.model) { rig.reset(startPose(view.model)); setFocus(null); } },
  });

  const loop = startLoop(({ frame: f, dtMs }) => {
    frame = f;
    if (!loaded) return;
    const now = shown();
    let changed = rig.step(input.take(), dtMs);
    if (focus !== null && !rig.focused()) { focus = focusId = null; panel.select(null, null); say(); } // flying away left the focus
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
    view.reducedMotion = on; // fog changes snap; a front in progress ends
    if (on) rig.settle(); // a glide already running cuts to its end
    hud.setReducedMotion(on);
    redraw();
  };
  hud.onPixelHeight = (h) => { pixelHeight = h; fit(); }; // the pixel pass clamps it
  hud.onReducedMotion = (on) => { userSetMotion = true; setReduced(on); };
  hud.setReducedMotion(reduced);
  view.reducedMotion = reduced;
  media.addEventListener('change', () => { if (!userSetMotion) setReduced(media.matches); });
  addEventListener('resize', fit);
  fit();

  await update('layout');
  let paused = false;
  client.follow((ev) => {
    if (ev.type === 'layout' || ev.type === 'fog') void update(ev.type);
    else if (ev.type === 'snapshot') void drones.refresh(drawnHead);
  }, (status) => {
    // The server keeps no backlog, so a change made while the stream was down (or before it first
    // connected) would be lost: every (re)connect reloads. A resumed stream is announced once.
    if (status === 'live') {
      void update('layout');
      if (paused) hud.announce('live updates resumed');
      paused = false;
      return;
    }
    paused = true;
    hud.announce(status);
  });
  view.pass.canvas.focus({ preventScroll: true });
}
