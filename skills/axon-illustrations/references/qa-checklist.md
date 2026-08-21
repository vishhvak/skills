# QA checklist — run after every generation

Look at the image. Regenerate (or edit) if ANY of these fail:

1. **Axon is working.** Tail plugged/bridging/transmitting the core mechanism. If Axon could be cropped out and the diagram still works, fail.
2. **Anatomy held.** Solid black body, white dot eyes, no mouth, two dendrite antlers, three-pronged tail. Any smile, pupil, or missing tail: fail.
3. **One idea.** A stranger can state the claim in one sentence. Two competing structures: fail.
4. **Whitespace survived.** Roughly a third of the canvas empty. Crowded: fail.
5. **Text is clean.** Every label spelled right, lowercase, 1-4 words, blue. Garbled or extra text the prompt didn't ask for: fail.
6. **Palette held.** Black/white + orange pulses + blue labels (+ at most one red cross-out). Any other color: fail.
7. **No title.** Words along the top edge acting as a heading: fail.
8. **Register.** It reads as a witty editorial sketch, not a PPT slide, tech diagram, or children's cartoon.

Fixing: prefer `edit` with the failed image as `--ref` and a one-change
instruction ("remove the mouth; keep everything else identical") over full
regeneration when composition is right. Full regeneration when the metaphor
or layout is wrong.

Iteration cap: two regenerations per shot, then present best-of to the user
with the failure noted.
