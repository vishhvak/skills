#!/usr/bin/env python3
"""Small offline-only VoxCPM2 process wrapper used by narrate.py."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate one WAV from an explicit local VoxCPM2 model.")
    parser.add_argument("--model-path", required=True, type=Path)
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--voice-description", default="")
    parser.add_argument("--reference-audio", type=Path)
    parser.add_argument("--prompt-audio", type=Path)
    parser.add_argument("--prompt-text", default="")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--cfg-value", type=float, default=2.0)
    parser.add_argument("--inference-timesteps", type=int, default=10)
    return parser


def file_provenance(path: Path | None) -> dict | None:
    if path is None:
        return None
    resolved = path.expanduser().resolve()
    digest = hashlib.sha256()
    with resolved.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return {"path": str(resolved), "sha256": digest.hexdigest(), "bytes": resolved.stat().st_size}


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    model_path = args.model_path.expanduser().resolve()
    if not model_path.is_dir():
        parser.error(f"model directory does not exist: {model_path}")
    if args.output.exists():
        parser.error(f"output already exists: {args.output}")
    if args.prompt_audio and not args.prompt_text:
        parser.error("--prompt-text is required with --prompt-audio")
    for label, path in (("reference audio", args.reference_audio), ("prompt audio", args.prompt_audio)):
        if path and not path.is_file():
            parser.error(f"{label} does not exist: {path}")

    try:
        import soundfile as sf
        from voxcpm import VoxCPM
    except ImportError as error:
        parser.exit(
            2,
            "voxcpm_generate: missing runtime dependency. Install the official `voxcpm` "
            f"package and `soundfile` in this Python environment. Detail: {error}\n",
        )

    text = f"({args.voice_description}){args.text}" if args.voice_description else args.text
    generation = {
        "text": text,
        "cfg_value": args.cfg_value,
        "inference_timesteps": args.inference_timesteps,
        "seed": args.seed,
    }
    if args.reference_audio:
        generation["reference_wav_path"] = str(args.reference_audio.expanduser().resolve())
    if args.prompt_audio:
        generation["prompt_wav_path"] = str(args.prompt_audio.expanduser().resolve())
        generation["prompt_text"] = args.prompt_text

    started = time.monotonic()
    model = VoxCPM.from_pretrained(str(model_path), load_denoiser=False)
    wav = model.generate(**generation)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(args.output), wav, model.tts_model.sample_rate, format="WAV")
    print(
        json.dumps(
            {
                "adapter": "voxcpm-python",
                "model_path": str(model_path),
                "model": "openbmb/VoxCPM2",
                "model_config": file_provenance(model_path / "config.json")
                if (model_path / "config.json").is_file()
                else None,
                "sample_rate": model.tts_model.sample_rate,
                "seed": args.seed,
                "cfg_value": args.cfg_value,
                "inference_timesteps": args.inference_timesteps,
                "voice_description": args.voice_description,
                "reference_audio": file_provenance(args.reference_audio),
                "prompt_audio": file_provenance(args.prompt_audio),
                "prompt_text": args.prompt_text or None,
                "generation_elapsed_seconds": round(time.monotonic() - started, 6),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
