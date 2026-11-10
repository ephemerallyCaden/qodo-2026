// Trial looks (Node, no browser): the dustier-ash trial is planet-health-looks P2 exactly (the
// ramps in mockups/health-looks/PROPOSALS.md, and the lab's formula), it changes only the ash
// look's sand and rock, and the state and catalogue keep it to the planets that ask for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRIALS, TRIAL_KEYS, trialOf, trialFor } from '../trials.js';
import * as S from '../state.js';
import { GROUPS, ITEMS, TRIAL_TAG } from '../catalogue.js';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';
import { hexToOklab, oklabToHex } from '../../health-looks/metrics.mjs';

const T = TRIALS['dusty-ash'];
const PROPOSALS = new URL('../../health-looks/PROPOSALS.md', import.meta.url);
/** The cells of the first markdown table row starting with `| label |` after `heading`. */
async function row(heading, label) {
  const md = await readFile(PROPOSALS, 'utf8');
  const line = md.slice(md.indexOf(heading)).split('\n').find((l) => l.startsWith(`| ${label} |`));
  return line.split('|').slice(2, -1).map((c) => c.trim());
}
const hexesIn = (cell) => cell.match(/#[0-9a-f]{6}/g);

test('dusty-ash is P2: the ramps PROPOSALS.md measured, and the lab\'s formula', async () => {
  assert.deepEqual(TRIAL_KEYS, ['dusty-ash']);
  const [sand, rock] = await row('## B. A different ash look', T.variant);
  assert.deepEqual(T.palette.set, { sand: hexesIn(sand), rock: hexesIn(rock) });
  const [shippedSand, shippedRock] = await row('## B. A different ash look', 'shipped');
  assert.deepEqual({ sand: hexesIn(shippedSand), rock: hexesIn(shippedRock) }, { sand: V2_PLANET_RAMPS.sand, rock: V2_PLANET_RAMPS.rock }, 'PROPOSALS.md was measured against today\'s ramps');
  // proposals.mjs: OKLab chroma x k and lightness + dL, hue kept
  for (const role of T.roles) assert.deepEqual(T.palette.set[role], V2_PLANET_RAMPS[role].map((hex) => { const [L, a, b] = hexToOklab(hex); return oklabToHex(L + T.dL, a * T.k, b * T.k); }), role);
  const means = await row('Look means at hero', T.variant), shipped = await row('Look means at hero', 'shipped');
  assert.deepEqual([shipped[0], means[0]], [T.measured.shipped, T.measured.trial], 'the inspector quotes the measured ash means');
});

test('the trial changes the ash look\'s sand and rock only, and no shipped colour', () => {
  assert.deepEqual(Object.keys(T.palette.set), T.roles);
  assert.equal(T.biome, 'desert');
  const shipped = new Set(JSON.stringify(V2_PLANET_RAMPS).match(/#[0-9a-f]{6}/g));
  assert.deepEqual(Object.values(T.palette.set).flat().filter((x) => shipped.has(x)), [], 'every trial colour is new');
});

test('the state keeps a trial to its own biome and to the inspector', () => {
  assert.equal(S.normalisePlanet({ biome: 'desert', trial: 'dusty-ash' }).trial, 'dusty-ash');
  for (const raw of [{ biome: 'lush', trial: 'dusty-ash' }, { biome: 'desert', trial: 'nope' }, { biome: 'desert', trial: 7 }, { biome: 'desert' }]) assert.equal(S.normalisePlanet(raw).trial, null, JSON.stringify(raw));
  const scene = S.normalise({ mode: 'scene', scene: { items: [{ kind: 'planet', biome: 'desert', trial: 'dusty-ash' }] } });
  assert.equal(scene.scene.items[0].trial, null, 'a scene has one palette, so its items show the shipped look');
  assert.equal(S.normalise({ asset: { kind: 'planet', biome: 'desert' }, trialCompare: true }).trialCompare, true);
  for (const asset of [{ kind: 'planet', biome: 'lush' }, { kind: 'astronaut' }]) assert.equal(S.normalise({ asset, trialCompare: true }).trialCompare, false, asset.kind);
  const st = S.normalise({ asset: { kind: 'planet', biome: 'desert', seed: 5, trial: 'dusty-ash' }, trialCompare: true });
  assert.deepEqual(S.decodeHash(S.encodeHash(st)), st);
  assert.equal(trialOf(st.asset), T);
  assert.equal(trialOf({ ...st.asset, biome: 'lush' }), null);
  assert.equal(trialFor('desert'), 'dusty-ash');
  assert.equal(trialFor('lush'), null);
});

test('the catalogue: a trial tile beside desert, and the lineup worst to best at hero and mid', () => {
  const planets = GROUPS.find((g) => g.id === 'planets').items;
  const i = planets.findIndex((it) => it.state.asset.trial);
  assert.equal(planets[i - 1].state.asset.biome, 'desert', 'beside desert');
  assert.deepEqual([planets[i].final, planets[i].tag, planets[i].state.asset.seed], [false, TRIAL_TAG, planets[i - 1].state.asset.seed]);
  const lineup = GROUPS.find((g) => g.id === 'trials').items;
  assert.deepEqual(lineup.map((it) => `${it.state.asset.biome}${it.state.asset.trial ? '*' : ''} ${it.state.camera ? 'mid' : 'hero'}`),
    ['lava hero', 'lava mid', 'toxic hero', 'toxic mid', 'desert hero', 'desert mid', 'desert* hero', 'desert* mid', 'lush hero', 'lush mid']);
  for (const it of lineup) assert.equal(it.final, !it.state.asset.trial, it.title);
  for (const it of lineup.filter((x) => x.state.camera)) assert.ok(Math.abs(Math.hypot(...it.state.camera.pos) - 12) < 1e-3, 'mid: distance 12 on the hero line');
  // only trial tiles carry the trial, and they say so
  for (const it of ITEMS.filter((x) => x.state?.asset.trial)) assert.equal(it.tag, TRIAL_TAG, it.title);
  assert.equal(ITEMS.filter((x) => x.state?.asset.trial).length, 3);
});
