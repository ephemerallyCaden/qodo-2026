// visual-proof: the run, step by step, each step written to the record as it ends (R8).
//   run --base <ref> (--head <ref> | --worktree) --scene <name> [--out <dir>] [--keep]
//   try (--head <ref> | --worktree) --scene <name> [--out <dir>] [--keep]
//               one build, one take: the stills and their probes, to check a new scene before a run
//   scenes      lists the scenes
//   take <cfg>  one take in this process (the run starts these)
// Exit: 0 done, 2 usage, 3 stopped (STOP <code>: the user decides), 1 internal error.
// Nothing leaves the machine (R6): no push, no PR or issue edit, no upload; the images stay local.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { chromium } from '@playwright/test';
import { SCENES } from '../scenes/index.js';
import { compose, GITHUB_IMAGE_LIMIT } from './compose.js';
import { addNodeModules, buildTree, bundleOf, changedFiles, exportTree, git, makeClone, resolveRev, scanClone, snapshotSessions, stateDigest, worktreeRev, type Rev } from './prepare.js';
import { privacyHits, servedTexts, takeTexts, type Scanned } from './privacy.js';
import { RunRecord, redact, uniqueName, type Literal } from './record.js';
import { compareTakes, dataPathsTouched, missingTools, noViewChange, privacyStop, Stop, takesStop } from './rules.js';
import type { TakeLog } from './scene.js';
import { summaryText, type RunSummary } from './summary.js';
import { takeMain, type TakeConfig } from './take.js';

const USAGE = 'usage: vp.sh run --base <ref> (--head <ref> | --worktree) --scene <name> [--out <dir>] [--keep]\n       vp.sh try (--head <ref> | --worktree) --scene <name> [--out <dir>] [--keep]\n       vp.sh scenes\n';
const SIDES = ['before', 'after'] as const;
const STATE_FILES = ['layout.json', 'snapshot.json', 'beacons.json', 'chart.json', 'config.json'];

interface RunArgs { mode: 'run' | 'try'; base: string; head: string | null; worktree: boolean; scene: string; out: string | null; keep: boolean }

function parseRun(argv: string[], mode: RunArgs['mode']): RunArgs | string {
  const a: RunArgs = { mode, base: '', head: null, worktree: false, scene: '', out: null, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i] ?? '';
    if (k === '--base') a.base = v();
    else if (k === '--head') a.head = v();
    else if (k === '--worktree') a.worktree = true;
    else if (k === '--scene') a.scene = v();
    else if (k === '--out') a.out = v();
    else if (k === '--keep') a.keep = true;
    else return `unknown option ${JSON.stringify(k)}`;
  }
  if (!a.base && mode === 'run') return '--base is required';
  if (a.base && mode === 'try') return 'try takes no --base: it builds the head only';
  if ((a.head === null) === !a.worktree) return 'give one of --head <ref> or --worktree';
  if (!a.scene) return `--scene is required (one of ${Object.keys(SCENES).join(', ')})`;
  return a;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const block = (lines: readonly string[]) => ['```', ...lines, '```'];

async function run(a: RunArgs): Promise<number> {
  const cwd = process.cwd();
  const top = git(cwd, 'rev-parse', '--show-toplevel').trim();
  const main = dirname(realpathSync(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim()));
  const evidence = a.out ?? join(main, '.archive', 'docs', 'hackathon', 'evidence');
  if (!existsSync(evidence)) { process.stdout.write(`STOP bad-input: no folder for the record at ${relative(main, evidence) || evidence}; pass --out <dir>\n`); return 3; }
  const scene = SCENES[a.scene];
  if (!scene) { process.stdout.write(`STOP bad-input: no scene ${a.scene}; the scenes are ${Object.keys(SCENES).join(', ')}\n`); return 3; }
  let base: Rev, head: Rev;
  try {
    head = a.worktree ? worktreeRev(top) : resolveRev(top, a.head!);
    base = a.mode === 'try' ? head : resolveRev(top, a.base);
  } catch (e) {
    if (e instanceof Stop) { process.stdout.write(`STOP ${e.code}: ${e.message}\n`); return 3; }
    throw e;
  }
  // The record and the scratch dir share a name, never one an earlier run used
  const trying = a.mode === 'try';
  let id = uniqueName(evidence, trying ? `visual-proof-try-${head.short}-${scene.name}` : `visual-proof-${base.short}-${head.short}-${scene.name}`, ['.md', '']);
  // /tmp itself, resolved: on macOS it is a symlink, and the server refuses state behind one (Rule 2)
  const tmp = realpathSync('/tmp');
  while (existsSync(join(tmp, id))) id = uniqueName(evidence, `${id}-r`, ['.md', '']);
  const scratch = join(tmp, id);
  mkdirSync(scratch, { recursive: true });
  const out = join(evidence, id);
  const literals: Literal[] = [
    { name: '$SCRATCH', value: scratch }, { name: '$SCRATCH', value: join('/tmp', id) },
    { name: '$MAIN', value: main }, { name: '$CHECKOUT', value: top }, { name: '~', value: homedir() }, { name: '$TMPDIR', value: realpathSync(tmpdir()) },
  ];
  const command = `.claude/skills/visual-proof/scripts/vp.sh ${a.mode}${trying ? '' : ` --base ${a.base}`} ${a.worktree ? '--worktree' : `--head ${a.head}`} --scene ${scene.name}`;
  const record = RunRecord.create(join(evidence, `${id}.md`), trying ? `visual-proof try: ${head.short}, scene ${scene.name}` : `visual-proof: ${base.short} → ${head.short}, scene ${scene.name}`, [
    `Command: \`${command}\``,
    ...(trying ? ['A try: one build and one take, to check the scene; no before, no comparison, no GIF.'] : [`Base (before): \`${base.sha}\` ${base.subject}`]),
    `Head (after): ${head.worktree ? `the working tree on \`${head.sha}\` (changes sha256 ${head.diffHash})` : `\`${head.sha}\``} ${head.subject}`,
    `Scene: ${scene.name}: ${scene.summary}`,
    `Checkout: $CHECKOUT, branch ${git(top, 'branch', '--show-current').trim() || '(detached)'}`,
    `Scratch: $SCRATCH (builds, data clone, raw takes); images and summary: ${relative(main, out)}/`,
    'Paths: $MAIN is the main checkout, $CHECKOUT this checkout, $SCRATCH the run\'s temp dir.',
  ], literals);
  const say = (line: string) => process.stdout.write(`${redact(line, literals)}\n`);
  say(`record: ${relative(main, record.path)} (in the main checkout)`);
  try {
    // 1. Tools
    const node = process.versions.node.split('.').map(Number);
    const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
    const found = {
      node: node[0]! > 20 || (node[0] === 20 && node[1]! >= 19),
      git: has('git', ['--version']), tar: has('tar', ['--version']),
      node_modules: existsSync(join(top, 'node_modules', '@playwright', 'test')) && existsSync(join(top, 'node_modules', '.bin', 'tsc')),
      chromium: existsSync(chromium.executablePath()),
    };
    record.step('Tools', [`node ${process.versions.node}; ${Object.entries(found).map(([k, v]) => `${k} ${v ? 'found' : 'MISSING'}`).join(', ')}`,
      'No image tool is needed: PNG, GIF and the captions are the skill\'s own TypeScript.']);
    const missing = missingTools(found);
    if (missing) throw missing;

    // 2. The change
    const sides = trying ? (['after'] as const) : SIDES;
    const changed = trying ? ['(a try: no base)'] : changedFiles(top, base, head);
    const data = trying ? [] : dataPathsTouched(changed);
    if (!trying) record.step('The change', [`${changed.length} paths differ between base and head:`, ...block(changed), data.length ? `Data paths touched (R12): ${data.join(', ')}` : 'No scanner, attribution, layout, snapshot or contract path is touched (R12).']);
    if (!changed.length) throw new Stop('no-view-change', 'base and head are the same tree');

    // 3. Builds
    const trees = { before: join(scratch, 'base'), after: join(scratch, 'head') };
    const bundles = {} as Record<(typeof SIDES)[number], ReturnType<typeof bundleOf>>;
    for (const side of sides) {
      const rev = side === 'before' ? base : head;
      const cmds = [...exportTree(top, rev, trees[side], join(scratch, `${side}.tar`)), ...addNodeModules(top, trees[side])];
      const { ms } = buildTree(trees[side], join(scratch, `build-${side}.log`), side);
      bundles[side] = bundleOf(trees[side]);
      record.step(`Build ${side} (${rev.short})`, [...block([...cmds, `npm run build   # in ${trees[side]}, ${secs(ms)}, output in $SCRATCH/build-${side}.log`]),
        `dist/web: ${bundles[side].files.join(', ')}; sha256 ${bundles[side].digest}`]);
    }

    // 4. R11 and R12
    const same = trying ? null : noViewChange(bundles.before, bundles.after);
    if (!trying) record.step('View change? (R11, R12)', [same ? same.message : `yes: the bundles differ (${bundles.before.digest.slice(0, 12)} → ${bundles.after.digest.slice(0, 12)})`,
      data.length ? `the diff touches what the data is made of: ${data.join(', ')}` : 'the data is made the same way on both sides']);
    if (same) throw same;
    if (data.length) throw new Stop('data-change', `the diff touches what the snapshot and layout are made of (${data.join(', ')}): both builds would no longer see the same data. Ask whether to film it anyway with a scene whose data doesn't depend on it`);

    // 5. The data
    const repoAt = resolveRev(top, scene.repoAt ?? base.sha);
    const cliTree = trees[sides[0]];
    const clone = join(scratch, 'repo'), claudeDir = join(scratch, 'claude-empty'), stateStart = join(scratch, 'state-start');
    mkdirSync(claudeDir);
    const cli = join(cliTree, 'dist', 'cli.js');
    const dataCmds = [...makeClone(main, repoAt.sha, clone), ...scanClone(cli, clone, scene.roots ?? ['src'], claudeDir)];
    const state = join(clone, '.git', 'commet');
    const layout = JSON.parse(readFileSync(join(state, 'layout.json'), 'utf8')) as import('../../../../src/core/contract/layout.js').LayoutV1;
    const setupCmds: string[] = [];
    const sceneStep = <T>(what: string, f: () => T): T => {
      try { return f(); } catch (e) { if (e instanceof Stop) throw e; throw new Stop('scene-unreachable', `scene ${scene.name} ${what}: ${e instanceof Error ? e.message : String(e)}`); }
    };
    sceneStep('setup', () => scene.setup?.({
      layout,
      cli: (...args) => {
        setupCmds.push(`node ${cli} ${args.join(' ')}`);
        const r = spawnSync(process.execPath, [cli, ...args], { cwd: clone, encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDir } });
        if (r.status !== 0) throw new Stop('scene-unreachable', `scene setup: commet ${args[0]} exited ${r.status}`, `${r.stdout}${r.stderr}`.trimEnd().split('\n').slice(-5));
        return r.stdout;
      },
    }));
    const sessions = snapshotSessions(state);
    cpSync(state, stateStart, { recursive: true });
    const files = git(clone, 'ls-files', '-z').split('\0').filter(Boolean);
    const filesJson = join(scratch, 'files.json');
    writeFileSync(filesJson, JSON.stringify(files));
    const drones = sceneStep('drones', () => scene.drones?.({ layout, files }).view.sessions.length ?? 0);
    record.step('The data (R12)', [...block([...dataCmds, ...setupCmds]),
      `clone at \`${repoAt.sha}\` ${repoAt.subject}; ${layout.planets.length} planets; roots ${JSON.stringify(layout.source.roots)}; ${files.length} files`,
      `snapshot sessions: ${sessions} (--no-ingest, CLAUDE_CONFIG_DIR empty); scripted drones: ${drones}`,
      'state every take starts from:', ...block(stateDigest(stateStart))]);
    if (sessions) throw new Stop('data-change', `the scan read ${sessions} agent sessions; it must read none (--no-ingest)`);

    // 6. Takes: two per build, each in its own process and browser
    const takes: Record<string, { dir: string; log: TakeLog; ms: number }> = {};
    const self = process.argv[1]!;
    for (const side of sides) {
      for (const n of trying ? [1] : [1, 2]) {
        const name = `${side}-${n}`, dir = join(scratch, 'takes', name);
        mkdirSync(dir, { recursive: true });
        const cfg: TakeConfig = { build: trees[side], clone, stateStart, filesJson, scene: scene.name, out: dir, claudeDir };
        writeFileSync(join(dir, 'take.json'), JSON.stringify(cfg, null, 1));
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [self, 'take', join(dir, 'take.json')], { encoding: 'utf8', maxBuffer: 1 << 26 });
        const ms = Date.now() - t0;
        writeFileSync(join(dir, 'take.out'), `${r.stdout}${r.stderr}`);
        if (r.status !== 0) {
          const stop = /^STOP ([a-z-]+): (.*)$/m.exec(r.stdout ?? '');
          record.step(`Take ${name}`, [`node <tools>/main.js take $SCRATCH/takes/${name}/take.json: exit ${r.status} after ${secs(ms)}`, ...block(`${r.stdout}${r.stderr}`.trimEnd().split('\n').slice(-12))]);
          throw new Stop((stop?.[1] as Stop['code'] | undefined) ?? 'scene-unreachable', stop?.[2] ?? `take ${name} failed (exit ${r.status})`);
        }
        const log = JSON.parse(readFileSync(join(dir, 'log.json'), 'utf8')) as TakeLog;
        takes[name] = { dir, log, ms };
        record.step(`Take ${name}`, [`node <tools>/main.js take $SCRATCH/takes/${name}/take.json: ${log.frames.length} frames in ${secs(ms)}; stills ${log.stills.map((s) => `${s.name} @ ${s.k}`).join(', ')}`,
          ...log.notes.map((x) => `note: ${x}`), ...(log.errors.length ? [`the page logged ${log.errors.length} error(s):`, ...block(log.errors.slice(0, 8))] : ['the page logged no errors']),
          ...(log.ticks.length ? [`ticks other than one callback: ${log.ticks.slice(0, 5).join('; ')}`] : [])]);
      }
    }

    // 7. Determinism (R2)
    let compared = 0;
    const det: string[] = [];
    for (const side of trying ? [] : SIDES) {
      const c = await compareTakes(takes[`${side}-1`]!.dir, takes[`${side}-2`]!.dir);
      compared += c.frames;
      det.push(`${side}: ${c.differing.length} of ${c.frames} frames differ (${c.differing.reduce((n, d) => n + d.px, 0)} px); logs ${c.logDiffers.length ? `differ in ${c.logDiffers.join(', ')}` : 'match'}`);
      const stop = takesStop(side, c);
      if (stop) { record.step('Determinism (R2)', [...det, ...stop.detail]); throw stop; }
    }
    if (!trying) record.step('Determinism (R2)', det);

    // 8. Privacy (R5): every take's page texts, responses, events and notes; the state files
    const items: Scanned[] = [];
    let texts = 0, responses = 0, tokenHits = 0;
    for (const [name, t] of Object.entries(takes)) {
      items.push(...takeTexts(name, t.log));
      texts += t.log.texts.length;
      responses += t.log.served.length;
      tokenHits += t.log.tokenHits ?? 0;
    }
    let stateFiles = 0;
    for (const dir of [stateStart, state]) {
      for (const f of STATE_FILES) {
        if (!existsSync(join(dir, f))) continue;
        const text = readFileSync(join(dir, f), 'utf8');
        items.push(...servedTexts({ path: `${dir === state ? 'state after the takes' : 'start state'}: ${f}`, body: text }).map((x) => ({ ...x, where: x.where.replace(/^GET /, '') })));
        stateFiles++;
      }
    }
    const hits = privacyHits(items, { literals: [...literals.map((l) => ({ name: `this machine's path (${l.name})`, value: l.value })), { name: 'the data clone path', value: clone }] });
    if (tokenHits) hits.push({ rule: 'the launch token', where: 'a take log', excerpt: `(${tokenHits} times, replaced before writing)` });
    record.step('Privacy (R5)', [`scanned ${texts} page texts, ${responses} API responses, ${Object.keys(takes).length} event streams and ${stateFiles} state files: ${hits.length} hits`,
      ...hits.map((h) => `- ${h.rule} in ${h.where}: ${h.excerpt}`)]);
    const leak = privacyStop(hits);
    if (leak) throw leak;

    mkdirSync(out);
    if (trying) return tryResult(takes['after-1']!, id, out, main, record, scratch, a.keep, say);

    // 9. Before → after: shots, images, GIF
    const caption = (side: 'before' | 'after', rev: Rev) => `${side.toUpperCase()} ${rev.short} ${rev.subject}`.slice(0, 96);
    const c = compose(id, { take: takes['before-1']!.dir, log: takes['before-1']!.log, caption: caption('before', base) }, { take: takes['after-1']!.dir, log: takes['after-1']!.log, caption: caption('after', head) }, scene.report, out);
    record.step('Before → after (R3, R4)', [
      ...c.shots.flatMap((s, i) => [`shot ${i + 1}, ${s.name} (frame ${s.k}): ${s.px} px changed${s.box ? `, box x ${s.box.x0}-${s.box.x1}, y ${s.box.y0}-${s.box.y1}` : ''}; ${s.where.map((w) => `${w.name} ${w.px}`).join(', ')}`,
        ...s.probes.map((p) => `  ${p.name}: ${p.before} before, ${p.after} after`)]),
      `GIF: ${c.gif.frames} frames stored, ${c.gif.colours} colours, ${c.gif.bytes} bytes; read back: ${c.gif.decoded} frames, its last frame as meant`,
      'images:', ...c.images.map((im) => `- ${relative(main, join(out, im.file))} (${im.bytes} bytes): ${im.note}`)]);
    const tooBig = c.images.filter((im) => im.bytes > GITHUB_IMAGE_LIMIT);

    // 10. The summary (R4)
    const sideOf = (rev: Rev, side: 'before' | 'after'): RunSummary['before'] => ({ sha: rev.sha, subject: rev.subject, bundle: bundles[side].files.find((f) => f.endsWith('.js')) ?? bundles[side].files[0]! });
    const summary = summaryText({
      scene: { name: scene.name, summary: scene.summary }, before: sideOf(base, 'before'), after: sideOf(head, 'after'),
      data: { repoAt: repoAt.sha, sessions, drones, reducedMotion: scene.reducedMotion ?? false, viewport: `${takes['before-1']!.log.width}x${takes['before-1']!.log.height}` },
      frames: takes['before-1']!.log.frames.length, determinism: { takes: 4, framesCompared: compared, differing: 0 },
      privacy: { texts, responses, files: stateFiles, hits: 0 }, shots: c.shots, images: c.images.filter((im) => !/-(before|after)\.png$/.test(im.file)), command,
    });
    const own = privacyHits([{ where: 'the summary', text: summary }], { literals });
    if (own.length) throw privacyStop(own)!;
    writeFileSync(join(out, 'summary.md'), summary);
    record.step('Summary for the PR description (R4)', [`${relative(main, join(out, 'summary.md'))}, privacy-checked (0 hits):`, '', summary,
      ...(tooBig.length ? [`Over GitHub's 10 MB image limit: ${tooBig.map((im) => im.file).join(', ')}; attach the pairs instead, or shorten the scene.`] : [])]);
    if (!a.keep) rmSync(scratch, { recursive: true, force: true });
    record.finish(`complete${a.keep ? '; scratch kept at $SCRATCH (--keep)' : '; scratch removed'}`);
    say(`DONE: ${c.shots.length} shot(s); summary ${relative(main, join(out, 'summary.md'))}; GIF ${relative(main, join(out, `${id}.gif`))} (${c.gif.bytes} bytes)`);
    process.stdout.write(`\n${summary}`);
    return 0;
  } catch (e) {
    const at = record.stepCount;
    if (e instanceof Stop) {
      const keepScratch = a.keep || e.code !== 'no-view-change';
      if (!keepScratch) rmSync(scratch, { recursive: true, force: true });
      record.step(`STOP: ${e.code}`, [e.message, ...e.detail.map((d) => `- ${d}`), '',
        keepScratch ? 'The scratch dir is kept for a look: $SCRATCH (remove it with `rm -rf` when done).' : 'Nothing was captured; the scratch dir (two builds) was removed.']);
      record.finish(`stopped (${e.code}) after step ${at}: ${e.message}`);
      say(`STOP ${e.code}: ${e.message}`);
      for (const d of e.detail) say(`  ${d}`);
      return 3;
    }
    const msg = e instanceof Error ? e.message : String(e);
    record.step('Internal error', block(redact(e instanceof Error ? (e.stack ?? msg) : msg, literals).split('\n').slice(0, 12)));
    record.finish(`incomplete: internal error after step ${at}: ${msg.split('\n')[0]}`);
    say(`ERROR: ${msg.split('\n')[0]}`);
    return 1;
  }
}

/** A try's result: each still's frame, boxes and probes, and the take's notes, for whoever is writing the scene. */
function tryResult(t: { dir: string; log: TakeLog }, id: string, out: string, main: string, record: RunRecord, scratch: string, keep: boolean, say: (l: string) => void): number {
  const lines: string[] = [];
  t.log.stills.forEach((s, i) => {
    const file = `${id}-still${i + 1}.png`;
    cpSync(join(t.dir, 'raw', `${String(s.k).padStart(4, '0')}.png`), join(out, file));
    const f = t.log.frames[s.k]!;
    const box = (b: { x: number; y: number; w: number; h: number }) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`;
    lines.push(`still ${i + 1}, ${s.name} (take frame ${s.k}, view frame ${f.frame}): ${relative(main, join(out, file))}`,
      `  heading: ${f.heading ?? '(review panel closed)'}; boxes: ${Object.entries(f.boxes).map(([k, b]) => `${k} ${box(b)}`).join(', ') || 'none'}`,
      ...Object.entries(f.probes).map(([k, v]) => `  ${k}: ${v}`));
  });
  lines.push(...t.log.notes.map((n) => `note: ${n}`), `${t.log.frames.length} frames; page errors: ${t.log.errors.length}`);
  record.step('Try: the stills', lines);
  if (!keep) rmSync(scratch, { recursive: true, force: true });
  record.finish(`complete (a try)${keep ? '; scratch kept at $SCRATCH (--keep)' : '; scratch removed'}`);
  for (const l of lines) say(l);
  return 0;
}

async function cliMain(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === 'scenes') {
    for (const s of Object.values(SCENES)) process.stdout.write(`${s.name}: ${s.summary}${s.reducedMotion ? ' (reduced motion)' : ''}\n`);
    return 0;
  }
  if (cmd === 'take' && rest.length === 1) {
    try {
      await takeMain(JSON.parse(readFileSync(rest[0]!, 'utf8')) as TakeConfig, SCENES);
      return 0;
    } catch (e) {
      if (e instanceof Stop) { process.stdout.write(`STOP ${e.code}: ${e.message}\n`); return 3; }
      throw e;
    }
  }
  if (cmd === 'run' || cmd === 'try') {
    const a = parseRun(rest, cmd);
    if (typeof a === 'string') { process.stderr.write(`vp: ${a}\n${USAGE}`); return 2; }
    return run(a);
  }
  process.stderr.write(USAGE);
  return 2;
}

cliMain(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e: unknown) => { process.stderr.write(`vp: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`); process.exitCode = 1; });
