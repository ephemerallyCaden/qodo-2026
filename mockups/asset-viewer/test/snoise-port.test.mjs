// The CPU ports (snoise.js) must match the planet shader's GLSL snoise, Voronoi edge
// distance and crack mask, so lava ash placed from the fissure field lands on the
// fissures the shader draws. Renders
// snoise at 512 points (the ranges the surface uses: p * 2..4.6 + a seed offset of 0..50)
// into a float target and compares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { snoise, voronoiEdge, crackMask } from '../snoise.js';

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

test('voronoiEdge / crackMask match the shader (99% of points within 1e-3, all within 0.02)', async () => {
  const N = 512;
  const pts = Array.from({ length: N }, (_, i) => [Math.sin(i * 1.3) * 3.2 + (i % 47), Math.cos(i * 0.7) * 3.2 + ((i * 11) % 47), Math.sin(i * 0.29) * 3.2 + ((i * 17) % 47)]);
  const { browser, page } = await openViewer({ patch: (s) => `${s}\nwindow.__NOISE = NOISE; window.__WORLEY = WORLEY_GLSL;` });
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
        fragmentShader: `${window.__NOISE}\n${window.__WORLEY}\nuniform sampler2D tP;\nvoid main() { vec3 p = texelFetch(tP, ivec2(gl_FragCoord.xy), 0).xyz; gl_FragColor = vec4(voronoiEdge(p), crackMask(p * 0.1, 3.2, vec3(10.0, 20.0, 30.0)), 0.0, 1.0); }`,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      renderer.setRenderTarget(rt);
      renderer.render(scene, new THREE.Camera());
      const out = new Float32Array(N * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, N, 1, out);
      renderer.setRenderTarget(null);
      return Array.from({ length: N }, (_, i) => [out[i * 4], out[i * 4 + 1]]);
    }, { pts, N });
    const errE = pts.map((p, i) => Math.abs(voronoiEdge(...p) - gpu[i][0]));
    const errM = pts.map((p, i) => Math.abs(crackMask(p[0] * 0.1, p[1] * 0.1, p[2] * 0.1, 3.2, 10, 20, 30) - gpu[i][1]));
    assert.ok(gpu.some(([e]) => e > 0.01), 'GPU returned no edge distances (empty render)');
    for (const [name, err] of [['voronoiEdge', errE], ['crackMask', errM]]) {
      const close = err.filter((e) => e < 1e-3).length / N;
      console.log(`${name}: ${(close * 100).toFixed(1)}% within 1e-3, max ${Math.max(...err).toExponential(2)}, p95 ${[...err].sort((a, b) => a - b)[Math.floor(N * 0.95)].toExponential(2)}`);
      assert.ok(close >= 0.99 && Math.max(...err) < 0.02, `${name} port drifts from the shader`);
    }
  } finally {
    await browser.close();
  }
});
