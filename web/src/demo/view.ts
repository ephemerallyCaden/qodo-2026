// The demo's view (live-demo polish): the product's View, starting closer in. The start pose fits every
// planet and the crew's ship into the frame, which leaves a small system's planets a few pixels wide in a
// screenshot; the demo starts at 0.8 of that distance (closer cuts off the outer planets of the showcase).
// Home and the still behind the title use it too (both ask homePose). The product's own start pose,
// and the depth fade measured from it (render/scene.ts), are unchanged.
import type { OrbitPose } from '../camera/pose.js';
import { View } from '../view.js';

/** The demo's start distance, as a share of the start pose's. */
export const START_ZOOM = 0.8;

export class DemoView extends View {
  override homePose(frame = 0): OrbitPose | null {
    const p = super.homePose(frame);
    return p && { ...p, dist: p.dist * START_ZOOM };
  }
}
