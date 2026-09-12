# Portable narration with Breeze TTS

Use Breeze TTS 2 by default, unless the user selects another provider or its runtime/terms do not fit the project. The client works with the upstream API on any user-selected compatible machine. A laptop can call a local server, a private remote server, or an SSH-forwarded port. There is no required machine name, GPU owner, Voice Lab repository, or named speaker preset.

## Choose a voice once

- **No reference supplied:** use voice design. Follow the requested voice description; otherwise start with a calm, clear narrator with a natural pace. Generate a short calibration clip, listen when audio tools permit, and keep its text and WAV in the project. For consistent multi-section narration, reuse that generated clip and its exact transcript as the reference for subsequent sections. A fixed seed alone does not guarantee identical speaker identity across requests.
- **Reference supplied:** use the provided clean speech sample with its exact transcript. Reuse the same pair across sections. Ask for a sample/transcript only when the user requests a particular voice and those inputs are missing; ordinary narration can use voice design.
- **Existing service preset:** when the user already has a Voice Lab-compatible service, use its configured voice id explicitly. Presets and recordings belong to that service/project and are not bundled with this skill.

The [official Breeze documentation](https://huggingface.co/BreezeBlue/Breeze-TTS-2) describes reference-free voice design, reference cloning, and voice direction. Use supplied or otherwise authorized recordings and retain their provenance in the project.

## Direct upstream API

The standard-library client in `scripts/narrate.py` writes a new validated WAV plus a `.generation.json` provenance sidecar. `--server` is the API base URL, not the full speech route. It defaults to `http://127.0.0.1:7860` for `breeze-api`.

Design a voice without any recording:

```sh
python3 {baseDir}/scripts/narrate.py \
  --provider breeze-api --server http://127.0.0.1:7860 \
  --voice-description "A calm, clear narrator with a warm voice and an even pace" \
  --text-file narration.txt --output narration.wav
```

With no reference, description or instruction, the client selects the neutral narrator description. To clone a chosen reference instead:

```sh
python3 {baseDir}/scripts/narrate.py \
  --provider breeze-api --server http://127.0.0.1:7860 \
  --reference-audio voices/narrator.wav \
  --reference-text-file voices/narrator.txt \
  --text-file section-01.txt --output section-01.wav
```

`--instruction` adds delivery direction. The client sends multipart form data to `/v1/audio/speech`; it wraps the upstream mono signed 16-bit PCM response in a WAV. It does not use Voice Lab's queued-job protocol. Endpoint health is separate from synthesis quality:

```sh
python3 {baseDir}/scripts/doctor.py --workspace . \
  --breeze-server http://127.0.0.1:7860
```

The server receives the narration and any selected reference sample. Use an endpoint the user has chosen and can access; an arbitrary vendor endpoint is not automatically protocol-compatible. For a remote GPU, keep the API private and use the user's existing secure connection or an SSH port forward to its loopback port. Choose hostnames, credentials, storage paths and ports from the current environment.

## Set up compute when no endpoint exists

First inspect available compute and the current [upstream requirements](https://github.com/breezeblue-ai/breeze-tts). The documented Breeze path uses Linux, Python 3.10+, an NVIDIA CUDA GPU, and recommends at least 12 GB VRAM for eager inference. Do not assume native macOS/CPU support for this path. The client and generated tutorial do not require a GPU; only the model server does.

On the selected compatible host, use a dedicated environment and explicit model storage paths:

```sh
git clone https://github.com/breezeblue-ai/breeze-tts.git
cd breeze-tts
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install huggingface_hub
hf download BreezeBlue/Breeze-TTS-2 --local-dir /path/to/models/Breeze-TTS-2
python -m breeze_infer.api /path/to/models/Breeze-TTS-2 \
  --host 127.0.0.1 --port 7860
```

These are model-server commands, not mandatory setup on every client. Check the selected host's CUDA/PyTorch compatibility and model terms before downloading. The skill bundles neither weights nor compute. If suitable compute is unavailable, report that dependency and offer the existing VoxCPM path or an endpoint/provider the user can supply; continue authoring the lesson without fabricating narration or word timings. Never silently switch providers.

## Optional alternatives

### Existing Voice Lab service

The legacy adapter remains available without a preset default:

```sh
python3 {baseDir}/scripts/narrate.py \
  --provider breeze --server http://127.0.0.1:8124 \
  --voice YOUR_CONFIGURED_VOICE_ID \
  --text-file narration.txt --output narration.wav
```

This mode requires `GET /api/voices`, `POST /api/generate`, `GET /api/jobs/{id}`, and the returned audio URL. It is a distinct API from upstream Breeze. Use `doctor.py --voice-server URL` for its legacy status check. Neither this service nor another repository is required for direct Breeze generation.

### Local VoxCPM

Use a downloaded local VoxCPM2 snapshot and an environment with the official `voxcpm` and `soundfile` packages:

```sh
python3 {baseDir}/scripts/narrate.py \
  --provider voxcpm --python /path/to/voxcpm-venv/bin/python \
  --model-path /path/to/models/VoxCPM2 \
  --voice-description "A calm, clear narrator" \
  --text-file narration.txt --output narration.wav
```

For isolated-reference cloning, add `--reference-audio`. For prompt continuation cloning, use `--prompt-audio` with its exact `--prompt-text`. The adapter disables automatic model downloads; prepare the snapshot separately using the [official VoxCPM setup](https://github.com/OpenBMB/VoxCPM). Confirm that setup against the chosen platform rather than treating this as an automatic fallback.

## Terms and verification

Breeze's code and open model have different licenses; follow the current [model terms](https://huggingface.co/BreezeBlue/Breeze-TTS-2). The open weights and self-hosted outputs are research/non-commercial unless separately authorized. VoxCPM's [official repository](https://github.com/OpenBMB/VoxCPM) documents its own license and runtime.

Focused tests use local fake HTTP endpoints and a fake VoxCPM process. They verify protocol, audio conversion, input validation, cleanup and provenance without loading model weights. Record live GPU generation, voice consistency, intelligibility and alignment separately. A passing client test does not establish voice similarity or a successful model install.
