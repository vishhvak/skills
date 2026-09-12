#!/usr/bin/env python3
# /// script
# requires-python = ">=3.13,<3.14"
# dependencies = ["parakeet-mlx==0.5.2; sys_platform == 'darwin' and platform_machine == 'arm64'"]
# ///
"""Align narration with Parakeet or import a real WhisperX word alignment."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any, TYPE_CHECKING

from scaffold_tutorial import Diagnostics, authored_word_timings

if TYPE_CHECKING:
    from parakeet_mlx import AlignedResult, AlignedToken

DEFAULT_MODEL = "mlx-community/parakeet-tdt-0.6b-v3"

def token_end(token: AlignedToken) -> float:
    """Return the model-provided end time, with a duration fallback."""
    end = getattr(token, "end", None)
    if end is not None:
        return float(end)
    return float(token.start) + float(token.duration)


def word_timings(result: AlignedResult) -> list[dict[str, Any]]:
    """Merge model subword tokens into exact timestamped words.

    ``parakeet_mlx`` replaces SentencePiece's ``▁`` marker with a literal
    leading space in each token.  A leading space starts a new word; tokens
    without it are continuation pieces or punctuation and stay on the current
    word.  Each output span is bounded by the original model token times.
    """
    output: list[dict[str, Any]] = []
    current_text = ""
    current_start: float | None = None
    current_end: float | None = None

    def flush() -> None:
        nonlocal current_text, current_start, current_end
        if current_text and current_start is not None and current_end is not None:
            if current_end < current_start:
                raise ValueError(f"non-monotonic model timing for {current_text!r}")
            output.append(
                {
                    "word": current_text,
                    "start": round(current_start, 3),
                    "end": round(current_end, 3),
                }
            )
        current_text = ""
        current_start = None
        current_end = None

    for token in result.tokens:
        raw = str(token.text)
        text = raw.lstrip()
        if not text:
            continue

        starts_new_word = raw != text
        if starts_new_word and current_text:
            flush()

        start = float(token.start)
        end = token_end(token)
        if current_start is None:
            current_start = start
            current_end = end
            current_text = text
        else:
            current_text += text
            current_end = max(current_end or end, end)

    flush()
    return output


def transcribe(audio_path: Path, model_name: str) -> dict[str, Any]:
    from parakeet_mlx import from_pretrained
    model = from_pretrained(model_name)
    result = model.transcribe(audio_path)
    return {
        "text": result.text.strip(),
        "wordTimings": word_timings(result),
    }


def whisperx_alignment(payload: dict) -> dict:
    words = payload.get("word_segments")
    if words is None:
        words = [word for segment in payload.get("segments", []) for word in segment.get("words", [])]
    if not words:
        raise ValueError("WhisperX export has no aligned words; run its alignment stage and export JSON.")
    timings = []
    for word in words:
        if not all(key in word for key in ("word", "start", "end")):
            raise ValueError(f"Unaligned word {word.get('word')!r}; regenerate alignment. Missing times cannot be estimated.")
        timings.append({key: word[key] for key in ("word", "start", "end")})
    return {"text": " ".join(word["word"] for word in timings), "wordTimings": timings}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--text-file", required=True, type=Path, help="Authored narration, checked against every aligned word")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--whisperx-json", type=Path, help="Import aligned word timestamps instead of running Parakeet")
    parser.add_argument("--allow-model-download", action="store_true", help="Allow Parakeet to fetch a missing model; otherwise use local cache only")
    args = parser.parse_args(argv)
    if args.output.exists():
        parser.error(f"Output exists: {args.output}; choose a new filename.")
    if not args.audio.is_file() or not args.text_file.is_file():
        parser.error("Audio and authored text must both exist.")
    try:
        if args.whisperx_json:
            result = whisperx_alignment(json.loads(args.whisperx_json.read_text()))
            backend = "whisperx-import"
        else:
            if not args.allow_model_download:
                os.environ["HF_HUB_OFFLINE"] = "1"
            result = transcribe(args.audio, args.model)
            backend = "parakeet-mlx"
        diagnostics = Diagnostics()
        timings = authored_word_timings(args.text_file.read_text(), result, "narration", diagnostics)
        if not diagnostics.ok:
            raise ValueError("; ".join(diagnostics.errors))
        result["wordTimings"] = timings
        result["alignment"] = {"backend": backend, "model": args.model if backend == "parakeet-mlx" else None}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x") as output:
            json.dump(result, output, indent=2, ensure_ascii=False)
            output.write("\n")
        print(json.dumps({"status": "ALIGNED", "output": str(args.output), "words": len(timings), "next": "Attach this alignment and audio to the section, then run scaffold_tutorial.py --check."}))
        return 0
    except ImportError:
        print("NEEDS_ALIGNMENT_RUNTIME: On Apple Silicon use uv run --script align.py, or import an aligned WhisperX JSON with --whisperx-json.", file=sys.stderr)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"ALIGNMENT_FAILED: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
