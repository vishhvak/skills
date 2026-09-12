# Adapt the examples to a new subject

Start with the subject and a visible causal story. For example, a photosynthesis diagram can show water and carbon dioxide entering a leaf, sunlight enabling a reaction, then glucose and oxygen leaving. A user can change light availability and run the process. This is authored teaching content; it does not need a reference video or narration.

Choose the closest implementation in [patterns.md](patterns.md). Keep the existing internal scene id when adapting the bundled gallery so filenames, navigation and manifest entries stay aligned. The public title and labels should describe the requested subject.

## Standalone gallery adaptation

The scaffold copies all five examples and selects one initially. For a focused page, pass `--single --example nodes` (or the closest example). The generated catalog exposes only that scene and the manifest sets `shippedScenes` to it. To adapt the result:

1. Edit the chosen scene under `scenes/`. Replace its `meta` title, description, duration and hint; SVG title/description; visible labels/data; accessibility names; state transitions; and manual interaction. Reuse geometry helpers only where they fit the new story.
2. Update that scene's catalog entry in `gallery.js` and the gallery title/copy in `index.html`. Single mode already filters the catalog. Leave unshown modules as implementation resources; the validator still checks the complete bundle structurally. An existing app can import only the selected scene and its dependencies instead.
3. Set `sources.json` to `[]` unless a real comparison recording was supplied. Set the adapted scene to `{"kind":"silent"}` in `sound.json` when no sound is requested or observed. For requested authored sounds, use the same event engine with an explicit event map and describe them as authored, without implying source fidelity.
4. Update the selected scene's duration in `diagram-manifest.json`. Record which examples are shipped and which remain unused implementation resources. The validator checks all five modules structurally and limits browser QA to `shippedScenes` when present. Keep unused examples outside the delivery's browser scope; do not mark uninspected examples passed.
5. Open the page and inspect the selected scene's complete sequence and manual action. Search user-facing output for labels left over from the original subject. Keep unused reference-example code out of the visible navigation.

For multiple new scenes, use the existing app's catalog/routing conventions and extend validation to match that application. The starter's five ids are its bundle contract, not a universal diagram vocabulary.

## Content and rendering choices

Use SVG for connectors, nodes, pulses, masks and local deformation. Use HTML for paragraphs, native text editing and content-driven layout. Both can share a deterministic scene clock. The starter has no React dependency; within a React app, mount the scene into a ref and dispose it when that component unmounts, or express the same lifecycle in existing components.

Keep visible state and its presentation separate. A switch can commit its target immediately while its position settles; a delivery can reach a port before the receiving rows finish appearing. A manual interruption starts from the displayed pose. Avoid replacing a meaningful process with unrelated decorative motion.

An embedded scene must include every direct import, its font/license, and any mask/filter resources. `editor.js` imports the workspace diagram from `blog.js`. The registry imports both its motion and distortion modules. Inspect imports before extracting a scene.

For narration, word highlighting, guiding cursors and continuous lesson playback, use [integration.md](integration.md). If the sibling narrated-tutorials skill is not installed, keep the requested diagram usable and report the missing narrated-player capability; it is not a prerequisite for an unnarrated diagram.
