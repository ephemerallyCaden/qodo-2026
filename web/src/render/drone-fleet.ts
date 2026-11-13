// The drones in the scene: one mesh each (one draw call), at most DRONE_CAP of them, posed from
// (model, frame, camera) like everything else (principle 3). Built from the session fields the view
// already holds; a drone's look comes from its tool string and its details from its seed.
import * as THREE from 'three';
import { FPS, LOOP_SECONDS, loopPhase } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import type { Sphere } from '../model/vec.js';
import { DRONE_SCALE, DRONE_PICK_RADIUS, placeDrone } from '../drones/place.js';
import { Drone, lookOf } from './drone.js';

/** What the fleet needs of a session. */
export interface FleetEntry {
  key: string; seed: number; tool: string; home: string;
  /** Text beside the drone (the generic drone's tool name, "inferred"), or null for none. */
  label: string | null;
  /** The text while it is selected: always something. */
  selectedLabel: string;
}

export class DroneFleet {
  readonly group = new THREE.Group();
  private items: { entry: FleetEntry; drone: Drone }[] = [];

  /** Replaces the drones drawn. */
  set(entries: readonly FleetEntry[]): void {
    for (const it of this.items) { this.group.remove(it.drone.root); it.drone.dispose(); }
    this.items = entries.map((entry) => ({ entry, drone: new Drone(lookOf(entry.tool), entry.seed) }));
    for (const it of this.items) this.group.add(it.drone.root);
  }

  get entries(): readonly FleetEntry[] { return this.items.map((i) => i.entry); }

  /** Drones as picking spheres at a frame, in `entries` order; a drone whose home is gone from the layout is null. */
  spheres(model: SystemModel, frame: number): (Sphere | null)[] {
    return this.items.map(({ entry }) => {
      const at = placeDrone(model, entry.home, entry.seed, frame);
      return at ? { centre: at.centre, radius: DRONE_PICK_RADIUS } : null;
    });
  }

  /** Poses every drone for exactly this frame; `fovDeg` and `pixelHeight` size its crisp sparkles. */
  pose(model: SystemModel, frame: number, fovDeg: number, pixelHeight: number): void {
    const seconds = loopPhase(frame) * LOOP_SECONDS;
    const pixK = (2 * Math.tan((fovDeg * Math.PI) / 360)) / pixelHeight;
    for (const { entry, drone } of this.items) {
      const at = placeDrone(model, entry.home, entry.seed, frame);
      drone.root.visible = at !== null;
      if (!at) continue;
      drone.root.position.set(...at.centre);
      drone.root.rotation.set(0, at.yaw, 0);
      drone.root.scale.setScalar(DRONE_SCALE);
      drone.update(Math.round(seconds * FPS) / FPS, pixK);
    }
  }

  dispose(): void { this.set([]); }
}
