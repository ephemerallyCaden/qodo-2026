---
name: spec
description: Interview the user to turn a vague idea into a concrete spec. Use at hackathon kickoff.
---

# Spec Writer

Turn a hackathon idea into a buildable spec through rapid-fire questions.

## Process

1. Ask the user to describe their idea in 1-2 sentences.

2. Interview them with 5-8 focused questions using AskUserQuestion. Cover:
   - Who is the user? What's their pain point?
   - What's the core interaction? (the one thing the demo must show)
   - What does the sponsor API add? (which capability, and why it matters)
   - What data flows through the system?
   - What's the "wow moment" for judges?

3. Write `SPEC.md` with:

```markdown
# [Project Name]

## One-liner
[What it does, for whom]

## Demo script (60 seconds)
1. [What the judge sees first]
2. [Core interaction]
3. [Wow moment]

## Screens
- Screen 1: [name] - [what it shows]
- Screen 2: [name] - [what it shows]
- Screen 3: [name] - [what it shows]

## Architecture
[Simple diagram: user -> frontend -> backend -> sponsor API/DB]

## Team split (4 people, 24 hours)
- Person A: [scope] - branch: feature/[name]
- Person B: [scope] - branch: feature/[name]
- Person C: [scope] - branch: feature/[name]
- Person D: [scope] - branch: feature/[name]

## Sponsor API integration
- API: [which endpoints]
- Use case: [what feature it powers]

## Out of scope (don't build these)
- [thing that sounds cool but won't make the demo]
```

4. Present the spec and ask for changes before writing.
