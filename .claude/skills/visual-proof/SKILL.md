---
name: visual-proof
description: Shows a view change before and after. Builds the base and the head (a commit or the uncommitted working tree), films the same scene in the live view from the same data, viewport and loop time, takes each capture twice and requires the takes to match pixel for pixel, scans every frame's page text and every served response for private data, then writes a before → after GIF, side-by-side stills and a text summary Qodo can read (changed pixels, where, the scene's own measures). Use after a commit that changes what the view draws (web/, or what the bundle imports), before its PR, or when a review asks what a view change looks like.
compatibility: Claude Code in a Commet checkout or worktree on macOS (git, tar, Node 20.19+, npm, node_modules from npm ci, Playwright's Chromium, /usr/bin/sandbox-exec). Local only, no network; no image tool needed.
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
2 usage, 1 internal error; the last line printed always says which (`vp.sh: exit <code> (…)`). A run takes
1 to 5 minutes (`drone-panel`, at 1920x1080, about 5); a negative (no view change) about 20 seconds.

## Steps

### 1. Check the inputs
```sh
git rev-parse --verify '<base>^{commit}'   # the base exists here
git rev-parse --verify '<head>^{commit}'   # the head exists (with --worktree: `git status --short` lists the changes instead)
git diff --stat <base> <head> -- web/ src/core/               # the view's own code changed?
.claude/skills/visual-proof/scripts/vp.sh scenes
```
A diff with nothing under `web/` and nothing the bundle imports (`src/core/`) has no view change; the
run will say so and stop (R11), so you can say it now instead.

### 2. Run it
```sh
.claude/skills/visual-proof/scripts/vp.sh run --base <base> --head <head> --scene <scene>
```
**Run it in the foreground, with no pipe, and allow 10 minutes** (the Bash tool's `timeout: 600000`).
A pipe (`| tail`, `| tee`) reports its own exit status, not the run's; the output is short anyway. The
last line is always `vp.sh: exit <code> (…)`, and on a stop the whole STOP block comes just before it.

It prints the record's absolute path first; **open every path it prints as it is** (they are absolute,
on the terminal only; the record and summary write `$MAIN`). The record exists from that moment with
`Status: running`, and every step is appended as it ends (R8), so a run that dies still shows what it did. The steps, each a section of the record:

1. **Tools**: Node, git, tar, node_modules, Playwright's Chromium, sandbox-exec (R7: missing →
   `tool-missing`; so is a shell that is sandboxed itself, where sandbox-exec can't nest). Each build,
   the data scan, the scene's CLI steps and every take run the revisions' own code, so all of them run
   under sandbox-exec: no credential store read, nothing written outside the scratch and temp dirs,
   nothing reached but localhost, and an allowlisted environment (no tokens).
2. **The change**: the paths base → head (privacy-scanned with the commit subjects, before the record
   is even created); any under `src/scan/`, `src/attrib/`, `src/core/layout/`,
   `src/core/snapshot/`, `src/core/contract/`, or what serves the data to each side (`src/state/`,
   `src/core/fog/`, `src/server/`), changes the data itself (R12).
3. **Builds**: `git archive` of each commit (or a copy of the working tree) into the scratch dir (0700),
   this checkout's `node_modules` (same lockfile only, and never over or through a tree's own
   `node_modules`), `npm run build`, and a digest of `dist/web` (files and folders only, no links).
   Then every `dist/web` file name and file's text is privacy-scanned (step 7's rules), before the
   record names it or any take serves it: a build can copy into the view any file the sandbox lets it
   read. There only, a token-shaped run found verbatim in three.js's own build files (this checkout's
   `node_modules/three/build/*.js`: WebGL names like `COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR`) is
   library text, not a token. No other file or package counts, every other rule still applies to it,
   and any other token-shaped run stops the run (`privacy`). Step 7's scans have no such exemption.
4. **View change?** The same `dist/web` on both sides → `no-view-change` (R11), before any capture.
   A diff touching the data paths → `data-change` (R12).
5. **The data**: one clone of this repo at the scene's pinned commit (default: the base), or the
   scene's own small repo (`fixture`: its files in one commit at a fixed date, after any `earlier`
   commits at theirs, the same SHA every run),
   scanned once with `--no-ingest` and an empty `CLAUDE_CONFIG_DIR` (0 sessions, or `data-change`), then
   the scene's setup (a beacon, a chart). Every take starts from a copy of that state. Drones come only from the
   scene's script, through the server's hooks: no agent log is read (R12). The data repo's commit
   subject, the layout's roots and the start state's file names are privacy-scanned before the record
   names them.
6. **Takes**: four, each in its own process and browser: before twice, after twice. Each build serves
   itself (its own server and `dist/web`, in-process, 127.0.0.1, a fresh token). The view's
   `requestAnimationFrame` is stepped by hand, 50 ms of loop time a tick (R1), at the scene's viewport
   (default 1280x720). A scene that can't reach its state stops with `scene-unreachable`. The page may
   load nothing but that server: any other request is refused and stops the run (`privacy`).
7. **Privacy**, of every take that finished, before any is compared, so no stop leaves an unscanned
   take behind (a take that failed wrote no log to scan, so its dir is removed): every frame's page text
   (text nodes, attributes, input values), every API response, the event stream, the state files, the
   page errors, the scene's notes and still names, and both commit subjects (those before the record is
   even created), for absolute paths, `~/`, `file:` URLs, the launch URL or token, token-like strings
   (three's WebGL names too: step 3's exemption is the bundle scan's alone), secret prefixes,
   agent-log fields, and this machine's own paths. Any hit → `privacy`, whatever else stopped the
   run, before any image is written and before the notes and page errors go into the record (R5).
8. **Determinism**: both takes of each build, frame by frame: any pixel, still, probe or page text that
   differs → `takes-differ` (R2).
9. **Before → after**: per still, the changed pixels, their box and which part of the view (each open
   panel, the HUD, the 3D view and labels), and the scene's probes before and after; the images (R3).
10. **Summary**: `summary.md`, privacy-checked, for the PR description (R4).

### 3. Read what it made
**Read all three files `DONE` names, in full:** the sheet (every shot, before | after, on one image),
`summary.md`, and the record. Don't grep them, and don't stop at the terminal output. Then check:
- Every shot on the sheet: does it show what the change is about? A shot with `no pixel changed` proves
  nothing about it. A shot that looks wrong: open its `-shotN-pair.png` for the full-size frames.
- Do the numbers say it? For a fix, the probe that measures the bug should move (e.g. `798 before, 0 after`).
- Did either build's page log errors (the record's take steps)? Say so; don't hide them.

### 4. Report
**One line per shot, from the sheet: what its before and after show.** Then paste `summary.md` into the
PR draft as it is. List the images for the lead to attach (the GIF, the sheet and the pairs, with their
sizes; GitHub takes 10 MB at most), and the record's path. Attach nothing yourself.

## Expected result

`DONE`: both builds built and differ, four takes with 0 frames differing between takes of a build,
0 privacy hits, and for each still a before | after pair, a change mask and the measures, all on one
contact sheet, and one GIF.
Anything else is a `STOP` and is reported as it is.

## Stop and ask

On exit 3, the run has written the stop into its record (`Status: stopped (<code>) …`). Report the
code, its message and detail lines, and ask the user what to do:
- `no-view-change`: base and head build the same view (R11). Nothing to film; say so in the PR instead.
- `data-change`: the diff touches the scanner, attribution, layout, snapshot, a contract, the state
  readers, the fog model or the server (R12), or the scan read agent sessions. Both sides would not see the same data; ask before filming anyway.
- `build-failed`: the base or head (or the data clone's scan) didn't build; the tail is in the record,
  the full log in the scratch dir. Also when a side's `package-lock.json` differs from this checkout's:
  this checkout's `node_modules` isn't its dependencies, and its own `npm ci` needs the network. Also
  when a side's tree has its own `node_modules` (tracked, or in the working tree: a symlink, a folder
  or a file): the run copies this checkout's in outside the sandbox, so never over or through one.
  Also when a build wrote a symlink or a special file into `dist/web`, or `dist/web` isn't a folder.
- `scene-unreachable`: the scene couldn't get the view where it needed (a click opened nothing, a
  planet isn't in the layout). Check the scene with `vp.sh try` on each side.
- `takes-differ`: a take isn't reproducible: the frames named differ. Don't retry until it passes;
  find what in the view or the scene depends on wall time, and report it.
- `privacy`: what was found and where (masked). Nothing was composed, and the scratch dir with the raw
  takes is removed (even with `--keep`). Even if it looks like repo content (a path in a diff), report
  it and let the user decide. A view that reached past its local server is a `privacy` stop too. So is
  a hit in a changed path (before anything is written), in a build's `dist/web` (a file name, or text
  in a file: e.g. a build that copied a private file into the view), or in the data repo's subject,
  the layout's roots or the start state's file names.
- `tool-missing`: what to install, in the message. `sandbox-exec can't nest: already sandboxed` means
  run it from a shell that isn't sandboxed (not the agent runner's checks or a sandboxed Bash tool).
- `bad-input`: a ref that isn't a commit, an unknown scene, no folder for the record (`--out`).

Exit 1 is a bug in the skill (or a take that crashed without a STOP: Playwright, or the build's server):
report the record's `Internal error` step and the take's output above it.

## Where things go

Only scratch goes in `/tmp` (`/tmp/visual-proof-<id>`: the builds, the data clone, the raw takes), and a
restart can wipe it. What the run makes is kept in the main checkout's gitignored
`.archive/docs/hackathon/evidence/`: the record `visual-proof-<id>.md`, and beside it the folder
`visual-proof-<id>/` with `summary.md`, the GIF, the contact sheet (`-sheet.png`: every shot's pair,
each labelled with its numbers), and per shot the pair, the before and after frames and the change
mask. The record's start lines say where both are.

## Stopping (early or not)

The run cleans up after itself: on `DONE` it removes the scratch dir (unless `--keep`), and on
`no-view-change` too; on `privacy` always. On any other stop it keeps it for a look; once you've reported, remove it:
`rm -rf /tmp/visual-proof-<id>` (the id is the record's name). The run never touches a branch, the
worktree or this repo's `.git/commet`; `git status` is as it was.

## Adding a scene

A scene is one TypeScript module in `scenes/`, listed in `scenes/index.ts`; `scripts/scene.ts` says
what it may do. It declares its data (`repoAt`, or its own `fixture` repo, with `earlier` commits for history such as a
file last changed before the scan's 24-month window, or `repo(dest)`, a test fixture's own builder for data one
author can't make, such as `crew`'s `buildCrewRepo`; `roots`; `setup` CLI steps;
scripted `drones`), its `viewport`, whether it runs under reduced motion, `gifScale` (a whole-number
shrink for a big viewport's GIF), and a `run(s)` that drives the view with real input and records.
A scene that needs shots in different pages (another viewport, motion on or off, other drones) lists
`parts` instead of `run`: each part is a fresh page and server in the same take, from the same start
state; frames and stills run on across parts, and `gif: false` keeps a part (at another viewport) out
of the GIF. In a `run`:
- `s.record(n)` steps the clock n frames and screenshots each; `s.advance(n)` steps without recording;
  `s.still(name)` marks the last frame as a shot (a pair and a summary line).
- `s.keepLabels()` keeps the label canvas: the `label px drawn under #<panel> since the keep` probes then
  count what changed under each open panel (the #169 tests' method). `report` picks the probes shown.
- `s.measureDrones()`, after a still, measures the drones from the page's own pixels (the #189
  debugger's method: a seam skips the drone shader's draws): `drone px drawn`, `drone px visible`, and
  `drone px drawn under #drone-panel`. The same frame is drawn again, so the take goes on unchanged.
  The summary reads them as "drone visible: 0 of 2320 px before, N of M after".
- `s.locateDrone()` finds where this build draws the drones now, by the same seam: click its `centre` to
  select a scene's one drone in either build, wherever that build puts it (none visible: `s.fail`).
- `s.measureFog(regionOf)`, after a still, measures the fog the same way: a seam draws the frame again,
  overlays hidden, with every program's `uFogOn` at 0 (a body drawn as if nothing on it were fogged), and
  the pixels that differ are the fog: `fog px`, and per region `regionOf(x, y)` names, `fog px on <region>`
  and `px of <region>`. Moons carry their fog per instance, so theirs isn't counted.
- Recording every other tick (`s.advance(1); s.record(1)`) halves the frames; the GIF still plays in
  loop time (each frame is shown until the next one's time).
- `s.focusPlanet(path)`, `s.click(x, y)`, `s.press(key)`, `s.dismissOffer()`, `s.cli(…)` (the build's
  CLI in the clone, mid-take; then `s.waitFor` its effect), `s.waitFor(what, check)`, `s.fail(why)`.
- Where things are on screen comes from this checkout's own camera and drone code: `scenes/helpers.ts`
  (`homePose`, `bracketPose` for the camera after `]` presses under reduced motion, `droneAt`,
  `findDrone`, `scriptedDrone`, `scriptedDetail`) and `scenes/parcels.ts` (`parcelsOnScreen`: which
  file's fog parcel each pixel shows, by the fog shader's nearest-cell rule, for `measureFog`). Check the click landed (the panel opened), since the
  build under test may place things differently.
- A scene must be a function of the layout and the frame clock: no wall clock, no randomness. Then run
  `vp.sh try --head <ref> --scene <name>`: it prints each still's boxes and probes and saves its frame.

Worked examples: `panel-labels` (#169: this repo's system, reduced motion, a note and a scripted drone,
two shots); `drone-panel` (#189: its own four-file repo and three parts: seed 28 held still at the
bottom left of its planet at 1280x720 and 1920x1080, then seed 78 orbiting into its open panel for 12 s
at 1920x1080 with motion, the GIF at half size); `fog-levels` (#201: its own two-commit repo, one planet
whose three files are untouched in the window, changed with no session, and changed then charted, opened
at its pole from the directory view so all three parcels show; their fog measured per parcel).
