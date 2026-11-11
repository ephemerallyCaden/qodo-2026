# Feature: Content roots (break `src/` into planets)

## Status
Complete (2026-11-11). Design decided by the human 2026-11-11. Issue #71.

## Trigger
The human, 2026-11-11, after trying `commet scan`: "I think it should ask the user what their main content file is, because we want to break src down into multiple parts not have src as just one planet yk?"

Today every top-level folder is one planet (#18). In most repos one folder (`src/`, `lib/`, `packages/`) holds most of the code, so the planet that matters is a single blob and its structure is hidden.

## Decisions (human, 2026-11-11)
1. **Choosing:** the first `commet scan` guesses the main content folder and asks to confirm. It remembers the answer. `--root <dir>` overrides it. Without a terminal (hooks, CI, the agent runner) the scan uses the saved answer, else the guess, and never blocks.
2. **Saved where:** local only, in `<git-common-dir>/commet/`, like all other state. Teammates choose their own. Nothing is committed.
3. **Other top-level folders** stay planets, on an **outer ring** beyond the content planets. Nothing disappears, and the main code sits closest to the star.
4. **Multiple roots** are allowed: `--root src --root web`, or several in the prompt answer. That covers monorepos (`packages/*`).

## Requirements
- [x] C1. **Guess.** Pick the folder holding the largest share of non-test, non-test-data LOC at HEAD. Show it as a suggestion with its share (e.g. "src holds 78% of the code"). Offer a root only if it has at least 2 subfolders with surface files; otherwise the current mapping is fine and nothing is asked.
- [x] C2. **Prompt** (TTY only): `Use src as the system root? [Y/n/other]`. "other" takes one or more space-separated folder paths, each validated as an existing folder at HEAD. "n" means no root, which is today's mapping. The answer is saved.
- [x] C3. **Non-interactive:** with no TTY, use the saved answer, else the guess, and print one line saying which, plus how to change it (`--root`, or `commet scan --ask`). Never block.
- [x] C4. **Flags:** `--root <dir>` (repeatable) overrides and saves. `--no-root` forces today's mapping. `--ask` re-prompts. Unknown or invalid paths exit 2.
- [x] C5. **State:** `<git-common-dir>/commet/config.json` (canonical JSON, mode 0600, through the state I/O) holds `{ roots: string[] }` only, with repo-relative paths. No other data.
- [x] C6. **Layout:** each root's direct subfolders with surface files are **content planets**, on the inner orbits. Every other top-level folder with surface files is an **outer planet**, on orbits beyond them. Placement rules within each group are unchanged (#18: birth order, partner, append-only). The roots themselves are not planets.
- [x] C7. **Determinism and record:** roots are an input to `layout()`. `layout.json` records `source.roots`, and identical (history, roots) gives byte-identical output. Changing the roots is an explicit user action and may re-place planets. Adding files and commits still never moves a body (#18 properties hold per group).
- [x] C8. **Fog** counts planets exactly as the layout does. `FogView.planets` covers content and outer planets.
- [x] C9. **Contract amendment (spec by the team lead; the feature agent applies it with the code):**
  - `LayoutV1.source.roots: string[]`: repo-relative, sorted, no trailing slash; `[]` means today's mapping.
  - `Planet.zone: 'content' | 'outer'`: always `'outer'` when `roots` is `[]`.
  - Moonlet `kind: 'root-file'` also covers files directly inside a root.
  - `docs/contracts/phase2.md` is amended with the reason; the mini fixtures gain `roots: []` and `zone: 'outer'`.
  - The view's layout validator accepts the new fields. The view needn't style zones yet.
- [x] C10. **Privacy:** config.json, the prompt and the output never contain absolute paths.

## Assumptions
- [x] A1. **Decided (human, 2026-11-11):** files directly inside a root (e.g. `src/cli.ts`) become **moonlets of the star**, like repo root files (`kind: 'root-file'`). Every planet is a real subfolder.
- [ ] A2. Tests stay moons of the planet that holds their `testOf` target, which may now be a content planet such as `src/core`.
- [ ] A3. With no root (today's mapping), output is byte-identical to the current layout, so existing goldens don't change.
- [ ] A4. The outer ring starts one slot spacing beyond the outermost content slot that could be needed. Exact spacing is a layout constant.

## Flow
`commet scan` → (no saved roots and a TTY) guess + prompt → save `config.json` → scan → `layout(snapshot, history, roots)` → `layout.json` (with `source.roots`) → fog uses the same planet set → `commet open` shows content planets close to the star, outer planets beyond.

## Research
Measured on Commet's own repo (2026-11-11): 6 top-level planets; `src` carries 56 of 148 files and 21 test moons. With `src` as the root, it would become `src/core`, `src/scan`, `src/attrib`, `src/state`, `src/server` and `src/cli` (6 content planets), with `.claude`, `docs`, `.github`, `factory` and `web` as outer planets.

## Tasks
- #71: content roots (C1–C10).

## Completion
- Merged: PR #72 (fb714cf) to session/week1
- Date: 2026-11-11
- Verification: 704/704 Vitest, 18/18 render; A3 identical modulo `source.roots`/`zone` on this repo, structure and mini; this repo with `--root src` has 11 planets (6 content, 5 outer).
