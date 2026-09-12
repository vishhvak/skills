---
name: animated-diagrams
description: Build interactive SVG and HTML diagrams for any subject, or recreate animated diagrams from video. Use for routing graphs, live tables, pipelines, editable document demos, and visuals embedded in narrated tutorials.
---

# Animated diagrams

Build editable web scenes with real SVG paths, shapes and text, plus HTML where native editing or layout helps. The standalone starter uses vanilla JavaScript and CSS; integrate with an existing app's framework when requested. Original recordings are comparison evidence, not the recreation's rendering or soundtrack.

This procedure supports Claude Code and Codex and assumes a fast, inexpensive model. `{baseDir}` is this skill's directory. Run scripts from the destination project and follow their reported results. Keep generated code, source analysis and verification artifacts in that project.

## Choose the mode

| Request | Read |
| --- | --- |
| Build a diagram for a new subject | [authoring.md](references/authoring.md) and [patterns.md](references/patterns.md) |
| Recreate a supplied recording | [video-analysis.md](references/video-analysis.md), then [patterns.md](references/patterns.md) and [fidelity.md](references/fidelity.md) |
| Embed a diagram in an existing app or narrated lesson | [integration.md](references/integration.md); preserve the host framework and playback clock |

The bundle has five editable examples: branching routes, a live workspace, a model table, a registry pipeline, and an editable document. They provide implementation patterns; adapt their data and interactions to the requested subject.

## Build and verify

1. **Establish the scene.** Read destination instructions and existing `diagram-manifest.json` / `verification/qa.md` when present. Write a state table covering every meaningful transition, the final state, and the intended controls. Playback/seek controls are sufficient for a passive recreation; preserve custom interaction only when observed or requested. For a recording, include measured charge, launch, impact and settle boundaries across its whole duration. Record the closest implementation pattern before scaffolding. For a new topic, choose states that explain the subject. **Gate:** the table names concrete objects, changes, controls and evidence or teaching intent.
2. **Start from working code.** For a standalone study, run the scaffold below and follow its printed commands. For an existing app, copy only the needed scene and its dependencies using the integration reference. Python 3.10+ and Node.js are needed for the bundled scripts; they require no packages. Use the browser capability available in the current harness. **Gate:** the chosen scene loads with local resources and structural checks pass.
3. **Complete one transition.** Read [motion.md](references/motion.md). Implement its resting state, continuous movement, interruption and settled state before extending the sequence. For registry-style choreography, read [registry-motion.md](references/registry-motion.md). **Gate:** play/pause and backward seeking preserve the intended state, and the intended controls work. For passive scenes, exercise the transport instead of inventing additional behavior. For a recording, compare onset, crest and settling against presented source frames.
4. **Complete the sequence.** Complete every authored state. Where manual exploration exists, use the same presentation functions and preserve manual edits through seek/resume until Replay resets them. For audible reference effects, read [audio.md](references/audio.md); use generated effects tied to semantic events. Silent references stay silent. A new topic stays silent unless sound is requested. Narration and voice generation belong to the narrated-tutorial workflow described in integration. **Gate:** every authored transition runs, source switches dispose old work, and passive renders/transport controls emit no effects.
5. **Deliver evidence.** Use the browser checks below and run the validator. Fix failed functional checks. Record approximate or unverified visual/audio fidelity plainly. If browser control is unavailable, retain that exact verification gap. **Gate:** deliver the running page, editable files, and verification results without presenting successful code checks as proof of perceptual parity.

```sh
python3 "{baseDir}/scripts/scaffold_diagrams.py" --output /path/to/diagrams --example nodes --single
python3 "{baseDir}/scripts/check_diagrams.py" --workspace /path/to/diagrams
python3 /path/to/diagrams/serve.py 8126
```

`--example` selects the initial example; the scaffold copies all five. Add `--single` to expose only that example and scope browser QA to it. Existing output paths are refused. To make the delivered page specific to a new subject, follow the gallery adaptation steps in [authoring.md](references/authoring.md).

## Scene lifecycle

```js
export const meta = {
  id: "nodes", title: "…", description: "…",
  duration: 12, viewBox: [1089, 579], capabilities: ["interactive"]
};
export function mount(host, context) {
  return { render(t, { playing = false } = {}) {}, reset() {}, stop() {}, destroy() {} };
}
```

`context` supplies `pause`, `play`, `seek`, `getTime`, `announce`, and optional `prepareSound` / `sound(eventName)`. `render` samples time in seconds, including backward jumps; pass `playing: true` only during active playback. `reset` clears manual state. Optional `stop` cancels autonomous manual motion while retaining the visible pose. `destroy` removes owned listeners, frames and DOM. Mount stable elements once and preserve focused editable nodes. The sound lifecycle is defined in [audio.md](references/audio.md).

## Browser checks

Record results in the workspace's `verification/qa.md` and manifest. Inspect every shipped scene:

- Beginning, middle, end, and each critical transition through its crest and settling.
- Intended controls, pause/resume, backward seek, and Replay. Where custom interaction exists, test it and interrupt it. For a passive scene, record that transport is its interaction surface.
- Resize, reduced motion, keyboard access, and console/resource failures.
- Silent load/seek, mapped effects when applicable, mute and cancellation, with comparison video muted.
- For a recording, matched geometry, rendered black levels, typography, deformation and timing using [fidelity.md](references/fidelity.md).

```sh
python3 "{baseDir}/scripts/check_diagrams.py" --workspace /path/to/diagrams --require-declared-qa
```

This final gate requires all declared checks to pass. A reported approximation or missing browser/listening check stays pending and is part of the delivery report. The checker validates structure and declared completeness; it cannot certify visual or audible similarity.
