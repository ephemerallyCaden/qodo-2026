// Focus on orbiting planets in live mode (#60): planets orbit slowly, a focused planet stays centred
// as it orbits (the camera follows it, keeping the user's angle and zoom), Escape returns to free
// flight where the camera is, Home turns with the orbits, and under reduced motion the orbits hold
// still (frame 0 from the start, or the frame where it was switched on) and focus cuts. Driven through runLive and the real free-flight rig, with a fake view that
// records what each frame draws and a requestAnimationFrame the test steps by hand.
import { DebrisState } from '../../../web/src/debris/state.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataClient } from '../../../web/src/data/client.js';
import { focusPose, project, startPose, startPoseAt, type OrbitPose } from '../../../web/src/camera/pose.js';
import { GLIDE_MS } from '../../../web/src/camera/rig.js';
import { runLive } from '../../../web/src/live.js';
import { LOOP_FRAMES } from '../../../web/src/model/motion.js';
import { planetCentre, systemModel, type SystemModel } from '../../../web/src/model/system.js';
import type { Hud } from '../../../web/src/ui/hud.js';
import type { View } from '../../../web/src/view.js';
import { miniFog, miniLayout } from '../../fixtures/contract/mini.js';
import { droneView } from '../../fixtures/drones.js';

// The review panel (#75) and the drone panel need a DOM: no-ops here, as in live.test.ts.
vi.mock('../../../web/src/ui/panel.js', () => ({ Panel: class { setFog() {} select() {} scale() {} } }));
vi.mock('../../../web/src/drones/panel.js', () => ({ DronePanel: class { onClose = () => {}; show() {} hide() {} } }));
// The crew panel (#207) has its own DOM test (crew-panel.test.ts).
vi.mock('../../../web/src/crew/panel.js', () => ({ CrewPanel: class { onClose = () => {}; open = false; show() {} hide() {} showDetail() {} } }));
// The debris panel (R13) needs a DOM: a no-op here.
vi.mock('../../../web/src/debris/panel.js', () => ({ DebrisPanel: class { onClose = () => {}; onCopy = () => {}; open = false; show() {} hide() {} showDetail() {} } }));
// The directory view (#209) has its own DOM test (tree.test.ts).
vi.mock('../../../web/src/tree/panel.js', () => ({ TreePanel: class { scale() {} setLayout() {} setFog() {} } }));

/** Frames requested with requestAnimationFrame, run by tick(). */
let queued: FrameRequestCallback[] = [];
let now = 0;

function stubPage(reduced: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: () => {} }));
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('innerWidth', 640);
  vi.stubGlobal('innerHeight', 360);
  vi.stubGlobal('addEventListener', () => {});
  const els = new Map<string, { textContent: string; hidden: boolean; contains: () => boolean }>();
  vi.stubGlobal('document', { activeElement: null, getElementById: (id: string) => { if (!els.has(id)) els.set(id, { textContent: '', hidden: true, contains: () => false }); return els.get(id); } });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} }); // the open panels' size redraws the labels (#169)
}

beforeEach(() => { queued = []; now = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

interface Drawn { frame: number; pose: OrbitPose; focus: number | null }

/** runLive on mini against a fake view whose focus targets are the real planets at each frame. */
async function live(reduced = false) {
  stubPage(reduced);
  let model: SystemModel | null = null;
  const drawn: Drawn[] = [];
  const canvas = Object.assign(new EventTarget(), { focus() {}, setPointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) });
  const view = {
    pass: { canvas },
    labels: { px: 2 },
    fog: null,
    get model() { return model; },
    onFog: null as unknown,
    reducedMotion: reduced,
    fogChange: { cleared: 0, refogged: 0 },
    fogTicket: () => 1,
    applyFog: () => true,
    async load() { model = systemModel(miniLayout); },
    selectedDrone: null,
    setDrones: async () => true,
    selectedPerson: null,
    selectedName: '',
    setCrew: async () => true,
    pickCrewAt: () => null,
    crewSpec: null,
    crewSeat: () => null,
    homePose: (frame = 0) => (model ? startPoseAt(model, frame) : null), // no crew drawn: the layout's own start pose
    setBeacons: () => true,
    setCoChange: () => true,
    coChangeLines: () => [],
    arrowAt: () => null,
    focusFile: null,
    focusSince: 0,
    pickDroneAt: () => null, debris: new DebrisState(), setDebris: () => true, pickDebrisAt: () => null, debrisPiece: () => null,
    planetAt: null as number | null,
    pickAt: () => view.planetAt,
    resize: () => {},
    draw: (frame: number, pose: OrbitPose, focus: number | null) => { drawn.push({ frame, pose: structuredClone(pose), focus }); return {}; },
    focusTarget: (i: number, frame: number) => (model ? { centre: planetCentre(model.planets[i]!, frame), radius: model.planets[i]!.radius } : null),
  };
  const client: DataClient = {
    layout: async () => miniLayout,
    fog: async () => miniFog,
    follow: () => () => {},
    drones: async () => droneView(miniLayout.source.head, []),
    droneDetail: async () => ({ ok: false, error: 'no-such-session' }),
    crew: async () => { throw new Error('no crew here'); },
    crewDetail: async () => ({ ok: false, error: 'no-such-person' }), debris: async () => ({ schemaVersion: 'debris.1', head: miniLayout.source.head, pieces: [], total: 0, placed: 0, mass: 0, unreadable: 0, prs: 'not-read', needsRescan: false }), debrisDetail: async () => ({ ok: false, error: 'no-such-item' }),
    unseen: async (home, at) => ({ ok: true, at, home, files: [] }),
    diff: async () => ({ ok: false, error: 'no-such-file' }),
    chart: async () => ({ ok: false, error: 'not used' }),
    beacons: async () => ({ schemaVersion: 'beacons.1', head: miniLayout.source.head, beacons: [], unplaced: 0 }),
    beacon: async () => ({ ok: false, error: 'not used' }),
    cochange: async () => ({ schemaVersion: 'cochange.1', head: miniLayout.source.head, needsRescan: false, links: [], flags: [], dismissed: 0, files: [] }),
    files: async () => ({ head: miniLayout.source.head, dirs: [], files: [] }),
  };
  // runLive sets onReducedMotion: what the HUD's reduce-motion checkbox calls
  const hud = { announce: () => {}, summary: () => {}, scale: () => {}, clearError: () => {}, error: () => {}, setReducedMotion: () => {}, onReducedMotion: (() => {}) as (on: boolean) => void };
  await runLive(view as unknown as View, hud as unknown as Hud, client);
  const key = (k: string) => canvas.dispatchEvent(Object.assign(new Event('keydown'), { key: k, code: k, altKey: false, ctrlKey: false, metaKey: false, preventDefault: () => {} }));
  const click = (planet: number) => {
    view.planetAt = planet;
    const ev = (type: string) => Object.assign(new Event(type), { button: 0, pointerId: 1, clientX: 5, clientY: 5, movementX: 0, movementY: 0 });
    canvas.dispatchEvent(ev('pointerdown'));
    canvas.dispatchEvent(ev('pointerup'));
  };
  /** Runs the requested frames `n` times, `ms` apart (the loop clamps a tick to 100 ms: 3 frames). */
  const tick = (n = 1, ms = 100) => {
    for (let k = 0; k < n; k++) {
      const run = queued;
      queued = [];
      for (const cb of run) cb(now);
      now += ms;
    }
  };
  return { model: () => model!, drawn, key, click, tick, last: () => drawn.at(-1)!, reduceMotion: (on: boolean) => hud.onReducedMotion(on) };
}

const close = (a: readonly number[], b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
/** Where a planet is on screen in a drawn frame (NDC, 0,0 is the centre). */
const onScreen = (d: Drawn, m: SystemModel, i: number) => { const q = project(d.pose, planetCentre(m.planets[i]!, d.frame))!; return [q.x, q.y]; };

describe('focus follows an orbiting planet (#60)', () => {
  it('planets orbit while the camera holds still in free flight', async () => {
    const l = await live();
    l.tick(40); // 4 s: 117 frames
    const m = l.model();
    const first = l.drawn[0]!, last = l.last();
    expect(first.frame).toBe(0);
    expect(last.frame).toBeGreaterThan(100);
    expect(last.pose).toEqual(first.pose); // no input: the camera stays where it started
    expect(first.pose).toEqual(startPose(m));
    const moved = Math.hypot(...onScreen(last, m, 2).map((v, k) => v - onScreen(first, m, 2)[k]!));
    expect(moved).toBeGreaterThan(0.01); // docs has moved on screen
  });

  it('`]` glides onto the planet, then keeps it centred as it orbits, holding the angle and zoom', async () => {
    const l = await live();
    l.tick(10);
    l.key(']');
    l.tick(Math.ceil(GLIDE_MS / 100) + 1); // the glide lands on the moving planet
    const landed = l.drawn.length;
    l.tick(LOOP_FRAMES / 3); // one 48 s loop on (100 ms ticks): the planet has turned 1/15 of its orbit
    const m = l.model();
    const after = l.drawn.slice(landed);
    expect(after.at(-1)!.frame - after[0]!.frame).toBeGreaterThanOrEqual(LOOP_FRAMES - 3);
    for (const d of after) {
      expect(d.focus).toBe(0);
      close(d.pose.target, planetCentre(m.planets[0]!, d.frame)); // the target is the planet's centre at that very frame
      close(onScreen(d, m, 0), [0, 0]);
      expect([d.pose.yaw, d.pose.pitch, d.pose.dist]).toEqual([after[0]!.pose.yaw, after[0]!.pose.pitch, after[0]!.pose.dist]);
    }
    const travelled = Math.hypot(...after.at(-1)!.pose.target.map((v, k) => v - after[0]!.pose.target[k]!));
    expect(travelled).toBeGreaterThan(0.3); // not vacuous: the camera went along the orbit
  });

  it('a click focuses the planet under it and follows it the same way', async () => {
    const l = await live();
    l.tick(10);
    l.click(2);
    l.tick(30);
    const m = l.model(), d = l.last();
    expect(d.focus).toBe(2);
    close(d.pose.target, planetCentre(m.planets[2]!, d.frame));
  });

  it('Escape returns to free flight where the camera is: it stops following, and the planet orbits on out of the centre', async () => {
    const l = await live();
    l.tick(10);
    l.key(']');
    l.tick(20);
    l.key('Escape');
    l.tick(1);
    const freed = l.drawn.length - 1;
    expect(l.last().focus).toBeNull();
    l.tick(200); // 20 s
    const m = l.model(), after = l.drawn.slice(freed);
    for (const d of after) expect(d.pose).toEqual(after[0]!.pose);
    const off = Math.hypot(...onScreen(after.at(-1)!, m, 0));
    expect(off).toBeGreaterThan(0.05); // src has left the centre
  });

  it('Home frames the system as it first appeared, wherever the orbits have taken it', async () => {
    const l = await live();
    l.tick(300); // 30 s: 18° round
    const at = l.last().frame;
    l.key('Home');
    l.tick(1);
    const m = l.model(), d = l.last();
    expect(d.pose).toEqual(startPoseAt(m, at));
    const first = l.drawn[0]!;
    for (let i = 0; i < m.planets.length; i++) {
      const was = onScreen(first, m, i);
      onScreen({ ...d, frame: at }, m, i).forEach((v, k) => expect(v).toBeCloseTo(was[k]!, 9));
    }
  });
});

describe('reduced motion (#60 AC 3)', () => {
  it('holds the orbits on frame 0 and cuts to a focus, which then stays put', async () => {
    const l = await live(true);
    l.tick(5);
    const m = l.model();
    l.key(']');
    l.tick(1);
    const cut = l.last();
    expect(cut.frame).toBe(0);
    expect(cut.focus).toBe(0);
    expect(cut.pose).toEqual(focusPose(startPose(m), planetCentre(m.planets[0]!, 0), m.planets[0]!.radius)); // a cut: no glide in between
    l.key(']');
    l.tick(1);
    expect(l.last().pose.target).toEqual(planetCentre(m.planets[1]!, 0));
    l.tick(50);
    expect(l.drawn.every((d) => d.frame === 0)).toBe(true);
    expect(l.last().pose.target).toEqual(planetCentre(m.planets[1]!, 0));
  });

  it('switched on mid-session, freezes on the frame it was showing, so nothing jumps, and switched off resumes from there (Qodo d094226d)', async () => {
    const l = await live();
    l.tick(1500); // 150 s: the orbits have turned about 90°
    const m = l.model(), before = l.last();
    expect(before.frame).toBeGreaterThan(4000);
    l.reduceMotion(true);
    l.tick(20); // 2 s with reduced motion on
    const held = l.drawn.slice(l.drawn.indexOf(before) + 1);
    expect(held.length).toBeGreaterThan(0);
    for (const d of held) {
      expect(d.frame).toBe(before.frame); // not frame 0: the planets stay where they were
      expect(d.pose).toEqual(before.pose);
      for (let i = 0; i < m.planets.length; i++) expect(onScreen(d, m, i)).toEqual(onScreen(before, m, i));
    }
    l.key(']');
    l.tick(1);
    const cut = l.last();
    expect(cut.frame).toBe(before.frame);
    expect(cut.pose).toEqual(focusPose(before.pose, planetCentre(m.planets[0]!, before.frame), m.planets[0]!.radius)); // a cut, at the held frame
    l.reduceMotion(false);
    l.tick(10);
    const resumed = l.drawn.slice(l.drawn.indexOf(cut) + 1);
    expect(resumed[0]!.frame - before.frame).toBeLessThanOrEqual(3); // carries on from the held frame (one tick is at most 3 frames)
    expect(resumed.at(-1)!.frame).toBeGreaterThan(before.frame); // and moves again
    close(resumed.at(-1)!.pose.target, planetCentre(m.planets[0]!, resumed.at(-1)!.frame)); // still following src
  });
});
