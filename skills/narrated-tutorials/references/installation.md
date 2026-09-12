# Install and package

The canonical skill lives at `skills/narrated-tutorials` in the user's `~/Repos/skills` repository. It is a regular skill directory containing `SKILL.md`, scripts, references, tests, examples, and bundled player assets.

For Claude Code, place or symlink the complete directory under `~/.claude/skills/narrated-tutorials`. For Codex, use `~/.codex/skills/narrated-tutorials`. Preserve an existing customized installation before replacing it. Both harnesses use the same commands and data contract; no harness-specific hooks or hidden tools are required. Reload skills or start a new task if an installed skill is not yet discovered.

Build a portable plugin for both harnesses:

```sh
python3 {baseDir}/scripts/package_plugin.py --output /path/to/dist/narrated-tutorials
```

The output contains `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and a complete `skills/narrated-tutorials/` directory, with no external symlinks. Use the harness's plugin installation flow for this local directory. In Claude Code, `claude --plugin-dir /path/to/dist/narrated-tutorials` loads a development plugin. Plugin packaging does not change marketplace configuration or publish anything.

Invoke with a concrete prompt such as:

> Use narrated-tutorials to teach an interested beginner how bread rises. Use a calm narrator, three short sections, diagrams, and continuous play. Build and verify the site in this project.

The bundled example has two chapters and three sections, with local diagrams, an image, animated text, cursors, and emoji. On Apple Silicon with Parakeet alignment available, generate its narration through a configured upstream Breeze endpoint and build it with:

```sh
python3 {baseDir}/scripts/create_example.py --workspace /path/to/new-bread-project \
  --server http://127.0.0.1:7860 \
  --voice-description "A calm, clear narrator"
```

This defaults to the upstream Breeze API. It designs and aligns one reference recording, then reuses it for the sections. Pass `--reference-audio` and `--reference-text-file` to use your own voice instead. Legacy Voice Lab requires `--provider breeze --server URL --voice YOUR_CONFIGURED_VOICE_ID`. The automatic example builder uses Parakeet alignment; on another platform, use `--prepare-only` and follow the WhisperX import workflow in [runtime.md](runtime.md). No speaker recordings or generated narration are distributed inside the skill.

For changes to the skill itself, run:

```sh
python3 -m unittest discover -s {baseDir}/tests -p 'test_*.py'
node {baseDir}/tests/test_continuous_player.js
node {baseDir}/tests/test_cursor_motion.js
node {baseDir}/tests/test_cursor_visuals.js
node {baseDir}/tests/test_lesson_scenes.js
```

The plugin is generated from this one source. Regenerate it after an update; do not patch the packaged copy independently.
