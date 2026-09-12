#!/usr/bin/env python3
"""Generate a validated WAV with Breeze or a local VoxCPM model."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from http.client import IncompleteRead
import json
import math
import mimetypes
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
import wave


SIDECAR_SUFFIX = ".generation.json"
TERMINAL_STATUSES = {"completed", "failed"}
DEFAULT_BREEZE_API_INSTRUCTION = "A neutral, clear narrator with natural pacing."
BREEZE_MODEL_ID = "BreezeBlue/Breeze-TTS-2"


class NarrationError(RuntimeError):
    """An actionable narration-generation failure."""


def sidecar_path(output: Path) -> Path:
    return output.with_suffix(SIDECAR_SUFFIX)


def ensure_new_outputs(output: Path) -> None:
    if output.suffix.lower() not in {".wav", ".wave"}:
        raise NarrationError("--output must end in .wav or .wave")
    for path in (output, sidecar_path(output)):
        if path.exists():
            raise NarrationError(f"Output already exists: {path}")


def read_text(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise NarrationError(f"Could not read narration text {path}: {error}") from error
    if not text:
        raise NarrationError(f"Narration text is empty: {path}")
    return text


def read_exact_text(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise NarrationError(f"Could not read exact reference transcript {path}: {error}") from error
    if not text.strip():
        raise NarrationError(f"Reference transcript is empty: {path}")
    return text


def validate_wav(path: Path) -> dict[str, int | float]:
    try:
        with wave.open(str(path), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            sample_rate = wav.getframerate()
            frames = wav.getnframes()
            compression = wav.getcomptype()
            pcm_bytes = 0
            while chunk := wav.readframes(65536):
                pcm_bytes += len(chunk)
    except (OSError, EOFError, wave.Error) as error:
        raise NarrationError(f"Provider did not produce a readable WAV: {error}") from error
    if channels < 1 or sample_width < 1 or sample_rate < 1 or frames < 1:
        raise NarrationError("Provider produced an empty or invalid WAV")
    if compression != "NONE":
        raise NarrationError(f"Provider produced unsupported compressed WAV audio: {compression}")
    expected_bytes = frames * channels * sample_width
    if pcm_bytes != expected_bytes:
        raise NarrationError(
            f"Provider produced a truncated WAV: expected {expected_bytes} PCM bytes, found {pcm_bytes}"
        )
    return {
        "channels": channels,
        "sample_width_bytes": sample_width,
        "sample_rate": sample_rate,
        "frames": frames,
        "duration_seconds": round(frames / sample_rate, 6),
    }


def request_json(url: str, *, payload: dict | None = None, timeout: float) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method="POST" if data else "GET",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.load(response)
    except HTTPError as error:
        with error:
            detail = error.read(4096).decode("utf-8", errors="replace")
        raise NarrationError(f"Voice endpoint returned HTTP {error.code}: {detail}") from None
    except (URLError, OSError, ValueError) as error:
        raise NarrationError(f"Could not use voice endpoint {url}: {error}") from error
    if not isinstance(result, dict):
        raise NarrationError(f"Voice endpoint returned non-object JSON from {url}")
    return result


def download(url: str, temporary: Path, *, timeout: float) -> None:
    try:
        with urlopen(url, timeout=timeout) as response, temporary.open("xb") as target:
            while chunk := response.read(65536):
                target.write(chunk)
    except HTTPError as error:
        raise NarrationError(f"Could not download generated audio: HTTP {error.code}") from None
    except (URLError, OSError) as error:
        raise NarrationError(f"Could not download generated audio: {error}") from error


def generate_breeze(args: argparse.Namespace, text: str, temporary: Path) -> dict:
    server = args.server.rstrip("/") + "/"
    voice_list = request_json(
        urljoin(server, "api/voices"), timeout=min(args.request_timeout, args.timeout)
    ).get("voices")
    if not isinstance(voice_list, list):
        raise NarrationError("Voice endpoint did not return a voices list")
    voice = next(
        (candidate for candidate in voice_list if isinstance(candidate, dict) and candidate.get("id") == args.voice),
        None,
    )
    if not voice or voice.get("ready") is False:
        raise NarrationError(f"Breeze voice is missing or not ready: {args.voice}")
    job = request_json(
        urljoin(server, "api/generate"),
        payload={
            "voice_id": args.voice,
            "text": text,
            "instruction": args.instruction,
            "seed": args.seed,
        },
        timeout=min(args.request_timeout, args.timeout),
    )
    job_id = job.get("id")
    if not isinstance(job_id, str) or not job_id:
        raise NarrationError("Voice endpoint did not return a generation id")
    deadline = time.monotonic() + args.timeout
    while job.get("status") not in TERMINAL_STATUSES:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise NarrationError(
                f"Breeze generation timed out after {args.timeout:g}s; inspect "
                f"{urljoin(server, f'api/jobs/{job_id}')}"
            )
        time.sleep(min(args.poll_interval, remaining))
        job = request_json(
            urljoin(server, f"api/jobs/{job_id}"),
            timeout=min(args.request_timeout, remaining),
        )
    if job.get("status") == "failed":
        raise NarrationError(f"Breeze generation failed: {job.get('error', 'unknown error')}")
    audio_url = job.get("audio_url")
    if not isinstance(audio_url, str) or not audio_url:
        raise NarrationError("Completed Breeze job did not include audio_url")
    absolute_audio_url = urljoin(server, audio_url)
    if urlparse(absolute_audio_url).scheme not in {"http", "https"}:
        raise NarrationError("Completed Breeze job returned an unsupported audio URL")
    download(absolute_audio_url, temporary, timeout=min(args.request_timeout, args.timeout))
    return {
        "adapter": "breeze-voice-lab",
        "endpoint": server.rstrip("/"),
        "voice": args.voice,
        "instruction": args.instruction,
        "seed": args.seed,
        "voice_manifest": voice,
        "provider_job": job,
    }


class NoRedirectHandler(HTTPRedirectHandler):
    """Keep a reference upload on the explicitly configured server."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def multipart_form(
    fields: list[tuple[str, str]],
    file: tuple[str, Path, bytes] | None,
) -> tuple[bytearray, str]:
    boundary = f"breeze-{secrets.token_hex(16)}"
    body = bytearray()

    def append_header(value: str) -> None:
        body.extend(value.encode("ascii"))
        body.extend(b"\r\n")

    for name, value in fields:
        append_header(f"--{boundary}")
        append_header(f'Content-Disposition: form-data; name="{name}"')
        body.extend(b"Content-Type: text/plain; charset=utf-8\r\n\r\n")
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")
    if file is not None:
        name, path, payload = file
        suffix = path.suffix
        if not suffix.isascii() or not suffix[1:].isalnum() or len(suffix) > 10:
            suffix = ".wav"
        filename = f"reference{suffix.lower()}"
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        append_header(f"--{boundary}")
        append_header(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'
        )
        append_header(f"Content-Type: {content_type}")
        body.extend(b"\r\n")
        body.extend(payload)
        body.extend(b"\r\n")
    append_header(f"--{boundary}--")
    return body, f"multipart/form-data; boundary={boundary}"


def native_request_error(error: HTTPError, endpoint: str) -> NarrationError:
    with error:
        detail = error.read(4096).decode("utf-8", errors="replace").strip()
    return NarrationError(
        f"Breeze API endpoint {endpoint} returned HTTP {error.code}: {detail or 'no detail'}"
    )


def generate_breeze_api(args: argparse.Namespace, text: str, temporary: Path) -> dict:
    server = args.server.rstrip("/")
    health_endpoint = f"{server}/health"
    speech_endpoint = f"{server}/v1/audio/speech"
    deadline = time.monotonic() + args.timeout
    opener = build_opener(NoRedirectHandler())

    reference_path = args.reference_audio.expanduser().resolve() if args.reference_audio else None
    try:
        reference_payload = reference_path.read_bytes() if reference_path else None
    except OSError as error:
        raise NarrationError(f"Could not read reference audio {reference_path}: {error}") from error
    if reference_payload == b"":
        raise NarrationError(f"Reference audio is empty: {reference_path}")
    reference_text = read_exact_text(args.reference_text_file) if args.reference_text_file else None

    try:
        with opener.open(
            Request(health_endpoint, headers={"Accept": "application/json"}),
            timeout=min(args.request_timeout, max(deadline - time.monotonic(), 0.001)),
        ) as response:
            health = json.load(response)
    except HTTPError as error:
        raise native_request_error(error, health_endpoint) from None
    except (URLError, OSError, ValueError) as error:
        raise NarrationError(f"Could not use Breeze API health endpoint {health_endpoint}: {error}") from error
    if not isinstance(health, dict) or health.get("status") != "ok":
        raise NarrationError(f"Breeze API is not ready at {health_endpoint}")

    description = args.voice_description.strip()
    delivery = args.instruction.strip()
    if reference_path is None and not description and not delivery:
        description = DEFAULT_BREEZE_API_INSTRUCTION
    effective_instruction = "\n\n".join(part for part in (description, delivery) if part)
    fields = [
        ("text", text),
        ("instruction", effective_instruction),
        ("cfg_scale", str(args.cfg_scale)),
        ("seed", str(args.seed)),
    ]
    if reference_text is not None:
        fields.append(("ref_text", reference_text))
    body, content_type = multipart_form(
        fields,
        ("ref_audio", reference_path, reference_payload)
        if reference_path is not None and reference_payload is not None
        else None,
    )
    request = Request(
        speech_endpoint,
        data=body,
        headers={"Accept": "audio/pcm", "Content-Type": content_type},
        method="POST",
    )
    total_bytes = 0
    try:
        with opener.open(
            request,
            timeout=min(args.request_timeout, max(deadline - time.monotonic(), 0.001)),
        ) as response:
            response_type = response.headers.get_content_type()
            sample_format = response.headers.get("X-Sample-Format")
            sample_rate_value = response.headers.get("X-Sample-Rate")
            if response_type != "audio/pcm":
                raise NarrationError(
                    f"Breeze API returned unsupported Content-Type {response_type!r}; expected audio/pcm"
                )
            if sample_format != "s16le":
                raise NarrationError(
                    f"Breeze API returned unsupported X-Sample-Format {sample_format!r}; expected s16le"
                )
            try:
                sample_rate = int(sample_rate_value or "")
            except ValueError:
                sample_rate = 0
            if sample_rate <= 0:
                raise NarrationError(
                    f"Breeze API returned invalid X-Sample-Rate {sample_rate_value!r}"
                )
            health_rate = health.get("sample_rate")
            if isinstance(health_rate, int) and health_rate != sample_rate:
                raise NarrationError(
                    "Breeze API sample rate changed between health check and audio response"
                )
            advertised_length = response.headers.get("Content-Length")
            with wave.open(str(temporary), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(sample_rate)
                while chunk := response.read1(65536):
                    total_bytes += len(chunk)
                    output.writeframesraw(chunk)
                    if time.monotonic() > deadline:
                        raise NarrationError(
                            f"Breeze API generation timed out after {args.timeout:g}s"
                        )
            if advertised_length is not None:
                try:
                    expected_length = int(advertised_length)
                except ValueError as error:
                    raise NarrationError("Breeze API returned malformed Content-Length") from error
                if expected_length != total_bytes:
                    raise NarrationError(
                        f"Breeze API returned a truncated stream: expected {expected_length} bytes, "
                        f"received {total_bytes}"
                    )
    except HTTPError as error:
        raise native_request_error(error, speech_endpoint) from None
    except IncompleteRead as error:
        raise NarrationError(
            f"Breeze API returned a truncated stream: {len(error.partial)} final bytes received"
        ) from error
    except (URLError, OSError) as error:
        raise NarrationError(f"Could not stream audio from Breeze API {speech_endpoint}: {error}") from error
    if total_bytes == 0:
        raise NarrationError("Breeze API returned an empty audio stream")
    if total_bytes % 2:
        raise NarrationError(
            f"Breeze API returned an odd number of bytes for s16le audio: {total_bytes}"
        )

    return {
        "adapter": "breeze-streaming-api",
        "model": BREEZE_MODEL_ID,
        "endpoint": speech_endpoint,
        "voice_mode": "reference" if reference_path else "designed",
        "voice_description": description or None,
        "instruction": delivery,
        "effective_instruction": effective_instruction,
        "seed": args.seed,
        "cfg_scale": args.cfg_scale,
        "reference_audio_sha256": (
            hashlib.sha256(reference_payload).hexdigest() if reference_payload is not None else None
        ),
        "reference_text_sha256": (
            hashlib.sha256(reference_text.encode("utf-8")).hexdigest()
            if reference_text is not None
            else None
        ),
        "sample_format": "s16le",
        "sample_rate": sample_rate,
        "channels": 1,
    }


def generate_voxcpm(args: argparse.Namespace, text: str, temporary: Path) -> dict:
    model_path = args.model_path.expanduser().resolve()
    if not model_path.is_dir():
        raise NarrationError(
            f"VoxCPM model directory does not exist: {model_path}. Download the model explicitly, "
            "then pass its local directory with --model-path."
        )
    helper = Path(__file__).with_name("voxcpm_generate.py")
    command = [
        args.python,
        str(helper),
        "--model-path",
        str(model_path),
        "--text",
        text,
        "--output",
        str(temporary),
        "--seed",
        str(args.seed),
        "--cfg-value",
        str(args.cfg_value),
        "--inference-timesteps",
        str(args.inference_timesteps),
    ]
    if args.voice_description:
        command.extend(["--voice-description", args.voice_description])
    if args.reference_audio:
        command.extend(["--reference-audio", str(args.reference_audio.expanduser().resolve())])
    if args.prompt_audio:
        command.extend(["--prompt-audio", str(args.prompt_audio.expanduser().resolve())])
    if args.prompt_text:
        command.extend(["--prompt-text", args.prompt_text])
    environment = dict(os.environ)
    environment.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=args.timeout,
            check=False,
            env=environment,
        )
    except subprocess.TimeoutExpired as error:
        raise NarrationError(f"VoxCPM generation timed out after {args.timeout:g}s") from error
    except OSError as error:
        raise NarrationError(f"Could not start VoxCPM with {args.python}: {error}") from error
    if completed.returncode:
        detail = (completed.stderr or completed.stdout).strip()
        raise NarrationError(
            "VoxCPM generation failed. Install the official `voxcpm` package and `soundfile` "
            f"in the selected Python environment. Provider detail: {detail or 'no output'}"
        )
    try:
        provider = json.loads(completed.stdout.strip().splitlines()[-1])
    except (IndexError, ValueError) as error:
        raise NarrationError("VoxCPM helper completed without machine-readable provenance") from error
    return provider


def write_sidecar(path: Path, data: dict) -> None:
    with path.open("x", encoding="utf-8") as target:
        json.dump(data, target, indent=2, ensure_ascii=False)
        target.write("\n")


def publish_new(source: Path, destination: Path) -> None:
    """Atomically publish without replacing a destination created by a competitor."""
    try:
        os.link(source, destination)
    except FileExistsError as error:
        raise NarrationError(f"Output already exists: {destination}") from error
    except OSError as error:
        raise NarrationError(f"Could not publish {destination} without overwriting it: {error}") from error


def unlink_if_owned(path: Path, source: Path) -> None:
    """Remove a published hard link only while it still points at our temporary inode."""
    try:
        if path.exists() and os.path.samefile(path, source):
            path.unlink()
    except OSError:
        pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate narration through Breeze or a local VoxCPM2 model."
    )
    parser.add_argument("--provider", choices=("breeze", "breeze-api", "voxcpm"), required=True)
    parser.add_argument("--text-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("--seed", type=int, default=42)

    voice = parser.add_argument_group("voice selection")
    voice.add_argument("--voice-description", default="")
    voice.add_argument("--reference-audio", type=Path)

    breeze = parser.add_argument_group("Breeze")
    breeze.add_argument("--server")
    breeze.add_argument("--voice")
    breeze.add_argument("--instruction", default="")
    breeze.add_argument("--request-timeout", type=float, default=30)
    breeze.add_argument("--poll-interval", type=float, default=1)
    breeze.add_argument("--cfg-scale", type=float, default=4.0)
    breeze.add_argument("--reference-text-file", type=Path)

    voxcpm = parser.add_argument_group("local VoxCPM2")
    voxcpm.add_argument("--model-path", type=Path)
    voxcpm.add_argument("--python", default=sys.executable)
    voxcpm.add_argument("--prompt-audio", type=Path)
    voxcpm.add_argument("--prompt-text", default="")
    voxcpm.add_argument("--cfg-value", type=float, default=2.0)
    voxcpm.add_argument("--inference-timesteps", type=int, default=10)
    return parser


def validate_args(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    timing_values = (args.timeout, args.request_timeout, args.poll_interval)
    if any(not math.isfinite(value) or value <= 0 for value in timing_values):
        parser.error("timeouts and poll interval must be finite and positive")
    if args.provider == "breeze" and not args.voice:
        parser.error("--voice is required for --provider breeze")
    if args.provider == "breeze-api" and args.voice:
        parser.error("--voice is not supported for --provider breeze-api; use voice design or a reference pair")
    if args.provider == "breeze-api" and (
        not math.isfinite(args.cfg_scale) or args.cfg_scale <= 0
    ):
        parser.error("--cfg-scale must be finite and positive")
    if args.provider == "voxcpm" and not args.model_path:
        parser.error("--model-path is required for --provider voxcpm; automatic downloads are disabled")
    if args.prompt_audio and not args.prompt_text:
        parser.error("--prompt-text is required with --prompt-audio")
    if args.prompt_text and not args.prompt_audio:
        parser.error("--prompt-audio is required with --prompt-text")
    if args.reference_audio and not args.reference_audio.is_file():
        parser.error(f"reference audio does not exist: {args.reference_audio}")
    if args.reference_text_file and not args.reference_text_file.is_file():
        parser.error(f"reference transcript does not exist: {args.reference_text_file}")
    if args.prompt_audio and not args.prompt_audio.is_file():
        parser.error(f"prompt audio does not exist: {args.prompt_audio}")
    if args.provider == "breeze-api" and bool(args.reference_audio) != bool(args.reference_text_file):
        parser.error("--reference-audio and --reference-text-file are required together for --provider breeze-api")
    if args.provider == "breeze" and (args.reference_audio or args.reference_text_file):
        parser.error("native Breeze reference inputs require --provider breeze-api")
    if args.provider == "breeze" and args.voice_description:
        parser.error("--voice-description requires --provider breeze-api or voxcpm")
    if args.provider == "breeze-api" and (args.prompt_audio or args.prompt_text):
        parser.error("--prompt-audio and --prompt-text are only supported for --provider voxcpm")
    if args.provider == "voxcpm" and args.reference_text_file:
        parser.error("--reference-text-file is only supported for --provider breeze-api")
    if args.server is None:
        args.server = (
            "http://127.0.0.1:7860"
            if args.provider == "breeze-api"
            else "http://127.0.0.1:8124"
        )
    parsed_server = urlparse(args.server)
    if args.provider in {"breeze", "breeze-api"} and (
        parsed_server.scheme not in {"http", "https"}
        or not parsed_server.netloc
        or parsed_server.username is not None
        or parsed_server.password is not None
        or parsed_server.query
        or parsed_server.fragment
    ):
        parser.error(
            "--server must be an absolute http or https base URL without credentials, query, or fragment"
        )


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(args, parser)
    try:
        ensure_new_outputs(args.output)
        text = read_text(args.text_file)
        output = args.output.resolve()
        sidecar_output = sidecar_path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        started = time.monotonic()
        with tempfile.TemporaryDirectory(prefix=f".{output.name}.", dir=output.parent) as workspace:
            temporary = Path(workspace) / output.name
            if args.provider == "breeze":
                provider = generate_breeze(args, text, temporary)
            elif args.provider == "breeze-api":
                provider = generate_breeze_api(args, text, temporary)
            else:
                provider = generate_voxcpm(args, text, temporary)
            audio = validate_wav(temporary)
            sidecar = {
                "schema_version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "provider": args.provider,
                "provider_details": provider,
                "input": {
                    "text_file": str(args.text_file.resolve()),
                    "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "characters": len(text),
                },
                "output": {"path": str(output), **audio},
                "timing": {"generation_elapsed_seconds": round(time.monotonic() - started, 6)},
            }
            temporary_sidecar = Path(workspace) / sidecar_output.name
            write_sidecar(temporary_sidecar, sidecar)
            publish_new(temporary_sidecar, sidecar_output)
            try:
                publish_new(temporary, output)
            except NarrationError:
                unlink_if_owned(sidecar_output, temporary_sidecar)
                raise
        print(json.dumps({"audio": str(args.output), "sidecar": str(sidecar_path(args.output)), **audio}))
        return 0
    except NarrationError as error:
        parser.exit(1, f"narrate: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
