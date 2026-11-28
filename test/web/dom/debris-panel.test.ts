// The debris panel's DOM (R13) against a small fake document, as the crew panel's test does: what it holds for each
// state, that its copy buttons put the command on the clipboard (and select it where the browser refuses), never
// run anything, that text only goes in through textContent, and that Escape closes it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBRIS_WARNINGS, type DebrisDetail } from '../../../src/core/contract/debris.js';
import { COPY_NOTE } from '../../../web/src/debris/detail.js';
import { DebrisPanel } from '../../../web/src/debris/panel.js';

/** Just enough of an element: children, text, class, attributes and its listeners. */
class FakeEl {
  children: FakeEl[] = [];
  textContent = '';
  className = '';
  hidden = true;
  type = '';
  focused = 0;
  readonly attrs = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly on = new Map<string, ((e: { key: string; preventDefault(): void }) => void)[]>();
  constructor(readonly tag: string) {}
  append(...c: FakeEl[]) { this.children.push(...c); }
  replaceChildren(...c: FakeEl[]) { this.children = [...c]; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener(type: string, fn: (e: { key: string; preventDefault(): void }) => void) { this.on.set(type, [...(this.on.get(type) ?? []), fn]); }
  fire(type: string, key = '') { for (const fn of this.on.get(type) ?? []) fn({ key, preventDefault() {} }); }
  contains() { return false; }
  focus() { this.focused++; }
  getBoundingClientRect() { return { width: 300, height: 200 }; }
  all(): FakeEl[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return [this.textContent, ...this.children.map((c) => c.text())].filter(Boolean).join(' '); }
}

const HEAD = '1111111111111111111111111111111111111111';
const detail = (over: Partial<DebrisDetail> = {}): DebrisDetail => ({
  ok: true, schemaVersion: 'debris-detail.1', head: HEAD, id: 'x_05d1a7c3e902', cls: 'merged', name: 'feature/<b>done</b>', remoteOnly: false, ageDays: 12,
  lastCommit: { sha: 'abcdef1234567890abcdef1234567890abcdef12', short: 'abcdef1', subject: 'finish it', date: '2026-11-01T10:00:00Z' },
  aheadCount: 0, lines: 0, creator: { displayName: 'Ada Quill', captain: false, agent: false }, sessions: [], planets: ['d_00000000000a'], home: 'd_00000000000a',
  filesOutside: 0, worktree: null, rebased: false, cleanup: "git branch -d -- 'feature/<b>done</b>'", inspect: null, warning: null, ...over,
});

let root: FakeEl, selected: unknown[], writes: string[], refuse: boolean;
beforeEach(() => {
  root = new FakeEl('aside');
  selected = []; writes = []; refuse = false;
  vi.stubGlobal('document', { activeElement: null, getElementById: (id: string) => (id === 'debris-panel' ? root : null), createElement: (tag: string) => new FakeEl(tag), createRange: () => ({ selectNodeContents: (n: unknown) => selected.push(n) }) });
  vi.stubGlobal('getSelection', () => ({ removeAllRanges() {}, addRange() {} }));
  vi.stubGlobal('navigator', { clipboard: { writeText: (t: string) => (refuse ? Promise.reject(new Error('no')) : (writes.push(t), Promise.resolve())) } });
});
afterEach(() => { vi.unstubAllGlobals(); });

const section = () => root.children.find((c) => c.className === 'detail')!;
const buttons = () => root.all().filter((c) => c.tag === 'button');

describe('the debris panel (R13)', () => {
  it('opens with the close button focused, its kind in the title, and "loading" until the answer comes', () => {
    const p = new DebrisPanel();
    p.show('merged');
    p.showDetail({ kind: 'loading' }, () => null);
    expect(root.hidden).toBe(false);
    expect(root.children[0]!.text()).toBe('debris: merged, not deleted close');
    expect(buttons()[0]!.focused).toBe(1);
    expect(section().text()).toBe('loading…');
  });

  it('shows the rows, the warning and each command as plain text, with a copy button that only copies', async () => {
    const p = new DebrisPanel();
    const copies: string[] = [];
    p.onCopy = (label, how) => copies.push(`${label}: ${how}`);
    p.show('merged');
    p.showDetail({ kind: 'ready', detail: detail({ inspect: "git log --oneline HEAD..'refs/heads/x' --", warning: DEBRIS_WARNINGS.rebased }) }, () => 'src');
    const text = section().text();
    expect(text).toContain('feature/<b>done</b>'); // set as text, never parsed as HTML
    expect(text).toContain(DEBRIS_WARNINGS.rebased);
    expect(text).toContain(COPY_NOTE);
    const codes = section().all().filter((c) => c.tag === 'code').map((c) => c.textContent);
    expect(codes).toEqual(["git branch -d -- 'feature/<b>done</b>'", "git log --oneline HEAD..'refs/heads/x' --"]);
    const copy = buttons().filter((b) => b.textContent === 'copy');
    expect(copy.map((b) => b.attrs.get('aria-label'))).toEqual(['copy the clean up command', 'copy the inspect first command']);
    copy[0]!.fire('click');
    await Promise.resolve();
    expect(writes).toEqual(["git branch -d -- 'feature/<b>done</b>'"]);
    expect(copies).toEqual(['clean up: copied']);
    expect(copy[0]!.textContent).toBe('copied');
    refuse = true;
    copy[1]!.fire('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(selected).toHaveLength(1); // the browser refused: the command is selected for the user to copy
    expect(copies.at(-1)).toBe('inspect first: selected');
  });

  it('says why when there is nothing to show, and that no command is shown when the server sends none', () => {
    const p = new DebrisPanel();
    p.show('branch');
    p.showDetail({ kind: 'note', text: 'the scan has no such piece any more' }, () => null);
    expect(section().text()).toBe('the scan has no such piece any more');
    p.showDetail({ kind: 'ready', detail: detail({ cleanup: null, inspect: null, warning: DEBRIS_WARNINGS.hiddenCharacters }) }, () => null);
    expect(section().text()).toContain('no command is shown for it');
    expect(section().all().some((c) => c.tag === 'code')).toBe(false);
  });

  it('closes on Escape, and hides empty', () => {
    const p = new DebrisPanel();
    let closed = 0;
    p.onClose = () => closed++;
    p.show('agent');
    root.fire('keydown', 'Escape');
    expect(closed).toBe(1);
    p.hide();
    expect([root.hidden, root.children.length]).toEqual([true, 0]);
  });
});
