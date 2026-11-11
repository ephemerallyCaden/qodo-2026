// HUD controls and messages. Native inputs (keyboard and screen-reader friendly) whose visible text
// is the bitmap font at native resolution; their accessible names are plain DOM text. Messages are
// set with textContent only, never parsed as HTML.
import { textCanvas } from '../labels/overlay.js';
import { PIXEL_HEIGHT } from '../model/pixels.js';
import { UI_COLOURS } from './colours.js';
import { byId as $ } from './dom.js';

/** Replaces an element's bitmap text (keeps any screen-reader-only children). */
function setBitmap(host: HTMLElement, text: string, px: number, dpr: number): void {
  host.querySelector('canvas.bitmap')?.remove();
  const c = textCanvas(text, px, dpr, UI_COLOURS.ink);
  c.classList.add('bitmap');
  host.prepend(c);
}

export class Hud {
  private readonly hud = $<HTMLDivElement>('hud');
  private readonly pixel = $<HTMLInputElement>('pixel');
  private readonly motion = $<HTMLInputElement>('motion');
  private readonly pixelLabel = $<HTMLLabelElement>('pixel-control');
  private readonly motionLabel = $<HTMLLabelElement>('motion-control');
  private readonly status = $<HTMLParagraphElement>('status');
  private readonly summaryBox = $<HTMLParagraphElement>('summary');
  private readonly errorBox = $<HTMLDivElement>('error');
  private px = 2;
  private dpr = 1;
  /** The internal-resolution slider moved (120..480). */
  onPixelHeight: (h: number) => void = () => {};
  /** The in-app reduced-motion toggle changed. */
  onReducedMotion: (on: boolean) => void = () => {};

  constructor() {
    this.pixel.min = String(PIXEL_HEIGHT.min);
    this.pixel.max = String(PIXEL_HEIGHT.max);
    this.pixel.value = String(PIXEL_HEIGHT.default);
    this.pixel.addEventListener('input', () => { this.onPixelHeight(Number(this.pixel.value)); this.paint(); });
    this.motion.addEventListener('change', () => this.onReducedMotion(this.motion.checked));
  }

  /** Shows the controls (live mode only; test mode has no HUD). */
  show(): void { this.hud.hidden = false; }

  setReducedMotion(on: boolean): void { this.motion.checked = on; }

  /** Redraws the bitmap text at the label scale (device px per font px). */
  scale(px: number, dpr: number): void {
    this.px = px;
    this.dpr = dpr;
    this.paint();
  }

  private paint(): void {
    setBitmap(this.pixelLabel, `pixels ${this.pixel.value}`, this.px, this.dpr);
    setBitmap(this.motionLabel, 'reduce motion', this.px, this.dpr);
  }

  /** The canvas's text equivalent (its aria-describedby): what the labels and info panel show. */
  summary(text: string): void { this.summaryBox.textContent = text; }

  /** Polite screen-reader announcement (focus changes, live-update state). */
  announce(text: string): void { this.status.textContent = text; }

  /** A readable error in place of the view (AC9), as bitmap text plus a DOM copy for assistive tech. */
  error(title: string, detail: readonly string[]): void {
    const box = this.errorBox;
    box.replaceChildren();
    const sr = document.createElement('p');
    sr.className = 'sr';
    sr.textContent = [title, ...detail].join(' ');
    box.append(sr);
    [title, ...detail].forEach((line, i) => {
      const c = textCanvas(line, this.px, this.dpr, i === 0 ? UI_COLOURS.ink : UI_COLOURS.dim);
      c.classList.add('line');
      box.append(c);
    });
    box.hidden = false;
  }

  clearError(): void { this.errorBox.hidden = true; this.errorBox.replaceChildren(); }
}
