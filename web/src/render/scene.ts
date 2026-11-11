// The star system as a three.js scene: starfield, star, moonlets and planets, posed purely from
// (model, frame, camera pose). Building is deterministic from the layout; posing holds no state
// between frames, so any frame can be drawn in any order (principle 3).
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import { ASPECT, FAR, FOV_DEG, NEAR, basis, eyeOf, fovOf, project, projectedRadius, type OrbitPose } from '../camera/pose.js';
import { mulberry32 } from '../model/prng.js';
import { MOONLET_RADIUS, moonletPosition, planetCentre, type SystemModel } from '../model/system.js';
import { add, scale, type Sphere, type Vec3 } from '../model/vec.js';
import { LIGHT_VIEW, orbitingSpheres, placeSpheres, ramp, shaderMaterial, SHARED, toonMaterial } from './materials.js';
import { MOON_GEO, makePlanet, type PlanetObject } from './planet.js';
import { STAR_FRAG, STARFIELD_FRAG, STARFIELD_VERT } from './shaders.js';

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
  private readonly starfield = makeStarfield();
  private readonly moonlets: THREE.InstancedMesh | null;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(readonly model: SystemModel) {
    this.scene.add(this.starfield);
    this.disposables.push(this.starfield.geometry, this.starfield.material as THREE.Material);

    const starMat = shaderMaterial(STAR_FRAG, { uGlow: { value: ramp(palette.world.glow, 3) } });
    const star = new THREE.Mesh(STAR_GEO, starMat);
    star.scale.setScalar(model.star.radius);
    this.scene.add(star);
    this.disposables.push(starMat);

    // Moonlets (root files, unmatched tests): small grey regolith spheres on the star's innermost orbit.
    if (model.star.moonlets.length > 0) {
      const mat = toonMaterial(palette.world.moon.slice(1));
      const orbit = model.star.moonlets[0]!.orbit; // one orbit for every moonlet
      this.moonlets = orbitingSpheres(mat, model.star.moonlets.length, orbit + MOONLET_RADIUS, MOON_GEO);
      this.scene.add(this.moonlets);
      this.disposables.push(mat, this.moonlets);
    } else this.moonlets = null;

    this.planets = model.planets.map((p) => {
      const obj = makePlanet(p);
      this.scene.add(obj.root);
      return obj;
    });
  }

  /** Planet centres at a frame, in model order. */
  centres(frame: number): Vec3[] {
    return this.model.planets.map((p) => planetCentre(p, frame));
  }

  /** The planets as spheres at a frame, in model order (picking, labels, focus). */
  spheres(frame: number): Sphere[] {
    return this.model.planets.map((p) => ({ centre: planetCentre(p, frame), radius: p.radius }));
  }

  /** Poses everything for exactly this frame, camera pose and internal height. */
  pose(frame: number, view: OrbitPose, pixelHeight: number): void {
    const eye = eyeOf(view);
    this.camera.position.set(eye[0], eye[1], eye[2]);
    this.camera.up.set(0, 1, 0);
    this.camera.fov = fovOf(view); // the pixel pass updates the projection before it renders
    this.camera.lookAt(view.target[0], view.target[1], view.target[2]);
    this.camera.updateMatrixWorld(true);
    SHARED.uEye.value.set(eye[0], eye[1], eye[2]);
    // The key light is view-relative, so every planet keeps its top-left crescent from any angle.
    const b = basis(view.yaw, view.pitch);
    SHARED.uLight.value.set(...add(add(scale(b.right, LIGHT_VIEW.x), scale(b.up, LIGHT_VIEW.y)), scale(b.back, LIGHT_VIEW.z))).normalize();
    this.starfield.position.copy(this.camera.position);

    const centres = this.centres(frame);
    this.planets.forEach((p, i) => {
      const c = centres[i]!, at = project(view, c);
      p.update(frame, c, at ? projectedRadius(p.model.radius, at.depth, fovOf(view)) * (pixelHeight / 2) : 0);
    });
    if (this.moonlets) placeSpheres(this.moonlets, this.model.star.moonlets.map((m) => moonletPosition(m, frame)), MOONLET_RADIUS);
  }

  dispose(): void {
    for (const p of this.planets) p.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
