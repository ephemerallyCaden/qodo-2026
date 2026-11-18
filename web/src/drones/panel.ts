// The selected drone's panel (#80 AC 8): crisp DOM outside the pixel pass, every string set with
// textContent and never parsed as HTML. Its rows show safe metadata only: no line, file or commit counts.
// Below them, the session's own files with their edit counts and its edit timeline (#148): AGENTS.md
// Rule 6's session-detail exception, one session only, never ranked or compared.
import type { DroneSession } from '../../../src/core/contract/drones.js';
import { UI_COLOURS } from '../ui/colours.js';
import { byId } from '../ui/dom.js';
import { detailGroups, otherLine, timelineCells, timelineText, type DetailState } from './detail.js';
import { droneRows, utc } from './select.js';

/**
 * The timeline's internal pixels: each slice a column `cell` wide with a `gap` after it, `rows` cells tall
 * above a 1 px rule. Each internal pixel is shown as `upscale` × the device pixel ratio, rounded to whole
 * device pixels.
 */
export const TIMELINE = { cell: 3, gap: 1, rows: 12, upscale: 2 } as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className !== undefined) e.className = className;
  return e;
};

/**
 * The edit timeline as a small canvas, upscaled nearest-neighbour by CSS (Rule 4), drawn once in palette
 * colours by role (Rule 5) and never animated. Its words are its accessible name.
 */
function timeline(buckets: readonly number[], text: string): HTMLCanvasElement {
  const { cell, gap, rows } = TIMELINE;
  const canvas = el('canvas', undefined, 'timeline');
  canvas.width = buckets.length * (cell + gap) - gap;
  canvas.height = rows + 1;
  const dpr = globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  const k = Math.max(1, Math.round(TIMELINE.upscale * dpr)); // device px per internal px: a whole number
  canvas.style.width = `${(canvas.width * k) / dpr}px`;
  canvas.style.height = `${(canvas.height * k) / dpr}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', text);
  const g = canvas.getContext('2d');
  if (!g) return canvas; // no 2D context: the words below still say it
  g.fillStyle = UI_COLOURS.space;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = UI_COLOURS.rule;
  g.fillRect(0, rows, canvas.width, 1);
  g.fillStyle = UI_COLOURS.ink;
  timelineCells(buckets, rows).forEach((h, i) => { if (h > 0) g.fillRect(i * (cell + gap), rows - h, cell, h); });
  return canvas;
}

/** The detail section's nodes for `state`. */
function detailNodes(state: DetailState): HTMLElement[] {
  if (state.kind === 'loading') return [el('p', 'loading files…', 'note')];
  if (state.kind !== 'ready') return [el('p', state.text, 'note')];
  const d = state.detail;
  const out: HTMLElement[] = [el('h3', 'files edited')];
  const groups = detailGroups(d.files);
  for (const g of groups) {
    out.push(el('p', g.folder, 'folder'));
    const list = el('ul');
    for (const f of g.files) {
      const li = el('li');
      li.append(el('span', f.name, 'name'), el('span', f.edits, 'n'));
      list.append(li);
    }
    out.push(list);
  }
  const other = otherLine(d);
  if (other !== null) out.push(el('p', other, 'note'));
  if (groups.length === 0 && other === null) out.push(el('p', 'no edits recorded', 'note'));
  const words = timelineText(d);
  const axis = el('p', undefined, 'axis');
  axis.append(el('span', utc(d.startedAt)), el('span', utc(d.endedAt)));
  const caption = el('p', words, 'note');
  caption.setAttribute('aria-hidden', 'true'); // the canvas's accessible name says it already
  out.push(el('h3', 'edits over time'), timeline(d.buckets, words), axis, caption);
  return out;
}

export class DronePanel {
  private readonly root = byId<HTMLElement>('drone-panel');
  /** The session-detail section of the panel on show; replaced on every show (#148). */
  private section: HTMLElement | null = null;
  /** Told when the user closes the panel (its button, or Escape inside it). */
  onClose: () => void = () => {};

  constructor() {
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.onClose();
    });
  }

  show(session: DroneSession, homeName: string, takeFocus = true): void {
    const title = el('h2', 'agent session');
    const close = el('button', 'close');
    close.type = 'button';
    close.addEventListener('click', () => this.onClose());
    const top = el('div', undefined, 'top');
    top.append(title, close);
    const list = el('dl');
    for (const [name, value] of droneRows(session, homeName)) list.append(el('dt', name), el('dd', value));
    this.section = el('section', undefined, 'detail');
    this.section.setAttribute('aria-live', 'polite');
    const hadFocus = this.root.contains(document.activeElement); // a refresh rebuilds the panel: the keyboard stays on its button
    this.root.replaceChildren(top, list, this.section);
    this.root.hidden = false;
    if (takeFocus || hadFocus) close.focus({ preventScroll: true });
  }

  /** The session's files and timeline, or why there are none (#148). Text only ever goes in through textContent. */
  showDetail(state: DetailState): void {
    this.section?.replaceChildren(...detailNodes(state));
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.section = null;
  }
}
