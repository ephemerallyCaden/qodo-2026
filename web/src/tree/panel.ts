// The directory view (#209, understanding mode U10): a 2D file tree of the snapshot beside the map, for
// people who'd rather browse folders than planets. Each file says whether it's fogged or clear and each
// folder the charted share of its files, from today's fog (#74; haze comes with #201). Opening a row (a
// click, or Enter) focuses it on the map: a file's planet turned to its settlement, a folder's planet or
// continent, else the star. A WAI-ARIA tree (arrows move, Right and Left open and close folders, Home and
// End, Enter opens, Escape closes), crisp DOM outside the pixel pass, text only through textContent and
// nothing animated: under reduced motion there is nothing here to stop, and the map's focus cuts. A big
// folder shows its rows a page at a time, then a row that says how many more there are and shows them.
import type { FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import { ViewError, type DataClient } from '../data/client.js';
import { textCanvas } from '../labels/overlay.js';
import { fogLine } from '../model/describe.js';
import { UI_COLOURS } from '../ui/colours.js';
import { byId } from '../ui/dom.js';
import { buildTree, openText, parentPath, rowLabel, rowTag, treeFog, visibleRows, type Place, type Row, type TreeDir, type TreeFog, type TreeMore, type TreeSource } from './model.js';

export interface TreeHost {
  client: Pick<DataClient, 'files'>;
  /** Focuses a place on the map; `said` is what to announce once it has. */
  open(place: Place, said: string): void;
  /** Polite screen-reader announcement. */
  announce(text: string): void;
  /** Hands keyboard focus back to the 3D view. */
  release(): void;
}

const say = (e: unknown) => (e instanceof ViewError ? e.title : 'something went wrong');
const short = (head: string) => head.slice(0, 7);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className !== undefined) e.className = className;
  return e;
};

export class TreePanel {
  private readonly root = byId<HTMLElement>('tree');
  private readonly toggle = byId<HTMLButtonElement>('tree-toggle');
  private readonly toggleName = el('span', 'directory view', 'sr');
  private readonly closeButton = el('button', 'close');
  private readonly note = el('p', '', 'note');
  private readonly list = el('div', undefined, 'rows');
  private layout: LayoutV1 | null = null;
  private fog: FogView | null = null;
  /** The file list of the layout's scan, once fetched; null until then, or when it's of another scan. */
  private source: TreeSource | null = null;
  private tree: TreeDir | null = null;
  private rows: Row[] = [];
  private rowEls: HTMLElement[] = [];
  /** Expanded folders, how many children each big one shows (TREE_PAGE more per "more" row opened) and the row with the keyboard (by path): they survive reloads and fog changes. */
  private readonly expanded = new Set<string>();
  private readonly shown = new Map<string, number>();
  private activePath: string | null = null;
  /** Why there is no tree to show: loading, a failure, a list of another scan. */
  private loadNote = '';
  /** Bumped by every fetch, so an older answer is dropped. */
  private gen = 0;
  /** Opened before its rows existed: the keyboard moves into them when they arrive. */
  private enterRows = false;

  constructor(private readonly host: TreeHost) {
    this.toggle.type = 'button';
    this.toggle.setAttribute('aria-controls', 'tree');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.replaceChildren(this.toggleName);
    this.toggle.addEventListener('click', () => (this.isOpen ? this.close(false) : this.open()));
    this.closeButton.type = 'button';
    this.closeButton.addEventListener('click', () => this.close(true));
    const top = el('div', undefined, 'top');
    top.append(el('h2', 'files'), this.closeButton);
    this.list.setAttribute('role', 'tree');
    this.list.setAttribute('aria-label', 'folders and files, with their fog');
    this.list.addEventListener('keydown', (e) => this.key(e));
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.close(true);
    });
    this.root.replaceChildren(top, this.note, this.list);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  /** The toggle's bitmap text at the label scale (device px per font px), as the HUD's. */
  scale(px: number, dpr: number): void {
    const art = textCanvas('files', px, dpr, UI_COLOURS.ink);
    art.className = 'bitmap';
    this.toggle.replaceChildren(art, this.toggleName);
  }

  /** The layout drawn. A layout of another scan needs that scan's file list, fetched while the tree is open. */
  setLayout(layout: LayoutV1): void {
    this.layout = layout;
    if (this.source && this.source.head !== layout.source.head) this.source = null;
    this.tree = this.source ? buildTree(this.source, layout) : null;
    if (!this.isOpen) return;
    this.render();
    void this.load();
  }

  /** Every fog the view takes (View.onFog): null when there's none usable, so every file shows fogged (Rule 1). */
  setFog(fog: FogView | null): void {
    this.fog = fog;
    this.render();
  }

  open(): void {
    this.root.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.render();
    void this.load();
    const row = this.rowEls[this.activeIndex()];
    // No rows yet: the close button holds the keyboard until they come (render moves it into them)
    this.enterRows = !row;
    (row ?? this.closeButton).focus({ preventScroll: true });
  }

  /** Closes the tree; `release` hands the keyboard back to the map (Escape, the close button). */
  close(release: boolean): void {
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    if (release) this.host.release();
  }

  private async load(): Promise<void> {
    const layout = this.layout;
    if (!layout || !this.isOpen || this.source?.head === layout.source.head) return;
    const gen = ++this.gen;
    this.loadNote = 'loading the file list…';
    this.render();
    let got: TreeSource;
    try {
      got = await this.host.client.files();
    } catch (e) {
      if (gen !== this.gen) return;
      this.loadNote = `file list unavailable: ${say(e)}`;
      this.host.announce(this.loadNote);
      this.render();
      return;
    }
    if (gen !== this.gen) return; // a newer layout asked again
    if (got.head !== layout.source.head) {
      // a scan landed between the layout and this fetch: its paths aren't this map's (#64); the next layout asks again
      this.loadNote = `file list not shown: it is of ${short(got.head)} but the map of ${short(layout.source.head)} (different scans); waiting for the next update`;
      this.host.announce(this.loadNote);
      this.render();
      return;
    }
    this.loadNote = '';
    this.source = got;
    this.tree = buildTree(got, layout);
    this.render();
  }

  /** The fog the rows show: the view's, when it is of the file list's scan; otherwise none (Rule 1). */
  private rowFog(t: TreeDir): TreeFog {
    return treeFog(t, this.fog && this.fog.head === this.source?.head ? this.fog : null);
  }

  /** The row the keyboard is on: the active path's, else its nearest shown folder, else the first. */
  private activeIndex(): number {
    for (let p = this.activePath; p !== null && p !== ''; p = parentPath(p)) {
      const i = this.rows.findIndex((r) => r.node.path === p);
      if (i >= 0) return i;
    }
    return 0;
  }

  /** The line above the rows: why there are none, else the repo's fog in the info panel's words. */
  private noteText(fog: TreeFog | null): string {
    if (this.loadNote) return this.loadNote;
    if (!this.layout) return 'waiting for the map…';
    if (!fog) return '';
    const usable = this.fog !== null && this.fog.head === this.source?.head;
    return fogLine(usable ? { fogged: fog.all.total - fog.all.clear, total: fog.all.total } : null);
  }

  private render(): void {
    if (!this.isOpen) return;
    const t = this.tree;
    const fog = t ? this.rowFog(t) : null;
    this.note.textContent = this.noteText(fog);
    const hadFocus = this.rowEls.some((r) => r === document.activeElement)
      || (this.enterRows && document.activeElement === this.closeButton); // opened while loading, and the user hasn't moved on
    this.rows = t ? visibleRows(t, this.expanded, this.shown) : [];
    const active = this.activeIndex();
    this.activePath = this.rows[active]?.node.path ?? this.activePath;
    this.rowEls = fog ? this.rows.map((r, i) => this.rowEl(r, i, i === active, fog)) : [];
    this.list.replaceChildren(...this.rowEls);
    if (this.rows.length === 0 && t) this.list.append(el('p', 'no files', 'note'));
    if (this.rowEls.length > 0) this.enterRows = false;
    if (!hadFocus) return;
    const row = this.rowEls[active];
    // No rows now (a rescan's list is loading, or failed): the close button holds the keyboard until they come (Qodo 489fb0a7)
    if (!row) this.enterRows = true;
    (row ?? this.closeButton).focus({ preventScroll: true });
  }

  private rowEl(r: Row, i: number, active: boolean, fog: TreeFog): HTMLElement {
    const n = r.node;
    const open = n.kind === 'dir' && this.expanded.has(n.path);
    const row = el('div', undefined, n.kind === 'file' ? `row file ${fog.fogged(n) ? 'fogged' : 'clear'}` : `row ${n.kind}`);
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(r.level));
    row.setAttribute('aria-setsize', String(r.setsize));
    row.setAttribute('aria-posinset', String(r.posinset));
    row.setAttribute('aria-label', rowLabel(n, fog));
    if (n.kind === 'dir') row.setAttribute('aria-expanded', String(open));
    if (active) row.setAttribute('aria-selected', 'true');
    row.tabIndex = active ? 0 : -1;
    row.style.paddingLeft = `${(r.level - 1) * 2}ch`;
    const twisty = el('span', n.kind === 'dir' ? (open ? '▾' : '▸') : ' ', 'twisty');
    twisty.setAttribute('aria-hidden', 'true');
    const name = el('span', n.kind === 'dir' ? `${n.name}/` : n.name, 'name');
    const tag = el('span', rowTag(n, fog), 'tag');
    for (const part of [name, tag]) part.setAttribute('aria-hidden', 'true'); // the row's label says them
    row.append(twisty, name, tag);
    // The folder's arrow only opens or closes it; the rest of a row opens it on the map.
    if (n.kind === 'dir') twisty.addEventListener('click', (e) => { e.stopPropagation(); this.moveTo(i, false); this.setExpanded(n.path, !open); });
    row.addEventListener('click', () => this.openRow(i));
    row.addEventListener('focus', () => this.moveTo(i, false));
    return row;
  }

  /** Moves the keyboard's row to `i` (roving tabindex); `focus` also moves the page's focus there. */
  private moveTo(i: number, focus: boolean): void {
    const next = this.rowEls[i], r = this.rows[i];
    if (!next || !r) return;
    const prev = this.rowEls[this.activeIndex()];
    if (prev && prev !== next) { prev.tabIndex = -1; prev.removeAttribute('aria-selected'); }
    this.activePath = r.node.path;
    next.tabIndex = 0;
    next.setAttribute('aria-selected', 'true');
    if (focus) next.focus(); // instant scroll into view: nothing glides, under reduced motion or not
  }

  private setExpanded(path: string, on: boolean): void {
    if (on) this.expanded.add(path);
    else this.expanded.delete(path);
    this.render();
  }

  /** Opens row `i` on the map; a closed folder opens in the tree too. */
  private openRow(i: number): void {
    const r = this.rows[i], t = this.tree, layout = this.layout;
    if (!r || !t || !layout) return;
    this.moveTo(i, false);
    const n = r.node;
    if (n.kind === 'more') { this.showMore(n); return; }
    const said = openText(n, this.rowFog(t), layout);
    if (n.kind === 'dir' && !this.expanded.has(n.path)) this.setExpanded(n.path, true);
    this.host.open(n.place, said);
  }

  /** Opens a "more" row: its folder shows its next children, and the keyboard moves to the first of them, in the row's place. */
  private showMore(more: TreeMore): void {
    const upTo = more.dir.children.length - more.hidden;
    this.shown.set(more.dir.path, upTo + more.next);
    this.activePath = more.dir.children[upTo]!.path;
    this.render();
  }

  private key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const i = this.activeIndex(), r = this.rows[i];
    if (!r) return;
    const n = r.node;
    switch (e.key) {
      case 'ArrowDown': this.moveTo(Math.min(i + 1, this.rows.length - 1), true); break;
      case 'ArrowUp': this.moveTo(Math.max(i - 1, 0), true); break;
      case 'Home': this.moveTo(0, true); break;
      case 'End': this.moveTo(this.rows.length - 1, true); break;
      case 'ArrowRight':
        if (n.kind === 'dir' && !this.expanded.has(n.path)) this.setExpanded(n.path, true);
        else if (this.rows[i + 1]?.parent === i) this.moveTo(i + 1, true);
        break;
      case 'ArrowLeft':
        if (n.kind === 'dir' && this.expanded.has(n.path)) this.setExpanded(n.path, false);
        else if (r.parent >= 0) this.moveTo(r.parent, true);
        break;
      case 'Enter': this.openRow(i); break;
      default: return;
    }
    e.preventDefault();
  }
}
