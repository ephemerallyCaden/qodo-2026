// The selected drone's panel (#80 AC 8): crisp DOM outside the pixel pass, every string set with
// textContent and never parsed as HTML. It shows safe metadata only: no line, file or commit counts
// (AGENTS.md Rule 6: a session is never scored or ranked).
import type { DroneSession } from '../../../src/core/contract/drones.js';
import { byId } from '../ui/dom.js';
import { droneRows } from './select.js';

export class DronePanel {
  private readonly root = byId<HTMLElement>('drone-panel');
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
    const title = document.createElement('h2');
    title.textContent = 'agent session';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'close';
    close.addEventListener('click', () => this.onClose());
    const top = document.createElement('div');
    top.className = 'top';
    top.append(title, close);
    const list = document.createElement('dl');
    for (const [name, value] of droneRows(session, homeName)) {
      const dt = document.createElement('dt');
      dt.textContent = name;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    }
    const hadFocus = this.root.contains(document.activeElement); // a refresh rebuilds the panel: the keyboard stays on its button
    this.root.replaceChildren(top, list);
    this.root.hidden = false;
    if (takeFocus || hadFocus) close.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }
}
