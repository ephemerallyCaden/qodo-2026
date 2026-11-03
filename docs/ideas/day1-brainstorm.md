# Day 1 Brainstorm: 10 visual project ideas

*2026-11-03. Constraint: the builder's strength is frontend art and visualisation.*

## What the hackathon actually judges

Verified against the hub README and `templates/final-submission.md`:

- **The project is the vehicle. The factory is the workflow you build around it.** README: "Build in your own project repository… connect coding agents, project standards, tests, and Qodo code reviews to take an idea through to a reviewed pull request."
- **Both get judged.** The final submission asks for "the project **and** the workflow from a ticket or idea to a reviewed pull request", "where human judgment remains necessary", and "how Qodo reviews, project standards, tests, or workflow checks influenced your work".
- **The rules weight challenge completion highest**, then working quality, verification thinking, and demo clarity.
- **So the project can be anything.** Most entrants built ordinary apps: EatUp, Otahque, goSpot.

## The angle that suits an art and visualisation person

**Visual work is the hardest thing for a text-based AI reviewer to verify.**

- Qodo reads diffs; it can't see that a colour is off-brand, that a chart misleads, or that an animation stutters.
- Swarmbreak's Day 1 lesson said the same: "game-design rules have to be written down before a reviewer can check them."
- Your factory story writes itself: **how do you get agents to deliver *visual* work you'd sign off on, without eyeballing every PR?** That gives each week a theme:
  - **W1 Build:** the first visual capability, plus a Qodo review.
  - **W2 Standards:** art direction written down as rules. That means design tokens, palette, motion and typography rules imported as Qodo **Rules and Skills** (the "Skill insight" agent enforces imported skills).
  - **W3 Connect:** Playwright screenshots and visual-regression diffs attached to every PR. A vision-model "art director" check runs next to Qodo, and the **Figma integration** (Research preview) feeds in design context.
  - **W4 Automate:** auto-approve when visual diffs stay inside tolerance and Qodo has no high-severity findings. Escalate to a human, with before/after images, when taste is the deciding factor.
- **Nobody else in the field owns "a visual software factory".** That's a gap you're unusually well placed to fill.

---

## The 10 ideas

Each idea lists the pitch, who it helps, the wow moment, the first small capability, and the factory angle (where the checks get interesting).

### 1. Cartographer: your neighbourhood as a hand-illustrated fantasy map
- **Pitch:** Pick any area. OpenStreetMap data gets rendered as a Tolkien- or Ghibli-style illustrated map: hand-drawn coastlines, painted forests, calligraphic labels. Export it as a print.
- **Who:** travellers, D&D game masters, couples (wedding and housewarming prints), local businesses.
- **Wow:** type your street and watch it turn into a storybook map. Very shareable.
- **Day 1:** render one bounding box of OSM roads with a hand-drawn line style.
- **Factory angle:**
  - Geographic fidelity tests: every road in the source appears and labels don't collide.
  - Deterministic render snapshots.
  - Style rules (stroke weights, palette) as Qodo standards.

### 2. Explorables: a factory that ships one interactive explainer per ticket
- **Pitch:** Bret Victor / Nicky Case-style explorable explanations, such as how herd immunity works, why traffic jams appear from nowhere, or how a hash map works. Each ticket is a concept; the factory ships it as a reviewed PR.
- **Who:** students, teachers, curious people.
- **Wow:** a growing library of beautiful, playable lessons, each produced by the factory and verified.
- **Day 1:** one explorable with one slider that drives a live simulation.
- **Factory angle:**
  - **Requirement gap** checks each explorable against its learning-objectives ticket.
  - Simulation correctness tests against known closed-form results.
  - Accessibility and motion-reduction standards.
  - The factory's throughput is the product: the most natural "ticket → reviewed PR" story.

### 3. Chartroom: data stories whose charts can't lie
- **Pitch:** Drop in a public dataset and get a scrollytelling data story. The twist is a "chart honesty" check: truncated axes, dual-axis tricks, area-distorted bubbles and cherry-picked ranges get flagged.
- **Who:** journalists, students, analysts, anyone who shares charts.
- **Wow:** a misleading chart gets caught and auto-corrected side by side.
- **Day 1:** render one CSV as a chart, with one honesty rule ("bar axis must start at zero") enforced.
- **Factory angle:**
  - Verification is the product. The honesty rules become Qodo standards *and* runtime checks.
  - Pixel-to-data tests: a bar's height must match its value.
  - The project and the factory reinforce each other.

### 4. Atelier: an infinite gallery wall of the world's open-access art
- **Pitch:** A zoomable, pannable canvas of thousands of public-domain works from the Met, Art Institute of Chicago and Rijksmuseum APIs. Arrange them by colour, era or mood, then drift through art history.
- **Who:** art lovers, students, teachers, designers looking for references.
- **Wow:** zoom from a rainbow mosaic of 10,000 paintings down to a single brushstroke.
- **Day 1:** fetch 50 CC0 works and lay them out sorted by dominant colour.
- **Factory angle:**
  - **Licensing and attribution as a merge gate:** only CC0 images, with credit always rendered.
  - Performance budgets (frames per second, memory) as automated checks.
  - Image-loading tests.

### 5. Orrery: the real sky above you, beautifully drawn
- **Pitch:** A live, artistic solar system and satellite tracker. The ISS, Starlink trains and planets are rendered in a celestial-atlas style, centred on your location and time.
- **Who:** stargazers, kids, educators, photographers planning shots.
- **Wow:** "The ISS passes over your house in 4 minutes. Here's its path across your sky."
- **Day 1:** draw the planets at today's correct positions.
- **Factory angle:**
  - **There's ground truth to check against:** positions are tested against NASA JPL Horizons and CelesTrak data.
  - Agents can't hand-wave physics, so it makes a great verification story.

### 6. Tidewatch: see the future coastline of your street
- **Pitch:** An illustrated, scroll-driven 3D view of sea-level-rise and flood projections for any coastal address, using NOAA, Climate Central and IPCC scenario data.
- **Who:** homeowners, students, local councils, climate communicators.
- **Wow:** your street, watercolour-rendered, slowly flooding as you scroll to the year 2100.
- **Day 1:** one location with one scenario and an elevation-threshold overlay.
- **Factory angle:**
  - **Scientific accuracy is non-negotiable.** Data provenance gets labelled on every view.
  - Scenario values are tested against source tables.
  - Humans approve anything that makes a claim.
  - This one shows clearly where human judgment remains necessary.

### 7. Seen: experience any website the way other people see it
- **Pitch:** Paste a URL and see it through colour-vision deficiencies, low vision, cataracts or dyslexia simulations, with live WCAG contrast fixes suggested on top.
- **Who:** designers, developers, accessibility advocates. It helps real people.
- **Wow:** a split-screen slider between your view and theirs, with "fix it" swatches.
- **Day 1:** apply one colour-vision-deficiency filter to a screenshot, plus a contrast-ratio readout.
- **Factory angle:**
  - The colour science is deterministic: Brettel/Machado matrices and the WCAG formula, so property tests are possible.
  - The project eats its own dog food: the factory enforces its own accessibility standards.

### 8. Chronoscope: zoom from the Big Bang to this morning
- **Pitch:** One continuous zoomable timeline of history, built from Wikidata, with illustrated eras and a smooth jump in scale from billions of years down to minutes.
- **Who:** students, history lovers, teachers.
- **Wow:** a single scroll gesture from the dinosaurs to the Moon landing.
- **Day 1:** render 100 Wikidata events on a log-scale zoomable axis.
- **Factory angle:**
  - Date correctness and citation tests.
  - Rendering-performance budgets.
  - A rule that "every event links to its source".

### 9. Terrain: your codebase as a living landscape
- **Pitch:** Turn any GitHub repo into a generative illustrated landscape. Files become terrain, commit history becomes erosion, hot spots become volcanoes, and contributors become rivers. Print it as a poster.
- **Who:** developers, open-source maintainers, teams (onboarding, retros, gifts).
- **Wow:** your repo's 5-year history animated as a growing world. The judges are developers, so they'd want their own.
- **Day 1:** map one repo's file tree to a terrain heightmap.
- **Factory angle:**
  - Here the factory can render *itself*: point Terrain at its own repo, and Qodo findings appear as storms on the map.
  - A neat closing beat for the final demo.
  - Distinct from Hearth, which visualises agents, not code.

### 10. Score-to-Scene: songs as animated illustrated worlds
- **Pitch:** Upload or pick a track. Audio analysis (tempo, sections, energy, key) drives a generated illustrated landscape that changes with the music: the chorus brings sunrise, the bridge brings a storm.
- **Who:** musicians, video makers, listeners.
- **Wow:** the same world, scored by two different songs, side by side.
- **Day 1:** detect the beats in one track and pulse one visual element in sync.
- **Factory angle:**
  - The audio analysis is deterministic and testable against annotated tracks.
  - Sync-latency budgets.
  - Licensing checks on the audio.

---

## Ranking (wow × fit with your strengths × factory story × room in the field)

| # | Idea | Wow | Art/viz fit | Factory story | Room in the field | Risk |
|---|---|---|---|---|---|---|
| 1 | Cartographer | ★★★★★ | ★★★★★ | ★★★★ | Open | Map styling is a deep rabbit hole |
| 3 | Chartroom | ★★★★ | ★★★★ | ★★★★★ | Open | Less "art", more data-viz |
| 2 | Explorables | ★★★★ | ★★★★★ | ★★★★★ | Open | Scope creep per explainer |
| 5 | Orrery | ★★★★★ | ★★★★ | ★★★★ | Open | Orbital maths |
| 9 | Terrain | ★★★★ | ★★★★★ | ★★★★ | Near Hearth | "Dev tool" fatigue |
| 6 | Tidewatch | ★★★★★ | ★★★★ | ★★★★ | Open | Data access, and the claims carry weight |
| 4 | Atelier | ★★★★ | ★★★★★ | ★★★ | Open | Image performance |
| 7 | Seen | ★★★ | ★★★ | ★★★★ | Open | Fairly well-trodden |
| 8 | Chronoscope | ★★★★ | ★★★★ | ★★★ | Open | Data cleaning |
| 10 | Score-to-Scene | ★★★★ | ★★★★★ | ★★★ | Open | Audio licensing and analysis |

**Top 3 to choose from:** Cartographer (highest wow and shareability), Explorables (the most natural ticket-to-PR factory story), Chartroom (verification *is* the product).
