# Select the closest working study

Reuse the smallest useful pattern, then change its content and geometry to fit the source. These are five concrete implementations, not a general animation schema.

| Scene | Use when | Mechanism worth reusing | Real interaction |
| --- | --- | --- | --- |
| `nodes` | A request branches between endpoints | Fixed SVG ports and paths, sampled pulse progress, a visible pending decision | Change user ID and send a request |
| `blog` | A workspace gains tools or skills while remaining live | Timed rows, a centered diagram, two expanding groups | Open and close Tools and Skills |
| `models` | A live table reorders or updates without losing its structure | Stable keyed rows, clipping, selection, scroll position, refresh pulses | Toggle rows, refresh, and scroll |
| `registry` | Inputs and policy change a downstream registry | Source paths, reveal phases, policy state, local row toggles | Refresh a source, change policy, toggle a row |
| `editor` | A document alternates between replay and live editing | DOM paragraphs, native contenteditable, selection-preserving updates | Edit a paragraph and keep that edit through seeking |

`editor.js` imports `mountDiagram` from `blog.js`; copy both when extracting it. Keep the bundled font and `fonts/OFL.txt` together. Reuse the chosen scene's existing geometry and accessible-control helpers when extending it.

## Build the state table

Write one row per meaningful change in workspace notes:

| Time or interval | Visible objects | Change | User control | Evidence |
| --- | --- | --- | --- | --- |
| 0 | Input, decision, two routes | Request begins entering | User selector | Frame at source time 0 |
| 1.75 to 3.95 | Same objects | Pulse follows the cheap route | Send request | Before/mid/after screenshots |
| Final | Last user and settled routes | Motion ends | Replay | End frame and replay observation |

The example times describe the bundled routing study. Measure replacement sources independently.

For a recording, use its native coordinate system. For a new scene, choose a viewBox that fits the authored geometry. Define route endpoints, boxes, labels, and hit targets in that same system. Fit the containing scene to the host while preserving its aspect ratio; keep strokes legible as it scales. Use text weight, spacing, muted contrast, and selective highlighting to show state. Preserve negative space and reference alignment before adding effects.

For a new teaching visual, include only the objects needed to explain the stated outcome. A routing lesson needs the input, condition, destinations, and moving request; it does not automatically need a full product interface. Treat labels and demonstration values as authored content that must make sense in the new lesson.
