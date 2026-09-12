# Verify the visible source, including its motion

Functional correctness and visual fidelity are separate results. Working Replay, syntax checks, and a filled QA manifest cannot establish a match. During calibration, keep visual checks pending and record the differences that still need work. For a new scene without a source, use the authored visual targets and label the result as target verification, not source parity.

## Match the comparison conditions

1. Record source identity, native dimensions, browser viewport, device pixel ratio, zoom, and the displayed video and recreation rectangles. Use the same aspect ratio and displayed scale. Exclude letterboxing and gallery chrome from scene measurements.
2. Follow [video-analysis.md](video-analysis.md) to verify the **presented** source frame. Record requested seek time and `requestVideoFrameCallback`'s `metadata.mediaTime` separately. Wait for the requested image to be presented before capturing it; a changed playhead is insufficient.
3. Capture both views through the same browser screenshot path. Keep the original captures and crop coordinates in workspace evidence so measurements can be reproduced. Measure colors from the rendered video in that browser. Raw decoded RGB can differ because video range, transfer functions, color conversion, scaling, and compositing affect what is displayed.
4. Choose an important event. Watch it continuously from before onset through maximum activity to the settled state. Capture those phases and extra samples around fast peaks; three overview stills at the beginning, middle, and end cannot establish shimmer, glimmer, or deformation.
5. Record each source cue, the implementation cue, and quantified residuals using the table below. Correct one class of mismatch, then repeat its comparison. Retain unresolved differences in the delivery notes.

## Two required visual checks

| QA record | Measure in matching source and recreation captures | Completion evidence |
| --- | --- | --- |
| `visual-tone` | Several blank-background patches, inactive card surfaces, border weight, radii, shape contours, glyph size, and text baselines | Pixel coordinates and RGB values from rendered captures; per-channel color differences and native-pixel geometry offsets, including remaining mismatches |
| `activity-lighting` | Ambient state, event onset, intensity crest, travel, arrival, and settling; affected surfaces and contours | Verified source-frame times, a continuously inspected interval, paired temporal samples, pulse/lighting/deformation observations, timing and spatial residuals |

For background tone, sample multiple small blank patches away from text, shadows, antialiasing, and video borders; report patch coordinates and a median RGB value. A CSS declaration such as `#000` says what was authored, not what the video displays. Measure the inactive state before judging active glow. Agree on acceptable differences from the task's fidelity target; do not invent a universal tolerance and use it to declare a match.

Match bounding contours, route junctions, corner radii, and text baselines before tuning glow. State geometry differences in native scene pixels by accounting for displayed scale. Measure both the blank black and the illuminated surface so making the entire scene darker does not conceal a missing local effect.

## Identify the actual effect

| Source observation | Recreate and verify |
| --- | --- |
| Light persists while nothing happens | Ambient lighting, measured before and after the event |
| Light moves within a surface or along its inner edge | Local inset shimmer with the observed direction, width, intensity envelope, and decay |
| A request travels down a curved route | Pulse follows the actual SVG curve through bends and junctions; arrival aligns with its endpoint |
| Endpoint lights briefly as the pulse arrives | Local arrival light with the measured delay and falloff; keep the whole card neutral unless the source visibly colors it |
| Letterforms or outlines ripple or bend | Glyph or contour deformation; compare relative points within the object, because rigid translation or rotation preserves its shape |

Track ambient and event-driven lighting separately. Turning every card green, substituting a shake for a distortion, or adding a generic outer glow changes the effect even when its trigger time is correct. Determine the effect from the source and preserve its spatial limits.

## Keep an auditable comparison

Write rows in `verification/qa.md`; link the relevant rows or artifacts from the two visual records' `evidence` fields. Populate them from actual observations, not from the renderer's event constants.

| Event or target | Actual source cue | Before / crest / settled presented times | Paired capture or clip | Source measurement | Recreation measurement | Residual and status |
| --- | --- | --- | --- | --- | --- | --- |
| Blank background | Region coordinates outside active surfaces | Measured inactive time | Local artifact paths | Median rendered RGB | Median rendered RGB | Per-channel difference; pending/pass/fail |
| Activity crest | Visible surface and observed lighting change | Verified fractional seconds | Interval clip plus peak samples | Peak location/intensity and settling time | Same measurements | Native-pixel and timing differences; pending/pass/fail |

State how finely time was observed, for example the source frame interval, rather than claiming precision beyond the evidence. Quantify remaining color, baseline, contour, pulse-position, onset, crest, and decay differences wherever relevant. If no difference is observed for a measured property, report that result and the sample resolution instead of expanding it into a claim of overall parity.

The checker only validates structural resources and declared record completeness. Even 60 declared pass fields do not certify visual parity. Delivery must separate functional verification, observed visual matches, and quantified unresolved differences, with actual source-cue evidence attached.
