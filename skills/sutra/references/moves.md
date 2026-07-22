# Density moves

Each move repairs one way prose carries dead weight. Before/after pairs — the
rule is unenforceable without them. Apply after the loss audit convicts a
sentence; don't sweep the whole draft with one move.

**The examples below assume the specifics already exist in a fuller draft or
the writer's verified knowledge.** The "after" side surfaces facts the "before"
side buried — it never invents them. If you don't have the number, you cannot
use the number move; find the fact or leave the sentence vague and honest.

## Cut: the word carries nothing

**Category word over instance.** A general noun where a specific one, already
known, was available.
- Before: "We used several tools to speed up the build."
- After: "We used esbuild and turbo to cut the build 90s → 8s."
- Two ideas surfaced where zero were stated — *if* the writer knew the tools
  and the timings. This is the highest-yield move and the easiest to abuse:
  the specifics must be real.

**Abstraction over number.** Vague magnitude, when the real one is known.
- Before: "significantly faster and much cheaper"
- After: "3× faster, a third the cost"

**Verb phrase over verb.**
- Before: "made the decision to deprecate"
- After: "deprecated"

**Restatement.** A sentence the reader already holds.
- Before: "The API is slow. Performance is a real problem. Requests take too
  long."
- After: "The API answers in 900ms; users notice lag above 100."
- Three sentences said one thing. The survivor adds the number none had.

**Implication.** A sentence its neighbor already entails.
- Before: "It runs locally. No data leaves your machine. That keeps it private."
- After: "It runs locally — no data leaves your machine."
- "Private" is the reader's own conclusion; stating it spends a sentence on
  nothing.

## Compress: the ideas are real but the packaging is loose

**Merge on a shared subject — without dropping distinctions.**
- Before: "Cortex stores your sessions. Cortex indexes your documents. Cortex
  retrieves personal data on request."
- After: "Cortex stores and indexes your sessions and documents, and retrieves
  personal data on request."
- The merge is only valid because all three verbs survive. Collapsing "stores,
  indexes, retrieves" into one verb would delete ideas, not compress them.

**Subordinate the scaffolding.** Setup that exists only to reach a point.
- Before: "There's an important thing to understand about caching. The thing
  is that invalidation is the hard part."
- After: "Caching is easy; invalidation is the hard part."

## Add: the sentence is thin, not padded

Not everything long is padded, and not everything short is dense. When the loss
audit finds the compression kept a sentence whole *because it had nothing to
lose*, the fix is an idea, not a deletion — drawn from what you actually know.
- Before: "Our approach is different and better."
- After: "We cache the query vector and diff it instead of re-embedding — first
  query 200ms, repeats under 10."
- Longer, and denser: a mechanism and two numbers where there were none. Valid
  only if that's how the system actually works.
