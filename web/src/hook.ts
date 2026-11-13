// Test mode (`?test=1`): the deterministic render hook R8 drives (contract: RenderHook). No
// animation loop runs; each renderFrame(n) draws exactly frame n from the loaded input, so a frame
// is a pure function of (RenderInput, n) whatever was drawn before (principle 3).
import type { RenderHook, RenderInput, RenderStats } from '../../src/core/contract/api.js';
import { fromCameraPose, startPose, type OrbitPose } from './camera/pose.js';
import { checkDrones } from './drones/check.js';
import { entryOf, selectDrones } from './drones/select.js';
import { effectiveFrame } from './model/motion.js';
import { checkLayout } from './model/validate.js';
import { clampPixelHeight } from './model/pixels.js';
import type { View } from './view.js';

export function renderHook(view: View, viewport: () => { w: number; h: number; dpr: number }): RenderHook {
  let input: RenderInput | null = null;
  let pose: OrbitPose | null = null;
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
        const planets = new Set<string>(checked.value.planets.map((p) => p.dirId));
        drones = selectDrones(d.value, (h) => h === 'star' || planets.has(h)).shown;
      }
      await view.load(checked.value, next.fog ?? null, { animate: false }); // no fronts: a frame is a pure function of (input, n)
      await view.setDrones(drones.map(entryOf));
      const vp = viewport();
      view.showHelp = false;
      view.depthFade = next.depthFade ?? true;
      view.resize(clampPixelHeight(next.pixelHeight), vp.w, vp.h, vp.dpr);
      pose = next.camera ? fromCameraPose(next.camera) : startPose(view.model!);
      input = next;
    },
    async renderFrame(n: number): Promise<RenderStats> {
      if (!input || !pose) throw new Error('renderFrame before load');
      return view.draw(effectiveFrame(n, input.reducedMotion ?? false), pose, null);
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
