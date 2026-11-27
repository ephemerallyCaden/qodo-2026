// Captain's log beacons in the scene (#79, R10): one Points draw for every body holding a note, each a
// small lamp on a 2 px mast that stands just above its body's disc on screen. It is the same few
// internal pixels at any distance, so it reads at 320×180, and it rides with its planet's orbit,
// posed from (model, frame, origin) like everything else (principle 3). Stub art: beacons aren't
// designed yet (art-direction §10). Drawn live by its shader, no texture or sprite sheet (Rule 4), in
// the crew's BLK 36 colours, since the captain planted it; never teal, which marks code-layer events.
// No depth fade: its pixels are exactly those palette colours (Rule 5).
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import { spotBody, type BeaconSpot } from '../model/beacons.js';
import { frameWidth } from '../model/pixels.js';
import type { SystemModel } from '../model/system.js';
import type { Vec3 } from '../model/vec.js';
import { color } from './materials.js';

/** The marker, in internal px: `size` square, standing `gap` above the top of its body's disc. */
export const BEACON_MARK = { size: 8, gap: 2 } as const;

/** Top row first; R the lamp's rim, C its core, M the mast (2 px wide, as every drawn line, Rule 4), '.' clear. */
export const BEACON_SHAPE = [
  '...RR...',
  '..RCCR..',
  '..RCCR..',
  '...RR...',
  '...MM...',
  '...MM...',
  '...MM...',
  '..MMMM..',
] as const;

/** Each row of `shape` as a bit mask of the cells holding `ch` (bit x is column x). */
const rows = (ch: string): number[] => BEACON_SHAPE.map((r) => [...r].reduce((m, c, x) => (c === ch ? m | (1 << x) : m), 0));

const VERT = /* glsl */ `
  in float aRadius;
  uniform vec2 uView;
  uniform float uSize;
  uniform float uGap;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    // the eye inside or behind the body: nothing to stand on, so the marker is clipped away
    if (dist <= aRadius) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec4 centre = projectionMatrix * mv;
    // judged at the body's near side: in front of its own body, behind any nearer one
    vec4 front = projectionMatrix * vec4(mv.xyz + normalize(-mv.xyz) * aRadius, 1.0);
    // the disc's top on screen (its projected radius, as projectedRadius in camera/pose.ts), the gap,
    // then half the marker; whole internal pixels, so the shape's cells land on pixels
    vec2 px = (centre.xy / centre.w * 0.5 + 0.5) * uView;
    px.y += aRadius * projectionMatrix[1][1] / dist * 0.5 * uView.y + uGap + uSize * 0.5;
    px = floor(px + 0.5);
    gl_Position = vec4((px / uView * 2.0 - 1.0) * front.w, front.z, front.w);
    gl_PointSize = uSize;
  }
`;

const FRAG = /* glsl */ `
  uniform float uSize;
  uniform int uRim[${BEACON_SHAPE.length}];
  uniform int uCore[${BEACON_SHAPE.length}];
  uniform int uMast[${BEACON_SHAPE.length}];
  uniform vec3 uRimColour;
  uniform vec3 uCoreColour;
  uniform vec3 uMastColour;
  void main() {
    ivec2 cell = ivec2(floor(gl_PointCoord * uSize)); // gl_PointCoord's origin is the top-left
    int bit = 1 << cell.x;
    if ((uCore[cell.y] & bit) != 0) gl_FragColor = vec4(uCoreColour, 1.0);
    else if ((uRim[cell.y] & bit) != 0) gl_FragColor = vec4(uRimColour, 1.0);
    else if ((uMast[cell.y] & bit) != 0) gl_FragColor = vec4(uMastColour, 1.0);
    else discard;
  }
`;

export class BeaconMarkers {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private spots: readonly BeaconSpot[] = [];

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthWrite: false,
      uniforms: {
        uView: { value: new THREE.Vector2(frameWidth(180), 180) },
        uSize: { value: BEACON_MARK.size }, uGap: { value: BEACON_MARK.gap },
        uRim: { value: rows('R') }, uCore: { value: rows('C') }, uMast: { value: rows('M') },
        uRimColour: { value: color(palette.crew.suit[1]) }, uCoreColour: { value: color(palette.crew.glint) },
        uMastColour: { value: color(palette.crew.gear[3]) },
      },
    });
    this.set([]);
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; // placed in clip space by its shader
    this.points.visible = false;
  }

  /** The bodies that hold beacons (model/beacons.ts beaconSpots). */
  set(spots: readonly BeaconSpot[]): void {
    this.spots = spots;
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(spots.length * 3), 3));
    this.geo.setAttribute('aRadius', new THREE.Float32BufferAttribute(new Float32Array(spots.length), 1));
  }

  get count(): number { return this.spots.length; }

  /** Poses every marker at exactly this frame, relative to the scene's floating origin (SystemScene.pose). */
  pose(model: SystemModel, frame: number, pixelHeight: number, origin: Vec3): void {
    // Hidden when empty, so a view without beacons draws exactly what it drew before them.
    this.points.visible = this.spots.length > 0;
    if (!this.points.visible) return;
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const rad = this.geo.getAttribute('aRadius') as THREE.BufferAttribute;
    this.spots.forEach((s, i) => {
      const b = spotBody(model, s, frame);
      pos.setXYZ(i, b.centre[0] - origin[0], b.centre[1] - origin[1], b.centre[2] - origin[2]);
      rad.setX(i, b.radius);
    });
    pos.needsUpdate = true;
    rad.needsUpdate = true;
    (this.mat.uniforms['uView']!.value as THREE.Vector2).set(frameWidth(pixelHeight), pixelHeight);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
