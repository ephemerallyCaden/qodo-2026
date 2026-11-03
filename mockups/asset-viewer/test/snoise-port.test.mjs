// The CPU simplex port (snoise.js) must match the planet shader's GLSL snoise, so lava
// ash placed from the fissure field lands on the fissures the shader draws. Renders
// snoise at 512 points (the ranges the surface uses: p * 2..4.6 + a seed offset of 0..50)
// into a float target and compares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { snoise } from '../snoise.js';

test('snoise.js matches the shader snoise (|cpu - gpu| < 1e-3)', async () => {
  const N = 512;
  const pts = Array.from({ length: N }, (_, i) => [Math.sin(i * 1.7) * 4.6 + (i % 50), Math.cos(i * 0.9) * 4.6 + ((i * 7) % 50), Math.sin(i * 0.37) * 4.6 + ((i * 13) % 50)]);
  const { browser, page } = await openViewer({ patch: (s) => `${s}\nwindow.__NOISE = NOISE;` });
  try {
    const gpu = await page.evaluate(({ pts, N }) => {
      const { THREE, renderer } = window.__dbg;
      const rt = new THREE.WebGLRenderTarget(N, 1, { type: THREE.FloatType });
      const data = new Float32Array(N * 4);
      pts.forEach((p, i) => data.set([...p, 1], i * 4));
      const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      const mat = new THREE.ShaderMaterial({
        uniforms: { tP: { value: tex } },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `${window.__NOISE}\nuniform sampler2D tP;\nvoid main() { vec3 p = texelFetch(tP, ivec2(gl_FragCoord.xy), 0).xyz; gl_FragColor = vec4(snoise(p), 0.0, 0.0, 1.0); }`,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      renderer.setRenderTarget(rt);
      renderer.render(scene, new THREE.Camera());
      const out = new Float32Array(N * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, N, 1, out);
      renderer.setRenderTarget(null);
      return Array.from({ length: N }, (_, i) => out[i * 4]);
    }, { pts, N });
    const err = Math.max(...pts.map((p, i) => Math.abs(snoise(...p) - gpu[i])));
    console.log(`max |cpu - gpu| over ${N} points: ${err.toExponential(2)}`);
    assert.ok(err < 1e-3, `snoise port drifts from the shader by ${err}`);
  } finally {
    await browser.close();
  }
});
