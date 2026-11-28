// Space debris (R13): the repo's stale work, from local git only. Pure. The scan lists the refs and worktrees
// (src/scan/debris.ts), planDebris() picks the ones that could be debris and what to read about each, the scan
// reads them, and buildDebris() classifies them into the snapshot's `debris`. The server gives debrisView() and
// debrisDetail() the snapshot and the fog's file-to-planet map (FogBase.home), so debris, drones and fog place a
// file on the same body. "Now" is HEAD's committer date, never the clock (Rule 3). Nothing here groups, counts or
// ranks debris by person (Rule 6); a creator is one item's, on its own panel.
import { byCodepoint } from './canonical-json.js';
import {
  DEBRIS, DEBRIS_WARNINGS, debrisAgeStep, type DebrisDetail, type DebrisHome, type DebrisSession, type DebrisView, type DebrisWarning,
} from './contract/debris.js';
import { isAgentAuthor } from './crew.js';
import { homeOfFiles } from './drones.js';
import { sha256Hex, u32 } from './hash.js';
import type { Debris, DebrisId, DebrisItem, DirId, FileId, IsoUtc, Session, SnapshotV02 } from './snapshot/types.js';
import { isoUtc } from './time.js';

const DAY_S = 86_400;
const HEADS = 'refs/heads/';
const REMOTES = 'refs/remotes/';

/** An item's id: `'x_' + sha256(key)[:12]`, its key a full refname or `HEAD <sha>` (a detached worktree). */
export const debrisId = (key: string): DebrisId => `x_${sha256Hex(key).slice(0, 12)}`;

/** Whole days from the tip's committer time to HEAD's (seconds), never below 0 (a tip newer than HEAD). */
export const debrisAge = (headCt: number, tipCt: number): number => Math.max(0, Math.floor((headCt - tipCt) / DAY_S));

/** One ref as `for-each-ref` lists it. `upstream*` are empty without one; `merged`: an ancestor of HEAD (`--merged`). */
export interface RefRow {
  ref: string;
  symref: string;
  sha: string;
  /** Committer time, in seconds. */
  ct: number;
  upstream: string;
  /** `%(upstream:remotename)` and `%(upstream:remoteref)`: where the upstream lives on its remote. */
  upstreamRemote: string;
  upstreamRemoteRef: string;
  merged: boolean;
}

/**
 * One linked worktree from `git worktree list --porcelain -z` (never the main one). `folder` is its path's last
 * component when no other worktree's is the same, else null; the path itself is never kept.
 */
export interface WorktreeRow { head: string; ref: string | null; locked: boolean; prunable: boolean; folder: string | null }

/** A configured remote: `standard` when its only fetch refspec is `+refs/heads/*:refs/remotes/<name>/*`. */
export interface RemoteRow { name: string; standard: boolean }

/** The git state planDebris() works from. `headRef` is `refs/heads/<branch>`, or '' when detached. */
export interface DebrisGit {
  head: string;
  /** HEAD's committer time, in seconds. */
  headCt: number;
  headRef: string;
  refs: RefRow[];
  remotes: RemoteRow[];
  /** `init.defaultBranch`, when set. */
  initDefault: string | null;
  worktrees: WorktreeRow[];
}

/** A local branch with its remote-tracking copies, or a remote-only ref: one possible item. */
export interface DebrisGroup {
  /** Its first ref's full name (the local branch's, when there is one): the item's id key. */
  key: string;
  members: RefRow[];
  /** The most advanced tip: most commits ahead (unknown before the reads, so: unmerged first), then newer, then local. */
  best: RefRow;
  /** Every member is an ancestor of HEAD. */
  merged: boolean;
  ageDays: number;
  /** A local branch whose upstream is set but isn't among the refs (`[gone]`): `git cherry` may find it merged. */
  upstreamGone: boolean;
  remotes: { name: string; ref: string }[];
}

export interface DebrisPlan {
  settings: Debris['settings'];
  defaults: string[];
  /** Groups old enough to be debris, by key: merged ones, and unmerged ones (their commits, and `git cherry` when gone). */
  groups: DebrisGroup[];
  /** Every linked worktree that isn't bare: on a debris branch it folds in, and a prunable one is debris itself. */
  worktrees: WorktreeRow[];
}

/** The short name of a ref: `x` for `refs/heads/x`, `origin/x` for `refs/remotes/origin/x`. */
export const shortRef = (ref: string): string =>
  ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref.startsWith(REMOTES) ? ref.slice(REMOTES.length) : ref;

/** A remote-tracking ref's remote and branch: the longest configured remote it starts with, else its first segment. */
function splitRemote(ref: string, remotes: readonly RemoteRow[]): { remote: RemoteRow | null; name: string; branch: string } {
  const short = shortRef(ref);
  const known = remotes.filter((r) => short.startsWith(`${r.name}/`)).sort((a, b) => b.name.length - a.name.length)[0];
  if (known) return { remote: known, name: known.name, branch: short.slice(known.name.length + 1) };
  const slash = short.indexOf('/');
  return { remote: null, name: slash > 0 ? short.slice(0, slash) : '', branch: slash > 0 ? short.slice(slash + 1) : short };
}

/**
 * The default branch names (never debris): the branches the remotes' `HEAD` symrefs point at, `init.defaultBranch`,
 * and `main` and `master` always. A union, not a fallback: a remote's HEAD can name another branch (a local
 * clone's follows whatever the source had checked out), and showing a default branch as debris would offer a
 * command that deletes it, so a missed piece is the safe side. Sorted, unique.
 */
export function defaultBranches(g: Pick<DebrisGit, 'refs' | 'initDefault'>): string[] {
  const named = new Set<string>();
  for (const r of g.refs) {
    if (!r.symref || !r.ref.startsWith(REMOTES) || !r.ref.endsWith('/HEAD')) continue;
    const prefix = r.ref.slice(0, -'HEAD'.length);
    if (r.symref.startsWith(prefix) && r.symref.length > prefix.length) named.add(r.symref.slice(prefix.length));
  }
  for (const n of [...(g.initDefault ? [g.initDefault] : []), 'main', 'master']) named.add(n);
  return [...named].sort(byCodepoint);
}

/**
 * Which refs could be debris (R13), and what to read about each. A local branch and its remote-tracking copies
 * (its upstream, or `<remote>/<name>`) are one group, as in `branches[]`. Never debris: symbolic refs, HEAD's
 * own branch and its upstream (with their copies), a group whose tip is HEAD's commit, and the default branches
 * as a local branch or `<remote>/<name>`. A merged group is read once past the grace; an unmerged one once it
 * could be an agent's or abandoned, or, with its upstream gone, once a rebase-then-merge could make it merged.
 */
export function planDebris(g: DebrisGit, settings: Debris['settings'] = { ...DEBRIS }): DebrisPlan {
  const defaults = defaultBranches(g);
  const rows = g.refs.filter((r) => !r.symref);
  const present = new Set(rows.map((r) => r.ref));
  const headUpstream = rows.find((r) => r.ref === g.headRef)?.upstream ?? '';

  const groups = new Map<string, RefRow[]>();
  const byUpstream = new Map<string, string>();
  for (const r of rows) {
    if (!r.ref.startsWith(HEADS)) continue;
    groups.set(r.ref, [r]);
    if (r.upstream) byUpstream.set(r.upstream, r.ref);
  }
  for (const r of rows) {
    if (!r.ref.startsWith(REMOTES)) continue;
    const sameName = `${HEADS}${splitRemote(r.ref, g.remotes).branch}`;
    const local = byUpstream.get(r.ref) ?? (groups.has(sameName) ? sameName : undefined);
    if (local !== undefined) groups.get(local)!.push(r);
    else groups.set(r.ref, [r]);
  }

  const out: DebrisGroup[] = [];
  const isDefault = (r: RefRow) => defaults.includes(r.ref.startsWith(HEADS) ? shortRef(r.ref) : splitRemote(r.ref, g.remotes).branch);
  for (const [key, members] of groups) {
    if (members.some((m) => m.ref === g.headRef || m.ref === headUpstream || isDefault(m))) continue;
    // Unmerged members first (they're the ones ahead), then the newer tip, then the local one.
    const best = [...members].sort((a, b) => Number(a.merged) - Number(b.merged) || b.ct - a.ct
      || Number(a.ref.startsWith(REMOTES)) - Number(b.ref.startsWith(REMOTES)))[0]!;
    if (best.sha === g.head) continue;
    const merged = members.every((m) => m.merged);
    const local = members.find((m) => m.ref.startsWith(HEADS));
    const upstreamGone = local !== undefined && local.upstream !== '' && !present.has(local.upstream);
    const ageDays = debrisAge(g.headCt, best.ct);
    const due = merged ? ageDays >= settings.mergedGraceDays
      : ageDays >= Math.min(settings.agentDays, settings.abandonedDays) || (upstreamGone && ageDays >= settings.mergedGraceDays);
    if (!due) continue;
    out.push({ key, members, best, merged, ageDays, upstreamGone, remotes: remoteCopies(members, local, g.remotes) });
  }
  out.sort((a, b) => byCodepoint(a.key, b.key));
  return { settings, defaults, groups: out, worktrees: g.worktrees };
}

/** Where each remote-tracking member lives on its remote, when that can be known. */
function remoteCopies(members: readonly RefRow[], local: RefRow | undefined, remotes: readonly RemoteRow[]): { name: string; ref: string }[] {
  const out = new Map<string, { name: string; ref: string }>();
  for (const m of members) {
    if (!m.ref.startsWith(REMOTES)) continue;
    if (local && m.ref === local.upstream && local.upstreamRemote && local.upstreamRemoteRef.startsWith(HEADS)) {
      out.set(m.ref, { name: local.upstreamRemote, ref: local.upstreamRemoteRef });
      continue;
    }
    const { remote, branch } = splitRemote(m.ref, remotes);
    if (remote?.standard) out.set(m.ref, { name: remote.name, ref: `${HEADS}${branch}` });
  }
  return [...out.values()].sort((a, b) => byCodepoint(a.name, b.name) || byCodepoint(a.ref, b.ref));
}

/** One commit as the reads give it: author mailmapped, email lowercased, name and subject already redacted. */
export interface DebrisCommit { sha: string; ct: number; name: string; email: string; subject: string }

/**
 * What the scan read about a group or a worktree. `commits`: the branch's own commits HEAD lacks, newest first
 * (unmerged), or its tip alone (merged, or a worktree's HEAD). `paths`: the changed paths, excluded and
 * binary-only ones left out. `cherryMerged`: `git cherry HEAD <tip>` marked every commit `-` (read only when gone).
 */
export interface DebrisRead { commits: DebrisCommit[]; aheadCount: number; lines: number; paths: string[]; cherryMerged: boolean }

/** The key a worktree's read is filed under. */
export const worktreeKey = (w: Pick<WorktreeRow, 'ref' | 'head'>): string => w.ref ?? `HEAD ${w.head}`;

export interface DebrisContext {
  /** HEAD's committer time, in seconds. */
  headCt: number;
  sessions: readonly Pick<Session, 'key' | 'branch' | 'endedAt'>[];
  /** Snapshot file ids by path. */
  fileIds: ReadonlyMap<string, FileId>;
  /** Your emails, as commit authors are canonicalised. Held in memory only. */
  selfEmails: ReadonlySet<string>;
}

/**
 * The snapshot's debris from the plan and its reads (keyed by group key, or `worktreeKey` for worktrees; null:
 * the read failed, counted in `unreadable`, never guessed). An active branch (an agent session on it ended
 * within `agentDays` of HEAD) is never debris. Classes: merged by ancestry or by `git cherry` (`rebased`), then
 * `agent` (its oldest own commit's author is an agent, or a session was on it, and idle `agentDays`), then
 * `branch` (unmerged `abandonedDays`). A worktree on an item's branch folds into it; a prunable one that
 * doesn't is an `agent` item itself (`worktreeOnly`).
 */
export function buildDebris(plan: DebrisPlan, reads: ReadonlyMap<string, DebrisRead | null>, ctx: DebrisContext): Debris {
  const { settings } = plan;
  const activeSince: IsoUtc = isoUtc((ctx.headCt - settings.agentDays * DAY_S) * 1000);
  const sessionsOn = (ref: string | null) => (ref?.startsWith(HEADS)
    ? ctx.sessions.filter((s) => s.branch === shortRef(ref)) : []);
  const items: DebrisItem[] = [];
  const byLocal = new Map<string, DebrisItem>();
  const unreadableRefs = new Set<string>();
  let unreadable = 0;

  const filesOf = (paths: readonly string[]) => {
    const ids = new Set<FileId>();
    let outside = 0;
    for (const p of new Set(paths)) {
      const id = ctx.fileIds.get(p);
      if (id) ids.add(id);
      else outside++;
    }
    return { files: [...ids].sort(byCodepoint), filesOutside: outside };
  };
  const creatorOf = (read: DebrisRead) => {
    const c = read.commits.at(-1)!;
    return { name: c.name, self: ctx.selfEmails.has(c.email), agent: isAgentAuthor(c.name, c.email) };
  };

  for (const group of plan.groups) {
    const read = reads.get(group.key);
    if (!read || read.commits.length === 0) {
      unreadable++;
      for (const m of group.members) unreadableRefs.add(m.ref);
      continue;
    }
    const local = group.members.find((m) => m.ref.startsWith(HEADS));
    const sessions = sessionsOn(local?.ref ?? null);
    if (sessions.some((s) => byCodepoint(s.endedAt, activeSince) > 0)) continue;
    const creator = creatorOf(read);
    const rebased = !group.merged && read.cherryMerged;
    let cls: DebrisItem['cls'];
    if (group.merged || rebased) cls = 'merged';
    else if ((creator.agent || sessions.length > 0) && group.ageDays >= settings.agentDays) cls = 'agent';
    else if (group.ageDays >= settings.abandonedDays) cls = 'branch';
    else continue;
    const tip = read.commits[0]!;
    const id = debrisId(group.key);
    const item: DebrisItem = {
      id, cls, ref: group.key, remotes: group.remotes, worktreeOnly: false, tip: group.best.sha,
      lastCommitDate: isoUtc(group.best.ct * 1000), ageDays: group.ageDays,
      aheadCount: group.merged ? 0 : read.aheadCount, lines: cls === 'merged' ? 0 : read.lines,
      ...filesOf(read.paths), subject: tip.subject, creator, sessions: sessions.map((s) => s.key).sort(byCodepoint),
      worktree: null, rebased, seed: u32(id),
    };
    items.push(item);
    if (local) byLocal.set(local.ref, item);
  }

  const seen = new Set<string>();
  for (const w of plan.worktrees) {
    const into = w.ref === null ? undefined : byLocal.get(w.ref);
    if (into) {
      into.worktree = { prunable: w.prunable, locked: w.locked, folder: w.folder };
      continue;
    }
    if (!w.prunable || (w.ref !== null && unreadableRefs.has(w.ref))) continue;
    const key = worktreeKey(w);
    if (seen.has(key)) continue;
    seen.add(key);
    const read = reads.get(key);
    if (!read || read.commits.length === 0) {
      unreadable++;
      continue;
    }
    const tip = read.commits[0]!;
    const id = debrisId(key);
    items.push({
      id, cls: 'agent', ref: w.ref, remotes: [], worktreeOnly: true, tip: w.head, lastCommitDate: isoUtc(tip.ct * 1000),
      ageDays: debrisAge(ctx.headCt, tip.ct), aheadCount: w.ref === null ? read.aheadCount : 0, lines: 0, ...filesOf(read.paths),
      subject: tip.subject, creator: creatorOf(read), sessions: sessionsOn(w.ref).map((s) => s.key).sort(byCodepoint),
      worktree: { prunable: true, locked: w.locked, folder: w.folder }, rebased: false, seed: u32(id),
    });
  }
  items.sort((a, b) => byCodepoint(a.id, b.id));
  return { settings, defaults: plan.defaults, items, unreadable };
}

// ---- Commands: shown for the user to copy, never run ----

/** POSIX single quotes: the one character a quoted word can't hold, `'`, is closed, escaped and reopened. */
export const shellQuote = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;

/**
 * Characters that make a pasted command differ from what it shows: controls, format characters (bidi overrides
 * and isolates, zero-width joiners: legal in refnames, Trojan-source style), line and paragraph separators, and
 * U+FFFD (a name that wasn't UTF-8, so the command wouldn't name the real ref).
 */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\uFFFD]/u;

export interface DebrisCommands { cleanup: string | null; inspect: string | null; warning: DebrisWarning | null }

/**
 * An item's cleanup and inspect commands (contract `DebrisDetail`). Every name is quoted and after `--` (or, as
 * a revision, a full refname, which can't start with `-`), so no refname, remote or folder can run code or be
 * read as an option. `git branch -d` refuses an unmerged branch and nothing here is ever `-D`; an unmerged
 * remote-only branch gets no delete at all, since `git push --delete` can't refuse.
 */
export function debrisCommands(item: DebrisItem): DebrisCommands {
  const words = [item.ref ?? '', item.worktree?.folder ?? '', ...item.remotes.flatMap((r) => [r.name, r.ref])];
  if (words.some((w) => HIDDEN.test(w))) return { cleanup: null, inspect: null, warning: DEBRIS_WARNINGS.hiddenCharacters };
  const steps: string[] = [];
  let blocked: DebrisWarning | null = null;
  const wt = item.worktree;
  if (wt?.locked) blocked = DEBRIS_WARNINGS.worktreeLocked;
  else if (wt?.prunable) steps.push('git worktree prune');
  else if (wt && wt.folder === null) blocked = DEBRIS_WARNINGS.worktreeAmbiguous;
  else if (wt) steps.push(`git worktree remove -- ${shellQuote(wt.folder!)}`);

  if (item.worktreeOnly) {
    const detachedWork = item.ref === null && item.aheadCount > 0;
    // Pruning a detached worktree with commits of its own would leave them on no ref at all: no cleanup until they're kept.
    return { cleanup: blocked || detachedWork ? null : steps.join(' && '), inspect: detachedWork ? `git log --oneline HEAD..${item.tip} --` : null,
      warning: blocked ?? (detachedWork ? DEBRIS_WARNINGS.detached : null) };
  }
  const ref = item.ref!;
  const inspect = item.rebased ? `git cherry -v HEAD ${shellQuote(ref)}`
    : item.cls === 'merged' ? null : `git log --oneline HEAD..${shellQuote(ref)} --`;
  if (ref.startsWith(HEADS)) steps.push(`git branch -d -- ${shellQuote(shortRef(ref))}`);
  else if (item.cls !== 'merged') return { cleanup: null, inspect, warning: blocked ?? DEBRIS_WARNINGS.remoteUnmerged };
  if (item.cls === 'merged' && !item.rebased) {
    for (const r of item.remotes) steps.push(`git push --delete -- ${shellQuote(r.name)} ${shellQuote(r.ref)}`);
  }
  const cleanup = blocked || steps.length === 0 ? null : steps.join(' && ');
  const warning = blocked ?? (item.rebased ? DEBRIS_WARNINGS.rebased : item.cls === 'merged' ? null : DEBRIS_WARNINGS.unmerged);
  return { cleanup, inspect, warning };
}

// ---- Serving: GET /api/debris and GET /api/debris-detail ----

const DEBRIS_ID = /^x_[0-9a-f]{12}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FILE_ID = /^f_[0-9a-f]{12,64}$/;
const SESSION_KEY = /^s_[0-9a-f]{12,64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CLASSES: ReadonlySet<unknown> = new Set(['branch', 'merged', 'agent']);

const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sortedUnique = (xs: readonly string[]) => xs.every((x, i) => i === 0 || byCodepoint(xs[i - 1]!, x) < 0);

/** Why one stored item can't be served, or null. */
function itemProblem(v: unknown): string | null {
  if (!isObject(v)) return 'an item is damaged';
  const { id, cls, ref, remotes, worktreeOnly, tip, lastCommitDate, ageDays, aheadCount, lines, files, filesOutside, subject, creator,
    sessions, worktree, rebased, seed } = v;
  if (typeof id !== 'string' || !DEBRIS_ID.test(id) || !CLASSES.has(cls) || typeof worktreeOnly !== 'boolean' || typeof rebased !== 'boolean') return 'an item is damaged';
  if (ref === null ? !worktreeOnly : typeof ref !== 'string' || !(ref.startsWith(HEADS) || ref.startsWith(REMOTES))) return 'an item ref is damaged';
  if (!Array.isArray(remotes) || !remotes.every((r) => isObject(r) && typeof r['name'] === 'string' && typeof r['ref'] === 'string')) return 'an item remote is damaged';
  if (typeof tip !== 'string' || !SHA.test(tip) || typeof lastCommitDate !== 'string' || !ISO_UTC.test(lastCommitDate)) return 'an item tip is damaged';
  if (![ageDays, aheadCount, lines, filesOutside].every(count) || !Number.isSafeInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffffffff) return 'an item count is damaged';
  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string' && FILE_ID.test(f)) || !sortedUnique(files)) return 'an item file is damaged';
  if (!Array.isArray(sessions) || !sessions.every((s) => typeof s === 'string' && SESSION_KEY.test(s)) || !sortedUnique(sessions)) return 'an item session is damaged';
  if (typeof subject !== 'string' || !isObject(creator) || typeof creator['name'] !== 'string' || typeof creator['self'] !== 'boolean'
    || typeof creator['agent'] !== 'boolean') return 'an item creator is damaged';
  if (worktree !== null && (!isObject(worktree) || typeof worktree['prunable'] !== 'boolean' || typeof worktree['locked'] !== 'boolean'
    || (worktree['folder'] !== null && typeof worktree['folder'] !== 'string'))) return 'an item worktree is damaged';
  if (worktreeOnly && worktree === null) return 'an item worktree is damaged';
  return null;
}

/**
 * Why a stored snapshot's debris can't be served, or null (absent is fine: `needsRescan`). Items must be
 * well-formed, sorted by id and unique. Never quotes the record.
 */
export function debrisProblem(s: Pick<SnapshotV02, 'debris'>): string | null {
  const d: unknown = s.debris;
  if (d === undefined) return null;
  if (!isObject(d) || !isObject(d['settings']) || !Array.isArray(d['items']) || !Array.isArray(d['defaults']) || !count(d['unreadable'])) return 'debris is damaged';
  const st = d['settings'];
  if (![st['abandonedDays'], st['mergedGraceDays'], st['agentDays']].every(count)) return 'debris settings are damaged';
  if (!d['defaults'].every((n) => typeof n === 'string')) return 'debris defaults are damaged';
  for (const it of d['items']) {
    const p = itemProblem(it);
    if (p) return p;
  }
  if (!sortedUnique((d['items'] as DebrisItem[]).map((it) => it.id))) return 'debris items are out of order';
  return null;
}

/** GET /api/debris (R13): every item as a piece, placed by its files' bodies like a drone. The stored debris must have passed debrisProblem. */
export function debrisView(s: Pick<SnapshotV02, 'repo' | 'debris'>, home: ReadonlyMap<FileId, DirId | null>): DebrisView {
  const items = s.debris?.items ?? [];
  const pieces = items.map((it) => ({ id: it.id, cls: it.cls, home: homeOfFiles(it.files, home), ageStep: debrisAgeStep(it.ageDays), lines: it.lines, seed: it.seed }));
  return { schemaVersion: 'debris.1', head: s.repo.head, pieces, total: pieces.length, placed: pieces.filter((p) => p.home !== null).length,
    mass: pieces.reduce((n, p) => n + p.lines, 0), unreadable: s.debris?.unreadable ?? 0, prs: 'not-read', needsRescan: s.debris === undefined };
}

/**
 * GET /api/debris-detail (R13): one item's panel: its name, age, last commit, creator, the agent sessions on it,
 * the bodies it touches and its commands. Null for an id the snapshot lacks (and for every id when `needsRescan`).
 * The stored debris must have passed debrisProblem.
 */
export function debrisDetail(s: Pick<SnapshotV02, 'repo' | 'debris' | 'sessions'>, home: ReadonlyMap<FileId, DirId | null>, id: DebrisId):
  DebrisDetail | null {
  const it = s.debris?.items.find((x) => x.id === id);
  if (!it) return null;
  const bodies = new Set<DebrisHome>();
  for (const f of it.files) {
    const h = home.get(f);
    if (h !== undefined) bodies.add(h ?? 'star');
  }
  const keys = new Set(it.sessions);
  const sessions: DebrisSession[] = s.sessions.filter((x) => keys.has(x.key))
    .map((x) => ({ key: x.key, model: x.model ?? null, startedAt: x.startedAt, endedAt: x.endedAt }))
    .sort((a, b) => byCodepoint(a.startedAt, b.startedAt) || byCodepoint(a.key, b.key));
  return {
    ok: true, schemaVersion: 'debris-detail.1', head: s.repo.head, id: it.id, cls: it.cls,
    name: it.ref === null ? null : shortRef(it.ref), remoteOnly: it.ref?.startsWith(REMOTES) ?? false, ageDays: it.ageDays,
    lastCommit: { sha: it.tip, short: it.tip.slice(0, 7), subject: it.subject, date: it.lastCommitDate },
    aheadCount: it.aheadCount, lines: it.lines,
    creator: { displayName: it.creator.name, captain: it.creator.self, agent: it.creator.agent },
    sessions, planets: [...bodies].sort(byCodepoint), home: homeOfFiles(it.files, home), filesOutside: it.filesOutside,
    worktree: it.worktree && { prunable: it.worktree.prunable, locked: it.worktree.locked }, rebased: it.rebased,
    ...debrisCommands(it),
  };
}
