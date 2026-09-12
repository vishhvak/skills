# Registry motion study

The registry study uses three modules: `registry.js` owns SVG and interaction lifecycle, `registry-motion.js` samples replay state, and `registry-distortion.js` produces a static analytic displacement map plus its moving phase. Keep these files together when copying the example.

## Reconstruct choreography before easing

One-second state samples missed most of this reference's motion. Inspect adjacent frames around the charge, launch, impact, reveal and settle boundaries before setting durations. The source runs at 60 fps; the following intervals were measured from native frames. They are examples for this recording, not defaults for unrelated diagrams.

| Event | Measured source interval |
| --- | --- |
| Upstream port charge | 0.57–0.98s |
| Upward request to models.dev | 1.00–1.17s |
| Dev spinner becomes check | 2.47–2.57s |
| Dev delivery to table | 2.78–3.54s |
| First staggered content entrance | 3.70–4.40s |
| First policy delivery | 5.33–6.17s |
| First four switches begin filtering | 6.13, 6.27, 6.38, 6.53s |
| Accelerated countdown drain | 8.25–9.75s |
| First displacement wave | 15.20–16.37s |
| Third refresh delivery / new reveal | 19.50–20.23s / from 20.33s |
| Second policy delivery / check | 21.90–22.78s / 23.22–23.38s |
| Fourth refresh delivery | 28.63–29.35s |
| Repeated displacement wave | 31.95–33.12s |

A request travels upward on the short wire. A separate delivery travels along the entire route into the table. The policy delivery finishes before its spinner becomes a check. The repeated refreshes have different charge and travel durations. A fixed modulo loop on a wire loses these relationships, even when the final table contents are correct.

## Continuous presentation

- Reveal the table with a soft mask moving downward. Rows have staggered vertical settling and blur release; the entire table does not fade in simultaneously.
- Interpolate switch position and row emphasis. Keep target data separate from presentation weights so counts and accessibility state remain coherent.
- Keep each countdown digit in its own clipped vertical reel, with a fixed colon. During a fast drain, derive each digit's phase from its place value and the continuous remaining time. Comparing adjacent integer strings misses skipped carries. Reset reel speed when a refresh installs 60:00.
- Keep the table's outer geometry stable during emptying. The wave deforms local contours in repeated upward-moving bands and continues after the rows disappear. Do not substitute a rigid shake or a shrinking table.
- Use a cached, analytic SVG displacement map with a smooth offset. The starter uses 230 viewBox-unit spacing, 670 units/s travel and a six-unit displacement bound. The precise crest profile remains an approximation.
- Apply manual actions through the same presentation functions. Snapshot the displayed pose when interrupted, continue any visible exit, cancel owned animation frames on pause or disposal, and retain the manual result until Replay.

## Verification

Run `node --test tests/registry-motion.mjs` in the generated workspace. Open `tests/registry-runtime.html` for entrance, full-path delivery, deterministic seeking, interruption, countdown reset, cancellation and reduced-motion checks. `tests/registry-performance.html` measures actual frame intervals and scene sampling cost in the current browser; report the measured environment and long frames as well as the average.

Compare playback through both entrance cycles and both wave intervals, including the source's presented frame timestamps. Numeric state tests cannot certify visible fluidity. Keep exact contour shape, glyph rasterization and residual timing differences separate from the verified interaction behavior. Source audio is never used as a soundtrack; retain the event-driven sound contract in [audio.md](audio.md).
