// The drones in the view (#80 AC 5, 6, 8, 9, 10), the parts that need no GPU: which sessions are drawn
// and what the HUD says, the validator, the labels and panel rows, the orbits, the dev fixture and the palette.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DroneView } from '../../src/core/contract/drones.js';
import { palette } from '../../src/core/palette.js';
import { parseDrones } from '../../web/src/data/client.js';
import { checkDrones } from '../../web/src/drones/check.js';
import { DRONE_TURNS, placeDrone } from '../../web/src/drones/place.js';
import { pick } from '../../web/src/camera/pose.js';
import { capLabels, DRONE_CAP, droneLabels, droneRows, droneStatus, entryOf, selectDrones } from '../../web/src/drones/select.js';
import { LOOP_FRAMES } from '../../web/src/model/motion.js';
import { systemModel } from '../../web/src/model/system.js';
import { miniDrones, miniLayout } from '../fixtures/contract/mini.js';
import { droneView, repoDrones, session, viewDrones } from '../fixtures/drones.js';
import { selfLikeRoots } from '../fixtures/overview.js';

const BLK_36: string[] = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/blk-36.published.json'), 'utf8')).colors;
const all = () => true;
const HEAD = miniLayout.source.head;

describe('which drones are drawn (AC 5)', () => {
  const view = repoDrones(selfLikeRoots);
  const known = new Set<string>([...selfLikeRoots.planets.map((p) => p.dirId), 'star']);
  const sel = selectDrones(view, (h) => known.has(h));

  it('draws at most the cap, the placed sessions that ended most recently', () => {
    expect(DRONE_CAP).toBe(16);
    expect(view.total).toBe(90);
    expect(sel.shown).toHaveLength(16);
    const placed = view.sessions.filter((s) => s.home !== null);
    const newest = [...placed].sort((a, b) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : a.key < b.key ? -1 : 1)).slice(0, 16);
    expect(sel.shown.map((s) => s.key)).toEqual(newest.map((s) => s.key));
  });

  it('counts what the cap hides and what has no home, and the three always add up', () => {
    expect(sel.unplaced).toBe(view.total - view.placed);
    expect(sel.hidden).toBe(view.placed - 16);
    expect(sel.shown.length + sel.hidden + sel.unplaced).toBe(view.total);
    expect(droneStatus(sel)).toBe(`16 drones shown, ${view.placed - 16} placed sessions hidden by the cap of 16, ${view.total - view.placed} sessions could not be placed`);
  });

  it('breaks an end-time tie by key, and never draws a session without a home', () => {
    const v = droneView(HEAD, [session(3, 'star', { endedAt: '2026-11-10T12:00:00.000Z' }), session(1, 'star', { endedAt: '2026-11-10T12:00:00.000Z' }), session(2, null, { endedAt: '2026-11-11T12:00:00.000Z' })]);
    expect(selectDrones(v, all, 1).shown.map((s) => s.key)).toEqual([session(1, 'star').key]);
    expect(selectDrones(v, all).shown.every((s) => s.home !== null)).toBe(true);
  });

  it('counts a session whose home the drawn layout lacks as not placed (Rule 1)', () => {
    const v = droneView(HEAD, [session(1, 'd_gone' as never), session(2, 'star')]);
    const s = selectDrones(v, (h) => h === 'star');
    expect(s.shown).toHaveLength(1);
    expect(s.unplaced).toBe(1);
  });

  it('says "rescan to place drones" and draws none when the snapshot predates session files', () => {
    const old = droneView(HEAD, [session(1, null), session(2, null)], true);
    const s = selectDrones(old, all);
    expect(s.shown).toEqual([]);
    expect(droneStatus(s)).toBe('rescan to place drones (2 sessions not placed)');
  });

  it('orders by instant, whatever the fractional precision of the times', () => {
    const v = droneView(HEAD, [
      session(1, 'star', { endedAt: '2026-11-10T12:00:00Z' }), session(2, 'star', { endedAt: '2026-11-10T12:00:00.500Z' }), session(3, 'star', { endedAt: '2026-11-10T11:59:59.900Z' }),
    ]);
    expect(selectDrones(v, all).shown.map((s) => s.key)).toEqual([session(2, 'star').key, session(1, 'star').key, session(3, 'star').key]);
  });

  it('is a pure function of the view: the same view gives the same drones and entries', () => {
    expect(selectDrones(structuredClone(view), (h) => known.has(h)).shown.map(entryOf)).toEqual(sel.shown.map(entryOf));
  });
});

describe('labels and the panel (AC 6, 8, 10)', () => {
  it('the Claude drone has no label; any other tool is named; an inferred session says so', () => {
    expect(droneLabels(session(1, 'star')).label).toBeNull();
    expect(droneLabels(session(1, 'star', { tool: 'codex' })).label).toBe('codex');
    expect(droneLabels(session(1, 'star', { inferred: true })).label).toBe('inferred');
    expect(droneLabels(session(1, 'star', { tool: 'codex', inferred: true })).label).toBe('codex inferred');
    expect(droneLabels(session(1, 'star')).selectedLabel).toBe('claude-code');
  });

  it('shows the tool, main or subagent with its type, UTC times, branch, model, inferred and the home', () => {
    const rows = Object.fromEntries(droneRows(session(1, 'star', { kind: 'subagent', agentType: 'Explore', inferred: true, branch: 'feature/x', model: null }), 'src/web'));
    expect(rows).toEqual({
      tool: 'claude-code', kind: 'subagent (Explore)', started: '2026-11-10 09:01:00 UTC', ended: '2026-11-10 10:01:00 UTC',
      branch: 'feature/x', model: 'unknown', source: 'inferred', home: 'src/web',
    });
    expect(Object.fromEntries(droneRows(session(2, 'star'), 'the star'))['kind']).toBe('main');
  });

  it('shows no line, file or commit count (Rule 6) and strips control characters from outside text', () => {
    const text = droneRows(session(1, 'star', { branch: 'a\u001b[31mb\nc' }), 'x').flat().join(' ');
    expect(text).not.toMatch(/\b(?:lines?|files?|commits?)\b/i);
    expect(text).not.toMatch(/\p{Cc}/u);
  });
});

describe('the validator (AC 10)', () => {
  it('accepts the contract fixture and a session with inferred: true', () => {
    expect(checkDrones(miniDrones).ok).toBe(true);
    expect(checkDrones(viewDrones(miniLayout)).ok).toBe(true);
    const v = droneView(HEAD, [session(1, 'star', { inferred: true })]);
    const c = checkDrones(JSON.parse(JSON.stringify(v)));
    expect(c.ok).toBe(true);
    expect(droneLabels(session(1, 'star', { inferred: true })).label).toBe('inferred');
  });

  it('refuses a malformed document with reasons, never half-drawing it', () => {
    const bad = (mutate: (v: DroneView) => void): string => {
      const v = structuredClone(miniDrones);
      mutate(v);
      const c = checkDrones(v);
      return c.ok ? 'ok' : c.errors.join('; ');
    };
    expect(bad((v) => { (v as { schemaVersion: string }).schemaVersion = 'drones.2'; })).toMatch(/schemaVersion/);
    expect(bad((v) => { v.total = 99; })).toMatch(/total/);
    expect(bad((v) => { v.placed = 0; })).toMatch(/placed/);
    expect(bad((v) => { v.sessions[0]!.seed = -1; })).toMatch(/seed/);
    expect(bad((v) => { v.sessions[0]!.startedAt = 'yesterday'; })).toMatch(/startedAt/);
    expect(bad((v) => { v.sessions[0]!.endedAt = '2026-13-45T25:61:61Z'; })).toMatch(/endedAt/);
    expect(bad((v) => { v.sessions[0]!.kind = 'x' as never; })).toMatch(/kind/);
    expect(bad((v) => { v.sessions[0]!.tool = ''; })).toMatch(/tool/);
    expect(bad((v) => { v.needsRescan = true; })).toMatch(/needsRescan/);
    expect(checkDrones(null).ok).toBe(false);
    expect(() => parseDrones('{', 'test')).toThrow(/not JSON/);
    expect(() => parseDrones('{}', 'test')).toThrow(/invalid/);
  });

  it('the dev fixture file (the contract twin) passes the view\'s validator', () => {
    const text = readFileSync(join(import.meta.dirname, '../fixtures/contract/mini.drones.json'), 'utf8');
    expect(parseDrones(text, 'fixture')).toEqual(miniDrones);
  });
});

describe('orbits (AC 5, Rule 4)', () => {
  const model = systemModel(miniLayout);
  const home = miniLayout.planets[0]!.dirId;
  const at = (f: number, seed = 7) => placeDrone(model, home, seed, f)!;
  const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  it('is a pure function of (seed, frame) and loops whole turns per 24 s', () => {
    expect(at(10)).toEqual(at(10));
    expect(DRONE_TURNS).toBe(2);
    expect(at(0).centre.map((x) => +x.toFixed(6))).toEqual(at(LOOP_FRAMES).centre.map((x) => +x.toFixed(6)));
    expect(at(0).centre.map((x) => +x.toFixed(6))).toEqual(at(LOOP_FRAMES / 2).centre.map((x) => +x.toFixed(6)));
  });

  it('turns at a constant rate: equal frame steps move it equal distances', () => {
    const d = [0, 1, 2, 3].map((k) => dist(at(100 + k).centre, at(101 + k).centre));
    for (const x of d) expect(x).toBeCloseTo(d[0]!, 6);
  });

  it('keeps clear of its home and starts from a seeded phase, so seeds differ and a seed repeats', () => {
    const planet = model.planets[0]!;
    const c = planet.orbit; // frame 0 puts the planet at (orbit, 0, 0) with TURNS.orbits 0 and phase 0
    expect(dist(at(0).centre, [c, 0, 0])).toBeGreaterThan(planet.radius);
    expect(at(0, 1).centre).not.toEqual(at(0, 2).centre);
    expect(placeDrone(model, 'd_nowhere', 1, 0)).toBeNull();
  });
});

describe('drone labels and duplicate keys (Qodo PR #127 r2)', () => {
  it("keeps the selected drone's label when more nearer drones have one than the budget allows", () => {
    const placed = Array.from({ length: 12 }, (_, i) => ({ i }));
    const got = capLabels(placed, (p) => p.i === 11, 8);
    expect(got).toHaveLength(8);
    expect(got.map((p) => p.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 11]);
    expect(capLabels(placed, () => false, 3).map((p) => p.i)).toEqual([0, 1, 2]);
    expect(capLabels(placed, () => false, 0)).toEqual([]);
  });

  it('refuses a view with two sessions of one key, so a click never opens another session', () => {
    const v = structuredClone(droneView(HEAD, [session(1, 'star'), session(2, 'star')]));
    v.sessions[1]!.key = v.sessions[0]!.key;
    const c = checkDrones(v);
    expect(c.ok ? '' : c.errors.join(';')).toMatch(/unique/);
  });
});

describe('picking a drone (Qodo PR #127 r1)', () => {
  const pose = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, dist: 100 };
  const small = [{ centre: [0, 0, 0] as [number, number, number], radius: 0.28 }];

  it("a click well beside a far drone misses it with the drone floor but hit it with the planets' floor", () => {
    const beside = { x: 0.015, y: 0 }; // 1.5% of half the width off: about 2 px at 320 x 180
    expect(pick(pose, beside, small, [], 0.04)).toBe(0);
    expect(pick(pose, beside, small, [], 0.015)).toBeNull();
    expect(pick(pose, { x: 0.005, y: 0 }, small, [], 0.015)).toBe(0);
  });
});

describe('palette (Rule 5)', () => {
  it('draws the drones from BLK 36 only', () => {
    const hexes = Object.values(palette.drone).flatMap((look) => Object.values(look).flat());
    expect(hexes.length).toBeGreaterThan(20);
    expect(hexes.filter((h) => !BLK_36.includes(h))).toEqual([]);
  });
});
