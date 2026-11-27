// Labels clear of the open panels (#169): the review and drone panels are DOM laid over the label
// canvas, so a label moves out from under them, as little as it can, and stays fully in the frame.
import { describe, expect, it } from 'vitest';
import { clearOf, type Rect } from '../../web/src/labels/place.js';

const W = 1280, H = 720, GAP = 4;
/** The review panel at 1280 px: 512 px wide from x 760, below the HUD (style.css `#panel`). */
const REVIEW: Rect = { x: 760, y: 56, w: 512, h: 600 };
/** The drone panel: 288 px wide from x 8, its bottom 40 px above the frame's (style.css `#drone-panel`). */
const DRONE: Rect = { x: 8, y: 480, w: 288, h: 200 };
const moved = (box: Rect, d: { dx: number; dy: number }): Rect => ({ ...box, x: box.x + d.dx, y: box.y + d.dy });
const clearOfAll = (b: Rect, covers: Rect[]) => covers.every((c) => b.x + b.w <= c.x || b.x >= c.x + c.w || b.y + b.h <= c.y || b.y >= c.y + c.h);
const inFrame = (b: Rect) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;

describe('clearOf (#169)', () => {
  it('leaves a label that is in the frame and under no panel where it is', () => {
    const box = { x: 448, y: 200, w: 388, h: 16 };
    expect(clearOf(box, [], W, H, GAP)).toEqual({ dx: 0, dy: 0 });
    expect(clearOf(box, [DRONE], W, H, GAP)).toEqual({ dx: 0, dy: 0 });
    expect(clearOf({ ...box, x: 760 - GAP - box.w }, [REVIEW], W, H, GAP)).toEqual({ dx: 0, dy: 0 }); // touching the gap's edge is clear
  });

  it('moves a 48-character note centred on the focused planet left of the review panel, by just enough', () => {
    const box = { x: 640 - 194, y: 200, w: 388, h: 40 }; // three lines, centred at 640, running to 834 under the panel at 760
    const d = clearOf(box, [REVIEW], W, H, GAP);
    expect(d).toEqual({ dx: 760 - GAP - (box.x + box.w), dy: 0 });
    expect(clearOfAll(moved(box, d), [REVIEW])).toBe(true);
  });

  it('moves a drone label under the drone panel the shorter way: up above it here, right of it when that is shorter', () => {
    const low = { x: 60, y: 560, w: 92, h: 16 };
    expect(clearOf(low, [DRONE], W, H, GAP)).toEqual({ dx: 0, dy: DRONE.y - GAP - low.h - low.y });
    const edge = { x: 250, y: 600, w: 92, h: 16 }; // 50 px to clear on the right, 84 down, 140 up
    expect(clearOf(edge, [DRONE], W, H, GAP)).toEqual({ dx: DRONE.x + DRONE.w + GAP - edge.x, dy: 0 });
  });

  it('brings a label running off the frame fully into it', () => {
    expect(clearOf({ x: -30, y: -5, w: 100, h: 16 }, [], W, H, GAP)).toEqual({ dx: 30, dy: 5 });
    expect(clearOf({ x: 1250, y: 710, w: 100, h: 16 }, [], W, H, GAP)).toEqual({ dx: W - 100 - 1250, dy: H - 16 - 710 });
  });

  it('never moves a label from under one panel to under the other, or out of the frame', () => {
    const right = { x: 600, y: 0, w: 680, h: 720 }, left = { x: 0, y: 300, w: 400, h: 420 };
    const box = { x: 500, y: 500, w: 200, h: 16 }; // under the right panel; just left of it is under the left one
    const d = clearOf(box, [right, left], W, H, GAP);
    expect(d).toEqual({ dx: right.x - GAP - box.w - box.x, dy: left.y - GAP - box.h - box.y }); // left of the one and above the other
    expect(clearOfAll(moved(box, d), [right, left])).toBe(true);
    expect(inFrame(moved(box, d))).toBe(true);
  });

  it('when no place is clear (a frame too small), takes the least covered one, in the frame', () => {
    const covers = [{ x: 0, y: 0, w: 200, h: 100 }, { x: 260, y: 0, w: 60, h: 100 }];
    const box = { x: 100, y: 40, w: 100, h: 16 }; // a 320×100 frame with only a 60 px gap between the panels
    const at = moved(box, clearOf(box, covers, 320, 100, GAP));
    expect(at.x).toBe(156); // 44 px still covered, as at x 204, but the shorter move
    expect(at.y).toBe(40);
  });

  it('is a pure function: the same input gives the same answer', () => {
    const box = { x: 446, y: 200, w: 388, h: 40 };
    expect(clearOf(box, [REVIEW, DRONE], W, H, GAP)).toEqual(clearOf({ ...box }, [{ ...REVIEW }, { ...DRONE }], W, H, GAP));
  });
});
