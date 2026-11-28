// Live mode: data from the local server (or a dev fixture), the animation loop, free-flight input,
// planet focus, the HUD and live updates. Reduced motion freezes the frame, draws only on input and
// cuts instead of gliding (AC7).
import type { FogView } from '../../src/core/contract/fog.js';
import { Beacons } from './beacons/controller.js';
import { CoChange } from './cochange/controller.js';
import { PARKED_POSE, type OrbitPose } from './camera/pose.js';
import { FreeFlightRig, GLIDE_MS } from './camera/rig.js';
import { ViewError, type DataClient } from './data/client.js';
import { Crew } from './crew/controller.js';
import { Debris } from './debris/controller.js';
import { Drones } from './drones/controller.js';
import { coveredBy } from './labels/overlay.js';
import { startLoop } from './loop.js';
import { planetLines, summaryText } from './model/describe.js';
import { FPS } from './model/motion.js';
import { PIXEL_HEIGHT } from './model/pixels.js';
import { surfaceDirection } from './model/system.js';
import type { Place } from './tree/model.js';
import { TreePanel } from './tree/panel.js';
import { byId } from './ui/dom.js';
import type { Hud } from './ui/hud.js';
import { Input } from './ui/input.js';
import { Panel } from './ui/panel.js';
import type { View } from './view.js';
import type { DirId } from '../../src/core/snapshot/types.js';

const REDUCE = '(prefers-reduced-motion: reduce)';
/** A focus glide in loop frames: a settlement is turned to where it will be when the glide ends (#209). */
const GLIDE_FRAMES = Math.round((GLIDE_MS * FPS) / 1000);

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
  /** #95: what the HUD says while the server's own rescans fail; null once one works again. */
  let rescanFailed: string | null = null;
  const rig = new FreeFlightRig(PARKED_POSE); // replaced by the start pose once a layout loads
  /**
   * The start pose the camera was last put at (first load, Home), while the user hasn't moved it since: a crew
   * that arrives or changes then reframes it, so Home's framing includes the ship (#207). Null once moved.
   */
  let atHome: OrbitPose | null = null;
  /** The camera to the start pose at the frame shown, the crew's ship framed too (View.homePose). */
  const goHome = () => {
    const p = view.homePose(shown());
    if (!p) return;
    atHome = p;
    rig.reset(p);
  };
  // #75: review and chart the focused planet's unseen files (the star's in free flight).
  const panel = new Panel({ client, fogTicket: () => view.fogTicket(), applyFog: (f, t) => view.applyFog(f, t),
    announce: (t) => hud.announce(t), release: () => view.pass.canvas.focus({ preventScroll: true }),
    beaconTicket: () => beacons.ticket(), applyBeacons: (b, t) => beacons.apply(b, drawnHead, t), // #79: a note left with a chart
    focusFile: (id) => { view.focusFile = id; view.focusSince = shown(); summarise(); redraw(); } }); // #211: the open diff's constellation
  // #209: the directory view, which hands a file or folder to the map (openPlace).
  const tree = new TreePanel({ client, open: (place, said) => openPlace(place, said), announce: (t) => hud.announce(t),
    release: () => view.pass.canvas.focus({ preventScroll: true }) });

  /** Something changed that needs a redraw: mark it and wake the loop. */
  const redraw = () => { dirty = true; loop.wake(); };
  const fit = () => {
    const dpr = devicePixelRatio || 1;
    view.resize(pixelHeight, innerWidth, innerHeight, dpr);
    hud.scale(view.labels.px, dpr);
    panel.scale(view.labels.px, dpr);
    tree.scale(view.labels.px, dpr);
    redraw();
  };

  // The frame drawn. Under reduced motion the loop's clock holds still, so this freezes on the frame where
  // it was switched on (frame 0 when it is on from the start) and resumes from there: switching it never
  // moves the planets (Qodo d094226d). The render hook draws frame 0 for reducedMotion (hook.ts).
  const shown = () => frame;
  /** The screen-reader summary: what the canvas shows, the focus's co-change links and the flags included (#211). */
  const summarise = () => {
    const m = view.model;
    if (m) hud.summary([summaryText(m, focus, view.fog, view.beacons), ...view.coChangeLines(focus)].join('. '));
  };
  const say = () => {
    const m = view.model;
    const p = focus === null ? null : m?.planets[focus];
    hud.announce(p ? `focused ${planetLines(p, view.fog).join(', ')}` : 'free flight');
    summarise();
  };
  /** Focuses planet i (null: free flight); `cell`, one of its surface cells, is turned to the camera, where it is once the glide ends (#209). */
  const setFocus = (i: number | null, cell: number | null = null) => {
    focus = i;
    view.focusSince = shown(); // #211: the constellation draws in from here
    focusId = i === null ? null : view.model?.planets[i]?.dirId ?? null;
    const p = i === null ? undefined : view.model?.planets[i];
    const facing = p && cell !== null ? surfaceDirection(p, cell, shown() + (reduced ? 0 : GLIDE_FRAMES)) : undefined;
    rig.focus(i === null ? null : view.focusTarget(i, shown()), reduced, facing);
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
    tree.setFog(f); // so does the directory view (#209)
    const { cleared, refogged } = view.fogChange;
    const notice = view.fogNotice;
    if (cleared || refogged) hud.announce(fogChanged = [cleared ? `charted ${files(cleared)}` : '', refogged ? `${files(refogged)} refogged` : ''].filter(Boolean).join(', '));
    else if (notice && notice !== 'no fog view') hud.announce(`${notice}: every file is drawn uncharted until the next update`); // a fog refused through the panel's path
    summarise();
    redraw();
  };
  // #79: the captain's log beacons, refetched with every layout load, snapshot and beacons event.
  const beacons = new Beacons({ view, client, announce: (t) => hud.announce(t), changed: () => {
    summarise();
    redraw();
  } });
  // #211: co-change links and the missing-pair flags, refetched with every layout load, snapshot and fog event.
  const cochange = new CoChange({ view, client, announce: (t) => hud.announce(t), changed: () => { summarise(); redraw(); } });
  // #80: the agent drones, refetched with every layout load and snapshot event.
  const drones = new Drones({ view, client, announce: (t) => hud.announce(t), redraw: () => redraw(), release: () => view.pass.canvas.focus({ preventScroll: true }),
    others: () => [byId('panel'), byId('tree')] });
  // #207: the crew aboard the ship, refetched with every layout load and snapshot event. One selection at a
  // time: picking a crew member closes a drone's panel, and the other way round.
  const crew = new Crew({ view, client, announce: (t) => hud.announce(t), redraw: () => redraw(), release: () => view.pass.canvas.focus({ preventScroll: true }),
    others: () => [byId('panel'), byId('tree')],
    // the ship changed: a camera still where Home put it frames the new ship (#207)
    reframe: () => { if (atHome !== null && rig.pose() === atHome && !rig.focused() && !rig.moving()) { goHome(); redraw(); } } });
  // R13: the stale work drifting round its planets, refetched with every layout load and snapshot event; one
  // selection at a time with the drones and the crew.
  const debris = new Debris({ view, client, announce: (t) => hud.announce(t), redraw: () => redraw(), release: () => view.pass.canvas.focus({ preventScroll: true }),
    others: () => [byId('panel'), byId('tree')] });
  // the bodies drawing debris changed (a first piece came, a last one was swept): a camera still at Home follows
  view.onHomeMoved = () => { if (atHome !== null && rig.pose() === atHome && !rig.focused() && !rig.moving()) { goHome(); redraw(); } };
  const deselect = () => { drones.deselect(); crew.deselect(); debris.deselect(); };

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
      // Later reloads keep the camera (planets keep their slots, append-only, and the frame count runs
      // on, so nothing jumps), except that a system which started empty, framed on its star, is
      // reframed once planets appear. The start pose turns with the orbits (#60): framed as at frame 0.
      if (!loaded || (!framedPlanets && model.planets.length > 0)) goHome();
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
      tree.setLayout(layout);
      say();
      if (fogChanged) hud.announce(fogChanged); // what the reload's fog changed (a rescan's refogs), not overwritten by say()
      if (paired.notice) hud.announce(paired.notice); // after say(), so the status line keeps it
      if (rescanFailed) hud.announce(rescanFailed); // still true after a reload (#95): the drawn scan is the last good one
      void drones.refresh(drawnHead);
      void crew.refresh(drawnHead);
      void debris.refresh(drawnHead);
      void beacons.refresh(drawnHead);
      void cochange.refresh(drawnHead);
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
    click: (x, y) => {
      if (!loaded) return;
      // #211: an edge arrow focuses the partner it points at (the star's: free flight, where the panel lists the star's files)
      const to = view.arrowAt(x, y);
      if (to !== null) { deselect(); setFocus(to < 0 ? null : to); return; }
      if (drones.pick(x, y, rig.pose(), shown())) { crew.deselect(); debris.deselect(); return; }
      if (crew.pick(x, y, rig.pose(), shown())) { drones.deselect(); debris.deselect(); return; }
      if (debris.pick(x, y, rig.pose(), shown())) { drones.deselect(); crew.deselect(); return; }
      const i = view.pickAt(x, y, rig.pose(), shown());
      if (i !== null) { deselect(); setFocus(i); }
    },
    cycle: (dir) => {
      deselect();
      const n = view.model?.planets.length ?? 0;
      if (n === 0) return;
      setFocus(focus === null ? (dir > 0 ? 0 : n - 1) : (focus + dir + n) % n);
    },
    release: () => { deselect(); setFocus(null); },
    home: () => { deselect(); if (view.model) { goHome(); setFocus(null); } },
  });

  /**
   * #209: the directory view opened a file or folder. Its planet is focused, turned to the settlement or
   * continent when it has one; a root file, unmatched test or a folder with no planet of its own goes
   * home to the star, whose files the review panel then lists. Then `said` is announced over say()'s line.
   */
  const openPlace = (place: Place, said: string) => {
    const m = view.model;
    if (!loaded || !m) return;
    deselect();
    if (place.kind === 'star' || place.kind === 'moonlet') {
      goHome();
      setFocus(null);
    } else {
      const i = m.planets.findIndex((p) => p.dirId === place.planet);
      if (i < 0) { hud.announce('not focused: its planet isn\'t on the map drawn now; waiting for the next update'); return; }
      setFocus(i, place.kind === 'settlement' || place.kind === 'continent' ? place.cell : null);
    }
    hud.announce(said);
    redraw();
  };

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
    drones.dock(now, rig.pose(), focus); // #189: before the labels, which move out from under the panel where it docks (#169)
    crew.dock(now, rig.pose(), focus); // #207: the crew panel docks the same way
    debris.dock(now, rig.pose(), focus); // R13: and the debris panel
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
  // #169: the review and drone panels are DOM laid over the label canvas, so the note and drone labels
  // move out from under the open ones. A panel that opens, closes or grows (a list that loaded) redraws,
  // which reduced motion's still frame would otherwise not.
  const panels = [byId('panel'), byId('drone-panel'), byId('crew-panel'), byId('debris-panel'), byId('tree')];
  view.covered = () => coveredBy(view.labels.canvas, panels);
  const watch = new ResizeObserver(redraw);
  for (const p of panels) watch.observe(p);
  fit();

  await update('layout');
  let paused = false;
  client.follow((ev) => {
    // #95: the server's own rescan failed (its new data would come as layout and fog events), or works again.
    if (ev.type === 'rescan') {
      rescanFailed = ev.ok ? null : `automatic rescan failed (exit ${ev.exitCode}): showing the last scan; the terminal running \`commet open\` says why`;
      hud.announce(rescanFailed ?? 'automatic rescan works again');
    } else if (ev.type === 'layout' || ev.type === 'fog') {
      void update(ev.type);
      if (ev.type === 'fog') void cochange.refresh(drawnHead); // #211: a chart may have dismissed a flag
    } else if (ev.type === 'snapshot' && ev.head === drawnHead) { void drones.refresh(drawnHead); void crew.refresh(drawnHead); void debris.refresh(drawnHead); void beacons.refresh(drawnHead); void cochange.refresh(drawnHead); } // a new head's layout event refetches for itself
    else if (ev.type === 'beacons') void beacons.refresh(drawnHead); // #79: a note left here or by `commet beacon`
  }, (status) => {
    // The server keeps no backlog, so a change made while the stream was down (or before it first
    // connected) would be lost: every (re)connect reloads. A resumed stream is announced once.
    if (status === 'live') {
      // #95: a failure that still stands is sent again on every connect, right after this, so one
      // that was cleared while the stream was down isn't said again (Qodo PR #158 61cc96f7).
      rescanFailed = null;
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
