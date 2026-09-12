# Cursor motion

The bundled diagram and code renderers share `cursor-motion.js` and `cursor-visuals.js`.
The narrator's audio time drives the cursor pose. Equal times return equal poses;
pause freezes it, speed changes follow narration speed, and a backward seek
reconstructs the earlier motion. Cursor animation has no separate playback timer.

Short movements use a spring-driven scoot. Longer movements use a bounded cubic
trajectory with direction-aware rotation, speed-based squash, and a short settle.
Targeted diagram cursors retain an outside edge placement that leaves labels clear.
Reduced motion shows the current target directly.

Author ordinary `cursor` cues in the lesson schema. No animation duration or CSS
easing is required. Use stable targets and leave enough spoken time between cues
for the learner to follow the movement. Cursors can point at diagram objects or
annotated code ranges; `hand`, `pointer`, and `thumbsDown` remain supported.

`cursor.png` is the 2x pointer artwork from the user-supplied local ChatGPT app
(26.901.51231), displayed at 23 by 24 pixels. Hand and thumb shapes use the player's
existing vector assets. The timeline and renderer integration are maintained here;
the inspected app's bundled JavaScript is not part of the skill.
