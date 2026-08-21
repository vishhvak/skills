---
name: axon-illustrations
description: "Design and generate hand-drawn 16:9 editorial illustrations for articles, blog posts, docs, and essays, starring Axon (a neuron-creature mascot: black body, dendrite antlers, synapse tail). Use when the user asks for article illustrations, body images, figures for a post, a shot list, 'illustrate this', or wants a concept/metaphor drawn in the Axon style. Turns a piece's key judgments into white-background ink metaphor drawings with sparse orange/blue annotations."
---

# axon-illustrations

Turn an article's key cognitive moves — judgments, flows, contrasts, loops —
into hand-drawn 16:9 metaphor illustrations. Not decoration, not infographics:
each image argues one sentence of the piece, with the mascot Axon doing the
work in the scene.

## References (read per task, not all at once)

- `references/axon-ip.md` — the mascot: anatomy, the tail as storytelling device, bans. Read before any generation.
- `references/style-dna.md` — canvas, line, the two-accent palette, annotation rules, register bans.
- `references/composition-patterns.md` — structure types and how to invent a fresh metaphor.
- `references/prompt-template.md` — the exact prompt block layout for generation.
- `references/qa-checklist.md` — the 8 post-generation checks and the iteration cap.

## Workflow

### 1. Digest the piece

Read the article/text the user provides. Extract: the core claim, the 3–8
places where a reader's mental model shifts, and which of those are visual
(flows, contrasts, gaps, loops) versus prose-only. Do not illustrate evenly;
illustrate the turning points.

### 2. Shot list first

If the user asked "where should images go" / "plan the illustrations", or asked
for a full article set: produce a shot list before generating. Per shot: the
paragraph it follows, the one-sentence claim it argues, structure type, the
metaphor world, what Axon's tail is doing, and the 2–5 annotation labels
verbatim. Default 3–6 shots; short pieces 1–3; never exceed 8.

If the user asked to generate, generate — do not stall on confirmation.

### 3. Generate, one image per call

Build each prompt from `references/prompt-template.md`, write it to a file, and
run the **imagegen** skill's CLI (subscription-backed gpt-image-2; its stdout
is the instruction — follow `WROTE`/`NEEDS_LOGIN`/`ERROR` lines):

```
node <skills-root>/imagegen/scripts/imagegen.mjs generate \
  --prompt-file shot-01.txt --size 1536x1024 --quality high --out 01-slug.png
```

`<skills-root>` is this skill's parent directory. Generate sequentially (each
call runs 15–40s). For an article set, keep character consistency by passing
the first accepted image as `--ref` via the `edit` command for later shots.

### 4. QA every image

Run `references/qa-checklist.md`. Fix with targeted `edit` calls when the
composition is right, regenerate when the metaphor is wrong. At most two
retries per shot, then present best-of with the failure named.

### 5. Deliver

Save accepted images as `01-<slug>.png`, `02-<slug>.png`... into
`assets/<article-slug>-illustrations/` in the user's workspace (or the
directory they named). Keep rejected takes out of the final directory. Report:
shot count, one line per image (claim + placement), paths, and which shots are
strongest / optional.

Keep strategy prose short; the images carry the argument.
