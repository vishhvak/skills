# Bench models

Answer "which model does this task need, at what cost?" on the user's own eval, and climb several models to a target one at a time. Requires `phase: ready`.

## Model ids

A model is any string the adapter can serve: `gpt-6-sol`, `deepseek/deepseek-v4`, `muse`, `claude-sonnet-5-5`, a local `qwen3-32b`. Settings that change behavior ride after `@` and the adapter reads them: `gpt-6-sol@high`, `gpt-6-sol@low`. The runner strips the suffix to check the served model and look up its price, so a grid of models and efforts is a list of ids:

```json
"models": ["sonnet-5-5@medium", "sonnet-5-5@high", "gpt-6-sol@medium", "deepseek-v4"]
```

Give every base model a price in `prices` ($ per million tokens: `in`, `out`, and `cache_read` / `cache_write` when the provider bills caching). Use the rate card of the route the user actually pays through; a gateway's price can differ from the vendor's. Unpriced models score without `cost_usd` and `score` warns.

## Bench

1. Put the models in eval.json (or pass `--model a,b` to try one ad hoc). `run --variant baseline --models all --dry-run`, then tell the user the trials and cost and get a go.
2. `run --variant baseline --models all`, then `score`.
3. **Classify failures per model before quoting a gap.** For each model, read the error classes in `score` and a few failing traces. A failure only one model triggers is often the harness: a tool-call format the adapter rejects, a parameter that model doesn't accept, a default `max_tokens` that truncates its longer reasoning, a refusal on a benign case, a gateway that fell back to another model. Those are adapter bugs confounding the comparison: fix them, rerun that model's baseline with `--fresh`, and only then compare. Report the gap with and without any you could not fix.
4. **Report the frontier.** A table per model: the primary metric ± its interval, guards, `$`/trial, latency, error counts. Name the dominated models (another is at least as good and cheaper). When two models' intervals overlap, they are tied on this eval; say so rather than ranking them. Recommend the cheapest model within noise of the best, unless the user's ceiling on a guard (latency, cost) rules it out.

Lower effort on a stronger model often beats a weaker model at high effort for the same cost. Bench that cell before recommending a cascade of models; one model also keeps one prompt cache.

## Climb a ladder of models

Make an artifact (tool descriptions, a system prompt, a skill) work on several models by adding them one at a time, weakest or most-used first:

1. Bench every model on the baseline.
2. Hillclimb (`reference/hillclimb.md`) with `goal --models <first>` until it reaches the target or plateaus.
3. Add the next model to the goal: `goal ... --models <first>,<second>`. Run the current best variant on it (`run --variant <best> --model <second>`; the app must be at that variant's state, which is why each KEEP gets committed). Keep climbing; now KEEP requires a win on both and a regression on neither.
4. Repeat for each model. A change that helps the new model and costs an earlier one is a REVERT; look for a phrasing both read the same way.
5. When every model is at target, run the final best variant on each model and report per model.

Commit each KEEP on the working branch as you go, so any earlier variant's state can be checked out again to run it on a model added later. The runner refuses to add a model to a variant whose other models measured a different app state.

## Judges are models too

When a judge grades the eval, its model is part of the measurement. Before trusting a model ranking that rests on a judge:

- Use a judge from a different family than the models it grades when the comparison is close; a judge prefers outputs like its own.
- To check judge sensitivity, add a second judge grader with another model (`name: "judge_b"`), get the harness approved, `regrade` every variant, and compare the two judges' rankings. If they disagree on the winner, calibrate both on a few dozen human-labeled cases before choosing.
- Judge cost appears as its own column (`judge_usd`), separate from the model under test.
