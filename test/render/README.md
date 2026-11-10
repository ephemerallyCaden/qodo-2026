# Render tests (R8, #31)

Playwright drives the view through the contract's render hook (`window.__commet`, see
`docs/contracts/phase2.md`, Render hook) in Chromium on SwiftShader. It reads the **low-res internal
target** with `lowResPixels()`, never the upscaled canvas, and checks it four ways:

| Check | Where | Fails when |
|---|---|---|
| Empty output | `frame.ts` `frameProblems`, `harness.ts` `openView` | no hook, no canvas, fewer than 12 colours, or under 5% of the frame off space |
| Palette | `twin.ts` `paletteProblems` | with `depthFade: false`, even one pixel isn't a `src/core/palette.ts` colour |
| Determinism | `standin.spec.ts` | frame *n* differs between renders in any order, or in a fresh browser |
| Draw budget | `frame.ts` `statsProblems` | `renderer.info` draw calls or triangles are 0 or over `BUDGET` (never FPS) |
| Goldens | `golden.ts` `checkGolden` | the frame differs from `test/golden/render/<name>.png` by more than `PIXELS` |

Every threshold lives in `thresholds.ts`, with the values from `docs/design/system-design.md` §10.

## Commands
```sh
npm run test:render                 # Playwright specs: test/render/*.spec.ts
npx playwright test -g "<name>"     # one render test
npm test                            # Vitest, which includes test/render/checks.test.ts (no browser)
UPDATE_GOLDEN=1 npm run test:render # rewrite goldens, on purpose only (below)
```
Vitest only runs `*.test.ts` and Playwright only runs `*.spec.ts`, so neither picks up the other's files.

## How a page is served
`harness.ts` answers every request by interception at `http://render.commet.test`, from an
allowlist of repo directories. No socket is opened, and requests to any other origin are refused,
so a render can't depend on the network or send anything to it. The stand-in's TypeScript is
transpiled per request.

## Empty output
A render test once passed after a shader compile error. Here a frame fails with fewer than
`BLANK.minColours` (12) unique colours or with less than `BLANK.minNonSpaceFraction` (5%) of its
pixels off the space colour (§10's anti-empty asserts). A broken body shader leaves space and the
1 px stars: 4 colours and well under 1% of the frame. A wrong clear colour fails on colours.
`checkGolden` runs the same check before writing, so `UPDATE_GOLDEN=1` can never save a blank golden.

`negative.spec.ts` proves this against the stand-in, broken in memory: a body shader that fails to
compile (stars still draw, the frame fails), a depth fade that ignores `depthFade: false` (the palette
check fails), no canvas, and no `?test=1`. A control test runs the
intact stand-in through the same checks, so the negative tests can't pass by accident.

## Where goldens are authoritative
**Only in the CI `render` job's container**: `mcr.microsoft.com/playwright:v<version>-noble`, pinned
by digest in `.github/workflows/ci.yml`, linux/x64. `test/ci.test.ts` keeps the tag equal to the exact
`@playwright/test` version, so the browser build matches the image.

Why: SwiftShader is a CPU renderer whose JIT output can differ by CPU architecture, OS and
browser build, usually by one band at a shading edge. One pinned image fixes all of them, which is
what lets the thresholds sit at 0.

Each golden's text twin records, on its `env` line, where that golden was made: Playwright, browser,
platform, arch and WebGL renderer. `checks.test.ts` requires every committed golden to share one
SwiftShader environment. On each run:

- **Same environment:** strict. More than `PIXELS.maxDiffPixels` differing pixels, or a changed
  twin, fails.
- **CI in any other environment:** fails, so CI can never quietly skip the compare.
- **Locally anywhere else** (for example macOS arm64, which also runs SwiftShader): never red
  against the CI goldens. Determinism, empty output, the budget and SwiftShader itself are still
  enforced; the golden compare is informational, and the test passes with a `golden-informational`
  annotation saying goldens are authoritative in CI and how many pixels differ.

## Updating goldens
Only on purpose, for a render change you meant, with a `Golden-Update: <reason>` line in the commit.
Review the `.txt` diff before committing.

Every run writes what `UPDATE_GOLDEN=1` would write to `test-results/render-goldens/`, and CI uploads
that directory as the `render-goldens` artifact. To update:

- **From CI** (no Docker needed): push, then
  `gh run download <run-id> -n render-goldens -D test/golden/render`. These are the same bytes
  `UPDATE_GOLDEN=1` writes in that image.
- **With Docker**, in a separate worktree (`npm ci` replaces `node_modules` with Linux builds):
  `docker run --rm -v "$PWD":/work -w /work <image from ci.yml> bash -c 'npm ci && UPDATE_GOLDEN=1 npm run test:render'`

A golden written anywhere else records that environment on its `env` line, and CI then fails on it.

## Text twins
Each golden PNG has a `.txt` twin, so a reviewer who can't see images (Qodo) can review a render
change. For every colour it lists the pixel count, the share, the bounding box and every palette
entry with that colour. Off-palette colours come after (the depth fade is the one allowed source).
The RGBA SHA-256 changes whenever any pixel does, the `stats` line pins the draw calls and
triangles, and the `env` line says where the golden was made. `checks.test.ts` re-derives every committed twin from its PNG, so a twin can't drift from
its image.

## The stand-in
`standin/` is the smallest three.js scene that implements the render hook: sun, planets by health
band, moons as one InstancedMesh, and 1 px stars, at 320×180, upscaled with nearest filtering. A
stepped depth fade is its one off-palette output, and it honours `depthFade: false`. It
proves the harness before the real view (#30) lands, and gives the negative tests something to
break. It is not a design reference.
