# Recreate an observed recording

Inspect the supplied video through the harness's available video skill or browser. Read metadata first: native frame width and height, exact duration, frame rate, and any rotation. Preserve the measured duration in scene metadata instead of rounding it to whole seconds.

Use a contact sheet for coarse navigation, then follow [fidelity.md](fidelity.md) for browser-rendered colors, geometry, and lighting. Inspect every significant transition from onset through its crest to settling. Record actual presented-frame timestamps beside each observation, marking uncertain timings as approximate. When the source has audible sound or is silent, read [audio.md](audio.md) and record that source-sound state separately from visual cues. Treat a stream containing only silence as silent. Establish sound from the measured recording; a visual event alone is not sound evidence.

## Verify the frame timestamps

Use the best available path and record which one supplied the evidence:

- **Browser video:** use the starter's presented-frame label when available. A native `requestVideoFrameCallback` reports `metadata.mediaTime` after a frame is presented. Wait for presentation before capturing; changing `video.currentTime` alone does not prove that the new frame is visible.
- **Verified decoder:** retain each decoded frame's presentation timestamp and unique sequence number. Confirm the first, crest and final indexed frames against the recording. For an input seek, use the measured interval length with `-t`, rather than an absolute end as output `-to`.
- **Unverified extractor or no decoder:** retain coarse observations and mark precise timing as unverified. Continue useful implementation work, but do not assign frame-accurate times from uncertain cache labels.

Check for duplicate rounded labels, overwritten images, frames beyond the requested interval, and a mismatch between playhead and presented frame. These failures occurred in a previously inspected video tool; verify the installed tool's behavior instead of assuming every version has that bug. A coarse contact sheet can guide navigation but cannot establish subsecond choreography. Relabeling old cached images does not repair their provenance.

After analysis, choose the closest implementation in [patterns.md](patterns.md). Apply the content/metadata adaptation checklist in [authoring.md](authoring.md), using the observed source as authority for labels, geometry, controls and sound. Keep a passive source's controls limited to the requested playback surface.

## Enable comparison in the generated workspace

Put the supplied clip below the generated workspace, for example `references/nodes.mp4`. Add one record to `sources.json`:

```json
[
  {"id":"nodes","file":"references/nodes.mp4","duration":21.653333}
]
```

`id` matches a gallery scene. `file` is a relative, existing local file. Optional `duration` records the measured source length; it must agree with the scene within 0.02 seconds, allowing source metadata precision. Optional `sha256` records source identity. Keep personal absolute paths in private workspace notes, away from shared assets and manifests.

The gallery enables Compare reference only for scenes with a record. Match viewport, displayed size, aspect ratio, and playback speed; compare recreation time to the reference's **presented** frame time. Its native video clock drives comparison playback when ready, but equal playheads alone do not prove equal displayed frames. Inspect actual playback through each lighting or deformation crest, then capture before, active, and settled samples. Keep the comparison `<video>` muted at all times; the original clip is visual comparison material and never the replica's sound source.

For a source with audible sound, measure the transient onset, envelope, peak, dominant frequency or spectral character, and duration against the presented frame timestamps. Add a `reference-effects` entry whose semantic event map uses only names in `SOUND_VOICES` from `sound.js`, derived from `SYNTH_VOICES` in `sfx-voices.js`; keep the measurements in [audio-measurements.md](audio-measurements.md) when that file is present. Do not extract or bundle a source track, and do not measure source-track drift as a runtime contract. For a source with no audible sound, including a silent-only stream, add exactly `{"kind":"silent"}` with no events or media fields. This reference-recreation mode preserves silence when the source is silent; narration remains independent.

List differences concretely: “the route bends 12 native pixels lower” or “the reveal begins about 0.15 seconds later.” Separate layout, text, color, timing, and interaction differences in notes. A recreated behavior can be useful while still differing in typography or fine motion. Original video files are reference material in the user's workspace; the reusable skill carries the implementations and analysis procedure.
