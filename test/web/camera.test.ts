// Camera maths and the free-flight rig (#30): pure, so picking, labels and the renderer agree.
import { describe, expect, it } from 'vitest';
import { FOCUS_FILL, FOV_DEG, eyeOf, focusPose, fromCameraPose, pick, project, projectedRadius, startPose, toCameraPose, type OrbitPose } from '../../web/src/camera/pose.js';
import { FreeFlightRig, GLIDE_MS, type FlyKey } from '../../web/src/camera/rig.js';
import { placeLabels } from '../../web/src/labels/place.js';
import { planetCentre, planetReach, systemModel } from '../../web/src/model/system.js';
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
    rig.track({ centre: [5, 0, 0], radius: 2 }); // a reload: same place, bigger planet
    rig.step({ wheel: -100000 }, 16);
    expect(rig.pose().dist).toBeCloseTo(2 * 1.35, 9);
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
