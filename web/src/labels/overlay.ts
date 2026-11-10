// Labels and UI text at native resolution, outside the pixel pass (art-direction §3): the bitmap
// font drawn as whole device-pixel blocks on a 2D canvas laid over the view. Text is only ever drawn
// as glyph bitmaps, never parsed as HTML.
import { UI_COLOURS } from '../ui/colours.js';
import { FONT_HEIGHT, rasterText, textWidth } from './font.js';

export interface Label {
  text: string;
  /** Anchor in device px of the label canvas. */
  x: number;
  y: number;
  align: 'left' | 'centre';
  colour: string;
}

/** Device px per font pixel for an upscale factor: labels grow with the image, never blur. */
export const fontScale = (upscale: number): number => Math.max(1, Math.floor(upscale / 2));
/** Line height in device px. */
export const lineHeight = (px: number): number => (FONT_HEIGHT + 2) * px;

/** Draws one line of text: a space-coloured backing (one font px of padding), then the glyph bits. */
export function drawText(ctx: CanvasRenderingContext2D, label: Label, px: number): void {
  const mask = rasterText(label.text);
  if (mask.w === 0) return;
  const w = mask.w * px;
  const x0 = Math.round(label.align === 'centre' ? label.x - w / 2 : label.x);
  const y0 = Math.round(label.y);
  ctx.fillStyle = UI_COLOURS.space;
  ctx.fillRect(x0 - px, y0 - px, w + 2 * px, (mask.h + 1) * px);
  ctx.fillStyle = label.colour;
  for (let y = 0; y < mask.h; y++) {
    let run = -1;
    for (let x = 0; x <= mask.w; x++) {
      const on = x < mask.w && mask.bits[y * mask.w + x] === 1;
      if (on && run < 0) run = x;
      if (!on && run >= 0) { ctx.fillRect(x0 + run * px, y0 + y * px, (x - run) * px, px); run = -1; }
    }
  }
}

/** Most cached label bitmaps; past this the cache starts over (labels come and go with the view). */
const MAX_CACHED = 256;

/** The label canvas: same device size as the view canvas, stacked over it. */
export class LabelLayer {
  private readonly ctx: CanvasRenderingContext2D;
  /** One bitmap per text, colour and scale, so a frame blits labels instead of re-rasterising them. */
  private readonly cache = new Map<string, HTMLCanvasElement>();
  /** What the canvas shows now; an identical label set skips the redraw (planets hold still between frames). */
  private shown = '';
  px = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  resize(deviceW: number, deviceH: number, cssW: string, cssH: string, upscale: number): void {
    if (this.canvas.width !== deviceW) this.canvas.width = deviceW;
    if (this.canvas.height !== deviceH) this.canvas.height = deviceH;
    this.canvas.style.width = cssW;
    this.canvas.style.height = cssH;
    this.px = fontScale(upscale);
    this.ctx.imageSmoothingEnabled = false;
    this.shown = ''; // resizing cleared the canvas
  }

  draw(labels: readonly Label[]): void {
    const px = this.px;
    const placed = labels.map((l) => {
      const w = textWidth(l.text) * px;
      return { l, x: Math.round(l.align === 'centre' ? l.x - w / 2 : l.x) - px, y: Math.round(l.y) - px };
    });
    const key = `${px}\n${placed.map(({ l, x, y }) => `${x},${y},${l.colour},${l.text}`).join('\n')}`;
    if (key === this.shown) return;
    this.shown = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const { l, x, y } of placed) {
      const id = `${px}|${l.colour}|${l.text}`;
      let bmp = this.cache.get(id);
      if (!bmp) {
        if (this.cache.size >= MAX_CACHED) this.cache.clear();
        this.cache.set(id, (bmp = bitmap(l.text, px, l.colour)));
      }
      this.ctx.drawImage(bmp, x, y);
    }
  }
}

/** One line of text with its backing, drawn at (px, px) on a canvas just big enough for it. */
function bitmap(text: string, px: number, colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, (textWidth(text) + 2) * px);
  c.height = (FONT_HEIGHT + 2) * px;
  const ctx = c.getContext('2d');
  if (ctx) drawText(ctx, { text, x: px, y: px, align: 'left', colour }, px);
  return c;
}
/** A small canvas holding one line of text, for HUD controls; its accessible name lives in the DOM. */
export function textCanvas(text: string, px: number, dpr: number, colour: string): HTMLCanvasElement {
  const c = bitmap(text, px, colour);
  c.style.width = `${c.width / dpr}px`;
  c.style.height = `${c.height / dpr}px`;
  c.setAttribute('aria-hidden', 'true');
  return c;
}
