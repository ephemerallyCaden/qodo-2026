// R11 and R8 (Node, no socket): the one routing decision that the dev server and the test harness
// share. The archive route serves only allowlisted PNG/GIF files inside the archive's real root, to
// GET and HEAD, and rejects traversal (plain, encoded, double-encoded), symlinks out of the archive,
// directories, listings and other file types. Runs against a temp fixture, never the real archive.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { route, archiveRoot, ARCHIVE_PREFIX, LIBRARY_ROOT } from '../routes.mjs';
import { IMAGES } from '../history.js';
import { makeArchive, png } from './fixture-archive.mjs';

let tmp, root;
// Every name below is on the test allowlist, so each rejection is the route's own check, not the allowlist's.
const ALLOW = new Set(['04-timeline/a.png', '02-references/b.gif', 'escape.png', 'inside.png', 'notes.png', 'dir.png', 'INDEX.md', 'missing.png']);
before(async () => {
  tmp = await makeArchive({
    'outside/secret.png': png(2, 2, [255, 0, 0]),
    'archive/04-timeline/a.png': png(4, 2, [0, 255, 0]),
    'archive/04-timeline/not-listed.png': png(2, 2, [0, 0, 255]),
    'archive/02-references/b.gif': 'GIF89a',
    'archive/INDEX.md': '# index',
  });
  root = path.join(tmp, 'archive');
  await symlink(path.join(tmp, 'outside', 'secret.png'), path.join(root, 'escape.png')); // leaves the archive
  await symlink(path.join(root, '04-timeline', 'a.png'), path.join(root, 'inside.png')); // stays inside
  await symlink(path.join(root, 'INDEX.md'), path.join(root, 'notes.png')); // an image name for a non-image
  await mkdir(path.join(root, 'dir.png'));
  await symlink(root, path.join(tmp, 'refs')); // the root reached through a symlink, like .archive/docs/design/refs
});
after(() => rm(tmp, { recursive: true, force: true }));

const get = (p, opts = {}) => route('GET', p, { archive: root, allow: ALLOW, ...opts });

test('an allowlisted archive image is served read-only, with an image type', async () => {
  const r = await get('/art-archive/04-timeline/a.png');
  assert.equal(r.status, 200);
  assert.equal(r.type, 'image/png');
  assert.equal(r.file, realpathSync(path.join(root, '04-timeline', 'a.png')));
  assert.deepEqual(await readFile(r.file), png(4, 2, [0, 255, 0]));
  assert.equal((await get('/art-archive/02-references/b.gif')).type, 'image/gif');
  assert.equal((await route('HEAD', '/art-archive/04-timeline/a.png', { archive: root, allow: ALLOW })).status, 200);
  assert.equal((await get('/art-archive/inside.png')).status, 200, 'a symlink that stays inside the archive');
  assert.equal((await get('/art-archive/04-timeline/a.png', { archive: path.join(tmp, 'refs') })).status, 200, 'the root itself behind a symlink');
});

test('writes are refused: only GET and HEAD', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal((await route(m, '/art-archive/04-timeline/a.png', { archive: root, allow: ALLOW })).status, 405, m);
});

test('traversal is rejected: plain, encoded, double-encoded, backslash, null byte, malformed', async () => {
  for (const p of [
    '/art-archive/../outside/secret.png', '/art-archive/04-timeline/../../outside/secret.png',
    '/art-archive/%2e%2e/outside/secret.png', '/art-archive/..%2foutside%2fsecret.png', '/art-archive/%2E%2E%2Foutside%2Fsecret.png',
    '/art-archive/%252e%252e%252foutside%252fsecret.png', '/art-archive/..%5coutside%5csecret.png', '/art-archive/04-timeline%5ca.png',
    '/art-archive/04-timeline/a.png%00.png', '/art-archive/%E0%A4%A', `/art-archive/${encodeURIComponent(path.join(tmp, 'outside', 'secret.png'))}`,
    '/art-archive//etc/passwd', '/art-archive/./04-timeline/a.png',
  ]) assert.equal((await get(p)).status, 404, p);
});

test('only allowlisted image files inside the real archive root: no symlink escapes, listings, directories or other types', async () => {
  for (const [p, why] of [
    ['/art-archive/escape.png', 'a symlink out of the archive'],
    ['/art-archive/notes.png', 'an image name whose real file is markdown'],
    ['/art-archive/dir.png', 'a directory'],
    ['/art-archive/INDEX.md', 'not an image type, even when allowlisted'],
    ['/art-archive/missing.png', 'allowlisted but absent'],
    ['/art-archive/04-timeline/not-listed.png', 'present but not on the allowlist'],
    ['/art-archive/', 'a listing of the root'],
    ['/art-archive/04-timeline/', 'a listing of a folder'],
    ['/art-archive/04-timeline', 'a folder'],
  ]) assert.equal((await get(p)).status, 404, why);
});

test('without an archive every archive request is a 404, and the rest still works', async () => {
  for (const archive of [null, path.join(tmp, 'nope')]) assert.equal((await get('/art-archive/04-timeline/a.png', { archive })).status, 404);
  assert.equal((await route('GET', '/asset-library/')).file, path.join(LIBRARY_ROOT, 'index.html'));
  assert.equal((await route('GET', '/asset-library/history.js')).type, 'text/javascript');
  assert.deepEqual(await route('GET', '/'), { status: 302, location: '/asset-library/' });
  for (const p of ['/asset-library/routes.mjs', '/asset-library/test/harness.mjs', '/asset-viewer/test/crew.test.mjs', '/asset-library/../asset-viewer/viewer.js', '/.archive/art-iteration/INDEX.md']) {
    assert.equal((await route('GET', p)).status, 404, p);
  }
});

test('the debris lab: its top-level modules only, never its outputs, tests, scripts or node_modules', async () => {
  for (const m of ['variants.js', 'kits.js', 'layout.js', 'palette.js', 'colour.js', 'lab.js']) {
    const r = await route('GET', `/debris-lab/${m}`);
    assert.deepEqual([r.status, r.type], [200, 'text/javascript'], m);
  }
  for (const p of [
    '/debris-lab/out/loop-A3.gif', '/debris-lab/out/lineup-A.png', '/debris-lab/out/measures.json', '/debris-lab/out/measures.md',
    '/debris-lab/test/pure.test.mjs', '/debris-lab/test/render.test.mjs', '/debris-lab/node_modules/three/build/three.module.js',
    '/debris-lab/lab.mjs', '/debris-lab/serve.mjs', '/debris-lab/routes.mjs', '/debris-lab/checks.mjs', '/debris-lab/harness.mjs',
    '/debris-lab/README.md', '/debris-lab/package.json', '/debris-lab/index.html', '/debris-lab/', '/debris-lab',
    '/debris-lab/../asset-library/routes.mjs', '/debris-lab/%2e%2e/drone-lab/serve.mjs', '/debris-lab/out%2floop-A3.gif',
  ]) assert.equal((await route('GET', p)).status, 404, p);
});

test('the fog lab: its top-level modules only, never its outputs, measures, tests, scripts or node_modules', async () => {
  for (const m of ['fog.js', 'variants.js', 'glyphs.js', 'mock.js', 'surface.js', 'lab.js']) {
    const r = await route('GET', `/fog-lab/${m}`);
    assert.deepEqual([r.status, r.type], [200, 'text/javascript'], m);
  }
  for (const p of [
    '/fog-lab/out/lineup-D2d.png', '/fog-lab/out/loop-D2d.gif', '/fog-lab/out/haze-measures.json', '/fog-lab/measures.json', '/fog-lab/measures.md',
    '/fog-lab/test/pure.test.mjs', '/fog-lab/test/viewer-fidelity.test.mjs', '/fog-lab/node_modules/three/build/three.module.js',
    '/fog-lab/lab.mjs', '/fog-lab/serve.mjs', '/fog-lab/routes.mjs', '/fog-lab/checks.mjs', '/fog-lab/harness.mjs', '/fog-lab/stats.mjs', '/fog-lab/report.mjs',
    '/fog-lab/README.md', '/fog-lab/package.json', '/fog-lab/package-lock.json', '/fog-lab/index.html', '/fog-lab/', '/fog-lab',
    '/fog-lab/../asset-library/routes.mjs', '/fog-lab/%2e%2e/drone-lab/serve.mjs', '/fog-lab/out%2floop-D2d.gif', '/fog-lab/test%2fpure.test.mjs',
  ]) assert.equal((await route('GET', p)).status, 404, p);
});

test('the drone lab: its top-level modules only, never its outputs, tests, scripts or node_modules', async () => {
  for (const m of ['drone.js', 'brands.js', 'params.js', 'palette.js', 'variants.js']) {
    const r = await route('GET', `/drone-lab/${m}`);
    assert.deepEqual([r.status, r.type], [200, 'text/javascript'], m);
  }
  for (const p of [
    '/drone-lab/out/brand-copilot-turntable.gif', '/drone-lab/out/brands-lineup.png', '/drone-lab/out/params.md',
    '/drone-lab/test/identity.json', '/drone-lab/test/drone.test.mjs', '/drone-lab/node_modules/three/build/three.module.js',
    '/drone-lab/lab.mjs', '/drone-lab/serve.mjs', '/drone-lab/README.md', '/drone-lab/package.json', '/drone-lab/capture.html', '/drone-lab/index.html',
    '/drone-lab/', '/drone-lab', '/drone-lab/../asset-viewer/serve.mjs', '/drone-lab/%2e%2e/asset-library/routes.mjs', '/drone-lab/out%2fparams.md',
  ]) assert.equal((await route('GET', p)).status, 404, p);
});

test('the history allowlist names only plain relative image paths', () => {
  assert.ok(IMAGES.size > 20);
  for (const rel of IMAGES) assert.match(rel, /^[\w-]+(\/[\w.-]+)+\.(png|gif)$/, rel);
  for (const rel of IMAGES) assert.ok(!rel.includes('..'), rel);
  for (const rel of IMAGES) assert.ok(rel.startsWith(ARCHIVE_PREFIX) === false);
});

test('the archive root: ART_ARCHIVE wins, else the main checkout\'s .archive/art-iteration', () => {
  assert.equal(archiveRoot({ ART_ARCHIVE: tmp }), tmp);
  const def = archiveRoot({});
  if (def === null) return; // not a git checkout
  assert.ok(def.endsWith(path.join('.archive', 'art-iteration')), def);
});

test('the dev server binds loopback only', async () => {
  const src = await readFile(path.join(LIBRARY_ROOT, 'serve.mjs'), 'utf8');
  assert.match(src, /const HOST = '127\.0\.0\.1';/);
  assert.match(src, /\.listen\(PORT, HOST,/);
  assert.doesNotMatch(src, /0\.0\.0\.0|process\.env\.HOST/);
});
