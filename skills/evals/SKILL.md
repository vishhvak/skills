---
name: evals
description: "Evals: build, audit and hillclimb evals for any LLM-powered task (a prompt, a tool schema, a skill, an agent, a plugin, a pipeline) on any model, provider or gateway. Use when the user wants to measure an LLM feature, turn failures into test cases, check whether an eval can be trusted, compare models on one, improve something against one (hillclimb), or cut context, cost or latency without regressions."
---

# Evals

An **eval** is three things: **cases** (inputs the user agrees are the ones that matter), an **adapter** (a command that runs the app on one case with a given model), and **graders** (commands that score one output). The script `{baseDir}/scripts/evals.mjs` owns measurement: it runs trials, resumes, separates infrastructure failures from model failures, computes intervals and verdicts, and keeps state. You own judgment: which cases, what good means, which change to try next. The script never calls a model itself, so any model id the user's setup can serve works: a gateway route, a local proxy, a vendor API, a CLI agent.

## Start every session here

```bash
node {baseDir}/scripts/evals.mjs status            # add --eval <dir> when the project has several evals
```

Follow what it prints:

| Line | Do |
|---|---|
| `NO_EVAL` | Load `reference/build.md` and scaffold with the `init` command it prints |
| `phase:` | The current gate. Read every file on its `load:` line, and only those |
| `do:` | The work for this phase |
| `BLOCKED:` | An open condition. Clear every one before moving on |
| `ASK_USER:` | Send the user that question, then stop until they answer. Record their words where `next:` says |
| `STALE:` / `STALL:` | A run or a loop that no longer means anything as it stands. Do exactly what follows it |
| `next:` | The exact command to run once the work is done |

## Modes

The status line `phase: ready` means the eval is built and has a baseline. Then route by what the user asked for:

| The user wants | Load |
|---|---|
| An eval for a flow that has none, or test cases from failures | `reference/build.md` |
| To know whether an existing eval can be trusted | `reference/audit.md` |
| To compare models, or know which model a task needs | `reference/bench.md` |
| To improve a prompt, tool descriptions, a skill or code against the eval | `reference/hillclimb.md` |
| Less context, cost or latency with no regressions | `reference/trim.md` |
| To wire an app, a model, a gateway or a judge into the runner | `reference/adapters.md` |

A request often chains modes. "Bench Sonnet, climb until it's perfect, add Sol, then trim the tool schema by half" is bench, then hillclimb with one goal model, then hillclimb with two, then trim. Run them in that order; each one's verdicts are the next one's starting point.

## Gates

Five gates come before any number is trusted. `status` enforces their order.

| # | Gate | Done when |
|---|---|---|
| 1 | `inputs` | The user read every case and said yes (`signoff inputs --note "<their words>"`) |
| 2 | `smoke` | `smoke` is GREEN: known-good outputs pass, wrong and empty outputs fail |
| 3 | `grading` | The user saw pilot outputs beside their grades and would not score any differently (`signoff grading`) |
| 4 | `approve` | The audit's findings are written and reported, and the user approved the harness (`approve --audit <file> --note "<their words>"`) |
| 5 | `baseline` | Every model in eval.json has a complete baseline under the approved harness |

**Stop at every gate.** Gates 1, 3 and 4 are the user's decisions: quote their actual words in `--note`, and never write a note on their behalf. A GREEN smoke is evidence for gate 2 only, never permission to record gate 3. Compressing gates 1 to 4 into one push is the dominant failure mode: it produces an eval that runs and that nobody trusts.

## Commands

All are `node {baseDir}/scripts/evals.mjs <command> [--eval <dir>]`.

| Command | Use |
|---|---|
| `status` | The phase, what to load, open conditions, the next command |
| `init --name <flow> [--dir <path>]` | Scaffolds `evals/<flow>/`: eval.json, cases.jsonl, expected.jsonl, a stub adapter, a check grader |
| `check` | Validates config, cases and answers; prints the `tags[0]` distribution |
| `cases` | Writes `runs/cases.md`: every case and its answer, for the inputs gate |
| `show --variant <name> [--failures]` | Prints each trial's input, output, grade and the grader's reason |
| `smoke` | Grades known-good (`expected.reference`), wrong (`expected.wrong`) and empty outputs. Free |
| `run --variant <name> [--model m,m \| --models all] [--reps R] [--cases all\|train\|test\|ids] [--limit N] [--dry-run]` | Runs trials. Prints the scope and estimated cost first, resumes at (case, rep), writes `runs/<variant>/<model>/` |
| `regrade --variant <name>` | Re-runs the graders on stored outputs after a grader fix. No model calls |
| `split [--test-frac 0.5] [--none]` | Holds out a test set, stratified by `tags[0]`. Fixed once made |
| `goal --target <field> --direction higher\|lower [--hold a,b] [--margin x] [--models a,b]` | Records what a hillclimb or trim optimizes and what it must not regress |
| `score [--vs <variant>] [--split test\|train\|all]` | The numbers: per variant and model, mean ±95% interval over cases, paired deltas, the noise floor, KEEP/REVERT verdicts, spend |
| `record --variant <name> --decision keep\|revert\|control\|stall --change "<one line>"` | Closes a round |
| `report` | Writes `runs/report.html`: summary, rounds, per-case grid with links to traces |
| `signoff inputs\|grading\|plan --note "..."` / `approve --audit <file> --note "..."` | Records the user's decisions |

## Rules every mode needs

- **The script's numbers are the only numbers.** Every score, delta, interval and cost you report is quoted from `score` output, which recomputes from the raw rows each time. A number worked out by hand or from memory is how mean-versus-sum bugs become announced breakthroughs.
- **Answers stay out of the app's reach.** Cases go to the adapter; `expected.jsonl` goes only to graders. Keep both outside any directory the agent under test can read, and screen passing transcripts of web-enabled agents for fetches of the answers.
- **Every model is a string.** The adapter maps the id to a call (reference/adapters.md). The runner checks the model the response reports against the one requested, so a gateway's silent fallback fails a trial loudly instead of scoring the wrong model.
- **Every run spends money.** `run --dry-run` prints trials and estimated cost. Before the first full baseline and before a loop, tell the user the total for the plan and get a ceiling. Pilots of a few cases need no ceiling.
- **The noise floor decides what a result is.** A delta inside it is noise however good it looks. `score` prints it from the baseline's rep-to-rep variance; with one rep it prints an upper bound and asks for more.
- **The harness measures; the app is measured.** `harness_paths` lists the adapter, graders and fixtures; changing one needs the user's approval again. The app's own files never go there: the runner tracks the app by its git state, and a changed app is a new variant.
- **The eval lives in the project.** `evals/<flow>/` is committed with the app; `runs/` is gitignored by default. Ask before committing traces, which can hold customer data.
- **Talk in outcomes.** One line per step or round: what ran, the number, what's next, the report path. Put detail in the eval directory, not the chat. Use the harness's question tool for decisions, with your recommendation first.
- **Detect sub-agents; never assume them.** Hillclimb's analyzer and the audit's case reader run as fresh sub-agents when the harness has them. Without them, do the work inline and say so in the round's status line: `independence: degraded (no sub-agents)`.
