// The selected crew member's panel (#207 C5): crisp DOM outside the pixel pass, every string set with
// textContent and never parsed as HTML. Its rows say who they are, their role (the captain's says it's you)
// and when they were last active; below, the planets and files they touched in the scan window with a touch
// count each: AGENTS.md Rule 6's astronaut-panel exception, one person only, never ranked, compared or totalled.
import type { CrewMember } from '../../../src/core/contract/crew.js';
import { byId } from '../ui/dom.js';
import { DOCK_INSET, type Dock } from '../drones/dock.js';
import { bodyRows, crewFileGroups, crewRows, otherCrewLine, TOUCH_NOTE, type CrewDetailState } from './detail.js';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className !== undefined) e.className = className;
  return e;
};

const list = (rows: readonly { name: string; touches: string }[]): HTMLUListElement => {
  const ul = el('ul');
  for (const r of rows) {
    const li = el('li');
    li.append(el('span', r.name, 'name'), el('span', r.touches, 'n'));
    ul.append(li);
  }
  return ul;
};

/** The detail section's nodes for `state`; `nameOf` names a planet of the map drawn. */
function detailNodes(state: CrewDetailState, nameOf: (home: string) => string | null): HTMLElement[] {
  if (state.kind === 'loading') return [el('p', 'loading planets and files…', 'note')];
  if (state.kind !== 'ready') return [el('p', state.text, 'note')];
  const d = state.detail;
  const out: HTMLElement[] = [];
  const bodies = bodyRows(d, nameOf);
  if (bodies.length > 0) out.push(el('h3', 'planets touched'), list(bodies));
  const groups = crewFileGroups(d.files);
  if (groups.length > 0) out.push(el('h3', 'files touched'));
  for (const g of groups) out.push(el('p', g.folder, 'folder'), list(g.files.map((f) => ({ name: f.name, touches: f.edits }))));
  const other = otherCrewLine(d);
  if (other !== null) out.push(el('p', other, 'note'));
  if (bodies.length === 0 && groups.length === 0 && other === null) out.push(el('p', 'no files touched in the scan window', 'note'));
  else out.push(el('p', TOUCH_NOTE, 'note'));
  return out;
}

export class CrewPanel {
  private readonly root = byId<HTMLElement>('crew-panel');
  private section: HTMLElement | null = null;
  private rows: HTMLDListElement | null = null;
  private member: CrewMember | null = null;
  /** The corner the panel is docked in and its top there, or null: just opened, at its home in style.css (the bottom left). */
  private at: { corner: Dock; top: number } | null = null;
  /** Told when the user closes the panel (its button, or Escape inside it). */
  onClose: () => void = () => {};

  constructor() {
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.onClose();
    });
  }

  get open(): boolean { return !this.root.hidden; }

  show(m: CrewMember, takeFocus = true): void {
    this.member = m;
    const title = el('h2', m.captain ? 'you, the captain' : 'crew member');
    const close = el('button', 'close');
    close.type = 'button';
    close.addEventListener('click', () => this.onClose());
    const top = el('div', undefined, 'top');
    top.append(title, close);
    this.rows = el('dl');
    this.fillRows(null);
    // Not a live region: replacing it would make a screen reader re-read the whole list; the controller
    // says each answer in one line instead (as the drone panel, Qodo PR #167 ef145633).
    this.section = el('section', undefined, 'detail');
    const hadFocus = this.root.contains(document.activeElement);
    this.root.replaceChildren(top, this.rows, this.section);
    this.root.hidden = false;
    if (takeFocus || hadFocus) close.focus({ preventScroll: true });
  }

  /** The member's planets and files, or why there are none. Text only ever goes in through textContent. */
  showDetail(state: CrewDetailState, nameOf: (home: string) => string | null): void {
    this.fillRows(state.kind === 'ready' ? state.detail : null, state.kind === 'note');
    this.section?.replaceChildren(...detailNodes(state, nameOf));
  }

  private fillRows(detail: Parameters<typeof crewRows>[1], none = false): void {
    if (!this.rows || !this.member) return;
    const rows = crewRows(this.member, detail).map(([k, v]): [string, string] => (k === 'last active' && none ? [k, 'unknown'] : [k, v]));
    this.rows.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', k), el('dd', v)]));
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
    this.rows = null;
    this.member = null;
    for (const k of ['left', 'right', 'top', 'bottom'] as const) this.root.style[k] = '';
    this.at = null;
  }
}
