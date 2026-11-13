# Phase 2 contract (#29)

**Status: locked 2026-11-09; amended 2026-11-10 (rings removed, `healthy` band, `depthFade` switch), 2026-11-11 (content roots, #71; the unseen and diff routes, #75) and 2026-11-13 (drone view, #80).** Change it only through the team lead, never inside a feature PR. The types are the source of truth; this doc explains them.

| Shape | Types | Produced by | Consumed by |
|---|---|---|---|
| `layout.json` | `src/core/contract/layout.ts` (`LayoutV1`) | #18 `layout()` | #30 view, #32 server, #34 later |
| Fog view | `src/core/contract/fog.ts` (`FogView`, `ChartAction`) | #33 R5 | #32 server, #30 view |
| Drone view | `src/core/contract/drones.ts` (`DroneView`, `DroneSession`) | #80 | #32 server, #30 view |
| Local HTTP surface | `src/core/contract/api.ts` (`API`, `TOKEN_HEADER`, `WEB_DIST`, `LiveEvent`; #75: `UnseenList`, `DiffView`) | #32 R14, #75 | #30 view |
| Render hook | `src/core/contract/api.ts` (`RenderHook`, `RenderInput`, `RenderStats`, `TEST_MODE_PARAM`) | #30 view | #31 render tests |

**Fixtures:** `test/fixtures/contract/mini.ts` (typed source) and its JSON twins `mini.layout.json` and `mini.fog.json`. They describe 3 planets, moonlets, a moon overflow, a surface overflow, unknown debt and one charted file. `test/contract.test.ts` keeps the twins byte-equal and checks the invariants. Regenerate the twins only with `UPDATE_GOLDEN=1` and a `Golden-Update:` line.

## Layout
- **Integers only:** `canonicalJson` only takes integers, so lengths are world units ×1000 (`…Milli`) and angles are thousandths of a turn.
- **Ids:** every body is keyed by the snapshot's stable `DirId` / `FileId`. Paths are for labels only.
- **Content roots (amended 2026-11-11, #71):** in most repos one folder (`src/`, `lib/`, `packages/`) holds most of the code, so as one planet it hid the structure that matters. The human decided (2026-11-11, `docs/features/content-roots.md`) that the user can name one or more content roots. `source.roots` lists them: repo-relative, sorted, no trailing slash. `[]` is #18's mapping, where every top-level folder is a planet. A root's direct subfolders holding a surface file are **content** planets (`Planet.zone: 'content'`), on the inner orbits. Every other top-level folder holding one is an **outer** planet, on orbits beyond them: content planets take slots 0 to `CONTENT_SLOTS - 1` and outer planets start `OUTER_GAP_SLOTS` empty slots later (layout constants), so neither zone's growth moves the other's planets. A content planet born while every content slot is taken goes to the innermost free slot past the gap. Partners are older planets in the same zone. A root is never a planet itself. A file directly inside a root is a star moonlet of kind `root-file`. With `roots: []` every planet is `outer`, and the layout is #18's apart from the two new keys. Fog's `planets` covers both zones, by the same rule (`planetHome` in `src/core/structure.ts`). The view accepts the fields and needn't style zones yet.
- **Orbits:** slot 0 is innermost. `slotSpacingMilli ≥ 2 × maxPlanetRadiusMilli`, so growth never forces a move (#18). `phaseMilliturn` is the frame-0 angle. Orbital motion is the renderer's job, as a function of frame number.
- **Surface:** a Fibonacci sphere of `grid.cells` cells. Cell `i` is centred at `fibonacciCell(i, cells)`, and both `layout()` and the renderer use that one helper. "Nearest free cell" means nearest by angle.
- **Overflow is counted, never dropped (Rule 1):** `moonOverflow`, `surface.overflow`, `moonletOverflow`.
- **Health:** `band` is one of `lava | toxic | ash | healthy`. A healthy planet is drawn as lush, ocean or ice, picked by `biomeSeed`. Thresholds live in one constants file owned by #18. `qodoUnknown` is true exactly when `qodoOpen` is null. Unreadable debt is counted in `debtUnknownFiles`, never as 0.
- **Seeded variety:** `biomeSeed` only varies the look inside a band (principle 4).
- **No rings (amended 2026-11-10):** the human decided on 2026-11-09 that rings no longer mean unmerged branches. Their meaning is open, so the layout has no rings and the product view draws none. Stale branches belong to debris (R13), later. See art-direction §6 on `docs/art-meaning`.
- **#23 (decided by the human, 2026-11-09):**
  - Partner detection looks through merge commits to the merged branch's own commits.
  - Test data (non-test files under a test folder) rides with the tests. It is never a planet or surface, and is counted in `star.testData`. So `test/` is never a planet.

## Fog view
- **States:** `clear` (no change you didn't write), `charted` (all reviewed), `fogged`. The view draws clear and charted the same.
- **Reasons:** `agent`, `mixed`, `self-committed-agent-written`, `teammate`, `unknown`, `lineage-unknown`. Unknown is never yours.
- **Coverage:** `files` lists every file in `snapshot.files`, including surface overflow, sorted by `fileId`. Planet and star counts add up to `files.length`. Star counts include root files, unmatched tests and test data.
- **No wall-clock time anywhere:** `baseline` and `since` are commit SHAs.
- **Chart state on disk** (`.git/commet/`) is private to #33. Others only see `FogView` and send `ChartAction`.
- **Every `ChartAction` carries `at`** (#58, amended 2026-11-11): the `FogView.head` the user was looking at, as a full SHA. The write is recorded at `at`: a chart or baseline covers changes up to `at` and no further. So if a scan lands after the view's last fetch, a change that arrived unseen (say, a new agent commit) is newer than `at` and stays fogged, with no false clear (AGENTS.md Rule 1), no refusal and no race. `at` must be a commit the current snapshot knows (in its window, on HEAD's first-parent line). Otherwise (another branch, before the window, a snapshot that went backwards) the write is refused with `{ ok: false, error: 'unknown-head', head: <current> }` (`ChartUnknownHead`) and nothing is written; the view refetches and asks again. For `chart`, `fileId` is the file's id as of `at` and must lead to a file at HEAD. `baseline-undo` pops the last baseline. `commet chart` uses the current head.

## Drone view (amended 2026-11-13, #80)
- **What it is:** one `DroneSession` per agent session in the snapshot, sorted by `key`, plus `total`, `placed` and `needsRescan`. It is served at `GET /api/drones` and holds nothing the snapshot's sessions don't already hold.
- **Safe fields only (Rules 2 and 6):** key, seed, tool, kind, parent, agent type, start and end, branch, model, `inferred` and `home`. No paths, commit subjects, prompts, or per-session line, file or commit counts. Branch, model and agent type already pass the parser's `metaToken` filter.
- **`home`:** the planet's `DirId`, `'star'`, or null. It is built from the session's `files` and the fog's `FogBase.home` map (`openFogSource`), so drones and fog agree on where a file lives, and #64's pair check covers drones too. The planet holding most of the session's files wins, with ties broken by codepoint. A session with no files of its own is null, except that a subagent takes its parent's home. Null is counted and never drawn or guessed (Rule 1).
- **`needsRescan`:** true when the snapshot has no `Session.files` (it was scanned before #80). Every `home` is then null. This is the lead's reading of the human's decision on #80's default 4: an old snapshot is not refused, and the view says "rescan to place drones".
- **Tool:** `tool` is a string, not the snapshot's `Tool` union, so a provider the scanner doesn't know yet draws the generic drone with its name.
- **Determinism:** the view is a pure function of the snapshot and the layout. Two scans of the same repo and logs give byte-identical `canonicalJson`. No wall-clock time (principle 3).

## Local HTTP surface (`commet open`)
- **Bind and Host:** binds 127.0.0.1 only. `Host` must be `127.0.0.1:<port>` or `localhost:<port>`.
- **Token:** the opened URL is `http://127.0.0.1:<port>/#t=<token>`. The fragment is never sent to the server. The view reads it and sends `x-commet-token` on every data request.
- **Static bundle:** served at `/` from `dist/web` without a token, because it holds no repo data. No directory listing and no traversal.
- **Read routes:** `GET /api/snapshot`, `/api/layout`, `/api/fog`, `/api/unseen`, `/api/diff`, `/api/drones` (#80, GET only, behind the same Host, origin and token gates).
- **Write routes:** `POST /api/chart` with a `ChartAction` JSON body (exact keys, `at` a full 40-hex SHA, or 64-hex in a SHA-256 repo) returns a `ChartResult`. An unknown `at` gets `ChartUnknownHead` with status 409 Conflict, told apart from other refusals (400) by its `head`. `POST /api/beacon` answers 501 until R10. Every other method or path is refused.
- **Reviewing from the view (amended 2026-11-11, #75):** two more read routes, so a file can be charted where its diff is read (R5).
  - `GET /api/unseen?home=<DirId>|star&at=<Sha>` (`UnseenQuery`, `UnseenList`) lists the fogged files of one planet, or of the star, with their paths. Layout has no file paths and leaves out surface overflow, and fog.1 has no file-to-planet map, so the view can't name them otherwise. fog.1 is unchanged.
  - `GET /api/diff?fileId=<FileId>&at=<Sha>` (`DiffQuery`, `DiffView`) is one file's unseen diff, as parsed hunks.
  - Both take exactly their two keys, each once. `at` is the `FogView.head` the view shows and must be the current head, else `ChartUnknownHead` (409) and the view refetches. Unknown ids get 404 with a fixed error naming neither the id nor a path.
  - **The client sends `at`, never `since` or a path.** The server takes the path from the snapshot and the range from its own fog: `base..at`, where `base` is the first-parent parent of the file's oldest unseen change (the empty tree at the root commit). So a stale or forged request can't narrow the diff (Rule 1), and the range ends at the same `at` the Chart action posts. `FileFog.since` minus one isn't the base: for a window gap, `since` is the commit after the gap, so `since^` would leave the gap's own change out.
  - A rename inside the range is followed: the path the file had at `base` is diffed too, so git shows the rename and its edits. When git doesn't pair them there are two sections, the old half `deleted`.
  - git runs argv-only (system design §9 check 8): `diff-tree` between the two commits (never the work tree or index), `--literal-pathspecs` (a file named `*.ts` or `:(glob)x` means only itself), `--no-ext-diff --no-textconv --no-color`, the scan's pinned config, revisions as full hex from the snapshot and paths only after `--`.
  - Past `DIFF_LIMITS` (1 Mi characters or 20,000 lines) the rest is cut and `truncated` set; the view says so beside Chart and offers the `git diff` command. At most 4 diffs run at once and each gets 10 s; past either the answer is 503.
  - Diffs are served on demand and never stored, cached or logged, on either side.
- **Live updates:** `GET /api/events` is a `text/event-stream` read with `fetch`, so the token stays in a header. Each `data:` line is a `LiveEvent`. The view refetches the named resource.
- **No CORS headers,** and cross-origin writes are refused.

## Render hook (R8)
- **Test mode:** only with `?test=1` (`TEST_MODE_PARAM`). There is no animation loop, and `window.__commet: RenderHook` is exposed. Without the parameter, the hook doesn't exist.
- **Calls:** `load(input)`, then `renderFrame(n)`, which draws exactly frame `n` and returns `renderer.info` draw calls and triangles. `lowResPixels()` returns the internal target before upscale, so goldens can sit near a 0 threshold.
- **Determinism:** a frame is a pure function of (`RenderInput`, frame number), per principle 3.
- **Palette check (amended 2026-11-10):** `RenderInput.depthFade` (default true) switches the per-pixel depth fade. With it off, off-palette pixels must be 0 (system-design §10), because the fade is the only off-palette output.

## Directory ownership in Phase 2

| Ticket | Owns | Must not touch |
|---|---|---|
| #18 layout | `src/core/layout/`, layout writing in `src/scan` / CLI `scan` | web, server, fog |
| #30 view | `web/`, Vite config, `dist/web` build step | `src/server/`, `test/render/`, fog code |
| #31 render tests | `test/render/`, Playwright config, CI render job | `web/` |
| #32 server | `src/server/`, `open` subcommand | `web/`, fog code |
| #33 fog | `src/core/fog/`, chart state in `src/state/`, `chart` subcommand | `web/`, `src/server/` |

Shared and expected to conflict: `src/cli/main.ts` (#32, #33, #18) and `package.json` / lockfile (#30, #31). Keep those edits minimal. The team lead resolves them at merge.
