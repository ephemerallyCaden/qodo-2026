import { matchCommits, buildSessions, type MatchCommit } from '../attrib/match.js';
import { discoverClaude, parseClaude, type Interval } from '../attrib/parsers/claude.js';
import { byCodepoint, canonicalJson } from '../core/canonical-json.js';
import { lineHasher, sha256Hex } from '../core/hash.js';
import { hashLines } from '../core/lines.js';
import type { Commit, PersonId, SessionKey, SnapshotV01 } from '../core/snapshot/types.js';
import { isoUtc, minusMonths } from '../core/time.js';
import { VERSION } from '../core/version.js';
import { exclusionOf, RULES, RULESET_VERSION } from './exclusions.js';
import { gitRunner } from './git.js';
import { addedLines, headFiles, readRepo, windowCommits, type NumstatRow } from './repo.js';

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
export type LogStats = { transcripts: number; tooLarge: number; unavailable: number } | null;

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

export async function scan(o: ScanOptions): Promise<ScanResult> {
  const git = gitRunner(o.repoDir);
  const repo = await readRepo(git);
  const sinceMs = minusMonths(repo.headMs, o.windowMonths);
  const since = isoUtc(sinceMs);

  const counts: Record<string, number> = {};
  const files: SnapshotV01['files'] = [];
  const [head, raw, found] = await Promise.all([
    headFiles(git, repo.head, repo.emptyTree),
    windowCommits(git, repo.head, since),
    o.ingest ? discoverClaude(o.claudeProjectsDir, repo.commonDir, repo.worktreeRoots, o.maxTranscriptBytes) : null,
  ]);
  for (const [path, row] of head) {
    const rule = exclusionOf(path, row.binary);
    if (rule) counts[rule] = (counts[rule] ?? 0) + 1;
    else files.push({ id: `f_${sha256Hex(path).slice(0, 12)}`, path, loc: row.added });
  }
  files.sort((a, b) => byCodepoint(a.path, b.path));

  const hash = lineHasher(o.keyFor(repo.commonDir));
  const coverage = found?.coverage ?? [];
  const fromMs = coverage[0]?.from;
  const knownPaths = new Set([...head.keys(), ...raw.flatMap((c) => [...c.files.keys()])]);
  // The patch log runs while the transcripts parse; it starts no earlier than the window.
  const [patches, ingest] = await Promise.all([
    fromMs !== undefined && fromMs <= repo.headMs ? addedLines(git, repo.head, isoUtc(Math.max(sinceMs, fromMs - DAY_MS)))
      : new Map<string, Map<string, string[]>>(),
    found ? parseClaude(found, knownPaths, hash) : null,
  ]);

  const ranBy = new Map<string, Set<SessionKey>>();
  for (const { sessionKey, sha } of ingest?.ranCommits ?? []) {
    const hit = raw.filter((c) => c.sha.startsWith(sha));
    if (hit.length === 1) ranBy.set(hit[0]!.sha, (ranBy.get(hit[0]!.sha) ?? new Set()).add(sessionKey));
  }
  const matchInput: MatchCommit[] = raw.map((c) => {
    const added = new Map<string, string[]>();
    for (const [path, lines] of patches.get(c.sha) ?? []) {
      if (!excluded(path, c.files.get(path))) added.set(path, hashLines(lines, hash));
    }
    return { sha: c.sha, dateMs: c.dateMs, isSelf: c.email === repo.selfEmail,
      covered: within(coverage, c.dateMs) && !within(found?.blind ?? [], c.dateMs), added, ranBy: ranBy.get(c.sha) ?? new Set() };
  });
  const results = matchCommits(matchInput, ingest?.events ?? []);

  const people = new Map<string, SnapshotV01['people'][number]>();
  const commits: Commit[] = raw.map((c, seq) => {
    const author = personId(c.email);
    if (!people.has(author)) people.set(author, { id: author, displayName: c.name, isSelf: c.email === repo.selfEmail });
    const r = results.get(c.sha)!;
    const rows: Commit['files'] = [...c.files].filter(([p, row]) => !excluded(p, row))
      .sort((a, b) => byCodepoint(a[0], b[0]))
      .map(([p, row]) => [p, row.added, row.removed, r.agentLines.get(p) ?? 0]);
    return { seq, sha: c.sha, date: isoUtc(c.dateMs), authorDate: isoUtc(c.authorMs), author,
      subject: c.subject, files: rows, attribution: r.attribution };
  });

  const snapshot: SnapshotV01 = {
    schemaVersion: '0.1',
    generator: { name: 'commet', version: VERSION },
    repo: { repoId: repo.repoId, head: repo.head, headDate: isoUtc(repo.headMs), branch: repo.branch,
      selfPersonIds: repo.selfEmail ? [personId(repo.selfEmail)] : [] },
    window: { months: o.windowMonths, since, until: isoUtc(repo.headMs), firstParent: true },
    exclusions: { rulesetVersion: RULESET_VERSION, rules: RULES, counts },
    coverage: coverage.map((s) => ({ tool: 'claude-code', from: isoUtc(s.from), to: isoUtc(s.to) })),
    files,
    people: [...people.values()].sort((a, b) => byCodepoint(a.id, b.id)),
    commits,
    sessions: buildSessions(ingest?.sessions.values() ?? [], raw.map((c) => c.sha), results),
  };
  const logs = found && { transcripts: found.transcripts.length, ...found.stats };
  return { snapshot, json: canonicalJson(snapshot), commonDir: repo.commonDir, logs };
}
