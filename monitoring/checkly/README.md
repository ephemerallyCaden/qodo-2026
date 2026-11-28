# Commet demo monitor (Checkly)

A Checkly browser check, as code, of the public demo at https://ephemerallycaden.github.io/qodo-2026/ (live-demo L7). It's its own npm project: the product's `package.json` and lockfile don't change, and nothing here ships with Commet.

**Dependency:** `checkly` 10.5.0, pinned exactly as a dev dependency of this folder only. It's Checkly's own CLI, the one way to deploy checks as code. `@playwright/test` is pinned to the repo's 1.65.0 for local runs, alongside `typescript` and `@types/node`. Node 22.13 or later (the CLI's own floor).

## What it checks

`__checks__/demo.spec.ts`, through the shared journey in `__checks__/journey.ts`, opens the demo as an anonymous visitor and asserts each step:

1. the page answers 200; the title screen shows, with the `DEMO: invented data` label;
2. Play starts the live view: the screen-reader summary describes the system, and the badge says `Demo: invented data`;
3. the canvas isn't blank: at least 12 colours, and at least 0.5% of it off the space colour (the render tests' floors);
4. `]` focuses the first planet: the status line says `focused <path>`, and the summary gives its path and its exact `N files on the surface`. Both values come from the site's own baked data (`data/manifest.json`, then the layout it names), never from numbers written here;
5. no page or console errors, and no request to any origin but the site's own: one is stopped before it leaves the browser, and fails the check. The data it reads is only the site's own `data/*.json`.

**Schedule:** hourly, from one location (`us-east-1`). That's about 730 browser-check runs a month. Check it against the browser-run quota of the Checkly plan in use; the Hobby plan was the target. Checkly's runtime `2025.04` fixes the Playwright and browser versions it runs with.

**Alerts:** by email, on failure and on recovery. The address is `CHECKLY_ALERT_EMAIL`, read at deploy time from the key file and never committed (`__checks__/demo.check.ts` refuses to deploy without one).

## The key file

The human creates it once, outside the repo:

```sh
mkdir -p ~/.config/commet
touch ~/.config/commet/checkly.env && chmod 600 ~/.config/commet/checkly.env
# then add three lines in an editor:
#   CHECKLY_API_KEY=<a user API key: Checkly, User settings, API keys>
#   CHECKLY_ACCOUNT_ID=<Checkly, Account settings, General>
#   CHECKLY_ALERT_EMAIL=<where the alerts go>
```

`scripts/checkly.sh` refuses to run unless the file is a plain file (not a symlink) of mode `600`. It reads it as `KEY=value` lines for those three keys only, so the file is never sourced or run. It never prints a value. `deploy`, `drill` and `restore` run only this folder's own `node_modules/.bin/checkly`, at the version pinned in `package.json`; they refuse, before reading the key, when it isn't installed (`npm ci` here first), so the key never reaches a CLI that npx fetched. `npm run env-check` confirms the file is right without deploying anything.

## Commands

From this folder:

| Command | What it does | Needs the key |
|---|---|---|
| `npm ci` | install the pinned tools | no |
| `npm test` | the check's spec and the drill's test, with plain Playwright, against the live demo (`DEMO_URL` overrides it) | no |
| `npm run test:local` | the same, against a fresh `npm run build:demo` served by `vite preview` on 127.0.0.1:5186 (`PORT` overrides it) | no |
| `npm run typecheck` | `tsc` over the config, checks and tests | no |
| `npm run env-check` | checks the key file and names what it sets | yes |
| `npm run deploy` | deploys the hourly check and its email channel | yes |
| `npm run drill` | deploys them plus the temporary failing check | yes |
| `npm run restore` | a normal deploy, which removes the drill check | yes |

The repo's own `npm run lint` covers this folder. Its typecheck doesn't, because these packages are installed only here; use `npm run typecheck` in this folder. The repo's `test/monitoring.test.ts` checks that nothing here is shaped like a key, account id or email.

## The alert drill

The drill proves that a failing check reaches the inbox. The drill check is `__checks__/drill.spec.ts`: the same journey, expecting a planet the demo doesn't have (`drill/no-such-planet`), so it fails at the focus step. It's in the project only when `CHECKLY_FAIL_DRILL=1`. It runs every 10 minutes and sends to the same email channel. `tests/drill.spec.ts` proves locally that it fails, and fails at that step.

1. `npm run drill`. The deploy adds the check `DRILL (temporary): Commet demo names a planet that does not exist`.
2. Wait for the failure email. The drill runs within 10 minutes.
3. `npm run restore`. A normal deploy makes the account match this project, so the drill check is deleted. Confirm in the Checkly dashboard that only `Commet demo: opens, plays, draws, names a planet` is left. Don't restore with `--preserve-resources`: that would keep the drill check running.

A drill left deployed spends browser runs (about 4,300 a month at 10 minutes), so restore it the same day.
