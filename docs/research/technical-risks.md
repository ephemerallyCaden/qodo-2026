# Technical risk audit for the implementation (scout report, 2026-11-03)

> **Status (2026-11-04).** This is a point-in-time scout report. Superseded by later decisions (see the feature doc and CONSTITUTION.md):
> - **Live presence (Collaboration section, risks #1 and #12) is out of v1.** Liveblocks and Supabase would be remote servers, which the constitution bans. Any future presence would be opt-in P2P and needs a constitution amendment first.
> - **The optional GitHub GraphQL/PAT stage** is allowed only as an explicit read-only opt-in (used by R13 for PRs).
> - **"The CLI opens no port" no longer holds.** `commet open` runs a hardened 127.0.0.1 server (R14), which is in builder-security scope.
> - **Shallow clones (#5):** Commet refuses and explains how to unshallow; it never fetches.
> - **Biomes** are decorative, so "size and biome come from metrics" now means size only.
> - **Camera (#9):** the human is comparing ortho snapped, ortho free rotation and perspective via mockups.
> - **Hosted demo repos (Recommended architecture §1):** any public hosting needs human approval.

Probed on a clone of git/git (82,668 commits, Apple M4 Pro) and on a shallow clone of expressjs/express. Sources read: three.js r187, plus the issue trackers of Gource, git-truck, CodeCharta, git-fame, git-who and Playwright.

## Plan-changing findings
1. **Hosted PartyKit shut down on 23 Oct 2026.** Don't copy tutorials that use it.
2. **The three.js fix for pixel crawl only works with an orthographic camera** (the `webgl_postprocessing_pixel` example uses `pixelAlignFrustum`). A free perspective fly-through will shimmer.
3. **`git log --follow` dropped 29% of one file's history.** It returned 611 commits, against 863 from the union of old and new paths.
4. **A shallow clone credits the whole repo to one author.**

## Risk register
| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | Renames break planet lineage | High / High | Never use `--follow`. Do one pass of `git log --name-status -M` (0.53 s for 2 years of git/git). Assign a `fileId` when a file is first added and carry it across renames. |
| 2 | Changes made in merges are invisible, so deleted files never disappear | Medium / Medium | Reconcile against `git ls-tree -r HEAD` as ground truth (0.13 s). Use `--first-parent -m`. |
| 3 | Huge repos | High / High | Full `--numstat` takes 26 s on git/git; a 2-year window takes 3.6 s; Linux would be about 7 min. Default to a 12–24 month window and stream-parse. Cap at about 5k files, with the overflow shown as an "asteroid belt". Split the snapshot into a skeleton plus per-planet chunks. |
| 4 | Blame is expensive (~1 s per file, plus 5 ms spawn) | High / Medium | Skip blame in v1. Get ownership from numstat churn. If needed later, compute blame lazily on click and cache it. |
| 5 | Shallow clones fake authorship | Medium / High | The CLI refuses to run, or unshallows, when `--is-shallow-repository` is true. Note the GitHub Actions default of `fetch-depth: 1`. |
| 6 | Bulk commits distort churn (lockfiles, generated code, reformat or move commits) | High / Medium | Apply linguist's vendor and generated patterns plus `.gitattributes`. Drop binary rows. Down-weight outlier commits. |
| 7 | Identity fragmentation | High / Low–Medium | Use `%aN`/`%aE` with mailmap, the noreply ID key, and an alias file. |
| 8 | Layout churn (planets jump around) | High / High | Avoid treemaps and force simulations; CodeCharta's "Fixed Folders" caused infinite loops. Use the stability rule below. |
| 9 | Pixel crawl under a perspective camera | High / High | Orthographic or isometric camera inside each system, with texel-snapped pan and quantised rotation and zoom. Move between systems by cut or warp, not continuous flight. |
| 10 | Draw calls and labels | Medium / High | Use one InstancedMesh per feature type. BatchedMesh falls back to one draw call per sub-mesh without `WEBGL_multi_draw`. Show bitmap-font labels only for the focused planet. Budget under 100 draw calls and about 50k instances. |
| 11 | WebGPU | Medium / Medium | Use `WebGLRenderer` + `EffectComposer` + GLSL. |
| 12 | PartyKit is gone | Already happened | Use Liveblocks or Supabase instead. |
| 13 | Visual tests flake across GPUs | High / Medium | Pinned Docker image with SwiftShader, a deterministic frame, and screenshots of the low-res target. |
| 14 | Browser-only import is blocked by CORS (isomorphic-git) | Certain / High | Don't build a client-only importer. |

## Recommended architecture
1. **Pipeline:** a local Node CLI runs native git and writes `snapshot.v1.json(.gz)`. A static Vite frontend reads it.
   - Snapshot fields: `schemaVersion`, `repoId`, `window`, `files[{fileId,path,aliases,dirId}]`, `dirs`, `people[{personId hash, displayName}]`, `weeks[]`.
   - PR and review data is an optional GraphQL stage behind a fine-grained PAT.
   - Ship 2–3 public demo repos pre-generated as static assets.
   - **Security:** the static site serves only public snapshots, and the CLI opens no port. That keeps us out of builder-security scope. A local serve mode, if added, binds to 127.0.0.1 only.
2. **Layout stability:** `layout(snapshot) → positions` must be a pure function.
   - Seed with `hash(stableId)` into a mulberry32 or sfc32 PRNG. Never use `Math.random`.
   - Orbit ring comes from the directory's **first-seen time bucket** (append-only, so old planets never move). Angle comes from the hash. Size and biome come from metrics.
   - On a collision, only the newcomer moves.
   - Surface features use hash(`fileId`) to pick a lat/long cell.
   - A rename keeps its `fileId`.
   - A directory move transfers its `dirId` when at least 50% of its files move together.
3. **Rendering:** `WebGLRenderer`, an orthographic or isometric camera per system, `RenderPixelatedPass` (pixelSize 3–6) with snapping, then a palette-quantisation pass with optional Bayer dithering.
   - Instanced features, bitmap-font labels, `setPixelRatio(1)`.
   - Reduced motion means cut transitions and rendering on demand.
4. **Collaboration:** presence only, with a payload of `{personaColor, systemId, focusedPlanetId?, cameraTarget}` at about 10 Hz.
   - Liveblocks public key for public demo repos only. The free tier gives 500 rooms and 10 connections per room.
   - Fallback: Supabase Realtime (20 presence messages/s across the project).
   - Private repos need ID-token auth on the server, which brings builder-security into scope, so do it after the demo.
   - Presence is opt-in and ephemeral, and sends IDs, not paths.
5. **Testability, in three layers:**
   - (a) Pipeline: fixture repos built from scripted commits (rename, delete inside a merge, bot, co-author, lockfile, binary, shallow clone), checked against byte-exact golden JSON.
   - (b) Layout: golden positions, plus properties that adding files moves existing planets by 0 and a rename keeps its `fileId`.
   - (c) Render: Playwright in a pinned Docker image with SwiftShader and `?seed&frame=N`. Screenshot the low-res target, so the threshold can sit near 0. Assert draw-call and triangle budgets from `renderer.info`, not FPS.

## Decide on Day 1–2 (cheap insurance)
1. The stable ID scheme and rename map.
2. Snapshot schema v1, including `schemaVersion` and the skeleton/chunk split.
3. The camera: orthographic per system, cuts between systems.
4. A fixed pixel size and palette.
5. The default history window and file cap.
6. A pinned PRNG and hash, with a lint rule banning `Math.random` in `layout/`.
7. The deterministic render mode, built in from the start.
8. WebGL + GLSL, not WebGPU.
9. Exclusion rules, recorded in the snapshot so the UI can show them.
10. The presence payload contract, and public repos only for the demo.
11. The demo repos, chosen now.
