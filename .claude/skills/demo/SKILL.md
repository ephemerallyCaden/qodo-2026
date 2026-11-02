---
name: demo
description: Generate pitch script and demo plan from the actual codebase. Use at hour 20.
---

# Demo Prep

Reads what's actually built and produces a demo-ready pitch script.

## Process

1. Read SPEC.md (if it exists) for the original vision.

2. Explore the codebase to understand what was actually built:
   - Read the main entry point and route/page structure
   - Identify all working features (pages that render, API routes that respond)
   - Identify sponsor API integration points
   - Check what's deployed vs local-only

3. Write `DEMO.md` with:

```markdown
# Demo Script — [Project Name]

## Pitch (3 minutes)

### Opening (30 seconds)
[Problem statement. One sentence. Then show the app.]

### Core demo (90 seconds)
Step 1: [Exact click/action] — [What judges see] — [What to say]
Step 2: [Exact click/action] — [What judges see] — [What to say]
Step 3: [Exact click/action] — [What judges see] — [What to say]

### Sponsor moment (30 seconds)
[The moment where the sponsor API makes it impressive. Be specific about what happens.]

### Close (30 seconds)
[Tech stack one-liner. What's next. Thank the judges.]

## Pre-demo checklist
- [ ] App running on [production URL]
- [ ] Demo data seeded / account ready
- [ ] Sponsor API key active and under usage limits
- [ ] Backup: screen recording saved to [path]
- [ ] Browser tabs pre-opened to starting state

## Known fragile points
[Things that might break during the demo and how to recover]

## Talking points if asked
- Tech stack: [what and why]
- Team split: [who built what]
- What would you build next: [one concrete feature]
```

4. Present the script. Ask for changes before writing.

## Key rules
- Only include features that ACTUALLY WORK. Read the code to verify.
- The demo path must be tested end-to-end before presenting the script.
- If something is broken, flag it in "Known fragile points", don't pretend it works.
- Time each section. 3 minutes total. Cut ruthlessly.
