# Audit an eval

Before an eval chooses a model, a prompt or a configuration, check that the eval is sound. The most surprising eval results usually turn out to be bugs in the eval. Audit against the actual code, data and a real run, not the README; if nothing has run recently, run a few cases first.

Use this file in three places: as construction requirements while building, as the gate-4 audit before the baseline, and as the first pass on an eval someone else built (wrap that eval with an adapter whose output matches the contract, or audit it in place).

## What the runner already guarantees

When the eval runs through `evals.mjs`, these hold by construction. Confirm the eval actually uses the runner, then skip them:

- Infrastructure failures (adapter errors, timeouts, rate limits after retries, served-model mismatches, grader crashes) go to `errors.jsonl` with a class, never into the scored rows. Truncated outputs (`status: truncated`) are counted and left out of the means.
- Retries back off with jitter and are counted per trial; every attempt's usage stays in the spend.
- A hard per-trial wall-clock ceiling (`run.timeout_s`) kills the adapter's whole process group.
- The served model is checked against the requested one on every trial.
- Each trial gets a fresh, empty `EVAL_WORKDIR`.
- Resume is keyed on (case, rep). A run resumed under a changed harness or a changed app is refused.
- Every headline recomputes from the raw rows; intervals are over cases; the noise floor comes from rep-to-rep variance.
- Answers live in `expected.jsonl`, which only graders receive.

## What you still check

Each finding names a file, a case id or a transcript line.

**Cases**

- Each case is answerable from what the app is given; a case that needs a fact nobody supplied measures luck.
- Labels are right. Read a sample of `expected.jsonl` against the inputs; ask where they came from (human-written, human-checked, or one model's outputs). Answers taken from a model under comparison reward imitating that model; say so and prefer a rubric or a human-checked sample.
- The set has negatives (cases where the right move is to do nothing, refuse or ask) whenever the flow can act wrongly.
- No duplicates or near-duplicates that weight one behavior twice.
- The set still matches real use: ask the user, and compare `tags[0]` counts against traffic if they have it.

**Harness**

- The adapter calls the app's real entry point with production's prompt, tools, model settings and scaffolding. Diff them; a re-implemented call measures a different system.
- What the adapter returns as `output` is what the user would see, not an intermediate.
- Nothing carries over between trials: databases, caches, home-directory config, a shared checkout, conversation history.
- The environment has what every case needs; a case that fails for every model because a package or fixture is missing measures the environment.
- `max_tokens` and the context window fit the longest case and the longest plausible answer.
- The agent under test cannot reach `expected.jsonl`, the graders or their fixtures from its workspace, its tools or the web.
- For an agent with web access on a public benchmark: passing transcripts are screened for fetches of the benchmark's answers.

**Graders**

- The grader rewards what the prompt asks for. "At least three" in the prompt and "more than three" in the grader penalizes the model that follows instructions.
- It grades the outcome, not the path: an exact tool-call sequence or phrasing fails valid solutions.
- It is not too rigid (case, whitespace, `4` against `4.0`, fences, units, a sentence around the answer) and not too lenient (write a wrong-but-plausible answer; `smoke` tests the ones in `expected.wrong`).
- It cannot be gamed: an empty string a regex accepts, a hard-coded output, instructions injected into the judge's input.
- Spot-check the failures: read five to ten outputs it marked wrong. More than about one in ten looking right means fix the grader before any full run.
- It is deterministic, or its variance is measured: grade the same output twice.
- For a judge: A and B randomized, told not to reward length, never told which side is the reference, not the model under test, its rubric concrete. Calibrate on a few dozen cases a human labeled independently; agreement well under about 90% on clear cases means the judge needs another iteration before it steers anything. Feed it an empty answer, "I don't know" and a confident answer to the wrong question; all three must fail.
- Aggregation fits the stakes: for rare irreversible actions (deleting data, sending money), report any-failure counts, not a mean diluted by easy cases.

**Can it see the change?**

From `score` on the baseline, put three numbers side by side: the noise floor on the primary metric, the headroom (the ceiling minus the baseline), and the smallest gain the user would act on. If the noise floor is larger than either of the others, no loop can show a win. Offer more reps (cheapest), more cases, or a finer metric, before any round.

The mechanism is wired: whatever the score depends on (a tool, a memory, an instruction file), disable it on a few cases and confirm the score drops, and confirm the transcripts show it engaging when enabled.

When the thing tuned is itself generated (a built index, a synthesized memory, a compiled prompt), rebuild it two or three times unchanged and score each build. That spread is the floor an edit must clear; reps over one build cannot see it.

## Reporting

The eval's author usually knows things you don't. Report observations and suggestions, not verdicts on their work:

1. Lead with what makes the numbers actively misleading: failures scored as zeros, "no answer" graded as a negative answer, reachable answers, labels from a compared model, a noise floor bigger than the gain sought, a judge that disagrees with humans.
2. Then what adds noise or limits how far results generalize.
3. Each finding: what you saw (file, case id, line), why it matters, one concrete change. Make the small fixes yourself when asked.
4. Say when it is fine. An audit that finds nothing is a valid result.

Keep it to the findings that matter for the user's decision.
