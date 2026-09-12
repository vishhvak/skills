from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import wave


SCRIPT = Path(__file__).parents[1] / "scripts" / "narrate.py"
SPEC = importlib.util.spec_from_file_location("narrate_breeze_api", SCRIPT)
narrate = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(narrate)


class FakeBreezeApi(BaseHTTPRequestHandler):
    mode = "ok"
    pcm = b"\x01\x00" * 240
    health_requests = 0
    speech_requests = 0
    redirect_requests = 0
    fields: dict[str, str] = {}
    files: dict[str, tuple[str, bytes]] = {}

    def log_message(self, _format, *_args):
        pass

    def do_GET(self):
        if self.path != "/health":
            return self.send_error(404)
        type(self).health_requests += 1
        self._respond_json({"status": "ok", "sample_rate": 24000})

    def do_POST(self):
        if self.path == "/redirect-target":
            type(self).redirect_requests += 1
            return self._respond_json({"detail": "reference upload leaked"}, 500)
        if self.path != "/v1/audio/speech":
            return self.send_error(404)
        type(self).speech_requests += 1
        length = int(self.headers["Content-Length"])
        body = self.rfile.read(length)
        message = BytesParser(policy=policy.default).parsebytes(
            b"MIME-Version: 1.0\r\nContent-Type: "
            + self.headers["Content-Type"].encode("ascii")
            + b"\r\n\r\n"
            + body
        )
        fields: dict[str, str] = {}
        files: dict[str, tuple[str, bytes]] = {}
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            payload = part.get_payload(decode=True)
            if filename is None:
                fields[name] = payload.decode("utf-8")
            else:
                files[name] = (filename, payload)
        type(self).fields = fields
        type(self).files = files

        mode = type(self).mode
        if mode == "conflict":
            return self._respond_json(
                {"detail": "An inference request is already running."}, 409
            )
        if mode == "redirect":
            self.send_response(307)
            self.send_header("Location", "/redirect-target")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if mode == "timeout":
            time.sleep(0.15)
        if mode == "trickle":
            self.send_response(200)
            self.send_header("Content-Type", "audio/pcm")
            self.send_header("X-Sample-Rate", "24000")
            self.send_header("X-Sample-Format", "s16le")
            self.send_header("Content-Length", str(len(type(self).pcm)))
            self.end_headers()
            try:
                for offset in range(0, len(type(self).pcm), 2):
                    self.wfile.write(type(self).pcm[offset : offset + 2])
                    self.wfile.flush()
                    time.sleep(0.01)
            except BrokenPipeError:
                pass
            return
        if mode == "empty":
            return self._respond_audio(b"")
        if mode == "odd":
            return self._respond_audio(b"\x00")
        if mode == "wrong-type":
            return self._respond_audio(type(self).pcm, content_type="audio/wav")
        if mode == "wrong-format":
            return self._respond_audio(type(self).pcm, sample_format="f32le")
        if mode == "bad-rate":
            return self._respond_audio(type(self).pcm, sample_rate="twenty-four-k")
        if mode == "missing-rate":
            return self._respond_audio(type(self).pcm, sample_rate=None)
        if mode == "truncated":
            self.send_response(200)
            self.send_header("Content-Type", "audio/pcm")
            self.send_header("X-Sample-Rate", "24000")
            self.send_header("X-Sample-Format", "s16le")
            self.send_header("Content-Length", str(len(type(self).pcm) + 20))
            self.end_headers()
            self.wfile.write(type(self).pcm)
            self.close_connection = True
            return
        self._respond_audio(type(self).pcm)

    def _respond_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _respond_audio(
        self,
        body: bytes,
        *,
        content_type: str = "audio/pcm",
        sample_rate: str | None = "24000",
        sample_format: str = "s16le",
    ):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        if sample_rate is not None:
            self.send_header("X-Sample-Rate", sample_rate)
        self.send_header("X-Sample-Format", sample_format)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass


class BreezeApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.text = self.root / "narration.txt"
        self.text.write_text("A short portable narration.", encoding="utf-8")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeBreezeApi)
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True
        )
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temporary.cleanup()
        FakeBreezeApi.mode = "ok"
        FakeBreezeApi.health_requests = 0
        FakeBreezeApi.speech_requests = 0
        FakeBreezeApi.redirect_requests = 0
        FakeBreezeApi.fields = {}
        FakeBreezeApi.files = {}

    @property
    def endpoint(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}"

    def run_narrate(self, *extra: str, output: Path | None = None) -> Path:
        destination = output or self.root / "clip.wav"
        argv = [
            "--provider",
            "breeze-api",
            "--text-file",
            str(self.text),
            "--output",
            str(destination),
            "--server",
            self.endpoint,
            *extra,
        ]
        with redirect_stdout(io.StringIO()):
            narrate.main(argv)
        return destination

    def test_voice_design_posts_multipart_and_wraps_streamed_pcm(self):
        output = self.run_narrate(
            "--voice-description",
            "A warm, grounded documentary narrator",
            "--instruction",
            "Read with restrained optimism.",
            "--cfg-scale",
            "5.5",
            "--seed",
            "73",
        )

        self.assertEqual(FakeBreezeApi.health_requests, 1)
        self.assertEqual(FakeBreezeApi.speech_requests, 1)
        self.assertEqual(
            FakeBreezeApi.fields,
            {
                "text": "A short portable narration.",
                "instruction": (
                    "A warm, grounded documentary narrator\n\n"
                    "Read with restrained optimism."
                ),
                "cfg_scale": "5.5",
                "seed": "73",
            },
        )
        self.assertEqual(FakeBreezeApi.files, {})
        with wave.open(str(output), "rb") as audio:
            self.assertEqual(audio.getnchannels(), 1)
            self.assertEqual(audio.getsampwidth(), 2)
            self.assertEqual(audio.getframerate(), 24000)
            self.assertEqual(audio.readframes(audio.getnframes()), FakeBreezeApi.pcm)

        sidecar = json.loads(output.with_suffix(".generation.json").read_text())
        details = sidecar["provider_details"]
        self.assertEqual(sidecar["provider"], "breeze-api")
        self.assertEqual(details["model"], "BreezeBlue/Breeze-TTS-2")
        self.assertEqual(details["endpoint"], f"{self.endpoint}/v1/audio/speech")
        self.assertEqual(details["voice_mode"], "designed")
        self.assertEqual(details["voice_description"], "A warm, grounded documentary narrator")
        self.assertEqual(details["instruction"], "Read with restrained optimism.")
        self.assertEqual(details["seed"], 73)
        self.assertEqual(details["cfg_scale"], 5.5)
        self.assertIsNone(details["reference_audio_sha256"])
        self.assertIsNone(details["reference_text_sha256"])
        self.assertNotIn("pcm", json.dumps(sidecar).lower())

    def test_default_voice_design_uses_neutral_narrator_instruction(self):
        self.run_narrate()
        self.assertIn("neutral", FakeBreezeApi.fields["instruction"].lower())
        self.assertEqual(FakeBreezeApi.fields["cfg_scale"], "4.0")

    def test_reference_clone_sends_exact_transcript_and_file_bytes(self):
        reference = self.root / "語音.wav"
        reference_bytes = b"RIFF-exact-reference-bytes"
        reference.write_bytes(reference_bytes)
        transcript = self.root / "reference.txt"
        exact_text = "  Keep leading space.\nAnd the final newline.\n"
        transcript.write_text(exact_text, encoding="utf-8")

        output = self.run_narrate(
            "--reference-audio",
            str(reference),
            "--reference-text-file",
            str(transcript),
        )

        self.assertEqual(FakeBreezeApi.fields["ref_text"], exact_text)
        self.assertEqual(FakeBreezeApi.fields["instruction"], "")
        self.assertEqual(FakeBreezeApi.files["ref_audio"][0], "reference.wav")
        self.assertEqual(FakeBreezeApi.files["ref_audio"][1], reference_bytes)
        details = json.loads(output.with_suffix(".generation.json").read_text())[
            "provider_details"
        ]
        self.assertEqual(details["voice_mode"], "reference")
        self.assertEqual(
            details["reference_audio_sha256"], hashlib.sha256(reference_bytes).hexdigest()
        )
        self.assertEqual(
            details["reference_text_sha256"],
            hashlib.sha256(exact_text.encode("utf-8")).hexdigest(),
        )

    def test_native_reference_pair_and_voice_are_validated(self):
        reference = self.root / "reference.wav"
        reference.write_bytes(b"reference")
        transcript = self.root / "reference.txt"
        transcript.write_text("Reference words.", encoding="utf-8")
        base = [
            "--provider",
            "breeze-api",
            "--text-file",
            str(self.text),
            "--output",
            str(self.root / "unused.wav"),
        ]
        invalid = (
            ["--reference-audio", str(reference)],
            ["--reference-text-file", str(transcript)],
            ["--voice", "kit"],
            ["--cfg-scale", "0"],
        )
        for extra in invalid:
            with (
                self.subTest(extra=extra),
                self.assertRaises(SystemExit) as raised,
                redirect_stderr(io.StringIO()),
            ):
                narrate.main([*base, *extra])
            self.assertEqual(raised.exception.code, 2)
        self.assertEqual(FakeBreezeApi.health_requests, 0)

    def test_provider_specific_default_servers_are_backward_compatible(self):
        parser = narrate.build_parser()
        common = ["--text-file", str(self.text), "--output", str(self.root / "out.wav")]
        native = parser.parse_args(["--provider", "breeze-api", *common])
        narrate.validate_args(native, parser)
        self.assertEqual(native.server, "http://127.0.0.1:7860")

        legacy = parser.parse_args(["--provider", "breeze", "--voice", "kit", *common])
        narrate.validate_args(legacy, parser)
        self.assertEqual(legacy.server, "http://127.0.0.1:8124")

    def test_native_reference_flags_are_rejected_when_provider_would_ignore_them(self):
        transcript = self.root / "reference.txt"
        transcript.write_text("Reference words.", encoding="utf-8")
        with self.assertRaises(SystemExit) as raised, redirect_stderr(io.StringIO()):
            narrate.main(
                [
                    "--provider",
                    "breeze",
                    "--text-file",
                    str(self.text),
                    "--output",
                    str(self.root / "unused.wav"),
                    "--voice",
                    "kit",
                    "--reference-text-file",
                    str(transcript),
                ]
            )
        self.assertEqual(raised.exception.code, 2)

    def test_ignored_voice_inputs_and_unsafe_server_values_are_rejected(self):
        base = [
            "--text-file",
            str(self.text),
            "--output",
            str(self.root / "unused.wav"),
        ]
        cases = (
            ["--provider", "breeze", "--voice", "kit", "--voice-description", "Warm"],
            [
                "--provider",
                "breeze-api",
                "--prompt-audio",
                str(self.text),
                "--prompt-text",
                "Prompt",
            ],
            ["--provider", "breeze-api", "--timeout", "nan"],
            ["--provider", "breeze-api", "--request-timeout", "inf"],
            ["--provider", "breeze-api", "--server", "http://user:pass@localhost:7860"],
            ["--provider", "breeze-api", "--server", "http://localhost:7860?target=other"],
            ["--provider", "breeze-api", "--server", "http://localhost:7860#fragment"],
        )
        for arguments in cases:
            with (
                self.subTest(arguments=arguments),
                self.assertRaises(SystemExit) as raised,
                redirect_stderr(io.StringIO()),
            ):
                narrate.main([*arguments, *base])
            self.assertEqual(raised.exception.code, 2)
        self.assertEqual(FakeBreezeApi.health_requests, 0)

    def test_http_and_malformed_stream_fail_without_publishing(self):
        cases = {
            "conflict": "HTTP 409",
            "empty": "empty",
            "odd": "odd number",
            "wrong-type": "Content-Type",
            "wrong-format": "X-Sample-Format",
            "bad-rate": "X-Sample-Rate",
            "missing-rate": "X-Sample-Rate",
            "truncated": "truncated",
        }
        for mode, message in cases.items():
            with self.subTest(mode=mode):
                FakeBreezeApi.mode = mode
                output = self.root / f"{mode}.wav"
                errors = io.StringIO()
                with self.assertRaises(SystemExit) as raised, redirect_stderr(errors):
                    self.run_narrate(output=output)
                self.assertEqual(raised.exception.code, 1)
                self.assertFalse(output.exists())
                self.assertFalse(output.with_suffix(".generation.json").exists())
                self.assertIn(message, errors.getvalue())

    def test_reference_upload_is_not_forwarded_through_a_redirect(self):
        reference = self.root / "reference.wav"
        reference.write_bytes(b"private reference bytes")
        transcript = self.root / "reference.txt"
        transcript.write_text("Exact words.", encoding="utf-8")
        FakeBreezeApi.mode = "redirect"
        errors = io.StringIO()
        with self.assertRaises(SystemExit) as raised, redirect_stderr(errors):
            self.run_narrate(
                "--reference-audio",
                str(reference),
                "--reference-text-file",
                str(transcript),
            )
        self.assertEqual(raised.exception.code, 1)
        self.assertIn("HTTP 307", errors.getvalue())
        self.assertEqual(FakeBreezeApi.redirect_requests, 0)

    def test_timeout_is_bounded_and_existing_output_is_preserved(self):
        FakeBreezeApi.mode = "timeout"
        timeout_output = self.root / "timeout.wav"
        started = time.monotonic()
        errors = io.StringIO()
        with self.assertRaises(SystemExit) as raised, redirect_stderr(errors):
            self.run_narrate(
                "--request-timeout", "0.02", output=timeout_output
            )
        self.assertEqual(raised.exception.code, 1)
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertIn("timed out", errors.getvalue())
        self.assertFalse(timeout_output.exists())

        output = self.root / "existing.wav"
        output.write_bytes(b"keep me")
        prior_requests = FakeBreezeApi.health_requests
        with self.assertRaises(SystemExit) as raised, redirect_stderr(io.StringIO()):
            self.run_narrate("--request-timeout", "0.02", output=output)
        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(output.read_bytes(), b"keep me")
        self.assertEqual(FakeBreezeApi.health_requests, prior_requests)

    def test_overall_timeout_stops_a_continuous_trickle_stream(self):
        FakeBreezeApi.mode = "trickle"
        output = self.root / "trickle.wav"
        started = time.monotonic()
        errors = io.StringIO()
        with self.assertRaises(SystemExit) as raised, redirect_stderr(errors):
            self.run_narrate(
                "--timeout",
                "0.04",
                "--request-timeout",
                "0.2",
                output=output,
            )
        self.assertEqual(raised.exception.code, 1)
        self.assertLess(time.monotonic() - started, 0.3)
        self.assertIn("timed out", errors.getvalue())
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
