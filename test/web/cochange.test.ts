// The view's side of co-change (#211, R9): the co-change view is untrusted JSON, checked field by field;
// its files are placed on this layout's bodies (surface, test moon, star, or the home planet when not
// drawn); a focused planet or file is linked to the right bodies, strongest first, with test moons
// ticked instead of lined; the flag says "tests usually change with this" for a file's own test; the
// rasteriser stamps whole 2 px squares and stops short of what's busy; and the overlay plans edge arrows
// for partners off screen, flags with no focus, and nothing at all when there's nothing to draw.
import { describe, expect, it } from 'vitest';
import type { CoChangeView } from '../../src/core/contract/cochange.js';
import { focusPose, startPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { checkCoChange } from '../../web/src/cochange/check.js';
import { coChangeIndex, coChangeLines, flagInFocus, flagText, focusFor, focusLinks, PLANET_LINES } from '../../web/src/cochange/model.js';
import { BEAD, BEADS_PER_STEP, drawsAnything, FLAG_SHAPE, OVERLAY_COLOURS, planConstellation, rasterise } from '../../web/src/cochange/overlay.js';
import { blockBox, clipSegment, dilate, drawBeads, drawRail, resample, revealAt, span, stamp } from '../../web/src/cochange/raster.js';
import { LOOP_SECONDS } from '../../web/src/model/motion.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { palette } from '../../src/core/palette.js';
import { miniLayout } from '../fixtures/contract/mini.js';

const model = systemModel(miniLayout);
const HEAD = miniLayout.source.head;
const [SRC, WEB, DOCS] = miniLayout.planets.map((p) => p.dirId) as [string, string, string];
const file = (fileId: string, path: string, home: string) => ({ fileId, path, home }) as CoChangeView['files'][number];
const CO: CoChangeView = {
  schemaVersion: 'cochange.1', head: HEAD, needsRescan: false, dismissed: 1,
  files: [
    file('f_00000000000a', 'src/core/fog.ts', SRC), file('f_00000000000b', 'src/core/territory.ts', SRC),
    file('f_0000000000a1', 'test/fog.test.ts', SRC), file('f_00000000000d', 'web/model/fog.ts', WEB),
    file('f_00000000000e', 'docs/fog.md', DOCS), file('f_00000000000f', 'docs/cli.md', DOCS),
    file('f_000000000001', 'README.md', 'star'), file('f_0000000000ff', 'web/unplaced.ts', WEB),
  ],
  links: [
    { a: 'f_00000000000a', b: 'f_00000000000b', strengthMilli: 400 },
    { a: 'f_00000000000a', b: 'f_00000000000d', strengthMilli: 880 },
    { a: 'f_00000000000a', b: 'f_00000000000e', strengthMilli: 310 },
    { a: 'f_00000000000b', b: 'f_00000000000f', strengthMilli: 900 },
    { a: 'f_00000000000a', b: 'f_0000000000a1', strengthMilli: 760 },
    { a: 'f_000000000001', b: 'f_00000000000a', strengthMilli: 200 },
    { a: 'f_00000000000a', b: 'f_0000000000ff', strengthMilli: 150 },
  ],
  flags: [
    { fileId: 'f_00000000000d', with: 'f_00000000000a', strengthMilli: 880, at: HEAD },
    { fileId: 'f_0000000000a1', with: 'f_00000000000a', strengthMilli: 760, at: HEAD },
  ],
};

describe('checkCoChange', () => {
  it('accepts a co-change view, HTML-looking paths included (they are only ever text)', () => {
    const v = { ...CO, files: [...CO.files.slice(0, -1), file('f_0000000000ff', '<img src=x onerror=alert(1)>.ts', WEB)] };
    expect(checkCoChange(v)).toEqual({ ok: true, value: v });
  });

  it('refuses a document the view could be misled by, with reasons', () => {
    for (const [bad, why] of [
      [null, /object/], [{ ...CO, schemaVersion: 'cochange.0' }, /schemaVersion/], [{ ...CO, head: 'HEAD' }, /head/],
      [{ ...CO, links: [{ a: 'f_00000000000a', b: 'f_00000000000a', strengthMilli: 1 }] }, /two files/],
      [{ ...CO, links: [{ a: 'f_00000000000a', b: 'f_0000000000ee', strengthMilli: 1 }] }, /must name a file/],
      [{ ...CO, links: [{ a: 'f_00000000000a', b: 'f_00000000000b', strengthMilli: 1001 }] }, /0\.\.1000/],
      [{ ...CO, flags: [{ ...CO.flags[0]!, at: 'x' }] }, /SHA/], [{ ...CO, files: [file('f_00000000000a', '', SRC)] }, /path/],
      [{ ...CO, files: [file('f_00000000000a', 'a', '../x')] }, /home/], [{ ...CO, dismissed: -1 }, /dismissed/], [{ ...CO, links: 'x' }, /links/],
    ] as const) {
      const r = checkCoChange(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.errors.join('; ')).toMatch(why);
    }
  });
});

describe('placing and linking', () => {
  const index = coChangeIndex(CO, model);

  it('places a file on its body: the surface, a test moon, the star, or (not drawn) its home planet', () => {
    expect(index.files.get('f_00000000000a')!.spot).toEqual({ body: 0, moon: null });
    expect(index.files.get('f_0000000000a1')).toMatchObject({ spot: { body: 0, moon: 0 }, testOf: 'f_00000000000a' });
    expect(index.files.get('f_000000000001')!.spot).toEqual({ body: -1, moon: null });
    expect(index.files.get('f_0000000000ff')!.spot).toEqual({ body: 1, moon: null }); // not drawn: on its home
  });

  it('links a focused planet to other bodies at their strongest file pair, strongest first, and ticks its own test moons', () => {
    const l = focusLinks(index, { planet: 0, file: null });
    expect(l.lines.map((x) => [x.body, x.strengthMilli, x.step])).toEqual([[2, 900, 2], [1, 880, 2], [-1, 200, 0]]);
    expect(l.tests.map((f) => f.fileId)).toEqual(['f_0000000000a1']);
    expect(l.lines.length).toBeLessThanOrEqual(PLANET_LINES);
    expect(l.named).toEqual([]);
  });

  it("links a focused file to its own partners only: one line per body, its neighbours named, its test ticked", () => {
    const l = focusLinks(index, { planet: 0, file: 'f_00000000000a' });
    // its 5 strongest: web/model (880), the test (760), territory (400), docs (310), README (200); not web/unplaced (150)
    expect(l.lines.map((x) => [x.body, x.strengthMilli, x.files.map((f) => f.path)])).toEqual([
      [1, 880, ['web/model/fog.ts']], [2, 310, ['docs/fog.md']], [-1, 200, ['README.md']],
    ]);
    expect(l.named.map((f) => f.path)).toEqual(['src/core/territory.ts']);
    expect(l.tests.map((f) => f.path)).toEqual(['test/fog.test.ts']);
  });

  it("focuses the review panel's open file in free flight too, where the panel lists the star's files (PR #214 r1, Qodo dc730060)", () => {
    expect(focusFor(index, null, 'f_000000000001')).toEqual({ planet: -1, file: 'f_000000000001' });
    expect(focusFor(index, null, 'f_00000000000a')).toBeNull(); // a planet's file with no planet focused: nothing
    expect(focusFor(index, null, null)).toBeNull();
    expect(focusFor(index, 2, 'f_00000000000e')).toEqual({ planet: 2, file: 'f_00000000000e' });
    const l = focusLinks(index, focusFor(index, null, 'f_000000000001'));
    expect(l.lines.map((x) => [x.body, x.strengthMilli])).toEqual([[0, 200]]); // README → src/core/fog.ts
    const p = planConstellation({ model, index, focus: focusFor(index, null, 'f_000000000001'), frame: 0, pose: startPose(model), W: 320, H: 180, textW: (t) => t.length * 2 });
    expect(p.lines.length + p.arrows.length).toBeGreaterThan(0);
  });

  it('draws nothing for no focus, or a file that is not on the focused planet (planet focus then)', () => {
    expect(focusLinks(index, null)).toEqual({ lines: [], named: [], tests: [] });
    expect(focusLinks(index, { planet: 2, file: 'f_00000000000a' }).lines.map((x) => x.body)).toEqual([0]);
  });

  it("flags in words: a file's own test says 'tests usually change with this', shown when its pair is in focus", () => {
    const [web, test] = [index.flags.find((f) => f.file.fileId === 'f_00000000000d')!, index.flags.find((f) => f.file.fileId === 'f_0000000000a1')!];
    expect(flagText(web)).toEqual(['web/model/fog.ts', 'usually changes with src/core/fog.ts']);
    expect(test.test).toBe(true);
    expect(flagText(test)).toEqual(['src/core/fog.ts', 'tests usually change with this']);
    expect([null, { planet: 1, file: null }, { planet: 0, file: null }, { planet: 2, file: null }].map((f) => flagInFocus(web, f))).toEqual([false, true, true, false]);
    expect(coChangeLines(index, model, { planet: 0, file: null }, CO.dismissed)).toEqual([
      'usually changes with docs (strong), web (strong), the star (weak), its tests',
      'missing pair: web/model/fog.ts: usually changes with src/core/fog.ts',
      'missing pair: src/core/fog.ts: tests usually change with this',
      '1 missing pair charted',
    ]);
  });
});

describe('the rasteriser', () => {
  const W = 20, H = 10;

  it('stamps whole 2×2 squares only on free pixels, and stops 1 px short of a blocked one', () => {
    const ov = new Uint8Array(W * H), blocked = new Uint8Array(W * H);
    blocked[5 * W + 12] = 1;
    const grown = dilate(blocked, W, H, 1);
    const samples = resample([{ x: 1, y: 5 }, { x: 19, y: 5 }], 1);
    drawRail(ov, grown, W, H, samples, [0, 18], 2, 1);
    const xs = [...new Set([...ov.keys()].filter((i) => ov[i]).map((i) => i % W))].sort((a, b) => a - b);
    expect(xs.every((x) => x < 11 - 0 || x > 13)).toBe(true); // nothing on 11..13: the blocked pixel and its 1 px gap
    for (const x of xs) expect(ov[4 * W + x] && ov[5 * W + x]).toBeTruthy(); // 2 px tall everywhere
    expect(stamp(ov, grown, W, H, 19.5, 5, 2, 1)).toBe(false); // half off the frame: not drawn
    blockBox(blocked, W, H, { x: 0.5, y: 0.5, w: 1, h: 1 }, 1);
    expect(blocked[0]).toBe(1);
  });

  it('spans from where a line leaves its start disc to where it enters its end disc', () => {
    const samples = resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 1);
    expect(span(samples, { x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 20 })).toEqual([12, 78]);
    expect(span(samples, { x: 0, y: 0, r: 60 }, { x: 100, y: 0, r: 60 })).toBeNull();
  });

  it('draws in over 0.7 s, strongest first, 0.1 s apart; at once under reduced motion', () => {
    expect([0, 0.35, 0.7].map((t) => revealAt(t, 0))).toEqual([0, 1 - 0.5 ** 3, 1]);
    expect(revealAt(0.1, 1)).toBe(0);
    expect(revealAt(0, 3, true)).toBe(1);
  });

  it('sends 1, 2 or 3 beads by step, one trip per 3 s: a whole number per loop, so the loop has no seam', () => {
    expect(BEADS_PER_STEP).toEqual([1, 2, 3]);
    expect(Number.isInteger(LOOP_SECONDS / BEAD.seconds)).toBe(true);
    const samples = resample([{ x: 0, y: 5 }, { x: 99, y: 5 }], 1);
    const beads = (u: number) => {
      const ov = new Uint8Array(100 * 10);
      drawBeads(ov, new Uint8Array(100 * 10), 100, 10, samples, [0, 99], { w: 2, n: 3, u, len: 6, headLen: 2, head: 3, tail: 2 });
      return [...ov].join();
    };
    expect(beads(0.25)).toBe(beads(1.25));
    expect(beads(0.25)).not.toBe(beads(0.5));
  });

  it('cuts a far segment to the frame', () => {
    expect(clipSegment({ x: 5, y: 5 }, { x: 1005, y: 5 }, 0, 0, 20, 10)).toEqual([{ x: 5, y: 5 }, { x: 20, y: 5 }]);
    expect(clipSegment({ x: -5, y: -5 }, { x: -1, y: -9 }, 0, 0, 20, 10)).toBeNull();
  });
});

describe('the overlay plan', () => {
  const index = coChangeIndex(CO, model);
  const textW = (t: string) => t.length * 2;
  const W = 320, H = 180;
  const plan = (focus: { planet: number; file: string | null } | null, pose: OrbitPose = startPose(model)) =>
    planConstellation({ model, index, focus, frame: 0, pose, W, H, textW });

  it('plans flags with nothing focused, and no line', () => {
    const p = plan(null);
    expect(p.lines).toEqual([]);
    expect(p.flags.map((f) => [f.body, f.show])).toEqual([[0, false], [1, false]]);
    expect(p.flags.every((f) => f.box.w === FLAG_SHAPE[0].length && f.box.h === FLAG_SHAPE.length)).toBe(true);
    expect(plan({ planet: 1, file: null }).flags.find((f) => f.body === 1)!.show).toBe(true);
  });

  it('shows at most 3 flag texts in focus, strongest first, and the rest as one "+N more" line; every flagged body keeps its glyph', () => {
    const many: CoChangeView = { ...CO, flags: ([['f_00000000000d', 880], ['f_00000000000e', 800], ['f_00000000000f', 700], ['f_0000000000ff', 600], ['f_000000000001', 550]] as const)
      .map(([fileId, strengthMilli]) => ({ fileId, with: 'f_00000000000a', strengthMilli, at: HEAD })) };
    const p = planConstellation({ model, index: coChangeIndex(many, model), focus: { planet: 0, file: null }, frame: 0, pose: startPose(model), W, H, textW });
    expect(p.flags.filter((f) => f.show).flatMap((f) => f.text)).toEqual([
      'web/model/fog.ts', 'usually changes with src/core/fog.ts',
      'docs/fog.md', 'usually changes with src/core/fog.ts', 'docs/cli.md', 'usually changes with src/core/fog.ts', '+2 more',
    ]);
    expect(p.flags.map((f) => f.body).sort()).toEqual([-1, 1, 2]);
    expect(p.flags.filter((f) => !f.show).every((f) => f.text.length === 0)).toBe(true);
  });

  it('puts an arrow at the frame edge for a partner off screen', () => {
    const close = focusPose(startPose(model), planetCentre(model.planets[0]!, 0), model.planets[0]!.radius);
    const p = plan({ planet: 0, file: null }, close);
    expect(p.arrows.length).toBeGreaterThan(0);
    for (const a of p.arrows) {
      const inset = Math.min(a.box.x, a.box.y, W - a.box.x - a.box.w, H - a.box.y - a.box.h);
      expect(inset).toBeGreaterThanOrEqual(0);
      expect(inset).toBeLessThanOrEqual(2);
    }
  });

  it('draws nothing (no overlay pass) without a co-change view, and only palette colours with one', () => {
    const empty = planConstellation({ model, index: null, focus: { planet: 0, file: null }, frame: 0, pose: startPose(model), W, H, textW });
    expect(drawsAnything(empty)).toBe(false);
    expect(rasterise(empty, { pixels: () => new Uint8Array(W * H * 4), W, H, labels: [], since: 5, reduced: false, frame: 0 })).toBeNull();
    expect(OVERLAY_COLOURS.slice(1).every((c) => [...palette.world.stars, ...palette.accent.teal].includes(c as never))).toBe(true);
  });
});
