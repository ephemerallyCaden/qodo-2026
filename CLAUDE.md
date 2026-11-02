# [PROJECT NAME]

> [One sentence: what it does and who it's for]

## Stack
<!-- Fill in at kickoff -->
- Framework:
- UI:
- Database:
- External APIs: [sponsor API + anything else]
- Deploy target:

## Commands
<!-- Fill in once stack is chosen -->
- `[dev command]` to start dev server
- `[build command]` to build
- `[test command]` to run tests
- `[lint command]` to lint

## Architecture
<!-- Fill in after initial scaffolding -->
- Entry point:
- API routes:
- Components:

## Sponsor API
<!-- Fill in at kickoff -->
- API key in `.env` as `[SPONSOR]_API_KEY`
- Docs: [link]
- SDK: [install command]

## Rules
- Read files before editing. Don't guess what exists.
- No features beyond what was asked. Hackathon scope is tight.
- Match existing patterns. Don't refactor adjacent code.
- Run build/test after changes. Fix what you break.
- Commit after every working feature. Small commits, clear messages.
- If unsure, ask. Don't assume and build the wrong thing.
- No abstractions for one-time code. Inline is fine for 24 hours.
- Skip error handling except on the demo path.

## Context management
- When context feels long (50+ tool calls, or responses getting shorter): write your current plan to PLAN.md, then run `/compact`.
- Compact AFTER: finishing a research phase, fixing a bug, completing a feature.
- Do NOT compact DURING: active implementation, multi-file changes, debugging.
- After compacting: read PLAN.md and SPEC.md back to restore state.

## Agent auto-routing
Use these agents and skills proactively without being asked:
- After writing code that changes behavior: run `/verify` to check build/types/lint/tests
- When a build or test fails: run `/fix` with the error output
- Before committing: run `git diff` and scan for debug code, hardcoded secrets, console.logs
- When starting a new feature: read SPEC.md first to check scope and team ownership
- When exploring unfamiliar code: use the `explorer` agent, don't read files one by one

## Team
Four developers working in parallel on feature branches.
- Merge to `main` only when your feature works and builds.
- Coordinate with teammates before touching shared files.
- Each person owns their branch. Don't edit others' branches.
