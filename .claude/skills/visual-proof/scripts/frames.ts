// visual-proof: pixel counts between two frames, where in the view they lie, and the images the run
// writes (side by side, captioned, the change mask). Pure: RGBA buffers in, RGBA buffers out.
import { FONT_HEIGHT, rasterText, textWidth } from '../../../../web/src/labels/font.js';
import { UI_COLOURS } from '../../../../web/src/ui/colours.js';
import type { Image } from './png.js';

export type { Image } from './png.js';

/** Inclusive pixel bounds, as test/render/twin.ts writes them. */
export interface Box { x0: number; y0: number; x1: number; y1: number }
/** A DOMRect's numbers in CSS px (1 CSS px = 1 frame px: deviceScaleFactor 1). Half-open: x ≤ px < x + w. */
export interface Rect { x: number; y: number; w: number; h: number }
/** A part of the view: a pixel is in it when it lies in any of its boxes (e.g. a panel's box before and after). */
export interface Region { name: string; rects: Rect[] }
export interface Where { name: string; px: number }
export interface Diff { px: number; box: Box | null; total: number }

export type Rgb = readonly [number, number, number];

export function hexRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}

const SPACE = hexRgb(UI_COLOURS.space), INK = hexRgb(UI_COLOURS.ink), ACCENT = hexRgb(UI_COLOURS.accent);

export function solid(width: number, height: number, rgb: Rgb): Image {
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) rgba.set([rgb[0], rgb[1], rgb[2], 255], p * 4);
  return { width, height, rgba };
}

function sameSize(a: Image, b: Image): void {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`frames differ in size: ${a.width}x${a.height} and ${b.width}x${b.height}`);
}

const differs = (a: Uint8Array, b: Uint8Array, i: number) => a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3];

/** Every pixel that differs in any channel, and their bounding box. */
export function diffPixels(a: Image, b: Image): Diff {
  sameSize(a, b);
  let px = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p < a.width * a.height; p++) {
    if (!differs(a.rgba, b.rgba, p * 4)) continue;
    px++;
    const x = p % a.width, y = (p - x) / a.width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return { px, box: px ? { x0, y0, x1, y1 } : null, total: a.width * a.height };
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** diffPixels, with each changed pixel given to the first region whose box holds it, the rest to `rest`. */
export function diffByRegion(a: Image, b: Image, regions: readonly Region[], rest = 'elsewhere'): Diff & { where: Where[] } {
  const d = diffPixels(a, b);
  const counts = new Array<number>(regions.length + 1).fill(0);
  if (d.px) {
    for (let p = 0; p < a.width * a.height; p++) {
      if (!differs(a.rgba, b.rgba, p * 4)) continue;
      const x = p % a.width, y = (p - x) / a.width;
      const i = regions.findIndex((r) => r.rects.some((rect) => inside(rect, x, y)));
      counts[i < 0 ? regions.length : i]!++;
    }
  }
  return { ...d, where: [...regions.map((r, i) => ({ name: r.name, px: counts[i]! })), { name: rest, px: counts[regions.length]! }] };
}

/** `a`, a `gap` of space, then `b`, top-aligned. */
export function sideBySide(a: Image, b: Image, gap: number): Image {
  const out = solid(a.width + gap + b.width, Math.max(a.height, b.height), SPACE);
  blit(out, a, 0, 0);
  blit(out, b, a.width + gap, 0);
  return out;
}

export function blit(dst: Image, src: Image, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dst.height) continue;
    const x0 = Math.max(0, -ox), x1 = Math.min(src.width, dst.width - ox);
    if (x1 <= x0) continue;
    dst.rgba.set(src.rgba.subarray((y * src.width + x0) * 4, (y * src.width + x1) * 4), (dy * dst.width + ox + x0) * 4);
  }
}

/** Draws `text` in the view's bitmap label font, each font pixel `scale` px square. */
export function drawText(img: Image, text: string, x: number, y: number, scale: number, rgb: Rgb = INK): void {
  const m = rasterText(text);
  for (let gy = 0; gy < m.h; gy++) {
    for (let gx = 0; gx < m.w; gx++) {
      if (!m.bits[gy * m.w + gx]) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = x + gx * scale + sx, py = y + gy * scale + sy;
          if (px >= 0 && py >= 0 && px < img.width && py < img.height) img.rgba.set([rgb[0], rgb[1], rgb[2], 255], (py * img.width + px) * 4);
        }
      }
    }
  }
}

/** The caption bar's height for a font scale: the font's rows plus a margin above and below. */
export const captionHeight = (scale: number): number => (FONT_HEIGHT + 4) * scale;

/** `text`, cut short with '...' so it is at most `width` font pixels wide. */
export function fitText(text: string, width: number): string {
  if (textWidth(text) <= width) return text;
  const chars = [...text];
  while (chars.length && textWidth(`${chars.join('')}...`) > width) chars.pop();
  return chars.length ? `${chars.join('').trimEnd()}...` : '';
}

/** `img` under a bar of space holding `text` (and `right`, right-aligned) in the label font; `text` is cut to leave `right` clear. */
export function withCaption(img: Image, text: string, scale: number, right = ''): Image {
  const bar = captionHeight(scale);
  const out = solid(img.width, img.height + bar, SPACE);
  const room = Math.floor((img.width - 4 * scale - (right ? (textWidth(right) + 6) * scale : 0)) / scale);
  drawText(out, fitText(text, room), 2 * scale, 2 * scale, scale);
  if (right) drawText(out, right, img.width - 2 * scale - textWidth(right) * scale, 2 * scale, scale);
  blit(out, img, 0, bar);
  return out;
}

/** `after` at a quarter of its brightness, every pixel that differs from `before` in the accent. */
export function changeMask(before: Image, after: Image): Image {
  sameSize(before, after);
  const out = { width: after.width, height: after.height, rgba: new Uint8Array(after.rgba.length) };
  for (let i = 0; i < after.rgba.length; i += 4) {
    if (differs(before.rgba, after.rgba, i)) out.rgba.set([ACCENT[0], ACCENT[1], ACCENT[2], 255], i);
    else out.rgba.set([after.rgba[i]! >> 2, after.rgba[i + 1]! >> 2, after.rgba[i + 2]! >> 2, 255], i);
  }
  return out;
}
