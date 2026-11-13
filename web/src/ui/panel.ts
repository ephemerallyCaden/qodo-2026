// The review panel (#75, R5): the unseen files of the focused planet (or of the star when none is
// focused), a file's unseen diff, and Chart, plus the first-run baseline. Crisp UI outside the pixel
// pass: titles and buttons in the bitmap font with their names in DOM text, diff lines and notes in
// plain monospace in palette colours (principle 4). Text only ever goes in through textContent. A
// diff lives in memory while it's shown, and nowhere else (Rule 2).
import type { DiffView, UnseenFile } from '../../../src/core/contract/api.js';
import type { ChartAction, FogView } from '../../../src/core/contract/fog.js';
import type { DirId } from '../../../src/core/snapshot/types.js';
import { ViewError, type DataClient } from '../data/client.js';
import { textCanvas } from '../labels/overlay.js';
import { baselineState, diffFreshness, diffNotes, fogKey, gitDiffCommand, lineKind, sectionTitle, shortSha } from '../model/review.js';
import { UI_COLOURS } from './colours.js';
import { byId } from './dom.js';

export interface PanelHost {
  client: Pick<DataClient, 'fog' | 'unseen' | 'diff' | 'chart'>;
  /** The view's fog entry point (View.fogTicket / applyFog): a ticket before each fog-carrying request. */
  fogTicket(): number;
  applyFog(fog: FogView, ticket: number): boolean;
  /** Polite screen-reader announcement. */
  announce(text: string): void;
  /** Hands keyboard focus back to the 3D view. */
  release(): void;
}

const STAR_NAME = 'the star: root files and unmatched tests';
/** Files listed at once; more on request, so a first run's thousands of fogged files stay cheap. The count is always shown (Rule 1). */
const LIST_PAGE = 200;
const say = (e: unknown) => (e instanceof ViewError ? e.title : 'something went wrong');

/** An open diff: what it was opened from, the answer, and its lines, built once (they never depend on the text scale). */
interface OpenDiff { file: UnseenFile; view: DiffView; pre: HTMLPreElement }

export class Panel {
  private readonly root = byId<HTMLElement>('panel');
  private px = 2;
  private dpr = 1;
  private fog: FogView | null = null;
  /** fogKey of `fog`: the fog event that follows the panel's own write repeats it, and changes nothing. */
  private fogSeen = '';
  private home: { id: DirId | null; name: string } = { id: null, name: STAR_NAME };
  private files: UnseenFile[] = [];
  private shown = LIST_PAGE;
  /** The list is behind an open diff and the fog changed: reload it on the way back. */
  private listStale = false;
  private open: OpenDiff | null = null;
  private note = '';
  private busy = false;
  /** The baseline offer was turned down: not offered again this launch (Rule 6: no nagging). */
  private dismissed = false;
  /** Closed by the user until the next selection. */
  private closed = false;
  /** The view was given no usable fog (null): said so, never drawn as clear. */
  private unavailable = false;
  /** Request generations: an answer for a selection or fog that has since changed is dropped. */
  private listGen = 0;
  private diffGen = 0;

  constructor(private readonly host: PanelHost) {
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (this.open) this.back();
      else this.close();
    });
  }

  /** The bitmap text scale (device px per font px), as the HUD's. */
  scale(px: number, dpr: number): void {
    if (px === this.px && dpr === this.dpr) return;
    this.px = px;
    this.dpr = dpr;
    this.render();
  }

  /** Every fog the view takes. The list follows it; an open diff is checked against it. */
  setFog(fog: FogView | null): void {
    const key = fog === null ? '' : fogKey(fog);
    if (fog !== null && this.fog !== null && key === this.fogSeen) return;
    this.fog = fog;
    this.fogSeen = key;
    // No usable fog view: nothing can be listed or charted, and nothing is shown as clear (Rule 1).
    this.unavailable = fog === null;
    if (fog === null) {
      this.open = null;
      this.diffGen++; // a diff still loading must not reopen when a usable fog returns (PR #108 r1 #6)
    }
    if (this.open && fog && diffFreshness(this.open.view, fog) === 'stale') this.note = 'This file\'s unseen range changed, so this diff is out of date. Reload it to chart.';
    if (this.open) this.listStale = true;
    else void this.loadList();
    this.render();
  }

  /** The focused planet changed (null: free flight, the star's files). */
  select(id: DirId | null, name: string | null): void {
    const title = id === null ? STAR_NAME : name ?? id;
    if (id === this.home.id && !this.closed) {
      // The same planet after a reload: its path may have changed under its id (PR #108 r1 #9).
      if (title !== this.home.name) { this.home = { id, name: title }; this.render(); }
      return;
    }
    this.home = { id, name: title };
    this.open = null;
    // A diff still loading for the old selection must not open under the new one (Qodo local r1 #2).
    this.diffGen++;
    this.closed = false;
    this.note = '';
    this.files = [];
    this.shown = LIST_PAGE;
    void this.loadList();
    this.render();
  }

  private close(): void {
    this.closed = true;
    this.render();
    this.host.release();
  }

  private back(): void {
    this.open = null;
    this.note = '';
    this.diffGen++;
    if (this.listStale) void this.loadList();
    this.render();
  }

  /** A fresh fog after a 409: the server's head moved past the one this view showed. */
  private async refetchFog(): Promise<FogView | null> {
    try {
      const ticket = this.host.fogTicket();
      const fog = await this.host.client.fog();
      this.host.applyFog(fog, ticket);
      return fog;
    } catch (e) {
      this.note = say(e);
      this.render();
      return null;
    }
  }

  private async loadList(retry = true): Promise<void> {
    const fog = this.fog;
    if (!fog || this.closed) return;
    this.listStale = false;
    const gen = ++this.listGen;
    try {
      const r = await this.host.client.unseen(this.home.id, fog.head);
      if (gen !== this.listGen) return;
      if (r.ok) this.files = r.files;
      else if (r.head !== undefined) {
        if (retry) await this.refetchFog();
        return;
      } else {
        this.files = [];
        this.note = 'This planet is no longer in the layout.';
      }
    } catch (e) {
      if (gen === this.listGen) this.note = say(e);
    }
    if (!this.open) this.render();
  }

  private async openDiff(file: UnseenFile, retry = true): Promise<void> {
    const fog = this.fog;
    if (!fog) return;
    const gen = ++this.diffGen;
    this.note = `loading the diff of ${file.path}…`;
    this.render();
    try {
      const r = await this.host.client.diff(file.fileId, fog.head);
      if (gen !== this.diffGen) return;
      if (r.ok) {
        this.open = { file, view: r, pre: this.lines(r, file.path) };
        this.note = '';
        this.render('chart');
        this.host.announce(`showing the unseen diff of ${file.path}`);
        return;
      }
      if (r.head !== undefined) {
        this.note = 'The repository moved on; reloading.';
        const next = await this.refetchFog();
        if (next && retry && gen === this.diffGen) return this.openDiff(file, false);
        return;
      }
      this.note = `${file.path} is no longer in the repository at this head.`;
    } catch (e) {
      if (gen === this.diffGen) this.note = say(e);
    }
    this.render();
  }

  /**
   * One chart write, recorded at the head the user saw (#58). `ok` runs before the new fog is taken.
   * Buttons stay enabled meanwhile (a second press is ignored), so keyboard focus stays put.
   */
  private async write(action: ChartAction, done: string, ok: () => void = () => {}): Promise<'ok' | 'unknown-head' | 'failed'> {
    if (this.busy) return 'failed';
    this.busy = true;
    this.root.setAttribute('aria-busy', 'true');
    try {
      const ticket = this.host.fogTicket();
      const r = await this.host.client.chart(action);
      if (r.ok) {
        this.note = '';
        ok();
        // A newer fog won the ticket race but may predate this write: read the current one (PR #108 r1 #2).
        if (!this.host.applyFog(r.fog, ticket)) await this.refetchFog();
        this.host.announce(done);
        return 'ok';
      }
      if (r.head !== undefined) {
        this.note = 'Nothing was charted: the repository moved past the head you were looking at. The view reloaded; look again.';
        await this.refetchFog();
        return 'unknown-head';
      }
      this.note = `Nothing was charted: ${r.error}.`;
    } catch (e) {
      this.note = `Nothing was charted: ${say(e)}`;
    } finally {
      this.busy = false;
      this.root.setAttribute('aria-busy', 'false');
    }
    return 'failed';
  }

  private async chart(): Promise<void> {
    const o = this.open;
    if (!o || !this.fog || diffFreshness(o.view, this.fog) === 'stale') return;
    // Only this diff closes: the user may have opened another while the write was out (PR #108 r1 #5).
    let closed = false;
    const close = () => { if (this.open === o) { this.open = null; closed = true; } };
    const r = await this.write({ kind: 'chart', fileId: o.view.fileId, at: o.view.at }, `charted ${o.file.path}`, () => {
      close();
      this.files = this.files.filter((f) => f.fileId !== o.view.fileId);
    });
    if (r === 'unknown-head') close();
    // The local filter is only for the moment between: the list is reloaded from the server, so a file
    // still unseen (a newer fog won the ticket race, or newer work arrived) comes back (Qodo local r1 #1).
    if (r === 'ok') void this.loadList();
    // Focus follows only when this diff closed; otherwise it stays where the user moved it.
    this.render(closed ? 'list' : undefined);
  }

  // ---- DOM ----

  private bitmap(text: string, colour: string = UI_COLOURS.ink): HTMLCanvasElement {
    return textCanvas(text, this.px, this.dpr, colour);
  }

  /** `el` with `text` drawn in the bitmap font, and `name` as its DOM text for assistive tech. */
  private labelled<T extends HTMLElement>(el: T, text: string, name: string, colour: string = UI_COLOURS.ink): T {
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = name;
    el.append(this.bitmap(text, colour), sr);
    return el;
  }

  /** A native button whose visible text is the bitmap font and whose accessible name is `name`. */
  private button(key: string, label: string, name: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const b = this.labelled(document.createElement('button'), label, name, disabled ? UI_COLOURS.dim : UI_COLOURS.ink);
    b.type = 'button';
    b.dataset['key'] = key;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  private heading(text: string, level: 'h2' | 'h3'): HTMLElement {
    return this.labelled(document.createElement(level), text, text);
  }

  private text(text: string, cls = 'note'): HTMLParagraphElement {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    return p;
  }

  private baselineBox(fog: FogView): HTMLElement | null {
    const state = baselineState(fog, this.dismissed);
    if (state === null) return null;
    const box = document.createElement('div');
    box.className = 'baseline';
    const head = shortSha(fog.head);
    if (state === 'offer') {
      box.append(this.text(`Nothing is charted yet, so everything agents, teammates or unknown authors changed is fogged. You can chart everything up to ${head} as your baseline, and undo it later.`),
        this.button('baseline', `chart everything up to ${head} as my baseline`, `Chart everything up to ${head} as my baseline`,
          () => void this.write({ kind: 'baseline', at: fog.head }, `baseline set at ${head}`).then(() => this.render('undo'))),
        this.button('dismiss', 'not now', 'Not now: keep everything fogged', () => { this.dismissed = true; this.render(); }));
    } else {
      const at = shortSha(fog.baseline!);
      box.append(this.bitmap(`baseline at ${at}`, UI_COLOURS.dim),
        this.button('undo', 'undo baseline', `Undo the baseline at ${at}`,
          () => void this.write({ kind: 'baseline-undo', at: fog.head }, 'baseline undone').then(() => this.render('baseline'))));
    }
    return box;
  }

  private listBox(): HTMLElement {
    const box = document.createElement('div');
    const n = this.files.length;
    box.append(this.bitmap(n === 0 ? 'nothing unseen here' : `${n} unseen ${n === 1 ? 'file' : 'files'}`, UI_COLOURS.dim));
    const ul = document.createElement('ul');
    for (const f of this.files.slice(0, this.shown)) {
      const li = document.createElement('li');
      li.append(this.button(`file:${f.fileId}`, f.path, `${f.path}, unseen since ${shortSha(f.since)}: ${f.reasons.join(', ')}. Show its diff.`,
        () => void this.openDiff(f)), this.text(f.reasons.join(' · '), 'note dim'));
      ul.append(li);
    }
    box.append(ul);
    const more = n - this.shown;
    if (more > 0) {
      box.append(this.button('more', `show ${Math.min(more, LIST_PAGE)} more (${more} not listed)`, `Show more unseen files: ${more} not listed yet`,
        () => { this.shown += LIST_PAGE; this.render('more'); }));
    }
    return box;
  }

  /** The diff's lines, monospace in palette colours, as text nodes only. */
  private lines(v: DiffView, path: string): HTMLPreElement {
    const pre = document.createElement('pre');
    pre.className = 'diff';
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', `unseen diff of ${path}`);
    const span = (text: string, cls: string) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = `${text}\n`;
      pre.append(s);
    };
    for (const s of v.sections) {
      span(sectionTitle(s), 'sec');
      for (const h of s.hunks) {
        span(h.header, 'meta');
        for (const l of h.lines) span(l, lineKind(l));
      }
    }
    return pre;
  }

  private diffBox(o: OpenDiff, fog: FogView): HTMLElement {
    const v = o.view;
    const box = document.createElement('div');
    box.className = 'review';
    const fresh = diffFreshness(v, fog);
    box.append(this.heading(o.file.path, 'h3'));
    box.append(this.text(v.since === null
      ? 'Nothing here is unseen any more.'
      : `Unseen since ${shortSha(v.since)}, shown up to ${shortSha(v.at)}.`, 'note dim'));
    for (const n of diffNotes(v)) box.append(this.text(n));
    const cmd = v.truncated ? gitDiffCommand(v) : null;
    if (cmd) {
      const code = document.createElement('code');
      code.className = 'cmd';
      code.textContent = cmd;
      box.append(code, this.button('copy', 'copy command', 'Copy the git diff command', () => {
        navigator.clipboard?.writeText(cmd).then(() => this.host.announce('command copied'), () => this.host.announce('copy failed: select the command instead'));
      }));
    }
    if (fresh === 'newer') box.append(this.text(`Newer commits arrived. Chart covers what this diff shows, up to ${shortSha(v.at)}; anything newer stays fogged.`));
    const actions = document.createElement('div');
    actions.className = 'actions';
    const stale = fresh === 'stale';
    if (v.since !== null) {
      actions.append(this.button('chart', stale ? 'chart (reload first)' : 'chart', stale ? 'Chart: reload the diff first'
        : `Chart ${o.file.path}: mark this change reviewed, up to ${shortSha(v.at)}`, () => void this.chart(), stale));
    }
    if (stale) actions.append(this.button('reload', 'reload diff', 'Reload the diff', () => void this.openDiff(o.file)));
    actions.append(this.button('back', 'back', 'Back to the list of unseen files', () => this.back()));
    box.append(actions, o.pre);
    return box;
  }

  /**
   * Rebuilds the panel (an open diff's lines are reattached, not rebuilt). Keyboard focus stays on
   * the same control, by key, or moves to the control `focus` names; when that control is gone (a
   * charted file leaves the list, or `focus` is 'list'), to the list's first file, else to close.
   */
  private render(focus?: string): void {
    const fog = this.fog;
    this.root.hidden = this.closed || (fog === null && !this.unavailable);
    if (this.root.hidden) return;
    if (!fog) {
      this.root.replaceChildren(this.heading(this.home.name, 'h2'),
        this.text("The fog view isn't available, so nothing can be reviewed or charted right now. Everything counts as fogged until it loads."));
      return;
    }
    this.root.setAttribute('aria-busy', String(this.busy));
    const focused = document.activeElement instanceof HTMLElement && document.activeElement.closest('#panel') ? document.activeElement : null;
    const top = document.createElement('div');
    top.className = 'top';
    top.append(this.heading(this.home.name, 'h2'), this.button('close', 'close', 'Close the review panel', () => this.close()));
    const parts: HTMLElement[] = [top];
    const b = this.baselineBox(fog);
    if (b) parts.push(b);
    parts.push(this.open ? this.diffBox(this.open, fog) : this.listBox());
    if (this.note) parts.push(this.text(this.note));
    this.root.replaceChildren(...parts);
    // Focus inside the panel never drops to the page: a control without a key (the diff text, after
    // Escape closed it) falls back like a removed one (Qodo local r1 #5).
    const key = focus ?? (focused === null ? undefined : focused === this.open?.pre ? 'pre' : focused.dataset['key'] ?? '');
    if (key === undefined) return;
    const find = (k: string) => this.root.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]:not(:disabled)`);
    const target = key === 'pre' && this.open ? this.open.pre : (key ? find(key) : null) ?? this.root.querySelector<HTMLElement>('li button') ?? find('close');
    target?.focus({ preventScroll: true });
  }
}
