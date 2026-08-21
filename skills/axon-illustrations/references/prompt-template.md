# Per-image prompt template

Build every generation prompt from these blocks, in this order. Write it to a
file and pass `--prompt-file` (prompts run long).

```
A 16:9 landscape hand-drawn editorial illustration on a pure white background.
Black ink line art, loose and confident, generous whitespace.

Subject: <the metaphor, 2-4 sentences. Name every element and its position.
State what is filled solid black (Axon + at most one anchor) and that
everything else is open line work.>

Axon: a small solid-black round-bodied creature with white dot eyes and no
mouth, two branching twig-like dendrite antlers on its head, thin stick legs,
and one long tapering tail ending in a three-pronged synapse tuft.
<one sentence: exactly what Axon's tail is plugged into / bridging /
transmitting, and where the 2-4 small orange pulse-dots are travelling.>

Annotations: <2-5 short lowercase handwritten English labels in blue ink,
listed verbatim with what each points at>. Thin blue arrows. No title text.

Colors: black ink on white only, plus orange for the pulse-dots and motion
arrows, blue for the handwritten labels. No other colors, no gradients, no
background texture.

Not: PPT infographic, corporate flat illustration, isometric art, cute
cartoon, sticker style, diagram with boxes and straight connector lines.
```

Rules:

- One image per generation call. Never ask for a grid or multiple panels unless the structure type is two-state contrast.
- Spell every annotation word in the prompt exactly; misrendered text is the top regeneration cause.
- Size: `--size 1536x1024 --quality high`.
- For consistency-critical runs (a full article set), generate the first image, then use it as `--ref` with the edit endpoint for subsequent images: "same character, same style, new scene: <subject block>".
