// Phase 2 contract (#29): the hand-written fixtures typecheck against the contract, obey its
// invariants, and their JSON twins (what the renderer loads) stay byte-equal to them.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { fibonacciCell } from '../src/core/contract/layout.js';
import { miniDrones, miniFog, miniLayout } from './fixtures/contract/mini.js';

const DIR = join(import.meta.dirname, 'fixtures/contract');
const twins = [['mini.layout.json', miniLayout], ['mini.fog.json', miniFog], ['mini.drones.json', miniDrones]] as const;

describe('Phase 2 contract fixtures', () => {
  for (const [name, value] of twins) {
    it(`${name} is the canonical JSON of its typed source`, () => {
      const file = join(DIR, name);
      if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, canonicalJson(value));
      expect(readFileSync(file, 'utf8')).toBe(canonicalJson(value));
    });
  }

  it('layout obeys the contract invariants', () => {
    const { planets, constants } = miniLayout;
    expect(constants.slotSpacingMilli).toBeGreaterThanOrEqual(2 * constants.maxPlanetRadiusMilli);
    expect(planets.map((p) => p.slot.index)).toEqual([...planets.map((p) => p.slot.index)].sort((a, b) => a - b));
    for (const p of planets) {
      expect(p.radiusMilli).toBeLessThanOrEqual(constants.maxPlanetRadiusMilli);
      expect(p.moons.length).toBeLessThanOrEqual(constants.moonCap);
      const cells = p.surface.settlements.map((s) => s.cell);
      expect(new Set(cells).size).toBe(cells.length);
      for (const c of cells) expect(c).toBeLessThan(p.surface.grid.cells);
      expect(p.health.qodoUnknown).toBe(p.health.qodoOpen === null);
    }
  });

  it('fog covers every layout file once, sorted, with matching counts', () => {
    const ids = miniFog.files.map((f) => f.fileId);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    const total = miniFog.star.total + miniFog.planets.reduce((n, p) => n + p.total, 0);
    expect(total).toBe(ids.length);
    for (const f of miniFog.files) expect(f.reasons.length > 0).toBe(f.state === 'fogged');
  });

  it('drones are sorted, counted, and carry no counts or paths (Rules 2 and 6)', () => {
    const keys = miniDrones.sessions.map((s) => s.key);
    expect(keys).toEqual([...keys].sort());
    expect(miniDrones.total).toBe(keys.length);
    expect(miniDrones.placed).toBe(miniDrones.sessions.filter((s) => s.home !== null).length);
    const homes = new Set<string>([...miniLayout.planets.map((p) => p.dirId), 'star']);
    for (const s of miniDrones.sessions) expect(s.home === null || homes.has(s.home)).toBe(true);
    expect(JSON.stringify(miniDrones)).not.toMatch(/filesTouched|linesAdded|linesRemoved|commits|"path"|subject/);
  });

  it('fibonacciCell gives unit vectors from the north pole down', () => {
    for (const n of [1, 2, 64]) for (let i = 0; i < n; i++) {
      const [x, y, z] = fibonacciCell(i, n);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    }
    expect(fibonacciCell(0, 64)[1]).toBe(1);
    expect(fibonacciCell(63, 64)[1]).toBe(-1);
  });
});
