# The nine arts — mechanics and worked patterns

Each art moves work from prose the model *might* honor into machinery that *forces* the outcome. Climb to the level that fixes the failure you actually observe. Receipts trace to shipping code in pbakaus/impeccable, agent-reviews, and radiant.

## Level 1 · Make them argue

**Failure fixed:** one agent grades its own homework — it anchors on its first guess and rates its own work generously.

**Mechanics:**
1. Spawn two sub-agents that must NOT see each other's output: **Assessment A** (judgment — "review this as a senior critic; what is weak, generic, wrong?") and **Assessment B** (evidence — "run the deterministic checks/tests/linters; report only what is mechanically true").
2. **Order matters (the debiasing trick):** let A *finish* before B's deterministic output enters the synthesis context. Deterministic output is cheap and confident; it anchors judgment if it arrives first. Withhold it.
3. **Synthesize by weaving, never concatenating:** one report noting where A and B agree, what B caught that A missed, and where B is a false positive ("technically flawed" ≠ "actually bad"). Stapling two lists together is the failure mode.

**Two-way bias this defends against:** a noisy detector condemns strong work (false alarm); a silent detector rubber-stamps generic work. Two blind agents + weave separates the axes.

**Upgrade:** add a third blind lens (accessibility, performance, source-verification) — more independent eyes, less anchoring. Diverse lenses beat redundant refuters when a finding can fail in more than one way.

## Level 2 · Force divergence

**Failure fixed:** "give me three options" returns one idea in three outfits; banning a cliché by name (ban Inter) just relocates the model to the next cluster (Space Grotesk).

**Mechanics:**
1. **Anti-attractors beat denylists:** make the model eliminate its *own* top picks — "name the three choices you'd instinctively make, then rule them out." The 2nd-order reflex check: "if the result is still guessable from the category alone, rework."
2. **Inject entropy the model didn't choose:** a random or hashed seed (`seed.mjs`, `--from X` for determinism) pushes generation off the default basin. The average must be *unreachable*, not merely discouraged.
3. **The squint test:** every variant earns a distinct concrete-noun label (exhibition / cockpit / playbill). Two labels that rhyme = one idea; rework.
4. At scale: generate ~50, have a sub-agent re-rank for *most distinct*, keep the top few (the radiant pipeline).

## Level 3 · Route like a frontier model (MoE)

**Failure fixed:** one rulebook over-applies (rules right for one register are wrong for another); a giant skill blows the context window.

**Mechanics:**
- SKILL.md becomes a **thin router**: a command/branch table mapping each situation to ONE expert reference file. "Load the one expert the command needs, and nothing else, so context stays cheap." Never load two experts at once.
- **Register, first-match-wins:** classify the situation first (brand vs product; listed vs private company; quick check vs deep audit), and let the register decide which rule set applies at all.
- The cruder version also works: N sibling skills split by job type, each self-contained.

## Level 4 · Give them memory

**Failure fixed:** "skills are stateless" — every run re-derives context and repeats resolved decisions.

**Mechanics:**
- **Persistent context files** (PRODUCT.md / DESIGN.md / NOTES.md analogues) read at every session start; a one-time `init` command interviews the user and writes them.
- **Per-target snapshots as handoffs:** a review command writes a snapshot with score + prioritized findings in frontmatter; the fix command reads the latest snapshot as its **fix backlog**. Commands compose across sessions through files, not conversation memory.
- **Key detail:** derive the snapshot slug from the *resolved path*, not the user's phrasing — that is what makes memory shareable across teammates and sessions.
- Trend lines ("24 → 28 → 32") restore across sessions from the stable slug.

## Level 5 · The script talks back

**Failure fixed:** static prose cannot know the current state; the skill guesses and drifts.

**Mechanics:**
- Ship scripts whose **stdout IS the instruction**. The script reads the environment (git state, files present, ports, config staleness) and prints a directive: `NO_NOTES` / `READY` / `UPDATE_AVAILABLE` / `nextCommand: init`. The skill body says: **"Follow whatever it prints."**
- Runtime-computed directives steer the agent harder than anything static, because they are fresh, in-thread, and shaped to the exact state. The real instruction isn't *written* in the skill — it's *computed and returned* by it.
- Same art applies to tool results inside a product harness: a refusal that says `BLOCKED: 3 uncited rows — run <tool> on rows 4,7,9, then retry` outperforms `error: validation failed` by an order of magnitude on weak models.
- **Trade-off:** dynamic output defeats prompt caching. Spend it where state-sensitivity earns it.

## Level 6 · Hooks that fight back

**Failure fixed:** the skill only works when someone remembers to invoke it.

**Mechanics:**
- **Post-edit hook:** run a deterministic detector after *every* file edit and inject findings as a system-reminder — the skill keeps working when nobody called it.
- **Pre-write gate:** on harnesses that support it, block a bad edit before it lands.
- **Re-entrancy guard:** a depth env var (`*_HOOK_DEPTH`) so the hook's own actions don't re-trigger it.
- Hooks are per-harness manifests; wire them at install time.
- Design rule: hooks emit *directives* (Level 5 style), not judgments — "revert the cream background; use the seeded palette" beats "design violation detected."

## Level 7 · Live-wire the surface

**Failure fixed:** chat is a passive interface to a live artifact; regeneration round-trips for every tweak.

**Mechanics (three boring web primitives, no MCP):**
- **Agent ↔ server:** a self-restarting long-poll (cap each request safely under the runtime's timeout ceiling; loop on timeout).
- **Server → surface:** SSE/EventSource with auto-reconnect.
- **Surface → agent:** plain HTTP POST.
- Expose coarse knobs as parameters (CSS vars / data attributes) so a human tunes with zero regeneration; chosen values bake in on accept.
- The lesson generalizes: integration is *plumbing you build*, not a prompt you write. Account for harness differences — some auto-wake the thread when a background job exits, others don't; shape the loop for the weakest.

## Level 8 · Compile to every harness

**Failure fixed:** harnesses differ *behaviorally*, and installers copy files instead of compiling for the target.

**Mechanics:**
- Treat the skill as **source that targets many runtimes**: one `SKILL.src.md` with `{{model}}`/`{{config_file}}` placeholders and per-target blocks (`<codex>…</codex>`, `<gemini>…</gemini>`) compiled into per-harness builds. The build absorbs *mechanical* gaps (directories, command syntax, manifest shapes).
- **Detect-and-degrade at runtime** for *behavioral* gaps: who may spawn sub-agents (programmatic vs user-permission vs agent-chosen), plan-mode-only questions, background-job wake semantics. Ask exactly once where a gate exists, then STOP; degrade sequentially where a capability is absent — and **degrade loudly** (`independence: degraded (sub-agents unavailable)`).
- Every model has tells; per-model patches are legitimate engineering, not hacks. Keep them in named blocks so they're auditable.

## Level 9 · Design for the weakest model

**Failure fixed:** authors write for the smartest model in the room; the skill actually runs on the cheapest one. The median problem is not only the model's *taste* — it is its *obedience*.

**Mechanics:**
- **Non-compressible gates:** "You must stop at every gate. X alone is NOT a green light to proceed. Compressing gates 2-4 is the dominant failure mode." Name the compression failure explicitly — weak models compress silently.
- **LCD step lists:** anything implicit will be skipped. Write explicit, ordered, atomic steps for any flow a weak model must execute.
- **Test on the weakest model you'll actually run** — make it the baseline, not an afterthought.
- Per-model strategies where a model has a known defect (e.g. a model that is trigger-happy to infer context gets a stop-and-gather step).
- Structure beats prose: checklists, tables, numbered gates, and Level 5 runtime directives survive weak models; paragraphs of nuance do not.
