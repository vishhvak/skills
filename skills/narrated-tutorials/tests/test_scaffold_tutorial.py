from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "scaffold_tutorial.py"
PLAYER = ROOT / "assets" / "player"


class ScaffoldTutorialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
            raise unittest.SkipTest("ffmpeg and ffprobe are required")

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.audio = self.root / "audio.webm"
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=8000:cl=mono",
                "-t",
                "2",
                "-c:a",
                "libopus",
                str(self.audio),
            ],
            check=True,
        )
        self.alignment = self.root / "audio.json"
        self.alignment.write_text(
            json.dumps(
                {
                    "text": "Yeast feeds sugar.",
                    "wordTimings": [
                        {"word": "Yeast", "start": 0.0, "end": 0.35},
                        {"word": "feeds", "start": 0.4, "end": 0.8},
                        {"word": "sugar.", "start": 0.85, "end": 1.2},
                    ],
                }
            )
        )
        self.image = self.root / "crumb.svg"
        self.image.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_scaffold(self, lesson: dict, *extra: str) -> subprocess.CompletedProcess[str]:
        lesson_path = self.root / "lesson.json"
        lesson_path.write_text(json.dumps(lesson))
        return subprocess.run(
            ["python3", str(SCRIPT), "--lesson", str(lesson_path), *extra],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

    def section(self, section_id: str = "gas") -> dict:
        return {
            "id": section_id,
            "title": "Gas",
            "text": "Yeast feeds sugar.",
            "audio": "audio.webm",
            "alignment": "audio.json",
        }

    def legacy_lesson(self) -> dict:
        return {
            "course": {"id": "bread", "title": "Bread"},
            "chapter": {"id": "rise", "title": "Rise"},
            "sections": [self.section()],
        }

    def multi_chapter_lesson(self) -> dict:
        return {
            "course": {
                "id": "bread",
                "title": "Bread",
                "brand": "Small Lessons",
                "footerLinks": [],
            },
            "chapters": [
                {
                    "id": "rise",
                    "title": "Rise",
                    "sections": [self.section("gas")],
                },
                {
                    "id": "bake",
                    "title": "Bake",
                    "sections": [self.section("heat")],
                },
            ],
        }

    def test_check_validates_legacy_without_creating_output(self) -> None:
        result = self.run_scaffold(self.legacy_lesson(), "--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("valid Bread (1 chapters, 1 sections", result.stdout)
        self.assertFalse((self.root / "site").exists())

    def test_multi_chapter_scenes_and_local_image_are_portable(self) -> None:
        lesson = self.multi_chapter_lesson()
        lesson["chapters"][0]["sections"][0]["scenes"] = [
            {
                "time": 0,
                "nodes": [
                    {"id": "yeast", "label": "Yeast", "x": 20, "y": 40},
                    {"id": "gas", "label": "Gas", "x": 70, "y": 40},
                ],
                "edges": [{"from": "yeast", "to": "gas"}],
                "highlight": "yeast",
                "cursor": {"target": "yeast", "type": "hand"},
            },
            {
                "atWord": "sugar.",
                "cards": [
                    {"id": "crumb", "title": "Crumb", "image": "crumb.svg", "x": 40, "y": 25}
                ],
                "emoji": {"target": "crumb", "emoji": "🍞"},
            },
        ]
        output = self.root / "site"
        result = self.run_scaffold(lesson, "--output", str(output))
        self.assertEqual(result.returncode, 0, result.stderr)
        course = json.loads((output / "content/manifest.json").read_text())
        self.assertEqual([chapter["id"] for chapter in course["chapters"]], ["rise", "bake"])
        data = json.loads((output / "content/rise/gas.json").read_text())
        self.assertEqual(data["sceneData"]["stepTimes"], [0.0, 0.85])
        image_url = data["sceneData"]["frames"][1]["cards"][0]["image"]["src"]
        image_name = image_url.rsplit("/", 1)[-1]
        self.assertTrue((output / "content/rise/assets" / image_name).is_file())
        self.assertIn('href="/lesson-scenes.css"', (output / "index.html").read_text())
        self.assertIn('src="/lesson-scenes.js"', (output / "index.html").read_text())
        self.assertTrue((output / "fonts/OFL.txt").is_file())
        generated_text = "\n".join(
            path.read_text(errors="ignore")
            for path in output.rglob("*")
            if path.is_file() and path.suffix not in {".webm", ".woff2"}
        ).lower()
        self.assertNotIn("effect.institute", generated_text)
        self.assertNotIn("feedback no.", generated_text)
        self.assertNotIn("discord.com", generated_text)

    def test_invalid_alignment_range_and_scene_target_fail_before_output(self) -> None:
        lesson = self.legacy_lesson()
        lesson["sections"][0]["alignment"] = "audio.json"
        alignment = json.loads(self.alignment.read_text())
        alignment["wordTimings"][1]["word"] = "wrong"
        self.alignment.write_text(json.dumps(alignment))
        output = self.root / "bad-alignment"
        result = self.run_scaffold(lesson, "--output", str(output))
        self.assertEqual(result.returncode, 2)
        self.assertIn("word sequence does not match", result.stderr)
        self.assertFalse(output.exists())

        alignment["wordTimings"][1]["word"] = "feeds"
        self.alignment.write_text(json.dumps(alignment))
        lesson["sections"][0]["scenes"] = [
            {
                "time": 0,
                "nodes": [{"id": "node", "label": "Node"}],
                "highlight": "missing",
            }
        ]
        output = self.root / "bad-target"
        result = self.run_scaffold(lesson, "--output", str(output))
        self.assertEqual(result.returncode, 2)
        self.assertIn("is not visible", result.stderr)
        self.assertFalse(output.exists())

    def test_escaping_and_remote_scene_assets_fail_atomically(self) -> None:
        lesson = self.legacy_lesson()
        lesson["sections"][0]["scenes"] = [
            {
                "time": 0,
                "cards": [{"id": "crumb", "title": "Crumb", "image": "../crumb.svg"}],
            }
        ]
        output = self.root / "escape"
        result = self.run_scaffold(lesson, "--output", str(output))
        self.assertEqual(result.returncode, 2)
        self.assertIn("escapes the lesson directory", result.stderr)
        self.assertFalse(output.exists())

        lesson["sections"][0]["scenes"][0]["cards"][0]["image"] = "https://example.com/crumb.svg"
        output = self.root / "remote"
        result = self.run_scaffold(lesson, "--output", str(output))
        self.assertEqual(result.returncode, 2)
        self.assertIn("local image path", result.stderr)
        self.assertFalse(output.exists())

    def test_check_rejects_cues_past_readable_media(self) -> None:
        lesson = self.legacy_lesson()
        alignment = json.loads(self.alignment.read_text())
        alignment["wordTimings"][-1]["end"] = 3.0
        self.alignment.write_text(json.dumps(alignment))
        result = self.run_scaffold(lesson, "--check")
        self.assertEqual(result.returncode, 2)
        self.assertIn("exceeds media duration", result.stderr)

    def test_custom_template_with_changed_app_version_marker_is_supported(self) -> None:
        template = self.root / "template"
        shutil.copytree(PLAYER, template)
        index = (template / "index.html").read_text()
        index = index.replace("app.js?v=efe7a4ecc9d8", "app.js?v=source-version-changed")
        (template / "index.html").write_text(index)
        output = self.root / "changed-version"
        result = self.run_scaffold(
            self.legacy_lesson(),
            "--template-dir",
            str(template),
            "--output",
            str(output),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(output.is_dir())

    def test_scene_module_uses_native_clock_lifecycle_without_timers(self) -> None:
        source = (PLAYER / "lesson-scenes.js").read_text()
        self.assertIn("global.NarratedTutorialScenes", source)
        self.assertIn("function mount(root, section)", source)
        self.assertIn("function paint(time, options)", source)
        self.assertIn("function destroy()", source)
        self.assertNotIn("setTimeout", source)
        self.assertNotIn("setInterval", source)
        self.assertNotIn("requestAnimationFrame", source)


if __name__ == "__main__":
    unittest.main()
