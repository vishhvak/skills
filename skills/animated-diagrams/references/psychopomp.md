# Explainer videos with Psychopomp

Psychopomp is the Rust engine behind the Kit Langton style this skill's web scenes recreate. Use it when the deliverable is a video: an MP4 explainer, a narrated reel, or a native slideshow. It renders on the GPU, samples motion blur, and encodes with FFmpeg. Its repository carries its own authoring skills; this file covers getting it, keeping it current, where our scenes live, and voice.

## 1. Sync the engine

The clone lives at `~/Repos/psychopomp` (github.com/kitlangton/psychopomp, MIT since `156444d`). It changes most days, so every session starts by syncing:

```sh
source ~/.cargo/env
[ -d ~/Repos/psychopomp ] || git clone https://github.com/kitlangton/psychopomp.git ~/Repos/psychopomp
git -C ~/Repos/psychopomp pull --ff-only
(cd ~/Repos/psychopomp && cargo build --release -p psychopomp-render)
```

The clone stays clean: our scenes live outside it, so `pull --ff-only` always applies. If Rust is missing, install it with rustup (`--profile minimal --component rustfmt,clippy`). **Gate:** `~/Repos/psychopomp/target/release/psychopomp plan schema` prints JSON.

## 2. Read the engine's own skills

Psychopomp's authoring rules are the source of truth; read them from the synced clone, not from memory:

- `.agents/skills/psychopomp/SKILL.md` and `STORY.md`: the reel workflow, script structure, review and render gates.
- `.agents/skills/explainer-motion/SKILL.md` and `TECHNIQUES.md`: the motion vocabulary (`settle_in`, `connect`, `send`, `hit`, camera moves).
- `SCENE_PLANS.md` (the "Build An Explainer" table picks the closest example scene), `DSL.md` for the score DSL, `CONTEXT.md` for terms.

Where those files say to author in `scenes/<name>` and commit inside Psychopomp, follow section 3 instead. Their other steps apply as written.

## 3. Where a scene lives

A Scene Program is a small Rust crate. Put it in the destination project (its instructions name the place; private work in a repository with `.agents/blueprint.json` goes under `.agents/work/explainers/<name>/`), with path dependencies on the clone and the clone's lockfile:

```toml
[package]
name = "<name>-explainer"
version = "0.1.0"
edition = "2024"

[dependencies]
anyhow = "1.0"
psychopomp = { path = "/home/vishhvak/Repos/psychopomp/crates/psychopomp" }
# psychopomp-media = { path = "/home/vishhvak/Repos/psychopomp/crates/psychopomp-media" }  # only for generated voice or sound
serde_json = "1.0"
```

Copy `~/Repos/psychopomp/Cargo.lock` beside it before the first build so dependency versions match the engine. Start from the closest example's `src/` (copy, then change content, not machinery). Build the plan with `cargo run --release`, then use the clone's binary for everything else:

```sh
PP=~/Repos/psychopomp/target/release/psychopomp
$PP plan validate target/<name>.json
$PP plan inspect target/<name>.json
$PP plan frame target/<name>.json <seconds> out.png --shutter
$PP plan render target/<name>.json out/<name>.mp4 --theme neutral
```

`bun scripts/sheet.ts` (contact sheets) runs from the clone with the plan's absolute path. **Gate:** `plan validate` reports `"valid": true` and frames at every beat show no overlapping or clipped text.

## 4. Voice is optional

Choose from the request. With no request, make the film silent.

| Request | Path |
|---|---|
| None | Time beats with `author::seconds(..)` and carry the words in `Caption` and `Callout` text. No audio track. |
| ElevenLabs (or Fish Audio) | Declare lines with `psychopomp-media` (`media.say`), as the engine skill describes. It needs `ELEVENLABS_API_KEY` (or `FISH_AUDIO_API_KEY`) and spends money: run `PSYCHOPOMP_MEDIA=plan cargo run` first, show the planned calls, and generate only after the person approves the spend. ElevenLabs returns word alignment, so no Whisper is needed. |
| VoxCPM (local) | Voice each clip with the narrated-tutorials skill's `scripts/voxcpm_generate.py` (setup and model terms in its `references/voices.md`), writing `<id>.wav` per clip. Then run the bridge below, and load the folder with `Narration::load(dir)` and `Narration::reading(..)`. |

The engine's `scripts/narrate.ts` cannot run here: its draft voice is macOS `say` and its word timing is Apple-only `mlx-whisper`. The bridge replaces that half for any locally voiced audio:

```sh
uv run --isolated --with faster-whisper python3 {baseDir}/scripts/psychopomp_narration.py \
  --script <scene>/narration/script.json --audio-dir <voiced-dir> --engine voxcpm
```

It applies narrate.ts's loudness target (-16 LUFS), times words with faster-whisper `small.en`, and writes `<id>.mp3`, `<id>.words.json` and `narration.json` beside the script. Against the engine's own ElevenLabs clips (`scenes/2password`) it matched 120 of 122 words, with word starts a median 0.1 s later than ElevenLabs' alignment (90th percentile 0.4 s). Anchor beats on phrases the transcript actually contains; `spoken.at` panics on a phrase it cannot find, naming the clip.

## 5. Render and deliver

Render one segment (`--cue <id>` or `--range a..b`) before the whole film. On this workstation (AMD RX 9070 XT through RADV Vulkan) a 15.4 s 1080p60 render with 8 motion-blur samples took 200 s, about 13 s per film second; the RADV "not a conformant Vulkan implementation" warning is expected. **Gate:** `ffprobe` shows 1920x1080, 60 fps, h264 (plus AAC when voiced) and the duration `plan inspect` reports.

Deliver the MP4 and a poster frame (`plan frame ... --shutter`) to the place the destination project names, and embed it as `<video controls preload="metadata" poster="...">`. Keep the scene crate so the film can be re-rendered after the engine updates.
