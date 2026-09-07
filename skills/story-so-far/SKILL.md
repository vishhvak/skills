---
name: story-so-far
description: 'Catch a returning reader up on in-flight work as a paginated briefing: a dense foreword first, then chapters on demand. Use when someone returns cold to a project or session and asks where things stand, what they missed, to be caught up, or to be walked through the work; also when an answer would otherwise be an info dump.'
metadata:
  trigger: Returning to a project or session without context, "where were we", "catch me up", "what's the state of this"
  combines: minto (structure) · medulla (density) · unslop + better-writing (voice)
---

# Story so far

The reader knows this domain. They built most of it. They have lost the thread, not the
ability to follow it.

Deliver a **foreword now, chapters on request**. One page per turn, paced by them.

## The two shapes

**Top-down entry, ground-up chapters.** The foreword is the answer, where things stand,
what's next, what's waiting on them. The chapters then run from foundations to the live
edge, so reading in order builds the picture up.

## Gate 1: Recon, silently

Read before speaking, in this order, stopping when you can write a foreword that would
survive the reader's scrutiny:

1. The current session, what this agent has been doing and deciding
2. Working tree and recent history, `git log`, `git status`, the actual diff
3. Handoff and note files, `handoffs/`, `NOTES.md`, `TODO`, `*.md` at the root
4. Adjacent repos, tickets, or docs the work depends on

**Narrating the recon is the first way this skill fails.** No "let me check the git log",
no tool-by-tool travelogue. The reader gets the foreword, not the reading list.

**Criterion:** you can name what is in flight, what is decided, and what is blocked.

## Gate 2: The foreword

Four elements, in this order, and nothing else:

1. **The answer**: where the work stands. One sentence, per `minto` gate 1: the answer,
   not the topic.
2. **Orientation**: what moved, what broke, what is next.
3. **The contents**: a numbered chapter list, titles only.
4. **The flip line.**

No greeting, no "great question", no preview of what you are about to say. The failure
here is a fifth element, not a long second one.

**Criterion:** those four elements, nothing beyond them, and a reader who stops here knows
what to do next.

## Gate 3: One page per turn, then stop

Emit exactly one chapter. End with the flip line. **End the turn.**

**Delivering page 2 in the same turn as page 1 is the dominant failure mode.** It arrives
disguised as helpfulness, "and briefly, on the second point…", or a chapter that quietly
absorbs the next one. A chapter that has started summarizing the following chapter has
already broken the contract.

Each page is prose paragraphs, not bullet lists. Bullets are how an info dump disguises
itself as structure, they let you emit twelve facts without connecting any of them. Prose
forces the connective tissue that makes a briefing readable.

The flip line, verbatim shape:

```
Next → 3. Decisions. Or jump to a chapter, ask deeper, or say enough.
```

**Criterion:** one chapter emitted, turn ended.

## Gate 4: The unsummarizable test

The density principle, from `medulla`: **writing so dense that summarizing it loses
ideas.** Apply it as an inverse test on every page before emitting.

> Could a reader compress this paragraph and lose nothing? Then it was not dense enough.
> Cut it to the version that cannot be compressed.

Every sentence carries a fact, a decision, or a consequence. Sentences that announce
("There are three main areas here"), transition ("With that in mind"), or restate the
heading fail the test. They are exactly what a summary would delete, which proves they
were never carrying anything.

This gate governs length, so nothing else does. Set no word ceiling: a cap either forces
you to drop an idea or sits slack above the dense version, and a page that passes this test
is already as short as it can be without losing something. Length is what density leaves
behind, never a target.

**Criterion:** no sentence in the page survives only as scaffolding.

## Gate 5: Voice

Run these before emitting, rather than restating their rules here:

- **`unslop`** for the AI-tell pass: adverbs, passive voice, throat-clearing, "not X but Y",
  then the self-audit "what makes this obviously AI generated?"
- **`better-writing`** for plain words, one voice, tone matched to stakes

What this skill adds on top: **the reader is an expert who lost context, not a beginner.**
Condescension here has a specific tell, re-explaining something they built. If they wrote
the auth layer, do not define it. Name it and move on.

## Don't / Do

| Don't | Do |
|-------|-----|
| Open with what you are about to cover | Open with where things stand |
| Offer six chapters when two are live | Say the work is small, give two |
| Bullet twelve findings | Connect three in prose |
| Explain their own architecture back to them | Name it and move |
| Hedge every claim you inferred | Mark the uncertain ones once, plainly |
| Ask which chapter they want first | Give the foreword; they will pick |

## The default chapter spine

Adapt to the work. Usually the last three matter most on return:

1. **The arc**: what this is for, and how the goal moved
2. **The ground**: what exists and works today
3. **Decisions**: the choices that constrain what comes next, and why
4. **Scar tissue**: tried, abandoned, and why; the retry-prevention chapter
5. **The edge**: in flight, half-done, mid-refactor
6. **Your call**: waiting on the reader

Six chapters on a two-day project is padding. Fold them; a three-chapter book is a fine
book. When context is genuinely thin, say so in one line and offer what exists, inventing
chapters to fill the spine is the sprawl failure.

## When they push

- **deeper**: expand the current chapter one level, same density bar
- **back**: re-emit a prior chapter, unchanged
- **jump <topic>**: a chapter not on the contents list, written on demand
- **enough**: stop. No closing summary. The briefing does not need a wrapper.
