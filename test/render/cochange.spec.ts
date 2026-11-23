// Co-change constellations on the real view (#211, R9; art direction §10, option B "signal"): the
// co-change view reaches the hook as `RenderInput.cochange`, the focus as `RenderInput.focus`. Lines are
// drawn only for the focused planet or file, in the starfield's three colours only, never over a body
// or within 1 px of one, never under a label; they draw in strongest first, at once with the beads
// frozen under reduced motion; a partner off screen gets an edge arrow; the teal missing-pair flag shows
// focused or not. Every frame fails when blank, and a focused frame fails with no line.
import { expect, test, type Page } from '@playwright/test';
import type { CoChangeFlag, CoChangeView } from '../../src/core/contract/cochange.js';
import type { RenderInput } from '../../src/core/contract/api.js';
import { palette } from '../../src/core/palette.js';
import { focusPose, startPose, toCameraPose } from '../../web/src/camera/pose.js';
import { FLAG_SHAPE } from '../../web/src/cochange/overlay.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { assertRendered, hex, LOW_RES, rgbaAt, type Frame } from './frame.js';
import { MINI, MINI_INPUT, openView, render, systemView, type View } from './harness.js';

const model = systemModel(MINI);
const HEAD = MINI.source.head;
const [SRC, WEB, DOCS] = MINI.planets as [typeof MINI.planets[0], typeof MINI.planets[0], typeof MINI.planets[0]];
const STARS = new Set<string>(palette.world.stars);
const TEAL = new Set<string>([palette.accent.teal[2], palette.accent.teal[3]]);
const FREE = new Set<string>([palette.world.space, ...palette.world.stars]);

/** src's fog core changes with web's view model (strong), docs (mid), a neighbour on src (weak) and its own test moon. */
const CO: CoChangeView = {
  schemaVersion: 'cochange.1', head: HEAD, needsRescan: false, dismissed: 0, flags: [],
  files: [
    { fileId: 'f_00000000000a', path: 'src/core/fog.ts', home: SRC.dirId },
    { fileId: 'f_00000000000b', path: 'src/core/territory.ts', home: SRC.dirId },
    { fileId: 'f_0000000000a1', path: 'test/fog.test.ts', home: SRC.dirId },
    { fileId: 'f_00000000000d', path: 'web/model/fog.ts', home: WEB.dirId },
    { fileId: 'f_00000000000e', path: 'docs/fog.md', home: DOCS.dirId },
  ],
  links: [
    { a: 'f_00000000000a', b: 'f_00000000000b', strengthMilli: 400 },
    { a: 'f_00000000000a', b: 'f_00000000000d', strengthMilli: 880 },
    { a: 'f_00000000000a', b: 'f_00000000000e', strengthMilli: 310 },
    { a: 'f_00000000000a', b: 'f_0000000000a1', strengthMilli: 760 },
  ],
};
/** web's view model and src's test moon, both left out of src/core/fog.ts's latest change. */
const FLAGS: CoChangeFlag[] = [
  { fileId: 'f_00000000000d', with: 'f_00000000000a', strengthMilli: 880, at: HEAD },
  { fileId: 'f_0000000000a1', with: 'f_00000000000a', strengthMilli: 760, at: HEAD },
];
type Focus = NonNullable<RenderInput['focus']>;
const FOCUS_SRC: Focus = { dirId: SRC.dirId };
/** Past the last line's draw-in (0.7 s plus 0.1 s per rank, at 30 frames a second). */
const DRAWN = 45;

const colourAt = (f: Frame, i: number) => hex(rgbaAt(f.rgba, i * 4));
/** The pixels the overlay drew: those that differ from the same frame drawn without co-change. */
function overlay(base: Frame, withCo: Frame): { at: number[]; colours: Set<string> } {
  const at: number[] = [];
  const colours = new Set<string>();
  for (let i = 0; i < base.width * base.height; i++) {
    if (rgbaAt(base.rgba, i * 4) === rgbaAt(withCo.rgba, i * 4)) continue;
    at.push(i);
    colours.add(colourAt(withCo, i));
  }
  return { at, colours };
}
const ofColours = (f: Frame, at: number[], set: Set<string>) => at.filter((i) => set.has(colourAt(f, i)));

/** One frame with and without the co-change view, everything else equal. */
async function pair(view: View, input: RenderInput, frame: number) {
  const [base] = await render(view, { ...input, cochange: null }, [frame]);
  const [withCo] = await render(view, input, [frame]);
  assertRendered(withCo!.pixels, withCo!.stats, LOW_RES);
  return { base: base!, withCo: withCo!, drawn: overlay(base!.pixels, withCo!.pixels) };
}

/** The label canvas's alpha, device px, and its scale over the internal frame. */
async function labelAlpha(page: Page): Promise<{ w: number; k: number; alpha: Uint8Array }> {
  const r = await page.evaluate(() => {
    const c = document.getElementById('labels') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]!;
    let bin = '';
    for (let i = 0; i < a.length; i += 0x8000) bin += String.fromCharCode(...a.subarray(i, i + 0x8000));
    return { w: c.width, b64: btoa(bin) };
  });
  return { w: r.w, k: r.w / LOW_RES.width, alpha: new Uint8Array(Buffer.from(r.b64, 'base64')) };
}

test.describe('co-change constellations (#211)', () => {
  test('nothing focused and no flags: exactly the frame without co-change, no draw call, no pixel', async ({ page }) => {
    const view = await openView(page, systemView());
    const { base, withCo, drawn } = await pair(view, { ...MINI_INPUT, cochange: CO }, DRAWN);
    expect(drawn.at.length).toBe(0);
    expect(withCo.stats.drawCalls).toBe(base.stats.drawCalls);
    expect(view.errors).toEqual([]);
  });

  test('a focused planet draws its lines in the starfield colours only, over empty space only, 1 px clear of every body', async ({ page }) => {
    const view = await openView(page, systemView());
    for (const depthFade of [true, false]) {
      const { base, withCo, drawn } = await pair(view, { ...MINI_INPUT, depthFade, cochange: CO, focus: FOCUS_SRC }, DRAWN);
      expect(drawn.at.length, 'a focused planet with partners must draw lines').toBeGreaterThan(40);
      expect([...drawn.colours].filter((c) => !STARS.has(c)), 'palette only: the three star colours').toEqual([]);
      expect(ofColours(withCo.pixels, drawn.at, new Set([palette.world.stars[2]])).length, 'beads of light').toBeGreaterThan(0);
      expect(withCo.stats.drawCalls).toBe(base.stats.drawCalls + 1); // the overlay is one draw
      const W = base.pixels.width, H = base.pixels.height;
      const busy = drawn.at.filter((i) => {
        const x = i % W, y = Math.floor(i / W);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !FREE.has(colourAt(base.pixels, yy * W + xx))) return true;
        }
        return false;
      });
      expect(busy.length, 'line pixels on or within 1 px of a body').toBe(0);
    }
    expect(view.errors).toEqual([]);
  });

  test('lines only for the focused item: the same frame unfocused draws none', async ({ page }) => {
    const view = await openView(page, systemView());
    const unfocused = await pair(view, { ...MINI_INPUT, cochange: CO }, DRAWN);
    expect(unfocused.drawn.at.length).toBe(0);
    const docs = await pair(view, { ...MINI_INPUT, cochange: CO, focus: { dirId: DOCS.dirId } }, DRAWN);
    const src = await pair(view, { ...MINI_INPUT, cochange: CO, focus: FOCUS_SRC }, DRAWN);
    // docs has one partner (src, mid), src three bodies: web, docs, and its own test moon (no line, a tick)
    expect(docs.drawn.at.length).toBeGreaterThan(0);
    expect(docs.drawn.at.length).toBeLessThan(src.drawn.at.length);
  });

  test('no line pixel under a label', async ({ page }) => {
    const view = await openView(page, systemView());
    const { drawn } = await pair(view, { ...MINI_INPUT, cochange: CO, focus: FOCUS_SRC }, DRAWN);
    const labels = await labelAlpha(page);
    const covered = drawn.at.filter((i) => {
      const x = i % LOW_RES.width, y = Math.floor(i / LOW_RES.width);
      for (let j = 0; j < labels.k; j++) for (let k = 0; k < labels.k; k++) if (labels.alpha[(y * labels.k + j) * labels.w + x * labels.k + k]! > 0) return true;
      return false;
    });
    expect(labels.alpha.some((a) => a > 0), 'the frame has labels').toBe(true);
    expect(covered.length, 'line pixels under a label').toBe(0);
  });

  test('lines draw in strongest first, then their beads travel; reduced motion draws them at once and freezes the beads', async ({ page }) => {
    const view = await openView(page, systemView());
    const input = { ...MINI_INPUT, cochange: CO, focus: FOCUS_SRC };
    const at = async (frame: number, reducedMotion = false) => (await pair(view, { ...input, reducedMotion }, frame)).drawn;
    expect((await at(0)).at.length).toBe(0); // focused at frame 0: nothing drawn yet
    const early = await at(6), full = await at(DRAWN), later = await at(DRAWN + 15);
    expect(early.at.length).toBeGreaterThan(0);
    expect(early.at.length).toBeLessThan(full.at.length);
    expect(later.at.join()).not.toBe(full.at.join()); // the beads moved on
    const [r0, r1] = [await at(0, true), await at(90, true)];
    expect(r0.at.length, 'reduced motion: every line at once').toBeGreaterThan(early.at.length);
    expect(r1.at.join()).toBe(r0.at.join());
    expect([...r1.colours].filter((c) => !STARS.has(c))).toEqual([]);
  });

  test('a partner off screen gets an edge arrow; the flag shows focused or not, in teal, and a flagged test moon a tick', async ({ page }) => {
    const view = await openView(page, systemView());
    // close on src, as focus frames it: web and docs are off screen
    const close = toCameraPose(focusPose(startPose(model), planetCentre(model.planets[0]!, 0), model.planets[0]!.radius));
    const { drawn, withCo } = await pair(view, { ...MINI_INPUT, cochange: CO, focus: FOCUS_SRC, camera: close }, DRAWN);
    const W = LOW_RES.width, H = LOW_RES.height;
    const nearEdge = drawn.at.filter((i) => { const x = i % W, y = Math.floor(i / W); return x < 9 || y < 9 || x >= W - 9 || y >= H - 9; });
    expect(ofColours(withCo.pixels, nearEdge, new Set([palette.world.stars[1]])).length, 'an arrow at the frame edge').toBeGreaterThanOrEqual(16);

    const flagged = { ...CO, flags: FLAGS };
    const glyph = FLAG_SHAPE.join('').replace(/\./g, '').length;
    for (const focus of [null, FOCUS_SRC] as (Focus | null)[]) {
      const f = await pair(view, { ...MINI_INPUT, cochange: flagged, focus }, DRAWN);
      const teal = ofColours(f.withCo.pixels, f.drawn.at, TEAL);
      expect(teal.length, 'two flag glyphs (web, src) and at most a tick').toBeGreaterThanOrEqual(2 * glyph);
      expect(teal.length).toBeLessThanOrEqual(2 * glyph + 2);
      expect(teal.length / (W * H)).toBeLessThan(0.1); // teal under 10% of the frame (Rule 5)
      expect([...f.drawn.colours].filter((c) => !STARS.has(c) && !TEAL.has(c))).toEqual([]);
      if (focus === null) expect(f.drawn.at.length).toBe(teal.length); // unfocused: flags only, no line
    }
    expect(view.errors).toEqual([]);
  });
});
