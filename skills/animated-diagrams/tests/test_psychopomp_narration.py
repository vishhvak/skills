import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
import psychopomp_narration  # noqa: E402


def word(text, start, end):
    return SimpleNamespace(word=text, start=start, end=end)


class FakeModel:
    def __init__(self, *args, **kwargs):
        pass

    def transcribe(self, audio, **kwargs):
        # overlapping and blank words, as Whisper sometimes reports them
        segments = [SimpleNamespace(words=[word(" Meet", 0.0, 0.3), word(" ", 0.3, 0.3), word(" 2Password,", 0.25, 0.9)])]
        return iter(segments), None


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg and ffprobe are required")
class NarrationBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        (self.tmp / "narration").mkdir()
        (self.tmp / "voiced").mkdir()
        self.script = self.tmp / "narration/script.json"
        self.script.write_text(json.dumps({"clips": [{"id": "intro", "text": "Meet 2Password."}]}))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=1",
                        str(self.tmp / "voiced/intro.wav")], check=True)

    def run_bridge(self, *extra):
        fake = SimpleNamespace(WhisperModel=FakeModel)
        with patch.dict(sys.modules, {"faster_whisper": fake}), patch.object(psychopomp_narration, "samples", lambda path: path):
            return psychopomp_narration.main(["--script", str(self.script), "--audio-dir", str(self.tmp / "voiced"), *extra])

    def test_writes_the_folder_narration_load_reads(self):
        self.assertEqual(self.run_bridge(), 0)
        manifest = json.loads((self.tmp / "narration/narration.json").read_text())
        clip = manifest["clips"][0]
        self.assertEqual(set(clip), {"id", "file", "words", "durationNanos", "textHash", "engine"})
        self.assertEqual((clip["id"], clip["file"], clip["words"], clip["engine"]), ("intro", "intro.mp3", "intro.words.json", "voxcpm"))
        self.assertAlmostEqual(clip["durationNanos"] / 1e9, 1.0, delta=0.1)
        self.assertTrue((self.tmp / "narration/intro.mp3").is_file())

    def test_words_are_ordered_and_blank_words_dropped(self):
        self.run_bridge()
        timings = json.loads((self.tmp / "narration/intro.words.json").read_text())["wordTimings"]
        self.assertEqual([w["word"] for w in timings], ["Meet", "2Password,"])
        self.assertEqual(timings[1]["start"], 0.3)

    def test_rejects_duplicate_or_non_kebab_ids(self):
        self.script.write_text(json.dumps({"clips": [{"id": "Intro", "text": "x"}]}))
        with self.assertRaises(SystemExit):
            self.run_bridge()

    def test_reports_missing_audio(self):
        (self.tmp / "voiced/intro.wav").unlink()
        with self.assertRaises(SystemExit) as raised:
            self.run_bridge()
        self.assertIn("no audio for clip 'intro'", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
