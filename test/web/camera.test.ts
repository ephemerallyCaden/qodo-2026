// Camera maths and the free-flight rig (#30): pure, so picking, labels and the renderer agree.
import { describe, expect, it } from 'vitest';
import { FOCUS_FILL, FOV_DEG, eyeOf, focusPose, framingDistance, fromCameraPose, pick, project, projectedRadius, startPose, startPoseAt, toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { FreeFlightRig, GLIDE_MS, MIN_FOCUS_DIST, type FlyKey } from '../../web/src/camera/rig.js';
import { coronaEdge, starOccluders } from '../../web/src/render/corona.js';
import { STAR } from '../../web/src/render/shaders.js';
import { placeLabels } from '../../web/src/labels/place.js';
import { LOOP_FRAMES } from '../../web/src/model/motion.js';
import { CORONA } from '../../web/src/model/star.js';
import { planetCentre, planetReach, systemModel } from '../../web/src/model/system.js';
import type { Vec3 } from '../../web/src/model/vec.js';
import { miniLayout } from '../fixtures/contract/mini.js';

const POSE: OrbitPose = { target: [1, 2, 3], yaw: 0.6, pitch: 0.3, dist: 9 };
const close = (a: number[], b: number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('poses', () => {
  it('round-trips through the contract CameraPose', () => {
    const c = toCameraPose(POSE);
    expect(c.fovDeg).toBe(FOV_DEG);
    const back = fromCameraPose(c);
    close(back.target, POSE.target);
    close([back.yaw, back.pitch, back.dist], [POSE.yaw, POSE.pitch, POSE.dist]);
  });

  it("keeps a caller's field of view, and projects with it", () => {
    const wide = fromCameraPose({ ...toCameraPose(POSE), fovDeg: 70 });
    expect(wide.fovDeg).toBe(70);
    expect(toCameraPose(wide).fovDeg).toBe(70);
    const off: [number, number, number] = [POSE.target[0], POSE.target[1] + 1, POSE.target[2]];
    expect(project(wide, off)!.y).toBeLessThan(project(POSE, off)!.y); // wider view: the same point sits nearer the centre
    expect(focusPose(wide, [0, 0, 0], 1).fovDeg).toBe(70);
  });

  it('survives a degenerate pose (eye on the target)', () => {
    expect(fromCameraPose({ position: [1, 1, 1], target: [1, 1, 1], fovDeg: 35 }).dist).toBe(1);
  });

  it('projects the target to the centre and refuses points behind the eye', () => {
    const p = project(POSE, POSE.target)!;
    close([p.x, p.y, p.depth], [0, 0, 9]);
    const eye = eyeOf(POSE);
    const behind: [number, number, number] = [eye[0] * 2 - POSE.target[0], eye[1] * 2 - POSE.target[1], eye[2] * 2 - POSE.target[2]];
    expect(project(POSE, behind)).toBeNull();
  });

  it('frames a focused planet at 45% of the frame height', () => {
    const f = focusPose(POSE, [10, 0, 0], 0.7);
    expect(f.target).toEqual([10, 0, 0]);
    expect(projectedRadius(0.7, f.dist)).toBeCloseTo(FOCUS_FILL, 9); // radius as a share of half the frame = diameter share
  });

  it('starts with every body of the mini system in frame', () => {
    const m = systemModel(miniLayout);
    const start = startPose(m);
    for (const p of m.planets) {
      const c = planetCentre(p, 0), r = planetReach(p);
      for (const d of [[r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r]]) {
        const s = project(start, [c[0] + d[0]!, c[1] + d[1]!, c[2] + d[2]!])!;
        expect(Math.abs(s.x)).toBeLessThanOrEqual(0.92 + 1e-6);
        expect(Math.abs(s.y)).toBeLessThanOrEqual(0.85 + 1e-6);
      }
    }
  });

  it('frames the system tightly: its bodies span the frame, centred', () => {
    const m = systemModel(miniLayout);
    const start = startPose(m);
    const xs = m.planets.flatMap((p) => { const c = planetCentre(p, 0), r = planetReach(p); return [project(start, [c[0] - r, c[1], c[2]])!.x, project(start, [c[0] + r, c[1], c[2]])!.x]; });
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 1); // centred, not hugging one edge
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.5); // and filling most of the width
  });

  it('turns the start pose with the orbits (#60): at any frame it frames the system as frame 0 does, every body as far from the eye', () => {
    const m = systemModel(miniLayout);
    const s0 = startPose(m);
    expect(startPoseAt(m, 0)).toEqual(s0);
    for (const f of [LOOP_FRAMES, 4500, 13_333]) { // one loop on, and two frames inside the orbit
      const s = startPoseAt(m, f);
      expect([s.pitch, s.dist]).toEqual([s0.pitch, s0.dist]);
      for (const p of m.planets) {
        const a = project(s0, planetCentre(p, 0))!, b = project(s, planetCentre(p, f))!;
        close([b.x, b.y, b.depth], [a.x, a.y, a.depth]); // same place on screen, same distance: the same depth fade (#59)
      }
      const fixed = project(s0, planetCentre(m.planets[2]!, f))!; // the frame-0 pose, held: the planets have moved in it
      expect(Math.hypot(fixed.x - project(s0, planetCentre(m.planets[2]!, 0))!.x, fixed.y - project(s0, planetCentre(m.planets[2]!, 0))!.y)).toBeGreaterThan(0.01);
    }
  });

  it('frames a lone star like a focused planet', () => {
    const empty = systemModel({ ...miniLayout, planets: [], star: { ...miniLayout.star, moonlets: [] } });
    const s = startPose(empty);
    expect(projectedRadius(empty.star.radius, s.dist)).toBeCloseTo(FOCUS_FILL, 6);
    expect(s.target).toEqual([0, 0, 0]);
  });
});

describe('picking', () => {
  const view: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0, dist: 10 };
  it('picks the nearest sphere under the point', () => {
    const bodies = [{ centre: [0, 0, -5] as [number, number, number], radius: 1 }, { centre: [0, 0, 0] as [number, number, number], radius: 1 }];
    expect(pick(view, { x: 0, y: 0 }, bodies)).toBe(1);
    expect(pick(view, { x: 0.9, y: 0.9 }, bodies)).toBeNull();
  });

  it('never picks a planet hidden behind a blocker (the star)', () => {
    const behind = [{ centre: [0, 0, -5] as [number, number, number], radius: 1 }];
    expect(pick(view, { x: 0, y: 0 }, behind)).toBe(0);
    expect(pick(view, { x: 0, y: 0 }, behind, [{ centre: [0, 0, 0], radius: 1 }])).toBeNull();
    expect(pick(view, { x: 0, y: 0 }, behind, [{ centre: [0, 0, -9], radius: 1 }])).toBe(0); // a blocker behind it doesn't
  });

  it('grows far, small bodies to a clickable size', () => {
    const tiny = [{ centre: [0.05, 0, 0] as [number, number, number], radius: 0.001 }];
    expect(pick(view, { x: 0, y: 0 }, tiny)).toBe(0);
  });
});

describe('labels', () => {
  const view: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0, dist: 10 };
  const W = 1280, H = 720;
  it('hides a planet behind a nearer one or the star', () => {
    const near = { centre: [0, 0, 2] as [number, number, number], radius: 1 };
    const far = { centre: [0, 0, -4] as [number, number, number], radius: 0.5 };
    const side = { centre: [3, 0, 0] as [number, number, number], radius: 0.5 };
    expect(placeLabels(view, [near, far, side], [], W, H, 4, 50).map((l) => l.i)).toEqual([0, 2]);
    expect(placeLabels(view, [far, side], [{ centre: [0, 0, 0], radius: 1 }], W, H, 4, 50).map((l) => l.i)).toEqual([1]);
    const peeking = { centre: [0, 2.2, -4] as [number, number, number], radius: 0.5 }; // its label would land on near's disc
    expect(placeLabels(view, [near, peeking], [], W, H, 4, 50).map((l) => l.i)).toEqual([0]);
  });

  it('puts labels under the disc and keeps the nearest when capped', () => {
    const a = { centre: [-2, 0, 1] as [number, number, number], radius: 0.5 };
    const b = { centre: [2, 0, -1] as [number, number, number], radius: 0.5 };
    const placed = placeLabels(view, [b, a], [], W, H, 4, 1);
    expect(placed.map((l) => l.i)).toEqual([1]);
    expect(placed[0]!.y).toBeGreaterThan(H / 2);
    expect(placeLabels(view, [a], [], W, H, 4, 0)).toEqual([]);
  });
});

describe('the star hides what its corona draws over, and only that (Qodo 1ce5dd3d, 9ba6148c on #155)', () => {
  // A unit star at the origin, seen from 10 units out on +z at frame 0: the shader draws its corona in
  // the plane z = 0 out to a lumpy edge (coronaEdge, at most CORONA.reach star radii), and a ray that
  // crosses that plane inside the edge meets the corona.
  const view: OrbitPose = { target: [0, 0, 0], yaw: 0, pitch: 0, dist: 10 };
  const W = 1280, H = 720;
  const edgeAt = (deg: number) => coronaEdge([Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)], 0);
  const degrees = Array.from({ length: 360 }, (_, k) => k);
  const gapDeg = degrees.reduce((a, b) => (edgeAt(b) < edgeAt(a) ? b : a)), lumpDeg = degrees.reduce((a, b) => (edgeAt(b) > edgeAt(a) ? b : a));
  const between = (edgeAt(gapDeg) + edgeAt(lumpDeg)) / 2; // past the edge in the gap, inside it in the lump
  /** A small planet at depth z whose line of sight crosses the star's plane `at` star radii from its centre, toward `deg`. */
  const seenAt = (at: number, z: number, deg: number) => {
    const k = (at * (10 - z)) / 10, a = (deg * Math.PI) / 180;
    return { centre: [k * Math.cos(a), k * Math.sin(a), z] as Vec3, radius: 0.01 };
  };
  const ring = seenAt((1 + CORONA.halo) / 2, -5, 0); // behind the corona's ring inside its lowest edge: always drawn over
  const lump = seenAt(between, -5, lumpDeg); // behind a lump
  const gap = seenAt(between, -5, gapDeg); // just as far out, but behind a gap between lumps: visible
  const beside = seenAt(CORONA.reach + 0.15, -5, 90); // past the corona's reach
  const before = seenAt((1 + CORONA.halo) / 2, 0.3, 180); // in front of the corona's plane, inside a sphere of its reach
  const at = (s: { centre: Vec3 }) => { const p = project(view, s.centre)!; return { x: p.x, y: p.y }; };

  it('the corona reaches past the disc, stays inside the star mesh, and its edge is lumpy and churns', () => {
    expect(CORONA.halo).toBeGreaterThan(1);
    expect(CORONA.reach).toBeLessThan(STAR.span);
    expect(edgeAt(gapDeg)).toBeGreaterThanOrEqual(CORONA.halo);
    expect(edgeAt(lumpDeg)).toBeLessThanOrEqual(CORONA.reach);
    expect(edgeAt(lumpDeg) - edgeAt(gapDeg), 'lumps and gaps differ by more than the planet').toBeGreaterThan(0.04);
    expect(degrees.some((d) => Math.abs(coronaEdge([Math.cos(d), Math.sin(d)], 360) - coronaEdge([Math.cos(d), Math.sin(d)], 0)) > 0.01), 'it churns').toBe(true);
    expect(Math.hypot(...before.centre) - before.radius).toBeGreaterThan(1); // clear of the star itself
    expect(Math.hypot(...before.centre)).toBeLessThan(CORONA.reach); // so a corona sphere would wrongly hide it
  });

  it('never picks a planet behind the corona, but still one seen through a gap, beside it or in front of it', () => {
    const blockers = starOccluders(1, 0);
    expect([ring, lump, gap, beside, before].map((s) => pick(view, at(s), [s], blockers))).toEqual([null, null, 0, 0, 0]);
  });

  it('labels no planet behind the corona, but still one seen through a gap, beside it or in front of it', () => {
    expect(placeLabels(view, [ring, lump, gap, beside, before], starOccluders(1, 0), W, H, 0, 50).map((l) => l.i).sort()).toEqual([2, 3, 4]);
  });
});

describe('FreeFlightRig', () => {
  const keys = (...k: FlyKey[]) => new Set<FlyKey>(k);

  it('does nothing without input', () => {
    const rig = new FreeFlightRig(POSE);
    expect(rig.step({}, 16)).toBe(false);
    expect(rig.pose()).toEqual(POSE);
  });

  it('flies forward along the view and turns around the eye', () => {
    const rig = new FreeFlightRig(POSE);
    const eye0 = eyeOf(POSE);
    expect(rig.step({ keys: keys('forward') }, 100)).toBe(true);
    const eye1 = eyeOf(rig.pose());
    const toTarget = POSE.target.map((v, i) => v - eye0[i]!);
    const moved = eye1.map((v, i) => v - eye0[i]!);
    expect(moved.reduce((s, v, i) => s + v * toTarget[i]!, 0)).toBeGreaterThan(0);
    const before = eyeOf(rig.pose());
    rig.step({ drag: [40, 0] }, 16);
    close(eyeOf(rig.pose()), before); // looking around keeps the eye still
  });

  it('cuts to a focus under reduced motion and glides otherwise', () => {
    const cut = new FreeFlightRig(POSE);
    cut.focus({ centre: [5, 0, 0], radius: 1 }, true);
    expect(cut.moving()).toBe(false);
    expect(cut.pose().target).toEqual([5, 0, 0]);

    const glide = new FreeFlightRig(POSE);
    glide.focus({ centre: [5, 0, 0], radius: 1 }, false);
    expect(glide.moving()).toBe(true);
    expect(glide.pose()).toEqual(POSE);
    glide.step({}, GLIDE_MS / 2);
    expect(glide.pose().target[0]).toBeGreaterThan(1);
    expect(glide.pose().target[0]).toBeLessThan(5);
    glide.step({}, GLIDE_MS);
    expect(glide.moving()).toBe(false);
    close(glide.pose().target, [5, 0, 0]);
  });

  it('settles a running glide at its end (reduced motion switched on mid-glide)', () => {
    const rig = new FreeFlightRig(POSE);
    rig.focus({ centre: [5, 0, 0], radius: 1 }, false);
    rig.step({}, GLIDE_MS / 4);
    expect(rig.moving()).toBe(true);
    rig.settle();
    expect(rig.moving()).toBe(false);
    close(rig.pose().target, [5, 0, 0]);
    expect(rig.step({}, 16)).toBe(false); // nothing left to advance
  });

  it('orbits a focused planet, never zooms inside it, and leaves focus when flown away', () => {
    const rig = new FreeFlightRig(POSE);
    rig.focus({ centre: [5, 0, 0], radius: 1 }, true);
    rig.step({ drag: [100, 0] }, 16);
    close(rig.pose().target, [5, 0, 0]);
    rig.step({ wheel: -100000 }, 16);
    expect(rig.pose().dist).toBeGreaterThanOrEqual(1.35);
    expect(rig.focused()).toBe(true);
    rig.step({ keys: keys('left') }, 16);
    expect(rig.focused()).toBe(false);
  });

  it('follows a focused planet that grew: the zoom limit uses its new radius', () => {
    const rig = new FreeFlightRig(POSE);
    rig.focus({ centre: [5, 0, 0], radius: 1 }, true);
    const framed = rig.pose().dist; // about 7.05, outside the radius-2 limit of 2.7
    expect(rig.track({ centre: [5, 0, 0], radius: 2 })).toBe(false); // a reload: same place, bigger planet
    expect(rig.pose().dist).toBe(framed); // the framing already clears the new limit, so it stays
    rig.step({ wheel: -100000 }, 16);
    expect(rig.pose().dist).toBeCloseTo(2 * MIN_FOCUS_DIST, 9);
  });

  // Qodo PR #93 r1 aa4520b0: track() takes the new radius but never re-clamps the distance, so a
  // focused planet that grows on a live reload (live.ts:79-80) can end up around the camera. A
  // planet's radius is clamp(0.75 × log2(1 + LOC)) in 1.5..12 layout units, so it can grow up to 8×.
  // The default focus frames at r / (FOCUS_FILL × tan(FOV/2)) ≈ 7.05 r. track() now re-aims a
  // running glide at the new framing and pushes the user's own framing out to the new limit at once.
  describe('a focused planet that grows on a reload (Qodo PR #93 aa4520b0)', () => {
    const centre: [number, number, number] = [5, 0, 0];
    const gap = (rig: FreeFlightRig) => Math.hypot(...eyeOf(rig.pose()).map((v, i) => v - centre[i]!));
    /** At or past the zoom limit of radius r: exactly on `dist`, and within an ulp on the eye rebuilt from it. */
    const outside = (rig: FreeFlightRig, r: number) => {
      expect(rig.pose().dist).toBeGreaterThanOrEqual(r * MIN_FOCUS_DIST);
      expect(gap(rig)).toBeGreaterThan(r * MIN_FOCUS_DIST - 1e-9);
    };

    it('during a glide: the glide ends outside the new zoom limit', () => {
      const rig = new FreeFlightRig(POSE);
      rig.focus({ centre, radius: 1 }, false); // planet at 3 LOC (radius 1500)
      rig.step({}, GLIDE_MS / 2);
      rig.track({ centre, radius: 8 }); // reload mid-glide: 65,535 LOC (radius 12000, 8×)
      rig.step({}, GLIDE_MS);
      expect(rig.moving()).toBe(false);
      outside(rig, 8); // before the fix: 7.048
    });

    it('no glide, default framing: the camera stays outside the new zoom limit', () => {
      const rig = new FreeFlightRig(POSE);
      rig.focus({ centre, radius: 1 }, true);
      rig.track({ centre, radius: 8 });
      outside(rig, 8); // before the fix: 7.048, inside the 8-unit planet
    });

    it('no glide, zoomed in to the limit: a 35% growth puts the camera inside the planet', () => {
      const rig = new FreeFlightRig(POSE);
      rig.focus({ centre, radius: 1 }, true);
      rig.step({ wheel: -100000 }, 16); // zoom in as far as allowed: 1.35 radii
      expect(gap(rig)).toBeCloseTo(MIN_FOCUS_DIST, 9);
      rig.track({ centre, radius: 1.351 }); // 100 LOC → 510 LOC (radius 4993 → 6747)
      outside(rig, 1.351); // before the fix: 1.35, under the 1.351 surface
    });

    it('the limit applies straight after track(), so the next input does not jump', () => {
      const rig = new FreeFlightRig(POSE);
      rig.focus({ centre, radius: 1 }, true);
      rig.step({ wheel: -100000 }, 16);
      expect(rig.track({ centre, radius: 2 })).toBe(true); // the pose moved: the frame loop redraws (live.ts:120)
      expect(gap(rig)).toBeCloseTo(2 * MIN_FOCUS_DIST, 9); // out at the new limit, with no input
      rig.step({ drag: [1, 0] }, 16); // a 1 px drag
      expect(gap(rig)).toBeCloseTo(2 * MIN_FOCUS_DIST, 9); // no jump
    });

    it('track() reports a pose that moved for the resize alone, and only then', () => {
      const rig = new FreeFlightRig(POSE);
      rig.focus({ centre, radius: 1 }, true);
      rig.step({ wheel: -100000 }, 16); // at the limit, 1.35
      expect(rig.track({ centre, radius: 1 })).toBe(false); // nothing changed
      expect(rig.track({ centre, radius: 1.2 })).toBe(true); // pushed out to 1.62
      expect(rig.pose().dist).toBeCloseTo(1.2 * MIN_FOCUS_DIST, 9);
      expect(rig.track({ centre, radius: 1.2 })).toBe(false); // already there
    });

    it('a planet that shrinks keeps the user\'s zoom: the camera is never pulled in', () => {
      const rig = new FreeFlightRig(POSE);
      rig.focus({ centre, radius: 4 }, true);
      rig.step({ wheel: -200 }, 16); // the user's own zoom, between the framing and the limit
      const zoom = rig.pose();
      expect(zoom.dist).toBeGreaterThan(4 * MIN_FOCUS_DIST);
      expect(rig.track({ centre, radius: 1 })).toBe(false);
      expect(rig.pose()).toEqual(zoom);
      rig.step({ wheel: -100000 }, 16); // the smaller planet's limit applies on the next zoom
      expect(rig.pose().dist).toBeCloseTo(MIN_FOCUS_DIST, 9);
    });

    it('a running glide re-aims at the framing for the new radius, grown or shrunk', () => {
      const grow = new FreeFlightRig(POSE);
      grow.focus({ centre, radius: 1 }, false);
      grow.step({}, GLIDE_MS / 2);
      const mid = grow.pose();
      expect(grow.track({ centre, radius: 8 })).toBe(true); // the glide's destination moved
      expect(grow.pose()).toEqual(mid); // the glide carries the camera there; no cut
      grow.step({}, GLIDE_MS);
      expect(grow.moving()).toBe(false);
      expect(grow.pose().dist).toBeCloseTo(framingDistance(8, FOCUS_FILL), 9);
      expect(projectedRadius(8, grow.pose().dist)).toBeCloseTo(FOCUS_FILL, 9); // framed like a fresh focus

      const shrink = new FreeFlightRig(POSE);
      shrink.focus({ centre, radius: 4 }, false);
      shrink.step({}, GLIDE_MS / 2);
      shrink.track({ centre, radius: 1 });
      shrink.settle();
      expect(shrink.pose().dist).toBeCloseTo(framingDistance(1, FOCUS_FILL), 9);
    });
  });

  it('tracks a moving focus and returns to free flight on release', () => {
    const rig = new FreeFlightRig(POSE);
    rig.focus({ centre: [5, 0, 0], radius: 1 }, true);
    expect(rig.track({ centre: [5, 0, 0], radius: 1 })).toBe(false);
    expect(rig.track({ centre: [6, 0, 0], radius: 1 })).toBe(true);
    close(rig.pose().target, [6, 0, 0]);
    const at = rig.pose();
    rig.focus(null, true);
    expect(rig.focused()).toBe(false);
    expect(rig.pose()).toEqual(at);
  });
});
