import { matchCommits, buildSessions, type MatchCommit } from '../attrib/match.js';
import { discoverClaude, mergeIntervals, parseClaude, redactPaths, searchOutside, type ClaudeIngest, type Interval } from '../attrib/parsers/claude.js';
import { byCodepoint, canonicalJson } from '../core/canonical-json.js';
import { coChangeOf } from '../core/cochange.js';
import { crewOf } from '../core/crew.js';
import { buildDebris, planDebris } from '../core/debris.js';
import type { LayoutV1 } from '../core/contract/layout.js';
import { CommetError, EXIT } from '../core/errors.js';
import { fogBase, unrowedChanges } from '../core/fog/index.js';
import { fileId, lineHasher } from '../core/hash.js';
import type { LogCounts } from '../core/summary.js';
import { hashLines } from '../core/lines.js';
import { layoutReport, type LayoutNotes } from '../core/layout/index.js';
import { applyCache, serializeCache, tallyFindings, type QodoCache } from '../core/qodo.js';
import { pathHistory } from '../core/renames.js';
import type { Commit, FileQodo, QodoReason, QodoSource, SessionKey, SnapshotV02 } from '../core/snapshot/types.js';
import { foldersOf, parseRoots } from '../core/roots.js';
import {
  binaryNames, buildLineage, debtCounted, dirsAtHead, matchTests, rootBirthInfo, structureHistory, topBirthInfo, zeroDebt,
} from '../core/structure.js';
import { isoUtc, minusMonths } from '../core/time.js';
import { VERSION } from '../core/version.js';
import { exclusionOf, RULES, RULESET_VERSION } from './exclusions.js';
import { gitRunner, tryGit, type Git } from './git.js';
import { fetchQodo, readQodoCache } from './qodo.js';
import { readDebris, readDebrisGit } from './debris.js';
import { addedLines, headFiles, PatchLines, readRepo, windowCommits, type NumstatRow, type RawCommit } from './repo.js';
import { debtCounts, lineageLog, mergeSides, unmergedBranches } from './structure.js';

export interface ScanOptions {
  repoDir: string;
  windowMonths: number;
  /** Read agent logs. Without them every commit is `unknown`. */
  ingest: boolean;
  /** Claude Code projects dir (normally ~/.claude/projects). */
  claudeProjectsDir: string;
  /** Returns the HMAC key for the repo's state dir (tests inject a fixed key). */
  keyFor: (commonDir: string) => Uint8Array;
  /** Transcripts larger than this are skipped (their span becomes blind). */
  maxTranscriptBytes?: number;
  /**
   * Qodo findings (#17). `fetch` (the --with-qodo opt-in) reads them over the network and returns
   * the counts for the caller to cache; otherwise only the cache in `stateDir` is read. Absent:
   * neither (files[].qodo null).
   */
  qodo?: { fetch: boolean; stateDir: (commonDir: string) => string; timeoutMs?: number };
  /**
   * Content roots (#71), chosen once HEAD's files are known: the CLI reads the saved answer, or
   * guesses and asks. The answer only shapes layout.json, never the snapshot, and is checked again
   * here (a root that isn't a folder at HEAD is a usage error). Absent: none (#18's mapping).
   */
  roots?: (head: HeadTree) => Promise<string[]>;
}

/**
 * HEAD as content roots are chosen from (#71): the scanned files with their LOC, and every folder holding one,
 * plus the repo's id, so the last scan's roots are kept only from a layout of this repository (#73).
 */
export interface HeadTree { commonDir: string; repoId: string; files: { path: string; loc: number }[]; folders: ReadonlySet<string> }

/** Aggregate log-reading counts for the summary; null when logs weren't read. */
export type LogStats = (LogCounts & { transcripts: number }) | null;

export interface ScanResult {
  snapshot: SnapshotV02;
  json: string;
  /** layout() of the snapshot (#18), its canonical JSON, and what it placed on weaker evidence. */
  layout: LayoutV1;
  layoutJson: string;
  layoutNotes: LayoutNotes;
  commonDir: string;
  logs: LogStats;
  /** Counts-only cache to save after a successful fetch (the caller writes it); null otherwise. */
  qodoCache: string | null;
}

const DAY_MS = 86_400_000;
const within = (spans: Interval[], t: number) => spans.some((s) => t >= s.from && t <= s.to);
const excluded = (path: string, row: NumstatRow | undefined) => exclusionOf(path, row?.binary) !== null;

/**
 * Adds a later parse (the outside-transcript pass) to the first. A session seen in both is merged, never
 * replaced: its files, span and lines from either parse all count, so its per-file edit counts and its
 * timeline cover every edit (#148, Qodo PR #167 121022e1). An edit event both parses read (same session
 * and event id) counts once, and so do its lines (Qodo PR #167 b7385767). Its first parse's metadata
 * (branch, model, version) wins.
 */
export function mergeIngest(into: ClaudeIngest, more: ClaudeIngest): void {
  const seen = new Set(into.events.map((e) => `${e.sessionKey}\0${e.eventId}`));
  /** Per session, the lines of the edits `more` read again: already in `into`'s totals. */
  const reread = new Map<string, { added: number; removed: number }>();
  for (const e of more.events) {
    const id = `${e.sessionKey}\0${e.eventId}`;
    if (seen.has(id)) {
      const r = reread.get(e.sessionKey) ?? { added: 0, removed: 0 };
      r.added += e.added;
      r.removed += e.removed;
      reread.set(e.sessionKey, r);
      continue;
    }
    seen.add(id);
    into.events.push(e);
  }
  for (const [k, v] of more.sessions) {
    const had = into.sessions.get(k);
    if (!had) { into.sessions.set(k, v); continue; }
    const again = reread.get(k) ?? { added: 0, removed: 0 };
    for (const path of v.files) had.files.add(path);
    had.firstTs = Math.min(had.firstTs, v.firstTs);
    had.lastTs = Math.max(had.lastTs, v.lastTs);
    had.linesAdded += v.linesAdded - again.added;
    had.linesRemoved += v.linesRemoved - again.removed;
    had.branch ??= v.branch;
    had.model ??= v.model;
    had.toolVersion ??= v.toolVersion;
    had.agentType ??= v.agentType;
  }
  into.ranCommits.push(...more.ranCommits);
  into.ranWindows.push(...more.ranWindows);
  into.unreadable.push(...more.unreadable);
  into.partial.push(...more.partial);
  into.dropped += more.dropped;
}

export async function scan(o: ScanOptions): Promise<ScanResult> {
  // A scan that fails part-way stops any Qodo fetch still running, so no gh or qodo child outlives it
  // or keeps the CLI from exiting (PR #35 r1). After a scan that succeeds, the fetch is already done.
  const stop = new AbortController();
  try {
    return await scanUntil(o, stop.signal);
  } finally {
    stop.abort();
  }
}

async function scanUntil(o: ScanOptions, signal: AbortSignal): Promise<ScanResult> {
  const git = gitRunner(o.repoDir);
  const repo = await readRepo(git);
  const sinceMs = minusMonths(repo.headMs, o.windowMonths);
  const since = isoUtc(sinceMs);

  const counts: Record<string, number> = {};
  // One comparison for matching, people and selfPersonIds: all use the mailmapped, lowercased emails, yours
  // being `user.email` and `commet.selfEmail` (#207 C9). A name alias never makes a commit yours here, so it
  // never makes one human (Rule 1); it only merges people in the crew.
  const mine = new Set(repo.selfEmails);
  const isSelf = (c: RawCommit) => mine.has(c.email);
  const rawP = windowCommits(git, repo.head, since);
  // Only with the opt-in; it runs alongside the git reads and never rejects.
  const qodoP = o.qodo?.fetch ? fetchQodo(o.repoDir, o.qodo.timeoutMs, signal) : null;
  // Commits that could come out human bound which outside sessions discovery searches first.
  const selfTimes = rawP.then((cs) => cs.filter((c) => isSelf(c) && !c.isMerge).map((c) => c.dateMs));
  // A git failure surfaces once, through rawP below; discovery may never await this copy, so it
  // must not reject unhandled and crash the CLI past its error path (Qodo PR10 #8).
  selfTimes.catch(() => undefined);
  const headRef = repo.branch === 'HEAD' ? '' : `refs/heads/${repo.branch}`;
  const [head, raw, found, history, debt, rawBranches, debrisGit] = await Promise.all([
    headFiles(git, repo.head, repo.emptyTree),
    rawP,
    o.ingest ? discoverClaude(o.claudeProjectsDir, repo.commonDir, repo.worktreeRoots, o.maxTranscriptBytes, selfTimes) : null,
    lineageLog(git, repo.head),
    debtCounts(git, repo.head),
    unmergedBranches(git, repo.head, headRef),
    readDebrisGit(git, repo.head, repo.headMs / 1000, headRef, repo.worktrees),
  ]);
  const kept: [string, NumstatRow][] = [];
  for (const [path, row] of head) {
    const rule = exclusionOf(path, row.binary);
    if (rule) counts[rule] = (counts[rule] ?? 0) + 1;
    else kept.push([path, row]);
  }
  kept.sort((a, b) => byCodepoint(a[0], b[0]));
  const headPaths = kept.map(([p]) => p);
  // Binary-ness isn't in the name-status log: a binary at HEAD is excluded all along, under its
  // earlier names too, so it neither blocks nor dilutes its folder's move (Qodo local r1 #1, r4 #1).
  const binary = binaryNames(history, [...head].filter(([, row]) => row.binary).map(([p]) => p));
  const lineageExcluded = (p: string) => binary.has(p) || excluded(p, undefined);
  const folders = foldersOf(headPaths);
  const asked = o.roots ? parseRoots(await o.roots({ commonDir: repo.commonDir, repoId: repo.repoId, files: kept.map(([path, row]) => ({ path, loc: row.added })), folders }),
    folders) : { roots: [] };
  if ('error' in asked) throw new CommetError(`content roots: ${asked.error}`, EXIT.usage);
  const lineage = buildLineage(history, lineageExcluded, asked.roots);
  // Folders born in a merge are looked through to the merged branch's own commits (#18 AC8), for
  // content planets too (#71).
  const sides = await mergeSides(git, history, lineage, lineageExcluded);
  const births = topBirthInfo(lineage, sides.tops);
  const { targets: testOf, bulkSkipped } = matchTests(headPaths, lineage.paths);
  const structure = dirsAtHead(lineage, headPaths, births);
  const dirIdOf = new Map(structure.dirs.map((d) => [d.path, d.id]));
  const topDirs = new Map(structure.dirs.filter((d) => d.depth === 1).map((d) => [d.path, d.id]));
  // A branch's rings are the folders it touches that exist at HEAD as top-level folders.
  const branches: SnapshotV02['branches'] = rawBranches.branches.map(({ tops, ...b }) => ({ ...b,
    dirIds: [...tops].flatMap((t) => topDirs.get(t) ?? []).sort(byCodepoint) }));

  const hash = lineHasher(o.keyFor(repo.commonDir));
  const fromMs = found?.coverage[0]?.from;
  const knownPaths = new Set([...head.keys(), ...raw.flatMap((c) => [...c.files.keys()])]);
  // The patch log runs while the transcripts parse (and any Qodo fetch finishes); it starts no
  // earlier than the window, so every record it holds is a window commit's.
  // R13: the refs that could be debris, read while the transcripts parse.
  const debrisPlan = planDebris(debrisGit, undefined, new Map([...rawBranches.work].map(([ref, w]) => [ref, w.aheadCount])));
  const [patches, ingest, qodo, debrisReads] = await Promise.all([
    fromMs !== undefined && fromMs <= repo.headMs
      ? addedLines(git, repo.head, isoUtc(Math.max(sinceMs, fromMs - DAY_MS)), new Set(raw.map((c) => c.sha)))
      : new PatchLines(),
    found ? parseClaude(found, knownPaths, hash) : null,
    readQodo(o, git, repo.commonDir, repo.head, headPaths, qodoP),
    readDebris(git, debrisPlan, rawBranches.work, repo.head, repo.emptyTree),
  ]);
  const files: SnapshotV02['files'] = kept.map(([path, row]) => {
    const target = testOf.get(path);
    // Only source code carries debt (AC13); a file that isn't source counts 0 even if unread.
    const counted = debtCounted(path) ? debt?.get(path) ?? (debt ? zeroDebt() : null) : zeroDebt();
    return { id: fileId(path), path, loc: row.added, debt: counted,
      isTest: target !== undefined, testOf: !target ? null : target.dir ? dirIdOf.get(target.path)! : fileId(target.path),
      qodo: qodo.perFile.get(path) ?? null };
  });

  // Re-run after the safety net below adds outside transcripts.
  const attribute = () => {
    const coverage = found?.coverage ?? [];
    const blind = mergeIntervals([...(found?.blind ?? []), ...(ingest?.unreadable ?? [])]);
    const partial = mergeIntervals(ingest?.partial ?? []);
    const ranBy = new Map<string, Set<SessionKey>>();
    for (const { sessionKey, sha } of ingest?.ranCommits ?? []) {
      const hit = raw.filter((c) => c.sha.startsWith(sha));
      if (hit.length === 1) ranBy.set(hit[0]!.sha, (ranBy.get(hit[0]!.sha) ?? new Set()).add(sessionKey));
    }
    // Commits made while a session's commit-creating git command ran, SHA or no SHA.
    const ranByCommand = new Map<string, Set<SessionKey>>();
    for (const w of ingest?.ranWindows ?? []) {
      for (const c of raw) {
        if (c.dateMs >= w.from && c.dateMs <= w.to) ranByCommand.set(c.sha, (ranByCommand.get(c.sha) ?? new Set()).add(w.sessionKey));
      }
    }
    const matchInput: MatchCommit[] = raw.map((c) => {
      const added = new Map<string, string[]>();
      for (const [path, lines] of patches.get(c.sha) ?? []) {
        if (!excluded(path, c.files.get(path))) added.set(path, hashLines(lines, hash));
      }
      return { sha: c.sha, dateMs: c.dateMs, isSelf: isSelf(c), isMerge: c.isMerge,
        covered: within(coverage, c.dateMs) && !within(blind, c.dateMs), partial: within(partial, c.dateMs), added,
        patchIncomplete: patches.incomplete.has(c.sha), ranBy: ranBy.get(c.sha) ?? new Set(), ranByCommand: ranByCommand.get(c.sha) ?? new Set() };
    });
    return matchCommits(matchInput, ingest?.events ?? []);
  };
  let results = attribute();
  // Safety net (Qodo PR8 #7): an outside session's edits can match a commit made after it ended,
  // so while a commit comes out human, every outside session started by then is searched too.
  for (let searchedTo = -Infinity; found && ingest;) {
    const latest = Math.max(...raw.filter((c) => results.get(c.sha)!.attribution.class === 'human').map((c) => c.dateMs));
    if (!(latest > searchedTo)) break;
    searchedTo = latest;
    const added = await searchOutside(found, (x) => x.start <= latest + 1000, o.maxTranscriptBytes);
    if (added.length > 0) mergeIngest(ingest, await parseClaude({ ...found, transcripts: added }, knownPaths, hash));
    results = attribute();
  }

  // #207: people with aliases merged and bots flagged; every commit names its merged person.
  const crew = crewOf(raw.map((c) => ({ name: c.name, email: c.email })), repo.selfEmails);
  const commits: Commit[] = raw.map((c) => {
    const seq = lineage.seqOf.get(c.sha);
    if (seq === undefined) throw new Error('window commit missing from the first-parent lineage');
    const author = crew.personOf.get(c.email)!;
    const r = results.get(c.sha)!;
    const rows: Commit['files'] = [...c.files].filter(([p, row]) => !excluded(p, row))
      .sort((a, b) => byCodepoint(a[0], b[0]))
      .map(([p, row]) => [p, row.added, row.removed, r.agentLines.get(p) ?? 0]);
    return { seq, sha: c.sha, date: isoUtc(c.dateMs), authorDate: isoUtc(c.authorMs), author,
      subject: redactPaths(c.subject), files: rows, attribution: r.attribution };
  });

  const snapshot: SnapshotV02 = {
    schemaVersion: '0.2',
    generator: { name: 'commet', version: VERSION },
    repo: { repoId: repo.repoId, head: repo.head, headDate: isoUtc(repo.headMs), branch: repo.branch,
      selfPersonIds: crew.selfPersonIds },
    window: { months: o.windowMonths, since, until: isoUtc(repo.headMs), firstParent: true },
    exclusions: { rulesetVersion: RULESET_VERSION, rules: RULES, counts },
    coverage: (found?.coverage ?? []).map((s) => ({ tool: 'claude-code', from: isoUtc(s.from), to: isoUtc(s.to) })),
    dirs: structure.dirs,
    files,
    branches,
    unreadable: { dirs: structure.unreadable, files: files.filter((f) => f.debt === null).length, branches: rawBranches.unreadable,
      bulkCommits: bulkSkipped },
    qodo: qodo.source,
    people: crew.people.map((p) => ({ ...p, displayName: redactPaths(p.displayName) })),
    commits,
    sessions: buildSessions(ingest?.sessions.values() ?? [], raw.map((c) => c.sha), results,
      new Map(files.map((f) => [f.path, f.id])), ingest?.events ?? []),
  };
  // #211: co-change by file at HEAD, renames followed through the same path history the fog uses.
  const paths = pathHistory(history, 0, lineageExcluded);
  snapshot.cochange = coChangeOf(fogBase(snapshot, { ...paths, unrowed: unrowedChanges(snapshot, history, 0, lineageExcluded) }));
  // R13: stale branches and worktrees, classified against HEAD's date and the sessions on them.
  snapshot.debris = buildDebris(debrisPlan, debrisReads, { headCt: repo.headMs / 1000, sessions: snapshot.sessions,
    fileIds: new Map(files.map((f) => [f.path, f.id])), selfEmails: mine });
  const unreadable = ingest?.unreadable.length ?? 0;
  const logs = found && { transcripts: found.transcripts.length - unreadable, tooLarge: found.stats.tooLarge,
    unavailable: found.stats.unavailable + unreadable, dropped: ingest?.dropped ?? 0, unattributed: found.stats.unattributed,
    incompletePatches: patches.incomplete.size };
  const placed = layoutReport(snapshot, structureHistory(lineage, births, paths,
    rootBirthInfo(lineage, sides.children)));
  return { snapshot, json: canonicalJson(snapshot), layout: placed.layout, layoutJson: canonicalJson(placed.layout), layoutNotes: placed.notes,
    commonDir: repo.commonDir, logs,
    qodoCache: qodo.fetched ? serializeCache(qodo.fetched) : null };
}

/**
 * files[].qodo and its source: fetched with the opt-in (`fetched` is then the cache to save), else
 * from the cache. A failed fetch is unknown, never 0 (Rule 1), and leaves an earlier cache as it was.
 */
async function readQodo(o: ScanOptions, git: Git, commonDir: string, head: string, headPaths: string[],
  fetching: ReturnType<typeof fetchQodo> | null):
  Promise<{ perFile: Map<string, FileQodo | null>; source: QodoSource; fetched: QodoCache | null }> {
  const none = { perFile: new Map<string, FileQodo | null>(), fetched: null };
  if (!o.qodo) return { ...none, source: { status: 'none' } };
  let cache: QodoCache | null | QodoReason;
  if (fetching) {
    const read = await fetching;
    // Only paths at HEAD are kept, so no path Qodo or gh sent that isn't in the repo reaches disk.
    cache = typeof read === 'string' ? read : tallyFindings(read, new Set(headPaths), head);
  } else cache = readQodoCache(o.qodo.stateDir(commonDir));
  if (cache === null) return { ...none, source: { status: 'none' } };
  if (typeof cache === 'string') return { ...none, source: { status: 'unavailable', reason: cache } };
  if (fetching) return { ...applyCache(cache, headPaths), fetched: cache };
  // A file changed since the cached HEAD may hold findings from PRs the cache never saw, and a new or
  // re-added one is another file: no evidence either way (Qodo local r2 #1, PR #35 r1). Both ends and
  // every commit between are compared, so a file deleted and re-added, or changed on a line HEAD has
  // since left, counts as changed too.
  let changedSince = new Set<string>();
  if (cache.head !== head) {
    const opts = ['--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z'];
    const [ends, between] = await Promise.all([tryGit(git, ['diff', ...opts, cache.head, head]),
      tryGit(git, ['log', ...opts, '--diff-merges=first-parent', '--format=', `${cache.head}..${head}`])]);
    if (ends === null || between === null) return { ...none, source: { status: 'unavailable', reason: 'cache HEAD not found' } };
    changedSince = new Set(`${ends}\0${between}`.split('\0'));
  }
  return { ...applyCache(cache, headPaths, changedSince), fetched: null };
}
