// The view's GLSL as three.js r187 actually submits it (#30). three is run against a recording fake
// WebGL2 context, so the test sees the exact strings it would pass to gl.shaderSource. This answers
// two local-review claims about the shaders (Qodo 9c2be965 and e85f8692):
// - a ShaderMaterial is compiled as GLSL ES 3.00 (WebGLProgram.js:763-779), so `in`/`out` and uint maths are legal;
// - the fragment prefix declares viewMatrix, cameraPosition and isOrthographic but not modelMatrix
//   (WebGLProgram.js:729-731), so the surface shader's own `uniform mat4 modelMatrix;` is its only one.
// It can't prove that a GPU accepts the GLSL. View.load does that at runtime (it compiles every
// program and refuses the scene on any error), and the render harness (#31) runs it in a browser.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { startPose } from '../../web/src/camera/pose.js';
import { systemModel } from '../../web/src/model/system.js';
import { SystemScene } from '../../web/src/render/scene.js';
import { CORONA } from '../../web/src/model/star.js';
import { FOG_MOON, FOG_SKY, FOG_SURFACE } from '../../web/src/render/fog-glsl.js';
import { CLOUD_FRAG, HAZE_FRAG, PLANET_FRAG, SHADOW_FRAG, SHADOW_REACH, STAR, STAR_FRAG } from '../../web/src/render/shaders.js';
import { miniLayout } from '../fixtures/contract/mini.js';

const VERTEX = 35633, FRAGMENT = 35632;
type Options = NonNullable<ConstructorParameters<typeof THREE.WebGLRenderer>[0]>;

/** A WebGL2 context that accepts everything and records each shader source. */
function recordingGl(): { gl: Options['context']; canvas: Options['canvas']; sources: { type: number; src: string }[] } {
  const sources: { type: number; src: string }[] = [];
  const types = new Map<object, number>();
  let id = 1;
  const constants: Record<string, number> = { VERTEX_SHADER: VERTEX, FRAGMENT_SHADER: FRAGMENT, VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724 };
  const canvas = { addEventListener() {}, removeEventListener() {}, width: 1, height: 1, style: {} };
  const gl = new Proxy({}, {
    get(_t, key: string) {
      if (key in constants) return constants[key];
      if (/^[A-Z0-9_]+$/.test(key)) return 0x1000 + key.length; // any other GL enum
      switch (key) {
        case 'canvas': return canvas;
        case 'getParameter': return (p: number) => (p === 7938 ? 'WebGL 2.0' : p === 35724 ? 'WebGL GLSL ES 3.00' : 16);
        case 'getShaderPrecisionFormat': return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
        case 'getExtension': return () => null;
        case 'getSupportedExtensions': return () => [];
        case 'getContextAttributes': return () => ({ alpha: false, antialias: false, depth: true, stencil: false });
        case 'createShader': return (type: number) => { const s = { id: id++ }; types.set(s, type); return s; };
        case 'shaderSource': return (s: object, src: string) => { sources.push({ type: types.get(s)!, src }); };
        case 'getProgramParameter': case 'getShaderParameter': return () => true;
        case 'getProgramInfoLog': case 'getShaderInfoLog': return () => '';
        case 'getActiveAttrib': case 'getActiveUniform': return () => null;
        case 'isContextLost': return () => false;
        default: return key.startsWith('create') ? () => ({ id: id++ }) : () => 0;
      }
    },
  });
  return { gl: gl as Options['context'], canvas: canvas as unknown as Options['canvas'], sources };
}

describe('the GLSL three submits for the view', () => {
  const { gl, canvas, sources } = recordingGl();
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  const system = new SystemScene(systemModel(miniLayout));
  system.pose(0, startPose(system.model), 180);
  system.scene.traverse((o) => { o.visible = true; }); // every material, as View.load compiles them
  renderer.compile(system.scene, system.camera);
  const fragments = sources.filter((s) => s.type === FRAGMENT).map((s) => s.src);
  const vertices = sources.filter((s) => s.type === VERTEX).map((s) => s.src);
  const declarations = (src: string, name: string) => src.match(new RegExp(`uniform\\s+mat4\\s+${name}\\s*;`, 'g'))?.length ?? 0;

  it('compiles every material of a system (surface, cloud shadow, clouds, haze, moons, star, stars)', () => {
    expect(fragments.length).toBeGreaterThanOrEqual(7);
    expect(fragments.some((f) => f.includes('uvec3 pcg3d'))).toBe(true); // the planet surface and its shadow
  });

  it('submits every program as GLSL ES 3.00, with gl_FragColor mapped to an output (9c2be965)', () => {
    for (const src of [...fragments, ...vertices]) expect(src.startsWith('#version 300 es\n')).toBe(true);
    for (const f of fragments) expect(f).toContain('#define gl_FragColor pc_fragColor');
  });

  it('draws the star, disc and corona, in one program on one inside-out mesh that writes its own depth and has no fog (#81)', () => {
    const stars = system.scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && (o.material as THREE.ShaderMaterial).fragmentShader === STAR_FRAG);
    expect(stars).toHaveLength(1); // one draw call, as before the Day 1 sun
    const star = stars[0]!;
    expect((star.material as THREE.ShaderMaterial).side).toBe(THREE.BackSide); // covers the corona from any camera, even inside it
    expect(star.scale.x).toBeCloseTo(system.model.star.radius * STAR.span, 6);
    expect(STAR_FRAG).toContain('gl_FragDepth = ');
    expect(STAR_FRAG, 'the corona never draws past the reach that hides what is behind it (Qodo 1ce5dd3d)').toContain(`, ${CORONA.reach.toFixed(3)})) discard;`);
    expect(STAR_FRAG).not.toMatch(/uFog|fog\(/); // the star has no file, so nothing fogs it (#74)
    const submitted = fragments.filter((f) => f.includes('uniform vec3 uDisc[5];'));
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.match(/uniform\s+mat4\s+projectionMatrix\s*;/g)).toHaveLength(1);
  });

  it('declares modelMatrix at most once per program, so the surface shader adds no duplicate (e85f8692)', () => {
    for (const f of fragments) expect(declarations(f, 'modelMatrix')).toBeLessThanOrEqual(1);
    const surfaces = fragments.filter((f) => f.includes('uvec3 pcg3d'));
    for (const f of surfaces) expect(declarations(f, 'modelMatrix')).toBe(1);
    for (const v of vertices) expect(declarations(v, 'modelMatrix')).toBe(1);
  });
});

describe('fog in the GLSL three submits (#74; cloud since #224)', () => {
  const { gl, canvas, sources } = recordingGl();
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  const system = new SystemScene(systemModel(miniLayout));
  system.pose(0, startPose(system.model), 180);
  system.scene.traverse((o) => { o.visible = true; });
  renderer.compile(system.scene, system.camera);
  const fragments = sources.filter((s) => s.type === FRAGMENT).map((s) => s.src);
  const vertices = sources.filter((s) => s.type === VERTEX).map((s) => s.src);

  it('draws fog as cloud over the ground, never as a veil on it: the surface keeps only the planet-clear pulse', () => {
    const surfaces = fragments.filter((f) => f.includes('uvec3 pcg3d'));
    expect(surfaces.length).toBeGreaterThanOrEqual(2); // the surface and its cloud shadow
    for (const f of surfaces) expect(f).toMatch(/fog\(p, b(?: - 1)?, (?:c|surface\(p, b - 1\))\)/);
    for (const f of [...fragments, FOG_SURFACE, FOG_MOON]) expect(f).not.toMatch(/uFogVeil|uRampFog|fogVeil|fogHatch|FOG_QMARK|uFogLimb/); // the D2d veil is gone
    // the fog's own puffs and their shadow draw only while the planet has fog (the visual-proof fog seam holds uFogOn at 0)
    expect(CLOUD_FRAG).toContain('if (fogSkyOff()) discard;');
    expect(SHADOW_FRAG).toContain('if (fogSkyOff() || vReach < 0.0 || vReach > uShadowReach) discard;');
    expect(FOG_SKY).toContain('return uFogSky > 0.5 && uFogOn == 0;');
    expect(HAZE_FRAG).toContain('if (fogHidesHaze(vPosW)) discard;'); // mini may draw no hazy look
    expect(fragments.filter((f) => f.includes('uniform vec3 uHaze')).every((f) => f.includes('if (fogHidesHaze(vPosW)) discard;'))).toBe(true);
    expect(CLOUD_FRAG).toContain('if (uSmoke > 0.5 && smokeFogged()) discard;'); // lava smoke hints at health
    const toon = fragments.filter((f) => f.includes('moonFog('));
    expect(toon.length).toBeGreaterThanOrEqual(1);
    for (const f of toon) expect(f).toContain('uniform vec3 uMoonCloud[4];'); // a fogged moon is cloud
    // #201: (level, kind, progress, from level) per instance
    expect(vertices.some((v) => v.includes('in vec4 aFog;') && v.includes('flat out vec4 vFog;'))).toBe(true);
  });

  it('declares projectionMatrix and uFogOn at most once per fragment program', () => {
    for (const f of fragments) expect(f.match(/uniform\s+mat4\s+projectionMatrix\s*;/g)?.length ?? 0).toBeLessThanOrEqual(1);
    for (const f of fragments) expect(f.match(/uniform\s+int\s+uFogOn\s*;/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('draws the fog sky as three cloud layers and one shadow per planet, on the ground\'s spin, in cloud, teal and mist', () => {
    const clouds = fragments.filter((f) => f.includes('uniform float uFogSky;') && f.includes('uniform vec3 uRamp[4];'));
    expect(clouds.length).toBeGreaterThanOrEqual(1);
    let skies = 0;
    system.scene.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      const m = o.material as THREE.ShaderMaterial;
      if (m.uniforms?.['uFogSky']?.value !== 1) return;
      skies++;
      // under the spin that turns the surface, so the cloud stays over its files
      const spin = o.parent!.parent!;
      expect(spin.children.some((c) => c instanceof THREE.Mesh && (c.material as THREE.ShaderMaterial).fragmentShader === PLANET_FRAG)).toBe(true);
    });
    expect(skies).toBe(system.model.planets.length * 4);
  });

  it('lets the storm\'s shadow fall as far as its height needs, and keeps the weather\'s shadow as it was (Qodo c8a30ce7)', () => {
    expect(SHADOW_FRAG).toContain('vReach > uShadowReach) discard;');
    const reach = { weather: [] as number[], storm: [] as number[] };
    system.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (m?.fragmentShader !== SHADOW_FRAG) return;
      (m.uniforms['uFogSky']!.value === 1 ? reach.storm : reach.weather).push(m.uniforms['uShadowReach']!.value as number);
    });
    expect(reach.storm).toEqual(system.model.planets.map(() => SHADOW_REACH.storm));
    expect(reach.weather.length).toBeGreaterThan(0); // mini's toxic planet has its rust smoke
    expect(new Set(reach.weather)).toEqual(new Set([0.1])); // the asset viewer's cut, unchanged
    expect(SHADOW_REACH.storm).toBeGreaterThan(SHADOW_REACH.weather);
  });
});
