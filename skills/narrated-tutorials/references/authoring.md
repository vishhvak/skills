# Author a lesson

Start from the user's learning outcome and audience. For an unfamiliar or changing subject, consult primary sources and keep citations beside the claims in the lesson's project notes. Voice and animation cannot compensate for inaccurate content.

Write narration for speech: short sentences, pronounceable terms, and one new idea per section. Express formulas and code aloud in words the voice model can pronounce; display the exact notation in the visual. Aim for sections that can be replayed independently. Divide larger subjects into chapters with distinct outcomes.

Choose an explanatory representation using [visual-design.md](visual-design.md). When the subject needs spatial relationships, moving state or changing values, build those objects and transitions with a `diagram` module. Use the basic snapshot renderer only when a simple schematic is the intended result.

Keep persistent object ids so the eye can follow changes. Use a cursor to direct attention, a glow to isolate the spoken idea, and a small emoji burst for a meaningful event. Attach each change to the relevant aligned word; avoid animation on unrelated words. Include quiet stretches for listening.

Scenes describe complete states. Seeking to any point must reconstruct the right scene immediately; custom demonstrations use the same audio clock and mount/paint/destroy lifecycle. When a learner control matters, also supply a deterministic narrated demonstration so continuous mode remains understandable without an answer or click.

The existing typography, layout, narrator, and playback controls form the shared shell. Author the lesson's brand and terminology. Choose a different visual form when the topic demands it rather than treating every subject as source code.
