# CONSTITUTION

*Approved by the human on 2026-11-04. Principle 4 amended at the human's direction on 2026-11-09 (planet looks encode code health). Only the human may change this document.*

## Mission
Build **Commet** (working title). It's a local-first, pixel-art 3D explorer that helps a solo developer working with AI coding agents keep a real mental model of their own codebase. Teammates can be shown too, but only ever on your own machine.

Build it with an agent software factory: coding agents, project standards, tests, and Qodo review, taking an idea to a reviewed PR. This is the entry for Qodo's "Build a Software Factory in 30 Days" hackathon (Nov 2 – Dec 2, 2026; solo entry).

## Product principles (non-negotiable)
1. **Client-side only.** No remote server, no telemetry, no uploads, and nothing posted to GitHub. The only server is Commet's own hardened local one (see Requires human approval). The app only reads local git data and writes local files. Optional read-only GitHub API calls must be explicit opt-ins. *Roadmap exception, not v1:* opt-in peer-to-peer live presence, which needs a minimal signalling relay, would require amending this principle first.
2. **Understanding, not output.** No XP for commits or PRs, no streaks, no leaderboards, no per-person scores. Fog clears through review and comprehension.
3. **Deterministic.** The same repo always gives the same snapshot, layout and frame. A frame is a pure function of (snapshot, chart state, camera, frame number). `Math.random` is banned in pipeline, layout and render code.
4. **Readable pixel art.** Visual properties either encode data or are seeded variety that stays inside one meaning. A planet's look encodes its code health in ordered bands; size, moons, fog, drones, debris and constellations encode the rest (the art direction §6 lists every channel). Nothing decorative may look like a data signal. Labels and UI render crisp, outside the pixel pass.

## Tech stack (pinned at scaffold, then locked by the lockfile)
- TypeScript (strict), Node ≥ 20, npm.
- **CLI:** Node with native `git` via child_process. No language parsers.
- **Shape:** one `commet` npm package (scanner, CLI, terminal mode) plus one web bundle, served by `commet open`. A VS Code extension wraps the same bundle later.
- **Web:** Vite-built static bundle, three.js `WebGLRenderer` (not WebGPU), GLSL.
- **Tests:** Vitest (unit, golden, property). Playwright with SwiftShader for golden images.
- New dependencies need a one-line justification in the PR description.

## Autonomy (team lead may act alone)
- Plan tasks, write feature docs, contracts, JOURNAL and CLAUDE.md, and project-level agent prompts.
- Create sandboxes and feature branches, and spawn scouts, feature agents, debuggers and bar raisers.
- Merge feature branches into the session branch after the quality gates pass.
- Push the session branch and feature branches to `origin`.
- **Open PRs to `main` so Qodo can review them**, which the hackathon requires.
- **Open task PRs from `feature/*` into `session/*` branches on `origin`**, so Qodo reviews every task, not just the daily PR to `main` (human, 2026-11-04). Watch Qodo credit use.

## Requires human approval
- Merging into or pushing to `main`, deploying or publishing anything (hosting, npm), and posting to the hackathon Discussions.
- Any network-exposed surface. Both the dev server and `commet open` bind to 127.0.0.1 only. `commet open` also checks the Host header, requires a per-launch token and sends no CORS headers.
- Changes to this constitution.

## Branching strategy
- `main` is protected and changes only with human approval.
- `session/<name>` branches come off `main`, and `feature/<name>` and `debug/<name>` branches come off the session branch.
- Integrate by rebase + fast-forward. Each daily deliverable goes to `main` as one focused PR with a Qodo review.

## Quality gates (every merge)
1. Build, typecheck, lint and all tests pass.
2. Golden and property tests are updated deliberately, never regenerated just to make them pass.
3. The diff is on-task, with no secrets and no debug leftovers.
4. Every PR to `main`: the Qodo review has completed on the head commit with **zero unresolved `action_required` findings**, or the human has explicitly waived each one, with the waiver recorded in JOURNAL.
5. Anything touching network exposure is checked against the builder-security skill.

## Escalation
- Two failed attempts to resolve a blocker.
- Any conflict with a product principle.
- A Qodo finding the team lead believes is wrong but can't verify.
- Missing credentials or access.
- Scope that threatens a weekly deadline (Nov 8, 15, 22, 29, and Dec 2).

## Self-improvement loop (after each merge cycle)
Ask what slowed us down, what an agent misunderstood, and what Qodo caught or missed. Turn recurring Qodo findings into Review Standards or Skills (Week 2 theme). Record each change in JOURNAL.

## Team name
`qodo-2026`
