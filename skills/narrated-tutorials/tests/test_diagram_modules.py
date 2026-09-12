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


class DiagramModuleTests(unittest.TestCase):
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
        (self.root / "audio.json").write_text(
            json.dumps(
                {
                    "text": "Move then move again.",
                    "wordTimings": [
                        {"word": "Move", "start": 0.0, "end": 0.25},
                        {"word": "then", "start": 0.35, "end": 0.6},
                        {"word": "move", "start": 0.75, "end": 1.0},
                        {"word": "again.", "start": 1.2, "end": 1.55},
                    ],
                }
            ),
            encoding="utf-8",
        )
        self.diagram = self.root / "authored-diagram"
        (self.diagram / "lib").mkdir(parents=True)
        (self.diagram / "scene.js").write_text(
            'import { label } from "./lib/label.mjs";\n'
            'export function mount(root) { root.textContent = label; }\n',
            encoding="utf-8",
        )
        (self.diagram / "lib/label.mjs").write_text(
            'export const label = "A local module";\n', encoding="utf-8"
        )
        (self.diagram / "shape.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>',
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def lesson(self, diagram: dict | None = None) -> dict:
        section = {
            "id": "motion",
            "title": "Motion",
            "text": "Move then move again.",
            "audio": "audio.webm",
            "alignment": "audio.json",
        }
        if diagram is not None:
            section["diagram"] = diagram
        return {
            "course": {"id": "motion-course", "title": "Motion Course"},
            "chapter": {"id": "events", "title": "Events"},
            "sections": [section],
        }

    def diagram_spec(self, **changes: object) -> dict:
        diagram = {
            "directory": "authored-diagram",
            "entry": "scene.js",
            "cues": [
                {"id": "start", "time": 0},
                {"id": "second-move", "atWord": "move", "nth": 2},
            ],
        }
        diagram.update(changes)
        return diagram

    def run_scaffold(
        self, lesson: dict, *extra: str
    ) -> subprocess.CompletedProcess[str]:
        lesson_path = self.root / "lesson.json"
        lesson_path.write_text(json.dumps(lesson), encoding="utf-8")
        return subprocess.run(
            ["python3", str(SCRIPT), "--lesson", str(lesson_path), *extra],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

    def assert_invalid(self, diagram: dict, expected: str, name: str) -> None:
        output = self.root / f"invalid-{name}"
        result = self.run_scaffold(
            self.lesson(diagram), "--output", str(output)
        )
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn(expected, result.stderr)
        self.assertFalse(output.exists())

    def test_compiles_word_cues_and_copies_the_complete_authored_directory(self) -> None:
        template = self.root / "custom-template"
        shutil.copytree(PLAYER, template)
        output = self.root / "site"
        result = self.run_scaffold(
            self.lesson(self.diagram_spec()),
            "--template-dir",
            str(template),
            "--output",
            str(output),
        )
        self.assertEqual(result.returncode, 0, result.stderr)

        section = json.loads((output / "content/events/motion.json").read_text())
        self.assertEqual(
            section["diagramData"],
            {
                "module": "/diagrams/events/motion/scene.js",
                "cues": [
                    {"id": "start", "time": 0.0},
                    {"id": "second-move", "time": 0.75},
                ],
            },
        )
        copied = output / "diagrams/events/motion"
        self.assertEqual(
            (copied / "scene.js").read_text(),
            (self.diagram / "scene.js").read_text(),
        )
        self.assertEqual(
            (copied / "lib/label.mjs").read_text(),
            (self.diagram / "lib/label.mjs").read_text(),
        )
        self.assertEqual(
            (copied / "shape.svg").read_bytes(),
            (self.diagram / "shape.svg").read_bytes(),
        )
        index = (output / "index.html").read_text()
        self.assertIn('<script src="/diagram-host.js"></script>', index)
        self.assertLess(index.index('/diagram-host.js'), index.index('/app.js'))

    def test_accepts_an_absolute_diagram_directory_and_mjs_entry(self) -> None:
        spec = self.diagram_spec(directory=str(self.diagram), entry="lib/label.mjs")
        result = self.run_scaffold(self.lesson(spec), "--check")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_url_encodes_entry_names_that_are_valid_local_paths(self) -> None:
        entry = self.diagram / "scene #1.js"
        entry.write_text('export function mount() {}\n', encoding="utf-8")
        output = self.root / "encoded-entry"
        result = self.run_scaffold(
            self.lesson(self.diagram_spec(entry=entry.name)),
            "--output",
            str(output),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        section = json.loads((output / "content/events/motion.json").read_text())
        self.assertEqual(
            section["diagramData"]["module"],
            "/diagrams/events/motion/scene%20%231.js",
        )
        self.assertTrue((output / "diagrams/events/motion" / entry.name).is_file())

    def test_rejects_missing_escaping_and_non_javascript_entries(self) -> None:
        cases = [
            (
                self.diagram_spec(directory="missing"),
                "directory does not exist",
                "missing",
            ),
            (
                self.diagram_spec(entry="../outside.js"),
                "relative .js or .mjs",
                "escape",
            ),
            (self.diagram_spec(entry="shape.svg"), "relative .js or .mjs", "type"),
            (self.diagram_spec(entry="absent.js"), "entry file does not exist", "absent"),
        ]
        for diagram, expected, name in cases:
            with self.subTest(name=name):
                self.assert_invalid(diagram, expected, name)

    def test_rejects_directory_and_nested_file_symlinks(self) -> None:
        directory_link = self.root / "diagram-link"
        directory_link.symlink_to(self.diagram, target_is_directory=True)
        self.assert_invalid(
            self.diagram_spec(directory="diagram-link"),
            "must not be a symlink",
            "dir-link",
        )

        nested_link = self.diagram / "linked.svg"
        nested_link.symlink_to(self.diagram / "shape.svg")
        self.assert_invalid(
            self.diagram_spec(), "symlinks are not allowed", "nested-link"
        )

    def test_rejects_invalid_cues_and_cues_outside_audio(self) -> None:
        cases = [
            (
                self.diagram_spec(
                    cues=[
                        {"id": "same", "time": 0},
                        {"id": "same", "time": 0.5},
                    ]
                ),
                "duplicate cue id",
                "duplicate-id",
            ),
            (
                self.diagram_spec(
                    cues=[
                        {"id": "later", "time": 1},
                        {"id": "earlier", "time": 0.5},
                    ]
                ),
                "strictly increasing",
                "cue-order",
            ),
            (
                self.diagram_spec(cues=[{"id": "missing", "atWord": "absent"}]),
                "is missing from supplied wordTimings",
                "missing-word",
            ),
            (
                self.diagram_spec(cues=[{"id": "negative", "time": -0.1}]),
                "must be >= 0",
                "negative",
            ),
            (
                self.diagram_spec(cues=[{"id": "late", "time": 2.5}]),
                "exceeds media duration",
                "audio-bound",
            ),
        ]
        for diagram, expected, name in cases:
            with self.subTest(name=name):
                self.assert_invalid(diagram, expected, name)

    def test_rejects_competing_visual_modes_and_preserves_existing_output(self) -> None:
        for field, value in (("frames", []), ("scenes", [])):
            with self.subTest(field=field):
                lesson = self.lesson(self.diagram_spec())
                lesson["sections"][0][field] = value
                output = self.root / f"conflict-{field}"
                result = self.run_scaffold(lesson, "--output", str(output))
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn("mutually exclusive visual modes", result.stderr)
                self.assertFalse(output.exists())

        existing = self.root / "existing-output"
        existing.mkdir()
        sentinel = existing / "keep.txt"
        sentinel.write_text("keep", encoding="utf-8")
        result = self.run_scaffold(
            self.lesson(self.diagram_spec()), "--output", str(existing)
        )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(sentinel.read_text(), "keep")

    def test_rejects_output_nested_inside_the_diagram_source(self) -> None:
        output = self.diagram / "site"
        result = self.run_scaffold(
            self.lesson(self.diagram_spec()), "--output", str(output)
        )
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("must be outside diagram directory", result.stderr)
        self.assertFalse(output.exists())
        self.assertTrue((self.diagram / "scene.js").is_file())


if __name__ == "__main__":
    unittest.main()
