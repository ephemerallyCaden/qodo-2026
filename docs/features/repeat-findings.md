# Feature: Repeat findings become rule proposals

## Status
Ready

## Trigger
Day 5 challenge, "Make your factory self-improve". Since Day 2, AGENTS.md has said "A finding seen twice becomes a proposed rule here or a Qodo review standard." That sentence never fired. Qodo flagged the same git-output framing mistake 5 times in 3 days (PR #3, three times on ticket #16 locally, then PR #20), and nobody proposed a rule until a human prompted for one (Rule 7, PR #36). Human decisions (2026-11-11):
- Turn the sentence into a mechanism in the agent runner, with no backtest feature.
- A mistake becomes a rule proposal on its **3rd** sighting. Approving the proposal is how AGENTS.md gets updated.

## Requirements
- [x] **R1 Every PR, not only the runner's.** The runner records the Qodo findings on every PR in the repo whose author is the repo owner (which includes the runner's own PRs, since it uses the owner's gh login). It does not look only at the PRs it opened. All 5 framing findings came from PRs and local reviews the runner never touched. PRs by anyone else are ignored (same trust boundary as agent-runner R12). Local review results count too: the `qodo review --json` exports agents save under `<main-checkout>/.archive/docs/hackathon/evidence/` (AGENTS.md "Working with Qodo"). That is where most repeats were caught, before any PR existed. Of the 5 framing findings, only 2 ever reached a PR.
- [x] **R2 Ledger.** Findings are kept in a local ledger under the git common dir (`.git/factory/`), one entry per Qodo finding id: the PR, title, description, file, category and when the review ran. The same finding seen again (a later poll, a re-listed `still_open` id, or a local id carried into the PR) is not a new finding.
- [x] **R3 Sweep.** Each runner tick checks for new findings on PRs whose review changed since the last sweep. The same sweep is available as a CLI command so the lead can run it by hand. A tick with nothing new to read makes no LLM call.
- [x] **R4 Fail closed.** A failed, timed-out, partial or skipped Qodo read never marks a PR's findings as processed; it is logged and retried on a later tick. A judge answer that doesn't parse, or that cites ids the ledger doesn't have, is treated as no decision and never becomes a proposal.
- [x] **R5 What counts as a repeat.** Findings are grouped by the underlying mistake they make. A group becomes a proposal when it has **3 findings from at least 2 different sources**. A source is one ticket: a PR and the local reviews of its own ticket count as one source. One finding id counts once, however many rounds re-list it. Without the 2-source condition, a naive "seen twice" check would fire on about half of all 221 findings, mostly from iteration inside one PR (see Research). Matching works for a kind of mistake nobody has named yet, so a keyword list written in hindsight can't be the judge (see Research).
- [x] **R6 Proposal.** When a group first meets the R5 threshold, the runner opens one GitHub issue labelled `rule-proposal`. It contains:
  - links to every finding in the group (PR and finding);
  - one sentence naming the shared mistake;
  - a draft rule saying what to do, where it applies and why;
  - any existing Qodo rule that already seems to cover it (from Qodo's rule search), so the human can choose between a new rule and strengthening the old one;
  - an `## Acceptance criteria` section describing the AGENTS.md change.

  With that section, the human approves by labelling the issue `ready-for-agent`. The existing runner flow then writes the AGENTS.md change as a PR, which Qodo reviews and the human merges. A later finding in the same group comments on the open issue instead of opening another.
- [x] **R7 The human decides.** The runner never edits AGENTS.md, never creates or changes Qodo rules, and never closes or relabels a proposal, and never adds `ready-for-agent` to one. Its only new GitHub writes are creating `rule-proposal` issues and commenting on them. The runtime guard still blocks every other `issue create`, and AGENTS.md's list of the runner's GitHub writes says so.
- [x] **R8 Privacy.** Proposal issues and comments contain only Qodo finding titles, descriptions and links, plus the judge's summary and draft rule. No absolute local paths, no content from agent session logs (AGENTS.md Rule 2, CLAUDE.md Privacy).
- [x] **R9 Seeding.** The first sweep after install records all existing findings as history without opening any proposals. The lead can seed history up to a chosen PR, so the next sweep handles later PRs as new. This is for a one-off demo for the Day 5 post.
- [x] **R10 Bounded cost.** LLM calls per sweep are capped. A sweep that hits the cap leaves the rest for the next tick and logs that it did.
- [x] **R11 AGENTS.md.** The "seen twice" line is rewritten to say what now happens and who decides. It still applies to reviews outside the runner's reach: an agent running a local `qodo review` that sees a repeat says so in its report.
- [x] **R12 Offline tests.** The decisions are covered by tests in the existing fake world (`test/factory/world.ts`), with no network:
  - 2 findings of a group open nothing;
  - the 3rd, across 2 sources, opens one issue;
  - 3 findings within one source open none;
  - a 4th finding comments on the open issue;
  - a local review export counts as its ticket's source;
  - a proposal issue passes the runner's own ticket checks (acceptance criteria present, owner-opened), so labelling it works;
  - a qodo failure leaves the PR unprocessed and retried;
  - a garbled judge answer opens nothing;
  - seeding opens nothing;
  - the guard still refuses other issue creates;
  - the label set includes `rule-proposal`.
- [x] **R13 One real round trip.** Before merge, one manual run against real data, not mocks: the real judge, given two real framing findings from different PRs (PR #3 `f73bda3f`, PR #20 `991e5e69`), calls them the same mistake, and calls an unrelated pair different. Put the result as text in the PR. This is a verification, not a backtest feature.

## Design
- **Modules.** `factory/ledger.ts` (ledger, reads, sources, thresholds; pure), `factory/judge.ts` (prompts, schemas, answer checks; pure), `factory/proposal.ts` (issue and comment text; pure), `factory/repeats.ts` (the sweep), `factory/shell.ts` (the gh and qodo plumbing the tick and the sweep share). Every `tick` that isn't a dry run sweeps after its ticket work, and `npm run factory -- sweep [--dry-run] [--seed-through <PR>] [--max-calls <n>]` runs it by hand under the same lock.
- **Ledger.** `.git/factory/findings/ledger.json` (written atomically, mode 0600), its log `sweeps.jsonl`, and post bodies in `posts/`. A damaged ledger stops the sweep and is never reset; move it aside to reseed.
- **Reads.** `gh pr list --author <owner>`, checked again client-side. A PR is read when it's open, changed since its last full read, or never fully read. A read is complete only when qodo exits 0, the output parses, it isn't truncated and every run is over (`completed`, `aborted`, `superseded`). Otherwise nothing from it is kept. A complete read always keeps its findings, but the PR counts as done only when a real (not `skip`) review covers its head, that review started at least `settleMs` (3 min) ago, and two reads agree on that head review and the finding ids (findings land after a run completes, as the runner's own done-check knows). A finding missing from a PR's last whole read is dated just after that read, not by its commit's first run. Until then it's read again every sweep, and a settled closed PR is still read once a day. Local exports count only when `finding_state.complete` and `meta.coverage.complete` are both true and the effort isn't `skip`; an export over 5 MiB is reported as partial. A `false_positive` dismissal is recorded but never counted.
- **Sources.** Union-find over PR, ticket, branch and export nodes. A PR joins the tickets it closes (body keywords, `<type>/<N>-` branch, a `(#N)` title suffix) and its branch, except a shared `session/*` branch. An export joins the ticket or PR its name gives (`t16-…`, `pr27-…`) or a PR whose branch it names (`day5-rules-local-r1.json` → `docs/day5-rules`). Every place one finding id was seen joins up. A Day PR (head `session/*`, e.g. #93) re-reviews work that has its own tickets: it joins no ticket or branch and bridges nothing through shared ids, and a finding seen only on Day PRs counts toward a group's total but never supplies a source (lead, 2026-11-11; in the first real sweep, 2 of 19 groups reached 2 sources only through #93).
- **Judge.** `claude -p` with `--tools ""`, `--no-session-persistence`, `--strict-mcp-config`, `--json-schema`, a replacement system prompt and the cwd in the temp dir. It places up to 20 findings per call into existing groups (and may broaden a group's name) or new ones. The group level is "one project rule's worth": a kind of code or decision and what a reviewer must check there. Any answer that skips, repeats or invents an id is no decision. A finding that garbled an answer is retried alone, and after 3 garbled answers it's set aside and counted. A call that never reached the model (no billed cost: auth, network, API, timeout) stops all of the sweep's LLM calls, drafts included, without counting against any finding; one the model answered but failed (schema retries, a spend or turn cap, a refusal) counts against its batch. The prompt goes on stdin, since the group catalogue grows with the ledger. Like the agent's calls, the judge loads only the user's settings (`--setting-sources user`), and it runs from HOME, not a temp dir agent-run code may write.
- **History.** The ledger keeps a seed cutoff: when it was created, or the `--seed-through` PR's latest review. A finding reviewed at or before it is history, whichever sweep reads it, so history a first sweep couldn't read stays history.
- **Proposals.** A group with 3 counted findings from 2 sources and at least one non-history finding gets a draft (1 call), then a `qodo read rules search` on it, then the issue. A closed proposal gets no comments; later findings stay in the ledger and the log. A hidden marker (`<!-- commet-rule-proposal g-… -->`) lets a sweep adopt an issue whose ledger write was lost. Posts are redacted (this checkout and HOME, then other users' homes and macOS temp folders), collapse every quoted text to one line, defuse `@mentions`, and keep finding text to 300/2000 chars. Each comment carries a hidden list of the finding ids it posted, so a lost ledger write can't post them twice; only the owner's own comments are trusted for that list (every page of them).
- **Cost.** At most 4 LLM calls and 20 minutes per sweep by default. The run cap test includes the sweep.

## Assumptions
- [x] Qodo has no stable "same kind" key across PRs. Verified by the scout, see Research.
- [x] `qodo read pr-review-session findings --pr-url <url> --json` returns a PR's whole finding history, resolved findings included. Verified (probed on PR 3, 20, 36).
- [ ] Qodo's own "raised before" tools (`pull-request similar-suggestions`, `review-history`) may help once they're back up (they were `MT-UPSTREAM-DOWN` on 2026-11-11). Not load-bearing.

## Flow
Runner tick → (existing ticket work) → sweep:
1. List the owner's PRs whose Qodo review changed, plus any new local review exports.
2. Read the findings (`qodo read … findings` per PR) and add new ids to the ledger.
3. Propose first for groups already at the threshold (step 4), so a judging backlog can never starve proposing. Then judge each new finding against the existing groups, and add it to one or start a new group, with the calls that remain. Groups that judging completes are proposed in the same sweep.
4. When a group reaches 3 findings from 2 sources, run Qodo's rule search, then open a `rule-proposal` issue, or comment on the group's open issue.
5. Update the ledger and the log.

The human then reads the issue. Labelling it `ready-for-agent` makes the runner open the AGENTS.md PR; Qodo reviews it and the human merges.

## Research
Scout report, 2026-11-11 (repeat-findings-scout):
- **Sources.**
  - `qodo read pr-review-session findings --pr-url <full URL> [--extended] --json`: about 1 s per call, no rate limit hit over ~25 calls. It includes resolved findings (`attribution_status: implemented`).
  - Fields: `id`, `title`, `description`, `category`, `action_level`, `attribution_status`, `git_sha`, `location{file_path,start_line,end_line}`, `evidence.citations`. Only with `--extended`: `evidence.explanation` and the dismiss fields.
  - No per-finding timestamp. Map `git_sha` to `review_runs[].started_at`; compact mode omits `review_runs`.
  - Local and PR reviews share ids. Local findings still open at PR time keep their id; ones resolved before the PR never reach it.
  - Gh bot comments lose finding ids once resolved, so they aren't a reliable source.
- **Runner today.**
  - It already polls the `--extended` findings for its own PRs [review.ts:54, runner.ts:501-506]. Done = ids stable across two polls [review.ts:107-112].
  - The fix prompt is `fixPrompt` [agent.ts:123-152].
  - State lives in `.git/factory/` (`lock`, `ticks.jsonl`, `runs/…`). Findings are logged as ids only, and there is no cross-run index.
  - `agent()` always `--resume`s the coding session [runner.ts:354], so it can't be the judge as is.
- **GitHub writes.**
  - The runner already uses `gh issue|pr comment --body-file`, `issue edit` (labels), `pr create`, and `label create --force` with `LABEL_DEFS` [launchd.ts:121-132].
  - `issue create` is blocked by `factory/guard.ts:9-13`.
  - Allowing a `rule-proposal` issue touches the guard, AGENTS.md's runner-writes list, the fake gh in `test/factory/world.ts`, and the labels test that expects exactly 4 labels [cli.test.ts:153-170].
- **Matching.**
  - `category` has 5 values, 76 of 127 are Correctness.
  - Rule `similaritiesCount` and `insights` are null everywhere.
  - Only 6 of 127 findings cite a rule.
  - Titles of the 5 framing findings share no keywords.
  - A description regex matched all 5 and nothing else, but it was written in hindsight and can't name a new class. Hence an LLM judge, with keywords at most as a cheap pre-filter.
  - `qodo read rules search` ranks semantically: a framing query returned "NUL-frame path-listing git output" first. It's a good "is there already a rule?" check.
- **Noise.** About 110 of 221 findings sit in groups of 2+.
  - Real cross-PR groups: path leaks ~11 (a rule exists, 4544802), symlinks ~5, missing perf figures in PR descriptions 6, goldens without a reason ~7, Windows paths ~5, "looks clean" review/CI state ~6, damaged-state handling ~6.
  - Same-PR iteration: chart lock ~10, snapshot/layout pair ~5, folder identity ~7.
- **Ground truth for R13.**
  - Framing: PR 3 `f73bda3f` "One source line can corrupt patch parsing", PR 20 `991e5e69` "Scans fail when the latest commit is empty".
  - Binary (same group, 6): `95e870d9`, `5ef964d6`, `6fc19b85`, `0ea2ad6a`, `121cfee5`, `bd677269`.

## Tasks
- Task: feature agent `repeat-findings` in `.sandboxes/repeat-findings` on `feature/repeat-findings`. Covers R1–R13. In progress.

## Completion
- Merged:
- Date:
- Verification:
