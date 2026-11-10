// Rendering for the library. Every asset is built by the asset viewer's own factories
// (makePlanet, makeAstronaut, makeSky, makeStars from ../asset-viewer/viewer.js) and drawn by its
// renderer and camera, posed and depth-tinted by its own helpers (poseWorld, depthLevelAt,
// setDepthLevel, applyDepth), in the order the viewer's frame() uses. Nothing here writes a
// shader. Exploration variants (A-J) come from the astronaut lab's own renderer, read-only.
import * as THREE from 'three';
import {
  makePlanet, makeAstronaut, makeSky, makeStars, setDepthLevel, depthLevelAt, poseWorld, setLoop, applyDepth,
  setPixelSize, setViewSize, frameWidth, retint, resolve, renderer, camera, controls, VIEWS, BIOMES, CREW_SPOT,
} from '../asset-viewer/viewer.js';
import { eyesFor } from '../asset-viewer/faces.js';
import { makeAstronaut as makeLabAstronaut } from '../explorations/astronaut-lab/astronaut.js';
import { VARIANTS as LAB_VARIANTS } from '../explorations/astronaut-lab/variants.js';
import { DEFAULTS as LAB_PARAM_DEFAULTS } from '../explorations/astronaut-lab/params.js';
import { SPACE as LAB_SPACE } from '../explorations/astronaut-lab/crew.js';
import { contributorKey, eyeGlowKey } from './palette.js';

export { renderer, camera, controls, frameWidth };

// Camera framings: planet ones are the viewer's own (VIEWS, and the shots' cloud framings);
// astronaut ones are offsets from the figure's origin (crew/face: the viewer's crew and face
// views relative to its crew spot; body: the crew probe's full-figure framing).
const rel = (v) => ({ pos: v.pos.map((x, i) => x - CREW_SPOT.getComponent(i)), target: v.target.map((x, i) => x - CREW_SPOT.getComponent(i)) });
export const FRAMING_CAMERAS = {
  planet: { pos: VIEWS.planet.pos, target: VIEWS.planet.target },
  'clouds-zoom': { pos: [0.95, 0.55, 3.3], target: [0, -0.1, 0] },
  top: { pos: [0.1, 3.4, 0.4], target: [0, 0, 0] },
  body: { pos: [0, 0.95, 2.7], target: [0, 0.52, 0] },
  crew: rel(VIEWS.crew),
  face: rel(VIEWS.face),
  lab: { pos: [0, 0.92, 2.7], target: [0, 0.49, 0] }, // the lab's tiles: crew close-up offset, straight on
  // catalogue thumbnails (160 x 90): closer, so a figure fills the tile
  'thumb-body': { pos: [0, 0.78, 1.55], target: [0, 0.5, 0] },
  'thumb-lab': { pos: [0, 0.74, 1.8], target: [0, 0.49, 0] },
  depth: { pos: VIEWS.depth.pos, target: VIEWS.depth.target },
  'scene-crew': { pos: VIEWS.crew.pos, target: VIEWS.crew.target },
  system: { pos: VIEWS.system.pos, target: VIEWS.system.target },
};
export const labVariant = (id) => LAB_VARIANTS.find((v) => v.id === id);

const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3(), RIGHT = new THREE.Vector3();
const artOpt = (it) => (!it.artefacts ? 0 : it.artAuto ? 'auto' : it.artCount);

/** One scene of items: sky and stars plus a slot per item (reused while its kind stays the same). */
export class Stage {
  constructor() {
    this.scene = new THREE.Scene();
    this.sky = makeSky();
    this.stars = makeStars();
    this.scene.add(this.sky, this.stars);
    this.slots = [];
  }

  /** Builds or reconfigures every item. pal: the active palette object (palette.activate). */
  sync(items, pal) {
    while (this.slots.length > items.length) this.scene.remove(this.slots.pop().group);
    items.forEach((it, i) => {
      let s = this.slots[i];
      if (!s || s.kind !== it.kind) {
        if (s) this.scene.remove(s.group);
        s = this.slots[i] = this.make(it.kind);
        this.scene.add(s.group);
      }
      s.item = it;
      if (it.kind === 'planet') this.syncPlanet(s.obj, it);
      else if (it.kind === 'astronaut') this.syncAstronaut(s.obj, it, pal);
      else this.syncLab(s.obj, it);
    });
    // The lab renders its variants on flat space, without the viewer's sky and stars.
    const lab = items.some((it) => it.kind === 'lab');
    this.sky.visible = this.stars.visible = !lab;
  }

  make(kind) {
    const obj = kind === 'planet' ? makePlanet() : kind === 'astronaut' ? makeAstronaut('coral') : makeLabAstronaut({ color: 'mint', eyes: 0 });
    return { kind, obj, group: obj.group };
  }

  syncPlanet(p, it) {
    p.setExtras({ moons: it.moons, halo: it.halo, artefacts: artOpt(it), teal: it.artTeal, cloudShadow: it.cloudShadow, lavaMode: it.lavaMode });
    p.rebuild(it.seed, it.biome, it.ring, it.cover, { inner: it.ringInner, width: it.ringWidth }, it.size, it.float);
    p.moons.forEach((m, i) => { Object.assign(m, it.moonOrbits[i]); m.mesh.scale.setScalar(m.size); });
    const { surface, haze, halo, sky, ringTilt } = p.parts;
    // Isolation toggles (moons, rings or clouds on their own), applied after rebuild and setExtras on
    // every sync because those set these meshes' visibility from the biome and extras.
    surface.visible = it.layers.surface;
    haze.visible = !!BIOMES[it.biome].haze && it.layers.haze && it.layers.surface;
    halo.visible = it.halo && it.layers.surface;
    sky.visible = it.layers.clouds;
    ringTilt.visible = it.layers.ring;
    // The teal garnish: the viewer sets it once from ACCENTS; here it follows the editable accent ramp.
    surface.material.uniforms.uArtTealC.value.set(resolve('accent.3'));
    p.group.position.set(...it.pos);
  }

  syncAstronaut(a, it, pal) {
    const key = contributorKey(pal, it.color);
    a.setColor(key, eyeGlowKey(key, it.eyeGlow)); // re-tints on the next setDepthLevel
    a.group.userData.blink = it.blink;
    a.setFace(it.eyes === 'auto' ? eyesFor(it.handle) : it.eyes);
    a.group.position.set(...it.pos);
    a.group.rotation.y = it.yaw;
    a.group.userData.phase = it.phase;
  }

  syncLab(l, it) {
    l.setParams({ ...LAB_PARAM_DEFAULTS, ...labVariant(it.variant).params });
    l.setColor(it.color);
    l.setEyes(it.eyes);
  }

  /** Poses everything at time t (s) and sets depth levels for the current camera, as the viewer's frame does. */
  pose(t, render) {
    this.stars.position.copy(camera.position);
    const by = (k) => this.slots.filter((s) => s.kind === k);
    poseWorld(t, { planets: by('planet').map((s) => s.obj), astronauts: by('astronaut').map((s) => s.obj), spin: render.spin, lavaTime: render.lavaTime });
    for (const s of by('lab')) s.obj.update(t, { yaw: s.item.yaw, sway: s.item.sway ? 1 : 0 });
    setDepthLevel(this.stars, 0);
    setDepthLevel(this.sky, 0);
    for (const s of this.slots) if (s.kind !== 'lab') setDepthLevel(s.group, depthLevelAt(camera.position.distanceTo(s.group.getWorldPosition(TMP)), render));
  }

  clearColor() {
    return this.slots.some((s) => s.kind === 'lab') ? LAB_SPACE : resolve('space');
  }

  /** Screen centre and radius (internal px) of slot i, for picking and the selection box. */
  screenBounds(i, w, h) {
    const s = this.slots[i];
    if (!s) return null;
    const it = s.item;
    const c = TMP.set(...it.pos);
    const r = it.kind === 'planet' ? it.size : 0.55;
    if (it.kind !== 'planet') c.y += 0.5;
    RIGHT.setFromMatrixColumn(camera.matrixWorld, 0);
    const q = TMP2.copy(c).addScaledVector(RIGHT, r).project(camera);
    const p = c.project(camera);
    if (p.z > 1) return null;
    const x = (p.x + 1) * 0.5 * w, y = (1 - p.y) * 0.5 * h;
    return { x, y, r: Math.hypot((q.x + 1) * 0.5 * w - x, (1 - q.y) * 0.5 * h - y) };
  }
}

/** Shared loop and depth settings; true when every stage must retint (object <-> per-pixel switch). */
export function applyRender(render) {
  setLoop(render);
  return applyDepth(render);
}
export const retintStage = (stage) => retint(stage.scene);

/** Points the shared camera through the viewer's orbit controls (as viewer.set's camera option does). */
export function placeCamera({ pos, target }, minDistance = 0.3) {
  controls.minDistance = minDistance;
  camera.position.set(...pos);
  controls.target.set(...target);
  controls.update();
}

let canvas = { w: 0, h: 0 };
/** Renders a stage to the canvas at w x h internal pixels (the stage view). */
export function renderToCanvas(stage, t, render, w, h) {
  // Resizing the canvas clears it, so only on a change; the rest is per stage (thumbnails change it).
  if (canvas.w !== w || canvas.h !== h) {
    canvas = { w, h };
    setPixelSize(w, h, [stage.sky]);
  } else setViewSize(w, h, [stage.sky]);
  controls.update();
  stage.pose(t, render);
  renderer.setClearColor(stage.clearColor());
  renderer.render(stage.scene, camera);
}

// 'w x h' -> { rt, px, img }: an off-screen target and its read-back buffers, per size. The few sizes
// in use (catalogue and timeline thumbnails, the history comparison) stay; the oldest others go.
const targets = new Map();
const MAX_TARGETS = 4;
/** Renders a stage off-screen with a fixed camera; returns ImageData (w x h, reused per size), leaving the stage view untouched. */
export function renderToImage(stage, t, render, w, h, cam) {
  const size = `${w}x${h}`;
  if (!targets.has(size)) {
    if (targets.size >= MAX_TARGETS) {
      const [old, { rt: oldRt }] = targets.entries().next().value;
      oldRt.dispose();
      targets.delete(old);
    }
    targets.set(size, { rt: new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }), px: new Uint8Array(w * h * 4), img: new ImageData(w, h) });
  }
  const { rt, px, img } = targets.get(size);
  const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
  camera.position.set(...cam.pos);
  camera.lookAt(TMP.set(...cam.target));
  camera.updateMatrixWorld(true);
  setViewSize(w, h, [stage.sky]);
  stage.pose(t, render);
  renderer.setRenderTarget(rt);
  renderer.setClearColor(stage.clearColor());
  renderer.clear();
  renderer.render(stage.scene, camera);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  renderer.setRenderTarget(null);
  camera.position.copy(saved.pos);
  camera.quaternion.copy(saved.quat);
  camera.updateMatrixWorld(true);
  if (canvas.w) setViewSize(canvas.w, canvas.h, []);
  // GL rows run bottom-up
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return img;
}
