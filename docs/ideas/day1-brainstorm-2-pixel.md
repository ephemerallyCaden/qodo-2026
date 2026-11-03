# Brainstorm 2: Pixel-art game projects

*2026-11-03. Replaces brainstorm 1. Builder strengths: majestic pixel-art frontends, plus shipped games across genres (fantasy metroidvanias, hip rhythm games).*

## Ground rules from the field
Two entrants are already in pixel-art game territory:
- **Hearth:** a cozy pixel RPG where your AI agents appear as characters.
- **Swarmbreak:** a daily roguelike whose dungeons are built from real websites, shipped as PRs.

Our idea must not be "agents shown as pixel characters" or "a daily procedurally generated dungeon".

## The factory thesis for pixel-art games
**"The factory can't see or play the game, so we teach it to."**

Qodo reads code diffs. It can't tell that a sprite has a stray anti-aliased pixel, that a jump is now 2 px too short to reach a ledge, or that a note chart drifted 40 ms out of sync. Swarmbreak's Day 1 lesson said it outright: *design rules have to be written down before a reviewer can check them.* Our factory writes them down and enforces them in three layers.

| Layer | What it checks | How | Week |
|---|---|---|---|
| **Pixel-art linter** (deterministic) | Palette compliance, no mixels (mixed pixel scales), no anti-alias halos, integer scaling, sprite grid sizes, outline rules | CI script over the assets. Code-side rules become a Qodo **Skill** (`SKILL.md`), enforced by the Skill insight agent | W2 Standards |
| **Bot playtester** | The level can be completed, ability gates are sound, the rhythm chart is in sync and humanly playable, the difficulty curve holds | Solver or headless "perfect player" in CI. Outputs a pass/fail plus a replay GIF | W3 Connect |
| **Visual evidence** | Key frames before and after, attached to every PR | Playwright screenshots. Qodo **Design gaps** agent checks against a mock (RP, Figma) | W3 Connect |
| **Approve or escalate** | Auto-merge if linter, bot and Qodo are all green. **Game feel and taste always escalate to the human, with the replay GIF attached** | GitHub Action reading `qodo review --json` plus check results | W4 Automate |

The last row is the honest answer to the final submission's "where human judgment remains necessary": the factory proves a level *works*, and the human judges whether it's *fun*.

---

## 10 ideas

### 1. The Growing Castle: a metroidvania built one ticket at a time
- **Pitch:** A persistent pixel-art castle. Anyone files a ticket like "a flooded crypt room behind the double-jump gate, with a bat miniboss". The factory builds the room and Qodo reviews it. A solver bot proves the castle is still fully reachable under ability-gating rules, then the room merges and the castle map grows.
- **Wow:**
  - A live castle map where every room is clickable and shows the ticket, PR, Qodo review and bot replay that created it.
  - The factory's whole history becomes an explorable world.
- **Day 1:** one hand-drawn room plus a reachability check from the entrance to the exit.
- **Verification:** a metroidvania lock-and-key graph solver, which is a real, rigorous check that suits this genre.
- **Overlap:** Swarmbreak also ships content as PRs. Ours differs because the content comes from human tickets, persists and accumulates, and is checked with gating proofs.

### 2. Echo Keep: a rhythm metroidvania
- **Pitch:** Explore a castle where everything moves on the beat: platforms, enemies, doors. Each zone has its own track. Crypt of the NecroDancer meets Hollow Knight.
- **Wow:** majestic pixel environments pulsing in sync. It combines both of your genres.
- **Day 1:** one room where a platform moves on the beat of a looping track.
- **Verification:**
  - Beat-sync tests (every movement lands on a beat within ±N ms).
  - A bot proves each room can be cleared at the track's tempo.

### 3. Beatsmith: any song becomes a playable chart
- **Pitch:** Drop in a track, or pick a CC-licensed one. The factory generates a rhythm-game chart with a hip pixel-art stage that reacts to the music.
- **Wow:** your favourite song, playable, in seconds.
- **Day 1:** detect the beats in one track and spawn notes on a single lane.
- **Verification:**
  - Notes line up with audio onsets within a tolerance.
  - Ergonomics rules: max notes per second, no impossible hand crossings, density matched to difficulty.
  - A perfect-play bot scores 100%.

### 4. Sprite Synth: draw pixel art, hear it play
- **Pitch:** A pixel canvas that is also a sequencer. Columns are time and rows are pitch, and palette colours pick the instrument. Draw a dragon and it plays a melody. Import any song and it becomes a sprite.
- **Wow:** instant and shareable ("listen to my Link sprite"). It fuses pixel art with rhythm.
- **Day 1:** a 16×16 canvas that plays back column by column.
- **Verification:** deterministic audio rendering (golden-file tests), timing tests, and a palette-to-instrument mapping contract.

### 5. Pixel a Day: a daily picross (nonogram) of your art
- **Pitch:** A Wordle-style daily nonogram that reveals a beautiful pixel-art piece when solved, with shareable result grids.
- **Wow:** daily ritual and virality, plus your art as the reward.
- **Day 1:** one playable 10×10 puzzle.
- **Verification:**
  - The puzzle must have exactly one solution, proven by a solver.
  - This is a real gate: ambiguous nonograms are a known flaw.
  - It is the purest "factory proves the content is valid before it ships" story.

### 6. Commit Groove: play any GitHub repo as a rhythm game
- **Pitch:** Paste a repo URL. The commit history becomes a song and a chart: commit frequency sets the tempo, file types pick the instruments, and Qodo findings appear as hazard notes.
- **Wow:** made for the judges. They're developers, and they'll want to play their own repo.
- **Day 1:** one repo's commits rendered as a playable lane.
- **Verification:** the same chart rules as Beatsmith, plus a mapping contract that guarantees the same repo always produces the same song.

### 7. Pulse: a rhythm game for deaf and hard-of-hearing players
- **Pitch:** A rhythm game designed from the ground up to be played without sound. Visual rhythm cues, haptics (Gamepad and Vibration APIs), and pixel-art "sound made visible".
- **Wow:** a game that includes players others leave out. Emotional, and the cause is real.
- **Day 1:** one track playable with visual and haptic cues only.
- **Verification:**
  - Accessibility standards act as factory rules: every audio cue has a visual counterpart, and there are flash and photosensitivity limits.
  - A bot checks that cues line up.

### 8. Lexicon Keep: a language-learning metroidvania
- **Pitch:** Words are abilities. Learn the Japanese for "jump" to double-jump, and "fire" to burn vines. The castle is gated by vocabulary.
- **Wow:** learning disguised as a gorgeous adventure.
- **Day 1:** one gate that opens when a word is answered correctly.
- **Verification:** reachability under vocabulary gating, plus content correctness (translations checked against a dictionary source) with human sign-off on language claims.

### 9. Maker Arena: a pixel level editor where uploading requires a clear
- **Pitch:** A browser level editor in the spirit of Super Mario Maker, with your pixel tilesets. As in Mario Maker, you can't publish a level until it's proven clearable. Here a bot proves it, and the bot's replay is the proof.
- **Wow:** a slick editor plus a "ghost bot" clearing your level live.
- **Day 1:** place tiles and have a bot find the path to the flag.
- **Verification:** the product's publish gate works the same way as the factory's merge gate, which makes for a neat story.

### 10. Clean Pixels: turn any image into *correct* pixel art
- **Pitch:** Not a blurry downscale. It converts images to real pixel art with a limited palette, clean outlines and no stray anti-aliasing, and grades the result with a pixel-art linter.
- **Wow:** a before/after slider. It shows off your expertise.
- **Day 1:** convert one image to a 16-colour palette at integer scale, with a linter score.
- **Verification:** the linter is the product and the factory infrastructure at once.

---

## Ranking

| # | Idea | Wow | Fit for you | Factory story | Distance from Hearth and Swarmbreak | Scope risk |
|---|---|---|---|---|---|---|
| 1 | The Growing Castle | ★★★★★ | ★★★★★ | ★★★★★ | Medium (vs Swarmbreak) | Medium |
| 4 | Sprite Synth | ★★★★★ | ★★★★★ | ★★★★ | **High** | Low |
| 2 | Echo Keep | ★★★★★ | ★★★★★ | ★★★★ | High | **High** |
| 3 | Beatsmith | ★★★★ | ★★★★★ | ★★★★★ | High | Medium |
| 6 | Commit Groove | ★★★★ | ★★★★ | ★★★★ | High | Low |
| 5 | Pixel a Day | ★★★★ | ★★★★ | ★★★★★ | Medium | **Low** |
| 9 | Maker Arena | ★★★★ | ★★★★ | ★★★★★ | High | Medium |
| 7 | Pulse | ★★★★ | ★★★★ | ★★★★ | High | Medium |
| 8 | Lexicon Keep | ★★★★ | ★★★★ | ★★★ | High | High |
| 10 | Clean Pixels | ★★★ | ★★★★★ | ★★★★ | High | Low |

## Top 3
1. **The Growing Castle.** The strongest factory story: tickets literally become a world, and every room is proven reachable. Your metroidvania skills are the showcase.
2. **Sprite Synth.** The most unique and immediately shareable. It fuses your two genres, and its scope stays small.
3. **Beatsmith.** The deepest *verification* story: sync tolerances, ergonomics rules and a perfect-play bot, in your rhythm-game territory.

**Possible fusion:** the Growing Castle's rooms move on the beat (Echo Keep). That has the most wow, but the scope roughly doubles. Treat it as the Week 4 stretch goal, not the starting point.

**Shared infrastructure whichever we pick:** the pixel-art linter (Week 2) and the bot playtester (Week 3).
