# Trim

Cut context, cost or latency with no regressions: "use half the context without failing anything that passes today." It is a hillclimb whose target is a perf field and whose guards are every quality metric on every model that matters. Requires `phase: ready`; run it after the artifact passes on the models it serves, never before.

## Goal

```bash
goal --target input_tokens --direction lower --hold pass,rubric --margin 0.02 --models sonnet-5-5,gpt-6-sol,opus-5-5
```

- **Target.** `input_tokens` for context (it sums uncached, cache-read and cache-write input), `cost_usd` for the bill, `latency_s` for speed, `output_tokens` for verbosity, or any number the adapter reports in `perf`. Name the user's number too ("50% fewer input tokens") and track it against the baseline in every round's status line.
- **Guards.** Every quality metric. A margin of 0 can never pass: an interval always has width. Set it at the smallest regression the user would tolerate, and no larger than the noise floor. "No regressions" also means no case that always passed now always fails: for a perf target, `score --vs` lists any such case and marks the variant REVERT. If the user accepts a specific flip, note it in `change.md` and record the round as kept.
- **Models.** Every model the artifact serves. A trim that holds on one model and breaks another is a regression.

Then follow `reference/hillclimb.md` from Setup (scope, split, plan gate) through its rounds, with these differences.

## Find where the tokens go

Before round 1, measure. Count the tokens in each part of the context the model receives: the system prompt by section, each tool's description and schema, the skills listing, fixed examples, injected state. A tool schema the model receives on every call usually dominates. Write the table to `runs/trim-census.md`, largest first.

Then census engagement: for each instruction or tool, count how often the baseline transcripts show the behavior it asks for (subtract occurrences of the marker in the prompt itself, or static text counts as engagement). Near zero means the model ignores it: dead weight. Engaged text is load-bearing until a round shows otherwise.

## Cut order

Each round removes or rewrites one region, largest likely saving first:

1. **Dead text:** instructions the census shows nobody follows, tools no case calls.
2. **Duplication:** the same rule in the prompt and a tool description, or in three tools. Keep one home.
3. **Verbose descriptions:** a tool description that explains what its name and schema already say. Keep what the model gets wrong without it: when to call it, when not to, what it returns.
4. **Leading words:** a sentence that restates a concept the model already knows collapses into the word for it.
5. **Examples, last.** Worked examples often carry the behavior; cut one at a time.

When a cut is REVERTed, try half of it. Two REVERTs in a row on one region means that region is load-bearing at this size: move to the next.

## Cost is not context

- **Actions cost more than words.** An instruction that triggers extra work ("verify twice", "be maximally thorough", "re-read the file before editing") adds whole tool rounds. Removing one can cut cost more than any amount of trimming. Check `perf` tool-call counts beside tokens.
- **Cached text is cheap.** A provider bills a cached prefix at a fraction of fresh input, so trimming a stable, cached system prompt saves context and little money. Report both `input_tokens` and `cost_usd`, and check that `cache_read_input_tokens` stays nonzero after a change: a cut that moves volatile text ahead of the stable part breaks the cache and raises the bill.
- **Charge an addition its own mass.** A new instruction rides on every request; it pays only if what it saves exceeds its own tokens at the real price.
- **Shorter answers trade quality.** A brevity cap cuts output tokens and latency; show the user the median reply length beside the saving.
- **The cheapest cell may be another model or effort.** Bench `model@effort` cells (`reference/bench.md`) before a long prompt trim, when the user's goal is the bill.

## Done

Stop when the user's number is reached with every goal model at KEEP and no flips, or when two regions in a row are load-bearing. Report the before and after per model: tokens, cost, latency, every guard with its interval, and the list of what was cut and what was kept because it carried behavior.
