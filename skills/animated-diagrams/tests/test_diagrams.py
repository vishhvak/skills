"""Regression checks for scaffolding safety and the standalone resource contract."""

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch


SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
import scaffold_diagrams  # noqa: E402
from check_diagrams import EXAMPLES, QA_CHECKS, REQUIRED, main, validate  # noqa: E402
from scaffold_diagrams import scaffold  # noqa: E402


class DiagramWorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="diagram-tests-")
        self.root = Path(self.temporary.name)
        # Keep the fixture independent of the starter's runtime voices and
        # ensure scaffold tests exercise the synthesized-effects contract.
        self.fixture_starter = self.root / "starter"
        shutil.copytree(SKILL / "assets/starter", self.fixture_starter)
        bundled_audio = self.fixture_starter / "audio"
        if bundled_audio.is_dir():
            shutil.rmtree(bundled_audio)
        (self.fixture_starter / "sfx-voices.js").write_text(
            "export const SYNTH_VOICES = { tick: {}, result: {} };\n"
        )
        (self.fixture_starter / "sound-events.js").write_text(
            "export function createSoundEvents() { return {}; }\n"
        )
        (self.fixture_starter / "sound.js").write_text(
            "import { SYNTH_VOICES } from './sfx-voices.js';\n"
            "export const SOUND_KINDS = ['silent', 'reference-effects'];\n"
            "export const SOUND_VOICES = Object.keys(SYNTH_VOICES);\n"
            "export function createSceneSound() { return {\n"
            "  configure() {}, play() {}, prepare() {}, pause() {}, seek() {},\n"
            "  effect() {}, setEnabled() {}, setVolume() {}, destroy() {}\n"
            "}; }\n"
        )
        (self.fixture_starter / "sound.json").write_text(json.dumps({
            "blog": {"kind": "silent"},
            "nodes": {"kind": "reference-effects", "events": {"request.sent": "tick", "request.completed": "result"}},
            "models": {"kind": "reference-effects", "events": {"model.updated": "tick", "table.settled": "result"}},
            "registry": {"kind": "reference-effects", "events": {"sources.refreshed": "tick", "registry.settled": "result"}},
            "editor": {"kind": "silent"},
        }))
        self.starter_patch = patch.object(scaffold_diagrams, "STARTER", self.fixture_starter)
        self.starter_patch.start()

    def tearDown(self) -> None:
        self.starter_patch.stop()
        self.temporary.cleanup()

    def create(self, name: str = "workspace", example: str = "nodes", single: bool = False) -> Path:
        workspace = self.root / name
        with redirect_stdout(io.StringIO()):
            scaffold(workspace, example, single=single)
        return workspace

    def write_json(self, workspace: Path, name: str, value: object) -> None:
        (workspace / name).write_text(json.dumps(value))

    def test_existing_directory_file_and_broken_symlink_are_preserved(self) -> None:
        directory = self.root / "existing"
        directory.mkdir()
        sentinel = directory / "keep.txt"
        sentinel.write_text("user work")
        file = self.root / "existing-file"
        file.write_text("user file")
        link = self.root / "broken-link"
        link.symlink_to(self.root / "missing")
        for target in (directory, file, link):
            with self.subTest(target=target.name), self.assertRaisesRegex(ValueError, "already exists"):
                scaffold(target)
        self.assertEqual(sentinel.read_text(), "user work")
        self.assertEqual(file.read_text(), "user file")
        self.assertTrue(link.is_symlink())

    def test_default_selection_and_exact_durations_are_recorded(self) -> None:
        workspace = self.create()
        self.assertIn('data-example="nodes"', (workspace / "index.html").read_text())
        self.assertIn("document.documentElement.dataset.example", (workspace / "gallery.js").read_text())
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        self.assertEqual(manifest["selectedExample"], "nodes")
        self.assertNotIn("shippedScenes", manifest)
        errors, metadata, pending = validate(workspace)
        self.assertEqual(errors, [])
        self.assertEqual(set(manifest["scenes"]), set(EXAMPLES))
        for meta in metadata:
            self.assertEqual(manifest["scenes"][meta["id"]]["duration"], meta["duration"])
        self.assertEqual(pending, len(EXAMPLES) * len(QA_CHECKS))
        self.assertTrue((workspace / "verification/qa.md").is_file())

    def test_single_mode_exposes_only_selected_catalog_entry_and_redirects_hash(self) -> None:
        workspace = self.create("single", "models", single=True)
        gallery = (workspace / "gallery.js").read_text()
        self.assertIn("{id:'models'", gallery)
        for hidden in set(EXAMPLES) - {"models"}:
            self.assertNotIn(f"{{id:'{hidden}'", gallery)
        self.assertIn("history.replaceState(null,'',`#${item.id}`)", gallery)
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        self.assertEqual(manifest["shippedScenes"], ["models"])
        self.assertEqual(set(manifest["scenes"]), set(EXAMPLES))
        self.assertEqual(validate(workspace)[0], [])

    def test_single_mode_qa_gate_checks_only_shipped_scene(self) -> None:
        workspace = self.create("single-qa", "registry", single=True)
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        for check in manifest["scenes"]["registry"]["checks"].values():
            check.update(status="pass", evidence="Observed outcome recorded in verification/qa.md")
        self.write_json(workspace, "diagram-manifest.json", manifest)
        errors, _, pending = validate(workspace, require_qa=True)
        self.assertEqual(errors, [])
        self.assertEqual(pending, 0)

    def test_each_initial_scene_retains_every_module_and_resource(self) -> None:
        for example in EXAMPLES:
            with self.subTest(example=example):
                workspace = self.create(example, example)
                self.assertIn(f'data-example="{example}"', (workspace / "index.html").read_text())
                for resource in REQUIRED:
                    self.assertTrue((workspace / resource).is_file(), resource)
                errors, metadata, _ = validate(workspace)
                self.assertEqual(errors, [])
                self.assertEqual({meta["id"] for meta in metadata}, set(EXAMPLES))

    def test_generated_workspace_remains_portable_after_relocation(self) -> None:
        workspace = self.create("first location")
        moved = self.root / "different location"
        workspace.rename(moved)
        self.assertEqual(validate(moved)[0], [])
        self.assertEqual(json.loads((moved / "sources.json").read_text()), [])
        self.assertFalse(list(moved.rglob("*.mp4")))
        self.assertFalse(list(moved.rglob("*.m4a")))
        for file in moved.rglob("*"):
            if file.is_file() and file.suffix in {".html", ".css", ".js", ".json", ".md", ".py"}:
                self.assertNotIn(str(SKILL), file.read_text(), str(file))
                self.assertNotIn("/Users/", file.read_text(), str(file))
                self.assertNotIn("/home/", file.read_text(), str(file))

    def test_missing_dependency_and_font_are_reported(self) -> None:
        workspace = self.create()
        (workspace / "scenes/blog.js").unlink()
        (workspace / "fonts/CommitMono-Variable.woff2").unlink()
        errors = "\n".join(validate(workspace)[0])
        self.assertIn("scenes/blog.js", errors)
        self.assertIn("fonts/CommitMono-Variable.woff2", errors)

    def test_missing_import_and_syntax_failure_are_reported(self) -> None:
        workspace = self.create()
        scene = workspace / "scenes/nodes.js"
        original = scene.read_text()
        scene.write_text('import "./missing.js";\n' + original)
        self.assertIn("missing resource ./missing.js", "\n".join(validate(workspace)[0]))
        scene.write_text(original + "\nconst broken = ;\n")
        self.assertIn("JavaScript syntax failed", "\n".join(validate(workspace)[0]))

    def test_missing_mount_export_and_invalid_duration_are_reported(self) -> None:
        workspace = self.create()
        scene = workspace / "scenes/nodes.js"
        scene.write_text('export const meta = {id:"nodes",duration:1};\n// <svg\n')
        self.assertIn("missing mount export", "\n".join(validate(workspace)[0]))
        scene.write_text('export const meta = {id:"nodes",title:"Test",description:"Test",duration:0,viewBox:[100,100]};\nexport function mount() {}\n// <svg\n')
        self.assertIn("meta.duration must be finite and positive", "\n".join(validate(workspace)[0]))

    def test_comparison_requires_existing_local_file_and_matching_duration(self) -> None:
        workspace = self.create()
        self.write_json(workspace, "sources.json", [{"id": "nodes", "file": "references/nodes.mp4"}])
        self.assertIn("missing resource references/nodes.mp4", "\n".join(validate(workspace)[0]))
        (workspace / "references").mkdir(exist_ok=True)
        (workspace / "references/nodes.mp4").write_bytes(b"file-existence fixture")
        self.assertEqual(validate(workspace)[0], [])
        self.write_json(workspace, "sources.json", [{"id": "nodes", "file": "references/nodes.mp4", "duration": 99}])
        self.assertIn("duration differs", "\n".join(validate(workspace)[0]))
        self.write_json(workspace, "sources.json", [{"id": "nodes", "file": "../outside.mp4"}])
        self.assertIn("must stay inside workspace", "\n".join(validate(workspace)[0]))

    def test_private_paths_in_shared_manifest_are_reported(self) -> None:
        workspace = self.create()
        self.write_json(workspace, "sources.json", [{"id": "nodes", "file": "references/nodes.mp4", "original": "/Users/example/private/video.mp4"}])
        self.assertIn("remove private machine paths", "\n".join(validate(workspace)[0]))

    def test_sound_manifest_accepts_silent_and_reference_effects_entries(self) -> None:
        workspace = self.create()
        self.assertEqual(validate(workspace)[0], [])

    def test_sound_manifest_rejects_silent_track(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["blog"]["track"] = "audio/blog.m4a"
        self.write_json(workspace, "sound.json", sound)
        self.assertIn("silent scene must not define track", "\n".join(validate(workspace)[0]))

    def test_sound_manifest_rejects_silent_cues(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["editor"]["cues"] = []
        self.write_json(workspace, "sound.json", sound)
        self.assertIn("silent scene must not define cues", "\n".join(validate(workspace)[0]))

    def test_sound_manifest_rejects_silent_media_url_and_other_properties(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["blog"]["mediaUrl"] = "https://example.test/source.m4a"
        sound["editor"]["debug"] = True
        self.write_json(workspace, "sound.json", sound)
        errors = "\n".join(validate(workspace)[0])
        self.assertIn("silent scene must not define mediaUrl", errors)
        self.assertIn("silent scene has unexpected property debug", errors)

    def test_sound_manifest_rejects_unknown_kind(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["blog"]["kind"] = "generated"
        self.write_json(workspace, "sound.json", sound)
        self.assertIn("unknown kind", "\n".join(validate(workspace)[0]))

    def test_sound_manifest_rejects_reference_effects_without_events(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["nodes"] = {"kind": "reference-effects", "events": {}}
        self.write_json(workspace, "sound.json", sound)
        self.assertIn("reference-effects scene needs non-empty events", "\n".join(validate(workspace)[0]))

    def test_sound_manifest_rejects_reference_effects_unknown_voice(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["nodes"] = {"kind": "reference-effects", "events": {"request.sent": "unknown"}}
        self.write_json(workspace, "sound.json", sound)
        self.assertIn("uses unknown voice 'unknown'", "\n".join(validate(workspace)[0]))

    def test_sound_manifest_rejects_reference_effects_media_fields(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["nodes"]["track"] = "audio/nodes.m4a"
        sound["models"]["cues"] = []
        sound["registry"]["mediaUrl"] = "https://example.test/source.m4a"
        self.write_json(workspace, "sound.json", sound)
        errors = "\n".join(validate(workspace)[0])
        self.assertIn("reference-effects scene must not define track", errors)
        self.assertIn("reference-effects scene must not define cues", errors)
        self.assertIn("reference-effects scene must not define mediaUrl", errors)

    def test_sound_manifest_rejects_reference_effects_extra_properties(self) -> None:
        workspace = self.create()
        sound = json.loads((workspace / "sound.json").read_text())
        sound["nodes"]["notes"] = "source audio"
        self.write_json(workspace, "sound.json", sound)
        self.assertIn("reference-effects scene has unexpected property notes", "\n".join(validate(workspace)[0]))

    def test_sound_module_requires_exported_sound_voices(self) -> None:
        workspace = self.create()
        (workspace / "sound.js").write_text(
            "export const SOUND_KINDS = ['silent', 'reference-effects'];\n"
            "export function createSceneSound() { return {\n"
            "  configure() {}, play() {}, prepare() {}, pause() {}, seek() {},\n"
            "  effect() {}, setEnabled() {}, setVolume() {}, destroy() {}\n"
            "}; }\n"
        )
        self.assertIn("SOUND_VOICES must be a non-empty string array", "\n".join(validate(workspace)[0]))

    def test_qa_gate_requires_all_checks_and_evidence(self) -> None:
        workspace = self.create()
        self.assertIn("Browser QA incomplete", "\n".join(validate(workspace, require_qa=True)[0]))
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        for scene in manifest["scenes"].values():
            for check in scene["checks"].values():
                check.update(status="pass", evidence="Observed outcome recorded in verification/qa.md")
        self.write_json(workspace, "diagram-manifest.json", manifest)
        self.assertEqual(validate(workspace, require_qa=True)[0], [])
        manifest["scenes"]["editor"]["checks"]["interaction"]["evidence"] = ""
        self.write_json(workspace, "diagram-manifest.json", manifest)
        self.assertIn("editor/interaction pass needs observed evidence", "\n".join(validate(workspace, require_qa=True)[0]))

    def test_shipped_scenes_rejects_unknown_duplicate_and_empty_scopes(self) -> None:
        cases = (
            (["nodes", "unknown"], "contains unknown scene id"),
            (["nodes", "nodes"], "must contain unique scene ids"),
            ([], "must be non-empty"),
        )
        for index, (scope, expected) in enumerate(cases):
            with self.subTest(scope=scope):
                workspace = self.create(f"scope-{index}")
                manifest = json.loads((workspace / "diagram-manifest.json").read_text())
                manifest["shippedScenes"] = scope
                self.write_json(workspace, "diagram-manifest.json", manifest)
                self.assertIn(expected, "\n".join(validate(workspace)[0]))

    def test_shipped_scenes_cannot_hide_selected_example(self) -> None:
        workspace = self.create("hidden-selected", "nodes")
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        manifest["shippedScenes"] = ["blog"]
        self.write_json(workspace, "diagram-manifest.json", manifest)
        self.assertIn("selectedExample must be included in shippedScenes", "\n".join(validate(workspace)[0]))

    def test_legacy_functional_checklist_cannot_pass_complete_qa(self) -> None:
        workspace = self.create()
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        for scene in manifest["scenes"].values():
            scene["checks"].pop("visual-tone", None)
            scene["checks"].pop("activity-lighting", None)
            for check in scene["checks"].values():
                check.update(status="pass", evidence="Functional browser behavior observed")
        self.write_json(workspace, "diagram-manifest.json", manifest)
        errors = "\n".join(validate(workspace, require_qa=True)[0])
        self.assertIn("visual-tone", errors)
        self.assertIn("activity-lighting", errors)

    def test_functional_success_keeps_visual_checks_pending(self) -> None:
        workspace = self.create()
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        for scene in manifest["scenes"].values():
            for name, check in scene["checks"].items():
                if name not in {"visual-tone", "activity-lighting"}:
                    check.update(status="pass", evidence="Functional browser behavior observed")
        self.write_json(workspace, "diagram-manifest.json", manifest)
        errors, _, pending = validate(workspace, require_qa=True)
        self.assertEqual(pending, 10)
        self.assertIn("nodes/visual-tone is pending", "\n".join(errors))
        self.assertIn("editor/activity-lighting is pending", "\n".join(errors))

    def test_complete_records_do_not_make_the_checker_certify_visual_parity(self) -> None:
        workspace = self.create()
        manifest = json.loads((workspace / "diagram-manifest.json").read_text())
        for scene in manifest["scenes"].values():
            for check in scene["checks"].values():
                check.update(status="pass", evidence="A declared result; this does not prove visual or sound parity")
        self.write_json(workspace, "diagram-manifest.json", manifest)
        output = io.StringIO()
        with patch.object(sys, "argv", ["check_diagrams.py", "--workspace", str(workspace), "--require-qa"]), redirect_stdout(output):
            self.assertEqual(main(), 0)
        self.assertIn("does not certify visual parity or perceptual sound parity", output.getvalue())


if __name__ == "__main__":
    unittest.main()
