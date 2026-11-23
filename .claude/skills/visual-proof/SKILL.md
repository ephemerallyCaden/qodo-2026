---
name: visual-proof
description: Shows a view change before and after. Builds the base and the head (a commit or the uncommitted working tree), films the same scene in the live view from the same data, viewport and loop time, takes each capture twice and requires the takes to match pixel for pixel, scans every frame's page text and every served response for private data, then writes a before → after GIF, side-by-side stills and a text summary Qodo can read (changed pixels, where, the scene's own measures). Use after a commit that changes what the view draws (web/, or what the bundle imports), before its PR, or when a review asks what a view change looks like.
compatibility: Claude Code in a Commet checkout or worktree (git, tar, Node 20.19+, npm, node_modules from npm ci, Playwright's Chromium). Local only, no network; no image tool needed.
metadata:
  project: commet
  version: "1"
---

# visual-proof: what does this view change look like?

Qodo can't see images, and a screenshot nobody can reproduce proves little. This skill films one
scene of the live view on two builds from identical data and time, checks the film is deterministic
and free of private data, and turns the difference into numbers a reviewer can read.

**Never:** push, open or edit a PR or issue, upload or attach an image anywhere (R6: the lead or the
human attaches them); run commet against this repo's own `.git/commet` (the run uses its own clone);
weaken a check so a run passes (a privacy pattern, the take comparison, a stop); run two runs at once
(SwiftShader is CPU-bound and other agents share the machine); edit product code to make a scene work.
**Always:** run the commands below as they are, in the foreground, and report what they printed.

## Inputs

`$ARGUMENTS` holds, in order:
1. **The base**: the commit before the change (SHA or ref).
2. **The head**: the commit with the change, or `--worktree` for the uncommitted working tree on HEAD.
3. **The scene**: a name from `vp.sh scenes` (below). Pick the one that shows what the change is about;
   if none does, add one (see "Adding a scene") and check it with `vp.sh try` first.

Missing one, or unsure which scene shows the change: stop and ask.

## What it runs

Everything is `.claude/skills/visual-proof/scripts/vp.sh`, run from the checkout's root. It compiles the
skill's TypeScript (`scripts/`, `scenes/`) with this checkout's `tsc` into a temp dir that it removes,
then runs it. No image tool, no new dependency: the PNG reader, GIF writer and captions are its own code.

```sh
.claude/skills/visual-proof/scripts/vp.sh scenes                     # the scenes, one line each
.claude/skills/visual-proof/scripts/vp.sh run --base <base> --head <head> --scene <scene>
.claude/skills/visual-proof/scripts/vp.sh run --base <base> --worktree --scene <scene>
.claude/skills/visual-proof/scripts/vp.sh try --head <ref> --scene <scene>   # one build, one take
```
Add `--keep` to keep the scratch dir (`/tmp/visual-proof-<id>`: both builds, the data clone, the raw
takes); `--out <dir>` writes the record elsewhere. Exit codes: 0 done, 3 `STOP <code>: …` (stop and ask),
2 usage, 1 internal error. A run takes about 3 minutes; a negative (no view change) about 20 seconds.

## Steps

### 1. Check the inputs
```sh
git rev-parse --verify '<base>^{commit}'; git rev-parse --verify '<head>^{commit}'   # both exist here
git diff --stat <base> <head> -- web/ src/core/               # the view's own code changed?
.claude/skills/visual-proof/scripts/vp.sh scenes
```
A diff with nothing under `web/` and nothing the bundle imports (`src/core/`) has no view change; the
run will say so and stop (R11), so you can say it now instead.

### 2. Run it
```sh
.claude/skills/visual-proof/scripts/vp.sh run --base <base> --head <head> --scene <scene>
```
It prints the record's path first (`.archive/docs/hackathon/evidence/visual-proof-<id>.md`, in the main
checkout). The record exists from that moment with `Status: running`, and every step is appended as it
ends (R8), so a run that dies still shows what it did. The steps, each a section of the record:

1. **Tools**: Node, git, tar, node_modules, Playwright's Chromium (R7: missing → `tool-missing`).
2. **The change**: the paths base → head; any under `src/scan/`, `src/attrib/`, `src/core/layout/`,
   `src/core/snapshot/` or `src/core/contract/` are what the data is made of (R12).
3. **Builds**: `git archive` of each commit (or a copy of the working tree) into the scratch dir, this
   checkout's `node_modules` (same lockfile only), `npm run build`, and a digest of `dist/web`.
4. **View change?** The same `dist/web` on both sides → `no-view-change` (R11), before any capture.
   A diff touching the data paths → `data-change` (R12).
5. **The data**: one clone of this repo at the scene's pinned commit (default: the base), scanned once
   with `--no-ingest` and an empty `CLAUDE_CONFIG_DIR` (0 sessions, or `data-change`), then the scene's
   setup (a beacon, a chart). Every take starts from a copy of that state. Drones come only from the
   scene's script, through the server's hooks: no agent log is read (R12).
6. **Takes**: four, each in its own process and browser: before twice, after twice. Each build serves
   itself (its own server and `dist/web`, in-process, 127.0.0.1, a fresh token). The view's
   `requestAnimationFrame` is stepped by hand, 50 ms of loop time a frame (R1). A scene that can't reach
   its state stops with `scene-unreachable`.
7. **Determinism**: both takes of each build, frame by frame: any pixel, still, probe or page text that
   differs → `takes-differ` (R2).
8. **Privacy**: every frame's page text (text nodes, attributes, input values), every API response,
   the event stream and the state files, for absolute paths, `~/`, `file:` URLs, the launch URL or token,
   token-like strings and secret prefixes, agent-log fields, and this machine's own paths. Any hit →
   `privacy`, before any image is written (R5).
9. **Before → after**: per still, the changed pixels, their box and which part of the view (each open
   panel, the HUD, the 3D view and labels), and the scene's probes before and after; the images (R3).
10. **Summary**: `summary.md`, privacy-checked, for the PR description (R4).

### 3. Read what it made
On `DONE`, read the record and `summary.md`, and look at each `-shotN-pair.png` (Read shows images):
- Does each shot show what the change is about? A shot with `no pixel changed` proves nothing about it.
- Do the numbers say it? For a fix, the probe that measures the bug should move (e.g. `798 before, 0 after`).
- Did either build's page log errors (the record's take steps)? Say so; don't hide them.

### 4. Report
Paste `summary.md` into the PR draft as it is. List the images for the lead to attach (the GIF and the
pairs, with their sizes; GitHub takes 10 MB at most), and the record's path. Attach nothing yourself.

## Expected result

`DONE`: both builds built and differ, four takes with 0 frames differing between takes of a build,
0 privacy hits, and for each still a before | after pair, a change mask, the measures, and one GIF.
Anything else is a `STOP` and is reported as it is.

## Stop and ask

On exit 3, the run has written the stop into its record (`Status: stopped (<code>) …`). Report the
code, its message and detail lines, and ask the user what to do:
- `no-view-change`: base and head build the same view (R11). Nothing to film; say so in the PR instead.
- `data-change`: the diff touches the scanner, attribution, layout, snapshot or a contract (R12), or
  the scan read agent sessions. Both sides would not see the same data; ask before filming anyway.
- `build-failed`: the base or head (or the data clone's scan) didn't build; the tail is in the record,
  the full log in the scratch dir.
- `scene-unreachable`: the scene couldn't get the view where it needed (a click opened nothing, a
  planet isn't in the layout). Check the scene with `vp.sh try` on each side.
- `takes-differ`: a take isn't reproducible: the frames named differ. Don't retry until it passes;
  find what in the view or the scene depends on wall time, and report it.
- `privacy`: what was found and where (masked). Nothing was composed. Even if it looks like repo
  content (a path in a diff), report it and let the user decide.
- `tool-missing`: what to install, in the message.
- `bad-input`: a ref that isn't a commit, an unknown scene, no folder for the record (`--out`).

Exit 1 is a bug in the skill: report the record's `Internal error` step.

## Stopping (early or not)

The run cleans up after itself: on `DONE` it removes the scratch dir (unless `--keep`), and on
`no-view-change` too. On any other stop it keeps it for a look; once you've reported, remove it:
`rm -rf /tmp/visual-proof-<id>` (the id is the record's name). The run never touches a branch, the
worktree or this repo's `.git/commet`; `git status` is as it was.

## Adding a scene

A scene is one TypeScript module in `scenes/`, listed in `scenes/index.ts`; `scripts/scene.ts` says
what it may do. It declares its data (`repoAt`, `roots`, `setup` CLI steps, scripted `drones`), whether
it runs under reduced motion, and a `run(s)` that drives the view with real input and records:
- `s.record(n)` steps the clock n frames and screenshots each; `s.advance(n)` steps without recording;
  `s.still(name)` marks the last frame as a shot (a pair and a summary line).
- `s.keepLabels()` keeps the label canvas: the `label px drawn under #<panel> since the keep` probes then
  count what changed under each open panel (the #169 tests' method). `report` picks the probes shown.
- `s.focusPlanet(path)`, `s.click(x, y)`, `s.press(key)`, `s.dismissOffer()`, `s.cli(…)` (the build's
  CLI in the clone, mid-take; then `s.waitFor` its effect), `s.waitFor(what, check)`, `s.fail(why)`.
- Where things are on screen comes from this checkout's own camera and drone code: `scenes/helpers.ts`
  (`homePose`, `bracketPose` for the camera after `]` presses under reduced motion, `droneAt`,
  `findDrone`, `scriptedDrone`, `scriptedDetail`). Check the click landed (the panel opened), since the
  build under test may place things differently.
- A scene must be a function of the layout and the frame clock: no wall clock, no randomness. Then run
  `vp.sh try --head <ref> --scene <name>`: it prints each still's boxes and probes and saves its frame.

`panel-labels` (#169) is the worked example: reduced motion, a note and a scripted drone, two shots.
