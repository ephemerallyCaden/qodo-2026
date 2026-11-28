// Test mode (`?test=1`): the deterministic render hook R8 drives (contract: RenderHook). No
// animation loop runs; each renderFrame(n) draws exactly frame n from the loaded input, so a frame
// is a pure function of (RenderInput, n) whatever was drawn before (principle 3).
import type { RenderHook, RenderInput, RenderStats } from '../../src/core/contract/api.js';
import { fromCameraPose, type OrbitPose } from './camera/pose.js';
import { checkCrew } from './crew/check.js';
import { checkDebris } from './debris/check.js';
import { drawables } from './debris/select.js';
import { riderOf, seatCrew } from './crew/select.js';
import { checkDrones } from './drones/check.js';
import { checkBeacons } from './model/beacons.js';
import { checkCoChange } from './cochange/check.js';
import { entryOf, selectDrones } from './drones/select.js';
import { effectiveFrame } from './model/motion.js';
import { checkLayout } from './model/validate.js';
import { clampPixelHeight } from './model/pixels.js';
import type { View } from './view.js';

export function renderHook(view: View, viewport: () => { w: number; h: number; dpr: number }): RenderHook {
  let input: RenderInput | null = null;
  let pose: OrbitPose | null = null;
  /** #211: the planet focused from frame 0 (RenderInput.focus), or null. */
  let focus: number | null = null;
  return {
    // The renderer exists (the caller built the view) and the label font is bitmap data; this also
    // waits for any document font, so `ready` means fonts have loaded.
    ready: document.fonts.ready.then(() => undefined),
    async load(next: RenderInput): Promise<void> {
      const checked = checkLayout(next.layout);
      if (!checked.ok) throw new Error(`invalid layout: ${checked.errors.join('; ')}`);
      const fov = next.camera?.fovDeg;
      if (fov !== undefined && !(fov > 0 && fov < 180)) throw new Error(`invalid camera.fovDeg ${fov}: must be between 0 and 180`);
      let drones: ReturnType<typeof selectDrones>['shown'] = [];
      if (next.drones) {
        const d = checkDrones(next.drones);
        if (!d.ok) throw new Error(`invalid drones: ${d.errors.join('; ')}`);
        if (d.value.head !== checked.value.source.head) throw new Error(`drones are of ${d.value.head.slice(0, 7)} but the layout of ${checked.value.source.head.slice(0, 7)} (different scans)`);
        const planets = new Set<string>(checked.value.planets.map((p) => p.dirId));
        drones = selectDrones(d.value, (h) => h === 'star' || planets.has(h)).shown;
      }
      const head = checked.value.source.head;
      if (next.beacons) {
        const b = checkBeacons(next.beacons);
        if (!b.ok) throw new Error(`invalid beacons: ${b.errors.join('; ')}`);
        if (b.value.head !== head) throw new Error(`beacons are of ${b.value.head.slice(0, 7)} but the layout of ${head.slice(0, 7)} (different scans)`);
      }
      if (next.cochange) {
        const c = checkCoChange(next.cochange);
        if (!c.ok) throw new Error(`invalid cochange: ${c.errors.join('; ')}`);
        if (c.value.head !== head) throw new Error(`cochange is of ${c.value.head.slice(0, 7)} but the layout of ${head.slice(0, 7)} (different scans)`);
      }
      let seating: ReturnType<typeof seatCrew> | null = null;
      if (next.crew) {
        const c = checkCrew(next.crew);
        if (!c.ok) throw new Error(`invalid crew: ${c.errors.join('; ')}`);
        if (c.value.head !== head) throw new Error(`crew is of ${c.value.head.slice(0, 7)} but the layout of ${head.slice(0, 7)} (different scans)`);
        seating = seatCrew(c.value);
      }
      let debris: ReturnType<typeof drawables> = [];
      if (next.debris) {
        const d = checkDebris(next.debris);
        if (!d.ok) throw new Error(`invalid debris: ${d.errors.join('; ')}`);
        if (d.value.head !== head) throw new Error(`debris is of ${d.value.head.slice(0, 7)} but the layout of ${head.slice(0, 7)} (different scans)`);
        debris = drawables(d.value);
      }
      const focusAt = next.focus ? checked.value.planets.findIndex((p) => p.dirId === next.focus!.dirId) : -1;
      if (next.focus && focusAt < 0) throw new Error('invalid focus: dirId is not a planet of the layout');
      await view.load(checked.value, next.fog ?? null, { animate: false }); // no fronts: a frame is a pure function of (input, n)
      await view.setDrones(drones.map(entryOf), head);
      await view.setCrew(seating ? seating.seats.map(riderOf) : [], seating?.extra ?? 0, head); // this input's crew, never a previous load's
      view.setDebris(debris, head, { animate: false }); // R13: this input's debris, never a previous load's; no sweep
      view.setBeacons(next.beacons ?? null, head); // this input's beacons, never a previous load's
      view.setCoChange(next.cochange ?? null, head); // #211: and its co-change, the same
      view.reducedMotion = next.reducedMotion ?? false; // the constellation draws at once, its beads frozen (#211)
      focus = next.focus ? focusAt : null;
      view.focusFile = next.focus?.fileId ?? null;
      view.focusSince = 0; // focused from frame 0: the lines draw in from it
      const vp = viewport();
      view.showHelp = false;
      view.depthFade = next.depthFade ?? true;
      view.resize(clampPixelHeight(next.pixelHeight), vp.w, vp.h, vp.dpr);
      // No camera: the start pose of frame 0, held for every frame, as the live view's camera stays put
      // while the planets orbit (#60), so frame n shows how far they have moved.
      pose = next.camera ? fromCameraPose(next.camera) : view.homePose(0)!; // the ship framed too when a crew is drawn (#207)
      input = next;
    },
    async renderFrame(n: number): Promise<RenderStats> {
      if (!input || !pose) throw new Error('renderFrame before load');
      return view.draw(effectiveFrame(n, input.reducedMotion ?? false), pose, focus);
    },
    lowResPixels() {
      if (!input) throw new Error('lowResPixels before load');
      return view.pixels();
    },
  };
}

/** The hook when the renderer couldn't start: every call reports why, so a render test fails readably. */
export function brokenHook(reason: string): RenderHook {
  const fail = () => Promise.reject(new Error(reason));
  const ready = fail();
  ready.catch(() => {}); // reported to whoever awaits it, not as an unhandled rejection
  return { ready, load: fail, renderFrame: fail, lowResPixels: () => { throw new Error(reason); } };
}
