// visual-proof scene helper: which file's fog parcel each pixel shows, worked out with this checkout's own
// camera and fog code (web/src), for measureFog. Apart from helpers.ts, which loads the label overlay's DOM
// code, so a unit test without the DOM can load it.
import { ASPECT, basis, eyeOf, fovOf, type OrbitPose } from '../../../../web/src/camera/pose.js';
import { surfacePlan } from '../../../../web/src/model/fog.js';
import { frameWidth, PIXEL_HEIGHT } from '../../../../web/src/model/pixels.js';
import { planetCentre, surfaceDirection, type SystemModel } from '../../../../web/src/model/system.js';
import { add, dot, normalize, scale, sub } from '../../../../web/src/model/vec.js';

/**
 * Which file's parcel of planet `path` each frame pixel (CSS px) shows from `pose` at `frame`, by file id,
 * or null off the planet: the view ray through the centre of the internal pixel it upscales (the default
 * 180 px target, fitted exactly, as at 1280x720), hit on the planet's sphere, turned into its surface's
 * own frame (surfaceDirection's spin), and given to the owner of the nearest grid cell by the fog's own
 * territories (model/fog.ts surfacePlan), as the fog shader does. The body is a mesh, not a sphere, so a
 * pixel on a parcel's edge or the limb may land on its neighbour or off the planet.
 */
export function parcelsOnScreen(model: SystemModel, pose: OrbitPose, path: string, frame: number, width: number, height: number): (x: number, y: number) => string | null {
  const p = model.planets.find((x) => x.path === path);
  if (!p) throw new Error(`no planet ${path}`);
  const ph = PIXEL_HEIGHT.default, pw = frameWidth(ph), k = Math.floor(height / ph);
  if (k < 1 || pw * k !== width || ph * k !== height) throw new Error(`parcelsOnScreen needs a viewport the ${pw}x${ph} target fills exactly, not ${width}x${height}`);
  const plan = surfacePlan(p.surface);
  // every grid cell's direction from the centre at `frame`, turned with the surface
  const turned = Array.from({ length: p.surface.cells }, (_, i) => surfaceDirection(p, i, frame));
  const centre = planetCentre(p, frame), eye = eyeOf(pose), b = basis(pose.yaw, pose.pitch);
  const tanV = Math.tan((fovOf(pose) * Math.PI) / 360);
  const owner = new Map<number, string | null>();
  const at = (ix: number, iy: number): string | null => {
    const ndc = { x: ((ix + 0.5) / pw) * 2 - 1, y: 1 - ((iy + 0.5) / ph) * 2 };
    const dir = normalize(add(b.fwd, add(scale(b.right, ndc.x * tanV * ASPECT), scale(b.up, ndc.y * tanV))));
    // the nearer hit of eye + t·dir on the sphere
    const o = sub(eye, centre), half = dot(o, dir), disc = half * half - (dot(o, o) - p.radius * p.radius);
    if (disc < 0) return null;
    const t = -half - Math.sqrt(disc);
    if (t <= 0) return null;
    const normal = normalize(add(o, scale(dir, t)));
    let best = -1, bestDot = -Infinity;
    turned.forEach((d, i) => { const v = dot(d, normal); if (v > bestDot) { bestDot = v; best = i; } });
    const file = plan.territory.owner[best]!;
    return file >= 0 ? plan.fileIds[file]! : null;
  };
  return (x, y) => {
    const ix = Math.floor(x / k), iy = Math.floor(y / k), key = iy * pw + ix;
    if (!owner.has(key)) owner.set(key, at(ix, iy));
    return owner.get(key)!;
  };
}
