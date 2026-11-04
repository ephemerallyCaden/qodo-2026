import { matchCommits, buildSessions, type MatchCommit } from '../attrib/match.js';
import { discoverClaude, mergeIntervals, parseClaude, redactPaths, searchOutside, type ClaudeIngest, type Interval } from '../attrib/parsers/claude.js';
import { byCodepoint, canonicalJson } from '../core/canonical-json.js';
import { lineHasher, sha256Hex } from '../core/hash.js';
import type { LogCounts } from '../core/summary.js';
import { hashLines } from '../core/lines.js';
import type { Commit, PersonId, SessionKey, SnapshotV01 } from '../core/snapshot/types.js';
import { isoUtc, minusMonths } from '../core/time.js';
import { VERSION } from '../core/version.js';
import { exclusionOf, RULES, RULESET_VERSION } from './exclusions.js';
import { gitRunner } from './git.js';
import { addedLines, headFiles, readRepo, windowCommits, type NumstatRow, type RawCommit } from './repo.js';

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
}

/** Aggregate log-reading counts for the summary; null when logs weren't read. */
export type LogStats = (LogCounts & { transcripts: number }) | null;

export interface ScanResult {
  snapshot: SnapshotV01;
  json: string;
  commonDir: string;
  logs: LogStats;
}

const DAY_MS = 86_400_000;
const within = (spans: Interval[], t: number) => spans.some((s) => t >= s.from && t <= s.to);
const personId = (email: string): PersonId => `p_${sha256Hex(email).slice(0, 12)}`;
const excluded = (path: string, row: NumstatRow | undefined) => exclusionOf(path, row?.binary) !== null;

function mergeIngest(into: ClaudeIngest, more: ClaudeIngest): void {
  into.events.push(...more.events);
  for (const [k, v] of more.sessions) if (!into.sessions.has(k)) into.sessions.set(k, v);
  into.ranCommits.push(...more.ranCommits);
  into.ranWindows.push(...more.ranWindows);
  into.unreadable.push(...more.unreadable);
  into.partial.push(...more.partial);
  into.dropped += more.dropped;
}

export async function scan(o: ScanOptions): Promise<ScanResult> {
  const git = gitRunner(o.repoDir);
  const repo = await readRepo(git);
  const sinceMs = minusMonths(repo.headMs, o.windowMonths);
  const since = isoUtc(sinceMs);

  const counts: Record<string, number> = {};
  const files: SnapshotV01['files'] = [];
  // One comparison for matching, people and selfPersonIds: all use the mailmapped, lowercased email.
  const isSelf = (c: RawCommit) => repo.selfEmail !== null && c.email === repo.selfEmail;
  const rawP = windowCommits(git, repo.head, since);
  // Commits that could come out human bound which outside sessions discovery searches first.
  const selfTimes = rawP.then((cs) => cs.filter((c) => isSelf(c) && !c.isMerge).map((c) => c.dateMs));
  // A git failure surfaces once, through rawP below; discovery may never await this copy, so it
  // must not reject unhandled and crash the CLI past its error path (Qodo PR10 #8).
  selfTimes.catch(() => undefined);
  const [head, raw, found] = await Promise.all([
    headFiles(git, repo.head, repo.emptyTree),
    rawP,
    o.ingest ? discoverClaude(o.claudeProjectsDir, repo.commonDir, repo.worktreeRoots, o.maxTranscriptBytes, selfTimes) : null,
  ]);
  for (const [path, row] of head) {
    const rule = exclusionOf(path, row.binary);
    if (rule) counts[rule] = (counts[rule] ?? 0) + 1;
    else files.push({ id: `f_${sha256Hex(path).slice(0, 12)}`, path, loc: row.added });
  }
  files.sort((a, b) => byCodepoint(a.path, b.path));

  const hash = lineHasher(o.keyFor(repo.commonDir));
  const fromMs = found?.coverage[0]?.from;
  const knownPaths = new Set([...head.keys(), ...raw.flatMap((c) => [...c.files.keys()])]);
  // The patch log runs while the transcripts parse; it starts no earlier than the window.
  const [patches, ingest] = await Promise.all([
    fromMs !== undefined && fromMs <= repo.headMs ? addedLines(git, repo.head, isoUtc(Math.max(sinceMs, fromMs - DAY_MS)))
      : new Map<string, Map<string, string[]>>(),
    found ? parseClaude(found, knownPaths, hash) : null,
  ]);

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
        ranBy: ranBy.get(c.sha) ?? new Set(), ranByCommand: ranByCommand.get(c.sha) ?? new Set() };
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

  const people = new Map<string, SnapshotV01['people'][number]>();
  const commits: Commit[] = raw.map((c, seq) => {
    const author = personId(c.email);
    if (!people.has(author)) people.set(author, { id: author, displayName: c.name, isSelf: isSelf(c) });
    const r = results.get(c.sha)!;
    const rows: Commit['files'] = [...c.files].filter(([p, row]) => !excluded(p, row))
      .sort((a, b) => byCodepoint(a[0], b[0]))
      .map(([p, row]) => [p, row.added, row.removed, r.agentLines.get(p) ?? 0]);
    return { seq, sha: c.sha, date: isoUtc(c.dateMs), authorDate: isoUtc(c.authorMs), author,
      subject: redactPaths(c.subject), files: rows, attribution: r.attribution };
  });

  const snapshot: SnapshotV01 = {
    schemaVersion: '0.1',
    generator: { name: 'commet', version: VERSION },
    repo: { repoId: repo.repoId, head: repo.head, headDate: isoUtc(repo.headMs), branch: repo.branch,
      selfPersonIds: repo.selfEmail ? [personId(repo.selfEmail)] : [] },
    window: { months: o.windowMonths, since, until: isoUtc(repo.headMs), firstParent: true },
    exclusions: { rulesetVersion: RULESET_VERSION, rules: RULES, counts },
    coverage: (found?.coverage ?? []).map((s) => ({ tool: 'claude-code', from: isoUtc(s.from), to: isoUtc(s.to) })),
    files,
    people: [...people.values()].sort((a, b) => byCodepoint(a.id, b.id)),
    commits,
    sessions: buildSessions(ingest?.sessions.values() ?? [], raw.map((c) => c.sha), results),
  };
  const unreadable = ingest?.unreadable.length ?? 0;
  const logs = found && { transcripts: found.transcripts.length - unreadable, tooLarge: found.stats.tooLarge,
    unavailable: found.stats.unavailable + unreadable, dropped: ingest?.dropped ?? 0, unattributed: found.stats.unattributed };
  return { snapshot, json: canonicalJson(snapshot), commonDir: repo.commonDir, logs };
}
