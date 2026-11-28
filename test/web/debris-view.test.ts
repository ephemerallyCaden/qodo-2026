// The debris view's data side (R13), the parts that need no GPU: the checks on the debris view and a piece's panel
// (untrusted JSON: totals that add up, no name in the list, commands that are one printable line), what is drawn
// (placed pieces only), the HUD line (repo totals only, Rule 6; "not read" for PRs, Rule 1), the panel's rows and
// answers, and the view's debris state: another scan's debris is refused, and a piece gone on the next load of the
// same scan sweeps, from the last frame drawn.
import { describe, expect, it } from 'vitest';
import { DEBRIS_WARNINGS, type DebrisDetail } from '../../src/core/contract/debris.js';
import { checkDebris, checkDebrisDetail } from '../../web/src/debris/check.js';
import { debrisAnnouncement, debrisCommands, debrisDetailState, debrisRows } from '../../web/src/debris/detail.js';
import { DEBRIS_CAP } from '../../web/src/debris/place.js';
import { debrisStatus, drawables } from '../../web/src/debris/select.js';
import { DebrisState } from '../../web/src/debris/state.js';
import { SWEEP_FRAMES } from '../../web/src/debris/sweep.js';
import { planetCentre, systemModel } from '../../web/src/model/system.js';
import { focusPose, project, projectedRadius, startPose } from '../../web/src/camera/pose.js';
import { SystemScene } from '../../web/src/render/scene.js';
import { DebrisField } from '../../web/src/render/debris.js';
import { debrisEntries } from '../../web/src/debris/sweep.js';
import type * as THREE from 'three';
import { ViewError } from '../../web/src/data/client.js';
import { miniDebris, miniLayout } from '../fixtures/contract/mini.js';
import { debrisViewOf } from '../fixtures/debris-view.js';

const HEAD = miniLayout.source.head;
const SRC = miniLayout.planets[0]!.dirId;
const detail = (over: Partial<DebrisDetail> = {}): DebrisDetail => ({
  ok: true, schemaVersion: 'debris-detail.1', head: HEAD, id: 'x_05d1a7c3e902', cls: 'branch', name: 'feature/old-idea', remoteOnly: false, ageDays: 75,
  lastCommit: { sha: 'abcdef1234567890abcdef1234567890abcdef12', short: 'abcdef1', subject: 'try a thing', date: '2026-09-14T10:00:00Z' },
  aheadCount: 3, lines: 2400, creator: { displayName: 'Ada Quill', captain: false, agent: false }, sessions: [], planets: [SRC], home: SRC, filesOutside: 0,
  worktree: null, rebased: false, cleanup: null, inspect: "git log --oneline HEAD..'refs/heads/feature/old-idea' --", warning: DEBRIS_WARNINGS.unmerged, ...over,
});
const errorsOf = (v: unknown) => { const c = checkDebris(v); return c.ok ? [] : c.errors.join('; '); };
const detailErrors = (v: unknown) => { const c = checkDebrisDetail(v); return c.ok ? [] : c.errors.join('; '); };

describe('checkDebris', () => {
  it('accepts the mini fixture and a busy invented view', () => {
    expect(checkDebris(miniDebris).ok).toBe(true);
    expect(checkDebris(debrisViewOf(miniLayout, 20)).ok).toBe(true);
    expect(checkDebris({ ...miniDebris, pieces: [], total: 0, placed: 0, mass: 0, unreadable: 0, needsRescan: true }).ok).toBe(true);
  });

  it.each([
    ['another schema', { ...miniDebris, schemaVersion: 'debris.2' }, 'schemaVersion'],
    ['a short head', { ...miniDebris, head: 'abc' }, 'head'],
    ['a name in the list (Rule 6)', { ...miniDebris, pieces: [{ ...miniDebris.pieces[0], name: 'x' }, ...miniDebris.pieces.slice(1)] }, 'exactly'],
    ['pieces out of id order', { ...miniDebris, pieces: [...miniDebris.pieces].reverse() }, 'id order'],
    ['a stale PR while PRs are not read', { ...miniDebris, pieces: [{ ...miniDebris.pieces[0]!, cls: 'pr' }, ...miniDebris.pieces.slice(1)] }, 'not read'],
    ['a bad home', { ...miniDebris, pieces: [{ ...miniDebris.pieces[0]!, home: 'src' }, ...miniDebris.pieces.slice(1)] }, 'home'],
    ['a bad age step', { ...miniDebris, pieces: [{ ...miniDebris.pieces[0]!, ageStep: 3 }, ...miniDebris.pieces.slice(1)] }, 'ageStep'],
    ['a seed past uint32', { ...miniDebris, pieces: [{ ...miniDebris.pieces[0]!, seed: 2 ** 32 }, ...miniDebris.pieces.slice(1)] }, 'seed'],
    ['a total that does not add up', { ...miniDebris, total: 3 }, 'total'],
    ['a placed count that does not add up', { ...miniDebris, placed: 13 }, 'placed'],
    ['a mass that is not the sum of lines', { ...miniDebris, mass: 1 }, 'mass'],
    ['PRs said to be read', { ...miniDebris, prs: 'read' }, 'prs'],
    ['pieces in a view that needs a rescan', { ...miniDebris, needsRescan: true }, 'needsRescan'],
    ['no unreadable count', { ...miniDebris, unreadable: -1 }, 'unreadable'],
  ])('refuses %s', (_, v, why) => {
    expect(errorsOf(v)).toContain(why);
  });
});

describe('checkDebrisDetail', () => {
  it('accepts a panel and both refusals', () => {
    expect(checkDebrisDetail(detail()).ok).toBe(true);
    expect(checkDebrisDetail(detail({ name: null, cls: 'agent', worktree: { prunable: true, locked: false }, cleanup: 'git worktree prune', inspect: 'git worktree list', warning: DEBRIS_WARNINGS.detached })).ok).toBe(true);
    // a merged remote copy's leased delete (debris-data, PR #248 r2) is one printable line like any other command
    expect(checkDebrisDetail(detail({ cls: 'merged', cleanup: "git branch -d -- 'x' && git push --delete '--force-with-lease=refs/heads/x:abcdef1234567890abcdef1234567890abcdef12' -- 'origin' 'refs/heads/x'" })).ok).toBe(true);
    expect(checkDebrisDetail({ ok: false, error: 'no-such-item' }).ok).toBe(true);
    expect(checkDebrisDetail({ ok: false, error: 'unknown-head', head: HEAD }).ok).toBe(true);
    expect(checkDebrisDetail({ ok: false, error: 'unknown-head' }).ok).toBe(false);
  });

  it.each([
    ['a newline in a command: pasting it would run it', detail({ cleanup: "git branch -d -- 'x'\nrm -rf ~" }), 'cleanup'],
    ['a carriage return in a command', detail({ inspect: 'git log\r' }), 'inspect'],
    ['a direction-changing character in a command', detail({ cleanup: "git branch -d -- 'a‮b'" }), 'cleanup'],
    ['an empty command', detail({ inspect: '' }), 'inspect'],
    ['a warning the contract does not have', detail({ warning: 'run rm -rf' as DebrisDetail['warning'] }), 'warning'],
    ['a home it does not touch', detail({ home: 'd_00000000000c' }), 'home'],
    ['planets out of order', detail({ planets: ['star', SRC] }), 'planets'],
    ['a short SHA that is not the SHA\'s', detail({ lastCommit: { ...detail().lastCommit, short: '1234567' } }), 'lastCommit'],
    ['a creator with an email field missing its booleans', detail({ creator: { displayName: 'x' } as DebrisDetail['creator'] }), 'creator'],
  ])('refuses %s', (_, v, why) => {
    expect(detailErrors(v)).toContain(why);
  });
});

describe('what is drawn and said', () => {
  it('draws placed pieces only, and none of a view that needs a rescan', () => {
    const d = drawables(miniDebris);
    expect(d).toHaveLength(miniDebris.placed);
    expect(d.every((p) => p.home !== null)).toBe(true);
    expect(drawables({ ...miniDebris, pieces: [], total: 0, placed: 0, mass: 0, unreadable: 0, needsRescan: true })).toEqual([]);
  });

  it('says repo totals, the mass, what is not drawn and why and that stale PRs are not read; never a score', () => {
    expect(debrisStatus(miniDebris, 0)).toBe('debris: 13 stale branches, 13120 lines (1 with no file at HEAD); PRs not read');
    expect(debrisStatus(miniDebris, 7)).toBe("debris: 13 stale branches, 13120 lines (7 past a planet's 12 (+N), 1 with no file at HEAD); PRs not read");
    expect(debrisStatus({ ...miniDebris, unreadable: 2 }, 0)).toContain('2 unreadable'); // Rule 1: counted
    expect(debrisStatus({ ...miniDebris, pieces: [], total: 0, placed: 0, mass: 0 }, 0)).toBe('debris: none; PRs not read');
    expect(debrisStatus({ ...miniDebris, pieces: [], total: 0, placed: 0, mass: 0, unreadable: 1 }, 0)).toBe('debris: none (1 unreadable); PRs not read');
    expect(debrisStatus({ ...miniDebris, pieces: [], total: 0, placed: 0, mass: 0, unreadable: 0, needsRescan: true }, 0)).toBe('rescan to see debris');
    expect(debrisStatus(miniDebris, 0)).not.toMatch(/%|score|rank/);
  });

  it("shows one piece's rows: its name, kind, age as of HEAD, last commit, creator, what HEAD lacks and the bodies it touches", () => {
    const rows = debrisRows(detail({ sessions: [{ key: 'claude:s1' as never, model: 'claude-x', startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-01T01:00:00Z' }] }), (h) => (h === SRC ? 'src' : null));
    expect(rows).toEqual([
      ['branch', 'feature/old-idea'], ['kind', 'abandoned branch'], ['age', '75 days since its last commit, as of HEAD (weathered)'],
      ['last commit', 'abcdef1 try a thing'], ['committed', '2026-09-14 10:00:00 UTC'], ['created by', 'Ada Quill'],
      ['agent session', 'claude-x, 2026-09-01 00:00:00 UTC to 2026-09-01 01:00:00 UTC'], ['HEAD lacks', '3 commits, 2400 changed lines'], ['touches', 'src'],
    ]);
    expect(debrisRows(detail({ creator: { displayName: 'Nova', captain: true, agent: false } }), () => null)).toContainEqual(['created by', 'you (Nova)']);
    expect(debrisRows(detail({ cls: 'merged', rebased: true, name: null, remoteOnly: false }), () => null).slice(0, 2)).toEqual([['branch', 'a detached worktree'], ['kind', 'merged, not deleted']]);
    expect(debrisRows(detail({ name: 'x‮y\nz' }), () => null)[0]).toEqual(['branch', 'x y z']); // printable only
  });

  it('offers the cleanup, then the inspect command, to copy; either may be missing', () => {
    expect(debrisCommands(detail())).toEqual([{ label: 'inspect first', command: detail().inspect }]);
    expect(debrisCommands(detail({ cleanup: "git branch -d -- 'x'", inspect: null }))).toEqual([{ label: 'clean up', command: "git branch -d -- 'x'" }]);
    expect(debrisCommands(detail({ cleanup: null, inspect: null }))).toEqual([]);
  });

  it('shows an answer only for the piece and head it asked about', () => {
    expect(debrisDetailState(detail(), detail().id, HEAD)).toEqual({ kind: 'ready', detail: detail() });
    expect(debrisDetailState(detail(), 'x_000000000000', HEAD).kind).toBe('failed');
    expect(debrisDetailState(detail(), detail().id, 'b'.repeat(40)).kind).toBe('failed');
    expect(debrisDetailState({ ok: false, error: 'unknown-head', head: HEAD }, detail().id, HEAD).kind).toBe('failed');
    expect(debrisDetailState({ ok: false, error: 'no-such-item' }, detail().id, HEAD)).toEqual({ kind: 'note', text: 'the scan has no such piece any more' });
    expect(debrisDetailState(new ViewError('server down'), detail().id, HEAD)).toEqual({ kind: 'failed', text: 'server down' });
    expect(debrisAnnouncement({ kind: 'ready', detail: detail() })).toBe('showing abandoned branch feature/old-idea, with no cleanup command');
    expect(debrisAnnouncement({ kind: 'loading' })).toBeNull();
  });
});

describe("the view's debris state", () => {
  const scene = () => new SystemScene(systemModel(miniLayout));
  const items = drawables(miniDebris);

  it("refuses another scan's debris over a drawn layout, and keeps one for the first layout of its own scan", () => {
    const s = scene(), st = new DebrisState();
    expect(st.set(s, HEAD, items, 'b'.repeat(40), 0, true)).toBe(false);
    expect(s.debris.entries).toHaveLength(0);
    expect(st.set(null, null, items, HEAD, 0, true)).toBe(true);
    st.attach(s, HEAD);
    expect(s.debris.entries).toHaveLength(items.length);
    const other = scene();
    st.attach(other, 'b'.repeat(40));
    expect(other.debris.entries).toHaveLength(0);
    s.dispose(); other.dispose();
  });

  it('sweeps a piece gone on the next load from the last frame drawn, drops it at its end, and never sweeps without animation', () => {
    const s = scene(), st = new DebrisState();
    st.set(s, HEAD, items, HEAD, 0, true);
    const gone = items[0]!, next = items.slice(1);
    st.set(s, HEAD, next, HEAD, 500, true);
    const sweeping = s.debris.entries.filter((e) => e.sweep !== null);
    expect(sweeping.map((e) => [e.piece.id, e.sweep])).toEqual([[gone.id, 500]]);
    expect(s.debris.sweeping(500 + SWEEP_FRAMES - 1)).toBe(true);
    st.prepare(s, HEAD, 500 + SWEEP_FRAMES);
    expect(s.debris.entries.some((e) => e.sweep !== null)).toBe(false);
    st.set(s, HEAD, items, HEAD, 600, true);
    st.set(s, HEAD, next, HEAD, 700, false); // reduced motion or the render hook: it just goes
    expect(s.debris.entries.some((e) => e.sweep !== null)).toBe(false);
    s.dispose();
  });

  it('gives a debris shell to the bodies drawing debris only, keeps it while a last piece sweeps, and drops it after', () => {
    const s = scene(), st = new DebrisState();
    expect(s.model.debrisHomes).toBeUndefined();
    const before = s.startExtras().length;
    st.set(s, HEAD, items, HEAD, 0, true);
    expect(s.model.debrisHomes).toEqual([...new Set(items.map((it) => it.home))].sort());
    expect(s.startExtras().length).toBe(before + 6 * s.model.debrisHomes!.length); // Home frames every shell
    const docs = miniLayout.planets.find((p) => p.path === 'docs')!.dirId;
    const left = items.filter((it) => it.home !== docs);
    st.set(s, HEAD, left, HEAD, 100, true);
    expect(s.model.debrisHomes).toContain(docs); // its pieces are still breaking apart
    st.prepare(s, HEAD, 100 + SWEEP_FRAMES);
    expect(s.model.debrisHomes).not.toContain(docs);
    st.set(s, HEAD, [], HEAD, 200, false);
    expect(s.model.debrisHomes).toEqual([]);
    s.dispose();
  });

  it('builds new geometry for each new set of pieces and releases the old, so no GPU buffer is left behind (Qodo PR257 83f3b0d6)', () => {
    const field = new DebrisField();
    const geometries = () => field.group.children.map((o) => (o as THREE.Mesh | THREE.Points).geometry);
    const before = geometries();
    let released = 0;
    for (const g of new Set(before)) g.addEventListener('dispose', () => { released++; });
    field.set(debrisEntries(systemModel(miniLayout), items, []).entries);
    expect(released, 'the old body and light geometries are disposed').toBe(2);
    expect(geometries().every((g) => !before.includes(g))).toBe(true);
    field.dispose();
  });

  it('drops the selection when its piece is gone, and caps each body at 12 with the rest counted for its "+N"', () => {
    const s = scene(), st = new DebrisState();
    st.set(s, HEAD, items, HEAD, 0, false);
    st.selected = items[0]!.id;
    st.selectedName = 'x';
    st.set(s, HEAD, items.slice(1), HEAD, 10, false);
    expect([st.selected, st.selectedName]).toEqual([null, '']);
    const busy = drawables(debrisViewOf(miniLayout, DEBRIS_CAP + 3, [SRC]));
    st.set(s, HEAD, busy, HEAD, 20, false);
    expect(s.debris.entries).toHaveLength(DEBRIS_CAP);
    expect(st.plan!.overflow.get(SRC)).toBe(3);
    // the "+N" over src's shell when src is in focus (bitmap labels, outside the pixel pass); none for a far body
    const m = s.model, src = m.planets[0]!;
    const focus = focusPose(startPose(m), planetCentre(src, 0), src.radius);
    const plus = st.labels(s, 0, focus, 1280, 720, 4).filter((l) => l.text.startsWith('+'));
    expect(plus.map((l) => l.text)).toEqual(['+3 debris']);
    const c = project(focus, planetCentre(src, 0))!;
    // beside its disc at mid height, inside the frame
    expect(plus[0]!.x).toBeGreaterThan(((c.x + 1) / 2) * 1280 + projectedRadius(src.radius, c.depth) * 360);
    expect(Math.abs(plus[0]!.y - ((1 - c.y) / 2) * 720)).toBeLessThan(20);
    const far = { ...focus, dist: focus.dist * 60 };
    expect(st.labels(s, 0, far, 1280, 720, 4).filter((l) => l.text.startsWith('+'))).toEqual([]);
    s.dispose();
  });
});
