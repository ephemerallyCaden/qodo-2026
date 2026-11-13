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
import type { DroneView } from '../../../src/core/contract/drones.js';
import type { FleetEntry } from '../../../web/src/render/drone-fleet.js';
import { miniFog, miniLayout } from '../../fixtures/contract/mini.js';
import type { DirId } from '../../../src/core/snapshot/types.js';
import { droneView, session } from '../../fixtures/drones.js';

// The review panel (#75) needs a DOM and is tested in the render suite: a no-op here.
vi.mock('../../../web/src/ui/panel.js', () => ({ Panel: class { setFog() {} select() {} scale() {} } }));
vi.mock('../../../web/src/drones/panel.js', () => ({ DronePanel: class { onClose = () => {}; show() {} hide() {} } }));

const HEAD = miniLayout.source.head;
const OTHER = 'b'.repeat(40);
const layoutAt = (head: string): LayoutV1 => ({ ...miniLayout, source: { ...miniLayout.source, head } });
const fogAt = (head: string, baseline: string | null = null): FogView => ({ ...miniFog, head, baseline });

/** The page's elements by id, as the drone controller finds them. */
const els = new Map<string, { textContent: string; hidden: boolean }>();

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {} })); // reduced motion: the loop sleeps
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('innerWidth', 640);
  vi.stubGlobal('innerHeight', 360);
  vi.stubGlobal('addEventListener', () => {});
  els.clear();
  vi.stubGlobal('document', { getElementById: (id: string) => { if (!els.has(id)) els.set(id, { textContent: '', hidden: true }); return els.get(id); } }); // the drone HUD line and panel host
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
  const fogs: (() => Promise<FogView>)[] = [async () => { if (first.fog instanceof Error) throw first.fog; return first.fog; }];
  let fogCalls = 0;
  let onEvent: (ev: LiveEvent) => void = () => {};
  const client: DataClient = {
    layout: () => layouts.shift()!().then((l) => { head = l.source.head; return l; }),
    fog: () => { fogCalls++; return fogs.shift()!(); },
    follow: (e) => { onEvent = e; return () => {}; },
    drones: () => { droneCalls++; return (droneAnswers.shift() ?? (async () => droneView(head, [])))(); },
    unseen: async (home, at) => ({ ok: true, at, home, files: [] }),
    diff: async () => ({ ok: false, error: 'no-such-file' }),
    chart: async () => ({ ok: false, error: 'not used' }),
  };
  let model: SystemModel | null = null;
  const view = {
    pass: { canvas: Object.assign(new EventTarget(), { focus: () => {} }) },
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
    pickDroneAt: () => null,
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
  return { view, status, layouts, fogs, droneAnswers, droneCalls: () => droneCalls, emit, send: (ev: LiveEvent) => onEvent(ev), fogCalls: () => fogCalls, last: () => status.at(-1) ?? '' };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

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
});
