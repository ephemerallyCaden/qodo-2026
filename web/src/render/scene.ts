// The star system as a three.js scene: starfield, star, moonlets and planets, posed purely from
// (model, frame, camera pose). Building is deterministic from the layout; posing holds no state
// between frames, so any frame can be drawn in any order (principle 3). The scene is drawn
// relative to the camera's target (a floating origin, #60): see pose().
import * as THREE from 'three';
import type { FogView } from '../../../src/core/contract/fog.js';
import { palette } from '../../../src/core/palette.js';
import { ASPECT, FAR, FOV_DEG, NEAR, basis, fovOf, project, projectedRadius, systemDepth, type OrbitPose } from '../camera/pose.js';
import type { DepthStretch } from '../model/depth.js';
import { fileFogAt, levelBy, planetPulse, planetTally, type FogEvent } from '../model/fog.js';
import { TURNS, turnAngle } from '../model/motion.js';
import { mulberry32 } from '../model/prng.js';
import { MOON_RADIUS, MOONLET_RADIUS, moonOffset, moonletPosition, planetCentre, type SystemModel } from '../model/system.js';
import { add, scale, sub, type Sphere, type Vec3 } from '../model/vec.js';
import { LIGHT_VIEW, orbitingSpheres, placeSpheres, ramp, shaderMaterial, SHARED, toonMaterial } from './materials.js';
import { moonFogAttribute, setMoonFog } from './fog.js';
import { BeaconMarkers } from './beacons.js';
import { DroneFleet } from './drone-fleet.js';
import { CrewShip } from './ship.js';
import { MOON_GEO, makePlanet, type PlanetObject } from './planet.js';
import { STAR, STAR_FRAG, STARFIELD_FRAG, STARFIELD_VERT } from './shaders.js';

/** The star's one mesh: STAR.span star radii, so it covers the corona too (shaders.ts STAR_FRAG). */
const STAR_GEO = new THREE.SphereGeometry(1, 48, 32);
const STARFIELD_COUNT = 900;
const STARFIELD_RADIUS = 500;

/** Sparse 1 px static stars on a sphere that rides with the eye, mostly the dim colour (asset viewer makeStars). */
function makeStarfield(): THREE.Points {
  const rnd = mulberry32(4242);
  const pts: number[] = [], shade: number[] = [];
  for (let i = 0; i < STARFIELD_COUNT; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * s * STARFIELD_RADIUS, u * STARFIELD_RADIUS, Math.sin(a) * s * STARFIELD_RADIUS);
    const r = rnd();
    shade.push(r < 0.8 ? 0 : r < 0.96 ? 1 : 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: STARFIELD_VERT, fragmentShader: STARFIELD_FRAG, depthWrite: false,
    uniforms: { uRamp: { value: ramp(palette.world.stars, 3) } },
  });
  const stars = new THREE.Points(g, mat);
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  return stars;
}

export class SystemScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV_DEG, ASPECT, NEAR, FAR);
  readonly planets: PlanetObject[];
  /** The agent drones (#80): at most DRONE_CAP, one draw call each. */
  readonly fleet = new DroneFleet();
  /** The captain's log beacons (#79): one draw call, none when there are no beacons. */
  readonly beacons = new BeaconMarkers();
  /** The crew's ship (#207): at most 1 hull + 16 astronauts + 1 cap, one draw call each; none when nobody is aboard. */
  readonly crew = new CrewShip();
  private readonly starfield = makeStarfield();
  private readonly starMat: THREE.ShaderMaterial;
  private readonly star: THREE.Mesh;
  private readonly moonlets: THREE.InstancedMesh | null;
  private readonly moonletFog: THREE.InstancedBufferAttribute | null;
  /** The fog drawn (null: no usable fog view, so every file is fogged) and the events over it. */
  private fog: FogView | null = null;
  private fogEvents: readonly FogEvent[] = [];
  /** The fog changed since its rows were last written; events rewrite them every frame anyway. */
  private fogDirty = true;
  private readonly disposables: { dispose(): void }[] = [];
  /** The depth fade's later steps, scaled to this system (#59). */
  private readonly depth: DepthStretch;

  constructor(readonly model: SystemModel) {
    this.depth = systemDepth(model);
    this.scene.add(this.starfield);
    this.scene.add(this.fleet.group);
    this.scene.add(this.beacons.points);
    this.scene.add(this.crew.group);
    this.disposables.push(this.starfield.geometry, this.starfield.material as THREE.Material);

    // The Day 1 sun (star-art.md): one draw, disc and corona, on the inside of a sphere that holds both.
    this.starMat = shaderMaterial(STAR_FRAG, {
      uDisc: { value: ramp(palette.world.starDisc, 5) }, uCorona: { value: ramp(palette.world.starCorona, 2) },
      uChurn: { value: new THREE.Vector2(1, 0) }, uSpin: { value: new THREE.Vector2(1, 0) },
    }, { side: THREE.BackSide });
    this.star = new THREE.Mesh(STAR_GEO, this.starMat);
    this.star.scale.setScalar(model.star.radius * STAR.span);
    this.scene.add(this.star);
    this.disposables.push(this.starMat);

    // Moonlets (root files, unmatched tests): the planets' test-moon look (star-art.md S6: warm peach,
    // art-direction §4 small moons), on the star's innermost orbit.
    if (model.star.moonlets.length > 0) {
      const mat = toonMaterial(palette.world.moonBody);
      const orbit = model.star.moonlets[0]!.orbit; // one orbit for every moonlet
      const geo = MOON_GEO.clone(); // its own copy: it carries the moonlets' fog
      this.moonletFog = moonFogAttribute(model.star.moonlets.length);
      geo.setAttribute('aFog', this.moonletFog);
      this.moonlets = orbitingSpheres(mat, model.star.moonlets.length, orbit + MOONLET_RADIUS, geo);
      this.scene.add(this.moonlets);
      this.disposables.push(mat, geo, this.moonlets);
    } else { this.moonlets = null; this.moonletFog = null; }

    this.planets = model.planets.map((p) => {
      const obj = makePlanet(p);
      this.scene.add(obj.root);
      return obj;
    });
  }

  /** Every file this scene draws (settlements, test moons, moonlets): what fog events are about. */
  fileIds(): string[] {
    return [
      ...this.model.planets.flatMap((p) => [...p.surface.settlements.map((s) => s.fileId), ...p.moons.map((m) => m.fileId)]),
      ...this.model.star.moonlets.map((m) => m.fileId),
    ];
  }

  /** The fog to draw, and the clear and refog events over it (model/fog.ts). */
  setFog(fog: FogView | null, events: readonly FogEvent[]): void {
    this.fog = fog;
    this.fogEvents = events;
    this.fogDirty = true;
  }

  /** Writes every body's fog for this frame: a pure function of (fog, events, frame). */
  private poseFog(frame: number): void {
    if (!this.fogDirty && this.fogEvents.length === 0) return;
    const level = levelBy(this.fog);
    const events = new Map(this.fogEvents.map((e) => [e.fileId, e]));
    const at = (id: string) => fileFogAt(level(id), events.get(id), frame);
    for (const p of this.planets) {
      const moonIds = p.model.moons.map((m) => m.fileId);
      p.fog.set(p.fog.plan.fileIds.map(at), planetPulse(p.fog.plan, events, moonIds, planetTally(this.fog, p.model.dirId)?.fogged ?? null, frame));
      if (p.moonFog) setMoonFog(p.moonFog, moonIds.map(at));
    }
    if (this.moonletFog) setMoonFog(this.moonletFog, this.model.star.moonlets.map((m) => at(m.fileId)));
    this.fogDirty = false;
  }

  /** Planet centres at a frame, in model order. */
  centres(frame: number): Vec3[] {
    return this.model.planets.map((p) => planetCentre(p, frame));
  }

  /** The planets as spheres at a frame, in model order (picking, labels, focus). */
  spheres(frame: number): Sphere[] {
    return this.model.planets.map((p) => ({ centre: planetCentre(p, frame), radius: p.radius }));
  }

  /** Moons and moonlets as spheres at a frame: they hide what is behind them (picking drones). */
  smallBodies(frame: number): Sphere[] {
    const moons = this.model.planets.flatMap((p) => p.moons.map((m) => ({ centre: add(planetCentre(p, frame), moonOffset(m, frame)), radius: MOON_RADIUS })));
    return [...moons, ...this.model.star.moonlets.map((m) => ({ centre: moonletPosition(m, frame), radius: MOONLET_RADIUS }))];
  }

  /** Poses everything for exactly this frame, camera pose and internal height. */
  pose(frame: number, view: OrbitPose, pixelHeight: number): void {
    // A floating origin at the camera's target: everything is placed at its world position minus the
    // target, so the GPU's float32 world maths sees the same numbers for a body the camera follows at
    // every frame, and a focused planet draws the same pixels as it orbits (#60). Without it, rounding
    // at the planet's absolute position flipped single pixels, and the fog's screen anchor (exactly on
    // a pixel edge at the centre of the frame) jumped by one. Picking and labels stay in world units.
    const origin = view.target;
    const b = basis(view.yaw, view.pitch);
    const eye = scale(b.back, view.dist); // eyeOf(view) - origin, exactly: it depends on the angles and distance only
    this.camera.position.set(eye[0], eye[1], eye[2]);
    this.camera.up.set(0, 1, 0);
    this.camera.fov = fovOf(view); // the pixel pass updates the projection before it renders
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    SHARED.uEye.value.set(eye[0], eye[1], eye[2]);
    SHARED.uDepthStretch.value.set(this.depth.squeeze, this.depth.shift); // shared by every scene: set per draw, like the eye
    // The key light is view-relative, so every planet keeps its top-left crescent from any angle.
    SHARED.uLight.value.set(...add(add(scale(b.right, LIGHT_VIEW.x), scale(b.up, LIGHT_VIEW.y)), scale(b.back, LIGHT_VIEW.z))).normalize();
    this.starfield.position.copy(this.camera.position);
    this.poseFog(frame);

    const star = sub([0, 0, 0], origin);
    this.star.position.set(star[0], star[1], star[2]);
    const centres = this.centres(frame);
    this.planets.forEach((p, i) => {
      const c = centres[i]!, at = project(view, c);
      p.update(frame, sub(c, origin), at ? projectedRadius(p.model.radius, at.depth, fovOf(view)) * (pixelHeight / 2) : 0);
    });
    this.fleet.pose(this.model, frame, fovOf(view), pixelHeight, origin);
    this.crew.pose(this.model, frame, origin);
    this.beacons.pose(this.model, frame, pixelHeight, origin);
    const churn = turnAngle(frame, TURNS.starChurn), spin = turnAngle(frame, TURNS.starSpin);
    (this.starMat.uniforms['uChurn']!.value as THREE.Vector2).set(Math.cos(churn), Math.sin(churn));
    (this.starMat.uniforms['uSpin']!.value as THREE.Vector2).set(Math.cos(spin), Math.sin(spin));
    if (this.moonlets) {
      this.moonlets.position.set(star[0], star[1], star[2]); // the moonlets are placed round the star, in the mesh's own frame
      placeSpheres(this.moonlets, this.model.star.moonlets.map((m) => moonletPosition(m, frame)), MOONLET_RADIUS);
    }
  }

  dispose(): void {
    this.fleet.dispose();
    this.crew.dispose();
    this.beacons.dispose();
    for (const p of this.planets) p.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
