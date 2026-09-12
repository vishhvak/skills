# Diagram studies

Five interactive SVG and DOM recreations of the supplied Kit Langton videos. They render real text, paths, controls and editable content. The original videos are available alongside them for comparison.

```bash
python3 serve.py 8130
```

Open [the gallery](http://localhost:8130/). Run the command from this directory. There is no build step or package installation.

| Example | Demonstrated pattern | Direct interaction |
| --- | --- | --- |
| Live workspace | Linked tool inventory, session log and file tree; accordion reflow; signal beads | Expand Tools or Skills |
| Conditional routing | Decision graph, rounded routes, traveling requests and arrival pulses | Change user ID and run a request |
| Live model table | Keyed rows, grouping, price updates, toggles, scrolling and elastic reflow | Toggle models, refresh, scroll |
| Registry pipeline | Source refresh, policy filtering, loading states and availability counts | Refresh sources, change policy, toggle models |
| Live document | Focus dimming, simulated typing, selection, scrolling and layout reflow | Edit the middle paragraph; Escape leaves editing |

Use Play for uninterrupted playback, the timeline or time readout to seek, and Replay to restore the recorded state. Direct interaction pauses the recording. Edits survive seeking until Replay. Focus view enlarges the study; Compare reference plays the supplied clip on the same clock.

## Reuse

Each `scenes/*.js` module exports `meta` and `mount(host, context)`. Mount returns `render(seconds)`, `reset()` and `destroy()`. The gallery owns playback time; scene renderers compute their state from that time. This makes paused views, backward seeks and different playback speeds reproducible.

Change the labels, data, geometry and event schedule to build a lesson about another subject. These patterns cover decision trees, workflows, dependency graphs, data pipelines, state transitions, live dashboards and document walkthroughs. They are worked examples, not a general graph-layout engine.

The `animated-diagrams` skill packages this starter with a scaffold script, validation and authoring guidance. Narrated courses can use it together with `narrated-tutorials`; the integration reference explains how to connect a scene to the narration clock.

## Sound

Workspace and document references have no audio, so playback and manual interactions stay silent and the control shows **No SFX**. The other three scenes generate individual effects from measured source envelopes and frequency bands. The visual transition emits the sound event during replay or a live interaction. No original soundtrack or extracted audio samples are loaded. **SFX on/off** and volume control the generated effects without preview beeps. Pausing and scrubbing stay silent. `sound.json` selects `silent` or `reference-effects` and maps semantic events to synthesizer voices.

## Runtime checks

Run `node --test tests/sound.mjs` for sound lifecycle and synthesis checks. Open `tests/sound-runtime.html` to verify replay transitions, manual requests at an arbitrary time, cancellation, and silent scenes. Open `tests/runtime.html` to exercise reduced motion, obscured table controls, and deterministic seeking.

## Reference and fidelity

`sources.json` records the supplied filenames, exact video durations and SHA-256 hashes. The local `references/*.mp4` copies are ignored by Git. In a fresh checkout, supply those clips at the listed paths to enable comparison. The reusable skill excludes the original clips and private source paths.

The recreations preserve the visual structures, major state changes and interaction patterns. Typography, individual signal paths, spring shapes and subsecond event timing are approximations. They are not certified pixel-identical copies. The model names and prices are demonstration content from the references, not current product data. Nodes, models, and registry synthesize source-informed one-shot effects. Their timbre is an approximation, not a verified perceptual match. Workspace and document clips stay silent. The optional reference video stays muted, and the generated effects work with reference comparison disabled.

Commit Mono is bundled under the SIL Open Font License in `fonts/OFL.txt`.

The registry uses measured one-shot signal journeys, staggered masked row entry, rolling counters, and a continuous upward displacement wave. Its timing and analytic wave map live in `scenes/registry-motion.js` and `scenes/registry-distortion.js`. Open `tests/registry-runtime.html` for interruption and playback regressions, or `tests/registry-performance.html` for frame-pacing measurements.
