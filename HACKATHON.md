# Hackathon Playbook (24 hours, 4 people)

## Timeline

| Hour | Activity | Who |
|------|----------|-----|
| 0:00-0:30 | Idea finalized. Run `/spec` to write SPEC.md | All together |
| 0:30-1:00 | Choose stack, scaffold project, fill in CLAUDE.md | One person |
| 1:00-2:00 | Build 3 demo screens with hardcoded data | Frontend person |
| 1:00-2:00 | Set up backend skeleton + sponsor API integration | Backend person |
| 2:00-8:00 | Parallel feature work on branches | Everyone on own branch |
| 8:00-9:00 | First merge. Run `/integrator` or merge manually | One person |
| 9:00-16:00 | Wire real data into demo screens. Integrate sponsor API | Everyone |
| 16:00-18:00 | Second merge. Polish demo path only | One person merging |
| 18:00-20:00 | Deploy. Test on production URL | One person |
| 20:00-22:00 | Presentation prep. Record backup demo video | All together |
| 22:00-24:00 | Buffer for last-minute fixes. Practice demo | All together |

## Team branches

Each person works on their own branch. Never commit directly to main.

```bash
# At start, each person:
git checkout -b feature/[your-area]

# When feature works:
/ship

# To merge (one person at a time):
git checkout main
git pull
git merge feature/[branch]
# fix conflicts if any
git push
```

## Claude Code tactics

### Each person runs their own Claude session
```bash
# Person A (frontend)
claude

# Person B (backend)
claude

# Person C (sponsor API integration)
claude

# Person D (polish/deployment)
claude
```

### Skills cheat sheet
| Command | When | What it does |
|---------|------|-------------|
| `/spec` | Hour 0 | Interview -> SPEC.md with demo script and team split |
| `/fix` | Something breaks | Paste error, get fix. Max 3 cycles. |
| `/verify` | Before merge | Build, types, lint, tests, diff review. PASS/FAIL report. |
| `/ship` | Feature done | Build, test, commit, push. One command. |
| `/demo` | Hour 20 | Write pitch script from what's actually built |
| `/unstick` | Claude is looping | Meta-debug: diagnose pattern, recover, retry differently |
| `/secure` | Before deploying | 5-min security scan: secrets, debug code, exposed endpoints |

### Speed rules
- `/clear` between unrelated tasks. Don't let context get stale.
- After 2 failed corrections, `/clear` and rewrite the prompt with what you learned.
- Use `@filename` to reference files instead of describing them.
- Paste screenshots for UI work. Claude reads images.
- Commit after every working feature. `git commit` is your save button.
- One feature per session. Start fresh for the next feature.
- Claude auto-runs `/verify` after code changes and `/fix` on failures. Let it.

### When stuck
- `/fix [paste the error]` first. Handles 80% of hackathon bugs.
- If `/fix` doesn't work: `/clear` and describe the problem from scratch
- Use the `explorer` agent: "Use the explorer agent to find where X is defined"
- Use the `reviewer` agent before merging: "Use the reviewer agent to check my changes"
- Ask a teammate. 5 min of human conversation beats 30 min of fighting the AI.

## Demo-first development

Build what judges will see, in this order:

1. Demo screens (hardcoded data, looks polished)
2. One real user flow through the whole app
3. Sponsor API integration on the demo path
4. Polish: loading states, transitions, error handling on demo path only

Things that don't matter for the demo: auth, CRUD for non-demo entities, error handling on non-demo paths, caching, tests, CI, responsive design on screen sizes judges won't see.

## Sponsor API quick reference
<!-- Fill in at kickoff: the 2-3 calls you'll actually use -->

### Setup
- API key in `.env` (never in source)
- SDK: [install command]
- Docs: [link]

### Core calls
```
[paste the minimal working snippet for each call on the demo path]
```

### Limits
Check the plan dashboard for rate/usage limits.
Track usage during the hackathon so you don't hit the cap during the demo.
