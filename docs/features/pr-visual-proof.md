# Feature: PR visual proof (a factory skill)

## Status
In Progress

## Trigger
Human, 2026-11-23: "I kinda want a cooler skill than that, let's do something more flashy let's do PR visual proof." This came after the lead proposed: for any change that touches the view, render before and after at a fixed seed, capture stills or a short GIF, check that two takes match pixel for pixel, scan the frames' page text for private data, and write the result into the PR as text, since Qodo can't see images. The skill replaces fix-proof as the Day 13 entry; fix-proof stays in the repo.

## Requirements
Draft. Each becomes a test or a verification step.
- [x] R1. Given a view change (a commit, or the uncommitted diff) and its base, the skill captures the same scene before and after, from the same snapshot, viewport, camera and loop time.
- [x] R2. Determinism. Each capture is taken twice and the takes must match (0 px differ). If they don't, the skill stops and reports.
- [x] R3. A human-facing artefact: a short before → after GIF and a side-by-side still pair.
- [x] R4. A text summary Qodo can read: per scene, what changed in pixels (count, bounding box, which part of the view), plus both commits and the exact command. The agent drafts it for the PR description; the lead posts it.
- [x] R5. Privacy. Every frame's page text, and every served API response, layout and beacon (the label canvas isn't in the DOM), is scanned for absolute paths, tokens, prompt text and anything else Rule 2 bans. Any hit stops the run.
- [x] R6. No outward actions: no push, no PR or issue edits, no uploads. The lead or the human attaches images.
- [x] R7. Stop-and-ask conditions: the diff has no view change, the scene can't be reached, the takes differ, a privacy hit, or the base or head won't build.
- [x] R8. A saved record (like fix-proof's): commands, outputs, image paths and hashes, created at the start and filled in step by step.
- [ ] R9. Day 13 template: SKILL.md frontmatter `name` equals the directory, the description says when to use it; a fresh-session run on a real task with session-id and skill-load evidence; one refinement with a retry; Qodo review of the skill's PR at its head.
- [x] R10. All tooling is committed in the repo (not `/tmp`, not `.archive/`), so it survives a restart.
- [x] R11. No view change, no capture. If base and head build the same view bundle (its file name is a content hash), the skill says so and stops (R7).
- [x] R12. Both builds see the same data: one temp clone at a pinned commit, scanned once with `--no-ingest`, and drones only from a scripted scene through the server's test hooks. No agent logs are read. If the diff touches the scanner, layout or a contract, the skill stops and asks.

## Assumptions
- [x] A1. **Verified, with a limit.** The render hook (`window.__commet`: `load`, `renderFrame`, `lowResPixels`) draws any layout deterministically, but test mode has no HUD, panels or labels. Live captures go through `commet open` serving `dist/web`, with time fixed by replacing `requestAnimationFrame` and stepping 50 ms a frame (archive `day13-scratch/gif-tools/capture.mjs:80-95`, `web/src/loop.ts`).
- [x] A2. **Verified.** Scenes are driven with Playwright on real input (keys, clicks, wheel). Drone scenes can be faked through the in-process server's hooks, as `test/render/review.spec.ts:54-92` does.
- [x] A3. **Verified.** Cloning node_modules takes 3.7 s, `npm run build` takes 3.9 s, and a 130-frame take about 53 s.
- [x] A4. **Disproved.** gh 2.99+ has `--attach` on `pr create/edit/comment` (installed: 2.92). An attached file on this public repo is public at once, so attaching stays a human step. The skill never uploads.
- [x] A5. **Partly.** There's no pngjs or pixelmatch. `test/render/png.ts`'s decoder takes only RGBA with filter 0, while Playwright writes RGB with filters 1–4. ffmpeg, PIL and numpy are on this machine but aren't npm dependencies.
- [x] A6. **Candidates found.** PR #193 (e0189cf → 6faf494) is real but repeats Day 14's footage. #194 is server-only, a good R11 negative. Open view bugs with no fix yet: #189, #190, #191, #192, #186.

## Flow
An agent finishes a view change → `/visual-proof <base> <head or working tree> <scene>` → build both versions → capture each twice → compare takes → diff before against after → privacy scan of page text → GIF, stills and text summary → record → the agent pastes the text into its PR draft; the lead attaches the images.

## Research
- Scout L1 (2026-11-23): `<main>/.archive/docs/hackathon/day13-scratch/visual-proof-scout-L1.md`. All earlier capture tooling is archive-only and hardcodes `/tmp` paths. The Day 14 setup is the model for R1: two builds, one clone, one state. Determinism was checked by rerunning a take and comparing raw PNGs. The privacy check ran regexes over 7 DOM ids, aria-labels and the title, plus the served layout and snapshot. GIFs were made with PIL using a 256-colour OKLab palette and no dither.
- Pixel counts like 798, 826 and 1232 come from diffing the `#labels` canvas and counting changed pixels inside `#panel`'s box (`review.spec.ts:451-468`). `test/render/twin.ts` already gives per-colour counts and bounding boxes.

## Tasks
- A. Build the skill and its committed tooling (R1–R8, R10–R12). Done: 4008cc7, the drone-panel scene e2f3245 (0d28654 and 25f5124 before the rebase onto f0357e8).
- B. Fix #189 (selected drone hidden under its own panel): the real task for the fresh run, picked by the human on 2026-11-23. Done: diagnosed (repro ca84e81), fixed in PR #197 (merged at f0357e8; Qodo run 2102678, 0 findings).
- C. Fresh-session runs on B's fix (R9). Run 1 (session 14087931) was DONE but read 3 of 6 shots, grepped the record and piped through `tail`; refined in 39e68cb (db70fea before the rebase; the skill's files are identical); run 2 (session b5edfd92) read the sheet, summary and record in full. Qodo review of this skill's PR: pending.
- D. Rewrite the Day 13 post around this skill (archive).
