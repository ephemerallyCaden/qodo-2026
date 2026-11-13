// Drives the real View with a fog change at a chosen frame, so the fronts of a fog event can be
// rendered frame by frame (the render hook takes no events: its frames are rest frames). Served by
// fog-events.spec.ts; `/web/src/…` is mounted from web/src.
import type { FogView } from '../../../src/core/contract/fog.js';
import type { CameraPose } from '../../../src/core/contract/api.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import { fromCameraPose, type OrbitPose } from '../../../web/src/camera/pose.js';
import { View } from '../../../web/src/view.js';

const view = new View(document.getElementById('view') as HTMLCanvasElement, document.getElementById('labels') as HTMLCanvasElement);
view.showHelp = false;
let pose: OrbitPose | null = null;
const api = {
  async setup(layout: LayoutV1, fog: FogView, camera: CameraPose, pixelHeight: number): Promise<void> {
    await view.load(layout, fog, { animate: false });
    view.resize(pixelHeight, 1280, 720, 1);
    pose = fromCameraPose(camera);
  },
  /** Applies `fog` as an answer seen at `frame`: its fronts start there. */
  change(fog: FogView, frame: number): boolean {
    view.draw(frame, pose!, null);
    return view.applyFog(fog, view.fogTicket());
  },
  /** Frame `n`, palette colours only (the depth fade off), as RGBA. */
  frame(n: number): { width: number; height: number; rgba: number[] } {
    view.depthFade = false;
    view.draw(n, pose!, null);
    const p = view.pixels();
    return { width: p.width, height: p.height, rgba: Array.from(p.rgba) };
  },
};
(window as unknown as { __events: typeof api }).__events = api;
(window as unknown as { __commet: unknown }).__commet = { ready: Promise.resolve() }; // what openView waits for
