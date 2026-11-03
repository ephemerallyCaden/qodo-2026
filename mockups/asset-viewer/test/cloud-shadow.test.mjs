// Cloud shadow invariants (phantom-shadow bug at 9797b2f, debug/repro-cloud-shadow.mjs).
// Ground truth is CPU-side and independent of SHADOW_VERT's maths: a shadow pixel is any
// pixel that changes when the shadow is toggled (clouds hidden); it is legit only if the
// ray from its surface point TOWARDS the light enters a cloud puff within ~0.1 R.
//  1. non-vacuous: every frame draws a real shadow (fails on empty / missing output)
//  2. no phantoms: <= 2% of shadow pixels lack a cloud between them and the light
//  3. motion: shadows on the visible face drift with the visible clouds (right -> left),
//     at about the clouds' screen speed, not the reverse
// Control: FIX=tpos node --test test/cloud-shadow.test.mjs (t > 0 guard, in memory) passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { BASE, T_POSITIVE_FIX, classifyInPage, motion } from '../debug/repro-cloud-shadow.mjs';

const FRAMES = [
  ...[0, 1.5, 3, 4.5, 6, 7.5, 21].map((time) => ({ biome: 'lush', seed: 7, time })), // the hero loop: the shadow pattern repeats every cloud turn (8 s), so 0-7.5 s covers it
  ...[3, 15].map((time) => ({ biome: 'ocean', seed: 5, time })), // another cloudy biome
];
const DT = 0.25;

test('cloud shadow: every shadow pixel has a cloud towards the light, and drifts with the clouds', async () => {
  const { browser, page } = await openViewer(process.env.FIX === 'tpos' ? { patch: T_POSITIVE_FIX } : {});
  try {
    const rows = [];
    for (const f of FRAMES) {
      const o = { ...BASE, ...f, pixelH: 180 };
      const r0 = await page.evaluate(classifyInPage, { o });
      const r1 = await page.evaluate(classifyInPage, { o: { ...o, time: f.time + DT } });
      const mo = motion(r0, r1, DT);
      rows.push({ frame: `${f.biome}@${f.time}s`, shadowPx: r0.shadowPx, legit: r0.legit, phantom: r0.phantom,
        phantomShare: +(r0.phantom / Math.max(1, r0.shadowPx)).toFixed(3), shadowVx: mo.shadow.vx, cloudVx: mo.clouds.vx,
        rightwardGroups: mo.shadow.rightwardShare, groups: mo.shadow.groups });
    }
    console.table(rows);

    const empty = rows.filter((r) => r.legit < 100 || r.groups < 5);
    assert.equal(empty.length, 0, `no real cloud shadow rendered in ${empty.map((r) => `${r.frame} (${r.legit} legit px, ${r.groups} puffs)`).join(', ')}`);

    const phantom = rows.filter((r) => r.phantomShare > 0.02);
    assert.equal(phantom.length, 0, `phantom shadow (no cloud between surface and light) in ${phantom.length}/${rows.length} frames: ${phantom.map((r) => `${r.frame} ${r.phantom}/${r.shadowPx} px`).join('; ')}`);

    const wrongWay = rows.filter((r) => !(r.cloudVx < 0) || r.rightwardGroups > 0.1 || !(r.shadowVx / r.cloudVx > 0.6 && r.shadowVx / r.cloudVx < 1.8));
    assert.equal(wrongWay.length, 0, `shadow drift doesn't match the clouds in ${wrongWay.map((r) => `${r.frame}: shadow ${r.shadowVx} px/s vs clouds ${r.cloudVx} px/s, ${(r.rightwardGroups * 100).toFixed(0)}% moving the wrong way`).join('; ')}`);
  } finally {
    await browser.close();
  }
});
