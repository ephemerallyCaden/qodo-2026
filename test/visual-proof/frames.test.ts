// visual-proof: pixel counts between two frames (takes and before/after), where the change lies, and
// the images it writes (side by side, captioned, the change mask).
import { describe, expect, it } from 'vitest';
import { changeMask, diffByRegion, diffPixels, fitText, hexRgb, sideBySide, solid, withCaption, type Image } from '../../.claude/skills/visual-proof/scripts/frames.js';
import { textWidth } from '../../web/src/labels/font.js';
import { UI_COLOURS } from '../../web/src/ui/colours.js';

const SPACE = hexRgb(UI_COLOURS.space), INK = hexRgb(UI_COLOURS.ink), ACCENT = hexRgb(UI_COLOURS.accent);
const at = (img: Image, x: number, y: number) => [...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const paint = (img: Image, x: number, y: number, rgba: number[]) => { img.rgba.set(rgba, (y * img.width + x) * 4); return img; };
const copy = (img: Image): Image => ({ ...img, rgba: Uint8Array.from(img.rgba) });

describe('diffPixels', () => {
  const a = solid(8, 6, SPACE);
  it('counts nothing between equal frames', () => {
    expect(diffPixels(a, copy(a))).toEqual({ px: 0, box: null, total: 48 });
  });
  it('counts every pixel that differs in any channel, alpha too, with their bounding box', () => {
    const b = paint(paint(paint(copy(a), 1, 4, [1, 2, 3, 255]), 6, 2, [...SPACE, 255]), 3, 1, [...SPACE, 254]);
    // (6,2) was repainted with the colour it already had: not a change
    expect(diffPixels(a, b)).toEqual({ px: 2, box: { x0: 1, y0: 1, x1: 3, y1: 4 }, total: 48 });
  });
  it('refuses frames of different sizes', () => {
    expect(() => diffPixels(a, solid(8, 5, SPACE))).toThrow(/8x6.*8x5/);
  });
});

describe('diffByRegion', () => {
  const a = solid(10, 10, SPACE);
  const b = copy(a);
  for (const [x, y] of [[0, 0], [2, 2], [5, 5], [9, 9], [6, 1]] as const) paint(b, x, y, [...INK, 255]);
  it('gives each changed pixel to the first region whose box holds it, the rest to the last line', () => {
    const got = diffByRegion(a, b, [
      { name: '#drone-panel', rects: [{ x: 0, y: 0, w: 3, h: 3 }] },
      // before and after boxes: a panel that moved counts in either
      { name: '#panel', rects: [{ x: 1, y: 1, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 }] },
    ], 'the 3D view and labels');
    expect(got.px).toBe(5);
    expect(got.where).toEqual([
      { name: '#drone-panel', px: 2 }, // (0,0) and (2,2): first match wins over #panel's box
      { name: '#panel', px: 1 }, // (5,5), in its second box
      { name: 'the 3D view and labels', px: 2 },
    ]);
  });
  it('uses half-open boxes with fractional edges, as DOMRect gives them', () => {
    const got = diffByRegion(a, b, [{ name: 'r', rects: [{ x: 5.5, y: 0.5, w: 4, h: 8.4 }] }]);
    // (6,1) lies inside; (9,9) is past y 8.9; (5,5) is left of x 5.5
    expect(got.where).toEqual([{ name: 'r', px: 1 }, { name: 'elsewhere', px: 4 }]);
  });
});

describe('the images', () => {
  const a = paint(solid(4, 3, SPACE), 0, 0, [9, 9, 9, 255]);
  const b = paint(solid(4, 3, SPACE), 3, 2, [200, 100, 50, 255]);
  it('puts two frames side by side with a gap of space', () => {
    const s = sideBySide(a, b, 2);
    expect([s.width, s.height]).toEqual([10, 3]);
    expect(at(s, 0, 0)).toEqual([9, 9, 9, 255]);
    expect(at(s, 4, 1)).toEqual([...SPACE, 255]);
    expect(at(s, 9, 2)).toEqual([200, 100, 50, 255]);
  });
  it('adds a caption bar above a frame, in the bitmap font, the frame unchanged below it', () => {
    const big = solid(120, 20, [40, 40, 40]);
    const c = withCaption(big, 'BEFORE 8cf028c', 2);
    expect(c.width).toBe(120);
    const bar = c.height - 20;
    expect(bar).toBeGreaterThan(10);
    let ink = 0;
    for (let y = 0; y < bar; y++) for (let x = 0; x < 120; x++) if (at(c, x, y).slice(0, 3).join() === INK.join()) ink++;
    expect(ink).toBeGreaterThan(40);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 120; x += 17) expect(at(c, x, bar + y)).toEqual([40, 40, 40, 255]);
  });
  it("cuts a caption short with '...' so the right-hand text stays clear", () => {
    expect(fitText('short', 100)).toBe('short');
    const long = 'BEFORE 8cf028c test(view): the drone panel hands focus back on the real rescan';
    const cut = fitText(long, 120);
    expect(cut.endsWith('...')).toBe(true);
    expect(textWidth(cut)).toBeLessThanOrEqual(120);
    expect(long.startsWith(cut.slice(0, -3))).toBe(true);
    // in the bar: no ink between the cut text and the right-hand text
    const c = withCaption(solid(200, 10, [40, 40, 40]), long, 1, 'shot');
    const inkAt = (x: number) => [0, 1, 2, 3, 4, 5, 6, 7].some((y) => at(c, x, y).slice(0, 3).join() === INK.join());
    const right = 200 - 2 - textWidth('shot');
    expect([...Array(5).keys()].some((i) => inkAt(right - 1 - i))).toBe(false);
  });
  it('marks every changed pixel in the accent and dims the rest', () => {
    const m = changeMask(a, b);
    expect(at(m, 3, 2)).toEqual([...ACCENT, 255]);
    expect(at(m, 0, 0)).toEqual([...ACCENT, 255]);
    const dimmed = at(m, 1, 1);
    expect(dimmed).not.toEqual([...ACCENT, 255]);
    expect(dimmed[0]! + dimmed[1]! + dimmed[2]!).toBeLessThanOrEqual(SPACE[0]! + SPACE[1]! + SPACE[2]!);
  });
});
