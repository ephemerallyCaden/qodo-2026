# Feature: Understanding mode (quiz missions, two-level fog, crew)

## Status
Ready (requirements from a 4-round interview with the human, 2026-11-23). Tasks are GitHub issues, linked below.

## Trigger
The human, 2026-11-23: "Clicking different planets shows you, with cloud fog, what you have and haven't seen yet, but there's currently no way to clear that fog, it just builds up. There should be an understanding/quiz mode, which you can do to explore different files and parts of the codebase and gamify the way you understand it better. I want the end result to be a user being so knowledgeable that when an issue happens, they can, like in old days without vibe coding, say oh let me go through this script to see what the function is that's broken, let me see where this chain goes because I know what it connects to."

The full loop: `commet scan` → your repo is a star system → click planets to explore → a spaceship carries your teammates (astronauts) next to your own agent drones, with an AI summary of what each teammate has worked on → fog shows what you haven't understood yet → missions clear it.

## Requirements
Fog
- [x] U1. **Two fog levels per file.** Fogged: never seen, or changed by someone else. Haze: seen or reviewed (today's charting, or opening a file in the view). Clear: understood (passed a quiz on the current version). (#201: `fog.2`, `chart.2`; the quiz that records a pass is #203.)
- [x] U2. **Changes re-haze.** When a file you've cleared changes (agents, teammates), it drops back to haze, and a short quiz on just the change clears it again. (#201; the short quiz is #203.)
- [x] U3. **Mastery % per planet**, shown on the planet's panel and as its fog coverage. (#201)

Missions (in the 3D view: click a planet → "Start mission")
- [ ] U4. **File quiz, adaptive.** It starts easy and gets harder, and the file clears once you answer a hard question right. Question types are multiple choice and "point at it" (click the planet, file or line in the map). Wrong answers get feedback on what you missed, and a retry gets fresh questions.
- [ ] U5. **Call-chain quiz.** "Where does this go next?": follow a flow hop by hop across files. Answers are points on the map, and passing clears the files on the chain.
- [ ] U6. **Incident drill.** A symptom and an error message lead you to point at the planet, then the file, then the broken line. The bug is planted by the agent and shown only in a read-only, bugged view of the file during the drill. Commet never writes it to the repo. A timer and the hint count feed the score.
- [ ] U7. **Daily mission.** One suggested mission a day, aimed at your foggiest or most recently changed area.

Crew
- [ ] U8. **Teammate spaceship.** Astronauts are every human author in the local git history within the scan window, merged by aliases, with no network. Click an astronaut to see the planets and files they've touched. Agent "armies" are your own drones only; teammates get no drones (their agent logs never reach your machine, R6).
- [ ] U9. **AI summary on demand.** Click an astronaut → "Summarise": your agent reads their recent commits and diffs locally and writes a short brief. It's cached until they commit again.

Views
- [ ] U10. **Directory view.** A 2D file tree alongside the map, for people who'd rather browse folders. It shows each file's fog level, and clicking a file focuses it on the map.

Understanding quality and connections (the human, 2026-11-23, after the loop review)
- [ ] U4a. **Trustworthy answers** (in #203): every answer cites a real file and line that Commet checks. A "this question is wrong" button discards and replaces a question. Clearing needs at least one point-at-it answer.
- [ ] U12. **Weighted mastery and a "start here" order**, from git-only weights (size, churn, connections).
- [ ] U13. **Co-change constellations** (R9): files that usually change together, as lines on the focused item, with a "usually changes with X" flag.
- [ ] U14. **Connections panel**: in / file / out columns with arrows (imports in, imports out), plus a dashed "changes together" group. Click a row to walk the chain, with a breadcrumb.
- [ ] U15. **Agent debrief**: from a drone's panel, a quiz on what that session just changed. A notice offers it after a new session appears.

Agent bridge (shared by U4–U7, U9 and U15)
- [ ] U11. **Your own coding agent writes the questions**, e.g. Claude Code via `claude -p`. There's a one-time opt-in per repo, recorded locally, and everything non-AI works without it.
  - Agent runs get no tools: content goes in on stdin, and the output is untrusted JSON, validated and rendered as text only.
  - Secrets and excluded files (`.env`, keys, anything matching the scan's exclusions) are never sent.
  - Quiz content stays out of `snapshot.json` and `layout.json`, so determinism (R1, R8) holds. Tests use recorded agent responses.

## Assumptions
- [ ] **(Needs the human) CONSTITUTION:** "No remote servers, telemetry or uploads". U11 sends code to the user's own agent provider after an explicit opt-in. The human chose this; the constitution may need a one-line amendment, which only the human can make.
- [ ] Planted bugs (U6) and call chains (U5) depend on the agent reading code. Commet itself has no language parsers, and that stays true.

## Priority (the human, 2026-11-23; about 8 days left)
1. U1–U4 + U11: two-level fog, mastery %, the adaptive file quiz and the agent bridge.
2. U8–U9: the teammate spaceship and the AI summary.
3. U5 + U7: call-chain quizzes and the daily mission.
Then U6 (incident drills) and U10 (directory view).

## Tasks
Headline (challenge-day work):
- #201 Two-level fog + mastery % (U1–U3): blocks the quizzes
- #202 Agent bridge + consent (U11): blocks the quizzes and summaries; needs the human's CONSTITUTION call
- #203 Adaptive file quiz mission (U4)
- #207 Teammate spaceship (U8)
- #208 AI summary on demand (U9)
- #204 Call-chain quiz (U5)
- #206 Incident drills (U6, stretch)
- #212 Connections panel (U14); needs the human's call on text-pattern import detection vs 'no language parsers'
- #213 Agent debrief quiz (U15)
- #210 Weighted mastery + 'start here' (U12)

Side quests (small; ship off a challenge day and note them in a post):
- #205 Daily mission (U7)
- #209 Directory view (U10)
- #211 Co-change constellations (U13, R9)
