// The selected piece of debris's panel (R13): crisp DOM outside the pixel pass, every string set with textContent and
// never parsed as HTML. Its rows say what the stale item is (name, kind, age, last commit, who created it); below,
// the server's cleanup and inspect commands, each with a copy button. Commet never runs a command: a button only puts
// its text on the clipboard, and where the browser refuses, selects it so the user can copy it themselves.
import type { DebrisClass } from '../../../src/core/contract/debris.js';
import { DOCK_INSET, type Dock } from '../drones/dock.js';
import { CLASS_LABEL } from '../render/debris-kits.js';
import { byId } from '../ui/dom.js';
import { COPY_NOTE, debrisCommands, debrisRows, type DebrisDetailState } from './detail.js';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className !== undefined) e.className = className;
  return e;
};

/** How the copy went, for the controller to say. */
export type CopyResult = 'copied' | 'selected';

export class DebrisPanel {
  private readonly root = byId<HTMLElement>('debris-panel');
  private section: HTMLElement | null = null;
  /** The corner the panel is docked in and its top there, or null: just opened, at its home in style.css (the bottom left). */
  private at: { corner: Dock; top: number } | null = null;
  /** Told when the user closes the panel (its button, or Escape inside it). */
  onClose: () => void = () => {};
  /** Told how a copy went. */
  onCopy: (label: string, how: CopyResult) => void = () => {};

  constructor() {
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.onClose();
    });
  }

  get open(): boolean { return !this.root.hidden; }

  show(cls: DebrisClass, takeFocus = true): void {
    const close = el('button', 'close');
    close.type = 'button';
    close.addEventListener('click', () => this.onClose());
    const top = el('div', undefined, 'top');
    top.append(el('h2', `debris: ${CLASS_LABEL[cls]}`), close);
    // Not a live region: the controller says each answer in one line instead (as the drone and crew panels).
    this.section = el('section', undefined, 'detail');
    const hadFocus = this.root.contains(document.activeElement);
    this.root.replaceChildren(top, this.section);
    this.root.hidden = false;
    if (takeFocus || hadFocus) close.focus({ preventScroll: true });
  }

  /** The piece's rows and commands, or why there are none. Text only ever goes in through textContent. */
  showDetail(state: DebrisDetailState, nameOf: (home: string) => string | null): void {
    if (!this.section) return;
    if (state.kind === 'loading') { this.section.replaceChildren(el('p', 'loading…', 'note')); return; }
    if (state.kind !== 'ready') { this.section.replaceChildren(el('p', state.text, 'note')); return; }
    const d = state.detail;
    const rows = el('dl');
    rows.append(...debrisRows(d, nameOf).flatMap(([k, v]) => [el('dt', k), el('dd', v)]));
    const out: HTMLElement[] = [rows];
    if (d.warning !== null) out.push(el('p', d.warning, 'warning'));
    const commands = debrisCommands(d);
    if (commands.length === 0) out.push(el('p', 'no command is shown for it', 'note'));
    for (const c of commands) out.push(this.commandRow(c.label, c.command));
    if (commands.length > 0) out.push(el('p', COPY_NOTE, 'note'));
    this.section.replaceChildren(...out);
  }

  private commandRow(label: string, command: string): HTMLElement {
    const row = el('div', undefined, 'command');
    const code = el('code', command);
    const copy = el('button', 'copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', `copy the ${label} command`);
    copy.addEventListener('click', () => {
      const selectIt = () => {
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        this.onCopy(label, 'selected');
      };
      const clip = navigator.clipboard as Clipboard | undefined;
      if (!clip) { selectIt(); return; }
      clip.writeText(command).then(() => { copy.textContent = 'copied'; this.onCopy(label, 'copied'); }, selectIt);
    });
    row.append(el('span', label, 'label'), code, copy);
    return row;
  }

  get docked(): Dock | null { return this.at?.corner ?? null; }

  size(): { w: number; h: number } {
    const r = this.root.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** Docks the panel in a corner of the window (drones/dock.ts), at once, never animated. Touches the page only when it moves. */
  dock(corner: Dock, topLeft: number): void {
    const top = corner === 'top-left' ? topLeft : DOCK_INSET.top;
    if (this.at?.corner === corner && this.at.top === top) return;
    const left = corner.endsWith('left'), bottom = corner.startsWith('bottom');
    const s = this.root.style;
    s.left = left ? `${DOCK_INSET.side}px` : 'auto';
    s.right = left ? 'auto' : `${DOCK_INSET.side}px`;
    s.bottom = bottom ? `${DOCK_INSET.bottom}px` : 'auto';
    s.top = bottom ? 'auto' : `${top}px`;
    this.at = { corner, top };
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.section = null;
    for (const k of ['left', 'right', 'top', 'bottom'] as const) this.root.style[k] = '';
    this.at = null;
  }
}
