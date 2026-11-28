// The demo's own page parts (live-demo L3): the title screen, the permanent "demo: invented data" badge
// and the legend. Crisp UI outside the pixel pass, as the product's HUD and panels: bitmap-font titles and
// buttons with their names in DOM text, the longer words in plain DOM text, palette colours only. Text
// only ever goes in through textContent.
import { textCanvas } from '../labels/overlay.js';
import { UI_COLOURS } from '../ui/colours.js';
import { byId } from '../ui/dom.js';
import { FOG_ICONS, HEALTH_ICONS, iconCanvas, THING_ICONS, type PixelIcon } from './icons.js';

const dprNow = () => devicePixelRatio || 1;

/**
 * Draws an element's `data-text` in the bitmap font at `data-px` CSS px per font pixel, in the accent
 * colour for `.accent`, and keeps its own text as its accessible name (screen-reader only).
 */
export function paintBitmap(el: HTMLElement, dpr = dprNow()): void {
  const text = el.dataset['text'];
  if (!text) return;
  const px = Math.max(1, Math.round(Number(el.dataset['px'] ?? 2) * dpr));
  if (!el.querySelector(':scope > .sr')) {
    const sr = document.createElement('span');
    sr.className = 'sr';
    sr.textContent = el.textContent;
    el.replaceChildren(sr);
  }
  el.querySelector(':scope > canvas.bitmap')?.remove();
  const c = textCanvas(text, px, dpr, el.classList.contains('accent') ? UI_COLOURS.accent : UI_COLOURS.ink);
  c.classList.add('bitmap');
  el.prepend(c);
}

/** Every bitmap-text element under `root`, drawn again (at load, and when the device pixel ratio changes). */
export function paintAll(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('.bitmap-host')) paintBitmap(el);
}

/** The title screen: shown until Play, which resolves the promise. Enter or Space on the focused Play button plays too. */
export function titleScreen(): Promise<void> {
  const title = byId<HTMLElement>('demo-title');
  const play = byId<HTMLButtonElement>('demo-play');
  play.focus({ preventScroll: true });
  return new Promise((resolve) => {
    play.addEventListener('click', () => {
      title.hidden = true;
      resolve();
    }, { once: true });
  });
}

interface Entry { icons: readonly { icon: PixelIcon; caption?: string }[]; title: string; text: string }

/** The legend's words: what each thing on the map means, in plain terms (art-direction §6, the feature docs). */
const ENTRIES: readonly Entry[] = [
  {
    title: 'planets', icons: [{ icon: HEALTH_ICONS.lush }, { icon: THING_ICONS.moon }],
    text: 'The star is the repository. Each top-level folder is a planet and each file a settlement on it; bigger planets hold more code. Moons are test files.',
  },
  {
    title: 'health, worst to best', icons: [
      { icon: HEALTH_ICONS.lava, caption: 'lava' }, { icon: HEALTH_ICONS.toxic, caption: 'toxic' }, { icon: HEALTH_ICONS.ash, caption: 'desert' },
      { icon: HEALTH_ICONS.lush, caption: 'lush' }, { icon: HEALTH_ICONS.ocean, caption: 'ocean' }, { icon: HEALTH_ICONS.ice, caption: 'ice' }],
    text: 'A planet\'s look is its code health, from how many debt markers (TODO, FIXME, HACK, XXX) it has per 1,000 lines. Lush, ocean and ice all mean healthy.',
  },
  {
    title: 'fog of war', icons: [{ icon: FOG_ICONS.fogged, caption: 'unseen' }, { icon: FOG_ICONS.misted, caption: 'read' }, { icon: FOG_ICONS.clear, caption: 'clear' }],
    text: 'Cloud covers code an agent, a teammate or an unknown author changed that you haven\'t reviewed. Read a file\'s diff in the review panel and its cloud thins to mist. Clear means understood.',
  },
  {
    title: 'drones', icons: [{ icon: THING_ICONS.drone }],
    text: 'Each drone is one AI agent session, circling the planet that holds most of the files it edited. Click one to see the files it edited and when.',
  },
  {
    title: 'the crew', icons: [{ icon: THING_ICONS.ship }],
    text: 'The people who committed lately ride in the ship; the captain in the gold cap is you. Click a porthole to see what they touched.',
  },
  {
    title: 'co-change', icons: [{ icon: THING_ICONS.cochange }, { icon: THING_ICONS.flag }],
    text: 'Focus a planet to see starlight lines to files that usually change with it. A teal flag marks a file whose usual partner changed lately without it.',
  },
  {
    title: 'beacons', icons: [{ icon: THING_ICONS.beacon }],
    text: 'A note from the captain\'s log, left on a file when you chart it.',
  },
];

const HOW = 'Click a planet or press [ ] to focus one · drag to look · W A S D to fly · R F up and down · wheel to zoom · H for home · Esc for free flight · the files button opens the directory view.';

/** The legend: built once, opened after Play, closed with its button or Escape and opened again from the badge. */
export class Legend {
  private readonly root = byId<HTMLElement>('demo-legend');
  private readonly toggle = byId<HTMLButtonElement>('demo-legend-toggle');
  private built = 0;
  /** Where keyboard focus goes when the legend closes. */
  release: () => void = () => {};

  constructor() {
    this.toggle.addEventListener('click', () => (this.root.hidden ? this.open() : this.close()));
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(): void {
    this.build();
    this.root.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.root.querySelector<HTMLElement>('[data-key="close"]')?.focus({ preventScroll: true });
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.release();
  }

  /** Rebuilds for a new device pixel ratio (its pictures are drawn at whole device pixels). */
  rescale(): void {
    if (this.built !== 0) { this.built = 0; this.build(); }
  }

  private build(): void {
    const dpr = dprNow();
    if (this.built === dpr) return;
    this.built = dpr;
    const top = document.createElement('div');
    top.className = 'top';
    const h = document.createElement('h2');
    h.id = 'demo-legend-title';
    h.className = 'bitmap-host';
    h.dataset['text'] = 'how to read the map';
    h.dataset['px'] = '2';
    h.textContent = 'How to read the map';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bitmap-host';
    close.dataset['text'] = 'close';
    close.dataset['px'] = '2';
    close.dataset['key'] = 'close';
    close.textContent = 'Close the legend';
    close.addEventListener('click', () => this.close());
    top.append(h, close);
    const list = document.createElement('dl');
    for (const e of ENTRIES) {
      const dt = document.createElement('dt');
      const pics = document.createElement('div');
      pics.className = 'pics';
      for (const { icon, caption } of e.icons) {
        const fig = document.createElement('span');
        fig.className = 'pic';
        fig.append(iconCanvas(icon, 2, dpr));
        if (caption) {
          const cap = document.createElement('span');
          cap.className = 'cap';
          cap.textContent = caption;
          fig.append(cap);
        }
        pics.append(fig);
      }
      const name = document.createElement('span');
      name.className = 'bitmap-host name';
      name.dataset['text'] = e.title;
      name.dataset['px'] = '2';
      name.textContent = e.title;
      dt.append(name, pics);
      const dd = document.createElement('dd');
      dd.textContent = e.text;
      list.append(dt, dd);
    }
    const how = document.createElement('p');
    how.className = 'how';
    how.textContent = HOW;
    this.root.replaceChildren(top, list, how);
    paintAll(this.root);
  }
}

/** The permanent badge (with the legend's toggle), shown from Play on. */
export function showBadge(): void {
  byId<HTMLElement>('demo-badge').hidden = false;
}
