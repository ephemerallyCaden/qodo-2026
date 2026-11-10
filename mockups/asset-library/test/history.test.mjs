// R9 and R10 (Node, no browser): the catalogue is labelled by meaning with current looks only,
// and the iteration view's data is a dated timeline per family, oldest to final, whose live steps
// are valid library states. The vendored history palettes match git at their source revisions
// (skipped where git or the revision isn't available).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as H from '../history.js';
import * as S from '../state.js';
import { GROUPS, ITEMS, BIOME_MEANING, EXTRA, RING_TAG } from '../catalogue.js';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';
import { LIBRARY_ROOT } from '../routes.mjs';
import { DRONE_PROVIDERS } from '../drones.js';

const git = (...args) => execFileSync('git', args, { cwd: LIBRARY_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const hasRev = (rev) => { try { git('cat-file', '-e', `${rev}^{commit}`); return true; } catch { return false; } };
const hexes = (o) => (typeof o === 'string' ? (/^#[0-9a-f]{6}$/.test(o) ? [o] : []) : o && typeof o === 'object' ? Object.values(o).flatMap(hexes) : []);

test('R9: planet tiles say what their look means, worst to best, with extras and rings tagged', () => {
  const all = GROUPS.find((g) => g.id === 'planets').items;
  const planets = all.filter((it) => !it.state.asset.trial); // (the dustier-ash trial sits beside desert: trials.test.mjs)
  assert.deepEqual(planets.map((it) => it.state.asset.biome), ['lava', 'toxic', 'desert', 'lush', 'ocean', 'ice', 'gas', 'moon']);
  const subs = Object.fromEntries(planets.map((it) => [it.state.asset.biome, it.sub]));
  assert.match(subs.lava, /worst health band/);
  assert.match(subs.toxic, /second-worst band/);
  assert.match(subs.desert, /ash band/);
  for (const [b, k] of [['lush', 1], ['ocean', 2], ['ice', 3]]) assert.match(subs[b], new RegExp(`healthy look ${k}/3`));
  for (const it of planets) assert.equal(it.tag, ['gas', 'moon'].includes(it.state.asset.biome) ? EXTRA : undefined, it.title);
  for (const it of planets) assert.equal(it.state.asset.ring, 'off', `${it.title}: no ring, its meaning is open`);
  for (const it of GROUPS.find((g) => g.id === 'rings').items) assert.equal(it.tag, RING_TAG, it.title);
  for (const b of S.BIOME_KEYS) assert.ok(BIOME_MEANING[b], b);
});

test('R9: no Nov 3 meanings and no acid lime outside the history view', () => {
  const text = GROUPS.flatMap((g) => [g.title, g.note, ...g.items.flatMap((it) => [it.title, it.sub ?? '', it.note ?? ''])]).join('\n');
  for (const old of [/stable, rarely touched/i, /\bstale\b/i, /churn/i, /shared lib/i, /healthy, active/i, /overgrown/i, /risky/i]) assert.doesNotMatch(text, old);
  const { sludge, ...lime } = H.VENDORED.acid.set; // its ochre sludge reuses the sand ramp: the lime and violet roles
  const acid = new Set(hexes(lime));
  assert.deepEqual(hexes(V2_PLANET_RAMPS).filter((x) => acid.has(x)), [], 'the shipped world palette holds no acid-lime colour');
  assert.deepEqual(hexes(ITEMS).filter((x) => acid.has(x)), [], 'no catalogue entry carries an acid-lime colour');
  assert.ok(ITEMS.every((it) => !it.state?.palette), 'catalogue entries carry no palette edits');
});

test('R10: every family is a dated timeline, oldest to final, each step saying what changed and why', () => {
  assert.deepEqual(H.FAMILY_IDS, ['crew', 'planets', 'toxic', 'lava', 'clouds', 'rings', 'palettes', 'depth', 'fx', 'drones']);
  const rows = [];
  for (const f of H.FAMILIES) {
    assert.ok(f.title && f.note, f.id);
    assert.ok(f.steps.length >= 3, `${f.id}: at least three steps`);
    f.steps.forEach((s, i) => {
      const at = `${f.id} step ${i + 1}`;
      assert.match(s.date, /^2026-\d\d-\d\d \d\d:\d\d$/, at);
      assert.match(s.rev, /^[0-9a-f]{7}$/, at);
      for (const k of ['title', 'changed', 'why']) assert.ok(s[k]?.length > 3, `${at}: ${k}`);
      if (i) assert.ok(f.steps[i - 1].date <= s.date, `${at}: oldest first`);
      assert.ok(!(s.live && s.img), `${at}: live or archived, not both`);
      assert.equal(!!s.final, i === f.steps.length - 1, `${at}: only the last step is final`);
    });
    rows.push(`${f.id.padEnd(9)} ${f.steps.map((s) => H.badgesOf(s)[0]).join(' → ')}`);
  }
  // the only step with neither: the drone lab's first round, whose renders were overwritten
  assert.deepEqual(H.FAMILIES.flatMap((f) => f.steps.filter((s) => !s.live && !s.img).map((s) => `${f.id}:${s.rev}`)), ['drones:90d28e5']);
  assert.deepEqual(H.badgesOf(H.family('toxic').steps.at(-1)), ['live', 'final']);
  assert.deepEqual(H.badgesOf(H.family('drones').steps.at(-1)), ['live', 'final'], 'the drones end on the live provider drones');
  assert.deepEqual(H.family('drones').steps.at(-1).live.options.list.map((o) => o.id), DRONE_PROVIDERS, 'one option per provider drone');
  console.log(rows.join('\n'));
});

test('R10: the toxic timeline runs acid lime -> sulphur -> rust-ember, live, in history colours only', () => {
  const steps = H.family('toxic').steps;
  assert.deepEqual(steps.map((s) => s.live.palette?.set), [H.VENDORED.acid.set, H.VENDORED.sulphur.set, undefined]);
  assert.ok(hexes(H.VENDORED.acid.set).includes('#a6d63a'), 'the lime is in the history');
  assert.deepEqual(V2_PLANET_RAMPS.toxic, ['#3a1c12', '#642c16', '#8e421c', '#b85e26', '#e88a34'], 'the final step is today\'s ember');
});

test('R10: live steps are valid library states and round-trip through the URL, for every option', () => {
  let n = 0;
  for (const f of H.FAMILIES) {
    f.steps.forEach((s, i) => {
      for (let option = 0; option < (s.live?.options?.list.length ?? 1); option++) {
        const v = H.view({ family: f.id, step: i, option });
        assert.equal(v.live, !!s.live);
        if (!v.live) continue;
        for (const it of v.items) assert.deepEqual(S.normaliseItem(S.normaliseItem(it)), S.normaliseItem(it));
        assert.deepEqual(S.normaliseRender(v.render), S.normaliseRender({ ...S.RENDER_DEFAULTS, ...v.render }), `${f.id} ${i}: known render fields only`);
        const st = S.normalise({ mode: 'history', history: { family: f.id, step: i, option, compare: 0 } });
        assert.deepEqual(S.decodeHash(S.encodeHash(st)), st);
        assert.equal(st.history.option, option);
        n++;
      }
    });
  }
  assert.ok(n > 40, `${n} live views`);
});

test('R10: the history state is clamped: unknown family, steps and options fall back', () => {
  assert.deepEqual(S.normaliseHistory({ family: 'nope', step: 99, option: 7, compare: 'x', camera: 3 }), { family: 'crew', step: H.family('crew').steps.length - 1, option: 0, compare: -1, camera: null });
  assert.equal(S.normaliseHistory({ family: 'toxic', step: 1, compare: 1 }).compare, -1, 'a step is not compared with itself');
  assert.equal(S.normaliseHistory({ family: 'crew', step: 7, option: 99 }).option, 9, 'the lab step has ten variants');
  assert.equal(S.normalise({ mode: 'history' }).mode, 'history');
  assert.equal(S.normalise({ mode: 'gallery' }).mode, 'asset');
});

test('R10: the vendored history palettes match git at their source revisions', { skip: !hasRev('HEAD') && 'not a git checkout' }, async (t) => {
  const show = (v) => git('show', `${v.rev}:${v.file}`);
  const mod = (src) => import(`data:text/javascript,${encodeURIComponent(src)}`);
  for (const [name, v] of Object.entries(H.VENDORED)) {
    await t.test(`${name} (${v.rev} ${v.key})`, { skip: !hasRev(v.rev) && `${v.rev} isn't in this clone` }, async () => {
      let at;
      if (v.file.endsWith('viewer.js')) {
        // f4ceea0 viewer.js imports three, so evaluate only its palette block (SUIT and PALETTES)
        const src = show(v);
        const block = src.slice(src.indexOf('const SUIT = {'), src.indexOf('export const CONTRIBUTOR_KEYS')).replace('export const PALETTES', 'const PALETTES');
        at = new Function(`${block}; return PALETTES;`)()[v.key.split('.')[1]];
      } else {
        const m = await mod(show(v));
        at = v.key.split('.').reduce((o, k) => o[k], m);
      }
      if (name === 'acid') {
        // the toxic roles only, and the toxic haze
        const roles = (o) => Object.fromEntries(['sludge', 'toxic', 'fungus', 'spore'].map((k) => [k, o[k]]));
        assert.deepEqual(roles(at), roles(v.set));
        assert.equal(at.haze.toxic, v.set.haze.toxic);
      } else if (name === 'sulphur') {
        const { haze, ...ramps } = at;
        assert.deepEqual({ ...ramps, haze: { toxic: haze } }, v.set);
      } else {
        assert.deepEqual(at, v.set);
      }
    });
  }
});

test('R10: every step\'s revision is a commit in this clone', { skip: !hasRev('HEAD') && 'not a git checkout' }, () => {
  const missing = [...new Set(H.FAMILIES.flatMap((f) => f.steps.map((s) => s.rev)))].filter((rev) => !hasRev(rev));
  assert.deepEqual(missing, []);
});
