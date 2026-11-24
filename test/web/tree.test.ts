// The directory view's model (#209): the snapshot's files as a folder tree, each file's and folder's
// place on the map, today's fog per file and the charted share per folder, the rows shown, their words,
// the file list's input check, and the settlement direction the map's focus turns to.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FogView } from '../../src/core/contract/fog.js';
import { fibonacciCell } from '../../src/core/contract/layout.js';
import { basis, focusPose, PARKED_POSE } from '../../web/src/camera/pose.js';
import { TURNS, turnAngle } from '../../web/src/model/motion.js';
import { surfaceDirection, systemModel } from '../../web/src/model/system.js';
import { checkTreeSource } from '../../web/src/model/validate.js';
import { buildTree, chartedPercent, openText, placeText, rowLabel, rowTag, treeFog, visibleRows, type TreeDir, type TreeFile, type TreeNode } from '../../web/src/tree/model.js';
import { miniFog, miniLayout } from '../fixtures/contract/mini.js';
import { miniTree } from '../fixtures/tree.js';

const tree = () => buildTree(miniTree, miniLayout);
/** The node at a path. */
function at(root: TreeDir, path: string): TreeNode {
  const walk = (d: TreeDir): TreeNode | undefined => d.children.map((c) => (c.path === path ? c : c.kind === 'dir' ? walk(c) : undefined)).find(Boolean);
  const n = walk(root);
  if (!n) throw new Error(`no ${path}`);
  return n;
}
const files = (d: TreeDir): TreeFile[] => d.children.flatMap((c) => (c.kind === 'dir' ? files(c) : [c]));

describe('the directory view\'s tree (#209)', () => {
  it('holds every file of the snapshot once, folders before files, each in codepoint order', () => {
    const t = tree();
    expect(t.children.map((c) => c.name)).toEqual(['docs', 'src', 'test', 'web', 'README.md', 'package.json']); // 'R' < 'p'
    expect(files(t).map((x) => x.id).sort()).toEqual(miniTree.files.map((x) => x.id).sort());
    expect((at(t, 'test') as TreeDir).children.map((c) => c.name)).toEqual(['fixtures', 'web', 'a.test.ts', 'misc.test.ts']);
    expect(at(t, 'src/core/c.ts')).toMatchObject({ kind: 'file', name: 'c.ts', id: 'f_00000000000c' });
  });

  it('places each file on its body: a settlement and its cell, a test moon, a moonlet, an unplaced file on its folder\'s planet, else the star', () => {
    const t = tree();
    const place = (p: string) => at(t, p).place;
    expect(place('src/a.ts')).toEqual({ kind: 'settlement', planet: 'd_00000000000a', cell: 0 });
    expect(place('src/core/c.ts')).toEqual({ kind: 'settlement', planet: 'd_00000000000a', cell: 21 });
    expect(place('test/a.test.ts')).toEqual({ kind: 'moon', planet: 'd_00000000000a' }); // a moon of the planet it tests, wherever it lives
    expect(place('test/web/m03.test.ts')).toEqual({ kind: 'moon', planet: 'd_00000000000c' });
    expect(place('README.md')).toEqual({ kind: 'moonlet' });
    expect(place('test/misc.test.ts')).toEqual({ kind: 'moonlet' });
    expect(place('docs/z.md')).toEqual({ kind: 'unplaced', planet: 'd_00000000000d' }); // docs' surface overflow
    expect(place('test/fixtures/a.json')).toEqual({ kind: 'star' }); // test data, in no planet's folder
  });

  it('places each folder: a planet, a continent from its seed cell (a deeper folder by its continent), else the star', () => {
    const t = buildTree({ ...miniTree, files: [...miniTree.files, { id: 'f_0000000000d1', path: 'src/core/deep/d.ts' }] }, miniLayout);
    expect(at(t, 'src').place).toEqual({ kind: 'planet', planet: 'd_00000000000a' });
    expect(at(t, 'src/core').place).toEqual({ kind: 'continent', planet: 'd_00000000000a', cell: 21 });
    expect(at(t, 'src/core/deep').place).toEqual({ kind: 'continent', planet: 'd_00000000000a', cell: 21 });
    expect(at(t, 'src/core/deep/d.ts').place).toEqual({ kind: 'unplaced', planet: 'd_00000000000a' });
    expect(at(t, 'docs').place).toEqual({ kind: 'planet', planet: 'd_00000000000d' });
    expect(at(t, 'test').place).toEqual({ kind: 'star' });
    expect(at(t, 'test/web').place).toEqual({ kind: 'star' });
  });

  it('under content roots, a folder above the planets is the star\'s and a planet one level down is found by its path', () => {
    const layout = { ...miniLayout, source: { ...miniLayout.source, roots: ['src'] }, planets: miniLayout.planets.map((p, i) => (i === 0 ? { ...p, path: 'src/core' } : p)) };
    const t = buildTree({ ...miniTree, dirs: miniTree.dirs.map((d) => (d.path === 'src/core' ? { ...d, id: 'd_00000000000a' as const } : d.path === 'src' ? { ...d, id: 'd_0000000000f0' as const } : d)) }, layout);
    expect(at(t, 'src').place).toEqual({ kind: 'star' });
    expect(at(t, 'src/core').place).toEqual({ kind: 'planet', planet: 'd_00000000000a' });
  });
});

describe('fog in the tree (today\'s two states, #209 scope)', () => {
  it('shows each file fogged or clear (charted is clear) and each folder the charted share of its files at any depth', () => {
    const t = tree();
    const fog = treeFog(t, miniFog);
    const tag = (p: string) => rowTag(at(t, p), fog);
    expect(tag('web/main.ts')).toBe('fogged');
    expect(tag('src/a.ts')).toBe('clear'); // charted
    expect(tag('src/b.ts')).toBe('clear');
    expect(tag('test/misc.test.ts')).toBe('fogged');
    expect(tag('web')).toBe('0%');
    expect(tag('src')).toBe('100%');
    expect(tag('test')).toBe('96%'); // 27 of 28, rounded down
    expect(fog.dir(at(t, 'test') as TreeDir)).toEqual({ clear: 27, total: 28 });
    expect(fog.all).toEqual({ clear: miniTree.files.length - 2, total: miniTree.files.length });
  });

  it('without a usable fog view every file is fogged and every folder 0%, and a file the fog doesn\'t list is fogged (Rule 1)', () => {
    const t = tree();
    const none = treeFog(t, null);
    expect(files(t).every((x) => none.fogged(x))).toBe(true);
    expect(t.children.filter((c) => c.kind === 'dir').map((c) => rowTag(c, none))).toEqual(['0%', '0%', '0%', '0%']);
    const partial: FogView = { ...miniFog, files: miniFog.files.filter((x) => x.fileId !== 'f_00000000000b') };
    expect(rowTag(at(t, 'src/b.ts'), treeFog(t, partial))).toBe('fogged');
  });

  it('rounds the charted share down, so a folder reads 100% only when every file in it is clear', () => {
    expect(chartedPercent({ clear: 199, total: 200 })).toBe(99);
    expect(chartedPercent({ clear: 200, total: 200 })).toBe(100);
    expect(chartedPercent({ clear: 1, total: 3 })).toBe(33);
    expect(chartedPercent({ clear: 0, total: 0 })).toBe(0);
  });

  it('says it in words: the rows\' accessible names, where a place is, and what opening one announces', () => {
    const t = tree();
    const fog = treeFog(t, miniFog);
    expect(rowLabel(at(t, 'web/main.ts'), fog)).toBe('main.ts, file, fogged');
    expect(rowLabel(at(t, 'test'), fog)).toBe('test, folder, 96% charted, 27 of 28 files clear');
    expect(rowLabel(at(t, 'src/core'), fog)).toBe('core, folder, 100% charted, 1 of 1 file clear');
    expect(openText(at(t, 'src/core/c.ts'), fog, miniLayout)).toBe('focused src/core/c.ts (clear): a settlement on the planet src');
    expect(openText(at(t, 'web'), fog, miniLayout)).toBe('focused web/ (0% charted, 0 of 1 file clear): the planet web');
    expect(placeText({ kind: 'continent', planet: 'd_00000000000a', cell: 21 }, miniLayout)).toBe('a continent of the planet src');
    expect(placeText({ kind: 'moon', planet: 'd_00000000000c' }, miniLayout)).toBe('a test moon of the planet web');
    expect(placeText({ kind: 'unplaced', planet: 'd_00000000000d' }, miniLayout)).toBe('not drawn on the map, so showing its folder\'s planet, docs');
    expect(placeText({ kind: 'moonlet' }, miniLayout)).toBe('a moonlet of the star');
    expect(placeText({ kind: 'star' }, miniLayout)).toBe('no planet of its own, so showing the star');
  });
});

describe('the rows shown (#209)', () => {
  it('are the top level, then each expanded folder\'s children under it, with their level, set size, position and parent row', () => {
    const t = tree();
    const top = visibleRows(t, new Set());
    expect(top.map((r) => [r.node.name, r.level, r.setsize, r.posinset, r.parent])).toEqual([
      ['docs', 1, 6, 1, -1], ['src', 1, 6, 2, -1], ['test', 1, 6, 3, -1], ['web', 1, 6, 4, -1], ['README.md', 1, 6, 5, -1], ['package.json', 1, 6, 6, -1],
    ]);
    const open = visibleRows(t, new Set(['src', 'src/core']));
    expect(open.slice(1, 6).map((r) => [r.node.path, r.level, r.setsize, r.posinset, r.parent])).toEqual([
      ['src', 1, 6, 2, -1], ['src/core', 2, 3, 1, 1], ['src/core/c.ts', 3, 1, 1, 2], ['src/a.ts', 2, 3, 2, 1], ['src/b.ts', 2, 3, 3, 1],
    ]);
    // a folder inside a closed one stays hidden, even when it is open itself
    expect(visibleRows(t, new Set(['src/core'])).map((r) => r.node.path)).toEqual(top.map((r) => r.node.path));
  });
});

describe('the file list\'s input check (#209)', () => {
  const snapshot = {
    schemaVersion: '0.2', repo: { repoId: 'r_1', head: miniTree.head, headDate: '2026-11-01T00:00:00Z', branch: 'main', selfPersonIds: [] },
    people: [{ id: 'p_1', displayName: 'Someone', isSelf: true }], commits: [{ sha: miniTree.head, subject: 'a subject' }],
    dirs: miniTree.dirs.map((d) => ({ ...d, parent: null, depth: 1, bornSeq: 0, bornDate: '2026-11-01T00:00:00Z' })),
    files: miniTree.files.map((f) => ({ ...f, loc: 1, debt: null, isTest: false, testOf: null, qodo: null })),
  };

  it('keeps only the head and each folder\'s and file\'s id and path', () => {
    const c = checkTreeSource(snapshot);
    expect(c).toEqual({ ok: true, value: miniTree });
  });

  it('refuses the whole list over one bad or repeated entry, never dropping a file silently (Rule 1)', () => {
    const bad = (files: unknown[]) => checkTreeSource({ ...snapshot, files });
    const one = snapshot.files[0]!;
    for (const path of ['/etc/passwd', 'a//b', 'a/../b', './a', 'a/', '']) expect(bad([{ ...one, path }]).ok, path).toBe(false);
    expect(bad([one, { ...one, id: 'f_0000000000ff' }])).toEqual({ ok: false, errors: ['snapshot.files[1].path is repeated'] });
    expect(bad([one, { ...one, path: 'other' }])).toEqual({ ok: false, errors: ['snapshot.files[1].id is repeated'] });
    expect(bad([{ ...one, id: 'x' }]).ok).toBe(false);
    expect(checkTreeSource({ ...snapshot, schemaVersion: '0.1' }).ok).toBe(false);
    expect(checkTreeSource({ ...snapshot, repo: {} }).ok).toBe(false);
    expect(checkTreeSource([]).ok).toBe(false);
  });
});

describe('turning the map to a settlement (#209)', () => {
  it('surfaceDirection is the cell\'s centre turned with the planet\'s surface, as render/planet.ts turns it', () => {
    const p = systemModel(miniLayout).planets[0]!;
    for (const frame of [0, 1, 97, 719, 1440 + 5]) {
      for (const cell of [0, 13, 21, 40]) {
        const spin = new THREE.Group();
        spin.rotation.y = -turnAngle(frame, TURNS.surface);
        spin.updateMatrixWorld(true);
        const want = new THREE.Vector3(...fibonacciCell(cell, p.surface.cells)).applyMatrix4(spin.matrixWorld);
        const got = surfaceDirection(p, cell, frame);
        got.forEach((v, k) => expect(v).toBeCloseTo(want.getComponent(k), 12));
      }
    }
  });

  it('a focus facing a direction puts the eye on that side of the body, at the focus distance', () => {
    const facing = surfaceDirection(systemModel(miniLayout).planets[0]!, 13, 50);
    const pose = focusPose(PARKED_POSE, [3, 0, -1], 1, facing);
    const back = basis(pose.yaw, pose.pitch).back;
    back.forEach((v, k) => expect(v).toBeCloseTo(facing[k]!, 9));
    expect(pose.target).toEqual([3, 0, -1]);
    expect(pose.dist).toBe(focusPose(PARKED_POSE, [3, 0, -1], 1).dist);
  });
});
