# Audio, alignment, and serving

## Audio

Use the portable CLI in [voices.md](voices.md). The preferred `breeze-api` provider talks directly to an upstream Breeze server chosen for the current environment. Use voice design for an ordinary narrator, or the user's reference audio and transcript for cloning. Generate and verify one short reference first, then reuse it across sections. The CLI writes WAVs and provenance into the project. Model compute may be local or remote; generated sites need no inference service. The optional `breeze` provider uses an explicitly configured Voice Lab preset.

Keep the authored section text in a `.txt` file beside its generated audio. Do not feed a whole chapter into one generation if it needs separate section replay controls.

## Real word alignment

On Apple Silicon, the bundled script uses Parakeet MLX in an isolated uv script environment:

```sh
uv run --script {baseDir}/scripts/align.py narration.wav \
  --text-file narration.txt --output narration.aligned.json
```

It uses the local Hugging Face cache by default. For a first model install, add `--allow-model-download`. Parakeet MLX is pinned to 0.5.2 and uses `mlx-community/parakeet-tdt-0.6b-v3`. The tested Mac workflow merges actual subword spans and verifies the authored word sequence before writing output.

On a supported Linux or Windows inference environment, run [WhisperX](https://github.com/m-bain/whisperX) with its alignment stage and JSON output, then import those word spans:

```sh
python3 {baseDir}/scripts/align.py narration.wav \
  --text-file narration.txt --whisperx-json whisperx-output.json \
  --output narration.aligned.json
```

Use the official WhisperX setup for that machine's GPU/Python versions. The importer accepts top-level `word_segments` or `segments[].words`. Missing word timestamps fail; they are never filled with evenly spaced or guessed times. A transcript mismatch also fails. The exporter must have aligned the same recording. WhisperX inference is an external runtime; importer tests alone do not verify that model.

Each output is `{text,wordTimings:[{word,start,end}]}` plus alignment provenance. Compiler validation checks these words against the authored narration again, including cue occurrences and audio bounds.

## Standalone website

The compiler copies all renderer code, local fonts, chapter data, scene images, and section audio. WAVs become WebM using FFmpeg's Opus encoder. The included Python server supports byte ranges so seeking lands accurately:

```sh
python3 {baseDir}/scripts/scaffold_tutorial.py --lesson lesson.json --check
python3 {baseDir}/scripts/scaffold_tutorial.py --lesson lesson.json --output site
python3 site/serve.py 8125
```

Open `http://localhost:8125`. Deploying is a separate user-authorized action. Static hosting must rewrite `/chapters/*` to `index.html` and serve media byte ranges. An already-generated site needs neither the model server nor this skill to play.

Provider and model licenses are in [voices.md](voices.md). The bundled Commit Mono font carries `assets/player/fonts/OFL.txt`; the compiler carries its license into the generated site. The player was reconstructed locally from the Effect reference; the bundle excludes the reference's course content and audio.
