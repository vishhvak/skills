# Match reference sound with synthesized effects

Read this when a supplied clip may carry sound. Treat the recording as measurement evidence, then render deterministic one-shot synthesized effects from its measured spectral and envelope features. Keep original tracks and sliced samples in source-analysis notes only. The reference video is always muted, so the original clip never plays audio over the replica. If the source has no audible stream, including an absent stream or a stream containing only silence, keep the scene silent even when users interact with it. For narrated lessons, narration remains the master clock. For a new topic without a recording, default to silence; if the user requests sound, author event effects and label them as authored rather than source-matched.

## Choose one sound kind per scene

`sound.json` is an object with exactly the five scene ids. Every entry has one of the two runtime kinds. A silent entry contains exactly `kind`; an audible source uses a non-empty semantic-event map:

```json
{
  "blog": {"kind": "silent"},
  "nodes": {"kind": "reference-effects", "events": {
    "request": "crispTick",
    "route": "crispTick",
    "arrival": "settleTone"
  }},
  "models": {"kind": "reference-effects", "events": {
    "update": "dataBurst"
  }},
  "registry": {"kind": "reference-effects", "events": {
    "source": "softPulse",
    "toggle": "crispTick"
  }},
  "editor": {"kind": "silent"}
}
```

Use `silent` for an absent or silent-only source. Use `reference-effects` for generated event effects. In a recreation, measured source sound determines the map. In a new scene with explicitly requested sound, the same runtime kind carries authored effects; record their purpose rather than inventing source evidence. Its `events` keys are semantic event names and its values must be exact names exported by `SOUND_VOICES` from `sound.js`; that array is derived from `Object.keys(SYNTH_VOICES)` in `sfx-voices.js`. Use the runtime's current exported list rather than inventing a voice name. Keep the manifest shape exact: silent scenes have no extra properties, and audible scenes have only `kind` and `events`. Track, cue, media, URL, source, and other original-audio fields have no place in either entry. The checker validates the runtime's `SOUND_KINDS`, imports `SOUND_VOICES` from `sound.js`, compares it with `Object.keys(SYNTH_VOICES)` from `sfx-voices.js`, and checks every mapping.

## Use the shared sound runtime

`sound.js` exports `SOUND_KINDS`, `SOUND_VOICES`, and `createSceneSound`. The engine exposes `configure`, `play`, `prepare`, `pause`, `seek`, `effect(event)`, `setEnabled`, `setVolume`, and `destroy`:

- `configure(entry)` selects the current scene's `silent` or `reference-effects` entry.
- `play()` unlocks the engine after a user gesture; `prepare()` is its synchronous gesture-time alias. Preparation returns readiness within `100ms` even when `AudioContext.resume()` is still pending, so the UI can continue silently.
- `pause()` stops active effects. `seek(time)` cancels pending effects; the host owns the replay clock and passive rendering does not replay skipped history.
- `effect(event)` creates the mapped synthesized one-shot only when the selected scene is audible, enabled, and the audio context is already running. It drops an event while unlock is pending, with no late catch-up sound.
- `setEnabled(value)` and `setVolume(value)` control the master output; keep volume in `[0, 1]`. These settings and every transport control stay quiet.
- `destroy()` releases the engine permanently when its owning host is disposed.

The shared `sound-events.js` helper samples measured transitions. During active playback, call `render(t, {playing: true})`; for initial, paused, seek, and other passive renders, call `render(t, {playing: false})`. Passive renders never call `effect`. The helper suppresses repeated state, backward-seek history, paused samples, and gaps greater than `0.5s`; use it instead of a global timestamp list. Recorded playback and arbitrary manual actions must pass through the same visual transition helper so the visible change and its semantic sound event share one boundary.

An interaction calls `pause()`, then `prepareSound()` inside the same manual gesture before it schedules any `requestAnimationFrame` work. If preparation is asynchronous, await it before applying the visual change and its `sound(eventName)` together; guard the continuation with action generation, `stop()`, and `destroy()` state. This preserves the manual state while allowing the mapped effect to play once and prevents a late effect after cancellation. Play, Pause, Replay, seek, speed, Sound enable, and volume controls do not call scene sound. If a scene owns a manual `requestAnimationFrame` loop, its optional `stop()` cancels that loop while preserving the visible state; `destroy()` performs full cleanup.

## Measure before choosing a voice

Follow [video-analysis.md](video-analysis.md) to inspect the source stream and record audibility separately from visual cues. For an audible source, measure each transition's onset, envelope, peak, dominant frequency or spectral character, and transient duration. Use those measurements to choose or tune the deterministic voices in `sfx-voices.js`; keep the measurement record in [audio-measurements.md](audio-measurements.md) when that file is present. A visual pulse alone is not evidence that a sound exists. A source with no audible sound remains quiet, including manual edits, clicks, toggles, and scrolling.

Never copy, extract, slice, preload, or route the original clip audio through the runtime. Comparison media may exist as a local developer reference, but it is not a sound source for the replica. Keep the comparison `<video>` muted at all times. This prevents duplicate audio and makes the synthesized effect the only scene output.

## Verify the audible behavior

Record observations in `verification/qa.md` and mirror them in each scene's `sound` check. A complete sound row includes:

- the inspected source state (`silent` or audible) and the selected manifest kind;
- each semantic event, measured onset, and mapped exported voice name;
- silent load, paused playback, initial render, and seek checks with no effect output;
- active Play after a gesture, one effect at each measured transition, and manual actions using the same transition path;
- pause cancellation, backward seek, Replay, playback-rate changes, scene-switch cleanup, and transport controls with no beeps;
- enabled/disabled state, master-volume changes, and the absence of original or duplicate clip audio while the reference video is visible;
- recorded source-versus-synth measurements and any timing or perceptual difference observed while listening.

Manifest syntax, exported-enum checks, event mapping validation, and declared evidence are structural checks. They cannot hear the result or certify perceptual sound parity. Mark parity as unverified until browser playback has been listened to and the remaining differences are recorded. A silent source needs a recorded silence observation, not an invented effect pass.

For a narrated lesson, keep narration on its existing continuous master clock. A recreation whose reference is silent keeps scene effects quiet while narration remains independent. For a new lesson, follow the user’s sound brief and default to silence when none is given. A lesson with audible reference sound uses mapped synthesized effects, never the source clip audio, and keeps any comparison video muted.
