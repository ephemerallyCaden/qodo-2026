# Crew fixture repo (#207 C11)

A scripted repo with an invented crew, for the crew scan tests, the crew renderer's tests and the Day 18 film. Identities and dates are fixed, so the SHAs, person ids and crew come out the same on every machine. No real person's name or address is in it.

Build it:
- in a test: `await buildCrewRepo(realTempDir('commet-crew-'))` from `repo.ts`;
- by hand: `npx vite-node test/fixtures/crew/make.ts -- <empty or new folder>`.

Then `commet scan --no-ingest --no-root` inside it. With no content root, `engine/`, `ui/` and `docs/` are the planets, and `README.md`, `package.json` and `.mailmap` sit on the star. Without `--no-ingest` the scan reads your own agent logs (none match this repo, but don't). The repo's config sets `user.email` and `commet.selfEmail`, so you are the captain whatever your global git config says.

## The crew

| Person | Commits as | Case |
|---|---|---|
| Nova Reyes (you, captain) | `nova@crew.test`; `Nova R. <nova@old-laptop.test>` | `user.email`, plus `commet.selfEmail` merging another name and email into you |
| Ada Quill | `ada@crew.test`; `A. Quill <a.quill@contractor.test>` | `.mailmap` alias |
| Bram Tiller | `bram@crew.test`; `bram.t@home.test` | exact-name alias, no mailmap entry |
| Cleo Varga | `cleo@crew.test` | touches a file before and after its rename |
| Dax Imura | `dax@crew.test` | adds a file that is deleted later (`otherFiles`) |
| Esme Holt | `7700001+esme-holt@users.noreply.github.com` | a person's own GitHub noreply address: crew, not a bot |
| dependabot[bot] | `49699333+dependabot[bot]@users.noreply.github.com` | bot, never crew |
| Cursor Agent | `cursoragent@cursor.com` | agent author, never crew |

So the crew is 6 people (you and 5 teammates), with 2 bot or agent authors left out.

## Commits (one a day from 2026-10-01, 10:00 UTC)

| # | Author | Changes |
|---|---|---|
| c1 | Nova | `.mailmap`, `README.md`, `engine/core.ts`, `ui/panel.ts` |
| c2 | Ada (contractor address) | `engine/core.ts`, `engine/physics.ts` |
| c3 | Bram | `ui/panel.ts`, `ui/menu.ts` |
| c4 | Bram (home address) | `ui/menu.ts` |
| c5 | Cleo | `ui/menu.ts`, `docs/guide.md` |
| c6 | dependabot | `package.json` |
| c7 | Cursor Agent | `engine/physics.ts` |
| c8 | Dax | `engine/legacy.ts` (new), `engine/core.ts` |
| c9 | Esme | `docs/guide.md`, `README.md` |
| c10 | Nova (old laptop) | `ui/hud.ts` |
| c11 | Nova | renames `ui/menu.ts` → `ui/nav.ts` (no content change, so no touch) and deletes `engine/legacy.ts` |
| c12 | Ada | `engine/physics.ts`, `ui/hud.ts` |
| c13 | Cleo | `ui/nav.ts` |

`test/golden/crew.json` is the crew view and every member's panel from this repo: a JSON twin the renderer's tests can load without git.
