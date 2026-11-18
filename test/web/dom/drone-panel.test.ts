// The drone panel's DOM (#148 AC 4, 6) against a small fake document: what the session-detail section
// holds for each state, that text only goes in through textContent, and the exact cells the timeline
// paints for a fixture, in palette colours by role. Vitest has no DOM, so the fake records what is built.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DETAIL_BUCKETS, type DroneDetail } from '../../../src/core/contract/drones.js';
import { timelineText } from '../../../web/src/drones/detail.js';
import { DronePanel, TIMELINE } from '../../../web/src/drones/panel.js';
import { UI_COLOURS } from '../../../web/src/ui/colours.js';
import { session } from '../../fixtures/drones.js';

interface Paint { fill: string; x: number; y: number; w: number; h: number }

/** Just enough of an element: children, text, class, attributes, a style and (for a canvas) a recording 2D context. */
class FakeEl {
  children: FakeEl[] = [];
  textContent = '';
  className = '';
  hidden = false;
  type = '';
  width = 0;
  height = 0;
  readonly style: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  readonly paints: Paint[] = [];
  constructor(readonly tag: string) {}
  append(...c: FakeEl[]) { this.children.push(...c); }
  replaceChildren(...c: FakeEl[]) { this.children = [...c]; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  addEventListener() {}
  contains() { return false; }
  focus() {}
  getContext(kind: string) {
    if (this.tag !== 'canvas' || kind !== '2d') return null;
    const paints = this.paints;
    return { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) { paints.push({ fill: this.fillStyle, x, y, w, h }); } };
  }
  /** Every element below, depth first. */
  all(): FakeEl[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return [this.textContent, ...this.children.map((c) => c.text())].filter(Boolean).join(' '); }
}

let root: FakeEl;
beforeEach(() => {
  root = new FakeEl('aside');
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('document', { activeElement: null, getElementById: (id: string) => (id === 'drone-panel' ? root : null), createElement: (tag: string) => new FakeEl(tag) });
});
afterEach(() => { vi.unstubAllGlobals(); });

const HEAD = '1'.repeat(40);
const buckets = new Array<number>(DETAIL_BUCKETS).fill(0);
buckets[0] = 10;
buckets[5] = 6;
buckets[23] = 3;
const detail: DroneDetail = {
  ok: true, schemaVersion: 'drone-detail.1', head: HEAD, key: session(1, 'star').key, startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T11:00:00Z',
  files: [{ fileId: 'f_000000000002', path: 'src/a.ts', edits: 9 }, { fileId: 'f_000000000001', path: 'README.md', edits: 5 }, { fileId: 'f_000000000003', path: 'src/b.ts', edits: 2 }],
  otherFiles: 2, otherEdits: 3, buckets, needsRescan: false,
};
const open = () => {
  const p = new DronePanel();
  p.show(session(1, 'star'), 'the star');
  return p;
};
const section = () => root.children.find((c) => c.className === 'detail')!;

describe('the drone panel\'s session detail (#148)', () => {
  it('sits below the rows, and says it is loading until the answer comes', () => {
    open().showDetail({ kind: 'loading' });
    expect(root.children.map((c) => c.tag)).toEqual(['div', 'dl', 'section']);
    expect(section().attrs['aria-live']).toBe('polite');
    expect(section().text()).toBe('loading files…');
  });

  it('lists the files by folder with their edit counts, then the other files, in that order and no other', () => {
    open().showDetail({ kind: 'ready', detail });
    const lines = section().children.filter((c) => c.tag !== 'canvas').map((c) => c.text());
    expect(lines.slice(0, 6)).toEqual([
      'files edited', 'top level', 'README.md 5 edits', 'src/', 'a.ts 9 edits b.ts 2 edits',
      '2 other files not at HEAD (deleted, renamed, excluded, on another branch or in a removed worktree): 3 edits',
    ]);
    expect(lines.slice(6)).toEqual(['edits over time', '2026-11-10 09:00:00 UTC 2026-11-10 11:00:00 UTC', timelineText(detail)]);
  });

  it('paints exactly the timeline\'s cells, nearest-neighbour, in palette colours by role (Rules 4 and 5)', () => {
    open().showDetail({ kind: 'ready', detail });
    const canvas = section().all().find((c) => c.tag === 'canvas')!;
    const { cell, gap, rows } = TIMELINE;
    expect([canvas.width, canvas.height]).toEqual([DETAIL_BUCKETS * (cell + gap) - gap, rows + 1]);
    expect([canvas.style['width'], canvas.style['height']]).toEqual([`${canvas.width * 2}px`, `${canvas.height * 2}px`]);
    expect(canvas.attrs).toMatchObject({ role: 'img', 'aria-label': timelineText(detail) });
    expect(canvas.paints).toEqual([
      { fill: UI_COLOURS.space, x: 0, y: 0, w: canvas.width, h: canvas.height },
      { fill: UI_COLOURS.rule, x: 0, y: rows, w: canvas.width, h: 1 },
      // 10 → all 12 cells; 6 → ceil(7.2) = 8; 3 → ceil(3.6) = 4
      { fill: UI_COLOURS.ink, x: 0, y: 0, w: cell, h: 12 },
      { fill: UI_COLOURS.ink, x: 5 * (cell + gap), y: 4, w: cell, h: 8 },
      { fill: UI_COLOURS.ink, x: 23 * (cell + gap), y: 8, w: cell, h: 4 },
    ]);
  });

  it('scales to whole device pixels on a fractional device pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 1.25);
    open().showDetail({ kind: 'ready', detail });
    const canvas = section().all().find((c) => c.tag === 'canvas')!;
    // round(2 × 1.25) = 3 device px per internal px
    expect(canvas.style['width']).toBe(`${(canvas.width * 3) / 1.25}px`);
  });

  it('a session with no edits says so instead of an empty list', () => {
    open().showDetail({ kind: 'ready', detail: { ...detail, files: [], otherFiles: 0, otherEdits: 0, buckets: new Array<number>(DETAIL_BUCKETS).fill(0) } });
    expect(section().children.map((c) => c.text())).toContain('no edits recorded');
  });

  it('a note or a failure is one line, and a new show starts the section empty', () => {
    const p = open();
    p.showDetail({ kind: 'failed', text: 'the repository was rescanned; the drones will follow the next update' });
    expect(section().text()).toBe('the repository was rescanned; the drones will follow the next update');
    p.show(session(2, 'star'), 'the star');
    expect(section().children).toEqual([]);
  });

  it('puts text in only through textContent, and outside text through plain() (no control or bidi characters)', () => {
    open().showDetail({ kind: 'ready', detail: { ...detail, files: [{ fileId: 'f_000000000001', path: 'src‮/x\u0007.ts', edits: 1 }], otherFiles: 0, otherEdits: 0,
      buckets: [1, ...new Array<number>(DETAIL_BUCKETS - 1).fill(0)] } });
    for (const e of root.all()) expect(Object.prototype.hasOwnProperty.call(e, 'innerHTML'), e.tag).toBe(false);
    expect(section().text()).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });
});
