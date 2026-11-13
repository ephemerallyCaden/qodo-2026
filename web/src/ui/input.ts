// DOM input → camera rig input. Pointer drags and the wheel accumulate until the next tick; fly
// keys are held state. A click (a press that barely moved) picks a planet. Keys only act while the
// view has keyboard focus, so the HUD controls keep their own keys.
import type { FlyKey, RigInput } from '../camera/rig.js';

const FLY: Readonly<Record<string, FlyKey>> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyR: 'up', KeyF: 'down',
};
/** A press that moves less than this (CSS px) is a click, not a drag. */
const CLICK_SLOP = 4;

export interface InputHandlers {
  /** Something changed: wake the loop. */
  wake(): void;
  click(cssX: number, cssY: number): void;
  /** Focus the next (+1) or previous (-1) planet. */
  cycle(dir: 1 | -1): void;
  /** Back to free flight. */
  release(): void;
  /** Back to the start pose. */
  home(): void;
}

export class Input {
  private drag: [number, number] = [0, 0];
  private wheel = 0;
  private readonly keys = new Set<FlyKey>();
  private press: { id: number; x: number; y: number; moved: number } | null = null;

  constructor(private readonly el: HTMLElement, private readonly h: InputHandlers) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.press || e.pointerId !== this.press.id) return;
      this.drag[0] += e.movementX;
      this.drag[1] += e.movementY;
      this.press.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      h.wake();
    });
    const end = (e: PointerEvent, completed: boolean) => {
      if (!this.press || e.pointerId !== this.press.id) return;
      const wasClick = completed && this.press.moved < CLICK_SLOP;
      this.press = null;
      if (!completed) this.drag = [0, 0]; // a cancelled drag never turns the camera
      if (wasClick) {
        const r = el.getBoundingClientRect();
        h.click(e.clientX - r.left, e.clientY - r.top);
      }
      h.wake();
    };
    el.addEventListener('pointerup', (e) => end(e, true));
    el.addEventListener('pointercancel', (e) => end(e, false));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // lines → px
      h.wake();
    }, { passive: false });
    el.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const fly = FLY[e.code];
      if (fly) { this.keys.add(fly); e.preventDefault(); h.wake(); return; }
      if (e.key === ']' || e.key === 'n') { h.cycle(1); e.preventDefault(); }
      else if (e.key === '[' || e.key === 'p') { h.cycle(-1); e.preventDefault(); }
      else if (e.key === 'Escape') { h.release(); e.preventDefault(); }
      else if (e.key === 'Home' || e.key === 'h') { h.home(); e.preventDefault(); }
      else return;
      h.wake();
    });
    el.addEventListener('keyup', (e) => { const fly = FLY[e.code]; if (fly) this.keys.delete(fly); });
    el.addEventListener('blur', () => this.keys.clear()); // a key released elsewhere must not stick
  }

  /** True while input is still arriving (held keys or a drag), so the loop keeps ticking. */
  busy(): boolean { return this.keys.size > 0 || this.press !== null; }

  /** The input since the last call, then reset. */
  take(): RigInput {
    const out: RigInput = { drag: this.drag, wheel: this.wheel, keys: new Set(this.keys) };
    this.drag = [0, 0];
    this.wheel = 0;
    return out;
  }
}
