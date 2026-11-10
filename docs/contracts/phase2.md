# Phase 2 contract (#29)

**Status: locked 2026-11-09; amended 2026-11-10 (rings removed, `healthy` band, `depthFade` switch).** Change it only through the team lead, never inside a feature PR. The types are the source of truth; this doc explains them.

| Shape | Types | Produced by | Consumed by |
|---|---|---|---|
| `layout.json` | `src/core/contract/layout.ts` (`LayoutV1`) | #18 `layout()` | #30 view, #32 server, #34 later |
| Fog view | `src/core/contract/fog.ts` (`FogView`, `ChartAction`) | #33 R5 | #32 server, #30 view |
| Local HTTP surface | `src/core/contract/api.ts` (`API`, `TOKEN_HEADER`, `WEB_DIST`, `LiveEvent`) | #32 R14 | #30 view |
| Render hook | `src/core/contract/api.ts` (`RenderHook`, `RenderInput`, `RenderStats`, `TEST_MODE_PARAM`) | #30 view | #31 render tests |

**Fixtures:** `test/fixtures/contract/mini.ts` (typed source) and its JSON twins `mini.layout.json` and `mini.fog.json`. They describe 3 planets, moonlets, a moon overflow, a surface overflow, unknown debt and one charted file. `test/contract.test.ts` keeps the twins byte-equal and checks the invariants. Regenerate the twins only with `UPDATE_GOLDEN=1` and a `Golden-Update:` line.

## Layout
- **Integers only:** `canonicalJson` only takes integers, so lengths are world units ×1000 (`…Milli`) and angles are thousandths of a turn.
- **Ids:** every body is keyed by the snapshot's stable `DirId` / `FileId`. Paths are for labels only.
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
- **Every `ChartAction` carries `at`** (#58, amended 2026-11-10): the `FogView.head` the user was looking at, as a full SHA. If a scan lands after the view's last fetch and `at` isn't the current head, the write is refused with `{ ok: false, error: 'stale', head: <current> }` (`ChartStale`) and nothing is written. The view refetches the fog and asks again. Without it, a change that arrived unseen (say, a new agent commit) would be charted at the new head: a false clear (AGENTS.md Rule 1). `commet chart` has no stale view, so it uses the current head.

## Local HTTP surface (`commet open`)
- **Bind and Host:** binds 127.0.0.1 only. `Host` must be `127.0.0.1:<port>` or `localhost:<port>`.
- **Token:** the opened URL is `http://127.0.0.1:<port>/#t=<token>`. The fragment is never sent to the server. The view reads it and sends `x-commet-token` on every data request.
- **Static bundle:** served at `/` from `dist/web` without a token, because it holds no repo data. No directory listing and no traversal.
- **Read routes:** `GET /api/snapshot`, `/api/layout`, `/api/fog`.
- **Write routes:** `POST /api/chart` with a `ChartAction` JSON body (exact keys, `at` a full 40-hex SHA, or 64-hex in a SHA-256 repo) returns a `ChartResult`. A stale `at` gets `ChartStale`, told apart from other refusals by its `head`. `POST /api/beacon` answers 501 until R10. Every other method or path is refused.
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
