# The prose — writing rules for skill bodies

Level 0 done right. A skill's prose exists to make the agent's *process* predictable. Every rule below trades against **context load** (tokens the agent carries every turn) and **cognitive load** (things a human must remember).

## Invocation economics

Two choices, trading different costs:

- **Model-invoked**: keeps a `description` the agent sees every turn, so it can fire autonomously and other skills can reach it. Costs context load. Write the description with rich trigger phrasing.
- **User-invoked** (`disable-model-invocation: true` or harness equivalent): zero context load, but *you* are the index that must remember it exists — cognitive load. The description becomes a one-line human-facing summary.

Pick model-invocation only when the agent must reach the skill on its own or another skill must reach it. When user-invoked skills multiply past memory, cure with a **router skill**: one skill that names the others and when to reach for each.

## Writing the description

The description does two jobs: state what the skill is, and list the **branches** that trigger it. It earns harder pruning than the body:

- Front-load the skill's **leading word** — the description is where it does its invocation work.
- **One trigger per branch.** Synonyms renaming the same branch are duplication; collapse them.
- Cut identity that's already in the body; keep triggers + any "when another skill needs…" reach clause.
- pi-skills minimalism is the floor: `name` + a description whose second sentence is the when-to-use trigger. Add fields only when the harness consumes them.

## The information hierarchy

Skill content is **steps** (ordered actions) and **reference** (rules consulted on demand), placed on a ladder by how immediately the agent needs it:

1. **In-skill step** — the primary tier. Each step ends on a **completion criterion**: *checkable* (the agent can tell done from not-done) and, where it matters, *exhaustive* ("every modified model accounted for", not "produce a change list"). Vague criteria invite premature completion.
2. **In-skill reference** — rules/definitions in SKILL.md, consulted on demand. A flat peer-set of rules is a fine arrangement, not a smell.
3. **External reference** — pushed into a linked file, reached by a **context pointer**, loaded only when the pointer fires. The pointer's *wording* decides whether the agent reaches the material.

**Progressive disclosure** is the move down the ladder. The cleanest test is branching: inline what every branch needs; push behind a pointer what only some branches reach. **Co-location** decides what sits together once placed: a concept's definition, rules, and caveats under one heading, not scattered.

## When to split

Each cut spends one of the two loads:

- **By invocation** — split off a model-invoked skill when a distinct leading word should trigger it independently, or another skill must reach it. You pay a new always-loaded description.
- **By sequence** — split a run of steps when the steps ahead tempt the agent to rush the one in front (premature completion). Hiding post-completion steps buys legwork on the current one.

## Pruning

- **Single source of truth**: one authoritative place per meaning; changing behavior is a one-place edit.
- **Relevance check** every line: does it still bear on what the skill does?
- **Hunt no-ops sentence by sentence**: does this sentence change behavior versus the default? When one fails, delete the sentence — don't trim words from it.

## Leading words

A **leading word** is a compact concept already in the model's pretraining that the agent thinks with (*tight*, *red*, *fog of war*, *tracer bullets*). It anchors execution in the body and invocation in the description, recruiting priors in the fewest tokens.

- "fast, deterministic, low-overhead" → a *tight* loop.
- "a loop you believe in" → the loop goes *red* on the bug, or it doesn't.

Assume every skill carries restatements a leading word retires — go find them.

## Failure modes (diagnosis table)

| Failure | Symptom | Fix |
|---------|---------|-----|
| **Premature completion** | Step ends before genuinely done; attention slips to *being done* | Sharpen the completion criterion first (cheap, local); split by sequence only if the criterion is irreducibly fuzzy AND you observe the rush |
| **Duplication** | Same meaning in multiple places | Collapse to a single source of truth; check for a leading word |
| **Sediment** | Stale layers settle because adding feels safe, removing risky | A pruning pass is part of every edit — the default fate of any skill without one |
| **Sprawl** | Too long even when every line is live | Disclose reference behind pointers; split by branch or sequence |
| **No-op** | A line the model obeys by default ("be thorough") | Delete, or replace the weak leading word with a strong one (*relentless*) |
| **Negation** | "Don't think of an elephant" makes the elephant more available | Prompt the positive: state the target behavior. Keep a prohibition only as a hard guardrail you can't phrase positively — paired with what to do instead |

## Weak-model prose (pairs with Level 9)

- Numbered gates over paragraphs; tables over prose; one action per step.
- Name the compression failure: "compressing gates 2-4 is the dominant failure mode" outperforms any amount of "be careful".
- If a step matters, give it a checkable artifact ("write the list to NOTES.md") — weak models skip what leaves no trace.
- Body length: 40-200 lines is the healthy band for a leaf skill; ~300 is the router threshold.
- End negative guidance with a positive pair: a `Don't / Do` table survives weak models better than prose caveats.
