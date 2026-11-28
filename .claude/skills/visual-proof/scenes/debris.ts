// Scene debris (R13): stale work drifting round its planets, over the scene's own repo: four planets (engine,
// ui, lib, docs), and eleven stale branches built for it with fixed authors and dates, so every class git
// finds (abandoned, merged and not deleted, orphaned agent) and every age step (intact, weathered, broken)
// comes out the same on every run. Two parts: with motion, engine in focus while its debris tumbles, blinks and
// drifts; under reduced motion (the clock at 0), the start view, engine in focus, a piece clicked and its
// panel open (its branch, age, last commit, creator and the commands to copy), then ui in focus. Where the piece
// is comes from this checkout's own debris and camera code, from the ids and sizes the scan gives these
// branches; a build that draws no debris opens no panel there, and the scene notes that instead of failing.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DebrisClass } from '../../../../src/core/contract/debris.js';
import { debrisAgeStep } from '../../../../src/core/contract/debris.js';
import { debrisId } from '../../../../src/core/debris.js';
import { u32 } from '../../../../src/core/hash.js';
import { project } from '../../../../web/src/camera/pose.js';
import { debrisBody, orbitPoint, placePiece, ranked, type Piece } from '../../../../web/src/debris/place.js';
import { loopPhase } from '../../../../web/src/model/motion.js';
import { planetCentre } from '../../../../web/src/model/system.js';
import type { Scene, SceneContext } from '../scripts/scene.js';
import { bracketPose, onScreen } from './helpers.js';

interface Who { name: string; email: string }
const NOVA: Who = { name: 'Nova Reyes', email: 'nova@debris-scene.test' };
const PIP: Who = { name: 'Pip Okafor', email: 'pip@debris-scene.test' };
const CLAUDE: Who = { name: 'Claude', email: 'noreply@anthropic.com' };

/** HEAD's committer date: every age counts back from it (the scan's "now"). */
const HEAD_AT = Date.parse('2026-10-31T12:00:00Z');
const daysBefore = (d: number) => new Date(HEAD_AT - d * 86_400_000).toISOString().replace('.000Z', 'Z');

/** Main's files and their lines at the first commit; ui and lib carry debt markers, so their planets look worse. */
const FILES: Readonly<Record<string, number>> = {
  'engine/core.ts': 120, 'engine/parse.ts': 160, 'engine/render.ts': 140, 'engine/cache.ts': 100, 'engine/core.test.ts': 40, 'engine/parse.test.ts': 30,
  'ui/app.ts': 90, 'ui/view.ts': 80, 'ui/theme.ts': 60, 'ui/app.test.ts': 30, 'lib/util.ts': 120, 'lib/fmt.ts': 80, 'docs/guide.md': 60, 'docs/api.md': 50, 'README.md': 12,
};
const MARKED: Readonly<Record<string, number>> = { 'ui/app.ts': 2, 'lib/util.ts': 1 };

/** The stale branches, off main's first commit: each appends `lines` to one file at HEAD, `days` before HEAD. */
interface Branch { name: string; cls: Exclude<DebrisClass, 'pr'>; who: Who; days: number; file: string; lines: number }
const UNMERGED: readonly Branch[] = [
  { name: 'spike-wasm', cls: 'branch', who: PIP, days: 280, file: 'engine/core.ts', lines: 90 },
  { name: 'parser-rewrite', cls: 'branch', who: PIP, days: 244, file: 'engine/parse.ts', lines: 2200 },
  { name: 'old-cache', cls: 'branch', who: NOVA, days: 103, file: 'engine/cache.ts', lines: 640 },
  { name: 'ui-dark-mode', cls: 'branch', who: PIP, days: 88, file: 'ui/theme.ts', lines: 900 },
  { name: 'try-shaders', cls: 'branch', who: PIP, days: 41, file: 'engine/render.ts', lines: 310 },
  { name: 'agent/refactor-utils', cls: 'agent', who: CLAUDE, days: 77, file: 'lib/util.ts', lines: 450 },
  { name: 'agent/parser-cleanup', cls: 'agent', who: CLAUDE, days: 20, file: 'engine/parse.ts', lines: 120 },
  { name: 'agent/fix-flaky-test', cls: 'agent', who: CLAUDE, days: 11, file: 'ui/view.ts', lines: 60 },
];
/** Branches left pointing at main's history: merged, never deleted. Their home is their tip's own change. */
const MERGED: readonly { name: string; days: number; file: string }[] = [
  { name: 'release-0.9', days: 210, file: 'engine/core.ts' },
  { name: 'hotfix-render', days: 140, file: 'engine/render.ts' },
];
/** Merged with --no-ff a few days after its own commit. */
const DOCS_TOUR = { name: 'docs-tour', days: 30, mergedDays: 25, file: 'docs/guide.md' };

const lineOf = (path: string, i: number) => (path.endsWith('.md') ? `- note ${i}` : `export const v${i} = ${i};`);

/** Builds the scene's repo in `dir` (empty): main, then every branch, then HEAD. Returns the record's lines. */
function buildRepo(dir: string): string[] {
  const env = (who: Who, at: string) => ({ ...process.env, GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: at, GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: at });
  const git = (args: string[], e: NodeJS.ProcessEnv = process.env) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: e }).trim();
  const lines = new Map<string, number>();
  const write = (path: string, extra: number, tag: string) => {
    const at = join(dir, path), base = lines.get(path) ?? 0;
    mkdirSync(dirname(at), { recursive: true });
    const text = Array.from({ length: base }, (_, i) => (i < (MARKED[path] ?? 0) ? `// TODO: tidy part ${i}` : lineOf(path, i)));
    for (let i = 0; i < extra; i++) text.push(path.endsWith('.md') ? `- ${tag} ${i}` : `export const ${tag.replace(/[^a-z0-9]/g, '_')}_${i} = ${i};`);
    writeFileSync(at, text.join('\n') + '\n');
  };
  const commit = (who: Who, at: string, subject: string) => { git(['add', '-A']); git(['commit', '-q', '--no-verify', '-m', subject], env(who, at)); };
  mkdirSync(dir, { recursive: true });
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', NOVA.name], ['user.email', NOVA.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false'], ['init.defaultBranch', 'main']]) git(['config', k!, v!]);
  for (const [path, n] of Object.entries(FILES)) { lines.set(path, n); write(path, 0, 'x'); }
  commit(NOVA, daysBefore(300), 'start the engine');
  const first = git(['rev-parse', 'HEAD']);
  // main's history: a merged branch left on each of two of its commits
  for (const m of MERGED) {
    write(m.file, 12, m.name);
    lines.set(m.file, (lines.get(m.file) ?? 0) + 12);
    commit(NOVA, daysBefore(m.days), `ship ${m.name}`);
    git(['branch', m.name]);
  }
  // the unmerged branches, each one commit off main's first, appending to its file as main had it then
  for (const b of UNMERGED) {
    const was = new Map(lines);
    git(['checkout', '-q', '-b', b.name, first]);
    for (const [path, n] of Object.entries(FILES)) lines.set(path, n);
    write(b.file, b.lines, b.name);
    commit(b.who, daysBefore(b.days), `${b.name}: work in progress`);
    git(['checkout', '-q', 'main']);
    for (const [k, v] of was) lines.set(k, v);
  }
  // docs-tour: its own commit, merged with --no-ff, then main moves on to HEAD
  git(['checkout', '-q', '-b', DOCS_TOUR.name]);
  write(DOCS_TOUR.file, 20, DOCS_TOUR.name);
  commit(PIP, daysBefore(DOCS_TOUR.days), 'a tour of the docs');
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-ff', '--no-verify', '-m', 'merge the docs tour', DOCS_TOUR.name], env(NOVA, daysBefore(DOCS_TOUR.mergedDays)));
  lines.set(DOCS_TOUR.file, (lines.get(DOCS_TOUR.file) ?? 0) + 20);
  write('README.md', 2, 'head');
  commit(NOVA, daysBefore(0), 'tidy the readme');
  return [`the scene's own repo in ${dir}: main at ${git(['rev-parse', 'HEAD'])}, ${UNMERGED.length + MERGED.length + 1} stale branches (abandoned, merged, agent), HEAD at ${daysBefore(0)}`];
}

/** The pieces the scan gives this repo's branches on `home` (a planet's path), as this checkout's debris code places them. */
function piecesOn(s: SceneContext, path: string): Piece[] {
  const planet = s.model.planets.find((p) => p.path === path);
  const body = planet ? debrisBody(s.model, planet.dirId) : null;
  if (!planet || !body) s.fail(`debris: no planet ${path}`);
  const ofFile = (file: string) => file.startsWith(`${path}/`);
  const items = [
    ...UNMERGED.filter((b) => ofFile(b.file)).map((b) => ({ ref: b.name, cls: b.cls, days: b.days, lines: b.lines })),
    ...MERGED.filter((m) => ofFile(m.file)).map((m) => ({ ref: m.name, cls: 'merged' as const, days: m.days, lines: 0 })),
  ].map((b) => {
    const id = debrisId(`refs/heads/${b.ref}`);
    return { name: b.ref, item: { id, cls: b.cls, home: planet.dirId, ageStep: debrisAgeStep(b.days), lines: b.lines, seed: u32(id) } };
  });
  return ranked(items.map((x) => x.item)).map((it) => placePiece(it, body));
}

/** The branch name of a piece of this repo. */
const nameOf = (p: Piece) => [...UNMERGED, ...MERGED].find((b) => debrisId(`refs/heads/${b.name}`) === p.id)?.name ?? '?';

/**
 * Where to click `path`'s pieces at the bracket focus (frame 0, reduced motion), first those of `prefer` (by branch
 * name): one on screen, in front of its planet, and clear of every other piece, so the click can only pick it.
 */
function clickable(s: SceneContext, path: string, index: number, prefer: readonly string[]): { piece: Piece; x: number; y: number } {
  const pose = bracketPose(s.model, index, 0), planet = s.model.planets[index]!;
  const c = planetCentre(planet, 0), body = onScreen(pose, c, s.width, s.height)!;
  const pieces = piecesOn(s, path);
  const at = pieces.map((p) => {
    const o = orbitPoint(p.orbit, loopPhase(0)), w: [number, number, number] = [c[0] + o[0], c[1] + o[1], c[2] + o[2]];
    const q = project(pose, w), pt = onScreen(pose, w, s.width, s.height);
    return q && pt ? { piece: p, x: pt.x, y: pt.y, depth: pt.depth, r: (p.bound / (q.depth * Math.tan((17.5 * Math.PI) / 180))) * (s.height / 2) } : null;
  });
  const order = [...prefer.map((n) => at.find((a) => a && nameOf(a.piece) === n)), ...at];
  for (const a of order) {
    if (!a || a.x < 40 || a.y < 40 || a.x > s.width - 40 || a.y > s.height - 40 || a.depth > body.depth) continue;
    if (at.some((b) => b && b !== a && Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r)) continue;
    return { piece: a.piece, x: a.x, y: a.y };
  }
  return s.fail(`debris: no piece of ${path} in clear view at the focus`);
}

const panelText = (s: SceneContext) => s.page.$eval('#debris-panel', (e) => ((e as HTMLElement).hidden ? '' : e.textContent ?? '')).catch(() => '');

async function drift(s: SceneContext): Promise<void> {
  await s.dismissOffer();
  await s.settle();
  await s.focusPlanet('engine');
  await s.advance(20); // the glide in
  await s.record(60);
  s.still('engine in focus: its stale branches tumbling, blinking and drifting');
}

async function panel(s: SceneContext): Promise<void> {
  await s.dismissOffer();
  await s.settle();
  await s.record(2);
  s.still('the start view');
  const index = s.model.planets.findIndex((p) => p.path === 'engine');
  await s.focusPlanet('engine');
  await s.record(2);
  s.still('engine in focus');
  const target = clickable(s, 'engine', index, ['old-cache', 'try-shaders', 'parser-rewrite']);
  const name = nameOf(target.piece);
  await s.click(target.x, target.y);
  let opened = false;
  for (let i = 0; i < 20 && !opened; i++) {
    const text = await panelText(s);
    opened = text.includes(name) && (text.includes('copy') || text.includes('no command'));
    if (!opened) await s.advance(1);
  }
  s.note(`${name} clicked at ${Math.round(target.x)},${Math.round(target.y)}: ${opened ? 'its debris panel opened' : 'no debris panel opened (a build without debris)'}`);
  await s.record(2);
  s.still(`a stale branch clicked (${name}): its panel`);
  await s.press('Escape');
  await s.focusPlanet('ui');
  await s.record(2);
  s.still('ui in focus');
}

export const debris: Scene = {
  name: 'debris',
  summary: "Stale branches as debris round their planets (R13) over the scene's own repo: engine in focus with its debris moving, then under reduced motion the start view, engine, a piece clicked and its panel, and ui",
  repo: async (dest) => buildRepo(dest),
  roots: [],
  parts: [
    { name: 'drift', reducedMotion: false, run: drift },
    { name: 'panel', reducedMotion: true, run: panel },
  ],
};
