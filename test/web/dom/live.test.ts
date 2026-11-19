// Live mode's fog (#64): the view applies a fog only over the layout of the same scan (fog.head is
// the layout's source.head). A scan can land between the parallel layout and fog fetches, or a fog
// event can arrive for a layout not drawn yet; the view then keeps the fog it had (or none), says
// so in the HUD status line, and picks up the matching fog on a later live event. Driven through
// runLive with a fake view, HUD and data client, since the real ones need WebGL and a DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveEvent } from '../../../src/core/contract/api.js';
import type { FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import { ViewError, type DataClient } from '../../../web/src/data/client.js';
import { runLive } from '../../../web/src/live.js';
import { systemModel, type SystemModel } from '../../../web/src/model/system.js';
import type { Hud } from '../../../web/src/ui/hud.js';
import type { View } from '../../../web/src/view.js';
import { DETAIL_BUCKETS, type DroneDetail, type DroneDetailResult, type DroneView } from '../../../src/core/contract/drones.js';
import type { BeaconView } from '../../../src/core/contract/beacons.js';
import type { FleetEntry } from '../../../web/src/render/drone-fleet.js';
import { miniFog, miniLayout } from '../../fixtures/contract/mini.js';
import type { DirId } from '../../../src/core/snapshot/types.js';
import { droneView, session } from '../../fixtures/drones.js';

// The review panel (#75) needs a DOM and is tested in the render suite: a no-op here.
vi.mock('../../../web/src/ui/panel.js', () => ({ Panel: class { setFog() {} select() {} scale() {} } }));
// The drone panel stub records what its session-detail section is told to show (#148).
const detailShown = vi.hoisted(() => [] as { kind: string; text?: string; detail?: unknown }[]);
vi.mock('../../../web/src/drones/panel.js', () => ({ DronePanel: class { onClose = () => {}; show() {} hide() {} showDetail(s: { kind: string }) { detailShown.push(s); } } }));

const HEAD = miniLayout.source.head;
const OTHER = 'b'.repeat(40);
const layoutAt = (head: string): LayoutV1 => ({ ...miniLayout, source: { ...miniLayout.source, head } });
const fogAt = (head: string, baseline: string | null = null): FogView => ({ ...miniFog, head, baseline });
/** A beacon view of `head` with one note per text, on the mini fixture's first planet. */
const beaconsAt = (head: string, texts: string[] = []): BeaconView => ({ schemaVersion: 'beacons.1', head, unplaced: 0,
  beacons: texts.map((text, i) => ({ fileId: `f_${String(i).padStart(12, '0')}`, path: `a/${i}.ts`, home: miniLayout.planets[0]!.dirId, at: head, text })) });

/** The page's elements by id, as the drone controller finds them. */
const els = new Map<string, { textContent: string; hidden: boolean; contains?: (n: unknown) => boolean }>();
/** What the page's keyboard focus is on (document.activeElement). */
const PANEL_BUTTON = { id: 'close' };
let activeElement: unknown = null;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {} })); // reduced motion: the loop sleeps
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('innerWidth', 640);
  vi.stubGlobal('innerHeight', 360);
  vi.stubGlobal('addEventListener', () => {});
  els.clear();
  detailShown.length = 0;
  activeElement = null;
  vi.stubGlobal('document', { get activeElement() { return activeElement; }, getElementById: (id: string) => { if (!els.has(id)) els.set(id, { textContent: '', hidden: true, contains: (n) => n === PANEL_BUTTON }); return els.get(id); } }); // the drone HUD line and panel host
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

/** A promise resolved from outside. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** runLive against fakes: `layouts` and `fogs` answer each request in turn (a function may wait or throw). */
async function live(first: { layout: LayoutV1; fog: FogView | Error }) {
  let head: string = first.layout.source.head;
  const layouts: (() => Promise<LayoutV1>)[] = [async () => first.layout];
  /** Answers for the drone view, in turn; with none queued, an empty one of the layout's head. */
  const droneAnswers: (() => Promise<DroneView>)[] = [];
  let droneCalls = 0;
  /** Answers for the beacon view (#79), in turn; with none queued, an empty one of the layout's head. */
  const beaconAnswers: (() => Promise<BeaconView>)[] = [];
  let beaconCalls = 0;
  /** Answers for a session's detail (#148), in turn; with none queued, an empty detail of the asked key and head. */
  const detailAnswers: (() => Promise<DroneDetailResult>)[] = [];
  const detailAsked: { key: string; at: string }[] = [];
  const fogs: (() => Promise<FogView>)[] = [async () => { if (first.fog instanceof Error) throw first.fog; return first.fog; }];
  let fogCalls = 0;
  let onEvent: (ev: LiveEvent) => void = () => {};
  let onStatus: (status: string) => void = () => {};
  const client: DataClient = {
    layout: () => layouts.shift()!().then((l) => { head = l.source.head; return l; }),
    fog: () => { fogCalls++; return fogs.shift()!(); },
    follow: (e, st) => { onEvent = e; onStatus = st; return () => {}; },
    drones: () => { droneCalls++; return (droneAnswers.shift() ?? (async () => droneView(head, [])))(); },
    droneDetail: (key, at) => { detailAsked.push({ key, at }); return (detailAnswers.shift() ?? (async () => emptyDetail(key, at)))(); },
    unseen: async (home, at) => ({ ok: true, at, home, files: [] }),
    diff: async () => ({ ok: false, error: 'no-such-file' }),
    chart: async () => ({ ok: false, error: 'not used' }),
    beacons: () => { beaconCalls++; return (beaconAnswers.shift() ?? (async () => beaconsAt(head)))(); },
    beacon: async () => ({ ok: false, error: 'not used' }),
  };
  let model: SystemModel | null = null;
  const view = {
    pass: { canvas: Object.assign(new EventTarget(), { focused: 0, focus() { this.focused++; }, setPointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) }) },
    labels: { px: 2 },
    fog: null as FogView | null,
    get model() { return model; },
    onFog: null as ((f: FogView | null) => void) | null,
    reducedMotion: false,
    fogChange: { cleared: 0, refogged: 0 },
    tickets: 0,
    applied: 0,
    fogTicket() { return ++view.tickets; },
    applyFog(f: FogView | null, t: number) {
      if (t < view.applied) return false;
      view.applied = t; view.fog = f; view.onFog?.(f); return true;
    },
    async load(layout: LayoutV1, fog: FogView | null = null, opts: { ticket?: number } = {}) {
      model = systemModel(layout); view.applyFog(fog, opts.ticket ?? view.fogTicket());
    },
    selectedDrone: null as string | null,
    drawn: [] as readonly FleetEntry[],
    setDrones: async (e: readonly FleetEntry[]) => { view.drawn = e; return true; },
    beaconsDrawn: null as BeaconView | null,
    setBeacons: (v: BeaconView | null) => { view.beaconsDrawn = v; return true; },
    droneAt: null as string | null,
    planetAt: null as number | null,
    pickDroneAt: () => view.droneAt,
    pickAt: () => view.planetAt,
    resize: () => {},
    draw: () => ({}),
    focusTarget: () => null,
  };
  const status: string[] = [];
  const hud = {
    announce: (t: string) => status.push(t), summary: () => {}, scale: () => {}, clearError: () => {},
    error: (title: string) => status.push(`error: ${title}`), setReducedMotion: () => {},
  };
  await runLive(view as unknown as View, hud as unknown as Hud, client);
  /** Sends a live event and waits until the view has handled it (every queued answer used, then settled). */
  const emit = async (ev: LiveEvent) => {
    onEvent(ev);
    await vi.waitFor(() => expect(layouts.length + fogs.length).toBe(0));
    await new Promise((r) => setTimeout(r, 10));
  };
  return { view, status, layouts, fogs, droneAnswers, detailAnswers, detailAsked, droneCalls: () => droneCalls, beaconAnswers, beaconCalls: () => beaconCalls, emit, send: (ev: LiveEvent) => onEvent(ev), connection: (st: string) => onStatus(st), fogCalls: () => fogCalls, last: () => status.at(-1) ?? '' };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

/** A session's detail with no edits, of `key` at `at` (#148). */
const emptyDetail = (key: string, at: string): DroneDetail => ({
  ok: true, schemaVersion: 'drone-detail.1', head: at, key: key as DroneDetail['key'], startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T10:00:00Z',
  files: [], otherFiles: 0, otherEdits: 0, buckets: new Array<number>(DETAIL_BUCKETS).fill(0), spanMs: 3_600_000, needsRescan: false,
});

describe('live mode applies a fog only over its own scan\'s layout (#64)', () => {
  it('a matched pair loads as before: the fog is applied and nothing is announced about it', async () => {
    const fog = fogAt(HEAD);
    const l = await live({ layout: miniLayout, fog });
    expect(l.view.fog).toBe(fog);
    expect(l.status.join('\n')).not.toMatch(/fog/);
    // A fog event at the same head replaces it.
    const charted = fogAt(HEAD, HEAD);
    l.fogs.push(async () => charted);
    await l.emit({ type: 'fog', head: HEAD });
    expect(l.view.fog).toBe(charted);
    expect(l.status.join('\n')).not.toMatch(/fog/);
  });

  it('a scan between the layout and fog fetches: the other scan\'s fog is not applied, the HUD says so, and the next event brings the match', async () => {
    const l = await live({ layout: layoutAt(OTHER), fog: fogAt(HEAD) });
    expect(l.view.fog).toBeNull();
    expect(l.last()).toMatch(new RegExp(`fog.*${HEAD.slice(0, 7)}.*${OTHER.slice(0, 7)}`));
    // The scan's snapshot lands: its fog event brings the fog of the drawn layout.
    const fog = fogAt(OTHER);
    l.fogs.push(async () => fog);
    await l.emit({ type: 'fog', head: OTHER });
    expect(l.view.fog).toBe(fog);
    expect(l.last()).toMatch(/fog/);
    expect(l.last()).not.toMatch(/not applied/);
  });

  it('says what a rescan\'s fog changed after the reload\'s own status text, and a refused fog through the panel\'s path (Qodo PR #117 r4)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.view.fogChange = { cleared: 0, refogged: 2 };
    l.layouts.push(async () => miniLayout);
    l.fogs.push(async () => fogAt(HEAD, HEAD));
    await l.emit({ type: 'layout', head: HEAD });
    expect(l.status.join('\n')).toMatch(/2 files refogged/);
    expect(l.status.slice(-2).join('\n')).toMatch(/2 files refogged/); // after say()'s "free flight"
  });

  it('keeps the fog it had when the next one is of another scan, and drops it with a layout of another head', async () => {
    const fog = fogAt(HEAD);
    const l = await live({ layout: miniLayout, fog });
    // A fog event for a scan whose layout isn't drawn yet.
    l.fogs.push(async () => fogAt(OTHER));
    await l.emit({ type: 'fog', head: OTHER });
    expect(l.view.fog).toBe(fog);
    expect(l.last()).toMatch(/fog.*not applied/);
    // The same layout reloaded (a reconnect) with a mismatched fog: the fog it had still matches.
    l.layouts.push(async () => miniLayout);
    l.fogs.push(async () => fogAt(OTHER));
    await l.emit({ type: 'layout', head: HEAD });
    expect(l.view.fog).toBe(fog);
    expect(l.last()).toMatch(/fog.*not applied/);
    // A layout of another scan with the old fog: the old fog matches neither, so none is applied.
    l.layouts.push(async () => layoutAt(OTHER));
    l.fogs.push(async () => fogAt(HEAD));
    await l.emit({ type: 'layout', head: OTHER });
    expect(l.view.fog).toBeNull();
    expect(l.last()).toMatch(/fog.*not applied/);
  });

  it('a fog event during a layout load is fetched once that layout is drawn, so it is checked against it', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const next = deferred<LayoutV1>();
    l.layouts.push(() => next.promise);
    l.fogs.push(async () => fogAt(HEAD)); // the load's own fog: fetched before the scan's snapshot landed
    const fog = fogAt(OTHER);
    l.fogs.push(async () => fog);
    const calls = l.fogCalls();
    const done = l.emit({ type: 'layout', head: OTHER });
    await vi.waitFor(() => expect(l.fogCalls()).toBe(calls + 1));
    void l.emit({ type: 'fog', head: OTHER });
    await new Promise((r) => setTimeout(r, 10));
    expect(l.fogCalls()).toBe(calls + 1); // waits for the layout
    next.resolve(layoutAt(OTHER));
    await done;
    expect(l.view.fog).toBe(fog);
  });

  it('a fog fetch that a layout event overtakes never leaves a stale fog or notice: updates run one at a time (Qodo local r1 03ea87ee)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const slow = deferred<FogView>();
    const fog = fogAt(OTHER);
    l.fogs.push(() => slow.promise); // a fog event's fetch, still running when a scan's layout lands
    l.layouts.push(async () => layoutAt(OTHER));
    l.fogs.push(async () => fog); // that load's own fog
    l.send({ type: 'fog', head: HEAD });
    l.send({ type: 'layout', head: OTHER });
    await settle();
    slow.resolve(fogAt(HEAD));
    await vi.waitFor(() => expect(l.layouts.length + l.fogs.length).toBe(0));
    await settle();
    expect(l.view.fog).toBe(fog);
    expect(l.status.join('\n')).not.toMatch(/not applied/);
  });

  it('fog answers land in event order: an older one never replaces or contradicts a newer one (Qodo local r1 43250c53)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const run = async (older: FogView, newer: FogView) => {
      const slow = deferred<FogView>();
      l.fogs.push(() => slow.promise, async () => newer);
      l.send({ type: 'fog', head: HEAD });
      l.send({ type: 'fog', head: HEAD });
      await settle();
      slow.resolve(older);
      await vi.waitFor(() => expect(l.fogs).toHaveLength(0));
      await settle();
      expect(l.view.fog).toBe(newer);
    };
    await run(fogAt(HEAD), fogAt(HEAD, HEAD)); // an older fog of the same scan
    await run(fogAt(OTHER), fogAt(HEAD)); // an older fog of another scan
    expect(l.last()).not.toMatch(/not applied/);
  });

  it('a failed fog fetch is announced after the load, not overwritten by it (Rule 1)', async () => {
    const l = await live({ layout: miniLayout, fog: new ViewError('/api/fog answered 500.', ['state error: run `commet scan`']) });
    expect(l.view.fog).toBeNull();
    expect(l.last()).toMatch(/^fog view unavailable: \/api\/fog answered 500\.[\s\S]*run `commet scan`/);
  });
});

describe('drones in live mode (#80)', () => {
  const [a] = miniLayout.planets.map((p) => p.dirId);
  const hud = () => els.get('drones-hud')!.textContent;

  it('draws the placed sessions of the drawn layout and says the three counts', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!), session(2, 'star'), session(3, 'd_does_not_exist' as DirId), session(4, null)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(2));
    expect(hud()).toBe('2 drones shown, 0 placed sessions hidden by the cap of 16, 2 sessions could not be placed');
    expect(l.view.drawn.map((e) => e.home).sort()).toEqual([a, 'star'].sort());
  });

  it('refetches on a snapshot event and on a layout event, not on a fog event', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const first = l.droneCalls();
    expect(first).toBe(1); // the first load
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.droneCalls()).toBe(first + 1));
    l.layouts.push(async () => miniLayout);
    l.fogs.push(async () => fogAt(HEAD));
    await l.emit({ type: 'layout', head: HEAD });
    expect(l.droneCalls()).toBe(first + 2);
    l.fogs.push(async () => fogAt(HEAD));
    await l.emit({ type: 'fog', head: HEAD });
    expect(l.droneCalls()).toBe(first + 2);
  });

  it('a failed fetch is announced, the map stays and the drones of this scan stay', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(1));
    l.droneAnswers.push(() => Promise.reject(new ViewError('/api/drones answered 500.')));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.last()).toMatch(/drones unavailable: .*500/));
    expect(l.view.model).not.toBeNull();
    expect(l.view.drawn.length).toBe(1);
    expect(hud()).toMatch(/^1 drone shown.*\(update failed: .*500/); // visible, not only announced
  });

  it('drones of another scan are not applied over this layout, and the HUD says so', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(OTHER, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.last()).toMatch(new RegExp(`drones not applied.*${OTHER.slice(0, 7)}.*${HEAD.slice(0, 7)}`)));
    expect(l.view.drawn).toEqual([]);
  });

  it('an old snapshot says "rescan to place drones" and draws none', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, null), session(2, null)], true));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(hud()).toMatch(/^rescan to place drones/));
    expect(l.view.drawn).toEqual([]);
  });

  it('an older drone answer that lands after a newer one changes nothing', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const slow = deferred<DroneView>();
    l.droneAnswers.push(() => slow.promise, async () => droneView(HEAD, [session(1, a!), session(2, 'star')]));
    l.send({ type: 'snapshot', head: HEAD });
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(2));
    slow.resolve(droneView(HEAD, [session(9, a!)]));
    await settle();
    expect(l.view.drawn.length).toBe(2);
    expect(hud()).toMatch(/^2 drones shown/);
  });

  /** A click on the view canvas, as Input sees it: a press and a release in the same place. */
  const click = (l: Awaited<ReturnType<typeof live>>) => {
    const ev = (type: string) => Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: 5, clientY: 5, movementX: 0, movementY: 0 });
    l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
    l.view.pass.canvas.dispatchEvent(ev('pointerup'));
  };

  it('clicking a planet closes the selected drone (its panel and its highlight)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(1));
    l.view.droneAt = session(1, a!).key;
    click(l);
    expect(l.view.selectedDrone).toBe(session(1, a!).key);
    l.view.droneAt = null;
    l.view.planetAt = 0;
    click(l);
    expect(l.view.selectedDrone).toBeNull();
  });

  it('a snapshot event of another head does not refetch drones (its layout event does)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const before = l.droneCalls();
    l.send({ type: 'snapshot', head: OTHER });
    await settle();
    expect(l.droneCalls()).toBe(before);
    expect(l.last()).not.toMatch(/drones/);
  });

  it('Home closes the selected drone', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(1));
    l.view.droneAt = session(1, a!).key;
    const ev = (type: string, init: object) => Object.assign(new Event(type), init);
    l.view.pass.canvas.dispatchEvent(ev('pointerdown', { button: 0, pointerId: 1, clientX: 5, clientY: 5 }));
    l.view.pass.canvas.dispatchEvent(ev('pointerup', { button: 0, pointerId: 1, clientX: 5, clientY: 5 }));
    expect(l.view.selectedDrone).not.toBeNull();
    l.view.pass.canvas.dispatchEvent(ev('keydown', { key: 'Home', code: 'Home', altKey: false, ctrlKey: false, metaKey: false, preventDefault: () => {} }));
    expect(l.view.selectedDrone).toBeNull();
  });

  /** Selects a drone and shows its panel, as a click does; the stubbed panel never opens by itself. */
  const openPanel = async (l: Awaited<ReturnType<typeof live>>) => {
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(1));
    l.view.droneAt = session(1, a!).key;
    const ev = (type: string) => Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: 5, clientY: 5, movementX: 0, movementY: 0 });
    l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
    l.view.pass.canvas.dispatchEvent(ev('pointerup'));
    expect(l.view.selectedDrone).not.toBeNull();
    els.get('drone-panel')!.hidden = false;
  };
  const escape = (l: Awaited<ReturnType<typeof live>>) =>
    l.view.pass.canvas.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape', code: 'Escape', altKey: false, ctrlKey: false, metaKey: false, preventDefault: () => {} }));

  it('closing the panel while keyboard focus is inside it hands focus back to the view (Qodo 048c2a94)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await openPanel(l);
    const before = (l.view.pass.canvas as unknown as { focused: number }).focused;
    activeElement = PANEL_BUTTON;
    escape(l);
    expect(l.view.selectedDrone).toBeNull();
    expect((l.view.pass.canvas as unknown as { focused: number }).focused).toBe(before + 1);
  });

  it('closing the panel with focus elsewhere does not steal it', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await openPanel(l);
    const before = (l.view.pass.canvas as unknown as { focused: number }).focused;
    activeElement = { id: 'somewhere else' };
    escape(l);
    expect(l.view.selectedDrone).toBeNull();
    expect((l.view.pass.canvas as unknown as { focused: number }).focused).toBe(before);
  });

  it('a layout of another scan closes the selected drone at once, before its drone view arrives', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await openPanel(l);
    const slow = deferred<DroneView>();
    l.droneAnswers.push(() => slow.promise);
    l.layouts.push(async () => layoutAt(OTHER));
    l.fogs.push(async () => fogAt(OTHER));
    l.send({ type: 'layout', head: OTHER });
    await vi.waitFor(() => expect(l.layouts.length).toBe(0));
    await vi.waitFor(() => expect(l.view.selectedDrone).toBeNull());
    slow.resolve(droneView(OTHER, []));
  });
});

describe("the drone panel's session detail (#148)", () => {
  const [a] = miniLayout.planets.map((p) => p.dirId);
  const ev = (type: string) => Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: 5, clientY: 5, movementX: 0, movementY: 0 });
  /** Draws `sessions` and clicks the drone of `key`, as a user does. */
  const drawAndPick = async (l: Awaited<ReturnType<typeof live>>, sessions: ReturnType<typeof session>[], key: string) => {
    l.droneAnswers.push(async () => droneView(HEAD, sessions));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(sessions.length));
    l.view.droneAt = key;
    l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
    l.view.pass.canvas.dispatchEvent(ev('pointerup'));
  };
  const kinds = () => detailShown.map((d) => d.kind);

  it('asks for nothing until a drone is selected, then once, for that session at the drawn head: loading, then the list', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!), session(2, 'star')]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(l.view.drawn.length).toBe(2));
    expect(l.detailAsked).toEqual([]);
    const ready = { ...emptyDetail(session(2, 'star').key, HEAD), files: [{ fileId: 'f_000000000001' as const, path: 'src/a.ts', edits: 2 }], buckets: [2, ...new Array<number>(DETAIL_BUCKETS - 1).fill(0)] };
    l.detailAnswers.push(async () => ready);
    l.view.droneAt = session(2, 'star').key;
    l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
    l.view.pass.canvas.dispatchEvent(ev('pointerup'));
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'ready']));
    expect(l.detailAsked).toEqual([{ key: session(2, 'star').key, at: HEAD }]);
    expect(detailShown[1]!.detail).toEqual(ready);
  });

  it('never asks for an inferred pseudo-session, and says the detail is for agent sessions (Rule 6)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const s = session(1, a!, { inferred: true });
    await drawAndPick(l, [s], s.key);
    await settle();
    expect(l.detailAsked).toEqual([]);
    expect(detailShown).toEqual([{ kind: 'note', text: 'file detail is for agent sessions only' }]);
  });

  it('drops a reply that lands after its drone was closed or another one picked', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const slow = deferred<DroneDetailResult>();
    l.detailAnswers.push(() => slow.promise);
    await drawAndPick(l, [session(1, a!), session(2, 'star')], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading']));
    // Another drone: its own request; the first one's late answer is dropped.
    l.view.droneAt = session(2, 'star').key;
    l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
    l.view.pass.canvas.dispatchEvent(ev('pointerup'));
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'loading', 'ready']));
    slow.resolve({ ...emptyDetail(session(1, a!).key, HEAD), otherFiles: 1, otherEdits: 1, buckets: [1, ...new Array<number>(DETAIL_BUCKETS - 1).fill(0)] });
    await settle();
    expect(kinds()).toEqual(['loading', 'loading', 'ready']);
    expect((detailShown[2]!.detail as DroneDetail).key).toBe(session(2, 'star').key);
    // Closed while loading: nothing is shown when the answer lands.
    const late = deferred<DroneDetailResult>();
    l.detailAnswers.push(() => late.promise);
    l.view.droneAt = session(1, a!).key;
    l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
    l.view.pass.canvas.dispatchEvent(ev('pointerup'));
    await vi.waitFor(() => expect(kinds().length).toBe(4));
    l.view.pass.canvas.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape', code: 'Escape', altKey: false, ctrlKey: false, metaKey: false, preventDefault: () => {} }));
    late.resolve(emptyDetail(session(1, a!).key, HEAD));
    await settle();
    expect(kinds()).toEqual(['loading', 'loading', 'ready', 'loading']);
  });

  it('a failed request is a line in the panel and an announcement; the map and the drones stay', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    l.detailAnswers.push(() => Promise.reject(new ViewError('/api/drone-detail answered 500.')));
    await drawAndPick(l, [session(1, a!)], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'failed']));
    expect(detailShown[1]!.text).toMatch(/500/);
    expect(l.last()).toMatch(/session files unavailable: .*500/);
    expect(l.view.model).not.toBeNull();
    expect(l.view.drawn.length).toBe(1);
  });

  it('a new drone view asks again for the open drone, since a rescan at the same head can change its edits (Qodo 32bf0631)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const before = deferred<DroneDetailResult>();
    l.detailAnswers.push(() => before.promise);
    await drawAndPick(l, [session(1, a!)], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading']));
    // A rescan at the same head while the first request is out: a new request, and the old answer is dropped.
    const after = { ...emptyDetail(session(1, a!).key, HEAD), otherFiles: 1, otherEdits: 2, buckets: [2, ...new Array<number>(DETAIL_BUCKETS - 1).fill(0)] };
    l.detailAnswers.push(async () => after);
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    // The refresh marks the list at once (34ee1e52), then the new request loads and lands.
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'loading', 'loading', 'ready']));
    before.resolve(emptyDetail(session(1, a!).key, HEAD));
    await settle();
    expect(kinds()).toEqual(['loading', 'loading', 'loading', 'ready']);
    expect(detailShown[3]!.detail).toEqual(after);
    expect(l.detailAsked).toHaveLength(2);
  });

  it('a failed drone refresh still asks again for the open drone: the refresh came from a new scan (Qodo PR #167 09393e2b)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await drawAndPick(l, [session(1, a!)], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'ready']));
    l.droneAnswers.push(() => Promise.reject(new ViewError('/api/drones answered 500.')));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'ready', 'loading', 'loading', 'ready']));
    expect(l.detailAsked).toHaveLength(2);
  });

  it('a refresh clears the open file list at once, before the new drones arrive (Qodo local backstop 34ee1e52)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await drawAndPick(l, [session(1, a!)], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'ready']));
    const slow = deferred<DroneView>();
    l.droneAnswers.push(() => slow.promise);
    l.send({ type: 'snapshot', head: HEAD });
    // The old scan's files are gone while the drone view is out.
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'ready', 'loading']));
    slow.resolve(droneView(HEAD, [session(1, a!)]));
    await vi.waitFor(() => expect(kinds().at(-1)).toBe('ready'));
  });

  it('when the new drones cannot be drawn, the open list says so instead of showing the old scan (34ee1e52)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await drawAndPick(l, [session(1, a!)], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'ready']));
    l.view.setDrones = async () => { throw new ViewError('the drones could not be compiled'); };
    l.droneAnswers.push(async () => droneView(HEAD, [session(1, a!)]));
    l.send({ type: 'snapshot', head: HEAD });
    await vi.waitFor(() => expect(kinds().at(-1)).toBe('failed'));
    expect(detailShown.at(-1)!.text).toMatch(/could not be drawn/);
    expect(l.detailAsked).toHaveLength(1);
  });

  it('returning to a drone whose request was dropped asks again, and never stays loading (Qodo PR #167 7fdffd82)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    const slow = deferred<DroneDetailResult>();
    l.detailAnswers.push(() => slow.promise);
    const inferred = session(2, 'star', { inferred: true });
    await drawAndPick(l, [session(1, a!), inferred], session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading']));
    const pick = (key: string) => {
      l.view.droneAt = key;
      l.view.pass.canvas.dispatchEvent(ev('pointerdown'));
      l.view.pass.canvas.dispatchEvent(ev('pointerup'));
    };
    pick(inferred.key);
    slow.resolve(emptyDetail(session(1, a!).key, HEAD)); // lands while the inferred drone is selected: dropped
    await settle();
    pick(session(1, a!).key);
    await vi.waitFor(() => expect(kinds()).toEqual(['loading', 'note', 'loading', 'ready']));
    expect(l.detailAsked).toHaveLength(2);
  });
});

describe('the server\'s own rescans in live mode (#95)', () => {
  it('a failed rescan is said with its exit code, the map stays, and it is said again after a reload until a good one; the events fetch nothing', async () => {
    const fog = fogAt(HEAD);
    const l = await live({ layout: miniLayout, fog });
    const calls = l.fogCalls();
    l.send({ type: 'rescan', ok: false, exitCode: 5 });
    await settle();
    expect(l.last()).toBe('automatic rescan failed (exit 5): showing the last scan; the terminal running `commet open` says why');
    expect(l.view.fog).toBe(fog);
    expect(l.view.model).not.toBeNull();
    expect([l.fogCalls(), l.layouts.length]).toEqual([calls, 0]);
    // Still the state after a reload (a layout event, or a reconnect): said again after the reload's own status text.
    l.layouts.push(async () => miniLayout);
    l.fogs.push(async () => fog);
    await l.emit({ type: 'layout', head: HEAD });
    expect(l.last()).toBe('automatic rescan failed (exit 5): showing the last scan; the terminal running `commet open` says why');
    l.send({ type: 'rescan', ok: true, exitCode: 0 });
    await settle();
    expect(l.last()).toBe('automatic rescan works again');
    l.layouts.push(async () => miniLayout);
    l.fogs.push(async () => fog);
    await l.emit({ type: 'layout', head: HEAD });
    expect(l.status.join('\n').split('automatic rescan failed').length - 1).toBe(2);
    expect(l.fogCalls()).toBe(calls + 2);
  });

  it('a failure cleared while the stream was down isn\'t said after the reconnect; one that still stands, which the server sends on connect, is (Qodo PR #158 61cc96f7)', async () => {
    const FAILED = 'automatic rescan failed (exit 5): showing the last scan; the terminal running `commet open` says why';
    const fog = fogAt(HEAD);
    const l = await live({ layout: miniLayout, fog });
    const reload = async (step: () => void) => {
      l.layouts.push(async () => miniLayout);
      l.fogs.push(async () => fog);
      step();
      await vi.waitFor(() => expect(l.layouts.length + l.fogs.length).toBe(0));
      await settle();
    };
    l.send({ type: 'rescan', ok: false, exitCode: 5 });
    await settle();
    expect(l.last()).toBe(FAILED);
    // The stream drops, and a rescan works again meanwhile: the server, with no failure standing, sends nothing on connect.
    l.connection('live updates paused (network error); retrying');
    const at = l.status.length;
    await reload(() => l.connection('live'));
    await reload(() => l.send({ type: 'layout', head: HEAD }));
    expect(l.status.slice(at)).toContain('live updates resumed');
    expect(l.status.slice(at)).not.toContain(FAILED);
    // A failure that still stands is sent right after the connect, and said, after a reload too.
    l.send({ type: 'rescan', ok: false, exitCode: 5 });
    l.connection('live updates paused (network error); retrying');
    await reload(() => { l.connection('live'); l.send({ type: 'rescan', ok: false, exitCode: 5 }); });
    expect(l.last()).toBe(FAILED);
    await reload(() => l.send({ type: 'layout', head: HEAD }));
    expect(l.last()).toBe(FAILED);
  });
});

describe('beacons in live mode (#79)', () => {
  it('draws the beacons of the drawn layout, and refetches on a beacons event and on a layout event, not on a fog event', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await vi.waitFor(() => expect(l.beaconCalls()).toBe(1));
    await settle();
    expect(l.view.beaconsDrawn?.head).toBe(HEAD);
    const noted = beaconsAt(HEAD, ['the parser keeps NUL framing']);
    l.beaconAnswers.push(async () => noted);
    l.send({ type: 'beacons', head: HEAD });
    await vi.waitFor(() => expect(l.view.beaconsDrawn).toBe(noted));
    expect(l.beaconCalls()).toBe(2);
    l.fogs.push(async () => fogAt(HEAD));
    await l.emit({ type: 'fog', head: HEAD });
    expect(l.beaconCalls()).toBe(2);
    l.layouts.push(async () => miniLayout);
    l.fogs.push(async () => fogAt(HEAD));
    await l.emit({ type: 'layout', head: HEAD });
    await vi.waitFor(() => expect(l.beaconCalls()).toBe(3));
  });

  it('beacons of another scan are not applied over this layout, and the HUD says so', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await vi.waitFor(() => expect(l.beaconCalls()).toBe(1));
    await settle();
    const kept = l.view.beaconsDrawn;
    l.beaconAnswers.push(async () => beaconsAt(OTHER, ['from another scan']));
    l.send({ type: 'beacons', head: OTHER });
    await vi.waitFor(() => expect(l.last()).toMatch(new RegExp(`beacons not applied.*${OTHER.slice(0, 7)}.*${HEAD.slice(0, 7)}`)));
    expect(l.view.beaconsDrawn).toBe(kept);
  });

  it('a failed fetch is announced and the map stays (Rule 1: never silent)', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await vi.waitFor(() => expect(l.beaconCalls()).toBe(1));
    l.beaconAnswers.push(() => Promise.reject(new ViewError('/api/beacons answered 500.')));
    l.send({ type: 'beacons', head: HEAD });
    await vi.waitFor(() => expect(l.last()).toMatch(/beacons unavailable: .*500/));
    expect(l.view.model).not.toBeNull();
  });

  it('an older beacon answer that lands after a newer one changes nothing', async () => {
    const l = await live({ layout: miniLayout, fog: fogAt(HEAD) });
    await vi.waitFor(() => expect(l.beaconCalls()).toBe(1));
    await settle();
    const slow = deferred<BeaconView>();
    const newer = beaconsAt(HEAD, ['newer']);
    l.beaconAnswers.push(() => slow.promise, async () => newer);
    l.send({ type: 'beacons', head: HEAD });
    l.send({ type: 'beacons', head: HEAD });
    await vi.waitFor(() => expect(l.view.beaconsDrawn).toBe(newer));
    slow.resolve(beaconsAt(HEAD, ['older']));
    await settle();
    expect(l.view.beaconsDrawn).toBe(newer);
  });
});
