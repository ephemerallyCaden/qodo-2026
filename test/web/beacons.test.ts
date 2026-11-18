// The view's side of beacons (#79, R10): the beacon view is untrusted JSON, checked field by field
// with the same note rule the server stores by; beacons group per body, newest note first, and one on a
// planet this layout lacks is counted, never drawn (Rule 1); the info lines and the screen-reader
// summary say them; the marker's shape keeps Rule 4's 2 px lines and its colours are palette roles.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BeaconView } from '../../src/core/contract/beacons.js';
import { Beacons } from '../../web/src/beacons/controller.js';
import { infoLines, summaryText } from '../../web/src/model/describe.js';
import { beaconSpots, checkBeaconResult, checkBeacons } from '../../web/src/model/beacons.js';
import { systemModel } from '../../web/src/model/system.js';
import { BEACON_SHAPE } from '../../web/src/render/beacons.js';
import { miniLayout } from '../fixtures/contract/mini.js';

const model = systemModel(miniLayout);
const HEAD = miniLayout.source.head;
const [P0, P1] = [model.planets[0]!.dirId, model.planets[1]!.dirId];
const view = (beacons: [home: string, text: string][], unplaced = 0): BeaconView => ({ schemaVersion: 'beacons.1', head: HEAD, unplaced,
  beacons: beacons.map(([home, text], i) => ({ fileId: `f_${String(i).padStart(12, '0')}`, path: `p/${i}.ts`, home: home as BeaconView['beacons'][number]['home'], at: HEAD, text })) });

describe('checkBeacons', () => {
  it('accepts a beacon view, HTML-looking notes included (they are only ever text)', () => {
    const v = view([[P0, '<script>alert(1)</script>'], ['star', 'root note']]);
    expect(checkBeacons(v)).toEqual({ ok: true, value: v });
  });

  it('refuses a document the view could be misled by, with reasons', () => {
    const ok = view([[P0, 'fine']]);
    const b = ok.beacons[0]!;
    const bad: [string, unknown, RegExp][] = [
      ['not an object', 'x', /must be an object/],
      ['another schema', { ...ok, schemaVersion: 'beacons.2' }, /schemaVersion/],
      ['a short head', { ...ok, head: 'abc' }, /head/],
      ['a negative unplaced count', { ...ok, unplaced: -1 }, /unplaced/],
      ['a note with a newline', { ...ok, beacons: [{ ...b, text: 'a\nb' }] }, /text/],
      ['a note with a bidi override', { ...ok, beacons: [{ ...b, text: 'a\u202eb' }] }, /text/],
      ['a note past 120 characters', { ...ok, beacons: [{ ...b, text: 'x'.repeat(121) }] }, /text/],
      ['a home that is neither a planet id nor the star', { ...ok, beacons: [{ ...b, home: 'src' }] }, /home/],
      ['a bad file id', { ...ok, beacons: [{ ...b, fileId: '../x' }] }, /fileId/],
      ['an empty path', { ...ok, beacons: [{ ...b, path: '' }] }, /path/],
      ['beacons not a list', { ...ok, beacons: {} }, /beacons must be an array/],
    ];
    for (const [name, v, why] of bad) {
      const c = checkBeacons(v);
      expect(c.ok, name).toBe(false);
      expect(!c.ok && c.errors.join('; '), name).toMatch(why);
    }
  });

  it('checks a write\'s answer: the new view, or a refusal in one short printable line', () => {
    expect(checkBeaconResult({ ok: true, beacons: view([]) }).ok).toBe(true);
    expect(checkBeaconResult({ ok: false, error: 'unknown-head', head: HEAD }).ok).toBe(true);
    expect(checkBeaconResult({ ok: false, error: 'the note is empty' }).ok).toBe(true);
    expect(checkBeaconResult({ ok: true, beacons: { ...view([]), head: 'x' } }).ok).toBe(false);
    expect(checkBeaconResult({ ok: false, error: 'line\nbreak' }).ok).toBe(false);
    expect(checkBeaconResult({ ok: false, error: 'x'.repeat(301) }).ok).toBe(false);
    expect(checkBeaconResult({ ok: false, error: 'x', head: 'nope' }).ok).toBe(false);
  });
});

describe('beaconSpots', () => {
  it('groups notes by body, newest first, planets in model order and the star last', () => {
    const s = beaconSpots(view([['star', 's1'], [P1, 'b1'], [P0, 'a1'], [P1, 'b2']]), model);
    expect(s).toEqual({ spots: [{ planet: 0, notes: ['a1'] }, { planet: 1, notes: ['b2', 'b1'] }, { planet: -1, notes: ['s1'] }], unplaced: 0 });
  });

  it('counts a beacon on a planet this layout lacks with the unplaced ones, and draws nothing for it', () => {
    expect(beaconSpots(view([['d_ffffffffffff', 'gone'], [P0, 'kept']], 2), model)).toEqual({ spots: [{ planet: 0, notes: ['kept'] }], unplaced: 3 });
    expect(beaconSpots(null, model)).toEqual({ spots: [], unplaced: 0 });
  });
});

describe('beacons in the info lines and the summary', () => {
  const info = beaconSpots(view([[P0, 'newest is last'], [P0, 'second'], ['star', 'root']], 1), model);

  it('the system line counts every placed beacon and the unplaced ones; a planet\'s counts its own, if it has any', () => {
    expect(infoLines(model, null, null, info).at(-1)).toBe('3 beacons (+1 not placed)');
    expect(infoLines(model, 0, null, info).at(-1)).toBe('2 beacons');
    expect(infoLines(model, 1, null, info)).toEqual(infoLines(model, 1, null)); // a planet without one gets no line
  });

  it('adds nothing when there are none, so the lines read as before', () => {
    expect(infoLines(model, 0, null, { spots: [], unplaced: 0 })).toEqual(infoLines(model, 0, null));
    expect(summaryText(model, null, null, { spots: [], unplaced: 0 })).toBe(summaryText(model, null, null));
  });

  it('the summary reads the focused planet\'s notes, newest first, for screen readers', () => {
    expect(summaryText(model, 0, null, info)).toContain('beacon notes, newest first: second; newest is last');
  });

  it('in free flight the summary reads the star\'s notes, as the panel lists the star\'s files there (Qodo 36a4f942)', () => {
    expect(summaryText(model, null, null, info)).toContain('beacon notes, newest first: root');
    expect(summaryText(model, null, null, info)).not.toContain('second');
  });

  it('the summary names every body that carries a beacon, as the markers show them (Qodo 5cfba6e0)', () => {
    const where = `beacons on ${model.planets[0]!.path} (2), the star (1)`;
    for (const focus of [null, 0, 1]) expect(summaryText(model, focus, null, info), String(focus)).toContain(where);
  });
});

describe('the marker (stub art)', () => {
  it('is BEACON_SHAPE square, every drawn line at least 2 px wide (Rule 4)', () => {
    expect(BEACON_SHAPE.every((r) => r.length === BEACON_SHAPE.length)).toBe(true);
    for (const row of BEACON_SHAPE) {
      for (const run of row.match(/M+/g) ?? []) expect(run.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('takes its colours from palette roles only: no colour literal in its module (Rule 5)', () => {
    const src = readFileSync(join(import.meta.dirname, '../../web/src/render/beacons.ts'), 'utf8');
    expect(src).not.toMatch(/#[0-9a-f]{6}\b|0x[0-9a-f]{6}\b|rgb\(|new (THREE\.)?Color\(/i);
    expect(src).toMatch(/palette\.crew\.suit\[1\]/);
    expect(src).not.toMatch(/accent\.teal/); // teal marks code-layer events, and a beacon isn't one
  });
});

/** A promise and the function that settles it. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('the live beacon controller: the newest request wins, a write\'s answer included (Qodo 29b6e331)', () => {
  const OTHER = 'b'.repeat(40);
  const at = (head: string, texts: string[]): BeaconView => ({ ...view(texts.map((t) => [P0, t])), head });
  function controller() {
    const drawn: (BeaconView | null)[] = [];
    const answers: Promise<BeaconView>[] = [];
    const b = new Beacons({ view: { setBeacons: (v) => { drawn.push(v); return true; } }, client: { beacons: () => answers.shift()! },
      announce: () => {}, changed: () => {} });
    return { b, drawn, answers };
  }

  it('a note\'s answer of the old scan never cancels the fetch the new layout started meanwhile', async () => {
    const c = controller();
    const ticket = c.b.ticket(); // the panel's note is sent
    const fetch = deferred<BeaconView>();
    c.answers.push(fetch.promise);
    const refreshing = c.b.refresh(OTHER); // a scan lands: the new layout fetches its beacons
    c.b.apply(at(HEAD, ['the note']), OTHER, ticket); // the note's answer, of the old scan, is refused
    fetch.resolve(at(OTHER, ['the note']));
    await refreshing;
    expect(c.drawn.map((v) => v?.head)).toEqual([OTHER]);
  });

  it('a fetch started after the note was sent (a `commet beacon` meanwhile) wins over the note\'s older answer', async () => {
    const c = controller();
    const ticket = c.b.ticket();
    const fetch = deferred<BeaconView>();
    c.answers.push(fetch.promise);
    const refreshing = c.b.refresh(HEAD);
    c.b.apply(at(HEAD, ['the note']), HEAD, ticket);
    fetch.resolve(at(HEAD, ['the note', 'from the terminal']));
    await refreshing;
    expect(c.drawn.at(-1)!.beacons.map((x) => x.text)).toEqual(['the note', 'from the terminal']);
  });

  it('a note that is refused leaves the fetch already out to land, so the markers it brings are drawn (Qodo 1e9e7558)', async () => {
    const c = controller();
    const fetch = deferred<BeaconView>();
    c.answers.push(fetch.promise);
    const refreshing = c.b.refresh(HEAD); // the layout's own fetch is out
    c.b.ticket(); // a note is sent, and refused: apply() is never called
    fetch.resolve(at(HEAD, ['an older note']));
    await refreshing;
    expect(c.drawn.map((v) => v?.beacons.map((x) => x.text))).toEqual([['an older note']]);
  });

  it('with no fetch started since the note was sent, its answer is drawn, and an older fetch landing later changes nothing', async () => {
    const c = controller();
    const old = deferred<BeaconView>();
    c.answers.push(old.promise);
    const refreshing = c.b.refresh(HEAD); // started before the note
    const ticket = c.b.ticket();
    c.b.apply(at(HEAD, ['the note']), HEAD, ticket);
    expect(c.drawn.at(-1)!.beacons.map((x) => x.text)).toEqual(['the note']);
    old.resolve(at(HEAD, []));
    await refreshing;
    expect(c.drawn).toHaveLength(1);
  });
});
