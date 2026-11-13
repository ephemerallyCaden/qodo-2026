// Fog of war's state (#74, R5): territories, the fogged bit, events, the pulse, the cell rows the
// shader reads and the view's fog tickets. Pure (web/src/model/{territory,fog}.ts); the drawing is
// test/render's.
import { describe, expect, it } from 'vitest';
import type { FileFog, FogView } from '../../src/core/contract/fog.js';
import { fibonacciCell } from '../../src/core/contract/layout.js';
import {
  cellRows, FLAG, FOG_EVENT_FRAMES, FOG_TEX_ROWS, FogLedger, eventLife, fileFogAt, fogChanges, foggedBy, mergeEvents,
  planetPulse, planetTally, surfacePlan, systemTally, type FogEvent,
} from '../../web/src/model/fog.js';
import { coverRadius, searchWindow, territories } from '../../web/src/model/territory.js';
import { miniFog, miniLayout } from '../fixtures/contract/mini.js';

const HEAD = miniLayout.source.head;
/** The mini fog with some files' states replaced. */
const withStates = (states: Record<string, FileFog['state']>, base: FogView = miniFog): FogView =>
  ({ ...base, files: base.files.map((f) => (f.fileId in states ? { ...f, state: states[f.fileId]!, reasons: states[f.fileId] === 'fogged' ? ['agent' as const] : [] } : f)) });

/** n distinct cells, spread over the grid the way #18's continents cluster them (deterministic). */
const someCells = (n: number, count: number) => Array.from({ length: count }, (_, k) => (k * 37 + Math.floor(k / 5) * 3) % n).filter((c, i, a) => a.indexOf(c) === i);

describe('territories (F1, F2: a parcel per file, sharing every cell)', () => {
  for (const [n, count] of [[256, 48], [256, 1], [256, 64], [64, 3], [64, 1], [2, 2], [2, 1], [1, 1], [7, 3]] as const) {
    it(`shares all ${n} cells among ${count} file(s): each keeps its own cell, gets its share, and anchors inside its parcel`, () => {
      const cells = someCells(n, count);
      const t = territories(cells, n);
      expect([...t.owner].every((o) => o >= 0 && o < cells.length)).toBe(true);
      cells.forEach((c, k) => expect(t.owner[c]).toBe(k));
      expect([...t.size].reduce((a, b) => a + b, 0)).toBe(n);
      for (let k = 0; k < cells.length; k++) {
        expect(t.owner[t.anchor[k]!]).toBe(k);
        expect(t.size[k]).toBe([...t.owner].filter((o) => o === k).length);
      }
      // a front from the anchor that has travelled `reach` has crossed every cell of the parcel
      const c = (i: number) => fibonacciCell(i, n);
      for (let i = 0; i < n; i++) {
        const k = t.owner[i]!, a = c(t.anchor[k]!), p = c(i);
        expect(Math.acos(Math.min(1, a[0] * p[0] + a[1] * p[1] + a[2] * p[2]))).toBeLessThanOrEqual(t.reach[k]!);
      }
    });
  }

  it('gives near-equal shares when nothing is boxed in (48 files on 256 cells: 5 or 6, at most a few cells off)', () => {
    const t = territories(someCells(256, 48), 256);
    const sizes = [...t.size];
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1);
    expect(sizes.filter((s) => s >= 4 && s <= 8).length).toBeGreaterThan(40);
  });

  it('is deterministic, and depends only on the cells (not on file names)', () => {
    const cells = someCells(256, 30);
    expect(territories(cells, 256)).toEqual(territories([...cells], 256));
  });

  it('a whole-planet parcel is anchored on its file\'s own cell (the centroid is the sphere\'s centre)', () => {
    expect(territories([17], 64).anchor[0]).toBe(17);
  });

  it('gives a file off the grid, or on a taken cell, no cells: it is drawn nowhere and counted in the fog view instead', () => {
    const t = territories([3, 3, 99], 64);
    expect(t.size[0]).toBe(64);
    expect([t.size[1], t.size[2]]).toEqual([0, 0]);
    expect(t.anchor[1]).toBe(-1);
  });

  it('searches a window that holds the two nearest cells of any point (the shader\'s fogNearest)', () => {
    for (const n of [2, 3, 7, 64, 256]) {
      const w = searchWindow(n), cs = Array.from({ length: n }, (_, i) => fibonacciCell(i, n));
      for (let k = 0; k < 2000; k++) {
        const y = 1 - (2 * (k + 0.5)) / 2000, r = Math.sqrt(1 - y * y), a = k * 2.399963229728653;
        const p = [Math.cos(a) * r, y, Math.sin(a) * r];
        const order = cs.map((c, i) => [c[0] * p[0]! + c[1] * p[1]! + c[2] * p[2]!, i] as const).sort((x, z) => z[0] - x[0] || x[1] - z[1]);
        const i0 = n <= 1 ? 0 : Math.floor((1 - p[1]!) * 0.5 * (n - 1) + 0.5);
        for (const [, i] of order.slice(0, Math.min(2, n))) expect(Math.abs(i - i0), `n=${n} point ${k}`).toBeLessThanOrEqual(w);
      }
    }
    expect(coverRadius(256)).toBeCloseTo(0.168, 3);
  });
});

describe('the fogged bit (clear and charted look the same; without evidence a file is fogged, Rule 1)', () => {
  const plan = surfacePlan({ cells: 64, settlements: miniLayout.planets[0]!.surface.settlements });

  it('is false for clear and charted, true for fogged, and true for a file the view does not list', () => {
    const f = foggedBy(withStates({ f_00000000000a: 'charted', f_00000000000b: 'clear', f_00000000000c: 'fogged' }));
    expect([f('f_00000000000a'), f('f_00000000000b'), f('f_00000000000c'), f('f_ffffffffffff')]).toEqual([false, false, true, true]);
  });

  it('is true for every file with no usable fog view', () => {
    expect(foggedBy(null)('f_00000000000a')).toBe(true);
  });

  it('gives byte-identical cell rows when every clear file is charted instead (the shader cannot tell them apart)', () => {
    const rows = (fog: FogView) => { const f = foggedBy(fog); return cellRows(plan, plan.fileIds.map((id) => fileFogAt(f(id), undefined, 0))); };
    const allCharted = { ...miniFog, files: miniFog.files.map((x) => (x.state === 'clear' ? { ...x, state: 'charted' as const } : x)) };
    expect(Buffer.from(rows(allCharted).buffer)).toEqual(Buffer.from(rows(miniFog).buffer));
    // not vacuous: a fogged file does change them
    expect(Buffer.from(rows(withStates({ f_00000000000a: 'fogged' })).buffer)).not.toEqual(Buffer.from(rows(miniFog).buffer));
  });
});

describe('a planet whose settlements are all off its grid (Rule 1, Qodo PR #117 r5)', () => {
  const plan = surfacePlan({ cells: 64, settlements: [{ fileId: 'f_00000000000a', cell: 99999 }, { fileId: 'f_00000000000b', cell: -3 }] as never });
  it('owns no cell, so its cells are drawn fogged whenever a file is (and under no fog view, every file is)', () => {
    expect([...plan.territory.owner].every((k) => k === -1)).toBe(true);
    const fogged = cellRows(plan, plan.fileIds.map((id) => fileFogAt(foggedBy(null)(id), undefined, 0)));
    for (let i = 0; i < 64; i++) expect(fogged[i * 4], `cell ${i}`).toBe(1);
    // not vacuous: with every file known clear, the unowned cells are clear
    const clear = cellRows(plan, plan.fileIds.map(() => fileFogAt(false, undefined, 0)));
    for (let i = 0; i < 64; i++) expect(clear[i * 4], `cell ${i}`).toBe(0);
  });
});

describe('cell rows (the fog shader\'s data texture)', () => {
  const planet = miniLayout.planets[0]!;
  const plan = surfacePlan({ cells: planet.surface.grid.cells, settlements: planet.surface.settlements });

  it('lays out cells x 3 RGBA texels: rest state + anchor + reach + flags, event + size + dash, cell centre + owned', () => {
    const at = plan.fileIds.map((_, k) => ({ fogged: k === 1, kind: (k === 2 ? 1 : 0) as 0 | 1, progress: k === 2 ? 0.5 : 0 }));
    const rows = cellRows(plan, at);
    const n = plan.territory.cells;
    expect(rows.length).toBe(n * FOG_TEX_ROWS * 4);
    for (let i = 0; i < n; i++) {
      const k = plan.territory.owner[i]!;
      expect(rows[i * 4]).toBe(k === 1 ? 1 : 0);
      expect(rows[i * 4 + 1]).toBe(plan.territory.anchor[k]);
      expect(rows[i * 4 + 3]).toBe(plan.flags[k]);
      expect([rows[(n + i) * 4], rows[(n + i) * 4 + 1], rows[(n + i) * 4 + 2]]).toEqual([k === 2 ? 1 : 0, k === 2 ? 0.5 : 0, plan.territory.size[k]]);
      const c = fibonacciCell(i, n);
      expect(rows[(2 * n + i) * 4]).toBeCloseTo(c[0], 6);
      expect(rows[(2 * n + i) * 4 + 3]).toBe(1);
    }
  });

  it('decorates parcels from their file only: "?" on big parcels alone, deterministic', () => {
    const big = surfacePlan({ cells: 256, settlements: [{ fileId: 'f_1', cell: 0 }, { fileId: 'f_2', cell: 128 }] });
    const small = surfacePlan({ cells: 256, settlements: Array.from({ length: 64 }, (_, k) => ({ fileId: `f_${k}`, cell: k * 4 })) });
    expect(surfacePlan({ cells: 256, settlements: [{ fileId: 'f_1', cell: 0 }, { fileId: 'f_2', cell: 128 }] })).toEqual(big);
    expect([...small.flags].some((f) => (f & FLAG.qmark) !== 0)).toBe(false); // 4 cells each, under 7/256
    const many = surfacePlan({ cells: 256, settlements: Array.from({ length: 20 }, (_, k) => ({ fileId: `f_${k}`, cell: k * 12 })) });
    const q = [...many.flags].filter((f) => (f & FLAG.qmark) !== 0).length;
    expect(q).toBeGreaterThan(2); // about half of 20 big parcels
    expect(q).toBeLessThan(18);
  });
});

describe('events (F5 clear, F6 refog)', () => {
  const ids = ['f_00000000000a', 'f_00000000000b', 'f_00000000000c', 'f_00000000000d'];
  const before = withStates({ f_00000000000a: 'fogged', f_00000000000b: 'clear', f_00000000000c: 'charted', f_00000000000d: 'fogged' });
  const after = withStates({ f_00000000000a: 'charted', f_00000000000b: 'fogged', f_00000000000c: 'charted', f_00000000000d: 'fogged' });

  it('clears a file that was fogged and isn\'t, refogs one that wasn\'t and is, and leaves the rest', () => {
    expect(fogChanges(before, after, ids, 90)).toEqual([
      { fileId: 'f_00000000000a', kind: 'clear', start: 90 },
      { fileId: 'f_00000000000b', kind: 'refog', start: 90 },
    ]);
  });

  it('snaps between "no usable view" and a view: no review happened, so no front', () => {
    expect(fogChanges(null, after, ids, 0)).toEqual([]);
    expect(fogChanges(after, null, ids, 0)).toEqual([]);
  });

  it('runs a clear for 1 s and a refog for 2.4 s of loop frames, from 0 to 1, then rests', () => {
    expect(FOG_EVENT_FRAMES).toEqual({ clear: 30, refog: 72, pulse: 27 });
    const e: FogEvent = { fileId: 'f_1', kind: 'refog', start: 100 };
    expect(fileFogAt(true, e, 100)).toEqual({ fogged: true, kind: 2, progress: 0 });
    expect(fileFogAt(true, e, 136)).toEqual({ fogged: true, kind: 2, progress: 0.5 });
    expect(fileFogAt(true, e, 172)).toEqual({ fogged: true, kind: 0, progress: 0 });
    expect(fileFogAt(false, { ...e, kind: 'clear' }, 115)).toEqual({ fogged: false, kind: 1, progress: 0.5 });
  });

  it('keeps one event per file (the newer wins) and drops events once over, a clear only after its pulse', () => {
    const a: FogEvent = { fileId: 'f_1', kind: 'clear', start: 0 }, b: FogEvent = { fileId: 'f_1', kind: 'refog', start: 10 };
    expect(mergeEvents([a], [b], 10)).toEqual([b]);
    expect(eventLife(a)).toBe(30 + 27);
    expect(mergeEvents([a], [], 56)).toEqual([a]);
    expect(mergeEvents([a], [], 57)).toEqual([]);
  });
});

describe('the planet-clear pulse (F5\'s landing moment)', () => {
  const plan = surfacePlan({ cells: 64, settlements: miniLayout.planets[0]!.surface.settlements });
  const [f0, f1] = plan.fileIds;
  const events = new Map<string, FogEvent>([[f0!, { fileId: f0!, kind: 'clear', start: 0 }], [f1!, { fileId: f1!, kind: 'clear', start: 6 }]]);

  it('runs once the last front is done, from the last parcel charted, only when the view counts no fogged file left', () => {
    expect(planetPulse(plan, events, [], 0, 35)).toBeNull(); // f1's front still running
    expect(planetPulse(plan, events, [], 0, 36)).toEqual({ cell: plan.territory.anchor[1], progress: 0 });
    expect(planetPulse(plan, events, [], 0, 36 + 27)).toBeNull();
  });

  it('never fires while the planet still has a fogged file anywhere (an unplaced file, a moon) or its count is unknown (Rule 1)', () => {
    expect(planetPulse(plan, events, [], 1, 40)).toBeNull();
    expect(planetPulse(plan, events, [], null, 40)).toBeNull();
  });

  it('waits for a moon\'s clear too, and starts from the last surface parcel', () => {
    const withMoon = new Map(events).set('f_moon', { fileId: 'f_moon', kind: 'clear', start: 20 });
    expect(planetPulse(plan, withMoon, ['f_moon'], 0, 49)).toBeNull();
    expect(planetPulse(plan, withMoon, ['f_moon'], 0, 50)).toEqual({ cell: plan.territory.anchor[1], progress: 0 });
  });
});

describe('fog counts in words (F2, exact)', () => {
  it('reads each planet\'s and the whole repo\'s counts from the view, and nothing without one', () => {
    expect(planetTally(miniFog, 'd_00000000000c')).toEqual({ fogged: 1, total: 25 });
    expect(planetTally(miniFog, 'd_ffffffffffff')).toBeNull();
    expect(systemTally(miniFog)).toEqual({ fogged: 2, total: 37 });
    expect(systemTally(null)).toBeNull();
  });
});

describe('the view\'s fog ledger (tickets, the head check, fronts)', () => {
  const ids = miniFog.files.map((f) => f.fileId);
  const charted = withStates({ f_000000000003: 'charted' });

  it('drops an answer older than one already applied (Qodo #75 local r1 #3: a reload\'s fog never lands over a newer chart answer)', () => {
    const l = new FogLedger();
    l.setLayout(HEAD, true);
    const a = l.ticket(), b = l.ticket();
    expect(l.apply(charted, b, ids, 0, true)).toBe(true);
    expect(l.apply(miniFog, a, ids, 0, true)).toBe(false);
    expect(l.fog).toBe(charted);
  });

  it('draws a fog from another scan than the layout as no view (all fogged), and says why', () => {
    const l = new FogLedger();
    l.setLayout(HEAD, true);
    expect(l.apply({ ...miniFog, head: '2'.repeat(40) }, l.ticket(), ids, 0, true)).toBe(true);
    expect([l.fog, l.mismatch]).toEqual([null, true]);
    l.apply(miniFog, l.ticket(), ids, 0, true);
    expect([l.fog, l.mismatch]).toEqual([miniFog, false]);
    // a new layout from another scan drops the fog drawn for the old one
    expect(l.setLayout('3'.repeat(40), true)).toBe(true);
    expect(l.fog).toBeNull();
  });

  it('forgets the last change when a new layout drops its fog, so a reload never announces it again (Qodo local r1)', () => {
    const l = new FogLedger();
    l.setLayout(HEAD, true);
    l.apply(miniFog, l.ticket(), ids, 0, true);
    l.apply(charted, l.ticket(), ids, 40, true);
    expect(l.change).toEqual({ cleared: 1, refogged: 0 });
    expect(l.setLayout('3'.repeat(40), true)).toBe(true);
    expect(l.change).toEqual({ cleared: 0, refogged: 0 });
  });

  it('measures the fog of a new scan against the fog its layout replaced, so a refog arriving with a scan still rolls in (Qodo PR #117 r3)', () => {
    const l = new FogLedger();
    l.setLayout(HEAD, true);
    l.apply(charted, l.ticket(), ids, 0, true);
    const NEXT = '3'.repeat(40);
    expect(l.setLayout(NEXT, true)).toBe(true); // the old fog is dropped for the new layout
    expect(l.fog).toBeNull();
    expect(l.apply({ ...miniFog, head: NEXT }, l.ticket(), ids, 10, true)).toBe(true); // f_000000000003 is fogged again
    expect(l.events).toEqual([{ fileId: 'f_000000000003', kind: 'refog', start: 10 }]);
    expect(l.change).toEqual({ cleared: 0, refogged: 1 });
    // unknown to known still snaps: nothing to measure against
    l.setLayout(HEAD, true);
    l.apply(null, l.ticket(), ids, 20, true);
    l.apply(miniFog, l.ticket(), ids, 30, true);
    expect(l.events.filter((e) => e.start === 30)).toEqual([]);
  });

  it('starts fronts at the frame seen, only when animating, and counts the change either way', () => {
    const l = new FogLedger();
    l.setLayout(HEAD, true);
    l.apply(miniFog, l.ticket(), ids, 0, true);
    expect(l.apply(charted, l.ticket(), ids, 40, true)).toBe(true);
    expect(l.events).toEqual([{ fileId: 'f_000000000003', kind: 'clear', start: 40 }]);
    expect(l.change).toEqual({ cleared: 1, refogged: 0 });
    expect(l.prune(40 + 56)).toBe(false);
    expect(l.prune(40 + 57)).toBe(true);
    l.apply(miniFog, l.ticket(), ids, 200, false);
    expect([l.events, l.change]).toEqual([[], { cleared: 0, refogged: 1 }]);
  });

  it('ends every front at once for reduced motion', () => {
    const l = new FogLedger();
    l.setLayout(HEAD, true);
    l.apply(miniFog, l.ticket(), ids, 0, true);
    l.apply(charted, l.ticket(), ids, 5, true);
    expect(l.settle()).toBe(true);
    expect(l.events).toEqual([]);
    expect(l.settle()).toBe(false);
  });
});

describe('fog colours (Rule 5: palette roles only)', () => {
  it('has a veil for every ramp a look, a test moon or a moonlet draws', async () => {
    const { LOOKS } = await import('../../web/src/render/looks.js');
    const { fogRole } = await import('../../web/src/render/fog.js');
    const { palette } = await import('../../src/core/palette.js');
    for (const look of Object.values(LOOKS)) for (const r of look.ramps) expect(() => fogRole(r)).not.toThrow();
    expect(fogRole(palette.world.moonBody)).toBe('moonBody');
  });
});
