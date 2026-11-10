// Asset library: catalogue (R1), inspector (R2), scene composer (R3), palette editor (R4),
// presets (R5), the iteration view (R10) and trial looks over the asset viewer's real assets. The whole screen is one state object
// (state.js); every change goes through apply(), which validates it, rebuilds what changed,
// renders and writes the URL. Labels and UI are HTML outside the pixel pass.
import { EYE_DESIGNS, eyesFor } from '../asset-viewer/faces.js';
import { BIOMES, WEATHER } from '../asset-viewer/viewer.js';
import { renderer, camera, controls, frameWidth, Stage, applyRender, retintStage, placeCamera, renderToCanvas, renderToImage, FRAMING_CAMERAS, frameCamera, labVariant } from './engine.js';
import * as S from './state.js';
import { GROUPS as CATALOGUE, ITEMS, showcaseScene, crewScene, BIOME_MEANING, EXTRA, RING_TAG } from './catalogue.js';
import * as P from './palette.js';
import * as H from './history.js';
import { TRIALS, trialOf, trialFor } from './trials.js';
import { BRANDS, PARAMS as DRONE_PARAMS, DRONE_VARIANTS, DRONE_VIEWS, ZOOM, brandName, variantOf, droneLook } from './drones.js';

const $ = (id) => document.getElementById(id);
const clone = structuredClone;
const canvas = renderer.domElement;
controls.enableDamping = false; // the camera stops where it's released, so the URL records what's on screen

// ---------------------------------------------------------------- state
const stages = { asset: new Stage(), scene: new Stage(), history: new Stage() };
const thumbStages = {}; // one per asset kind, made on first use
const thumbStage = (kind) => (thumbStages[kind] ??= new Stage());
const offStages = {}; // the iteration view's off-screen stages: 'cmp' (the comparison) and 'thumb' (its timeline)
const offStage = (key) => (offStages[key] ??= new Stage());
let state = S.decodeHash(location.hash) ?? { ...S.defaultState(), render: { ...S.RENDER_DEFAULTS, play: true } };
const tabFor = (mode) => ({ scene: 'scene', history: 'history' })[mode] ?? 'inspect';
let tab = tabFor(state.mode);
let pal = null; // the library palette object (base + edits): catalogue, inspector, composer
let hv = null; // history mode: the step on the stage (historyView)
let hc = null; // history mode: the step beside it, or null
let tc = null; // asset mode: the inspected planet in its other look (current <-> trial), when comparing
let lastCamera = '';
let dirty = true;
let current = null; // catalogue id the inspector was opened from
let playFrom = { t: state.render.t, at: performance.now() };
let editPath = null; // palette swatch being edited

const items = () => (state.mode === 'asset' ? [state.asset] : state.mode === 'scene' ? state.scene.items : hv?.live ? hv.items : []);
const stage = () => stages[state.mode];
const isLab = () => state.mode === 'asset' && state.asset.kind === 'lab';
const now = () => (state.render.play ? playFrom.t + (performance.now() - playFrom.at) / 1000 : state.render.t);

function cameraFor() {
  if (state.mode === 'history') return hv?.live ? state.history.camera ?? hv.camera : null;
  if (state.mode === 'scene') {
    const key = { depth: 'depth', crew: 'scene-crew', system: 'system' }[state.scene.framing];
    return state.scene.camera ?? FRAMING_CAMERAS[key];
  }
  return state.camera ?? frameCamera(state.framing, state.asset);
}
function minDistance() {
  const solo = state.mode === 'asset' ? state.asset : state.mode === 'history' && hv?.items.length === 1 ? hv.items[0] : null;
  return solo?.kind === 'planet' ? 1.35 * solo.size : 0.3;
}

// ---------------------------------------------------------------- looks
// The viewer's active palette and its loop and depth settings are globals, and a stage's materials
// hold the colours they were last tinted with. So every render goes through useLook(stage, look):
// it makes the look active (the library palette, or a history step's or trial's look palette, with
// that render's loop and depth settings) and retints the stage only when its look changed.
const LOOK_RENDER = ['depth', 'depthMode', 'depthBands', 'period', 'surfaceTurns', 'cloudTurns']; // what applyRender reads
let activeLook = '';
let libraryGen = 0; // bumped when the palette edits rebuild the library palette, so its look changes
const lookKey = ({ own = false, spec = null, render }) => JSON.stringify([own ? spec ?? {} : libraryGen, LOOK_RENDER.map((k) => render[k])]);
/** look: { own, spec, render } (own: a look palette for spec, else the library's). Makes it active and stage `st` tinted for it. */
function useLook(st, look) {
  const key = lookKey(look);
  if (key !== activeLook) {
    activeLook = key;
    if (look.own) P.lookPalette(look.spec);
    else P.activate(state.palette);
    applyRender(look.render); // depth uniforms read the active palette's depth tints, so palette changes re-apply them too
  }
  if (st.lookKey !== key) {
    retintStage(st); // its colours re-resolve, in this look, on its next pose
    st.lookKey = key;
  }
}
const libraryLook = () => ({ render: state.render });
/** A planet item's look: its trial's palette (trials.js), or the library's. */
const itemLook = (it, render = state.render) => (trialOf(it) ? { own: true, spec: trialOf(it).palette, render } : { render });
function stageLook() {
  if (hv?.live) return { own: true, spec: hv.palette, render: hv.render };
  return state.mode === 'asset' ? itemLook(state.asset) : libraryLook();
}
const lookPal = (look) => (look.own ? P.lookPalette(look.spec) : pal);

/** The one way state changes. opts.panel: rebuild the control panel (structural changes only). */
function apply(next, { panel = true } = {}) {
  const prevPlay = state.render.play;
  state = S.normalise(next);
  if (state.render.play && !prevPlay) playFrom = { t: state.render.t, at: performance.now() };
  const lib = P.library(state.palette); // a no-op unless the edits changed
  if (lib.edited) {
    libraryGen++; // the library palette was rebuilt (and activated): every stage in it retints
    activeLook = '';
    if (pal) thumbsSoon(); // (the first build at boot queues them anyway)
  }
  pal = lib.palette;
  // history mode: a live step renders in its own palette and render settings (R10)
  hv = state.mode === 'history' ? historyView(state.history) : null;
  hc = hv && state.history.compare >= 0 ? historyView(state.history, state.history.compare) : null;
  tc = state.trialCompare ? trialView() : null;
  const look = stageLook();
  useLook(stage(), look);
  if (!hv || hv.live) stage().sync(items(), lookPal(look));
  // a drone's sparkles keep the lab's pixel size at its framing's zoom
  stage().droneZoom = state.mode === 'asset' ? ZOOM[state.framing] ?? 1 : state.mode === 'history' ? ZOOM[hv?.framing] ?? 1 : 1;
  const cam = cameraFor();
  const camKey = JSON.stringify([state.mode, cam]);
  if (cam && camKey !== lastCamera) {
    lastCamera = camKey;
    placeCamera(cam, minDistance());
  }
  writeHash();
  dirty = true;
  if (panel) buildPanel();
  syncChrome();
}
const update = (fn, opts) => { const n = clone(state); fn(n); apply(n, opts); };

let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', S.encodeHash(state)), 120);
}
addEventListener('hashchange', () => { const s = S.decodeHash(location.hash); if (s) { apply(s); } });

// The orbit camera: on release, store the (rounded) camera so the URL reproduces the view.
controls.addEventListener('end', () => {
  const r = (v) => v.toArray().map((x) => Math.round(x * 1e4) / 1e4);
  const cam = { pos: r(camera.position), target: r(controls.target) };
  update((n) => { if (n.mode === 'scene') n.scene.camera = cam; else if (n.mode === 'history') n.history.camera = cam; else n.camera = cam; }, { panel: false });
});

// ---------------------------------------------------------------- render loop
function sizes() {
  const h = state.render.pixelH, w = frameWidth(h);
  const well = $('well');
  const scale = Math.max(1, Math.floor(Math.min((well.clientWidth - 16) / w, (well.clientHeight - 16) / h)));
  return { w, h, scale };
}
function drawStage() {
  if (state.mode === 'history') return drawHistory();
  if (tc) return drawTrialCompare();
  useLook(stage(), stageLook()); // a thumbnail or off-screen render may have switched it
  const { w, h, scale } = sizes();
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  renderToCanvas(stage(), now(), state.render, w, h);
  drawSelection(w, h, scale);
  const edits = Object.keys(P.cleanEdits(state.palette)).length;
  const status = [
    `<span><b>${w}×${h}</b> ×${scale}</span>`,
    `<span>t <b>${now().toFixed(2)} s</b> / ${state.render.period} s loop</span>`,
    `<span>palette <b>${edits ? `${edits} edits` : 'base'}</b></span>`,
    `<span>${state.mode === 'scene' ? `<b>${state.scene.items.length}</b> items · click selects · shift-drag moves` : 'drag orbits · scroll zooms'}</span>`,
  ].join('');
  if (status !== drawStage.status) $('status').innerHTML = drawStage.status = status;
}
function drawSelection(w, h, scale) {
  const box = $('sel');
  const b = state.mode === 'scene' && state.scene.selected >= 0 ? stage().screenBounds(state.scene.selected, w, h) : null;
  if (!b) { box.style.display = 'none'; return; }
  const r = Math.max(b.r, 6) * scale + 4;
  Object.assign(box.style, { display: 'block', left: `${b.x * scale - r}px`, top: `${b.y * scale - r}px`, width: `${2 * r}px`, height: `${2 * r}px` });
  box.firstChild.textContent = describe(state.scene.items[state.scene.selected]);
}
renderer.setAnimationLoop(() => {
  renderThumbs(2);
  renderHistoryThumbs();
  if (dirty || state.render.play) {
    dirty = false;
    drawStage();
  }
});
addEventListener('resize', () => (dirty = true));

// ---------------------------------------------------------------- catalogue (R1)
// Thumbnails render when their tile scrolls near the catalogue's view (an IntersectionObserver),
// not all at boot: a tile is "fresh" once it shows the current palette, and palette edits make
// every tile stale again (the visible ones re-render, the rest when they scroll into view).
const THUMB_W = 160, THUMB_H = 90;
const thumbQueue = [];
const thumbCanvases = new Map();
const paletteCanvases = new Map();
const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
const tileNear = new Set(); // tile ids near the catalogue's view
const tileFresh = new Set(); // tile ids whose thumbnail is current
let tilesSeen = false; // the observer has reported once
function queueNear() {
  for (const id of tileNear) {
    const it = ITEM_BY_ID.get(id);
    if (it?.state && !tileFresh.has(id) && !thumbQueue.includes(it)) thumbQueue.push(it);
  }
}
const tileObserver = new IntersectionObserver((entries) => {
  for (const e of entries) (e.isIntersecting ? tileNear.add(e.target.dataset.id) : tileNear.delete(e.target.dataset.id));
  tilesSeen = true;
  queueNear();
}, { root: $('catalogue'), rootMargin: '400px 0px' });
/** Every tile near the view is rendered and current (thumbnails further down render when they come into view). */
const thumbsDone = () => tilesSeen && !thumbTimer && [...tileNear].every((id) => !ITEM_BY_ID.get(id)?.state || tileFresh.has(id));
// Palette edits re-render the thumbnails once the edit settles, not on every colour-picker tick.
let thumbTimer = 0;
function thumbsSoon() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => { thumbTimer = 0; thumbsDirty(); }, 150);
}
function thumbsDirty() {
  tileFresh.clear();
  thumbQueue.length = 0;
  queueNear();
  for (const [group, cv] of paletteCanvases) paletteThumb(cv, group);
}
function renderThumbs(n) {
  for (let k = 0; k < n && thumbQueue.length; k++) {
    const it = thumbQueue.shift();
    const st = S.normalise({ ...it.state, asset: it.state.asset });
    // each tile in its own look (the library's, or a trial's); a trial tile has its own stage, tinted for it
    const look = itemLook(st.asset);
    const ts = thumbStage(st.asset.kind);
    useLook(ts, look);
    ts.sync([st.asset], lookPal(look));
    ts.droneZoom = ZOOM[`thumb-${st.framing}`] ?? 1;
    const img = renderToImage(ts, it.t ?? 3, S.RENDER_DEFAULTS, THUMB_W, THUMB_H, st.camera ?? frameCamera(`thumb-${st.framing}`, st.asset) ?? frameCamera(st.framing, st.asset));
    thumbCanvases.get(it.id)?.getContext('2d').putImageData(img, 0, 0);
    tileFresh.add(it.id);
  }
}
function paletteThumb(cv, groupId) {
  const ctx = cv.getContext('2d');
  const sw = P.swatches(P.GROUPS.find((g) => g.id === groupId)).map((s) => s.path.split('.').reduce((o, k) => o?.[k], pal) ?? s.hex);
  ctx.fillStyle = pal.space;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  const top = 22; // below the badge
  const cols = Math.min(14, Math.max(4, Math.ceil(Math.sqrt(sw.length * 2.4)))), rows = Math.ceil(sw.length / cols);
  const cw = Math.min(22, Math.floor((THUMB_W - 12) / cols)), ch = Math.min(16, Math.floor((THUMB_H - top - 6) / rows));
  sw.forEach((hex, i) => { ctx.fillStyle = hex; ctx.fillRect(6 + (i % cols) * cw, top + Math.floor(i / cols) * ch, cw - 2, ch - 2); });
}
function buildCatalogue() {
  const root = $('catalogue');
  root.textContent = '';
  for (const g of CATALOGUE) {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.innerHTML = `<h2>${g.title}</h2><p>${g.note}</p>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const it of g.items) {
      const b = document.createElement('button');
      b.className = `tile${it.final ? '' : ' explore'}`;
      b.dataset.id = it.id;
      const badge = it.ported === false ? '<span class="badge todo">not yet ported</span>' : it.tag ? `<span class="badge ${it.final ? 'tag' : 'explore'}">${it.tag}</span>` : it.final ? '<span class="badge final">final</span>' : '<span class="badge explore">exploration</span>';
      if (it.state || it.palette) {
        const cv = document.createElement('canvas');
        cv.width = THUMB_W; cv.height = THUMB_H;
        b.append(cv);
        if (it.state) thumbCanvases.set(it.id, cv);
        else paletteCanvases.set(it.palette, cv);
      } else {
        b.insertAdjacentHTML('beforeend', `<span class="ph">${it.note}</span>`);
      }
      b.insertAdjacentHTML('beforeend', `${badge}<span class="cap"><b>${it.title}</b><i>${it.sub ?? (it.variant ? labVariant(it.variant).name : '')}</i></span>`);
      const meaning = it.state?.asset.kind === 'planet' && g.id === 'planets' ? ` · ${BIOME_MEANING[it.state.asset.biome]}` : '';
      b.title = it.variant ? `${labVariant(it.variant).name}: ${labVariant(it.variant).leaning}` : `${it.title} · ${it.sub ?? ''}${meaning}`;
      b.onclick = () => openItem(it);
      grid.append(b);
      tileObserver.observe(b);
    }
    sec.append(grid);
    root.append(sec);
  }
}
function openItem(it) {
  current = it.id;
  if (it.palette) {
    tab = 'palette';
    if (state.mode === 'history') update((n) => { n.mode = 'asset'; });
    else apply(state);
    document.querySelector(`[data-pal-group="${it.palette}"]`)?.scrollIntoView({ block: 'start' });
    return;
  }
  if (!it.state) {
    toast(it.note);
    return;
  }
  tab = 'inspect';
  update((n) => {
    n.mode = 'asset';
    n.focus = it.state.focus;
    n.framing = it.state.framing;
    n.camera = it.state.camera ?? null;
    n.asset = it.state.asset;
    n.trialCompare = false;
    if (it.t !== undefined) n.render = { ...n.render, t: it.t, play: false };
  });
}

// ---------------------------------------------------------------- controls (tiny DOM kit)
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
}
const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
function slider(label, value, { min, max, step = 0.01, fmt = fmt2, disabled = false, title }, onInput) {
  const val = h('span', { class: 'val' }, fmt(value));
  const input = h('input', { type: 'range', min, max, step, value, disabled, 'aria-label': label, title });
  input.oninput = () => { val.textContent = fmt(+input.value); onInput(+input.value); };
  input.onchange = () => buildPanel(); // settle: refresh dependent readouts
  return h('label', { class: 'row', title }, h('span', {}, label), input, val);
}
function select(label, value, options, onChange, { disabled = false } = {}) {
  const sel = h('select', { 'aria-label': label, disabled }, options.map(([v, text]) => h('option', { value: String(v), selected: String(v) === String(value) }, text)));
  sel.onchange = () => onChange(sel.value);
  return h('label', { class: 'row wide' }, h('span', {}, label), sel);
}
function check(label, value, onChange, { disabled = false, title } = {}) {
  const c = h('input', { type: 'checkbox', checked: value, disabled, 'aria-label': label });
  c.onchange = () => onChange(c.checked);
  return h('label', { class: 'row wide', title }, h('span', {}, label), c);
}
const section = (title, open, ...rows) => h('details', { open }, h('summary', {}, title), ...rows);
const note = (text, cls = '') => h('p', { class: `note ${cls}` }, text);
const ramp = (hexes) => h('span', { class: 'ramp' }, hexes.map((c) => h('i', { style: `background:${c}`, title: c })));
const buttons = (...bs) => h('div', { class: 'btns' }, ...bs);
const btn = (text, onclick, { on = false, title, disabled = false } = {}) => h('button', { class: on ? 'on' : '', onclick, title, disabled, type: 'button' }, text);

// The item being edited and how to patch it: the inspected asset, or the selected scene item.
function target() {
  if (state.mode === 'scene') {
    const i = state.scene.selected;
    return i < 0 ? null : { it: state.scene.items[i], patch: (p, opts) => update((n) => Object.assign(n.scene.items[i], p), opts) };
  }
  return { it: state.asset, patch: (p, opts) => update((n) => Object.assign(n.asset, p), opts) };
}
const live = { panel: false }; // slider drags: re-render, keep the panel

function describe(it) {
  if (!it) return '';
  if (it.kind === 'planet') return `planet · ${trialOf(it)?.title ?? BIOMES[it.biome].label.replace(' (extra)', '')} ${it.seed}${trialOf(it) ? ' (trial)' : ''}`;
  if (it.kind === 'astronaut') return `astronaut · ${it.handle || 'anon'}`;
  if (it.kind === 'drone') return it.variant ? `drone ${it.variant} (exploration)` : `drone · ${brandName(it.provider)}${it.session === null ? '' : ` #${it.session}`}`;
  return `exploration ${it.variant}`;
}

function planetControls(it, patch) {
  const weather = WEATHER[BIOMES[it.biome].weather];
  const orbit = (i, key) => (v) => patch({ moonOrbits: it.moonOrbits.map((o, j) => (j === i ? { ...o, [key]: v } : o)) }, live);
  const layer = (key) => (v) => patch({ layers: { ...it.layers, [key]: v } });
  const order = { planet: ['planet', 'ring', 'clouds', 'moons', 'fx', 'look'], moon: ['moons', 'planet', 'look', 'ring', 'clouds', 'fx'], ring: ['ring', 'planet', 'look', 'moons', 'clouds', 'fx'], clouds: ['clouds', 'planet', 'look', 'ring', 'moons', 'fx'], fx: ['fx', 'planet', 'ring', 'clouds', 'moons', 'look'] }[state.mode === 'scene' ? 'planet' : state.focus];
  const lead = order.slice(0, 2).map((k) => ({ planet: 'planet', ring: 'ring', clouds: 'clouds', moons: 'moons', fx: 'artefacts', look: 'layers and look' })[k]);
  const open = (title) => lead.includes(title);
  const groups = {
    planet: () => section('planet', open('planet'),
      select('biome', it.biome, Object.entries(BIOMES).map(([k, b]) => [k, b.label]), (v) => patch({ biome: v, cover: null, float: null })),
      note(`means ${BIOME_MEANING[it.biome]}`),
      state.mode === 'asset' && trialFor(it.biome) ? trialControls(it, patch) : null,
      slider('seed', it.seed, { min: 1, max: 999, step: 1, fmt: String }, (v) => patch({ seed: v }, live)),
      buttons(btn('seed −1', () => patch({ seed: Math.max(1, it.seed - 1) })), btn('seed +1', () => patch({ seed: it.seed + 1 }))),
      slider('size', it.size, { min: 0.25, max: 2.2, title: 'planet scale: size stands for LOC' }, (v) => patch({ size: v }, live)),
      it.biome === 'lava' ? select('lava mode', it.lavaMode, S.LAVA_MODES.map((m) => [m, m === 'layered' ? 'layered (final)' : `${m} (A/B)`]), (v) => patch({ lavaMode: v })) : null),
    ring: () => section('ring', open('ring'),
      note('meaning open: rings stay in the library, out of the product view, until they encode something'),
      select('ring', it.ring, [['off', 'off'], ['thin', 'thin'], ['wide', 'wide']], (v) => patch({ ring: v, ...(S.RING_PRESETS[v] ? { ringWidth: S.RING_PRESETS[v].width, ringInner: S.RING_PRESETS[v].inner } : {}) })),
      slider('width', it.ringWidth, { min: 0.03, max: 1, disabled: it.ring === 'off', title: 'radial width in planet radii' }, (v) => patch({ ringWidth: v }, live)),
      slider('distance', it.ringInner, { min: 1.2, max: 2.8, disabled: it.ring === 'off', title: 'inner edge in planet radii' }, (v) => patch({ ringInner: v }, live))),
    clouds: () => section('clouds', open('clouds'),
      weather ? null : note('this biome has no weather'),
      slider('cover', it.cover ?? weather?.cover ?? 0, { min: 0, max: 0.45, disabled: !weather, fmt: (v) => `${Math.round(v * 100)}%`, title: 'share of the visible disc' }, (v) => patch({ cover: v }, live)),
      slider('float', it.float ?? weather?.float ?? 0, { min: 0, max: 0.2, step: 0.005, disabled: !weather, fmt: (v) => v.toFixed(3), title: 'gap between the terrain and the puff bases' }, (v) => patch({ float: v }, live)),
      buttons(btn('biome defaults', () => patch({ cover: null, float: null }), { disabled: it.cover === null && it.float === null })),
      check('shadow', it.cloudShadow, (v) => patch({ cloudShadow: v }), { disabled: !weather })),
    moons: () => section('moons', open('moons'),
      check('moons', it.moons, (v) => patch({ moons: v })),
      ...it.moonOrbits.flatMap((m, i) => [
        h('p', { class: 'note' }, i === 0 ? 'big moon' : 'small moon'),
        slider('size', m.size, { min: 0.02, max: 0.4, step: 0.002, fmt: (v) => v.toFixed(3), disabled: !it.moons }, orbit(i, 'size')),
        slider('orbit', m.orbit, { min: 1.1, max: 4, disabled: !it.moons, title: 'orbit radius in planet radii' }, orbit(i, 'orbit')),
        slider('tilt', m.incl, { min: -1.5, max: 1.5, disabled: !it.moons }, orbit(i, 'incl')),
        slider('yaw', m.yaw, { min: -3.2, max: 3.2, disabled: !it.moons }, orbit(i, 'yaw')),
        slider('phase', m.offset, { min: 0, max: 1, disabled: !it.moons, title: 'position on the orbit (one orbit per surface turn)' }, orbit(i, 'offset')),
      ]),
      buttons(btn('reset orbits', () => patch({ moonOrbits: S.MOON_DEFAULTS })))),
    fx: () => section('artefacts', open('artefacts'),
      check('artefacts', it.artefacts, (v) => patch({ artefacts: v })),
      check('auto (by size)', it.artAuto, (v) => patch({ artAuto: v }), { disabled: !it.artefacts, title: '1 sector on the smallest planets up to 5 on the biggest' }),
      slider('sectors', it.artCount, { min: 1, max: 5, step: 1, fmt: String, disabled: !it.artefacts || it.artAuto }, (v) => patch({ artCount: v }, live)),
      check('teal accent', it.artTeal, (v) => patch({ artTeal: v }), { disabled: !it.artefacts })),
    look: () => section('layers and look', open('layers and look'),
      check('body', it.layers.surface, layer('surface'), { title: 'the planet surface; off shows moons, ring or clouds on their own' }),
      check('haze', it.layers.haze, layer('haze'), { disabled: !BIOMES[it.biome].haze }),
      check('clouds', it.layers.clouds, layer('clouds'), { disabled: !weather }),
      check('ring', it.layers.ring, layer('ring'), { disabled: it.ring === 'off' }),
      check('dark halo', it.halo, (v) => patch({ halo: v }), { title: 'optional ~2 px bg+1 halo (off in the final look)' })),
  };
  return order.map((k) => groups[k]());
}

/** Current <-> trial on the same seed (trials.js), and the side-by-side comparison. */
function trialControls(it, patch) {
  const t = TRIALS[trialFor(it.biome)];
  return h('div', { class: 'trial' },
    h('div', { class: 'row wide' }, h('span', {}, 'look'), buttons(
      btn('shipped (final)', () => patch({ trial: null }), { on: !it.trial }),
      btn(`${t.title} (trial)`, () => patch({ trial: trialFor(it.biome) }), { on: !!it.trial, title: `${t.proposal}, ${t.variant}` }))),
    check('compare side by side', state.trialCompare, (v) => update((n) => { n.trialCompare = v; }), { title: 'the shipped look and the trial, same seed and camera' }),
    note(`trial, not final: ${t.note}. Hero L / warmth / chroma: shipped ${t.measured.shipped}, trial ${t.measured.trial} (health-looks PROPOSALS.md). Palette edits don't apply to the trial.`, 'warn'));
}

function astronautControls(it, patch) {
  const preset = S.CONTRIBUTOR_PRESETS.includes(it.color);
  const rampHexes = P.rampOf(pal, it.color);
  const base = preset ? rampHexes[2] : it.color;
  const offPalette = !preset && !P.BLK36_SET.has(it.color);
  const colour = h('input', { type: 'color', value: base, 'aria-label': 'contributor colour' });
  colour.oninput = () => patch({ color: colour.value.toLowerCase() }, live);
  colour.onchange = () => buildPanel();
  const hex = h('input', { type: 'text', value: base, 'aria-label': 'contributor colour hex', maxlength: 7 });
  hex.onchange = () => { const v = S.hexOrNull(hex.value.trim()); if (v) patch({ color: v }); else hex.value = base; };
  const glowOn = !!it.eyeGlow;
  const glow = h('input', { type: 'color', value: it.eyeGlow ?? rampHexes[2], disabled: !glowOn, 'aria-label': 'eye glow colour' });
  glow.oninput = () => patch({ eyeGlow: glow.value.toLowerCase() }, live);
  const handle = h('input', { type: 'text', value: it.handle, 'aria-label': 'handle', maxlength: 40 });
  handle.oninput = () => patch({ handle: handle.value }, live);
  handle.onchange = () => buildPanel();
  const autoEyes = EYE_DESIGNS[eyesFor(it.handle)].name;
  return [
    section('contributor colour', true,
      buttons(...S.CONTRIBUTOR_PRESETS.map((c) => btn(c, () => patch({ color: c }), { on: it.color === c }))),
      h('label', { class: 'row' }, h('span', {}, 'any colour'), colour, h('span', { class: 'val' }, '')),
      h('label', { class: 'row wide' }, h('span', {}, 'hex'), hex),
      h('div', { class: 'row wide' }, h('span', {}, 'ramp'), ramp(rampHexes)),
      note(preset ? 'a BLK 36 preset ramp (editable in the palette tab)' : offPalette ? 'free colour: off the BLK 36 crew palette (playground only); its darker and lighter steps are BLK 36' : 'a BLK 36 colour; its ramp is walked over BLK 36', offPalette ? 'warn' : ''),
      note('shown on the shoulder rings, backpack stripe and eye glow')),
    section('eyes', true,
      h('div', { class: 'eyes' },
        btn(`auto · ${autoEyes ?? 'hash'}`, () => patch({ eyes: 'auto' }), { on: it.eyes === 'auto', title: 'hashed from the handle' }),
        ...EYE_DESIGNS.map((d, i) => btn(`${i} · ${d.name}`, () => patch({ eyes: i }), { on: it.eyes === i }))),
      h('label', { class: 'row wide' }, h('span', {}, 'handle'), handle),
      check('custom glow', glowOn, (v) => patch({ eyeGlow: v ? rampHexes[2] : null }), { title: 'eye light colour; off = the contributor colour' }),
      h('label', { class: 'row' }, h('span', {}, 'glow colour'), glow, h('span', { class: 'val' }, glowOn ? it.eyeGlow : 'auto')),
      check('blink', it.blink, (v) => patch({ blink: v }))),
    section('pose and view', true,
      slider('bob phase', it.phase, { min: 0, max: 12, step: 0.05, title: 'offset on the 12 s bob, sway and blink cycle' }, (v) => patch({ phase: v }, live)),
      slider('view angle', it.yaw, { min: -3.14, max: 3.14, title: 'figure yaw (drag the stage to orbit the camera)' }, (v) => patch({ yaw: v }, live)),
      buttons(...[['front', 0], ['3/4', -0.75], ['side', -1.57], ['back', 3.14]].map(([n, y]) => btn(n, () => patch({ yaw: y }), { on: Math.abs(it.yaw - y) < 0.01 }))),
      state.mode === 'asset' ? select('framing', state.framing, [['body', 'full figure'], ['crew', 'crew close-up'], ['face', 'face close-up']], (v) => update((n) => { n.framing = v; n.camera = null; })) : null),
  ];
}

/** A drone: its provider (or exploration variant), session seed, view, face and framing; the lab's parameters below. */
function droneControls(it, patch) {
  const look = droneLook(it).params;
  const param = (p) => {
    const v = look[p.key], edited = it.params[p.key] !== undefined;
    const set = (x) => patch({ params: { ...it.params, [p.key]: x } }, live);
    const row = p.type === 'select'
      ? select(p.key, v, p.options.map((o, i) => [i, `${i} · ${o}`]), (x) => patch({ params: { ...it.params, [p.key]: +x } }))
      : slider(p.key, v, { min: p.min, max: p.max, step: p.step ?? 0.01, fmt: (x) => (+x).toFixed(3), title: p.words }, set);
    if (edited) row.classList.add('edited');
    return row;
  };
  const groups = [...new Set(DRONE_PARAMS.map((p) => p.group))];
  return [
    it.variant ? note('exploration, not final: the drone lab\'s base direction (D was picked, and D-final is the generic drone)', 'warn') : null,
    section('drone', true,
      select('provider', it.variant ? `variant:${it.variant}` : it.provider,
        [...BRANDS.map((b) => [b.id, b.name]), ...DRONE_VARIANTS.map((v) => [`variant:${v}`, `${v} · ${variantOf(v).name} (exploration)`])],
        (v) => patch(v.startsWith('variant:') ? { variant: v.slice(8) } : { variant: null, provider: v })),
      it.variant ? null : slider('session', it.session ?? 0, { min: 0, max: 99, step: 1, fmt: (x) => (it.session === null ? 'none' : String(x)), title: 'the session seed: its seeded details (trim, one shape detail, personality, sparkles)' }, (v) => patch({ session: v }, live)),
      it.variant ? null : buttons(btn('provider\'s own look', () => patch({ session: null }), { on: it.session === null, title: 'no session: the drone as the lab draws it' }), btn('session +1', () => patch({ session: (it.session ?? -1) + 1 }))),
      note('names are labels outside the pixel pass; the drone lab\'s own BLK 36 palettes (palette edits don\'t apply)')),
    section('face and view', true,
      buttons(...[['idle', 'idle'], ['working', 'working (glyphs)'], ['motion', 'motion loop (12 s)']].map(([f, label]) => btn(label, () => patch({ face: f }), { on: it.face === f }))),
      check('blink', it.blink, (v) => patch({ blink: v })),
      check('smoke', it.smoke, (v) => patch({ smoke: v }), { title: 'thruster puffs and sparkles' }),
      slider('view angle', it.yaw, { min: -3.14, max: 3.14, title: 'the drone\'s yaw, as the lab\'s views' }, (v) => patch({ yaw: v }, live)),
      buttons(...DRONE_VIEWS.map(([n, y]) => btn(n, () => patch({ yaw: y }), { on: Math.abs(it.yaw - y) < 0.01 }))),
      slider('phase', it.phase, { min: 0, max: 12, step: 0.05, title: 'a time offset, so drones in a scene bob out of step' }, (v) => patch({ phase: v }, live)),
      state.mode === 'asset' ? select('framing', state.framing, [['drone', 'full'], ['drone-close', 'close-up']], (v) => update((n) => { n.framing = v; n.camera = null; })) : null),
    section(`drone-lab parameters${Object.keys(it.params).length ? ` (${Object.keys(it.params).length} changed)` : ''}`, false,
      note('advanced: the lab\'s parameters over this drone\'s look; marked ones are changed'),
      buttons(btn('reset parameters', () => patch({ params: {} }), { disabled: !Object.keys(it.params).length })),
      ...groups.flatMap((g) => [h('p', { class: 'note' }, g), ...DRONE_PARAMS.filter((p) => p.group === g).map(param)])),
  ];
}

function labControls(it, patch) {
  const v = labVariant(it.variant);
  return [
    note('exploration, not final: the astronaut lab\'s parameterised figure (variants A–J). The final crew is K.', 'warn'),
    section('variant', true,
      buttons(...S.LAB_VARIANTS.map((id) => btn(id, () => patch({ variant: id }), { on: it.variant === id, title: labVariant(id).name }))),
      h('p', {}, h('b', {}, `${v.id} · ${v.name}`)),
      note(v.leaning)),
    section('look', true,
      select('contributor', it.color, S.CONTRIBUTOR_PRESETS.map((c) => [c, c]), (c) => patch({ color: c })),
      select('eyes', it.eyes, EYE_DESIGNS.map((d, i) => [i, `${i} · ${d.name}`]), (e) => patch({ eyes: +e })),
      slider('view angle', it.yaw, { min: -3.14, max: 3.14 }, (y) => patch({ yaw: y }, live)),
      check('idle sway', it.sway, (s) => patch({ sway: s })),
      note('lab colours are its own BLK 36 copy: palette edits do not apply')),
  ];
}

const setRender = (p, opts) => update((n) => Object.assign(n.render, p), opts);
/** Play/pause, step and scrub the shared time over a loop of `period` seconds, and the pixel height. */
function timeControls(period, ...extra) {
  const r = state.render, set = setRender, t = now();
  return [
    h('div', { class: 'btns' },
      btn(r.play ? 'pause' : 'play', () => set(r.play ? { play: false, t: Math.round(t * 100) / 100 } : { play: true, t: r.t }), { on: r.play }),
      btn('t = 0', () => set({ play: false, t: 0 })),
      btn('−1 s', () => set({ play: false, t: Math.max(0, Math.round((t - 1) * 100) / 100) })),
      btn('+1 s', () => set({ play: false, t: Math.round((t + 1) * 100) / 100 })), ...extra),
    slider('time', r.play ? t % period : r.t, { min: 0, max: period, step: 0.05, fmt: (v) => `${v.toFixed(2)}`, title: 'seconds into the shared loop' }, (v) => set({ play: false, t: v }, live)),
  ];
}
const pixelSlider = () => slider('pixel h', state.render.pixelH, { min: 120, max: 480, step: 10, fmt: String, title: 'internal height; width is 16:9' }, (v) => setRender({ pixelH: v }, live));

function renderControls() {
  const r = state.render, set = setRender;
  return section('render', state.mode === 'scene' || isLab(),
    ...timeControls(r.period),
    check('rotate', r.spin, (v) => set({ spin: v })),
    pixelSlider(),
    check('depth fade', r.depth, (v) => set({ depth: v })),
    select('depth mode', r.depthMode, S.DEPTH_MODES.map((m) => [m, m === 'pixel-smooth' ? 'pixel-smooth (final)' : m]), (v) => set({ depthMode: v })),
    select('depth bands', r.depthBands, S.DEPTH_BANDS.map((b) => [b, b]), (v) => set({ depthBands: v }), { disabled: r.depthMode !== 'pixel-stepped' }),
    slider('loop (s)', r.period, { min: 1, max: 60, step: 0.5, fmt: (v) => v.toFixed(1) }, (v) => set({ period: v }, live)),
    slider('surface turns', r.surfaceTurns, { min: 1, max: 6, step: 1, fmt: String }, (v) => set({ surfaceTurns: v }, live)),
    slider('cloud turns', r.cloudTurns, { min: 0, max: 8, step: 1, fmt: String }, (v) => set({ cloudTurns: v }, live)));
}

function cameraControls() {
  if (isLab()) return null;
  const sceneMode = state.mode === 'scene';
  const opts = sceneMode ? [['depth', 'depth view'], ['crew', 'crew close-up'], ['system', 'system view']]
    : { planet: [['planet', 'hero close-up'], ['clouds-zoom', 'cloud close-up'], ['top', 'top-down']], drone: [['drone', 'full (the lab\'s tile)'], ['drone-close', 'close-up (×2)']] }[state.asset.kind] ?? null;
  return section('camera', sceneMode,
    opts ? select('framing', sceneMode ? state.scene.framing : state.framing, opts, (v) => update((n) => { if (sceneMode) { n.scene.framing = v; n.scene.camera = null; } else { n.framing = v; n.camera = null; } })) : null,
    buttons(btn('reset camera', () => update((n) => { if (sceneMode) n.scene.camera = null; else n.camera = null; }), { disabled: !(sceneMode ? state.scene.camera : state.camera) })),
    note('drag the stage to orbit, scroll to zoom; the URL keeps the camera'));
}

// ---------------------------------------------------------------- scene composer (R3)
function sceneControls() {
  const sc = state.scene;
  const add = (it) => update((n) => { if (n.scene.items.length < S.MAX_ITEMS) { n.scene.items.push(it); n.scene.selected = n.scene.items.length - 1; } });
  const list = h('div', { class: 'items' }, sc.items.map((it, i) => {
    const row = h('div', { class: `it${i === sc.selected ? ' sel' : ''}`, role: 'button', tabindex: 0 },
      h('span', {}, `${i + 1}. ${describe(it)}`),
      btn('dup', (e) => { e.stopPropagation(); add({ ...clone(it), pos: [it.pos[0] + 0.6, it.pos[1], it.pos[2]] }); }, { title: 'duplicate' }),
      btn('×', (e) => { e.stopPropagation(); update((n) => { n.scene.items.splice(i, 1); n.scene.selected = Math.min(n.scene.selected, n.scene.items.length - 1); }); }, { title: 'remove' }));
    row.onclick = () => update((n) => { n.scene.selected = i; });
    row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.onclick(); } };
    return row;
  }));
  const sel = target();
  const pos = sel ? section('position', true,
    ...['x', 'y', 'z'].map((axis, k) => slider(axis === 'z' ? 'z (depth)' : axis, sel.it.pos[k], { min: axis === 'z' ? -45 : -15, max: axis === 'z' ? 10 : 15, step: 0.05 }, (v) => sel.patch({ pos: sel.it.pos.map((x, j) => (j === k ? v : x)) }, live))),
    note('or shift-drag it on the stage')) : null;
  return [
    section('items', true,
      sc.items.length ? list : note('empty: add assets, or start from a preset'),
      buttons(
        btn('+ planet', () => add({ kind: 'planet', biome: 'lush', seed: 7, pos: [0, 0, -2] })),
        btn('+ astronaut', () => add({ kind: 'astronaut', color: 'mint', handle: '@mira', pos: [0, -0.4, 4] })),
        btn('+ drone', () => add({ kind: 'drone', provider: 'generic', pos: [0.6, 0.12, 4] })), // beside the crew, hovering at the lab's crew height
        btn('+ inspected asset', () => add({ ...clone(state.asset), pos: state.asset.kind === 'planet' ? [0, 0, -2] : state.asset.kind === 'drone' ? [0.6, 0.12, 4] : [0, -0.4, 4] }), { disabled: state.asset.kind === 'lab', title: 'the asset open in the inspector' })),
      buttons(
        btn('preset: viewer depth scene', () => update((n) => { n.scene = showcaseScene(); })),
        btn('preset: planet + 3 crew', () => update((n) => { n.scene = crewScene(); })),
        btn('clear', () => update((n) => { n.scene = { items: [], selected: -1, framing: n.scene.framing, camera: n.scene.camera }; }), { disabled: !sc.items.length }))),
    pos,
    ...(sel ? ({ planet: planetControls, astronaut: astronautControls, drone: droneControls }[sel.it.kind])(sel.it, sel.patch) : [note('select an item (click it on the stage or in the list) to configure it')]),
  ];
}

// Stage picking and shift-drag moves (scene mode). Capture phase, so it runs before the orbit controls.
let drag = null;
$('frame').addEventListener('pointerdown', (e) => {
  if (state.mode !== 'scene' || e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, moved: false, move: e.shiftKey && state.scene.selected >= 0 };
  if (drag.move) {
    controls.enabled = false;
    $('frame').setPointerCapture(e.pointerId);
    drag.start = [...state.scene.items[state.scene.selected].pos];
  }
}, true);
$('frame').addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 3) drag.moved = true;
  if (!drag.move) return;
  const { h: ph, scale } = sizes();
  const p = drag.start;
  const dist = camera.position.distanceTo({ x: p[0], y: p[1], z: p[2] });
  const perPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / (ph * scale);
  const right = [camera.matrixWorld.elements[0], camera.matrixWorld.elements[1], camera.matrixWorld.elements[2]];
  const up = [camera.matrixWorld.elements[4], camera.matrixWorld.elements[5], camera.matrixWorld.elements[6]];
  const pos = p.map((x, k) => Math.round((x + (right[k] * dx - up[k] * dy) * perPx) * 100) / 100);
  update((n) => { n.scene.items[n.scene.selected].pos = pos; }, { panel: false });
}, true);
$('frame').addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  controls.enabled = true;
  if (d.move) { buildPanel(); return; }
  if (d.moved) return;
  const rect = canvas.getBoundingClientRect();
  const { w, h: ph, scale } = sizes();
  const x = (e.clientX - rect.left) / scale, y = (e.clientY - rect.top) / scale;
  let best = -1, bestScore = Infinity;
  state.scene.items.forEach((_, i) => {
    const b = stage().screenBounds(i, w, ph);
    if (!b) return;
    const k = Math.hypot(x - b.x, y - b.y) / Math.max(b.r, 6);
    if (k < 1.15 && k < bestScore) { bestScore = k; best = i; }
  });
  update((n) => { n.scene.selected = best; });
}, true);

// ---------------------------------------------------------------- palette editor (R4)
function paletteControls() {
  const edits = P.cleanEdits(state.palette);
  const cur = (path) => path.split('.').reduce((o, k) => o?.[k], pal);
  const setEdit = (path, hex, opts) => update((n) => { n.palette = { ...P.cleanEdits(n.palette), [path]: hex }; }, opts);
  const reset = (path) => update((n) => { const e = P.cleanEdits(n.palette); delete e[path]; n.palette = e; });
  const kids = [note('the current palettes are the base; edit single colours (no whole-palette swaps). Changes apply live to every asset and thumbnail.')];
  if (editPath) {
    const hex = cur(editPath), base = P.baseHex(editPath);
    const input = h('input', { type: 'color', value: hex, 'aria-label': `colour ${editPath}` });
    input.oninput = () => setEdit(editPath, input.value.toLowerCase(), live);
    input.onchange = () => buildPanel();
    const text = h('input', { type: 'text', value: hex, maxlength: 7, 'aria-label': `hex ${editPath}` });
    text.onchange = () => { const v = S.hexOrNull(text.value.trim()); if (v) setEdit(editPath, v); else text.value = hex; };
    kids.push(h('div', { id: 'pal-edit' },
      h('b', {}, editPath),
      h('div', { class: 'big' }, h('div', { style: `background:${base}` }, `base ${base}`), h('div', { style: `background:${hex}` }, `now ${hex}`)),
      h('label', { class: 'row' }, h('span', {}, 'colour'), input, h('span', { class: 'val' }, '')),
      h('label', { class: 'row wide' }, h('span', {}, 'hex'), text),
      buttons(btn('copy hex', () => copy(hex, `copied ${hex}`)), btn('reset to base', () => reset(editPath), { disabled: hex === base }), btn('done', () => { editPath = null; buildPanel(); }))));
  }
  for (const g of P.GROUPS) {
    const rows = new Map();
    for (const s of P.swatches(g)) {
      if (!rows.has(s.row)) rows.set(s.row, []);
      rows.get(s.row).push(s);
    }
    kids.push(h('div', { class: 'pal-group', 'data-pal-group': g.id },
      h('h4', {}, g.title), note(g.note),
      [...rows].map(([row, sws]) => h('div', { class: 'pal-row' }, h('span', { title: row }, row),
        h('div', { class: 'sw' }, sws.map((s) => {
          const b = btn('', () => { editPath = s.path; buildPanel(); }, { title: `${s.path} ${cur(s.path)}${edits[s.path] ? ` (base ${s.hex})` : ''}` });
          b.style.background = cur(s.path);
          b.setAttribute('aria-label', `${s.path} ${cur(s.path)}`);
          if (edits[s.path]) b.classList.add('edited');
          if (s.path === editPath) b.classList.add('cur');
          return b;
        }))))));
  }
  kids.push(buttons(btn(`reset all edits (${Object.keys(edits).length})`, () => { editPath = null; update((n) => { n.palette = {}; }); }, { disabled: !Object.keys(edits).length })));
  return kids;
}

// ---------------------------------------------------------------- iteration view (R10)
// Each family is a dated timeline, oldest to final (history.js). A live step renders on the stage
// in its own palette (palette.js lookPalette); an archived one shows its render from the local
// art archive (/art-archive/, routes.mjs) as whole pixels. A second step can sit beside it for
// comparison, rendered off-screen (stage 'cmp'), as are the timeline thumbnails (stage 'thumb').
// Each render first makes the viewer's palette and settings its own (useLook).
const ARCHIVE_URL = '/art-archive/';
const HT_W = 112, HT_H = 63; // timeline thumbnails, at internal resolution
const SCENE_FRAMING = { depth: 'depth', 'scene-crew': 'crew', system: 'system' };
const FAMILY_FOCUS = { rings: 'ring', clouds: 'clouds', fx: 'fx' };

/** Step i of the history state as the stage renders it: H.view plus normalised items, render and camera.
 *  own: the step's own time (thumbnails), not the stage's. */
function historyView(hs, i = hs.step, { own = false } = {}) {
  const v = H.view({ family: hs.family, step: i, option: i === hs.step ? hs.option : 0 });
  if (!v.live) return v;
  const items = v.items.map((it) => S.normaliseItem(it));
  const r = state.render;
  const render = S.normaliseRender(own ? v.render : { ...v.render, t: r.t, play: r.play, pixelH: r.pixelH });
  return { ...v, items, render, camera: v.camera ?? frameCamera(v.framing ?? 'planet', items[0]), key: JSON.stringify(items) };
}
/** The step's own start time: its render t, else the default. */
const stepTime = (famId, i) => H.view({ family: famId, step: i }).render?.t ?? S.RENDER_DEFAULTS.t;

function openFamily(id) {
  const steps = H.family(id).steps;
  tab = 'history';
  update((n) => {
    n.mode = 'history';
    n.history = { family: id, step: steps.length - 1, option: 0, compare: -1, camera: null };
    n.render = { ...n.render, t: stepTime(id, steps.length - 1), play: false };
  });
}
function openStep(i) {
  update((n) => {
    n.history = { ...n.history, step: i, option: 0, camera: null, compare: n.history.compare === i ? -1 : n.history.compare };
    n.render = { ...n.render, t: stepTime(n.history.family, i), play: false };
  });
}
/** A live step without a history palette, opened in the inspector (one asset) or the composer (a scene). */
const canOpen = (step) => step.live && !step.live.palette && !step.live.options?.list.some((o) => o.palette);
function openInInspector() {
  const v = hv, fam = state.history.family;
  const render = H.view(state.history).render;
  if (v.items.length === 1) {
    const it = v.items[0];
    tab = 'inspect';
    current = null;
    update((n) => {
      Object.assign(n, { mode: 'asset', asset: it, camera: null, focus: it.kind === 'planet' ? FAMILY_FOCUS[fam] ?? 'planet' : it.kind, framing: v.framing ?? undefined });
      n.render = { ...n.render, ...render };
    });
    return;
  }
  tab = 'scene';
  update((n) => {
    n.mode = 'scene';
    n.scene = { items: v.items, selected: -1, framing: SCENE_FRAMING[v.framing] ?? 'depth', camera: SCENE_FRAMING[v.framing] ? null : v.camera };
    n.render = { ...n.render, ...render };
  });
}

/** Renders a live step off-screen in its own look; returns ImageData. */
function renderOff(v, slot, w, h, cam, t) {
  const st = offStage(slot);
  st.droneZoom = ZOOM[slot === 'thumb' ? `thumb-${v.framing}` : v.framing] ?? 1;
  useLook(st, { own: true, spec: v.palette, render: v.render });
  if (st.key !== v.key) { // a new step
    st.sync(v.items, P.lookPalette(v.palette));
    st.key = v.key;
  }
  return renderToImage(st, t, v.render, w, h, cam);
}

// Archived renders: <img> elements from /art-archive/, with their load state (the archive may be absent).
const imgState = new Map(); // src -> 'ok' | 'error'
const archiveSrc = (rel) => ARCHIVE_URL + rel.split('/').map(encodeURIComponent).join('/');
function archiveImg(img, rel) {
  const src = archiveSrc(rel);
  if (img.dataset.src !== src) {
    img.dataset.src = src;
    img.onload = () => { imgState.set(src, 'ok'); dirty = true; };
    img.onerror = () => { imgState.set(src, 'error'); dirty = true; };
    img.src = src;
  }
  return imgState.get(src);
}
/** Sizes an archived render to fit w x h. A 320x180 frame at a whole scale (the viewer's shots) shows at
 *  the largest whole number of screen pixels per internal pixel, like a live pane; anything else (sheets)
 *  steps by x2, x3, ... or 1/2, 1/3, ..., crisp when that divides evenly. */
function fitImage(img, w, h) {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const s = nh / 180;
  const frame = Number.isInteger(s) && nw === 320 * s;
  const fit = frame ? Math.min(w / 320, h / 180) : Math.min(w / nw, h / nh);
  const k = frame ? Math.max(1, Math.floor(fit)) / s : fit >= 1 ? Math.floor(fit) : 1 / Math.ceil(1 / fit);
  const crisp = frame || (Number.isInteger(nw * k) && Number.isInteger(nh * k));
  Object.assign(img.style, { width: `${Math.round(nw * k)}px`, height: `${Math.round(nh * k)}px`, imageRendering: crisp ? 'pixelated' : 'auto' });
}
const NO_ARCHIVE = 'archived image not available: the local art archive (.archive/art-iteration/) isn\'t here';
const BADGE_CLASS = { live: 'live', final: 'final', exploration: 'explore', [RING_TAG]: 'tag' }; // archived and no render: plain
const badgeHtml = (step) => H.badgesOf(step).map((b) => `<span class="hb ${BADGE_CLASS[b] ?? ''}">${b}</span>`).join('');

const stepCaption = (step) => `<b>${step.date}</b> · ${step.title} ${badgeHtml(step)}`;
/** One pane: its caption, then the live render (a canvas) or the archived image. */
function drawPane(pane, v, cap, { w, h, scale, boxW, boxH }, liveCanvas) {
  const fc = pane.querySelector('figcaption');
  if (fc.innerHTML !== cap) fc.innerHTML = cap;
  const img = pane.querySelector('img.arch'), miss = pane.querySelector('.miss');
  liveCanvas.hidden = !v.live;
  if (v.live) {
    liveCanvas.style.width = `${w * scale}px`;
    liveCanvas.style.height = `${h * scale}px`;
    img.hidden = miss.hidden = true;
    return;
  }
  const st = v.img ? archiveImg(img, v.img) : 'none';
  img.hidden = st !== 'ok';
  miss.hidden = st === 'ok' || st === undefined; // undefined: still loading
  miss.textContent = st === 'none' ? 'no render was archived for this step' : NO_ARCHIVE;
  if (st === 'ok') fitImage(img, boxW, boxH);
}

/** One pane, or two side by side or stacked, whichever upscales more (each has a caption above it). */
function paneBox(two) {
  const h = state.render.pixelH, w = frameWidth(h);
  const W = $('well').clientWidth, Hw = $('well').clientHeight, CAP = 28;
  const fit = (b) => Math.floor(Math.min(b.boxW / w, b.boxH / h));
  const side = { boxW: (W - 40) / 2, boxH: Hw - 16 - CAP }, stack = { boxW: W - 16, boxH: (Hw - 28) / 2 - CAP };
  const stacked = two && fit(stack) > fit(side);
  const b = !two ? { boxW: W - 16, boxH: Hw - 16 - CAP } : stacked ? stack : side;
  $('well').classList.toggle('stack', stacked);
  return { w, h, scale: Math.max(1, fit(b)), ...b };
}
/** The comparison pane's live render, off-screen (after it, the stage switches its look back). */
function drawCompare(v, { w, h }, cam) {
  const cv = $('cmp-view');
  if (v.live) {
    if (cv.width !== w || cv.height !== h) Object.assign(cv, { width: w, height: h });
    cv.getContext('2d').putImageData(renderOff(v, 'cmp', w, h, cam, now()), 0, 0);
  }
  return cv;
}
const stageCam = () => ({ pos: camera.position.toArray(), target: controls.target.toArray() });

function drawHistory() {
  const hs = state.history;
  const cmp = hs.compare >= 0;
  const box = paneBox(cmp);
  const { w, h, scale } = box;
  if (cmp) {
    const same = hv.live && hc.framing === hv.framing && hc.camera === hv.camera; // same framing: follow the stage's orbit
    drawPane($('pane-cmp'), hc, stepCaption(hc.step), box, drawCompare(hc, box, same ? stageCam() : hc.camera));
    $('pane-cmp').style.order = hs.compare < hs.step ? -1 : 1; // oldest first (left, or on top)
  }
  if (hv.live) {
    useLook(stages.history, stageLook()); // the comparison or a thumbnail may have switched it
    renderToCanvas(stages.history, now(), hv.render, w, h);
  }
  drawPane($('pane-main'), hv, stepCaption(hv.step), box, canvas);
  const fam = H.family(hs.family);
  const status = [
    `<span><b>${w}×${h}</b> ×${scale}</span>`,
    `<span>t <b>${now().toFixed(2)} s</b></span>`,
    `<span>history <b>${fam.title}</b> · step ${hs.step + 1} of ${fam.steps.length}${cmp ? ` · comparing step ${hs.compare + 1}` : ''}</span>`,
    `<span>${hv.live ? (hv.palette ? 'history colours' : 'base palette') : 'archived image'}</span>`,
  ].join('');
  if (status !== drawStage.status) $('status').innerHTML = drawStage.status = status;
}

// ---------------------------------------------------------------- trial comparison
// The inspected planet in its other look (shipped <-> trial, same seed and camera), beside it.
function trialView() {
  const it = { ...state.asset, trial: state.asset.trial ? null : trialFor(state.asset.biome) };
  const items = [it];
  return { live: true, items, render: state.render, palette: trialOf(it)?.palette, key: JSON.stringify(items) };
}
const lookCaption = (it) => (trialOf(it) ? `<b>${trialOf(it).title}</b> · ${trialOf(it).proposal} <span class="hb explore">trial</span>` : `<b>${BIOMES[it.biome].label}</b> · shipped <span class="hb final">final</span>`);
function drawTrialCompare() {
  const box = paneBox(true);
  const { w, h, scale } = box;
  drawPane($('pane-cmp'), tc, lookCaption(tc.items[0]), box, drawCompare(tc, box, stageCam()));
  $('pane-cmp').style.order = state.asset.trial ? -1 : 1; // the shipped look first (left, or on top)
  useLook(stages.asset, stageLook());
  renderToCanvas(stages.asset, now(), state.render, w, h);
  drawPane($('pane-main'), { live: true }, lookCaption(state.asset), box, canvas);
  const status = [
    `<span><b>${w}×${h}</b> ×${scale}</span>`,
    `<span>t <b>${now().toFixed(2)} s</b></span>`,
    `<span>comparing <b>shipped</b> and <b>${TRIALS[trialFor(state.asset.biome)].title}</b> (trial) · seed ${state.asset.seed}</span>`,
    '<span>drag orbits both</span>',
  ].join('');
  if (status !== drawStage.status) $('status').innerHTML = drawStage.status = status;
}

// Timeline thumbnails: live steps render off-screen once each (a few per frame), archived ones are <img>s.
const histThumbs = new Map(); // 'family:step' -> element (kept across panel rebuilds)
const histQueue = [];
function historyThumb(famId, i, step) {
  const key = `${famId}:${i}`;
  if (histThumbs.has(key)) return histThumbs.get(key);
  let el;
  if (step.live) {
    el = h('canvas', { width: HT_W, height: HT_H });
    histQueue.push({ famId, i, el });
  } else if (step.img) {
    el = h('img', { alt: '', loading: 'lazy', src: archiveSrc(step.img) });
    el.onerror = () => el.replaceWith(h('span', { class: 'ph' }, 'not in the archive'));
  } else {
    el = h('span', { class: 'ph' }, 'no render');
  }
  const wrap = h('span', { class: 'thumb' }, el);
  histThumbs.set(key, wrap);
  return wrap;
}
function renderHistoryThumbs() {
  const job = histQueue.shift();
  if (!job) return;
  const v = historyView({ family: job.famId, step: job.i, option: 0 }, job.i, { own: true });
  const cam = frameCamera(`thumb-${v.framing}`, v.items[0]) ?? v.camera;
  job.el.getContext('2d').putImageData(renderOff(v, 'thumb', HT_W, HT_H, cam, v.render.t), 0, 0);
}

function historyControls() {
  const hs = state.history;
  const fam = H.family(hs.family);
  const card = (step, i) => {
    const sel = i === hs.step, cmp = i === hs.compare;
    const opts = sel ? step.live?.options : null;
    const li = h('li', { class: `step${sel ? ' sel' : ''}${cmp ? ' cmp' : ''}${step.final ? ' final' : ''}`, tabindex: 0, role: 'button', 'aria-pressed': String(sel), 'data-step': i },
      h('div', { class: 'top' }, historyThumb(fam.id, i, step),
        h('div', { class: 'head' }, h('span', { class: 'when' }, `${step.date} · ${step.rev}`), h('b', {}, step.title), h('span', { class: 'hbs' }))),
      h('p', {}, h('i', {}, 'changed '), step.changed),
      h('p', {}, h('i', {}, 'why '), step.why),
      opts ? select(opts.label, hs.option, opts.list.map((o, k) => [k, o.label]), (v) => update((n) => { n.history.option = +v; })) : null,
      buttons(
        btn(cmp ? 'comparing' : 'compare', () => update((n) => { n.history.compare = cmp ? -1 : i; }), { on: cmp, disabled: sel, title: 'show this step beside the one on the stage' }),
        sel && canOpen(step) ? btn(hv.items.length > 1 ? 'open in composer' : 'open in inspector', openInInspector, { title: 'today\'s code renders this step: configure it further' }) : null));
    li.querySelector('.hbs').innerHTML = badgeHtml(step);
    li.onclick = (e) => { if (!e.target.closest('button, select') && !sel) openStep(i); };
    li.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === li) { e.preventDefault(); openStep(i); } };
    return li;
  };
  return [
    section('family', true,
      h('div', { class: 'btns fam' }, H.FAMILIES.map((f) => btn(f.title, () => openFamily(f.id), { on: f.id === fam.id }))),
      note(fam.note)),
    h('ol', { class: 'timeline', 'aria-label': `${fam.title} timeline` }, fam.steps.map(card)),
    note('live steps render with today\'s code (old palettes as history colours, never palette edits). Archived images come from the local art archive, .archive/art-iteration/ (gitignored); without it they show as unavailable.'),
    section('time', false,
      ...timeControls(hv?.live ? hv.render.period : S.RENDER_DEFAULTS.period, btn('reset camera', () => update((n) => { n.history.camera = null; }), { disabled: !hs.camera })),
      pixelSlider()),
  ];
}

// ---------------------------------------------------------------- panel + chrome
function buildPanel() {
  const panel = $('panel');
  const top = panel.scrollTop;
  panel.textContent = '';
  let title, sub, body;
  if (tab === 'history') {
    const fam = H.family(state.history.family);
    title = `history · ${fam.title}`;
    sub = 'how each asset family got to its final look, oldest to final';
    body = historyControls();
  } else if (tab === 'palette') {
    title = 'palette editor';
    sub = 'v2 world · BLK 36 crew · [OIII] teal · lava';
    body = paletteControls();
  } else if (state.mode === 'scene') {
    title = 'compose scene';
    sub = `${state.scene.items.length} items${state.scene.selected >= 0 ? ` · editing ${describe(state.scene.items[state.scene.selected])}` : ''}`;
    body = [...sceneControls(), cameraControls(), renderControls()];
  } else {
    const it = state.asset;
    const cat = ITEMS.find((c) => c.id === current);
    title = cat?.title ?? describe(it);
    sub = it.kind === 'lab' || (it.kind === 'drone' && it.variant) ? 'exploration, not final' : trialOf(it) ? `${state.focus} · trial look, not final` : `${state.focus} · final asset`;
    const patch = (p, opts) => update((n) => Object.assign(n.asset, p), opts);
    body = [...({ planet: planetControls, astronaut: astronautControls, drone: droneControls, lab: labControls }[it.kind])(it, patch), cameraControls(), renderControls()];
  }
  panel.append(h('h3', {}, title, h('small', {}, sub)), ...body.flat().filter(Boolean));
  panel.scrollTop = top;
}

function syncChrome() {
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  const hist = state.mode === 'history';
  const cmp = (hist && state.history.compare >= 0) || !!tc;
  $('well').classList.toggle('panes', hist || !!tc); // captioned panes: the history, or a trial comparison
  $('well').classList.toggle('cmp', cmp);
  $('pane-cmp').hidden = !cmp;
  canvas.hidden = hist && !hv.live;
  $('stage-badge').hidden = hist || !!tc;
  for (const id of ['png1', 'png4']) $(id).disabled = hist && !hv.live;
  for (const t of document.querySelectorAll('.tile')) t.classList.toggle('sel', state.mode === 'asset' && t.dataset.id === current);
  $('frame').classList.toggle('scene', state.mode === 'scene');
  const badge = $('stage-badge');
  const explore = isLab() || (state.mode === 'asset' && ((state.asset.kind === 'planet' && state.asset.lavaMode !== 'layered' && state.asset.biome === 'lava') || (state.asset.kind === 'drone' && !!state.asset.variant)));
  const planet = state.mode === 'asset' && state.asset.kind === 'planet' ? state.asset : null;
  const tag = planet && (BIOMES[planet.biome].extra ? EXTRA : state.focus === 'ring' ? `ring ${RING_TAG}` : null);
  const trial = planet && trialOf(planet);
  badge.className = state.mode === 'scene' ? 'final' : explore || trial ? 'explore' : 'final';
  badge.textContent = state.mode === 'scene' ? 'composed scene · final assets' : trial ? `trial · ${trial.title} · not final` : explore ? 'exploration · not final' : `final asset${tag ? ` · ${tag}` : ''}`;
}

for (const b of document.querySelectorAll('[data-tab]')) {
  b.onclick = () => {
    tab = b.dataset.tab;
    if (tab === 'scene' && state.mode !== 'scene') update((n) => { n.mode = 'scene'; if (!n.scene.items.length) n.scene = showcaseScene(); });
    else if (tab === 'history' && state.mode !== 'history') openFamily(state.history.family);
    // (palette edits apply to the inspector and the composer, not to the history)
    else if ((tab === 'inspect' && state.mode !== 'asset') || (tab === 'palette' && state.mode === 'history')) update((n) => { n.mode = 'asset'; });
    else apply(state);
  };
}

// ---------------------------------------------------------------- presets (R5)
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = 'none'), 1800);
}
async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    openJson(text, 'clipboard unavailable: copy from here');
  }
}
// A copy captures the moment on screen: playing state keeps playing from the current time.
const snapshotState = () => (state.render.play ? { ...state, render: { ...state.render, t: Math.round(now() * 100) / 100 } } : state);
$('copy-url').onclick = () => copy(`${location.origin}${location.pathname}${S.encodeHash(snapshotState())}`, 'URL copied');
$('copy-json').onclick = () => copy(S.toJSON(snapshotState()), 'JSON copied');
function openJson(text, err = '') {
  $('json-text').value = text;
  $('json-err').textContent = err;
  $('json-dialog').showModal();
}
$('import-json').onclick = () => openJson(S.toJSON(state));
$('json-apply').onclick = (e) => {
  try {
    const next = S.fromJSON($('json-text').value);
    tab = tabFor(next.mode);
    current = null;
    apply(next);
  } catch (err) {
    e.preventDefault();
    $('json-err').textContent = err.message;
  }
};
/** The current frame as a PNG data URL, upscaled by a whole number (nearest neighbour). */
function snapshot(scale) {
  drawStage(); // the current frame, freshly rendered
  const out = document.createElement('canvas');
  out.width = canvas.width * scale;
  out.height = canvas.height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
function png(scale) {
  const a = document.createElement('a');
  const what = state.mode === 'scene' ? 'scene' : describe(state.asset).replace(/[^\w]+/g, '-');
  a.href = snapshot(scale);
  a.download = `asset-library-${what}-t${now().toFixed(2)}${scale > 1 ? `-x${scale}` : ''}.png`;
  a.click();
}
$('png1').onclick = () => png(1);
$('png4').onclick = () => png(4);

// ---------------------------------------------------------------- boot + test hook
window.library = {
  ready: false,
  /** Every catalogue tile near the view has its current thumbnail (the rest render when scrolled to). */
  get thumbsDone() { return thumbsDone(); },
  /** Tile `id`'s thumbnail is current (scroll it into view first). */
  tileReady: (id) => tileFresh.has(id),
  get histDone() { return !histQueue.length; }, // the iteration view's timeline thumbnails are rendered
  /** Applies a state (paused), renders it twice synchronously like viewer.set, returns its URL hash. */
  set(next) {
    if (next.tab) tab = next.tab;
    else if (tabFor(next.mode) !== 'inspect' || tab !== 'palette') tab = tabFor(next.mode);
    apply(S.normalise(next));
    drawStage();
    drawStage();
    return S.encodeHash(state);
  },
  state: () => clone(state),
  basePalette: () => clone(P.BASE),
  /** Scene item i's centre and radius in page (CSS) pixels, for pointer tests. */
  bounds(i) {
    const { w, h, scale } = sizes();
    const b = stage().screenBounds(i, w, h);
    const rect = canvas.getBoundingClientRect();
    return b && { x: rect.left + b.x * scale, y: rect.top + b.y * scale, r: b.r * scale };
  },
  snapshot,
  hash: () => S.encodeHash(state),
  open(id, extra = {}) { openItem(ITEMS.find((c) => c.id === id)); if (Object.keys(extra).length) update((n) => Object.assign(n, extra)); },
  tab(name) { document.querySelector(`[data-tab="${name}"]`).click(); },
  editColour(path) { tab = 'palette'; editPath = path; apply(state); },
};
buildCatalogue();
apply(state);
thumbsDirty();
window.library.ready = true;
