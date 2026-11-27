// The crew panel's DOM (#207 C5) against a small fake document, as the drone panel's test does: what it holds
// for each state, that the captain's says it's you, that text only goes in through textContent, and that Escape
// closes it. Vitest has no DOM, so the fake records what is built.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrewDetail, CrewView } from '../../../src/core/contract/crew.js';
import { CrewPanel } from '../../../web/src/crew/panel.js';
import { RESCAN_NOTE, TOUCH_NOTE } from '../../../web/src/crew/detail.js';

const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, '../../golden/crew.json'), 'utf8')) as { crew: CrewView; panels: CrewDetail[] };

/** Just enough of an element: children, text, class, attributes and its listeners. */
class FakeEl {
  children: FakeEl[] = [];
  textContent = '';
  className = '';
  hidden = true;
  type = '';
  focused = 0;
  readonly style: Record<string, string> = {};
  readonly on = new Map<string, ((e: { key: string; preventDefault(): void }) => void)[]>();
  constructor(readonly tag: string) {}
  append(...c: FakeEl[]) { this.children.push(...c); }
  replaceChildren(...c: FakeEl[]) { this.children = [...c]; }
  setAttribute() {}
  addEventListener(type: string, fn: (e: { key: string; preventDefault(): void }) => void) { this.on.set(type, [...(this.on.get(type) ?? []), fn]); }
  contains() { return false; }
  focus() { this.focused++; }
  getBoundingClientRect() { return { width: 300, height: 200 }; }
  all(): FakeEl[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return [this.textContent, ...this.children.map((c) => c.text())].filter(Boolean).join(' '); }
}

let root: FakeEl;
beforeEach(() => {
  root = new FakeEl('aside');
  vi.stubGlobal('document', { activeElement: null, getElementById: (id: string) => (id === 'crew-panel' ? root : null), createElement: (tag: string) => new FakeEl(tag) });
});
afterEach(() => { vi.unstubAllGlobals(); });

const panelOf = (name: string) => GOLDEN.panels.find((p) => p.displayName === name)!;
const memberOf = (d: CrewDetail) => GOLDEN.crew.members.find((m) => m.person === d.person)!;
const names: Record<string, string> = { d_b7c04fef35e2: 'ui', d_00178f31922e: 'docs', d_69c6fa4ac535: 'engine' };
const nameOf = (h: string) => names[h] ?? null;
const section = () => root.children.find((c) => c.className === 'detail')!;
const rows = () => root.children.find((c) => c.tag === 'dl')!.children.map((c) => c.textContent);

describe('the crew panel (#207 C5)', () => {
  it('opens with the close button focused, the name and role, and "loading" until the answer comes', () => {
    const d = panelOf('Bram Tiller');
    const p = new CrewPanel();
    p.show(memberOf(d));
    p.showDetail({ kind: 'loading' }, nameOf);
    expect(root.hidden).toBe(false);
    expect(root.children.map((c) => c.tag)).toEqual(['div', 'dl', 'section']);
    expect(root.children[0]!.text()).toBe('crew member close');
    expect(root.all().find((c) => c.tag === 'button')!.focused).toBe(1);
    expect(rows()).toEqual(['name', 'Bram Tiller', 'role', 'teammate', 'last active', '…']);
    expect(section().text()).toBe('loading planets and files…');
  });

  it('the captain\'s panel says it\'s you', () => {
    const d = GOLDEN.panels.find((x) => x.captain)!;
    const p = new CrewPanel();
    p.show(memberOf(d));
    p.showDetail({ kind: 'ready', detail: d }, nameOf);
    expect(root.children[0]!.text()).toBe('you, the captain close');
    expect(rows().slice(2, 4)).toEqual(['role', 'captain: you']);
  });

  it('lists the planets, then the files by folder, each with its touch count, and no total anywhere', () => {
    const d = panelOf('Esme Holt');
    const p = new CrewPanel();
    p.show(memberOf(d));
    p.showDetail({ kind: 'ready', detail: d }, nameOf);
    expect(rows()).toEqual(['name', 'Esme Holt', 'role', 'teammate', 'last active', '2026-10-09 10:00:00 UTC']);
    expect(section().children.map((c) => c.text())).toEqual([
      'planets touched', 'the star (root files) 1 touch docs 1 touch',
      'files touched', 'top level', 'README.md 1 touch', 'docs/', 'guide.md 1 touch',
      TOUCH_NOTE,
    ]);
  });

  it('shows "rescan" for an old snapshot, not an empty panel', () => {
    const d = panelOf('Bram Tiller');
    const p = new CrewPanel();
    p.show(memberOf(d));
    p.showDetail({ kind: 'note', text: RESCAN_NOTE }, nameOf);
    expect(section().text()).toBe(RESCAN_NOTE);
    expect(rows().slice(4)).toEqual(['last active', 'unknown']);
  });

  it('puts every string in through textContent: a hostile name stays text', () => {
    const d = panelOf('Bram Tiller');
    const p = new CrewPanel();
    p.show({ ...memberOf(d), displayName: '<img src=x onerror=alert(1)>' });
    expect(rows()[1]).toBe('<img src=x onerror=alert(1)>');
    expect(root.all().some((c) => c.tag === 'img')).toBe(false);
  });

  it('closes on Escape and on its button, and hides with nothing left behind', () => {
    const p = new CrewPanel();
    let closed = 0;
    p.onClose = () => { closed++; };
    p.show(memberOf(panelOf('Dax Imura')));
    root.on.get('keydown')![0]!({ key: 'Escape', preventDefault() {} });
    root.on.get('keydown')![0]!({ key: 'a', preventDefault() {} });
    expect(closed).toBe(1);
    p.hide();
    expect(root.hidden).toBe(true);
    expect(root.children).toEqual([]);
    expect(p.docked).toBeNull();
  });
});
