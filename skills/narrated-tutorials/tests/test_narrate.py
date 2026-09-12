from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave


SCRIPT = Path(__file__).parents[1] / "scripts" / "narrate.py"
SPEC = importlib.util.spec_from_file_location("narrate", SCRIPT)
narrate = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(narrate)

VOX_SCRIPT = Path(__file__).parents[1] / "scripts" / "voxcpm_generate.py"
VOX_SPEC = importlib.util.spec_from_file_location("voxcpm_generate", VOX_SCRIPT)
voxcpm_generate = importlib.util.module_from_spec(VOX_SPEC)
assert VOX_SPEC.loader
VOX_SPEC.loader.exec_module(voxcpm_generate)


def wav_bytes(sample_rate: int = 24000, frames: int = 2400) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\0\0" * frames)
    return buffer.getvalue()


class FakeVoiceLab(BaseHTTPRequestHandler):
    audio = wav_bytes()
    posted = None

    def log_message(self, _format, *_args):
        pass

    def do_POST(self):
        if self.path != "/api/generate":
            return self.send_error(404)
        length = int(self.headers["Content-Length"])
        type(self).posted = json.loads(self.rfile.read(length))
        self.respond_json({"id": "job-1", "status": "queued"}, 202)

    def do_GET(self):
        if self.path == "/api/voices":
            return self.respond_json(
                {
                    "voices": [
                        {
                            "id": "kit",
                            "name": "Kit",
                            "ready": True,
                            "source": {"path": "private/kit-source.wav"},
                        }
                    ]
                }
            )
        if self.path == "/api/jobs/job-1":
            return self.respond_json(
                {
                    "id": "job-1",
                    "status": "completed",
                    "audio_url": "/audio/job-1.wav",
                    "model": "BreezeBlue/Breeze-TTS-2",
                    "model_revision": "test-revision",
                    "duration_seconds": 0.1,
                    "elapsed_seconds": 0.01,
                }
            )
        if self.path == "/audio/job-1.wav":
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(type(self).audio)))
            self.end_headers()
            self.wfile.write(type(self).audio)
            return
        self.send_error(404)

    def respond_json(self, payload, status=200):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class NarrateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.text = self.root / "narration.txt"
        self.text.write_text("A short portable narration.")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeVoiceLab)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temporary.cleanup()
        FakeVoiceLab.audio = wav_bytes()
        FakeVoiceLab.posted = None

    @property
    def endpoint(self):
        host, port = self.server.server_address
        return f"http://{host}:{port}"

    def test_breeze_endpoint_writes_validated_audio_and_provenance(self):
        output = self.root / "clip.wav"
        result = narrate.main(
            [
                "--provider",
                "breeze",
                "--text-file",
                str(self.text),
                "--output",
                str(output),
                "--voice",
                "kit",
                "--server",
                self.endpoint,
                "--poll-interval",
                "0.001",
            ]
        )
        self.assertEqual(result, 0)
        self.assertEqual(FakeVoiceLab.posted["text"], "A short portable narration.")
        self.assertEqual(FakeVoiceLab.posted["voice_id"], "kit")
        with wave.open(str(output), "rb") as wav:
            self.assertEqual((wav.getframerate(), wav.getnframes()), (24000, 2400))
        sidecar = json.loads((self.root / "clip.generation.json").read_text())
        self.assertEqual(sidecar["provider"], "breeze")
        self.assertEqual(sidecar["provider_details"]["voice_manifest"]["name"], "Kit")
        self.assertEqual(sidecar["provider_details"]["provider_job"]["model_revision"], "test-revision")
        self.assertEqual(sidecar["output"]["duration_seconds"], 0.1)
        self.assertEqual(len(sidecar["input"]["text_sha256"]), 64)

    def test_invalid_provider_audio_is_removed_without_sidecar(self):
        FakeVoiceLab.audio = b"not a wav"
        output = self.root / "broken.wav"
        with self.assertRaises(SystemExit) as raised:
            narrate.main(
                [
                    "--provider",
                    "breeze",
                    "--text-file",
                    str(self.text),
                    "--output",
                    str(output),
                    "--voice",
                    "kit",
                    "--server",
                    self.endpoint,
                    "--poll-interval",
                    "0.001",
                ]
            )
        self.assertEqual(raised.exception.code, 1)
        self.assertFalse(output.exists())
        self.assertFalse((self.root / "broken.wav.partial").exists())
        self.assertFalse((self.root / "broken.generation.json").exists())

    def test_existing_output_fails_before_provider_request(self):
        output = self.root / "existing.wav"
        output.write_bytes(b"keep me")
        with self.assertRaises(SystemExit):
            narrate.main(
                [
                    "--provider",
                    "breeze",
                    "--text-file",
                    str(self.text),
                    "--output",
                    str(output),
                    "--voice",
                    "kit",
                    "--server",
                    self.endpoint,
                ]
            )
        self.assertEqual(output.read_bytes(), b"keep me")
        self.assertIsNone(FakeVoiceLab.posted)

    def test_competing_output_created_during_generation_is_preserved(self):
        output = self.root / "race.wav"

        def competing_generation(_args, _text, temporary):
            temporary.write_bytes(wav_bytes())
            output.write_bytes(b"competitor owns this")
            return {"adapter": "fake-breeze"}

        with patch.object(narrate, "generate_breeze", side_effect=competing_generation):
            with self.assertRaises(SystemExit) as raised:
                narrate.main(
                    [
                        "--provider",
                        "breeze",
                        "--text-file",
                        str(self.text),
                        "--output",
                        str(output),
                        "--voice",
                        "kit",
                    ]
                )
        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(output.read_bytes(), b"competitor owns this")
        self.assertFalse((self.root / "race.generation.json").exists())

    def test_truncated_wav_is_rejected(self):
        audio = self.root / "truncated.wav"
        payload = wav_bytes()
        audio.write_bytes(payload[:-10])
        with self.assertRaisesRegex(narrate.NarrationError, "truncated WAV"):
            narrate.validate_wav(audio)

    def test_voxcpm_uses_explicit_model_and_forwards_clone_inputs(self):
        model = self.root / "model"
        model.mkdir()
        reference = self.root / "reference.wav"
        reference.write_bytes(wav_bytes())
        output = self.root / "clone.wav.partial"
        args = narrate.build_parser().parse_args(
            [
                "--provider",
                "voxcpm",
                "--model-path",
                str(model),
                "--text-file",
                str(self.text),
                "--output",
                str(self.root / "clone.wav"),
                "--reference-audio",
                str(reference),
                "--prompt-audio",
                str(reference),
                "--prompt-text",
                "Exact reference transcript.",
            ]
        )

        def fake_run(command, **kwargs):
            Path(command[command.index("--output") + 1]).write_bytes(wav_bytes(48000, 4800))
            self.assertEqual(kwargs["timeout"], 900)
            self.assertEqual(kwargs["env"]["HF_HUB_OFFLINE"], "1")
            self.assertEqual(
                Path(command[command.index("--model-path") + 1]), model.resolve()
            )
            self.assertIn("--reference-audio", command)
            self.assertIn("--prompt-audio", command)
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps({"adapter": "voxcpm-python", "model": "openbmb/VoxCPM2"}) + "\n",
                stderr="",
            )

        with patch.object(narrate.subprocess, "run", side_effect=fake_run):
            provider = narrate.generate_voxcpm(args, "Clone this voice.", output)
        self.assertEqual(provider["adapter"], "voxcpm-python")
        self.assertTrue(output.exists())

    def test_voxcpm_helper_matches_official_python_api_and_hashes_reference(self):
        model_path = self.root / "VoxCPM2"
        model_path.mkdir()
        (model_path / "config.json").write_text('{"model_type":"voxcpm"}')
        reference = self.root / "speaker.wav"
        reference.write_bytes(wav_bytes())
        output = self.root / "voxcpm.wav"
        calls = {}

        class FakeModel:
            tts_model = SimpleNamespace(sample_rate=48000)

            @classmethod
            def from_pretrained(cls, path, **kwargs):
                calls["load"] = (path, kwargs)
                return cls()

            def generate(self, **kwargs):
                calls["generate"] = kwargs
                return [0.0]

        def fake_write(path, _audio, sample_rate, format):
            calls["write"] = (path, sample_rate, format)
            Path(path).write_bytes(wav_bytes(sample_rate=sample_rate))

        stdout = io.StringIO()
        modules = {
            "voxcpm": SimpleNamespace(VoxCPM=FakeModel),
            "soundfile": SimpleNamespace(write=fake_write),
        }
        with patch.dict("sys.modules", modules), redirect_stdout(stdout):
            result = voxcpm_generate.main(
                [
                    "--model-path",
                    str(model_path),
                    "--text",
                    "Welcome.",
                    "--output",
                    str(output),
                    "--voice-description",
                    "A calm narrator",
                    "--reference-audio",
                    str(reference),
                    "--prompt-audio",
                    str(reference),
                    "--prompt-text",
                    "Reference words.",
                ]
            )
        self.assertEqual(result, 0)
        self.assertEqual(calls["load"], (str(model_path.resolve()), {"load_denoiser": False}))
        self.assertEqual(calls["generate"]["text"], "(A calm narrator)Welcome.")
        self.assertEqual(calls["generate"]["reference_wav_path"], str(reference.resolve()))
        self.assertEqual(calls["generate"]["prompt_text"], "Reference words.")
        provenance = json.loads(stdout.getvalue())
        self.assertEqual(provenance["reference_audio"]["sha256"], provenance["prompt_audio"]["sha256"])
        self.assertEqual(provenance["model_config"]["bytes"], len('{"model_type":"voxcpm"}'))


if __name__ == "__main__":
    unittest.main()
