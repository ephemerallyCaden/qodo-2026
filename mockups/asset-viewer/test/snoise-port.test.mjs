// The CPU ports (snoise.js) must match the planet shader's GLSL snoise, Voronoi cells (edge
// distance, own and across cells), crack mask and pool field, so the pool cut set on the CPU
// opens the plates the shader draws and lava ash lands on its fissures and shores. Renders
// snoise at 512 points (the ranges the surface uses: p * 2..4.6 + a seed offset of 0..50)
// into a float target and compares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { snoise, voronoiEdge, voronoiCells, poolField, crackMask } from '../snoise.js';

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

test('voronoiCells cells / poolField match the shader (99% of cells identical; pool field 99% within 1e-3, all within 0.02)', async () => {
  const N = 512;
  const pts = Array.from({ length: N }, (_, i) => [Math.sin(i * 1.3) * 3.8 + (i % 47), Math.cos(i * 0.7) * 3.8 + ((i * 11) % 47), Math.sin(i * 0.29) * 3.8 + ((i * 17) % 47)]);
  const { browser, page } = await openViewer({ patch: (s) => `${s}\nwindow.__NOISE = NOISE; window.__WORLEY = WORLEY_GLSL;` });
  try {
    const gpu = await page.evaluate(({ pts, N }) => {
      const { THREE, renderer } = window.__dbg;
      const rt = new THREE.WebGLRenderTarget(N, 2, { type: THREE.FloatType });
      const data = new Float32Array(N * 2 * 4);
      pts.forEach((p, i) => { data.set([...p, 1], i * 4); data.set([...p, 1], (N + i) * 4); });
      const tex = new THREE.DataTexture(data, N, 2, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      // row 0: own cell + pool field of own; row 1: across cell + edge distance
      const mat = new THREE.ShaderMaterial({
        uniforms: { tP: { value: tex } },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `${window.__NOISE}\n${window.__WORLEY}\nuniform sampler2D tP;\nvoid main() { ivec2 q = ivec2(gl_FragCoord.xy); vec3 p = texelFetch(tP, q, 0).xyz; vec3 own, across; float e = voronoiCells(p, own, across); gl_FragColor = q.y == 0 ? vec4(own, poolField(own, vec3(10.0, 20.0, 30.0), 0.3)) : vec4(across, e); }`,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      renderer.setRenderTarget(rt);
      renderer.render(scene, new THREE.Camera());
      const out = new Float32Array(N * 2 * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, N, 2, out);
      renderer.setRenderTarget(null);
      return Array.from({ length: N }, (_, i) => ({ own: Array.from(out.slice(i * 4, i * 4 + 3)), pool: out[i * 4 + 3], across: Array.from(out.slice((N + i) * 4, (N + i) * 4 + 3)), edge: out[(N + i) * 4 + 3] }));
    }, { pts, N });
    assert.ok(gpu.some((g) => g.edge > 0.01 && g.own.some((v) => v !== 0)), 'GPU returned no cells (empty render)');
    const same = (a, b) => a.every((v, k) => v === b[k]);
    const cpu = pts.map((p) => voronoiCells(...p));
    const ownOk = cpu.filter((c, i) => same(c.own, gpu[i].own)).length / N;
    const acrossOk = cpu.filter((c, i) => same(c.across, gpu[i].across)).length / N;
    const poolErr = cpu.map((c, i) => Math.abs(poolField(...c.own, 10, 20, 30, 0.3) - gpu[i].pool));
    const poolClose = poolErr.filter((e) => e < 1e-3).length / N;
    console.log(`own cell ${(ownOk * 100).toFixed(1)}%, across cell ${(acrossOk * 100).toFixed(1)}% identical; poolField ${(poolClose * 100).toFixed(1)}% within 1e-3, max ${Math.max(...poolErr).toExponential(2)}`);
    assert.ok(ownOk >= 0.99 && acrossOk >= 0.99, 'voronoiCells port picks other cells than the shader');
    assert.ok(poolClose >= 0.99 && Math.max(...poolErr) < 0.02, 'poolField port drifts from the shader');
  } finally {
    await browser.close();
  }
});
