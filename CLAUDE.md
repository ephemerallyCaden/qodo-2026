# Commet: art mockup branch

> Commet is a local-first, pixel-art 3D explorer that helps a solo developer working with AI coding agents keep a real mental model of their own codebase. This branch holds **design mockups**: throwaway prototypes that settle the art, not product code.

**This branch is not the product line.** It grew from the initial template commit, so `AGENTS.md`, `CONSTITUTION.md`, `docs/` and `src/` aren't here. They live on `main` and the `session/*` branches, and they apply here too. Read them from git:
- `git show main:AGENTS.md`: house rules shared by every agent and by Qodo.
- `git show main:CONSTITUTION.md`: principles, autonomy and quality gates (approved).
- `git show session/week1:docs/design/art-direction.md`: the visual source of truth. If a mockup and this document disagree, the document wins.
- `git show session/week1:docs/features/asset-library.md` and the other feature docs under `docs/features/`.
- `JOURNAL.md` and `.archive/` are gitignored. Use absolute paths: `<main-checkout>/JOURNAL.md`, `<main-checkout>/.archive/art-iteration/INDEX.md` (the full art history). `<main-checkout>` is `$(git rev-parse --path-format=absolute --git-common-dir)/..`.

`HACKATHON.md` and the 24-hour, four-person template rules that used to be here don't apply to Commet. Ignore any copy of them on older branches.

## Mockups (each folder is its own npm project)
| Folder | What | Dev server |
|---|---|---|
| `mockups/asset-viewer/` | The reference implementation of the art direction: factories, shaders, palettes | 127.0.0.1:5180 |
| `mockups/asset-library/` | The demo playground: catalogue, inspector, scene composer, palette editor | 127.0.0.1:5190 |
| `mockups/explorations/astronaut-lab/` | Astronaut variants A–J and K (archive) | 127.0.0.1:5186 |
| `mockups/drone-lab/` | The drone (agent session) designs, on `feature/drone-lab` | 127.0.0.1:5192 |

In a mockup folder: `npm ci` (or `npm install`), `npm test` (headless Chromium + SwiftShader, no socket, no network), `npm run dev`, and `npm run shots` or the folder's own render script where it has one. The tests are slow on a busy machine (1–3 minutes per browser test file).

## Rules
- Stack: three.js `WebGLRenderer`, GLSL and plain ES modules. Every asset is live 3D through the pixel pipeline (320×180 default, nearest-neighbour upscale), with no sprite sheets, outlines, anti-aliasing or dithering.
- **Determinism:** no `Math.random` and no wall-clock time in render code. The same seed and time give the same pixels. Render tests must fail on empty output.
- **Palettes:** the crew (astronauts, drones) uses BLK 36 exactly; the world uses v2; [OIII] teal is the only accent and marks events only. Rings and clouds reuse planet-family colours.
- **Planet looks carry data:** a planet's look shows its code health (see the art direction §6). Nothing decorative may look like a data signal.
- **Loopback only:** dev servers bind 127.0.0.1, serve a file allowlist, and the page makes no network requests. Downloaded references stay in `.archive/` (gitignored), never in the repo.
- **Privacy:** never copy code, prompt text or absolute paths from agent logs into any output.
- Golden and pixel-identity tests are updated deliberately with a reason, never regenerated just to pass. The asset viewer's tests must stay green, and the asset library must stay pixel-identical to it.
- Read files before editing. No features beyond the task. Match existing patterns; don't refactor adjacent code.
- **Stage explicit paths only.** Never `git add -A` or `git add .`; other sessions write files in this checkout.
- Qodo can't see binary files. Report visual results as text (test output, colour counts, pixel diffs) in PRs.

## Branching
- `main` changes only with the human's approval. Never merge into or push `main`.
- Mockup work happens on `feature/<name>` branches in worktrees under `.sandboxes/`. The team lead merges; other agents only commit on their own branch.
- Commits: conventional style (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `design:`), small and focused.
