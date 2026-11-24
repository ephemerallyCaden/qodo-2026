// The directory view's DOM (#209 AC 1–5) against a small fake document: the toggle opens a tree of the
// snapshot's folders and files, each file says fogged or clear and each folder its charted share, the
// arrow keys, Enter and Escape work as a WAI-ARIA tree with screen-reader labels, and opening a row hands
// it to the map: through runLive and the real free-flight rig, a file's planet is focused turned to its
// settlement, a folder's to its continent, and a root file goes home to the star, cutting under reduced
// motion and gliding otherwise. Vitest has no DOM, so the fake records what is built and fires events,
// bubbling to the ancestors as a page does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import { basis, startPoseAt, type OrbitPose } from '../../../web/src/camera/pose.js';
import { GLIDE_MS } from '../../../web/src/camera/rig.js';
import type { DataClient } from '../../../web/src/data/client.js';
import { runLive } from '../../../web/src/live.js';
import { FPS } from '../../../web/src/model/motion.js';
import { planetCentre, surfaceDirection, systemModel, type SystemModel } from '../../../web/src/model/system.js';
import type { Place, TreeSource } from '../../../web/src/tree/model.js';
import { TreePanel } from '../../../web/src/tree/panel.js';
import type { Hud } from '../../../web/src/ui/hud.js';
import type { View } from '../../../web/src/view.js';
import { miniFog, miniLayout } from '../../fixtures/contract/mini.js';
import { droneView } from '../../fixtures/drones.js';
import { miniTree } from '../../fixtures/tree.js';

// The review and drone panels have their own tests; here they only need to exist.
const selected = vi.hoisted(() => [] as (string | null)[]);
vi.mock('../../../web/src/ui/panel.js', () => ({ Panel: class { setFog() {} select(id: string | null) { selected.push(id); } scale() {} } }));
vi.mock('../../../web/src/drones/panel.js', () => ({ DronePanel: class { onClose = () => {}; show() {} hide() {} } }));

interface FakeEvent { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; defaultPrevented: boolean; stopped: boolean; preventDefault(): void; stopPropagation(): void }
const event = (props: Partial<FakeEvent> = {}): FakeEvent => ({ key: '', altKey: false, ctrlKey: false, metaKey: false, defaultPrevented: false, stopped: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props });

/** Just enough of an element: children with a parent link, text, class, attributes, a style, listeners, focus. */
class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  textContent = '';
  className = '';
  hidden = false;
  type = '';
  tabIndex = -1;
  width = 0;
  height = 0;
  readonly style: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  private readonly on = new Map<string, ((e: FakeEvent) => void)[]>();
  constructor(readonly tag: string) {}
  private adopt(c: FakeEl[]) { for (const x of c) x.parent = this; return c; }
  append(...c: FakeEl[]) { this.children.push(...this.adopt(c)); }
  replaceChildren(...c: FakeEl[]) { this.children = [...this.adopt(c)]; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener(type: string, fn: (e: FakeEvent) => void) { this.on.set(type, [...(this.on.get(type) ?? []), fn]); }
  /** Fires an event here, then on each ancestor until one stops it. */
  fire(type: string, props: Partial<FakeEvent> = {}): FakeEvent {
    const e = event(props);
    for (const n of [this, ...this.ancestors()]) {
      if (e.stopped) break;
      for (const fn of n.on.get(type) ?? []) fn(e);
    }
    return e;
  }
  /** Takes the page's focus; `focus` doesn't bubble. */
  focus() { page.activeElement = this; for (const fn of this.on.get('focus') ?? []) fn(event()); }
  ancestors(): FakeEl[] { return this.parent ? [this.parent, ...this.parent.ancestors()] : []; }
  contains(n: unknown): boolean { return n === this || this.children.some((c) => c.contains(n)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  getContext() { return null; }
  all(): FakeEl[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return [this.textContent, ...this.children.map((c) => c.text())].filter(Boolean).join(' '); }
}

let page: { activeElement: FakeEl | null; els: Map<string, FakeEl> };
const byId = (id: string) => page.els.get(id)!;
beforeEach(() => {
  page = { activeElement: null, els: new Map() };
  const tree = new FakeEl('aside');
  tree.hidden = true; // as index.html has it
  page.els.set('tree', tree);
  page.els.set('tree-toggle', new FakeEl('button'));
  selected.length = 0;
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('document', {
    get activeElement() { return page.activeElement; },
    getElementById: (id: string) => { if (!page.els.has(id)) page.els.set(id, new FakeEl('div')); return page.els.get(id); },
    createElement: (tag: string) => new FakeEl(tag),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const flush = () => new Promise((r) => setTimeout(r, 0));
const OTHER = 'b'.repeat(40);
const layoutAt = (head: string): LayoutV1 => ({ ...miniLayout, source: { ...miniLayout.source, head } });
const treeEl = () => byId('tree');
const toggle = () => byId('tree-toggle');
const rows = () => treeEl().all().filter((e) => e.attrs['role'] === 'treeitem');
const nameOf = (r: FakeEl) => r.children.find((c) => c.className === 'name')!.textContent;
const tagOf = (r: FakeEl) => r.children.find((c) => c.className === 'tag')!.textContent;
const names = () => rows().map(nameOf);
const row = (name: string) => { const r = rows().find((x) => nameOf(x) === name); if (!r) throw new Error(`no row ${name} in ${names().join(', ')}`); return r; };
const note = () => treeEl().all().find((e) => e.tag === 'p' && e.className === 'note')!.textContent;
/** A key pressed where the page's focus is; it bubbles up from there. */
const press = (key: string) => page.activeElement!.fire('keydown', { key });

/** A TreePanel with a recording host, given the mini layout and fog. */
function panel(files: () => Promise<TreeSource> = async () => miniTree) {
  const opened: { place: Place; said: string }[] = [];
  const said: string[] = [];
  let released = 0, fetched = 0;
  const p = new TreePanel({ client: { files: () => { fetched++; return files(); } }, open: (place, s) => opened.push({ place, said: s }),
    announce: (t) => said.push(t), release: () => { released++; } });
  p.setLayout(miniLayout);
  p.setFog(miniFog);
  return { p, opened, said, released: () => released, fetched: () => fetched };
}

describe('the directory view\'s toggle and tree (#209 AC 1)', () => {
  it('the toggle opens a tree of the snapshot\'s folders and files beside the map, fetched only once it opens', async () => {
    const t = panel();
    expect(treeEl().hidden).toBe(true);
    expect(toggle().attrs).toMatchObject({ 'aria-controls': 'tree', 'aria-expanded': 'false' });
    expect(toggle().text()).toBe('directory view'); // its accessible name; the visible text is the bitmap font
    expect(t.fetched()).toBe(0);
    toggle().fire('click');
    await flush();
    expect(treeEl().hidden).toBe(false);
    expect(toggle().attrs['aria-expanded']).toBe('true');
    expect(t.fetched()).toBe(1);
    expect(names()).toEqual(['docs/', 'src/', 'test/', 'web/', 'README.md', 'package.json']);
    const list = treeEl().all().find((e) => e.attrs['role'] === 'tree')!;
    expect(list.attrs['aria-label']).toBe('folders and files, with their fog');
    expect(rows().map((r) => [r.attrs['aria-level'], r.attrs['aria-setsize'], r.attrs['aria-posinset']])).toEqual(
      [1, 2, 3, 4, 5, 6].map((k) => ['1', '6', String(k)]));
    expect(rows().slice(0, 4).every((r) => r.attrs['aria-expanded'] === 'false')).toBe(true);
    expect(rows()[4]!.attrs['aria-expanded']).toBeUndefined(); // a file isn't expandable
    expect(page.activeElement).toBe(rows()[0]); // the keyboard lands in the tree
    toggle().fire('click');
    expect(treeEl().hidden).toBe(true);
    toggle().fire('click');
    await flush();
    expect(t.fetched()).toBe(1); // the same scan: not fetched again
  });

  it('a file list of another scan is not shown, and the next layout fetches the one that matches (#64)', async () => {
    let head = OTHER;
    const t = panel(async () => ({ ...miniTree, head }));
    toggle().fire('click');
    await flush();
    expect(rows()).toEqual([]);
    expect(note()).toMatch(/^file list not shown: it is of bbbbbbb but the map of 1111111 \(different scans\)/);
    expect(t.said.at(-1)).toBe(note());
    head = miniTree.head;
    t.p.setLayout(miniLayout);
    await flush();
    expect(names()).toHaveLength(6);
    head = OTHER;
    t.p.setLayout(layoutAt(OTHER)); // a new scan: its own list, fetched again
    expect(rows()).toEqual([]);
    expect(note()).toBe('loading the file list…');
    await flush();
    expect(names()).toHaveLength(6);
    expect(t.fetched()).toBe(3);
  });

  it('a failed fetch is said in the tree and the status line, not fatal', async () => {
    const t = panel(async () => { throw new Error('down'); });
    toggle().fire('click');
    await flush();
    expect(note()).toBe('file list unavailable: something went wrong');
    expect(t.said).toEqual([note()]);
  });

  it('text goes in only as text: a path that looks like markup is a name', async () => {
    panel(async () => ({ ...miniTree, files: [{ id: 'f_0000000000ee', path: '<img src=x onerror=alert(1)>.ts' }] }));
    toggle().fire('click');
    await flush();
    expect(names()).toEqual(['<img src=x onerror=alert(1)>.ts']);
  });
});

describe('fog per file and charted share per folder (#209 AC 2)', () => {
  it('each file shows fogged or clear and each folder its charted %, in the row and its screen-reader label', async () => {
    panel();
    toggle().fire('click');
    await flush();
    expect(rows().slice(0, 4).map(tagOf)).toEqual(['100%', '100%', '96%', '0%']);
    row('web/').fire('click');
    expect(tagOf(row('main.ts'))).toBe('fogged');
    expect(row('main.ts').className).toBe('row file fogged');
    expect(row('main.ts').attrs['aria-label']).toBe('main.ts, file, fogged');
    expect(row('test/').attrs['aria-label']).toBe('test, folder, 96% charted, 27 of 28 files clear');
    row('src/').fire('click');
    expect(tagOf(row('a.ts'))).toBe('clear'); // charted reads as clear
    expect(row('a.ts').className).toBe('row file clear');
    expect(note()).toBe(`uncharted: 2 of ${miniTree.files.length} files`);
  });

  it('follows every fog the view takes; with none usable, or one of another scan, every file is fogged (Rule 1)', async () => {
    const t = panel();
    toggle().fire('click');
    await flush();
    row('src/').fire('click');
    const charted: FogView = { ...miniFog, files: miniFog.files.map((f) => (f.fileId === 'f_00000000000d' ? { ...f, state: 'charted', reasons: [], since: null } : f)) };
    t.p.setFog(charted);
    expect(rows().slice(0, 1).concat(row('web/')).map(tagOf)).toEqual(['100%', '100%']);
    for (const fog of [null, { ...miniFog, head: OTHER }]) {
      t.p.setFog(fog);
      expect(['src/', 'web/', 'test/'].map((n) => tagOf(row(n)))).toEqual(['0%', '0%', '0%']);
      expect(tagOf(row('a.ts'))).toBe('fogged');
      expect(note()).toBe('uncharted: unknown, so every file is drawn uncharted');
    }
  });
});

describe('keyboard and screen readers (#209 AC 4)', () => {
  const opened = async () => { const t = panel(); toggle().fire('click'); await flush(); return t; };
  const active = () => rows().filter((r) => r.tabIndex === 0);

  it('arrows move one row with a roving tabindex, Home and End jump, and selection follows', async () => {
    await opened();
    expect(active()).toEqual([rows()[0]]);
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(page.activeElement).toBe(row('src/'));
    expect(active()).toEqual([row('src/')]);
    expect(rows().filter((r) => r.attrs['aria-selected'] === 'true')).toEqual([row('src/')]);
    press('End');
    expect(page.activeElement).toBe(row('package.json'));
    press('ArrowDown'); // stays on the last row
    expect(page.activeElement).toBe(row('package.json'));
    press('Home');
    expect(page.activeElement).toBe(row('docs/'));
    press('ArrowUp');
    expect(page.activeElement).toBe(row('docs/'));
    expect(press('a').defaultPrevented).toBe(false); // other keys are left alone
  });

  it('Right opens a folder, then enters it; Left goes back to the folder, then closes it', async () => {
    await opened();
    press('ArrowDown'); // src/
    press('ArrowRight');
    expect(row('src/').attrs['aria-expanded']).toBe('true');
    expect(names()).toEqual(['docs/', 'src/', 'core/', 'a.ts', 'b.ts', 'test/', 'web/', 'README.md', 'package.json']);
    expect(page.activeElement).toBe(row('src/')); // the rebuilt row keeps the keyboard
    expect(row('core/').attrs).toMatchObject({ 'aria-level': '2', 'aria-setsize': '3', 'aria-posinset': '1' });
    expect(row('core/').style['paddingLeft']).toBe('2ch');
    press('ArrowRight');
    expect(page.activeElement).toBe(row('core/'));
    press('ArrowDown');
    press('ArrowLeft'); // a.ts → its folder
    expect(page.activeElement).toBe(row('src/'));
    press('ArrowLeft'); // closes it
    expect(row('src/').attrs['aria-expanded']).toBe('false');
    expect(names()).toHaveLength(6);
    expect(page.activeElement).toBe(row('src/'));
  });

  it('Enter opens the row on the map, and Escape closes the tree and hands the keyboard back to the map', async () => {
    const t = await opened();
    press('End');
    press('Enter');
    expect(t.opened).toEqual([{ place: { kind: 'moonlet' }, said: 'focused package.json (clear): a moonlet of the star' }]);
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(treeEl().hidden).toBe(true);
    expect(toggle().attrs['aria-expanded']).toBe('false');
    expect(t.released()).toBe(1);
  });

  it('the close button closes it the same way', async () => {
    const t = await opened();
    treeEl().all().find((e) => e.tag === 'button' && e.textContent === 'close')!.fire('click');
    expect(treeEl().hidden).toBe(true);
    expect(t.released()).toBe(1);
  });
});

describe('opening a row hands it to the map (#209 AC 3)', () => {
  const active = (r: FakeEl) => r.tabIndex === 0 && r.attrs['aria-selected'] === 'true';

  it('clicking a file opens its planet and settlement; clicking a folder opens its planet or continent and shows its files', async () => {
    const t = panel();
    toggle().fire('click');
    await flush();
    row('src/').fire('click');
    expect(t.opened.at(-1)).toEqual({ place: { kind: 'planet', planet: 'd_00000000000a' }, said: 'focused src/ (100% charted, 3 of 3 files clear): the planet src' });
    expect(row('src/').attrs['aria-expanded']).toBe('true');
    row('core/').fire('click');
    expect(t.opened.at(-1)!.place).toEqual({ kind: 'continent', planet: 'd_00000000000a', cell: 21 });
    row('c.ts').fire('click');
    expect(t.opened.at(-1)).toEqual({ place: { kind: 'settlement', planet: 'd_00000000000a', cell: 21 }, said: 'focused src/core/c.ts (clear): a settlement on the planet src' });
    expect(active(row('c.ts'))).toBe(true);
    row('test/').fire('click');
    expect(t.opened.at(-1)!.place).toEqual({ kind: 'star' });
  });

  it('a folder\'s arrow only opens and closes it', async () => {
    const t = panel();
    toggle().fire('click');
    await flush();
    const twisty = row('docs/').children.find((c) => c.className === 'twisty')!;
    expect(twisty.attrs['aria-hidden']).toBe('true');
    twisty.fire('click');
    expect(names()).toContain('z.md');
    row('docs/').children.find((c) => c.className === 'twisty')!.fire('click');
    expect(names()).not.toContain('z.md');
    expect(t.opened).toEqual([]);
  });
});

// ---- the hand-off through live mode: runLive, the real rig, and a fake view that records each frame ----

let queued: FrameRequestCallback[] = [];
let now = 0;
interface Drawn { frame: number; pose: OrbitPose; focus: number | null }

async function live(reduced: boolean) {
  queued = [];
  now = 0;
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: () => {} }));
  vi.stubGlobal('innerWidth', 640);
  vi.stubGlobal('innerHeight', 360);
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} });
  let model: SystemModel | null = null;
  const drawn: Drawn[] = [];
  const status: string[] = [];
  const canvas = Object.assign(new EventTarget(), { focus() { page.activeElement = null; }, setPointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) });
  const view = {
    pass: { canvas }, labels: { px: 2 }, fog: null as FogView | null, get model() { return model; }, onFog: null as ((f: FogView | null) => void) | null,
    reducedMotion: reduced, fogChange: { cleared: 0, refogged: 0 }, fogTicket: () => 1,
    applyFog(f: FogView | null) { view.fog = f; view.onFog?.(f); return true; },
    async load(layout: LayoutV1, fog: FogView | null) { model = systemModel(layout); view.applyFog(fog); },
    selectedDrone: null, setDrones: async () => true, setBeacons: () => true, pickDroneAt: () => null, pickAt: () => null, resize: () => {},
    setCoChange: () => true, coChangeLines: () => [], arrowAt: () => null, focusFile: null, focusSince: 0, // #211, as orbits.test.ts
    draw: (frame: number, pose: OrbitPose, focus: number | null) => { drawn.push({ frame, pose: structuredClone(pose), focus }); return {}; },
    focusTarget: (i: number, frame: number) => (model ? { centre: planetCentre(model.planets[i]!, frame), radius: model.planets[i]!.radius } : null),
  };
  const client: DataClient = {
    layout: async () => miniLayout, fog: async () => miniFog, follow: () => () => {}, drones: async () => droneView(miniLayout.source.head, []),
    droneDetail: async () => ({ ok: false, error: 'no-such-session' }), unseen: async (home, at) => ({ ok: true, at, home, files: [] }),
    diff: async () => ({ ok: false, error: 'no-such-file' }), chart: async () => ({ ok: false, error: 'not used' }),
    beacons: async () => ({ schemaVersion: 'beacons.1', head: miniLayout.source.head, beacons: [], unplaced: 0 }),
    beacon: async () => ({ ok: false, error: 'not used' }), files: async () => miniTree,
    cochange: async () => ({ schemaVersion: 'cochange.1', head: miniLayout.source.head, needsRescan: false, links: [], flags: [], dismissed: 0, files: [] }),
  };
  const hud = { announce: (t: string) => status.push(t), summary: () => {}, scale: () => {}, clearError: () => {}, error: () => {}, setReducedMotion: () => {} };
  await runLive(view as unknown as View, hud as unknown as Hud, client);
  /** Runs the requested frames `n` times, `ms` apart. */
  const tick = (n = 1, ms = 1000 / FPS) => {
    for (let k = 0; k < n; k++) {
      const run = queued;
      queued = [];
      for (const cb of run) cb(now);
      now += ms;
    }
  };
  tick(3);
  toggle().fire('click');
  await flush();
  return { model: () => model!, drawn, status, tick, last: () => drawn.at(-1)! };
}

/** The angle between two directions, radians. */
const angle = (a: readonly number[], b: readonly number[]) => {
  const dot = a.reduce((s, v, k) => s + v * b[k]!, 0), la = Math.hypot(...a), lb = Math.hypot(...b);
  return Math.acos(Math.min(1, Math.max(-1, dot / (la * lb))));
};
/** The direction from the focused target to the eye in a drawn frame. */
const eyeSide = (d: Drawn) => basis(d.pose.yaw, d.pose.pitch).back;

describe('the focus hand-off to the map (#209 AC 3, AC 4 reduced motion)', () => {
  it('under reduced motion, clicking a file cuts to its planet turned to its settlement, and says so', async () => {
    const l = await live(true);
    row('src/').fire('click');
    row('b.ts').fire('click'); // cell 13
    l.tick();
    const d = l.last(), p = l.model().planets[0]!;
    expect(d.focus).toBe(0);
    expect(selected.at(-1)).toBe('d_00000000000a'); // the review panel follows the focus
    d.pose.target.forEach((v, k) => expect(v).toBeCloseTo(planetCentre(p, d.frame)[k]!, 9));
    expect(angle(eyeSide(d), surfaceDirection(p, 13, d.frame))).toBeLessThan(1e-6); // the frame is frozen: the settlement faces the camera
    expect(l.status.at(-1)).toBe('focused src/b.ts (clear): a settlement on the planet src');
    l.tick(30);
    expect(l.last().pose).toEqual(d.pose); // nothing moves afterwards
  });

  it('clicking a folder focuses its planet, or turns it to its continent', async () => {
    const l = await live(true);
    row('web/').fire('click');
    l.tick();
    expect(l.last().focus).toBe(1);
    expect(l.status.at(-1)).toBe('focused web/ (0% charted, 0 of 1 file clear): the planet web');
    row('src/').fire('click');
    row('core/').fire('click');
    l.tick();
    const d = l.last();
    expect(d.focus).toBe(0);
    expect(angle(eyeSide(d), surfaceDirection(l.model().planets[0]!, 21, d.frame))).toBeLessThan(1e-6);
  });

  it('a root file, and a folder with no planet of its own, go home to the star in free flight', async () => {
    const l = await live(true);
    row('src/').fire('click');
    l.tick();
    expect(l.last().focus).toBe(0);
    row('README.md').fire('click');
    l.tick();
    expect(l.last().focus).toBeNull();
    expect(selected.at(-1)).toBeNull(); // the review panel lists the star's files
    expect(l.last().pose).toEqual(startPoseAt(l.model(), l.last().frame));
    expect(l.status.at(-1)).toBe('focused README.md (clear): a moonlet of the star');
    row('test/').fire('click');
    l.tick();
    expect(l.last().focus).toBeNull();
    expect(l.status.at(-1)).toMatch(/: no planet of its own, so showing the star$/);
  });

  it('with motion, the camera glides and lands turned to where the settlement is when the glide ends', async () => {
    const l = await live(false);
    row('src/').fire('click');
    l.tick(Math.ceil((GLIDE_MS * FPS) / 1000) + 3);
    row('core/').fire('click');
    row('c.ts').fire('click'); // cell 21
    const from = l.drawn.length;
    l.tick();
    const p = l.model().planets[0]!;
    const first = l.drawn[from]!;
    expect(angle(eyeSide(first), surfaceDirection(p, 21, first.frame))).toBeGreaterThan(0.01); // still gliding
    l.tick(Math.ceil((GLIDE_MS * FPS) / 1000) + 2);
    const d = l.last();
    expect(d.focus).toBe(0);
    d.pose.target.forEach((v, k) => expect(v).toBeCloseTo(planetCentre(p, d.frame)[k]!, 9));
    // turned to the settlement at the glide's end, and the surface keeps turning at its constant rate after it (Rule 4)
    const landed = l.drawn.slice(from).find((x, i, a) => i > 0 && x.pose.yaw === a[i - 1]!.pose.yaw && x.pose.pitch === a[i - 1]!.pose.pitch)!;
    expect(angle(eyeSide(landed), surfaceDirection(p, 21, landed.frame))).toBeLessThan(0.03); // within about two frames of spin
  });
});
