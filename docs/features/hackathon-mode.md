# Feature: Hackathon mode (glance view)

## Status
Draft. Design decision approved by the human 2026-11-09. Not in Phase 2. Issue #34.

## Trigger
The human, 2026-11-09: "add a hackathon mode as a design decision feature to the app, where, since you don't have time to understand the codebase, it should just be to view it and get it at a quick glance."

Idea from the same session: "the actual app should have an overlay that colours each planet, with each colour being a separate worker whether that's a specific agent session or an individual human."

## Decisions (human, 2026-11-09)
- **Fog:** hidden while the mode is on, and **nothing is charted**. Turning it off brings back the exact fog you had. This keeps constitution principle 2 intact: fog clears only through review, and the mode never records understanding you don't have.
- **What it shows:** where the work is, who wrote it, health.
- **Toggle:** `commet open --glance` starts in the mode and an in-app toggle switches live. It is per launch and not saved.

## Requirements
- [ ] H1. `commet open --glance` opens in hackathon mode. An in-app toggle switches between glance and normal view without reloading. Nothing about the mode is saved to `.git/commet/`.
- [ ] H2. Fog is not drawn while the mode is on. A glance session leaves chart state byte-identical (test: chart state before and after a glance session, including toggling).
- [ ] H3. **Where the work is:** planet size (LOC, from layout) plus recent churn per planet over the last day and the last week. "Recent" is anchored to HEAD's commit date, never the wall clock.
- [ ] H4. **Who wrote it:** per planet, the share of changed lines in the window that are agent, mixed, human and unknown, from attribution. Unknown is never shown as human (Rule 1).
- [ ] H5. **Health:** the planet's health band from #18 (debt markers, plus Qodo findings when #17's cache exists). If Qodo data is unknown, the view says so.
- [ ] H6. The glance summary is a pure function of (snapshot, layout) in `src/core`, with a golden on the fixture repo. Identical input gives identical output.
- [ ] H7. No per-person scores, rankings or tallies (principle 2). Shares are per planet, never per person.
- [ ] H8. Glance labels and figures render crisp, outside the pixel pass (principle 4), and survive the 320×180 internal resolution.

## Candidate: worker overlay (human idea, 2026-11-09)
Colour each planet by worker, where a worker is one agent session or one individual human. Not approved for build yet. Open questions:
- **Granularity:** one colour per planet (its dominant worker) loses mixed planets. Per surface cell (file territory) shows mixing but is busier.
- **Colour assignment:** deterministic, from the session's drone seed (R2b) or a hash of the person ID. The BLK 36 palette has a limited number of distinct colours, so many workers need an overflow rule (for example "other agents", "other humans").
- **Principle 4:** overlay colours must not be confusable with health-band looks or decorative biomes. It probably needs to be a separate overlay mode that replaces the planet look while active.
- **Principle 2:** the overlay shows territory, not counts. No legend that ranks people by area.
- **Data limits:** teammates' agent work is only visible through trailers, bot authors or git-ai notes (R6). Everything else of theirs is unknown, and unknown needs its own colour.

## Assumptions
- [ ] Churn is measured in changed lines per planet. The other option is commit count. Not load-bearing for the contract.
- [ ] "Last day" and "last week" are the two churn windows. Configurable later.
- [ ] Load-bearing: the mode builds on #30 (R4 view), #32 (R14 server), #33 (R5 fog) and #18 (layout). It can't be finished before they land.

## Flow
`commet open --glance` → local server (R14) serves snapshot, layout and the glance summary → the view starts with fog hidden and the glance layer on → the toggle switches to the normal view and the real fog comes back from chart state, unchanged.

## Research
None yet.

## Tasks
- Issue #34: hackathon mode. Blocked by #30, #32, #33, #18.

## Completion
- Merged: —
- Date: —
- Verification: —
