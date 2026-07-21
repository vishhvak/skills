---
name: skill-engineering
description: Engineer agent skills that beat the median — write new skills, upgrade existing ones, or audit a skill/prompt corpus. Use when the user asks to write/improve/review a skill or SKILL.md, mentions skill engineering, wants a skill to work reliably on weaker models, or when another skill needs authoring guidance. Covers the harness machinery around prompts (sub-agents, hooks, scripts, routing, memory) and the prose discipline inside them.
---

# Skill Engineering

> **prompting < harness engineering**

A skill exists to wrangle determinism out of a stochastic system. LLMs have gravity toward the median: left alone, a skill is a system prompt and a prayer — the model nods and regresses to its defaults. The prose matters and you will iterate it forever; that is table stakes. The leverage is everything *around* the prose: machinery the harness actually runs, so a stochastic model behaves like software. A skill is not just a prompt — it is an extension of your harness.

**Predictability is the root virtue**: the agent taking the same *process* every run, not producing the same output. Every technique below serves it.

Sources this distills: Paul Bakaus's "The Dark Arts of Skill Engineering" (the 9 arts, receipts from impeccable/agent-reviews/radiant), the writing-great-skills doctrine, and pi-skills conventions.

## Setup — always do this first

Before writing or auditing anything, establish three facts. Do not guess them:

1. **Weakest model.** Which model will actually run this skill? Write for that one, not the smartest in the room. If unknown, assume a fast/cheap tier (Haiku-class, DeepSeek-class).
2. **Harness set.** Which harnesses must this run on (Claude Code, Codex, Cursor, Pi, …)? Behavioral differences — who may spawn sub-agents, whether background jobs auto-wake the thread, plan-mode question gates — change the design, not just the install path.
3. **Job type.** Is the skill a *procedure* (ordered steps toward a completion criterion), a *reference* (rules consulted on demand), or a *router* (thin dispatch to expert references)? Most bloated skills are procedures and references fused; most oversized ones should be routers.

## The ladder (Level 0 → 9)

A skill levels up by moving work from prose the model *might* honor into machinery that *forces* the outcome. Climb only as far as the failure you actually observe — each level is the fix to the previous level's concrete failure.

| Lv | Art | The failure it fixes | One-line mechanism |
|----|-----|----------------------|--------------------|
| 0 | The spell | — | A well-written prompt. Necessary, never sufficient. |
| 1 | **Make them argue** | One agent grades its own homework and anchors on its first guess | Two blind sub-agents (judgment + deterministic evidence) that never see each other, then a forced synthesis that weaves, never concatenates |
| 2 | **Force divergence** | "Three options" = one idea in three outfits; bans just relocate the monoculture | Anti-attractors (make the model eliminate its own top picks) + an entropy seed it didn't choose |
| 3 | **Route like MoE** | One rulebook over-applies; a giant skill blows context | Thin router + register (first-match-wins) + on-demand expert references — load one, never all |
| 4 | **Give them memory** | "Skills are stateless"; every run re-derives context | Persistent context files read each session; per-target snapshots written by one command become the next command's fix backlog |
| 5 | **The script talks back** | Static prose can't know the current state | Script stdout IS the instruction: runtime-computed directives (`NO_NOTES`, `nextCommand: init`) — "follow whatever it prints" outranks anything static |
| 6 | **Hooks that fight back** | The skill only works when invoked | Post-edit hooks inject findings as system-reminders even uninvoked; pre-write gates block bad edits; re-entrancy guards |
| 7 | **Live-wire the surface** | Chat is a passive interface to live artifacts | Wire the agent thread to the running artifact with boring primitives (long-poll + SSE + POST) — plumbing you build, not a prompt you write |
| 8 | **Compile to every harness** | Harnesses differ behaviorally, installers just copy | One source → per-harness builds for mechanical gaps; detect-and-degrade at runtime for behavioral ones (degrade *loudly*) |
| 9 | **Design for the weakest model** | Skill authors write for the smartest model in the room | Non-compressible gates ("you must stop at every gate — compressing gates is the dominant failure mode"), explicit LCD step lists, nothing implicit |

Full mechanics, receipts, and worked patterns per art: read `reference/arts.md`.

## The prose (Level 0 done right)

The writing rules — invocation economics (model-invoked vs user-invoked, context load vs cognitive load), description craft, the information hierarchy (in-skill step → in-skill reference → external reference), progressive disclosure, when to split, pruning, leading words, and the six failure modes (premature completion, duplication, sediment, sprawl, no-op, negation) — are in `reference/writing.md`. Read it before writing any SKILL.md body.

The three rules invoked most often:

- **Completion criteria must be checkable and, where it matters, exhaustive.** "Every modified model accounted for", not "produce a change list". A vague criterion invites premature completion.
- **Prompt the positive.** Steering by prohibition names the elephant. State the target behavior; keep prohibitions only as hard guardrails you cannot phrase positively, paired with what to do instead.
- **Hunt leading words.** One pretrained concept (*tight*, *red*, *fog of war*) replaces a restated triad and gives the agent a hook to think with.

## Auditing an existing skill or corpus

Run the protocol in `reference/audit.md`. It scores a skill against every level of the ladder plus the prose rules, and emits a ranked fix list. Completion criterion for a corpus audit: every skill has a verdict row (keep / prune / restructure / promote-to-machinery) and the top-10 fixes are ordered by user-visible failure, not aesthetics.

## Non-negotiables (any level)

- **Detect capabilities, never assume the runtime.** Sub-agents available and allowed → use them; available but gated → ask exactly once, then STOP; unavailable → degrade sequentially and say so: `independence: degraded (sub-agents unavailable)`.
- **Data lives in the workspace, not the skill directory.** The skill ships logic and reference; runs write artifacts to the project.
- **A skill that bundles scripts treats them as the source of truth** — the prose points at them (`{baseDir}/script.mjs`) and obeys their output.
- **Ship the smallest skill that fails loudly.** A 100-line skill with one hook beats a 600-line manifesto. When a body passes ~300 lines, it is a router that hasn't admitted it yet.
