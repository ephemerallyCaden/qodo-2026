// visual-proof scene helpers: where a planet or a drone is on screen, worked out with this checkout's
// own camera and drone code (web/src), the way test/render/review.spec.ts does, and scripted sessions
// built with the test fixtures' builders (test/fixtures/drones.ts). A scene checks that its click landed
// (the panel it expects opened), since a build under test may place things differently.
import type { DroneDetailResult, DroneSession, DroneView } from '../../../../src/core/contract/drones.js';
import { DETAIL_BUCKETS } from '../../../../src/core/contract/drones.js';
import type { DirId } from '../../../../src/core/snapshot/types.js';
import { fileIdOf } from '../../../../src/core/fog/index.js';
import { droneView, session } from '../../../../test/fixtures/drones.js';
import { focusPose, project, startPose, type OrbitPose } from '../../../../web/src/camera/pose.js';
import { DRONE_PICK_RADIUS, placeDrone } from '../../../../web/src/drones/place.js';
import { fontScale } from '../../../../web/src/labels/overlay.js';
import { placeLabels } from '../../../../web/src/labels/place.js';
import { PIXEL_HEIGHT } from '../../../../web/src/model/pixels.js';
import { planetCentre, type SystemModel } from '../../../../web/src/model/system.js';
import type { Vec3 } from '../../../../web/src/model/vec.js';

export interface Point { x: number; y: number }

/** A world point on screen (CSS px) from `pose`, or null behind the eye. */
export function onScreen(pose: OrbitPose, at: Vec3, width: number, height: number): (Point & { depth: number }) | null {
  const p = project(pose, at);
  return p ? { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height, depth: p.depth } : null;
}

/** The label font's pixel size at this viewport (the view's whole-number upscale of the default 180 px target). */
export const labelPx = (height: number): number => fontScale(Math.max(1, Math.floor(height / PIXEL_HEIGHT.default)));

/** The view's start pose: free flight's camera until the user moves it. */
export const homePose = (model: SystemModel): OrbitPose => startPose(model);

/**
 * The camera after `]` is pressed `index + 1` times from the start pose under reduced motion, which
 * focuses planets 0..index in model order (live.ts `cycle`), each a cut to rig.ts's focusPose from the
 * pose before; at `frame`, where reduced motion holds the clock (0).
 */
export function bracketPose(model: SystemModel, index: number, frame = 0): OrbitPose {
  let pose = startPose(model);
  for (let j = 0; j <= index; j++) {
    const p = model.planets[j];
    if (!p) throw new Error(`no planet ${j} (the model has ${model.planets.length})`);
    pose = focusPose(pose, planetCentre(p, frame), p.radius);
  }
  return pose;
}

export interface DronePick {
  home: DirId;
  seed: number;
  /** Where to click it. */
  click: Point;
  /** Where its label would go, centred under it (placeLabels), before any panel moved it. */
  label: Point;
}

/** The drone at `frame` for a session with this home and seed: where it is and where its label would go. */
export function droneAt(model: SystemModel, pose: OrbitPose, home: DirId, seed: number, frame: number, width: number, height: number): DronePick | null {
  const d = placeDrone(model, home, seed, frame);
  const p = model.planets.find((x) => x.dirId === home);
  if (!d || !p) return null;
  const at = onScreen(pose, d.centre, width, height), body = onScreen(pose, planetCentre(p, frame), width, height);
  if (!at || !body || at.depth >= body.depth) return null; // behind its planet: not clickable
  const [l] = placeLabels(pose, [{ centre: d.centre, radius: DRONE_PICK_RADIUS }], [], width, height, 2 * labelPx(height), 1);
  return l ? { home, seed, click: { x: at.x, y: at.y }, label: { x: l.x, y: l.y } } : null;
}

/** The first (seed, planet) whose drone at `frame`, seen from `pose`, satisfies `want`: the search the #169 test does. `homes` limits the planets. */
export function findDrone(model: SystemModel, pose: OrbitPose, frame: number, width: number, height: number, want: (d: DronePick) => boolean, homes?: readonly string[], seeds = 5000): DronePick | null {
  for (let seed = 0; seed < seeds; seed++) {
    for (const p of model.planets) {
      if (homes && !homes.includes(p.path)) continue;
      const d = droneAt(model, pose, p.dirId as DirId, seed, frame, width, height);
      if (d && want(d)) return d;
    }
  }
  return null;
}

/** One scripted Claude session for a drone pick (test/fixtures/drones.ts `session`), in its view. */
export function scriptedDrone(head: string, pick: Pick<DronePick, 'home' | 'seed'>, i = 1): { session: DroneSession; view: DroneView } {
  const s = session(i, pick.home, { seed: pick.seed });
  return { session: s, view: droneView(head, [s]) };
}

/** A drone panel's detail for `s`: these files at HEAD, each with its edits, all in the last slice of the timeline. */
export function scriptedDetail(s: DroneSession, head: string, files: readonly { path: string; edits: number }[]): DroneDetailResult {
  const edits = files.reduce((n, f) => n + f.edits, 0);
  return {
    ok: true, schemaVersion: 'drone-detail.1', head, key: s.key, startedAt: s.startedAt, endedAt: s.endedAt,
    files: files.map((f) => ({ fileId: fileIdOf(f.path), path: f.path, edits: f.edits })), otherFiles: 0, otherEdits: 0,
    buckets: Array.from({ length: DETAIL_BUCKETS }, (_, i) => (i === DETAIL_BUCKETS - 1 ? edits : 0)), spanMs: 3_600_000, needsRescan: false,
  };
}

/** Files of the clone under `prefix/`, in codepoint order: real paths for a scripted session's panel. */
export const filesUnder = (files: readonly string[], prefix: string, n: number): string[] =>
  files.filter((f) => f.startsWith(`${prefix}/`)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, n);
