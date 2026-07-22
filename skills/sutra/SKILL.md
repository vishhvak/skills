---
name: sutra
description: Density editing — revise prose until a maximally faithful compression of it must drop ideas. For essays, blog posts, READMEs, docs, talks, and any draft that reads long but says little. Use when asked to "make this denser", "tighten this", "cut the fluff", "make every word earn its place", "make it unsummarizable", or to judge whether a draft is worth its length.
---

# sutra

A sutra is an aphorism compressed until not one syllable can be removed — the
Sanskrit grammarians held that an author would sooner give up a son than a
syllable. Sutra prose has that property: so little slack remains that even a
compression built to keep everything must drop ideas to get shorter. It is
unsummarizable, because every summary of it is strictly worse.

Summarizers never measure what they lose — they cut by a fixed fraction and
hope. This skill turns that flaw into an instrument, with one correction that
makes or breaks it: the probe must try to *keep* everything, not to read
well. A normal summary optimizes for a readable abstract — it keeps the
thesis and throws away the second mechanism, the example, the number. Point
that at dense prose and it "loses ideas" everywhere, convicting the tightest
sentences as padding. So the probe compresses for maximum idea retention, not
for polish, and the verdict reads:

- A max-retention compression to half length keeps **every** idea → the draft
  said its piece in half the words. It was padded. Cut toward the compression.
- The compression **must drop** ideas to hit the budget → those ideas can't be
  said in fewer words. The draft earns its length there. Protect them.

Density is information per word, not terseness. A joke, a rhythm, a concrete
image can be the densest thing on the page — it carries an attitude no
paraphrase survives, which is exactly why you name attitudes as ideas in the
inventory below and treat their loss as load-bearing. The enemy is the dead
word, not the pleasurable one.

## What counts as an idea

A unit the reader could repeat to someone else or act on: a specific claim, a
number, a named example, a mechanism, a distinction, an attitude. The test is
whether naming it in one line reproduces something a paraphrase would lose.
"Improves productivity" names nothing recoverable — zero ideas. "Cut deploy
time from 40 minutes to 4" names one. A mechanism plus two numbers is three.
Count by naming; an idea you can't name in a line doesn't count.

## Workflow

1. **Voice inventory.** Before touching anything, list 3–5 voice signals to
   preserve (vocabulary, cadence, bluntness, humor, digressions). Density
   work that sands these off has failed even if every fact survives.

2. **Idea inventory.** Number every idea in the draft — one line each, using
   the test above, attitudes and rhythms included. This is the artifact the
   whole skill is checked against: "which ideas did the probe lose" and "did
   every idea survive to the final" are only answerable against a frozen list.
   Freeze it now, before any edit. Each source sentence maps to at least one
   idea ID, or to `NONE — candidate fluff`.

3. **Slop sweep.** Cut AI-tone patterns — throat-clearing, filler adverbs,
   recap endings (the `no-ai-slop` skill does this well if available). Do this
   *after* the inventory, never before: slop removal is lossy, and you want
   the baseline idea set frozen against the real draft, not a pre-trimmed one.

4. **The probe.** Compress the draft to half length, and again to one-fifth,
   each time under this instruction and nothing else:

   > Compress the text below to at most N words. Keep as many distinct ideas
   > recoverable as you can — a reader should be able to reconstruct them.
   > Telegraphic, voiceless, ugly phrasing is fine. No preamble.

   Blind means the compressor sees only the draft and that instruction — not
   the inventory, not this workflow, not that it is a density test.
   - Sub-agents available: spawn one per compression, passing only the draft
     text and the instruction. This is the only genuinely blind path.
   - Not available: do each pass yourself in a fresh, mechanical register.
     You still hold the inventory in mind, so this is self-grading, not blind
     — report `probe: self (sub-agents unavailable)` so the reader discounts it.

5. **Loss audit.** For each compression, mark every inventory idea `kept` or
   `dropped` (dropped = not reconstructable from the compression). The dropped
   set at half length is your dense core — protect those source sentences. The
   kept set is compressible — the compression proves those ideas fit in fewer
   words, so cut their sentences toward it. The one-fifth pass is a triage
   ranking: the last ideas standing are the spine; anything it drops first is
   either your cut list or your most padded expression.

6. **Rewrite.** Compress the `kept` sentences toward the probe's own wording;
   protect the `dropped` sentences. Where a sentence is thin rather than padded
   — few words, but also few ideas — raise density by adding an idea, not by
   deleting words. **Every added specific must come from the source or from
   verified fact. Never invent a number, name, or benchmark to look denser —
   that is hallucination wearing this skill's clothes.** `references/moves.md`
   holds the moves with before/after pairs.

7. **Delete test.** Read the new draft sentence by sentence. Deleting a
   sentence must take a named idea with it; a sentence only implied by its
   neighbor fails and goes. This catches local restatement the passage-level
   probe misses.

8. **Re-probe until the gate passes.** One rewrite round rarely lands it. If
   three rounds don't move the gate, stop and report what resists — the
   remaining length is probably real.

## Ship gate

Every box, or keep revising (revising, not only cutting — some fixes add or
restore):

- [ ] **Fidelity:** every idea in the step-2 inventory survives in the final
  draft, or is a deliberate cut you can name and justify in one line. No idea
  vanishes silently.
- [ ] **Density:** a fresh max-retention compression of the final draft to
  half length still drops named ideas — attach the compression and the dropped
  list. If it keeps everything, the draft is still padded; cut and re-probe.
- [ ] **No dead sentences:** every sentence fails the delete test; none is a
  restatement or direct implication of its neighbor.
- [ ] **No empty abstraction:** no category word stands where a more
  informative instance exists ("tools" → the actual tool; "significantly
  faster" → the number). Keep the abstraction only when it carries more than
  any single instance would.
- [ ] **Voice:** the step-1 signals survive, quoted where possible.
- [ ] **Honest length:** the final is shorter than the original, unless the
  inventory grew — density rises by subtraction or by adding ideas, never by
  padding.

Report as a delta, not a grade: original → final word count, ideas retained
of the frozen inventory (e.g. 14 of 14, plus 2 added), and the 2–3 largest
cuts with one line each on why no idea left with them.

## When not to use this

Legal text, specs, and API docs optimize for zero ambiguity, not density —
redundancy there is load-bearing. Comfort writing (condolences, apologies)
optimizes for the reader's state, not information. And a draft whose problem
is *wrongness* needs a thinking pass, not a density pass; this skill makes
prose worth its length, it cannot make ideas worth having.
