// Reproduction tests for "hollow clouds" (run: node --test debug/repro-hollow-clouds.test.mjs).
// Both FAIL on 63f3913. Controls that prove each test can pass:
//   SHADE=scalar|puffN   -> test 2 passes (convex-correct cloud shading)
//   CAP_CONTROL=1        -> test 1 passes (cap re-tinted away from the cloud ramp)
//
// Test 1: polar ice cap seen through gaps in a cloud mass must not read as cloud. For each
// orbit frame, every cloud-edge pixel touching ice cap is compared with its neighbour;
// the share of near-identical pairs (RGB distance < 60) must stay as low as it is
// against the rest of the planet surface (<= 10%).
//
// Test 2:
// Renders the real viewer (headless Chromium, SwiftShader, no socket) from several orbit
// angles. The shipped CLOUD_FRAG is kept intact except its final colour line, which is
// replaced by a classifier: a cloud pixel is flagged when the shipped shading value
// changes in the OPPOSITE screen direction to the true Lambert term dot(N_geom, L).
// On a convex puff those two gradients must agree; where they disagree the toon bands
// run the wrong way and the puff reads as a concave bowl (the "hollow/hole" look).
// Also counts pixels whose shading normal faces into the puff (dot(n, N_geom) < 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from './repro-hollow-clouds.mjs';
import { measure, FRAMES } from './debug-cap-contrast.mjs';

const PROD_LINE = /gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/;
const CLASSIFY = `
  vec3 g = normalize(vNormalW);
  float s = SHADE;                   // what the shader under test shades by
  float t = dot(g, uLight);          // true Lambert term of the puff surface
  vec2 gs = vec2(dFdx(s), dFdy(s)), gt = vec2(dFdx(t), dFdy(t));
  bool reversed = length(gs) > 0.02 && length(gt) > 0.02 && dot(normalize(gs), normalize(gt)) < -0.5;
  bool inverted = dot(n, g) < 0.0;
  gl_FragColor = inverted ? vec4(1.0, 1.0, 0.0, 1.0) : reversed ? vec4(1.0, 0.0, 1.0, 1.0) : vec4(0.0, 1.0, 0.0, 1.0);
`;
const orbit = (az, el, d = 2.2, target = [0, 0, 0]) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return { pos: [target[0] + d * Math.cos(e) * Math.sin(a), target[1] + d * Math.sin(e), target[2] + d * Math.cos(e) * Math.cos(a)], target };
};
const ANGLES = {
  front: orbit(18, 10, 4.1),
  'az90-el20': orbit(90, 20),
  'az180-el20': orbit(180, 20),
  'top-down': orbit(20, 85),
  'grazing-north': orbit(10, 50, 1.45, [0, 0.85, 0.2]),
  under: orbit(30, -40),
};
// SHADE=prod (default) tests the shipped formula. The other values are controls that
// show the classifier passes for convex-correct shading:
//   puffN  - geometric normal only; scalar - blend the two dot products, not the vectors.
const SHADES = {
  prod: 'dot(n, uLight)',
  puffN: 'dot(g, uLight)',
  scalar: '(0.55 * dot(g, uLight) + 0.8 * dot(normalize(vPosW - uCenter), uLight)) / 1.35',
};
const SHADE = SHADES[process.env.SHADE ?? 'prod'];
const SHOT_DIR = process.env.SHOT_DIR; // optional: save classifier frames here
const MAX_BAD = 0.001; // controls (puffN, scalar) measure exactly 0; allow 0.1% for silhouette quads

test('cloud edges stay distinct from the polar cap they overlap', async () => {
  const { browser, page } = await openViewer();
  try {
    const results = {};
    for (const [name, p] of Object.entries(FRAMES)) {
      if (process.env.CAP_CONTROL) await page.evaluate(() => {
        const s = window.__dbg.planets[0].group.children[0];
        const orig = s.material.fragmentShader;
        s.material.fragmentShader = orig.replace('if (lat > 0.9) c = uC[b];', 'if (lat > 0.9) c = uC[b] * 0.45;');
        s.material.needsUpdate = true;
      });
      results[name] = (await measure(page, { pos: p, target: [0, 0, 0] })).cap;
    }
    console.table(results);
    const failing = Object.entries(results).filter(([, r]) => r.n > 30 && r.lowContrastFrac > 0.1);
    assert.equal(failing.length, 0, `cloud edges blend into the polar cap at: ${failing.map(([n, r]) => `${n} (${(r.lowContrastFrac * 100).toFixed(0)}% of ${r.n} edge px)`).join(', ')}`);
  } finally {
    await browser.close();
  }
});

test('cloud puff shading agrees with puff curvature from every orbit angle', async () => {
  const { browser, page } = await openViewer();
  try {
    await page.evaluate(({ src, body }) => {
      const sky = window.__dbg.scene.children.filter((o) => o.material?.depthTest === false);
      sky.forEach((o) => (o.visible = false));
      for (const p of window.__dbg.planets) {
        const pivot = p.group.children.find((c) => c.children?.[0]?.isInstancedMesh);
        const mat = pivot.children[0].material;
        mat.fragmentShader = mat.fragmentShader.replace(new RegExp(src), body);
        mat.needsUpdate = true;
      }
    }, { src: PROD_LINE.source, body: CLASSIFY.replace('SHADE', SHADE).replace('bool inverted = dot(n, g) < 0.0;', process.env.SHADE && process.env.SHADE !== 'prod' ? 'bool inverted = false;' : 'bool inverted = dot(n, g) < 0.0;') });
    const results = {};
    for (const [name, camera] of Object.entries(ANGLES)) {
      results[name] = await page.evaluate((camera) => {
        window.viewer.set({ view: 'studio', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 360, depth: false, spin: false, time: 0, ui: false, palette: 'final', camera });
        const src = document.getElementById('view');
        const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
        const ctx = c.getContext('2d');
        ctx.drawImage(src, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let cloud = 0, reversed = 0, inverted = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          if (r === 0 && g === 255 && b === 0) cloud++;
          else if (r === 255 && g === 0 && b === 255) { cloud++; reversed++; }
          else if (r === 255 && g === 255 && b === 0) { cloud++; inverted++; }
        }
        return { cloud, reversed, inverted, badFrac: +((reversed + inverted) / Math.max(1, cloud)).toFixed(4) };
      }, camera);
      if (SHOT_DIR) await page.locator('#view').screenshot({ path: `${SHOT_DIR}/classify-${process.env.SHADE ?? 'prod'}-${name}.png` });
    }
    console.table(results);
    const failing = Object.entries(results).filter(([, r]) => r.badFrac > MAX_BAD);
    assert.equal(failing.length, 0, `wrong-way cloud shading at: ${failing.map(([n, r]) => `${n} (${(r.badFrac * 100).toFixed(1)}%)`).join(', ')}`);
  } finally {
    await browser.close();
  }
});
