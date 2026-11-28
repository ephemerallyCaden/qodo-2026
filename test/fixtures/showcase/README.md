# Showcase fixture (live demo L1)

The data behind the public demo (`docs/features/live-demo.md`): an invented app, **harbor**, scanned by the real `commet scan`, with chart state written through the real writers. `data/` holds the exact JSON each read route of `commet open` answers at the fixture's head, plus an index, `showcase.manifest.json` (shape: `ShowcaseManifest` in `manifest.ts`).

Nothing in it is real: the people, emails (`example.com`, `example.org`), dates, code and agent logs are invented. The scan's `CLAUDE_CONFIG_DIR` is the fixture's own log folder, so this machine's `~/.claude` is never read.

Rebuild it (byte-identical on any machine):
- `npm run fixture:showcase` rewrites `data/`;
- `test/showcase.test.ts` builds it fresh and fails if it differs from `data/`; `UPDATE_GOLDEN=1` rewrites it there too. Commit a change with a `Golden-Update: <reason>` line.

Files: `repo.ts` scripts the repo, its branches and worktree and its agent logs, `build.ts` scans it, writes chart state and reads every route, `make.ts` is the npm script, `manifest.ts` the index's type and file names.

## The system (`--root src`)

| Planet | Look (band) | Why | Fog: fogged / misted / clear |
|---|---|---|---|
| `src/core` | ice (healthy) | no debt markers; small (50 LOC) | 0 / 1 / 3 (75%) |
| `src/sync` | toxic | 1 marker in 131 LOC | 2 / 1 / 0 (0%) |
| `src/api` | ocean (healthy) | continents `routes/` and `schema/` | 5 / 1 / 1 |
| `src/billing` | desert (ash) | 1 marker in 241 LOC | 2 / 1 / 1 |
| `src/legacy` | lava | 7 markers in 212 LOC; stale, all teammate code | 1 / 2 / 0 (0%) |
| `src/ui` | lush (healthy) | continents `components/` and `pages/` | 5 / 1 / 1 |
| `src/auth` | lush (healthy) | well tested: 4 test moons | 2 / 1 / 5 |
| `docs` (outer) | lush (healthy) | a top-level folder outside the root | 1 / 1 / 1 |
| `scripts` (outer) | lush (healthy) | fully understood | 0 / 0 / 2 (100%) |

On the star: `README.md`, `package.json`, `tsconfig.json`, `.mailmap` and `src/index.ts` (root files), `test/e2e/smoke.test.ts` (an unmatched test) and two test data files (counted, never drawn). The healthy look (lush, ocean or ice) is seeded by the planet's id, so the folder names were picked to cover all three.

Fog: a first-run baseline at the 2026-08-27 commit (everything before it is seen), then every later change you didn't write stays fogged. Three files are charted (`build.ts` `CHARTED`: misted) and fifteen quizzes passed (`CLEARED`: clear). The review panel can open every fogged file: `data/` has its unseen diff.

## The crew

| Person | Commits as | Case |
|---|---|---|
| Mara Lindqvist (you, captain) | `mara@example.com` | `user.email` in the repo's config |
| Theo Park | `theo@example.com`; `T. Park <theo.park@example.org>` | `.mailmap` alias |
| Juno Abara | `juno@example.com` | billing |
| Iris Calloway | `iris@example.org` | ui |
| Felix Moreau | `felix@example.com` | legacy, and the abandoned branch |
| Sana Whitlock | `sana@example.org` | docs and scripts |
| release-bot[bot] | `release-bot@example.com` | bot, never crew |

## Agent sessions (drones)

| Session | Home | What it did |
|---|---|---|
| 2026-10-06, with a subagent | `src/api` (both) | order filters; the subagent edits the users test. Your own login fix lands while its log covers the time, so that commit is human |
| 2026-10-14 | `src/sync` | retry with backoff |
| 2026-10-22 | `src/ui` | sortable tables |
| 2026-11-03 | `src/auth` | token rotation |
| 2026-11-10 | the star | README, `package.json`, `src/index.ts` |
| 2026-09-20, on `claude/legacy-cleanup` | `src/legacy` | edits `xml.ts` and a new `xml-stream.ts` that never reached main (counted as other files) |

## Co-change

16 links, within planets (`routes/users.ts` with `schema/users.ts`) and across them (`api/routes/login.ts` with `auth/session.ts`, `core/events.ts` with `sync/queue.ts`), test pairs (`auth/tokens.ts` with its test), and two missing-pair flags: `src/api/schema/users.ts` (its route changed on 2026-11-12 without it) and `src/core/events.ts` (the queue changed on 2026-10-14 without it). Charting a flagged file dismisses its flag.

## Beacons

`src/auth/session.ts`, `src/billing/tax.ts` and `src/legacy/importer.ts` (`build.ts` `BEACONS`).

## Debris (R13)

Four stale items, all placed, read from the repo by the scan (`/api/debris`, one panel each at `/api/debris-detail`):

| Branch | Class | Home | Age (decay) | Case |
|---|---|---|---|---|
| `spike/remote-config` | branch (abandoned) | `src/core` | 190 days (broken) | Theo's May spike, in a worktree whose folder was deleted: a prunable worktree, so its cleanup is `git worktree remove` then `git branch -d` |
| `feature/csv-export` | branch (abandoned) | `src/legacy` | 112 days (weathered) | Felix's unmerged July work |
| `fix/tax-rounding` | merged | `src/billing` | 61 days (weathered) | merged but never deleted (it points at a commit on main) |
| `claude/legacy-cleanup` | agent | `src/legacy` | 59 days (intact) | an orphaned agent branch: the 2026-09-20 session ran on it |

The snapshot's `branches` lists the three unmerged ones; `debris` has all four.
