# The audit protocol — scoring a skill or corpus

Use this to review an existing skill, a plugin's skill set, or a whole corpus. Output contract at the bottom. Audit with the weakest target model in mind throughout.

## Per-skill checklist

Score each item pass / fail / n-a, with one line of evidence (quote or line ref):

**Invocation & description**
1. Invocation mode deliberate? (model-invoked earns its context load; user-invoked is remembered or routed)
2. Description = identity + one trigger per branch, leading word front-loaded, no body-duplicated identity?

**Structure (the ladder)**
3. Job type admitted? (procedure / reference / router — a >300-line body is a router in denial)
4. Steps end on checkable, exhaustive-where-it-matters completion criteria?
5. Progressive disclosure: does every branch load only what it needs? Pointers worded so they actually fire?
6. Co-location: each concept's rules and caveats under one heading?

**Prose health**
7. No-op scan: sentences that don't change behavior vs default (list them — they're deletions)
8. Duplication scan: same meaning in 2+ places (incl. across sibling skills — fork-family duplication counts)
9. Negation scan: prohibitions that should be positive statements
10. Leading-word opportunities: restated triads begging to collapse
11. Sediment: layers referencing retired mechanisms, dead paths, stale examples

**Machinery (the arts) — absence is only a finding where the failure exists**
12. Self-review without independence? → Level 1 candidate (blind pair + weave)
13. Convergent/median outputs observed? → Level 2 (anti-attractors + seed)
14. One rulebook over-applying across registers? → Level 3 (router + register)
15. Re-deriving context every run; decisions not persisted? → Level 4 (context files + snapshots-as-backlogs)
16. Static prose guessing at runtime state? → Level 5 (script talks back; tool results as directives)
17. Only works when invoked; violations land silently? → Level 6 (post-edit detector hooks, pre-write gates)
18. Regeneration round-trips for parameter tweaks? → Level 7 (live-wire)
19. Multi-harness use with copy-paste installs? → Level 8 (compile + detect-and-degrade)
20. **Weakest-model test**: read every gate asking "can a cheap model compress or skip this?" Implicit steps, un-checkable gates, and prose-buried requirements are failures. Fix: non-compressible gate language + LCD step lists + artifacts per step.

**Contracts**
21. Tool/script failures return directives (what to do next), not dead errors?
22. Capability detection present where sub-agents/hooks/background jobs are assumed? Degrades loudly?
23. Data written to workspace, not the skill directory?

## Corpus-level checks

- **Convention drift matrix**: frontmatter fields, file locations, naming, length distribution across all skills. Drift is a corpus finding even when each skill passes alone.
- **Sibling duplication**: near-duplicate skills across forked plugins/variants — the highest-value collapse target.
- **Router coverage**: can the agent (and the human) find every skill from a top-level entry point? Orphaned skills fail invocation silently.
- **Description budget**: sum the always-loaded descriptions; the corpus pays that every turn. Rank by (tokens × how rarely invoked) for demotion-to-user-invoked candidates.
- **Weakest-model sample**: run the 3 most business-critical skills against the cheapest production model; log where it compresses gates. Observed compression beats speculation.

## Output contract

Produce:
1. **Verdict table** — one row per skill: verdict ∈ {keep / prune / restructure / promote-to-machinery / merge / delete}, one-line reason, effort S/M/L.
2. **Top-10 fixes** ranked by user-visible failure (not aesthetics), each with the specific edit or mechanism to build.
3. **Corpus findings** — drift matrix summary, duplication clusters, description-budget total.

Completion criterion: every skill has a verdict row; every fix names its file and its art/rule; nothing scored fail lacks a proposed fix.
