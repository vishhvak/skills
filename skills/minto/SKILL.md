---
name: minto
description: 'Restructure a message so the conclusion lands first: BLUF, bottom line up front. Use when writing or reviewing an update, exec summary, recommendation, status report, incident note, PR description, or any message for a busy reader; also when a draft buries its point or opens with a warm-up.'
metadata:
  trigger: Writing or reviewing an update, summary, recommendation, or any message where the reader is short on time
  source: https://untools.co/minto-pyramid/ (Barbara Minto, "The Minto Pyramid Principle")
---

# Minto Pyramid

Lead with the answer. Then say why. Then prove it.

Busy readers do not read to the end. A message that saves its recommendation for the
last paragraph is a message whose recommendation does not arrive. The pyramid inverts
the essay you were taught to write: conclusion first, then key arguments, then
evidence, so the reader can stop at any layer and still have what they need.

```
        ┌─────────────────────┐
        │     CONCLUSION      │   one sentence: the answer
        └─────────────────────┘
      ┌─────────────────────────┐
      │     KEY ARGUMENTS       │   2-4 summaries: the why
      └─────────────────────────┘
   ┌───────────────────────────────┐
   │     SUPPORTING DETAILS        │   facts, numbers, evidence
   └───────────────────────────────┘
```

## The gates

Work these in order. **Skipping gate 1, drafting the message and hoping a conclusion
emerges from it, is the dominant failure mode.** Write the answer before you write
anything else, even if you have to think harder to find it.

### Gate 1: Write the conclusion, alone

One sentence. The thing you would say if you got only that sentence.

Then test it against the two impostors below. Both feel like conclusions and neither is one:

| Impostor | Example | Why it fails |
|----------|---------|--------------|
| **The topic sentence** | "Here are the results of our research study." | Announces that information exists; carries none |
| **The agenda** | "I want to discuss our product direction." | Names the subject, withholds the position |

A real conclusion commits: *"Shift the focus of our product efforts to the buyer persona."*
Someone could act on it, disagree with it, or approve it without reading further.

**Criterion:** you have one sentence, and it survives both impostor tests.

### Gate 2: Group the why into key arguments

2-4 arguments that answer "why is that the conclusion?". Each is a **summary**, one to
two sentences, the shape of the reasoning, not the reasoning itself. Evidence waits for
gate 3.

More than four means you are listing details, not grouping arguments. Group them.

**Criterion:** 2-4 arguments; each reads as a claim, not as data.

### Gate 3: Attach evidence under each argument

Facts, numbers, results, quotes. This is the layer where detail is welcome, go deep if
depth helps.

Every piece of evidence hangs off exactly one argument from gate 2. Evidence that hangs
off nothing is the padding you came here to remove; cut it or promote the argument it
implies.

**Criterion:** every detail traces to one argument; no orphans.

### Gate 4: Run the truncation test

The pyramid's promise is that the reader may stop early. Verify it by making the cuts:

1. **Cut after the conclusion.** Is what remains a complete, actionable message?
2. **Cut after the key arguments.** Is what remains a complete, persuasive message?
3. **Audit every sentence.** Does each one sit in exactly one of the three layers?

**Criterion:** both cuts stand alone, and every sentence is assigned to a layer.
A sentence that belongs to no layer is a preamble, a hedge, or a throat-clear, delete it.

## Don't / Do

| Don't | Do |
|-------|-----|
| Open with context so the reader "has background" | Open with the conclusion; context becomes gate 3 |
| Build to the recommendation for suspense | Spend the suspense budget on nothing. This is not an essay |
| Write "we found several interesting things" | Write the interesting thing |
| Mix evidence into the arguments layer | Keep arguments as claims; evidence lives one layer down |
| Pad to look thorough | Let the reader stop early: that is the feature |

## Worked example

The three layers, marked. From the source page:

> Hi team,
>
> we just finished our strategic product research study and here are our results.
>
> **Our recommendation based on our findings: Shift the focus of our product efforts to
> the buyer persona.** ← *conclusion*
>
> Our main findings: ← *key arguments*
> - Buyers are underserved with the current product. They're mostly missing better
>   visibility into product usage.
> - Users are pretty happy with the current feature set and the usability is good too.
> - Internally, our sales struggles in bigger deals because of the product gaps for buyers.
>
> How did we arrive at this? ← *supporting details*
> - We talked to 10 buyers and 20 users from our customer base, and 4 buyers and 12 users
>   from our churned customers.
> - The NPS among buyers is significantly lower than among users (5.4 for buyers vs. 7.9
>   for users).
> - Buyers most commonly indicated lack of usage reporting as the reason they're
>   considering churn or already churned.
> - Users' SUS score was pretty high and we didn't find major usability problems.
>
> Feel free to read the full report and ask questions!

Note what the greeting line does: it orients in one clause and gets out of the way. That
is the whole budget for preamble.

## When to drop layer 3

Skip the details when the key arguments alone justify the conclusion *and* the audience
knows the domain well enough to accept them. The busier the reader, the likelier they skip
that layer anyway, but keep it whenever the conclusion needs to be defended, approved,
or funded.

## Reviewing someone else's draft

Same gates, run as diagnosis: locate the sentence that *should* have been first, then
report where it actually sits. "Your conclusion is in paragraph four" is the finding;
the reordering is the fix.

## Source

- [Minto Pyramid (Untools)](https://untools.co/minto-pyramid/)
- *The Minto Pyramid Principle*, Barbara Minto
- BLUF ("bottom line up front") is a military convention, now standard business practice
