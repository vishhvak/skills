# Authored SVG/HTML diagrams in a narrated section

A section can use `diagram` instead of `scenes` or `frames`. This makes a custom scene part of the compiled site rather than an edit that must be repeated after every rebuild.

```json
{
  "id": "reservation",
  "title": "Reserve before moving",
  "text": "Reserve the destination. Move into the reserved cell.",
  "audio": "audio/reservation.wav",
  "alignment": "audio/reservation.aligned.json",
  "diagram": {
    "directory": "diagrams/reservation",
    "entry": "scene.js",
    "cues": [
      {"id": "begin", "time": 0},
      {"id": "reserve", "atWord": "Reserve", "nth": 1},
      {"id": "move", "atWord": "Move", "nth": 1}
    ]
  }
}
```

The directory contains agent-authored, trusted module code and all its relative imports/assets. Paths resolve relative to the lesson. The compiler copies the directory under `diagrams/<chapter>/<section>/`, checks the entry and file boundaries, and resolves cue words through the section's real alignment. Cue ids are unique and times strictly increase; choose separate words when events need separate times. Use no private model endpoints, original-video overlays or generated media shortcuts in this module.

`entry` exports `meta` and `mount`:

```js
export const meta = {id: "reservation", duration: 20, viewBox: [1000, 650]};
export function mount(host, context) {
  const cues = Object.fromEntries(context.cues.map(cue => [cue.id, cue.time]));
  // Create stable SVG/HTML elements; use cues to sample continuous transitions.
  return {
    render(audioSeconds, {playing = false, seeking = false} = {}) {},
    reset() {},
    stop() {},
    destroy() {}
  };
}
```

`render` receives actual narration time in seconds. The module owns its geometry, transitions and optional interaction; the player owns narration, navigation and continuous playback. It calls the module every paint, including paused seeks. Use finite transition windows after meaningful cues so movement has a visible beginning and end, with quiet holds between explanations. Do not spread a 500ms handoff over a whole paragraph.

`context` provides `cues`, `pause`, `play`, `seek`, `getTime`, and `announce`. A manual action pauses narration, snapshots its displayed state, and preserves that override across seeks until `reset` on Replay. `stop` cancels owned manual animation; `destroy` releases listeners, frames and DOM. The player guards late imports and callbacks after navigation. Initial sampling after a late import is passive so it cannot replay old events.

Scene SFX are separate from narration. This host does not supply a sound engine by default. Keep modules silent unless sound is part of the brief; if adding effects, include and own the event engine's mute and cleanup behavior using animated-diagrams' audio reference. Never use the original clip soundtrack over a recreation.

The compiler copies code but does not execute it to certify quality. Browser module errors are displayed explicitly. Verify imports, real motion, keyboard interaction, pause/seek/replay, rapid section changes, reduced motion and the final frame in the generated player. Generated sites need neither the skill nor the authoring directory after compilation.

## Fit the narrated stage

Inspect at the real split-view dimensions, not only a full-width gallery. A 1000-unit viewBox displayed at 600px turns a 14-unit label into 8.4px text. Adjust composition and type so the main labels remain readable at delivery size. Use the host `var(--mono)` or its registered `Commit Mono` family; an unregistered near-spelling silently falls back to another font. Keep descriptions out of narrow label rows and leave footer/caption space without overlapping the scene.
