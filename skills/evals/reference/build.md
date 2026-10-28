# Build an eval

The goal is a runnable eval the user trusts enough to make a ship decision on, because it measures what they would have checked themselves. The user's judgment is the source of truth at every step: they say what the flow is for and what failure looks like, they settle every answer you are unsure of, and they confirm that the grades match their own. Your job is to draw that judgment out, write it down, and turn it into cases and graders that trace back to it.

Fit the eval to the codebase: reuse the cases, graders and harness that already exist, and build only what is missing. Say which pieces you are reusing before writing anything. Keep `reference/audit.md` in view while building; every item there is a construction requirement.

## 1. Recon

Read before you ask, so every question you put to the user is one only they can answer. Ask what the user needs a number for. One app has many flows (a classifier, a summarizer, a tool-picking agent, a plugin's report); each needs its own cases and graders. Build one eval per flow.

Then find the flow's entry point: the function, endpoint, CLI or session that takes an input and produces the output that matters. Read enough of it to know:

- the model and how it is reached (vendor API, gateway, local proxy, an agent harness);
- the system prompt, tools, skills or other text the model reads;
- what one case needs besides a message: files, a workspace, a user profile, a conversation prefix;
- what the output is: text, JSON, tool calls, files written, a changed workspace;
- what has side effects (email, database writes, deletion, purchases) or depends on live state.

Measure the real entry point. Stub a tool only when calling it for real is unsafe or unrepeatable, and then grade the tool calls instead of the downstream effect. For a multi-turn flow, grade the conversation's outcome unless the user asks for per-turn grades.

Also collect what already exists: tests, logged transcripts, bug reports, a channel of complaints. Bring real examples from them into the interview.

Done when: you can say in one sentence what one case is, what one output is, and which command will produce it.

## 2. Interview

The interview fills `brief.md` (`init` writes it; `brief` recreates it and reports what is left). It is what the eval is aligned to: cases cite its items, graders score its criteria, and `status` will not move past it until every `<fill>` is answered and the user signs it off.

Ask **one question per message**, in the brief's order. Each question:

- **opens with a concrete example** from recon: a real input and output, a transcript line, a case you are considering. "Last Tuesday's notes credited the CFO's revenue guidance to the CEO. Is a wrong speaker a dealbreaker, or does it only cost points?" beats "What counts as a failure?";
- **offers your best guess** as an answer the user can accept or correct, so a quick "yes" works and a correction is cheap;
- **asks for one thing.** A question with two parts gets half an answer.

Write each answer into `brief.md` straight away, in the user's words, before asking the next. Give every failure, dealbreaker, edge case and judging criterion its own line with an id (`- F3: ...`); cases will cite those ids.

When the user says "you pick" or "not sure", that is not an answer yet. Write your concrete proposal into the brief, mark the line `(proposed)`, and put it to them as a yes-or-no question with the reason: "I'd count a wrong speaker as a dealbreaker, since the partner repeats the figure in IC. Yes?" Their yes settles it; remove the marker. `signoff brief` refuses while any `(proposed)` line remains. The same holds for answers in expected.jsonl: a proposal stays `"by": "agent"` until the user has seen that specific answer and accepted it.

When an answer is vague, show it instead of asking again. "It should be good" becomes two real or drafted outputs side by side: "Which of these would you rather get, and what made the difference?" Their reason is the criterion. When an answer contradicts an earlier one, quote both and ask which wins; record the outcome under Decisions.

| Section | What to get | Done when |
|---|---|---|
| The job | What the flow is for, who reads the output, what they do next | One paragraph the user agrees with |
| A good output | One real input and an output they would be glad to see | A quoted or linked example |
| Failures seen | Every failure they have hit or heard of: what happened, what should have | They say "that's all I can think of" after one more prompt: "Anything that made you redo the work by hand?" |
| Dealbreakers | Mistakes that fail an output outright | Each is a fail, never partial credit, in their words |
| Tolerable | Imperfections that only cost a little | A list, or "none" in their words |
| Doing nothing and edge cases | Inputs where the right move is to refuse, ask, answer "none" or call no tool; inputs at the edge | At least one, unless they say the flow can never wrongly act |
| How they judge by eye | What they look at first when checking an output | Each criterion is checkable: two people reading it would agree |
| Out of scope | What the number will not cover | A list, or "none" in their words |

Skipping ahead to write cases while sections are still open is the failure this gate exists to stop: cases written from your own guesses measure your idea of the flow, not theirs.

**Brief gate.** Show the user the whole brief and ask whether it says what they want measured. Fix what they name. Record their words: `signoff brief --note "<their words>"`.

## 3. Inputs

Source cases in this order, using the first source that is available and safe to keep:

1. **Real failures.** Every bug report, complaint, rage moment and odd transcript the user has. The most valuable cases are the ones someone was annoyed by; ask where they collect (a channel, a tracker, a log).
2. **Production traffic.** Logs or transcripts sampled for frequency. Before pulling any, ask about retention and personal data. If either blocks keeping it in the repo, store identifiers and fetch at run time, have the user anonymize a sample, or rewrite each into a synthetic case of the same shape and difficulty.
3. **Hand-written by the user.** Five to ten off the top of their head. Salient, not frequent; a seed, not the set.
4. **Synthesized by you.** Only after the user gives three to five real examples and a sentence on what makes a case hard. Write variations of those; cases synthesized from the prompt alone come out easy.

Aim for 15 to 100 cases. Under 15, one flaky case swings the score; well over 100, nobody reviews them. If a hillclimb is coming, size the set for the smallest gain the user would act on: the noise floor of a pass rate is roughly `1/sqrt(cases × reps)` per run, so 25 cases at 2 reps resolves about ±14 points and 50 at 2 reps about ±10.

Write them as JSONL:

- `cases.jsonl`: `{"id", "input", "tags", "why"}`. `input` is whatever the adapter needs (a string, `{messages}`, a path to a fixture). `tags[0]` is the main grouping (task type, difficulty, failure class); the split is stratified by it. `why` lists the brief items the case tests (`["F2", "D1"]`); the runner refuses a case without one, and every F, D and E item needs at least one case. The adapter never receives `why`.
- `expected.jsonl`: `{"id", ...}` with whatever the graders need: `label` (the right class, for a classifier), `reference` (a known-good output), `wrong` (a plausible wrong output), `rubric` (criteria for a judge), or nothing. `smoke` grades `reference` (else `label`) as a known-good output and `wrong` as a known-bad one, so give at least three cases each. The adapter never sees this file.
- **Answers you are unsure of are the user's call.** Mark a row `"by": "agent"` whenever the right answer is not settled by the brief or by the user's own words. The inputs gate stays shut while any remain: quote each such case to the user, take their answer, and change the row to `"by": "user"`. Never settle an ambiguous answer yourself; a wrong label teaches every later round to chase it.

Include negatives wherever the flow can wrongly act: cases where the right move is to not call the tool, refuse, ask, or answer "none". A set of only positives cannot see over-triggering.

**Inputs gate.** Show the user every case and its answer, not a summary: `cases` writes `runs/cases.md` (each brief item beside the cases that test it, the guessed answers still open, then every case's full input and expected row); give the user its path. Ask especially whether each brief item's cases are the ones they would have picked. `signoff inputs` refuses unless `runs/cases.md` was written from the current brief, cases and answers, so any edit after the user's review means regenerating the file and asking again. Rows without a `by` are your own writing and are shown as such; the user's yes on the reviewed file is their acceptance of them. Rows you are unsure of are `"by": "agent"` and need their own answer. When asking about one case, quote it. Ask whether these are the cases they care about and what is missing. Fix what they name and show again. Record their words: `signoff inputs --note "<their words>"`.

## 4. Wire the harness

Before grading anything, make the eval runnable, so the gates after this point test the harness that will actually run:

- **Adapter.** Wire `adapter.mjs` to the app (`reference/adapters.md`).
- **eval.json.** `models` (every id the user wants compared; empty means the app's own default), `reps` (2 is the floor for a noise estimate), `prices` per million tokens for each model and the judge (`{"in", "out", "cache_read", "cache_write"}`; zeros for a free local model), `primary` (the headline metric).
- **`harness_paths`.** Everything that does the measuring: the adapter, the graders, judge prompts, fixtures they read. Never the app's own code: the app is what a hillclimb changes, and the runner tracks it separately by its git state. A harness file that changes blocks every run until the user approves it again; an app file that changes only starts a new variant.

## 5. Grading

Offer side metrics first, and record the ones the user picks on every trial: output length, tool calls, refusals, truncation, format adherence, cost, latency. Any with a hard product ceiling ("under 10 seconds") becomes a guard in the goal later.

Then pick the cheapest grader that measures what the user cares about:

| Output | Grader |
|---|---|
| A label, number, JSON, a closed set, a tool choice | Programmatic check: normalize both sides, compare. Free and deterministic |
| A changed environment (code, files, rows, API effects) | End-state check: the adapter works in `EVAL_WORKDIR`; the grader inspects what is left there (tests pass, files exist, nothing off-limits touched). Add a judge only for taste a check cannot see |
| Open prose with clear criteria | Rubric judge: concrete, checkable criteria ("cites a source from the context"), never "rate 1 to 5". `templates/judge-openai-compatible.mjs` |
| Fuzzy quality, inherently comparative (v1 against v2) | Pairwise judge against outputs frozen once from the baseline. Randomize which side is A per case; allow `tie` and `both_bad`; never regenerate the reference |
| Quality only an expert can see | A small human-graded subset. Say plainly that it limits how often the eval runs |

The brief decides what the graders score. Every J item becomes a metric or a rubric criterion, named so it traces back (`j2_cites_source`). Every D item fails the output outright: a dealbreaker is a check whose failure zeroes the primary metric, never one criterion among many. A criterion you want that the brief lacks goes back to the user as a question, not into the grader.

Score independent properties as separate metrics (`{correct, cited, concise}`), not one blend. For labeled positives and negatives, report precision, recall and false-positive rate, not accuracy alone. When proposing a rubric, list the criteria you left out and why, so the user can pull one back.

The judge model is the user's choice. Use a different model from the one under test, and from a different family when the comparison is close.

**Smoke.** Give a few cases an `expected.reference` and an `expected.wrong`, then run `smoke`. It grades each known-good, wrong and empty output with no model calls. GREEN means the grader can tell an answer from a wrong answer and from none. BLOCKED means fix the grader or the references first.

**Pilot.** `run --variant pilot --limit 6` runs six cases spread across `tags[0]`, two reps each. Pilot runs before approval are fine and never count as rounds; name further throwaway runs `pilot-<anything>`.

Every J item must be scored by something the user can see: a metric named after it (`j1_figures_attributed`) or a rubric criterion that cites it (`J2: every action item is listed`). `signoff grading` refuses while a J item appears in no pilot metric, explanation or rubric.

**Grading gate.** Show the user each pilot output beside its grade and the judge's reasoning: `show --variant pilot` prints them (`--failures` for only the misses). Ask: "Would you have scored any of these differently? Is it measuring something you don't care about, or missing something you do?" One yes means the grader is not ready: fix it, `regrade --variant pilot`, show again. Record the final answer: `signoff grading --note "<their words>"`.

## 6. Approve and baseline

Run the audit (`reference/audit.md`), write its findings to `audit-findings.md` in the eval directory, report them, and show the user the harness files. On their yes, `approve --audit audit-findings.md --note "<their words>"`. `approve` refuses while an earlier gate is open or the last smoke is older than the harness. From then on the runner refuses to run if any harness file, the cases or the answers change, until the user approves again.

Run `run --variant baseline --models all --dry-run`, tell the user the trials and the estimated cost, and on their go run it for real. Then `score`, and tell the user the headline, the noise floor, and the path to `report`.

## 7. Hand over

Report in one message: what the eval measures, the case count and sources, the graders, the baseline per model with its interval, the noise floor, and what the eval cannot see. Offer three choices for git: commit the eval (recommended), commit the eval and the traces, or commit nothing.

An eval is a living suite. New production failures become cases; cases every model passes get harder or retire; the judge is re-checked against human labels when it drifts.
