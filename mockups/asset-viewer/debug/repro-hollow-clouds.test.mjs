// Reproduction tests for the "hollow ring" clouds (USER-REPORT-hollow-rings.png).
// Run: node --test debug/repro-hollow-clouds.test.mjs        -> all three FAIL on 395c4d7
//      FIX=handed node --test debug/repro-hollow-clouds.test.mjs -> tests 0 and 1 PASS
//      (control: viewer.js served in memory with put()'s basis made right-handed)
//      SHADE=scalar ...                                           -> test 2 PASSES
//
// Test 0 (unit-level, no pixels): every cloud instance matrix has det > 0.
// Test 1 (primary, rings): for every weather biome x camera framing x pixel height,
// renders the hero planet's clouds as an ID pass and measures
//   backFacing - share of drawn cloud pixels whose OUTWARD normal faces away from the
//                camera, i.e. the far inner shell of a puff is what's on screen
//   coverage   - cloud pixels drawn as shipped / cloud pixels drawn with side=DoubleSide.
//                DoubleSide fills each puff's whole projected disc, so 1 - coverage is
//                the share of each disc where the planet surface shows through (the hole)
// Test 2 (secondary): the shipped CLOUD_FRAG shade must change in the same screen
// direction as the true Lambert term dot(N, L) (normalised-blend bug, viewer.js:227).
// It runs with the handedness control applied so it isolates the shading formula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from './repro-hollow-clouds.mjs';
import { HANDED_FIX } from './repro-hollow-rings.mjs';

const OUT_LINE = /gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/;
const BASE = { view: 'planet', seed: 7, size: 1, ringMode: 'thin', depth: false, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 6, time: 3 };
const FRAMINGS = {
  planet: null, // the viewer's own planet preset
  zoom: { pos: [0.95, 0.55, 3.3], target: [0, -0.1, 0] }, // the user's screenshot framing
  topdown: { pos: [0.1, 3.4, 0.4], target: [0, 0, 0] },
  grazing: { pos: [2.6, 1.2, 0.6], target: [0, 0.6, 0] },
};
const BIOMES = ['lush', 'ocean', 'lava', 'toxic']; // every biome that has weather
const HEIGHTS = [180, 360];

const grabCounts = () => {
  const src = document.getElementById('view');
  const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let front = 0, back = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === 0 && d[i + 1] === 255 && d[i + 2] === 0) front++;
    else if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) back++;
  }
  return { front, back };
};

test('every cloud instance matrix is right-handed (det > 0), all weather biomes and seeds', async () => {
  const { browser, page } = await openViewer(process.env.FIX === 'handed' ? { patch: HANDED_FIX } : {});
  try {
    const rows = {};
    for (const biome of BIOMES) for (const seed of [7, 42, 311, 999]) {
      rows[`${biome}/${seed}`] = await page.evaluate((o) => {
        window.viewer.set(o);
        const { THREE, planets, puffsOf } = window.__dbg;
        const puffs = puffsOf(planets[0]), m = new THREE.Matrix4();
        let bad = 0;
        for (let i = 0; i < puffs.count; i++) { puffs.getMatrixAt(i, m); if (!(m.determinant() > 1e-12)) bad++; }
        return { count: puffs.count, nonPositiveDet: bad };
      }, { ...BASE, biome, seed });
    }
    console.table(rows);
    const bad = Object.entries(rows).filter(([, r]) => r.nonPositiveDet > 0);
    assert.equal(bad.length, 0, `mirrored/degenerate puff matrices in ${bad.map(([k, r]) => `${k} (${r.nonPositiveDet}/${r.count})`).join(', ')}`);
  } finally {
    await browser.close();
  }
});

test('cloud puffs render as solid domes, not hollow rings (all weather biomes, framings, pixel heights)', async () => {
  const { browser, page } = await openViewer(process.env.FIX === 'handed' ? { patch: HANDED_FIX } : {});
  try {
    const rows = {};
    for (const biome of BIOMES) for (const [fname, camera] of Object.entries(FRAMINGS)) for (const pixelH of HEIGHTS) {
      rows[`${biome}/${fname}/${pixelH}`] = await page.evaluate(({ o, src, grab }) => {
        const { planets, puffsOf, renderer, scene, camera, THREE } = window.__dbg;
        window.viewer.set(o);
        const mat = puffsOf(planets[0]).material;
        mat.userData.orig ??= mat.fragmentShader;
        // ID pass: green = outward normal faces the camera, magenta = faces away
        mat.fragmentShader = mat.userData.orig.replace(new RegExp(src),
          'gl_FragColor = dot(normalize(vNormalW), cameraPosition - vPosW) >= 0.0 ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 1.0, 1.0);');
        mat.needsUpdate = true;
        const count = new Function(`return (${grab})()`);
        renderer.render(scene, camera);
        const shipped = count();
        mat.side = THREE.DoubleSide; mat.needsUpdate = true;
        renderer.render(scene, camera);
        const both = count();
        mat.side = THREE.FrontSide; mat.fragmentShader = mat.userData.orig; mat.needsUpdate = true;
        const drawn = shipped.front + shipped.back, disc = both.front + both.back;
        return { drawn, disc, backFacing: +(shipped.back / Math.max(1, drawn)).toFixed(3), coverage: +(drawn / Math.max(1, disc)).toFixed(3) };
      }, { o: { ...BASE, biome, pixelH, ...(camera ? { camera } : {}) }, src: OUT_LINE.source, grab: grabCounts.toString() });
    }
    console.table(rows);
    const bad = Object.entries(rows).filter(([, r]) => r.disc > 50 && (r.backFacing > 0.02 || r.coverage < 0.97));
    assert.equal(bad.length, 0, `hollow-ring clouds in ${bad.length}/${Object.keys(rows).length} renders, e.g. ${bad.slice(0, 4).map(([k, r]) => `${k}: ${(r.backFacing * 100).toFixed(0)}% back-shell, ${(r.coverage * 100).toFixed(0)}% of disc covered`).join('; ')}`);
  } finally {
    await browser.close();
  }
});

// ---- test 2: shading direction (secondary defect) ----
const SHADES = {
  prod: 'dot(n, uLight)',
  puffN: 'dot(g, uLight)',
  scalar: '(0.55 * dot(g, uLight) + 0.8 * dot(normalize(vPosW - uCenter), uLight)) / 1.35',
};
const SHADE = SHADES[process.env.SHADE ?? 'prod'];
// The shipped CLOUD_FRAG already declares g (the puff normal) and n; redeclaring g made
// this classifier fail to compile, so the test counted 0 cloud pixels and passed vacuously.
// Reference curvature: clouds in a mass shade as ONE dome (the mass-level model, so a mass
// reads as one body), so the shade must follow the dome's Lambert term: the direction from
// the mass anchor (vAnchorW), minus any part that points into the puff (the model drops it
// so undersides stay shaded). Smoke (vMass = 0) follows its own puff curvature.
// Never inverted: the shading normal must not point into the puff.
const CLASSIFY = `
  vec3 dome = normalize(vPosW - vAnchorW);
  dome -= min(dot(dome, g), 0.0) * g;
  float t = vMass > 0.5 ? dot(dome, uLight) : dot(g, uLight);
  float s = ${SHADE};
  vec2 gs = vec2(dFdx(s), dFdy(s)), gt = vec2(dFdx(t), dFdy(t));
  bool reversed = length(gs) > 0.02 && length(gt) > 0.02 && dot(normalize(gs), normalize(gt)) < -0.5;
  bool inverted = ${process.env.SHADE && process.env.SHADE !== 'prod' ? 'false' : 'dot(n, g) < 0.0'};
  gl_FragColor = (inverted || reversed) ? vec4(1.0, 0.0, 1.0, 1.0) : vec4(0.0, 1.0, 0.0, 1.0);
`;
const orbit = (az, el, d = 2.2, target = [0, 0, 0]) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return { pos: [target[0] + d * Math.cos(e) * Math.sin(a), target[1] + d * Math.sin(e), target[2] + d * Math.cos(e) * Math.cos(a)], target };
};
const ANGLES = { front: orbit(18, 10, 4.1), 'az90-el20': orbit(90, 20), 'az180-el20': orbit(180, 20), 'top-down': orbit(20, 85), 'grazing-north': orbit(10, 50, 1.45, [0, 0.85, 0.2]), under: orbit(30, -40) };

test('cloud shading agrees with mass-dome curvature (puff curvature for lone puffs) from every orbit angle', async () => {
  const { browser, page } = await openViewer({ patch: HANDED_FIX }); // isolate from the ring bug
  try {
    const results = {};
    for (const [name, camera] of Object.entries(ANGLES)) {
      results[name] = await page.evaluate(({ o, src, body, grab }) => {
        const { planets, puffsOf } = window.__dbg;
        const mat = puffsOf(planets[0]).material;
        mat.userData.orig ??= mat.fragmentShader;
        mat.fragmentShader = mat.userData.orig.replace(new RegExp(src), body);
        mat.needsUpdate = true;
        window.viewer.set(o);
        const { front, back } = new Function(`return (${grab})()`)();
        return { cloud: front + back, bad: back, badFrac: +(back / Math.max(1, front + back)).toFixed(4) };
      }, { o: { ...BASE, biome: 'lush', ringMode: 'off', moons: false, pixelH: 360, spin: false, time: 0, camera }, src: OUT_LINE.source, body: CLASSIFY, grab: grabCounts.toString() });
    }
    console.table(results);
    const empty = Object.entries(results).filter(([, r]) => r.cloud < 200).map(([n]) => n);
    assert.deepEqual(empty, [], 'classifier drew no cloud pixels (shader failed to compile?)');
    const failing = Object.entries(results).filter(([, r]) => r.badFrac > 0.001);
    assert.equal(failing.length, 0, `wrong-way cloud shading at: ${failing.map(([n, r]) => `${n} (${(r.badFrac * 100).toFixed(1)}%)`).join(', ')}`);
  } finally {
    await browser.close();
  }
});
