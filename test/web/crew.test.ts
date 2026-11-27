// The crew's ship in the view (#207 C2–C5, C8), the parts that need no GPU: who rides in which seat and the
// overflow, the R2-4c hull's seats and portholes (the ship lab's broken cases), the loop-locked idle, where the
// ship is, the astronauts' seeded look, the crew checks and the panel's rows. The pixels are test/render/crew.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CrewDetail, CrewMember, CrewView } from '../../src/core/contract/crew.js';
import { palette } from '../../src/core/palette.js';
import { pick, project, startPose, startPoseAt, systemDepth } from '../../web/src/camera/pose.js';
import { checkCrew, checkCrewDetail } from '../../web/src/crew/check.js';
import { bodyRows, crewAnnouncement, crewDetailState, crewFileGroups, crewRows, RESCAN_NOTE } from '../../web/src/crew/detail.js';
import { belowShip, hullOccluders, placeShip, portholes, seatTrack, shipCorners, SHIP_FOOTPRINT, SHIP_MARGIN, shipPoint, shipSpot } from '../../web/src/crew/place.js';
import { crewStatus, riderOf, seatCrew } from '../../web/src/crew/select.js';
import { DRONE_LANE_OUT, DRONE_PICK_RADIUS, homeBody } from '../../web/src/drones/place.js';
import { FONT_HEIGHT } from '../../web/src/labels/font.js';
import { FPS, LOOP_SECONDS, loopPhase, ORBIT_FRAMES } from '../../web/src/model/motion.js';
import { FOG_SKY_TOP } from '../../web/src/model/fog-cloud.js';
import { planetCentre, planetReach, systemModel, type SystemModel } from '../../web/src/model/system.js';
import type { Vec3 } from '../../web/src/model/vec.js';
import { astronautLook, blinkAt, CONTRIBUTORS, figureLayout, figurePose, idleOf, type Ring } from '../../web/src/render/astronaut.js';
import { EYE_DESIGNS } from '../../web/src/render/faces.js';
import { shipBounds, shipGlsl } from '../../web/src/render/ship-glsl.js';
import { buildShip, CAP, crewPlan, CYCLE, flameAt, HULL, idleAt, lightOn, MAX_ABOARD, SHIP_SCALE, type ShipSpec, type Vec } from '../../web/src/render/ship-spec.js';
import { miniCrew, miniLayout } from '../fixtures/contract/mini.js';
import { selfLike, selfLikeRoots } from '../fixtures/overview.js';
import * as THREE from 'three';

const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, '../golden/crew.json'), 'utf8')) as { crew: CrewView; panels: CrewDetail[] };
const BLK_36: string[] = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/blk-36.published.json'), 'utf8')).colors;

/** n crew members with person ids in order; `captain` (an index) is you. */
function crewOf(n: number, captain: number | null = 0, over: Partial<CrewView> = {}): CrewView {
  const members: CrewMember[] = Array.from({ length: n }, (_, i) => ({ person: `p_${(i + 1).toString(16).padStart(12, '0')}` as CrewMember['person'], displayName: `Crew ${i}`, seed: (i * 2654435761) >>> 0, captain: i === captain }));
  return { schemaVersion: 'crew.1', head: miniLayout.source.head, members, total: n, bots: 0, needsRescan: false, ...over };
}

describe('who rides in which seat (C4, C9)', () => {
  it('the dev and render fixture is the crew fixture\'s own crew (test/golden/crew.json)', () => {
    expect(miniCrew.members).toEqual(GOLDEN.crew.members);
    expect([miniCrew.total, miniCrew.bots]).toEqual([GOLDEN.crew.total, GOLDEN.crew.bots]);
    expect(checkCrew(miniCrew).ok).toBe(true);
  });

  it('seats the captain in seat 0 and the teammates after, in person-id order, never by activity', () => {
    const s = seatCrew(miniCrew);
    expect(s.seats[0]!.captain).toBe(true);
    expect(s.seats[0]!.displayName).toBe('Nova Reyes');
    const mates = s.seats.slice(1).map((m) => m!.person);
    expect(mates).toEqual(miniCrew.members.filter((m) => !m.captain).map((m) => m.person));
    expect([...mates].sort()).toEqual(mates);
    expect(s.extra).toBe(0);
  });

  it('keeps seat 0 empty when you are not in the crew, and never gives a teammate the cap', () => {
    const s = seatCrew(crewOf(3, null));
    expect(s.seats).toHaveLength(4);
    expect(s.seats[0]).toBeNull();
    expect(s.seats.slice(1).every((m) => m && !m.captain)).toBe(true);
    expect(s.seats.map(riderOf)[0]).toBeNull();
    expect(crewStatus(s)).toContain('captain\'s seat empty');
  });

  it('seats 8 on one deck, 9–16 on two, and counts the rest as "+N", the captain always aboard', () => {
    for (const [n, decks, seated, extra] of [[1, 1, 1, 0], [8, 1, 8, 0], [9, 2, 9, 0], [16, 2, 16, 0], [17, 2, 16, 1], [40, 2, 16, 24]] as const) {
      const s = seatCrew(crewOf(n, n - 1)); // the captain sorts last by person id: still seat 0
      expect(s.seats).toHaveLength(seated);
      expect(s.seats[0]!.captain).toBe(true);
      expect(s.extra).toBe(extra);
      expect(crewPlan(s.seats.length).decks).toBe(decks);
      expect(buildShip(s.seats.length).seats).toHaveLength(seated);
      if (extra > 0) expect(crewStatus(s)).toContain(`+${extra}`);
    }
    expect(MAX_ABOARD).toBe(16);
  });

  it('draws nobody, and says "rescan", for a snapshot from before #207', () => {
    const s = seatCrew({ ...crewOf(0), needsRescan: true });
    expect(s.seats).toEqual([]);
    expect(crewStatus(s)).toBe('rescan to see your crew');
  });

  it('says repo totals only: aboard, not seated, bots left out (Rule 1), never a per-person number (Rule 6)', () => {
    expect(crewStatus(seatCrew(miniCrew))).toBe('crew: 6 aboard, 2 bot or agent authors left out');
    expect(crewStatus(seatCrew(crewOf(0)))).toBe('crew: nobody in the scan window');
  });
});

/** The hull's capsule ('body', a round cone of equal radii) as a JS distance field, the lab's bodyDist. */
function bodyDist(s: ShipSpec, p: Vec): number {
  const body = s.parts.find((q) => q.id === 'body')!;
  if (body.kind !== 'cone') throw new Error('the body is a capsule');
  const t = Math.max(0, Math.min(1, (p[1] - body.a[1]) / (body.b[1] - body.a[1])));
  const y = body.a[1] + t * (body.b[1] - body.a[1]);
  return Math.hypot(p[0], p[1] - y, p[2]) - body.r1;
}

describe('the R2-4c hull and its seats (C2; the ship lab\'s broken cases)', () => {
  const ships = [1, 3, 6, 8, 9, 12, 16].map((n) => [n, buildShip(n)] as const);

  it('has a porthole per seat, every one alike (one size, one grey rim), the captain\'s at the top on the axis, on the red belly band', () => {
    for (const [n, s] of ships) {
      expect(s.windows).toHaveLength(n);
      expect(s.seats).toHaveLength(n);
      expect(new Set(s.windows.map((w) => `${w.angle.toFixed(6)}|${w.frameSlot}`)).size, `n=${n}`).toBe(1);
      expect(s.windows.every((w) => w.frameSlot === 'metal')).toBe(true);
      expect(s.seats[0]!.captain).toBe(true);
      expect(s.seats.slice(1).some((x) => x.captain)).toBe(false);
      const top = (i: number) => s.windows[i]!.c[1] + s.windows[i]!.n[1] * HULL.R;
      for (let i = 1; i < n; i++) expect(top(i)).toBeLessThanOrEqual(top(0) + 1e-9);
      expect(Math.abs(s.windows[0]!.n[0])).toBeLessThan(1e-9);
      // R2-4's red belly band, exactly (ship lab R2-4c-final, 383cf22): trim on the body from cy − 0.3 to top + 0.12
      const body = s.parts.find((p) => p.id === 'body')!, belly = s.bands.filter((b) => b.part === 'body');
      if (body.kind !== 'cone') throw new Error('the body is a capsule');
      expect(belly).toHaveLength(1);
      expect(belly[0]!.slot).toBe('trim');
      expect(belly[0]!.y0).toBeCloseTo(body.a[1] - 0.3, 9);
      expect(belly[0]!.y1).toBeCloseTo(body.b[1] + 0.12, 9);
    }
  });

  it('lays the teammates out in three straight columns, rows of three by person id, a short last row centred on the columns', () => {
    const yaws = (n: number) => buildShip(n).windows.slice(1).map((w) => +Math.atan2(w.n[0], w.n[2]).toFixed(4));
    const cols = new Set(yaws(16));
    expect(cols.size).toBe(3);
    expect(yaws(8)).toEqual([-0.54, 0, 0.54, -0.54, 0, 0.54, 0]); // 7 teammates: two full rows, then one in the middle
    expect(yaws(3)).toEqual([-0.54, 0.54]); // 2 teammates: the sides
    // each column is one straight vertical line: its portholes share a yaw and step down by the row pitch
    const s = buildShip(16), rows = s.windows.slice(1).map((w) => +(w.c[1] + w.n[1] * HULL.R).toFixed(3));
    expect(new Set(rows).size).toBe(5);
  });

  it('turns no porthole more than 0.62 rad from the front (past that a helmet hides in the hull\'s depth)', () => {
    for (const [, s] of ships) for (const w of s.windows) expect(Math.abs(Math.atan2(w.n[0], w.n[2]))).toBeLessThanOrEqual(0.62 + 1e-9);
  });

  it('keeps every astronaut inside the hull to the boots, with room for the bob (no row below the lower sphere\'s equator)', () => {
    for (const [n, s] of ships) {
      s.seats.forEach((c, i) => {
        const fwd = [Math.sin(c.yaw), 0, Math.cos(c.yaw)];
        const sole: Vec = [c.p[0], c.p[1] + 0.03 - 0.05, c.p[2]];
        const toe: Vec = [sole[0] + 0.09 * fwd[0]!, sole[1], sole[2] + 0.09 * fwd[2]!];
        expect(bodyDist(s, sole), `n=${n} seat ${i} boot`).toBeLessThan(-0.02);
        expect(bodyDist(s, toe), `n=${n} seat ${i} toe`).toBeLessThan(-0.02);
      });
    }
  });

  it('never stacks two helmets in one place (the ship lab\'s 0.35 apart: each is seen only through its own porthole)', () => {
    for (const [, s] of ships) {
      const helmets = s.seats.map((c) => [c.p[0], c.p[1] + 0.709, c.p[2]]);
      for (let i = 0; i < helmets.length; i++) for (let j = i + 1; j < helmets.length; j++) {
        expect(Math.hypot(...helmets[i]!.map((x, k) => x - helmets[j]![k]!))).toBeGreaterThanOrEqual(0.35);
      }
    }
  });

  it('keeps its shape as people join: the hull is the same for 1 to 8 and for 9 to 16; a second deck adds rows', () => {
    const hull = (s: ShipSpec) => JSON.stringify(s.parts.filter((q) => !q.id.startsWith('port')));
    expect(new Set([1, 3, 8].map((n) => hull(buildShip(n)))).size).toBe(1);
    expect(new Set([9, 12, 16].map((n) => hull(buildShip(n)))).size).toBe(1);
    const h = (n: number) => { const b = shipBounds(buildShip(n), 0); return b.hi[1] - b.lo[1]; };
    expect(h(16)).toBeGreaterThan(h(8));
  });

  it('compiles the hull and the flameless cap (stand-ins for the flame, ship lab test 4), with no colour in the GLSL', () => {
    const hull = shipGlsl(buildShip(6)), cap = shipGlsl(CAP);
    for (const g of [hull, cap]) {
      expect(g).toContain('float hull(vec3 p)');
      expect(g).toContain('float flameField(vec3 p, out int jj)');
      expect(g).toContain('const vec3 FLAME_A[');
    }
    expect(cap).toContain('no flame (the cap)');
    expect(CAP.flames).toHaveLength(0);
  });
});

describe('motion is loop-locked to the crew\'s 12 s cycle (art-direction §7)', () => {
  const times = [0, 0.37, 3.1, 7.25, 11.9];
  it('the ship\'s idle, flame and beacon are the same one cycle later, and 12 s divides the 48 s loop', () => {
    expect(48 % CYCLE).toBe(0);
    for (const t of times) {
      expect(idleAt(t + CYCLE)).toEqual(idleAt(t));
      expect(flameAt(t + CYCLE)).toEqual(flameAt(t));
      expect(lightOn({ c: [0, 0, 0], r: 0.1, phase: 0 }, t + CYCLE)).toBe(lightOn({ c: [0, 0, 0], r: 0.1, phase: 0 }, t));
    }
  });

  it('an astronaut\'s bob, sway, bends and blink are the same one cycle later', () => {
    const L = figureLayout();
    const at = (t: number) => {
      const joints = Array.from({ length: 12 }, () => new THREE.Vector3()), rings: Ring[] = [];
      figurePose(L, t, CYCLE, joints, rings);
      return [...joints.map((j) => j.toArray()), ...rings.map((r) => [...r.c.toArray(), r.r])].flat();
    };
    for (const t of times) {
      at(t + CYCLE).forEach((v, i) => expect(v).toBeCloseTo(at(t)[i]!, 9));
      const a = idleOf(t), b = idleOf(t + CYCLE);
      expect(b.bob).toBeCloseTo(a.bob, 9); expect(b.roll).toBeCloseTo(a.roll, 9); expect(b.pitch).toBeCloseTo(a.pitch, 9);
      expect(blinkAt(t + CYCLE, 1.3)).toBeCloseTo(blinkAt(t, 1.3), 9);
    }
    expect(Math.min(...Array.from({ length: CYCLE * FPS }, (_, f) => blinkAt(f / FPS, 0)))).toBeLessThan(0.5); // it does blink, once a cycle
  });
});

describe('each crew member\'s look comes from their seed alone (§8, principle 4)', () => {
  it('picks one of the ten V2 eye designs and one contributor colour, and starts the idle on a whole frame', () => {
    const looks = Array.from({ length: 400 }, (_, i) => astronautLook((i * 2654435761) >>> 0));
    expect(new Set(looks.map((l) => l.eyes))).toEqual(new Set(EYE_DESIGNS.map((_, i) => i)));
    expect(new Set(looks.map((l) => l.colour))).toEqual(new Set(CONTRIBUTORS));
    for (const l of looks) {
      expect(Math.abs(l.phase * FPS - Math.round(l.phase * FPS))).toBeLessThan(1e-9);
      expect(l.phase).toBeGreaterThanOrEqual(0);
      expect(l.phase).toBeLessThan(CYCLE);
    }
    expect(astronautLook(miniCrew.members[0]!.seed)).toEqual(astronautLook(miniCrew.members[0]!.seed));
  });

  it('draws only BLK 36: the suit, gear, visor, glint and contributor colours, and the ship\'s', () => {
    const crew = [...palette.crew.suit, ...palette.crew.gear, ...palette.crew.visor, palette.crew.glint, ...Object.values(palette.crew.contributors).flat()];
    const ship = Object.values(palette.ship).flatMap((part) => Object.values(part).flat());
    expect([...crew, ...ship].filter((h) => !BLK_36.includes(h))).toEqual([]);
    expect([...crew, ...ship].filter((h) => (palette.accent.teal as readonly string[]).includes(h))).toEqual([]);
  });
});

describe('where the ship is (C4)', () => {
  const models = [miniLayout, selfLike, selfLikeRoots].map(systemModel);

  it('is a pure function of the model and frame, and turns with the orbits: one whole orbit on, it is back', () => {
    for (const m of models) {
      expect(placeShip(m, 1234)).toEqual(placeShip(m, 1234));
      const a = placeShip(m, 0), b = placeShip(m, ORBIT_FRAMES);
      b.centre.forEach((v, i) => expect(v).toBeCloseTo(a.centre[i]!, 9));
      expect(b.yaw).toBeCloseTo(a.yaw, 9);
    }
  });

  it('faces the start pose\'s camera at frame 0, so the crew in its front portholes shows', () => {
    for (const m of models) {
      const at = placeShip(m, 0), start = startPose(m);
      expect(at.yaw).toBeCloseTo(start.yaw, 12);
      // every porthole faces the eye of the start pose
      const eye = [0, 1, 2].map((i) => start.target[i]! + start.dist * [Math.sin(start.yaw) * Math.cos(start.pitch), Math.sin(start.pitch), Math.cos(start.yaw) * Math.cos(start.pitch)][i]!);
      for (const h of portholes(buildShip(16), at, 0)) expect(h.normal.reduce((a, n, i) => a + n * (eye[i]! - h.centre[i]!), 0)).toBeGreaterThan(0);
    }
  });

  it('stays clear of the star\'s drone lane and of every planet\'s reach and drone lane, at any frame', () => {
    const spec = buildShip(16), { lo, hi } = shipBounds(spec, 0);
    const corners: Vec[] = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
    for (const m of models) {
      const at = placeShip(m, 0);
      const star = homeBody(m, 'star', 0)!;
      const ring = Math.hypot(at.centre[0], at.centre[2]);
      expect(ring - SHIP_FOOTPRINT).toBeGreaterThanOrEqual(star.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS + SHIP_MARGIN - 1e-9);
      const bottom = at.centre[1] + lo[1] * SHIP_SCALE - 0.07 * SHIP_SCALE; // the flame's tip at the bob's lowest
      for (const p of m.planets) {
        // the drones' own circle round the planet (drones/place.ts homeBody: its reach or its fog sky's top, #225)
        const clear = homeBody(m, p.dirId, 0)!.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS;
        // the ship's footprint at its lowest point keeps SHIP_MARGIN from that tube (shipSpot's floor)
        const gap = Math.max(0, p.orbit - (ring + SHIP_FOOTPRINT), ring - SHIP_FOOTPRINT - p.orbit);
        expect(Math.hypot(gap, bottom), `${p.path}: the margin from its drones' lane`).toBeGreaterThanOrEqual(clear + SHIP_MARGIN - 1e-9);
        // the nearest a planet's swept tube (its orbit circle, radius `clear`) comes to the ship's lowest ring of points
        for (const c of corners) {
          const w = shipPoint(at, c, 0), rho = Math.hypot(w[0], w[2]);
          const y = Math.min(w[1], bottom);
          expect(Math.hypot(rho - p.orbit, y), `${p.path}`).toBeGreaterThan(clear);
        }
      }
    }
  });

  it('keeps SHIP_MARGIN from a planet\'s drone lane where its fog sky reaches past its moons and weather (#225: the drones circle the sky)', () => {
    // mini's docs planet (no moons: its fog cloud's top, 1.20 radii since #228, is past its reach) moved out to orbit 1.6 past the ship's footprint
    const m = systemModel(miniLayout), ring = Math.hypot(shipSpot(m).centre[0], shipSpot(m).centre[2]);
    const docs = m.planets.find((p) => p.path === 'docs')!;
    expect(docs.radius * FOG_SKY_TOP).toBeGreaterThan(planetReach(docs));
    for (const gap of [0, 0.4, 0.8, 1.2, 1.6, 2]) {
      const moved: SystemModel = { ...m, planets: [{ ...docs, orbit: ring + SHIP_FOOTPRINT + gap }] };
      const bottom = placeShip(moved, 0).centre[1] + shipBounds(buildShip(16), 0).lo[1] * SHIP_SCALE - 0.07 * SHIP_SCALE;
      const lane = homeBody(moved, docs.dirId, 0)!.reach + DRONE_LANE_OUT + DRONE_PICK_RADIUS;
      expect(Math.hypot(gap, bottom), `gap ${gap}`).toBeGreaterThanOrEqual(lane + SHIP_MARGIN - 1e-9);
    }
  });

  it('with no crew, the start pose and depth fade are exactly the layout\'s own (nothing without a crew moves)', () => {
    for (const m of models) {
      expect(startPose(m, shipCorners(m, null))).toEqual(startPose(m));
      expect(systemDepth(m, startPose(m, []))).toEqual(systemDepth(m));
    }
  });

  it('with a crew, the start pose frames the whole ship and every body, the ship on the star\'s left (clear of the review panel\'s top right)', () => {
    for (const m of models) for (const n of [1, 6, 16]) {
      const corners = shipCorners(m, buildShip(n)), pose = startPose(m, corners);
      const inFit = (p: Vec3) => { const q = project(pose, p); return q !== null && Math.abs(q.x) <= 0.92 + 1e-9 && Math.abs(q.y) <= 0.85 + 1e-9; };
      expect(corners.every(inFit), `n=${n}`).toBe(true);
      expect(m.planets.every((p) => inFit(planetCentre(p, 0)))).toBe(true);
      expect(inFit([0, 0, 0])).toBe(true);
      expect(project(pose, placeShip(m, 0).centre)!.x).toBeLessThan(project(pose, [0, 0, 0])!.x);
      // Home later: the same framing turned with the orbits, the ship still fully in it
      const later = startPoseAt(m, 9000, corners), at = placeShip(m, 9000);
      const { lo, hi } = shipBounds(buildShip(n), 0);
      for (const x of [lo[0], hi[0]]) for (const z of [lo[2], hi[2]]) for (const y of [lo[1], hi[1]]) {
        const q = project(later, shipPoint(at, [x, y, z], 0))!;
        expect(Math.abs(q.x)).toBeLessThanOrEqual(0.93); expect(Math.abs(q.y)).toBeLessThanOrEqual(0.87);
      }
    }
  });

  it('puts the "+N" label under the ship\'s axis, below every point of it on screen (the flame and the feet too), in the start view', () => {
    const W = 1280, H = 720, px = 2;
    for (const m of models) {
      const spec = buildShip(MAX_ABOARD), pose = startPose(m, shipCorners(m, spec)), { lo, hi } = shipBounds(spec, 0);
      for (const frame of [0, 37, 9000]) {
        const at = placeShip(m, frame), t = loopPhase(frame) * LOOP_SECONDS, view = startPoseAt(m, frame, shipCorners(m, spec));
        for (const p of [pose, view]) {
          const u = belowShip(m, spec, frame, p, W, H)!, axis = project(p, at.centre)!;
          expect(u.x).toBeCloseTo(((axis.x + 1) / 2) * W, 9);
          // the box round the hull, the flame at its longest and the feet: every corner is above the label's top
          for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
            const q = project(p, shipPoint(at, [x, y, z], t))!;
            expect(((1 - q.y) / 2) * H, `frame ${frame}`).toBeLessThanOrEqual(u.y + 1e-9);
          }
          // the label's backing, one font px above its top (labels/overlay.ts labelBox), to its line's bottom
          const top = u.y + 2 * px - px, bottom = top + (FONT_HEIGHT + 2) * px;
          expect(top).toBeGreaterThan(u.y);
          if (p === view) expect(bottom, 'the label is in the start view').toBeLessThanOrEqual(H);
        }
      }
    }
  });

  it('tracks the selected porthole over the next idle cycle with the ship\'s orbit, not just its idle (Qodo PR #227 aa8bd7a5)', () => {
    const m = models[0]!, spec = buildShip(6), pose = startPose(m, shipCorners(m, spec)), W = 1280, H = 720, frame = 100;
    const track = seatTrack(m, spec, 0, frame, pose, { x: 0, y: 0, w: W, h: H });
    expect(track.length).toBeGreaterThan(1);
    const step = (CYCLE * FPS) / track.length;
    track.forEach((box, k) => {
      const f = frame + k * step, hole = portholes(spec, placeShip(m, f), loopPhase(f) * LOOP_SECONDS)[0]!, q = project(pose, hole.centre)!;
      expect(box.x + box.w / 2, `sample ${k}`).toBeCloseTo(((q.x + 1) / 2) * W, 6);
      expect(box.y + box.h / 2, `sample ${k}`).toBeCloseTo(((1 - q.y) / 2) * H, 6);
    });
  });

  it('hides what is behind its hull from a click: a planet seen through the ship can\'t be picked (Qodo PR #227)', () => {
    for (const m of models) {
      const spec = buildShip(6), at = placeShip(m, 0), body = spec.parts.find((p) => p.id === 'body')!;
      if (body.kind !== 'cone') throw new Error('the body is a capsule');
      const mid = shipPoint(at, [0, (body.a[1] + body.b[1]) / 2, 0], 0);
      const planet = m.planets[0]!, c = planetCentre(planet, 0), sphere = { centre: c, radius: planet.radius };
      /** A pose looking at the planet from `eye`. */
      const from = (eye: Vec3) => {
        const d = [eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]] as const, dist = Math.hypot(...d);
        return { target: c, yaw: Math.atan2(d[0], d[2]), pitch: Math.asin(d[1] / dist), dist };
      };
      const away = [mid[0] - c[0], mid[1] - c[1], mid[2] - c[2]], n = Math.hypot(...away);
      const behindShip = from([mid[0] + (away[0]! / n) * 6, mid[1] + (away[1]! / n) * 6, mid[2] + (away[2]! / n) * 6]);
      const clear = from([c[0] - (away[0]! / n) * 6, c[1] - (away[1]! / n) * 6, c[2] - (away[2]! / n) * 6]);
      const hull = hullOccluders(m, spec, 0);
      expect(pick(behindShip, { x: 0, y: 0 }, [sphere])).toBe(0); // not vacuous: without the hull the planet is hit
      expect(pick(behindShip, { x: 0, y: 0 }, [sphere], hull)).toBeNull();
      expect(pick(clear, { x: 0, y: 0 }, [sphere], hull)).toBe(0); // the ship behind the planet hides nothing
    }
  });

  it('places the same ship however many ride, so nobody joining moves it', () => {
    expect(shipSpot(models[0]!)).toEqual(shipSpot(models[0]!));
    expect(placeShip(models[0]!, 0)).toEqual(placeShip(models[0]!, 0, shipSpot(models[0]!)));
  });
});

describe('the crew checks (C7, Rule 6)', () => {
  it('accepts the crew fixture\'s crew view and every member\'s panel', () => {
    expect(checkCrew(GOLDEN.crew)).toEqual({ ok: true, value: GOLDEN.crew });
    for (const p of GOLDEN.panels) expect(checkCrewDetail(p).ok, p.person).toBe(true);
  });

  it('accepts any author name, path or number of files the server sends, so none hides the crew or a panel (Qodo PR #227 2392a9d2)', () => {
    const long = 'Nova '.repeat(1000); // 5000 characters: git sets no limit, and neither does the server
    const view = { ...GOLDEN.crew, members: GOLDEN.crew.members.map((m, i) => (i === 0 ? { ...m, displayName: long } : m)) };
    expect(checkCrew(view)).toEqual({ ok: true, value: view });
    const p = GOLDEN.panels.find((x) => x.files.length > 0)!, home = p.files[0]!.home;
    const file = (id: string, path: string): CrewDetail['files'][number] => ({ fileId: id as CrewDetail['files'][number]['fileId'], path, home, touches: 1 });
    const files = Array.from({ length: 20_001 }, (_, i) => file(`f_${i.toString(16).padStart(12, '0')}`, `big/f${String(i).padStart(6, '0')}.ts`));
    files.push(file('f_ffffffffffff', `big/${'z'.repeat(5000)}.ts`));
    const big: CrewDetail = { ...p, displayName: long, files };
    expect(checkCrewDetail(big).ok).toBe(true);
    // what the view prints stays bounded: the panel's name row, the HUD's selected name, the announcement
    const m = view.members[0]!;
    expect(crewRows(m, null)[0]![1].length).toBeLessThanOrEqual(120);
    expect(crewAnnouncement({ kind: 'ready', detail: big }, { ...m, captain: false })!.length).toBeLessThan(200);
  });

  it('refuses a member with any count (a ranking waiting to happen), members out of person-id order, or two captains', () => {
    const c = GOLDEN.crew;
    const bad = (v: unknown) => checkCrew(v).ok;
    expect(bad({ ...c, members: c.members.map((m, i) => (i === 0 ? { ...m, commits: 3 } : m)) })).toBe(false);
    expect(bad({ ...c, members: [...c.members].reverse() })).toBe(false);
    expect(bad({ ...c, members: c.members.map((m) => ({ ...m, captain: true })) })).toBe(false);
    expect(bad({ ...c, total: 5 })).toBe(false);
    expect(bad({ ...c, needsRescan: true })).toBe(false);
    expect(bad({ ...c, members: c.members.map((m, i) => (i === 0 ? { ...m, seed: -1 } : m)) })).toBe(false);
  });

  it('refuses a panel whose files are out of folder order, or that has numbers while it needs a rescan', () => {
    const p = GOLDEN.panels.find((x) => x.files.length > 1)!;
    expect(checkCrewDetail({ ...p, files: [...p.files].reverse() }).ok).toBe(false);
    expect(checkCrewDetail({ ...p, needsRescan: true }).ok).toBe(false);
    expect(checkCrewDetail({ ...p, lastActive: null }).ok).toBe(false);
    expect(checkCrewDetail({ ...p, files: p.files.map((f) => ({ ...f, touches: 0 })) }).ok).toBe(false);
    expect(checkCrewDetail({ ok: false, error: 'no-such-person' }).ok).toBe(true);
    expect(checkCrewDetail({ ok: false, error: 'unknown-head', head: 'a'.repeat(40) }).ok).toBe(true);
    expect(checkCrewDetail({ ok: false, error: 'no-such-person', head: 'a'.repeat(40) }).ok).toBe(false);
  });
});

describe('the panel\'s words (C5, Rule 6\'s astronaut-panel exception)', () => {
  const nova = GOLDEN.panels.find((p) => p.captain)!;
  const bram = GOLDEN.panels.find((p) => p.displayName === 'Bram Tiller')!;
  const member = (d: CrewDetail): CrewMember => GOLDEN.crew.members.find((m) => m.person === d.person)!;

  it('the captain\'s panel says it\'s you; a teammate\'s says teammate; both say when they were last active', () => {
    expect(crewRows(member(nova), nova)).toEqual([['name', 'Nova Reyes'], ['role', 'captain: you'], ['last active', `${nova.lastActive!.replace('T', ' ').replace('Z', '')} UTC`]]);
    expect(crewRows(member(bram), bram)[1]).toEqual(['role', 'teammate']);
  });

  it('lists the planets by name (the star first) and the files by folder, each with its touch count, never by count', () => {
    const names: Record<string, string> = Object.fromEntries(miniLayout.planets.map((p) => [p.dirId, p.path]));
    const esme = GOLDEN.panels.find((p) => p.displayName === 'Esme Holt')!;
    const rows = bodyRows(esme, (h) => names[h] ?? null);
    expect(rows[0]).toEqual({ name: 'the star (root files)', touches: '1 touch' });
    expect(rows.slice(1).map((r) => r.name)).toEqual([...rows.slice(1).map((r) => r.name)].sort());
    const groups = crewFileGroups(bram.files);
    expect(groups).toEqual([{ folder: 'ui/', files: [{ name: 'nav.ts', edits: '2 touches' }, { name: 'panel.ts', edits: '1 touch' }] }]);
    // reordering by count would put the 2 first anyway here: check a case where it wouldn't
    const flipped = crewFileGroups([{ ...bram.files[0]!, touches: 1 }, { ...bram.files[1]!, touches: 9 }]);
    expect(flipped[0]!.files.map((f) => f.name)).toEqual(['nav.ts', 'panel.ts']);
  });

  it('says one short line with no total or count, and "rescan" for an old snapshot instead of an empty panel', () => {
    const line = crewAnnouncement({ kind: 'ready', detail: bram }, member(bram));
    expect(line).toBe('showing what Bram Tiller touched in the scan window');
    expect(line).not.toMatch(/\d/);
    expect(crewAnnouncement({ kind: 'ready', detail: nova }, member(nova))).toBe('showing what you touched in the scan window');
    const old: CrewDetail = { ...bram, needsRescan: true, lastActive: null, planets: [], files: [], otherFiles: 0 };
    expect(crewDetailState(old, bram.person, bram.head)).toEqual({ kind: 'note', text: RESCAN_NOTE });
    expect(crewDetailState(bram, nova.person, bram.head).kind).toBe('failed'); // an answer for someone else is never shown
    expect(crewDetailState({ ok: false, error: 'unknown-head', head: 'a'.repeat(40) }, bram.person, bram.head).kind).toBe('failed');
  });
});
