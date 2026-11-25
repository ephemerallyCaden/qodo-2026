// The directory view's model (#209): the snapshot's files as a folder tree, each file's and folder's
// place on the map, each file's fog level (#201: fogged, haze, clear) and each folder's mastery, the rows
// shown, their words, the file list's input check, and the settlement direction the map's focus turns to.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FogView } from '../../src/core/contract/fog.js';
import { fibonacciCell } from '../../src/core/contract/layout.js';
import type { FileId } from '../../src/core/snapshot/types.js';
import { basis, focusPose, PARKED_POSE } from '../../web/src/camera/pose.js';
import { masteryLine } from '../../web/src/model/describe.js';
import { LEVEL, levelBy, planetTally } from '../../web/src/model/fog.js';
import { TURNS, turnAngle } from '../../web/src/model/motion.js';
import { surfaceDirection, systemModel } from '../../web/src/model/system.js';
import { checkTreeSource } from '../../web/src/model/validate.js';
import { buildTree, openText, placeText, rowLabel, rowTag, TREE_PAGE, treeFog, visibleRows, type Row, type TreeDir, type TreeFile, type TreeNode, type TreeSource } from '../../web/src/tree/model.js';
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

describe('fog in the tree (#201: three levels)', () => {
  it('shows each file\'s level, fogged, haze (seen) or clear (understood), and each folder its mastery and the rest of its counts', () => {
    const t = tree();
    const fog = treeFog(t, miniFog);
    const tag = (p: string) => rowTag(at(t, p), fog);
    expect(tag('web/main.ts')).toBe('fogged');
    expect(tag('test/misc.test.ts')).toBe('fogged');
    expect(tag('docs/z.md')).toBe('haze'); // seen, not yet understood
    expect(tag('test/fixtures/a.json')).toBe('haze');
    expect(tag('src/a.ts')).toBe('clear');
    expect(tag('src/core/c.ts')).toBe('clear');
    expect(tag('src')).toBe('100%');
    expect(tag('src/core')).toBe('100%');
    expect(tag('docs')).toBe('66% · 1 haze'); // 2 of 3 clear, rounded down
    expect(tag('test/fixtures')).toBe('50% · 1 haze');
    expect(tag('test')).toBe('92% · 1 haze · 1 fogged'); // 26 of 28 clear: haze isn't understood
    expect(fog.dir(at(t, 'test') as TreeDir)).toEqual({ fogged: 1, haze: 1, clear: 26, total: 28 });
    expect(fog.all).toEqual({ fogged: 2, haze: 2, clear: miniTree.files.length - 4, total: miniTree.files.length });
  });

  it('reads every file\'s level from the source the map\'s fog shader reads, so the two never disagree', () => {
    const t = tree();
    const levels = ['fogged', 'haze', 'clear'] as const;
    // every file at every level once, by its place in the list, plus one the view doesn't list
    const mixed: FogView = { ...miniFog, files: miniFog.files.slice(1).map((f, i) => ({ ...f, state: levels[i % 3]! })) };
    for (const view of [miniFog, mixed, null]) {
      const fog = treeFog(t, view), shader = levelBy(view);
      for (const f of files(t)) expect(LEVEL[fog.level(f)]).toBe(shader(f.id));
    }
    expect(treeFog(t, mixed).level(at(t, 'README.md') as TreeFile)).toBe('fogged'); // f_000000000001, not listed (Rule 1)
  });

  it('shows a planet\'s folder at its planet\'s mastery, the info panel\'s number for the same fog, test moons in', () => {
    const t = tree();
    const fog = treeFog(t, miniFog);
    for (const p of miniLayout.planets) {
      const d = at(t, p.path) as TreeDir;
      expect(d.planet).toEqual({ id: p.dirId, files: p.surface.settlements.length + p.surface.overflow + p.moons.length + p.moonOverflow });
      expect(fog.dir(d)).toEqual(planetTally(miniFog, p.dirId));
      const panel = /^mastery: (\d+)% /.exec(masteryLine(planetTally(miniFog, p.dirId)))![1];
      expect(rowTag(d, fog).split('%')[0]).toBe(panel);
    }
    // web/ holds one fogged file, but its planet also carries 24 clear test moons from test/web/
    expect(rowTag(at(t, 'web'), fog)).toBe('96% · 1 fogged');
    expect((at(t, 'src/core') as TreeDir).planet).toBeNull(); // a continent counts its own files
    expect((at(t, 'test') as TreeDir).planet).toBeNull();
  });

  it('under content roots, the planet one level down carries the planet\'s count and the folder above it its own files', () => {
    const layout = { ...miniLayout, source: { ...miniLayout.source, roots: ['src'] }, planets: miniLayout.planets.map((p, i) => (i === 0 ? { ...p, path: 'src/core' } : p)) };
    const t = buildTree({ ...miniTree, dirs: miniTree.dirs.map((d) => (d.path === 'src/core' ? { ...d, id: 'd_00000000000a' as const } : d.path === 'src' ? { ...d, id: 'd_0000000000f0' as const } : d)) }, layout);
    const view: FogView = { ...miniFog, planets: miniFog.planets.map((p) => (p.dirId === 'd_00000000000a' ? { ...p, total: 2, haze: 1, clear: 1 } : p)) };
    const fog = treeFog(t, view);
    expect(fog.dir(at(t, 'src/core') as TreeDir)).toEqual({ total: 2, fogged: 0, haze: 1, clear: 1 });
    expect(rowTag(at(t, 'src/core'), fog)).toBe('50% · 1 haze');
    expect(rowTag(at(t, 'src'), fog)).toBe('100%'); // the star's folder: its own three files, all clear
  });

  it('without a usable fog view every file is fogged and every folder 0%, and a file the fog doesn\'t list is fogged (Rule 1)', () => {
    const t = tree();
    const none = treeFog(t, null);
    expect(files(t).every((x) => none.level(x) === 'fogged')).toBe(true);
    // a planet's folder counts every file the layout puts on its planet, test moons from test/ and the moons not drawn
    // too (Qodo e6973183): web is 1 settlement, 24 drawn moons and 2 more, as its info panel lists them
    expect(t.children.filter((c) => c.kind === 'dir').map((c) => rowTag(c, none))).toEqual(['0% · 3 fogged', '0% · 4 fogged', '0% · 28 fogged', '0% · 27 fogged']);
    expect(rowLabel(at(t, 'web'), none)).toBe('web, folder, mastery 0%, 0 of 27 files clear (understood), 0 haze (seen), 27 fogged, counted as its planet');
    expect(none.all).toEqual({ fogged: miniTree.files.length, haze: 0, clear: 0, total: miniTree.files.length });
    const partial: FogView = { ...miniFog, files: miniFog.files.filter((x) => x.fileId !== 'f_00000000000b') };
    expect(rowTag(at(t, 'src/b.ts'), treeFog(t, partial))).toBe('fogged');
    // a planet the fog view has no count for is unknown, so its files read fogged, never clearer
    const noWeb: FogView = { ...miniFog, planets: miniFog.planets.filter((p) => p.dirId !== 'd_00000000000c') };
    expect(rowTag(at(t, 'web'), treeFog(t, noWeb))).toBe('0% · 27 fogged');
  });

  it('rounds mastery down, so a folder reads 100% only when every file in it is clear', () => {
    const t = buildTree({ ...miniTree, files: Array.from({ length: 200 }, (_, i) => ({ id: `f_${(0x100 + i).toString(16).padStart(12, '0')}` as FileId, path: `flat/f${i}.ts` })) }, miniLayout);
    const ids = files(t).map((f) => f.id);
    const view = (clear: number): FogView => ({ ...miniFog, files: ids.map((fileId, i) => ({ fileId, state: i < clear ? 'clear' : 'haze', reasons: [], since: null })) });
    expect(rowTag(at(t, 'flat'), treeFog(t, view(199)))).toBe('99% · 1 haze');
    expect(rowTag(at(t, 'flat'), treeFog(t, view(200)))).toBe('100%');
  });

  it('draws each level differently: the page gives a haze file\'s name and a fogged one\'s their own rules, a clear one the plain ink', () => {
    const css = readFileSync(join(import.meta.dirname, '../../web/src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    /** The declarations of every rule whose selector list names `selector`. */
    const rules = (selector: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => m[1]!.split(',').some((x) => x.trim() === selector)).map((m) => m[2]!.trim());
    const haze = rules('#tree .row.haze .name'), fogged = rules('#tree .row.fogged .name');
    expect(haze).toHaveLength(1);
    expect(fogged).toHaveLength(1);
    expect(haze[0]).not.toBe(fogged[0]);
    expect(rules('#tree .row.clear .name')).toEqual([]); // clear is the row's plain ink
  });

  it('says it in words: the rows\' accessible names, where a place is, and what opening one announces', () => {
    const t = tree();
    const fog = treeFog(t, miniFog);
    expect(rowLabel(at(t, 'web/main.ts'), fog)).toBe('main.ts, file, fogged');
    expect(rowLabel(at(t, 'docs/z.md'), fog)).toBe('z.md, file, haze (seen)');
    expect(rowLabel(at(t, 'src/a.ts'), fog)).toBe('a.ts, file, clear (understood)');
    expect(rowLabel(at(t, 'test'), fog)).toBe('test, folder, mastery 92%, 26 of 28 files clear (understood), 1 haze (seen), 1 fogged');
    expect(rowLabel(at(t, 'src/core'), fog)).toBe('core, folder, mastery 100%, 1 of 1 file clear (understood), 0 haze (seen), 0 fogged');
    expect(rowLabel(at(t, 'web'), fog)).toBe('web, folder, mastery 96%, 24 of 25 files clear (understood), 0 haze (seen), 1 fogged, counted as its planet');
    expect(openText(at(t, 'src/core/c.ts'), fog, miniLayout)).toBe('focused src/core/c.ts: a settlement on the planet src; clear (understood)');
    expect(openText(at(t, 'docs/z.md'), fog, miniLayout)).toBe('focused docs/z.md: not drawn on the map, so showing its folder\'s planet, docs; haze (seen)');
    expect(openText(at(t, 'web'), fog, miniLayout)).toBe('focused web/: the planet web; mastery 96%, 24 of 25 files clear (understood), 0 haze (seen), 1 fogged, counted as its planet');
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

  it('show a folder\'s first page of children, then a row standing for the rest; more pages show as many more (Qodo fb9c0d80)', () => {
    const n = 2 * TREE_PAGE + 5;
    const src: TreeSource = { head: miniTree.head, dirs: [{ id: 'd_00000000000a', path: 'big' }],
      files: Array.from({ length: n }, (_, i) => ({ id: `f_${i.toString(16).padStart(12, '0')}` as FileId, path: `big/f${String(i).padStart(4, '0')}.ts` })) };
    const t = buildTree(src, miniLayout);
    const paths = (rows: Row[]) => rows.map((r) => r.node.path);
    const closed = visibleRows(t, new Set());
    expect(paths(closed)).toEqual(['big']);
    const one = visibleRows(t, new Set(['big']));
    expect(one).toHaveLength(1 + TREE_PAGE + 1);
    expect(one.at(-1)).toEqual({ node: { kind: 'more', path: 'big/', name: `${n - TREE_PAGE} more`, dir: t.children[0], hidden: n - TREE_PAGE, next: TREE_PAGE },
      level: 2, setsize: n, posinset: TREE_PAGE + 1, parent: 0 });
    const two = visibleRows(t, new Set(['big']), new Map([['big', 2 * TREE_PAGE]]));
    expect(two.at(-1)!.node).toMatchObject({ kind: 'more', hidden: 5, next: 5 });
    expect(two.at(-2)!.node.path).toBe(`big/f${String(2 * TREE_PAGE - 1).padStart(4, '0')}.ts`);
    const all = visibleRows(t, new Set(['big']), new Map([['big', 3 * TREE_PAGE]]));
    expect(all).toHaveLength(1 + n); // every file, and no row for more
    expect(all.every((r) => r.node.kind === 'file' || r.node.path === 'big')).toBe(true);
    expect(rowLabel(one.at(-1)!.node, treeFog(t, null))).toBe(`${n - TREE_PAGE} more not shown, open to show ${TREE_PAGE}`);
    expect(rowTag(two.at(-1)!.node, treeFog(t, null))).toBe('show 5');
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
