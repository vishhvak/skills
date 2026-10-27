# Hillclimb

Improve the app against a fixed eval, one round at a time: read train failures, change one thing, rerun everything, keep the change only when the held-out score says so. The result is the **test-set delta from baseline to the winner**. A gain on cases the analyzer read is the process, not the result.

Requires `phase: ready` (gates 1 to 5 passed). If there is no eval, build one first (`reference/build.md`).

## Setup

Ask these in one batch with the harness's question tool, your recommendation first, then record each answer.

1. **Goal.** Raise the primary metric; or cut cost, context or latency while quality holds (that is `reference/trim.md`); or recover quality on a new model. Every other recorded field becomes a guard that must not regress beyond the margin.
   `goal --target pass --direction higher --hold cost_usd,latency_s --margin 0.05 [--models a,b]`
   `--models` names the models a change must win on; empty means every model in the runs. Margins are absolute for grade metrics and a fraction of the baseline for perf fields (0.05 is 5% more cost).
2. **Scope.** What may change: the system prompt, a skill file, tool descriptions and schemas, model parameters, harness code, a plugin's source. What is off-limits, even if changing it would help (a compliance line, a required tool, a tone). If a skill or instruction file is the target, ask how it reaches the model in the eval: pasted into the prompt (tests the content) or through the app's real loading path (tests whether the model finds and uses it).
3. **Who applies changes.** You apply each round and the user reviews the record (default), or the user approves each diff before it runs (recommend this for customer-facing copy and regulated content).
4. **Stopping and check-ins.** Until plateau (three rounds in a row without a KEEP, then report), one round at a time, or N rounds.
5. **Budget.** `run --dry-run` gives trials per round and the cost estimate. Present (rounds + 1) × that and get a ceiling.

Then hold out the test set: `split` (stratified at random by `tags[0]`, never chosen by baseline score). With under about 20 cases, `split --none` and lean on reps; every score is then directional. After splitting, run `score` and check that the train and test baseline means agree within noise; if they don't, `split --force --seed 2` before round 1.

**Plan gate.** Show the user a two-column table (will change / won't touch), the goal, who applies changes, the stopping rule, the budget, and one paragraph on how you'll run the loop. Record their yes: `signoff plan --note "<their words>"`.

## Round

Run `status` at the start of every round; it names the round (`vN`), and after a run, the scoring and recording commands.

1. **Analyze.** Start one fresh sub-agent per round (independence: it reads only what it is handed). Hand it: the train-split trace paths of the best variant so far (`runs/<best>/<model>/traces/<id>_rep<k>.json`, only ids in `state.json` `split.train`); `score --split train --vs baseline` output; the current artifact; the scope and off-limits list; the round's target and guards; the noise floor. Prompt it:

   > This round targets `<field>` (`<higher|lower>` is better); `<guards>` must not regress. Off-limits: `<list>`. Find the train cases doing worst on the target, plus a few doing best for contrast. Name the one behavior that most often costs it, how many cases show it, and how much it costs across them; a fix cannot gain more than that. The noise floor is about ±`<x>`: if even a full fix lands inside it, say so instead of proposing. Otherwise propose one change as a unified diff that fixes the behavior at its root (rewrite the section that causes it, add the missing rule, fact, tool or example), which may touch several places but serves one hypothesis. Describe the failure behavior, never paste a case's content into the artifact. For every trace you cite, quote the lines and give its path. Predict the target delta with an 80% interval and name what result would show the hypothesis wrong. Never open a test case.

   You read scores; the analyzer reads transcripts. That separation is the guarantee that nothing from the test set leaks into a change.

   If the next change is already obvious (the user named it, or the last round points straight at it), skip the analyzer and write it yourself.
2. **De-fluff and apply.** Cut anything in the proposal that is a platitude, restates default behavior, or has no operational content ("be careful", "think step by step"). Apply it to the real files. Write `runs/vN/change.md` (the hypothesis, the cited traces, the prediction) and `runs/vN/change.patch` (`git diff` of the real paths), and copy the changed artifact into `runs/vN/`. If the patch touches a harness path, stop: the next run will refuse until the user approves the diff.
3. **Check a config lever first.** When the change is a model parameter, a tool config or anything validated at call time, run one case (`run --variant vN --limit 1`) and confirm it is accepted before the full pass.
4. **Run.** `run --variant vN --models all` (or the goal's models) on the full set, every round, at the baseline's reps. Run it in the background when the harness supports that, and keep answering the user meanwhile. A changed app is detected: the variant measures the code as it is when the run starts.
5. **Score.** `score --vs <best>`. Read the verdict per model and overall. KEEP needs the target to clear its interval in the goal's direction on every goal model, with every guard held.
6. **Record.** `record --variant vN --decision keep|revert --change "<one line>"`. On revert, undo the change in the codebase now (`git apply -R runs/vN/change.patch`), so the next round starts from the best variant. Compare the result to the analyzer's prediction and hand the miss to the next round's analyzer.
7. **Report.** One line in chat: `vN <change>: test <before> -> <after> (<verdict>)`, then the report path. Rewrite `runs/narrative.md` with the score table on top and one paragraph on which variant leads and why, in terms of the changes. Run `report`.

## Rules

- **Never touch the held-out set.** The analyzer reads train only; you choose changes from scores only; the headline comes from test.
- **One hypothesis per round.** Two unrelated edits in one round leave you unable to say which one helped or which to revert.
- **Spend rounds on changes the eval can see.** A change whose best case sits inside the noise floor is kept or reverted by chance. Effect is the measure, not diff size: one missing fact, a new tool or a different effort setting can be the whole fix.
- **Track the mechanism.** Give the lever a column of its own: how often the agent called the tool, wrote the memory, produced the artifact (`perf` from the adapter). A score that moved while engagement did not is noise or a harness artifact.
- **Distrust a jump.** A judge-graded score that leaps further than the change could explain is the judge being gamed until hand-checked. Read five outputs, show the user, and note it in `change.md`.
- **Read train against test.** Train up and test flat means the change fit the cases the analyzer read: revert. Train down and test up at low reps is noise: keep only if it repeats on a rerun.
- **Every number behind a recommendation is on the record.** A metric you computed on the side that changes your pick goes into a grader, every variant is regraded, and `score` shows it, before you recommend.
- **The budget is a guide.** Recompute spend from `score` every round. Near the ceiling with test still climbing, say so and offer to extend.
- **Prompts accrete fluff.** The de-fluff pass is every round, not once.

## Stalls

`status` prints `STALL` after three rounds without a KEEP. The remaining failures are now often not the artifact's fault, and another content round cannot move them. Spend one round categorizing instead: a fresh sub-agent buckets every remaining train failure, reading each transcript far enough to tell which:

| Bucket | Tell | Instead of another content round |
|---|---|---|
| Artifact gap | The model never had the fact or rule it needed | Keep climbing; this is the loop's home ground |
| Grader disagreement | The output looks right and the grader fails it, or prompt and rubric ask for different things | Fix the grader, `regrade` every variant, compare old and new grades. If the ranking flipped, show the user and propose restarting from baseline |
| Harness | The trial broke before a real answer: auth, timeouts, empty output, a tool convention one model trips on | Fix the harness; exclude those trials until fixed |
| Structural | The content exists but the model doesn't reach it; one dimension underperforms whatever you add | Reorganize: consolidate duplicates into one table, split a monolith, fix routing |
| Variance | Identical-code reruns flip as often as rounds change results | You are at the noise floor; report best-so-far or raise reps |

Write the counts to `runs/vN/change.md`, record the round with `--decision stall`, and tell the user: N of the M remaining failures are not artifact gaps, and what each cluster needs. When many small uncovered dimensions each cost one or two cases, a single breadth pass that covers all of them is allowed to break one-change-per-round: the question is coverage, not attribution.

## Final report

Leave the codebase at the winning variant. Write the report as a markdown file (or the PR description):

- **Headline:** test score at baseline and at the winner, each with its interval, and the delta. If the delta is inside the noise, say so and recommend not merging.
- **Rounds:** the `score` table per round, train beside test, guards beside the target. Say so if train and test diverge round over round.
- **Applied changes:** each with its one-line why, tagged `[REQUIRED]` (fixes something broken) or `[TUNE]` (a judgment call the user may decline).
- **Failures by class:** refusals, harness errors, timeouts and real misses counted separately, per model.
- **Other models:** if the artifact serves several models, rerun the winner on each and report per model; wins do not transfer by default.
- **Two or three before/after pairs:** the same case under baseline and the winner, chosen to show the behavior the changes targeted.
- **What next:** the levers still untried and anything that needed more scope than the user allowed.
