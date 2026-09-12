# Sample motion from one clock

Use stable objects plus `render(t)`. Derive the entire replay state from time in seconds, including visibility, text, selected rows, route choice, pulse position, and opacity. Clamp every phase to `[0, 1]` before applying easing. A basic phase is `p = clamp((t - start) / duration)`; use `p * p * (3 - 2 * p)` for a gentle start and stop.

For a route pulse, use the SVG path's own `getTotalLength()` and `getPointAtLength(length * p)`. Keep the path and pulse under the same transform. Changing viewport size must preserve the pulse's endpoint and hit target. Subtle glow should leave the geometry readable when removed.

Record the timing of each important transition, including its dwell time. Use easing to reproduce the observed movement rather than applying a spring everywhere. Keep overshoot bounded where the source has a spring. The starter's fine pulse timings are approximations that require source comparison for closer fidelity. Follow [fidelity.md](fidelity.md) to distinguish continuous ambient light from event-driven inset shimmer, traveling pulses, and arrival light. Inspect glyph and contour deformation directly; a rigid shake cannot reproduce changing outlines.

## Separate replay and manual state

1. In replay, derive state from `t`; never increment a hidden frame counter or use unseeded randomness.
2. On an actual user action, call the supplied `pause()`, retain a manual override, and announce the outcome.
3. Continue rendering that override across seek and Play. If an interaction needs a short autonomous pulse, isolate its clock, pause behavior, cancellation, and final state from the recorded timeline.
4. On Replay, `reset()` cancels manual work and clears overrides before the host calls `render(0)`.
5. On `destroy()`, cancel any owned frame, observer, timer, or listener. A departed scene must never paint into its successor.

Mount SVG groups and DOM paragraphs once. Change attributes or text only when their value changes. Keep a focused `contenteditable` node intact while the user edits or selects text. Rerendering its `innerHTML` erases the browser's caret and selection even if the replacement looks the same.

## Verification probes

Compare `render(0)`, `render(duration / 2)`, `render(duration)`, `render(0)` with a fresh start. These are functional state checks. Separately watch every important transition continuously through its crest and settling against the verified source, then compare matched samples and quantify residuals. Pause mid-transition and check that it freezes. Seek backward while paused and while replaying. Change speed and verify that phase timing follows the host clock. Make a manual edit, seek backward, then Replay; the edit must survive seeking and disappear only on Replay.

Exercise keyboard activation and visible focus for custom SVG controls. Preserve Enter/Space handling and accessible names. In reduced-motion mode, preserve the states and ability to navigate while reducing decorative movement. For a lesson driven by audio, use the player's clock adaptation in [integration.md](integration.md).

For the registry example, read [registry-motion.md](registry-motion.md). Its measured charge, launch, impact and reveal phases show why one-second state snapshots and looping particles do not reproduce fluid motion.
